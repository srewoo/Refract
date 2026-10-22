// Backlinks: inbound links for this domain or a stored competitor. Summary snapshots over time (new/lost referring
// domains), the backlinks themselves, a link gap against a competitor, and an outreach prospect list. No automated outreach.
import { registrableDomain, toCsv } from './analyze.js'
import { PROVIDERS, loadKeys, providerFor } from './keys.js'
import { API, backlinkCost, costText } from './providers.js'
import { loadCompetitors } from './keywords.js'
import { STATUSES, diffRefDomains, filterLinks, linkGap, linkPresent, linkedPages, listSnapshots, loadLinks, loadProspects, mergeProspects, saveLinks, saveSnapshot, updateProspects } from './links.js'
import { disavowFile } from './generators.js'
import { h, head, block, btn, num, lineChart, download } from './ui.js'
import { failBox, needKey, note } from './views-data.js'

const path = (u) => (u ? u.replace(/^https?:\/\//, '') : '—')
const CAVEAT = 'Third-party link indexes are estimates: each provider crawls a different part of the web, so counts differ between them.'
const LIVE = { live: '✓ live', gone: '✕ not found', error: 'page failed' }
const yes = (v) => (v == null ? '—' : v ? 'yes' : 'no')
/** Backlink provider, or a message element saying why there is none. */
async function provider(go) {
  const cfg = await loadKeys(), id = providerFor(cfg, 'backlinks')
  if (!id) return { err: needKey('Backlink data', go) }
  if (id === 'dataforseo' && !cfg.dfsBacklinksOptIn) return { err: h('p', { class: 'empty' }, 'DataForSEO’s Backlinks API is a separate monthly subscription. Confirm you have it in Settings › Connectors › Routing, or route backlinks to Semrush or Ahrefs.') }
  return { cfg, id }
}
const picks = (sel, onchange) => (key) => h('input', { type: 'checkbox', 'aria-label': `Select ${key}`, checked: sel.has(key), onchange: (e) => { if (e.target.checked) sel.add(key); else sel.delete(key); onchange?.() } })

// ---------------- Summary snapshots ----------------
function snapshotView(target, snaps, onProspects) {
  const cur = snaps.at(-1), diff = diffRefDomains(snaps.at(-2), cur), sel = new Set()
  const follow = cur.follows != null && cur.nofollows != null ? `${Math.round((cur.follows / Math.max(1, cur.follows + cur.nofollows)) * 100)}% followed`
    : cur.nofollowDomains != null && cur.refDomains ? `${num(cur.nofollowDomains)} domains with nofollow links` : null
  const trend = snaps.filter((s) => s.provider === cur.provider && s.refDomains != null)
  return h('div', {},
    h('div', { class: 'stats-row' }, [[num(cur.rating), cur.ratingName], [num(cur.refDomains), 'Referring domains'], [num(cur.backlinks), 'Backlinks'], follow && [follow, 'Follow balance'], cur.broken != null && [num(cur.broken), 'Broken backlinks'], cur.spamScore != null && [`${cur.spamScore}/100`, 'Backlink spam score'], cur.pageAuthority != null && [num(cur.pageAuthority), 'Page Authority'], cur.mozSpam != null && [`${cur.mozSpam}%`, 'Moz Spam Score']].filter(Boolean).map(([v, l]) => h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, l)))),
    note(`${target} · ${PROVIDERS[cur.provider]?.name ?? cur.provider} · fetched ${cur.at.slice(0, 10)}. ${CAVEAT}`),
    diff ? h('p', { class: 'small' }, `Since ${diff.since.slice(0, 10)}, among the top ${num(cur.top.length)} referring domains: `, h('b', {}, `${diff.added.length} new`), diff.added.length ? ` (${diff.added.slice(0, 8).map((t) => t.domain).join(', ')})` : '', ', ', h('b', {}, `${diff.gone.length} no longer listed`), diff.gone.length ? ` (${diff.gone.slice(0, 8).map((t) => t.domain).join(', ')})` : '', '.') : note(snaps.length > 1 ? 'The previous snapshot came from another provider or listed a different number of referring domains, so new and lost domains are not compared.' : 'Fetch again on another day to see new and lost referring domains.'),
    trend.length > 1 ? block('Referring domains over time', lineChart(trend.map((s) => ({ date: s.at.slice(0, 10), value: s.refDomains })), { label: 'Referring domains', height: 120 })) : '',
    cur.top.length ? block(`Top ${num(cur.top.length)} referring domains`,
      h('div', { class: 'bar-line' }, btn('Add selected to prospects', (e) => onProspects(cur.top.filter((t) => sel.has(t.domain)), `Referring domain of ${target}`, e.target)), btn('Export CSV', () => download(`referring-domains-${target}.csv`, toCsv(cur.top))), btn('Disavow file for selected', () => sel.size && download(`disavow-${target}.txt`, disavowFile([...sel].map((domain) => ({ domain })), `Refract SEO · ${target}`), 'text/plain'))),
      h('div', { class: 'scroll-x crawl-list' }, h('table', {}, h('thead', {}, h('tr', {}, ['', 'Domain', cur.ratingName, 'Links to site', 'First seen'].map((t) => h('th', {}, t)))),
        h('tbody', {}, cur.top.map((t) => h('tr', {}, h('td', {}, picks(sel)(t.domain)), h('td', {}, t.domain), h('td', { class: 'mono' }, num(t.rating)), h('td', { class: 'mono' }, num(t.backlinks)), h('td', { class: 'mono small' }, t.firstSeen ?? '—'))))))) : '')
}

function summaryBlock(st, go, onProspects) {
  const count = h('select', { 'aria-label': 'Referring domains to list', onchange: () => estimate() }, [25, 100].map((v) => h('option', { value: v }, `Top ${v} referring domains`)))
  const cost = note(''), err = h('div'), out = h('div')
  const estimate = async () => { const p = await provider(go); cost.textContent = p.id ? `${PROVIDERS[p.id].name} · 2–3 requests · ${costText(backlinkCost(p.id, +count.value, 2))}` : '' }
  const show = async () => { err.replaceChildren(); const snaps = await listSnapshots(st.target()); out.replaceChildren(snaps.length ? snapshotView(st.target(), snaps, onProspects) : note(`No backlink data for ${st.target()} yet.`)) }
  const run = btn('Fetch backlinks', async (e) => {
    const p = await provider(go)
    if (p.err) { err.replaceChildren(p.err); return }
    const target = st.target()
    e.target.disabled = true; err.replaceChildren(note(`Asking ${PROVIDERS[p.id].name} about ${target}…`))
    try {
      const r = await API[p.id].backlinks(p.cfg.creds[p.id], target, +count.value)
      await saveSnapshot(target, { ...r, provider: p.id, at: new Date().toISOString(), limit: +count.value })
      await show()
    } catch (x) { err.replaceChildren(failBox(x), note('Nothing was saved; the last snapshot below is unchanged.')) } finally { e.target.disabled = false } // never a zero profile
  }, { class: 'btn primary' })
  estimate()
  return { show, el: block('Summary', h('div', { class: 'bar-line' }, count, run), cost, err, out) }
}

// ---------------- Backlinks list ----------------
function linksTable(st, data, onProspects, more) {
  const q = h('input', { class: 'url-input', type: 'search', placeholder: 'Filter by source, anchor or target', 'aria-label': 'Filter backlinks', oninput: () => draw() })
  const follow = h('select', { 'aria-label': 'Follow filter', onchange: () => draw() }, [['all', 'All links'], ['follow', 'Followed'], ['nofollow', 'Nofollow']].map(([v, l]) => h('option', { value: v }, l)))
  const body = h('div'), sel = new Set()
  const draw = () => {
    const rows = filterLinks(data.rows, { q: q.value, follow: follow.value })
    const followed = data.rows.filter((r) => r.follow != null)
    body.replaceChildren(
      note(`${num(rows.length)} shown of ${num(data.rows.length)} loaded${data.total != null ? ` (${num(data.total)} in the index)` : ''} · ${PROVIDERS[data.provider].name} · ${data.at.slice(0, 10)}${followed.length ? ` · ${Math.round((followed.filter((r) => r.follow).length / followed.length) * 100)}% of loaded links followed` : ''}${data.lost ? (data.lostLocal ? ` · lost links among the ${num(data.offset ?? data.rows.length)} fetched (${PROVIDERS[data.provider].name} can’t filter them server-side)` : ' · lost links') : ''}.`),
      h('div', { class: 'bar-line' }, btn('Add selected sites to prospects', (e) => onProspects([...sel].map((domain) => ({ domain, rating: data.rows.find((r) => r.fromDomain === domain)?.rating })), `Links to ${data.target}`, e.target)),
        more ? btn('Load more', (e) => more(e.target)) : '', btn('Export CSV', () => download(`backlinks-${data.target}.csv`, toCsv(rows))),
        btn('Disavow file for selected sites', () => sel.size && download(`disavow-${data.target}.txt`, disavowFile([...sel].map((domain) => ({ domain })), `Refract SEO · ${data.target}`), 'text/plain')),
        btn('Check shown links are still live', (e) => verify(rows.slice(0, 50), e.target))),
      h('div', { class: 'scroll-x crawl-list' }, h('table', {}, h('thead', {}, h('tr', {}, ['', 'Linking page', 'Rating', 'Anchor', 'Points to', 'Follow', 'First seen', 'Last seen', 'Lost', 'Broken', 'Spam', 'Checked now'].map((t) => h('th', {}, t)))),
        h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, r.fromDomain ? picks(sel)(r.fromDomain) : ''), h('td', { class: 'mono small' }, path(r.from)), h('td', { class: 'mono' }, num(r.rating)), h('td', { class: 'small' }, r.anchor || '—'),
          h('td', { class: 'mono small' }, path(r.to)), h('td', {}, yes(r.follow)), h('td', { class: 'mono small nowrap' }, r.firstSeen ?? '—'), h('td', { class: 'mono small nowrap' }, r.lastSeen ?? '—'), h('td', {}, yes(r.lost)), h('td', {}, yes(r.broken ?? null)), h('td', { class: 'mono' }, typeof r.spam === 'number' ? `${r.spam}/100` : yes(r.spam ?? null)), h('td', { class: 'small nowrap' }, LIVE[data.verify?.[r.from]] ?? '—')))))))
  }
  // Fetch each linking page now (no cookies) and look for the link: the index can lag weeks behind the web.
  const verify = async (list, button) => {
    if (!(await chrome.permissions.request({ origins: ['<all_urls>'] }))) return
    button.disabled = true
    data.verify = { ...data.verify }
    for (const [i, r] of list.entries()) {
      button.textContent = `Checking ${i + 1} of ${list.length}…`
      try { const res = await fetch(r.from, { credentials: 'omit', redirect: 'follow' }); data.verify[r.from] = !res.ok ? 'error' : linkPresent(await res.text(), res.url, r.to || data.target) ? 'live' : 'gone' } catch { data.verify[r.from] = 'error' }
    }
    await saveLinks(data.target, data)
    button.disabled = false; button.textContent = 'Check shown links are still live'
    draw()
  }
  draw()
  const pages = linkedPages(data.rows)
  return h('div', {}, h('div', { class: 'bar-line' }, q, follow), body,
    pages.length ? block('Most linked pages (among loaded links)', h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['Page', 'Referring domains', 'Links', 'Followed'].map((t) => h('th', {}, t)))),
      h('tbody', {}, pages.map((p) => h('tr', {}, h('td', { class: 'mono small' }, path(p.url)), h('td', { class: 'mono' }, p.domains), h('td', { class: 'mono' }, p.links), h('td', { class: 'mono' }, p.follow))))))) : '')
}

function linksBlock(st, go, onProspects) {
  const rows = h('select', { 'aria-label': 'Backlinks per request', onchange: () => estimate() }, [100, 500].map((v) => h('option', { value: v }, `${v} links`)))
  const perDomain = h('input', { type: 'checkbox', checked: true }), lost = h('input', { type: 'checkbox' })
  const cost = note(''), out = h('div')
  const estimate = async () => { const p = await provider(go); cost.textContent = p.id ? `${PROVIDERS[p.id].name} · ${costText(backlinkCost(p.id, +rows.value))} per request · each link is a row` : '' }
  const render = (data) => out.replaceChildren(linksTable(st, data, onProspects, !data.complete && data.offset < (data.total ?? Infinity) && data.lastPage === +rows.value ? (b) => fetchPage(b, data) : null))
  const fetchPage = async (button, prev) => {
    const p = await provider(go)
    if (p.err) { out.replaceChildren(p.err); return }
    if (!API[p.id].backlinkRows) { out.replaceChildren(note(`${PROVIDERS[p.id].name} lists referring domains (in the summary above), not individual links. Route backlinks to DataForSEO, Semrush or Ahrefs for link rows.`)); return }
    const target = st.target()
    button.disabled = true
    try {
      const opt = prev ? { perDomain: prev.perDomain, lost: prev.lost } : { perDomain: perDomain.checked, lost: lost.checked }
      const r = await API[p.id].backlinkRows(p.cfg.creds[p.id], target, { limit: +rows.value, offset: prev?.offset ?? 0, ...opt })
      const page = r.fetched ?? r.rows.length // rows the provider returned, before any local filtering
      const data = { target, provider: p.id, at: new Date().toISOString(), ...opt, total: r.total, complete: !!r.complete, lostLocal: !!r.lostLocal, offset: (prev?.offset ?? 0) + page, lastPage: page, rows: [...(prev?.rows ?? []), ...r.rows] }
      await saveLinks(target, data)
      render(data)
    } catch (x) { out.prepend(failBox(x)) } finally { button.disabled = false }
  }
  const show = async () => { const data = await loadLinks(st.target()); out.replaceChildren(data ? linksTable(st, data, onProspects, null) : note('No backlinks loaded yet. Rows cost more than the summary; start with 100.')) }
  estimate()
  return { show, el: block('Backlinks', h('div', { class: 'bar-line' }, rows, h('label', { class: 'small' }, perDomain, ' one per linking site'), h('label', { class: 'small' }, lost, ' lost links only'), btn('Load backlinks', (e) => fetchPage(e.target, null), { class: 'btn primary' })), cost, out) }
}

// ---------------- Link gap and prospects ----------------
function gapBlock(st, onProspects) {
  const rival = h('select', { 'aria-label': 'Competitor for link gap', onchange: () => show() }), out = h('div')
  const show = async () => {
    const keep = rival.value
    rival.replaceChildren(...st.competitors.map((c) => h('option', { value: c, selected: c === keep }, c)))
    if (!st.competitors.length) { out.replaceChildren(note('Add competitors in the Competitors view, then fetch backlinks for them here.')); return }
    const [mine, theirs] = await Promise.all([listSnapshots(st.domain), listSnapshots(rival.value)])
    const gap = linkGap(mine.at(-1), theirs.at(-1))
    if (!gap) { out.replaceChildren(note(`Fetch backlinks for ${st.domain} and ${rival.value} with the same provider (pick each in “Domain” above) to compare.`)); return }
    const sel = new Set()
    out.replaceChildren(note(`${gap.length} sites link to ${rival.value} but not to ${st.domain}, among each domain’s top referring domains (${theirs.at(-1).at.slice(0, 10)}).`),
      h('div', { class: 'bar-line' }, btn('Add selected to prospects', (e) => onProspects(gap.filter((t) => sel.has(t.domain)), `Links to ${rival.value}`, e.target)), btn('Export CSV', () => download(`link-gap-${st.domain}-vs-${rival.value}.csv`, toCsv(gap)))),
      h('div', { class: 'scroll-x crawl-list' }, h('table', {}, h('thead', {}, h('tr', {}, ['', 'Domain', 'Rating', `Links to ${rival.value}`].map((t) => h('th', {}, t)))),
        h('tbody', {}, gap.map((t) => h('tr', {}, h('td', {}, picks(sel)(t.domain)), h('td', {}, t.domain), h('td', { class: 'mono' }, num(t.rating)), h('td', { class: 'mono' }, num(t.backlinks))))))))
  }
  return { show, el: block('Link gap', rival, out) }
}

function prospectsBlock(domain) {
  const out = h('div'), filter = h('input', { class: 'url-input', type: 'search', placeholder: 'Filter by site or tag', 'aria-label': 'Filter prospects', oninput: () => loadProspects(domain).then(draw), style: 'max-width:260px' })
  const write = async (fn) => draw(await updateProspects(domain, fn))
  const draw = (p) => {
    const q = filter.value.trim().toLowerCase()
    const list = Object.values(p).filter((x) => !q || x.domain.includes(q) || (x.tags ?? []).some((t) => t.includes(q))).sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || (b.rating ?? -1) - (a.rating ?? -1))
    if (!list.length) { out.replaceChildren(note(q ? 'No prospects match.' : 'No prospects yet. Add sites from referring domains, backlinks or the link gap. Refract SEO never contacts anyone.')); return }
    const counts = STATUSES.map((s) => [s, list.filter((x) => x.status === s).length]).filter(([, n]) => n)
    out.replaceChildren(note(counts.map(([s, n]) => `${n} ${s}`).join(' · ')),
      h('div', { class: 'bar-line' }, btn('Export CSV', () => download(`prospects-${domain}.csv`, toCsv(list.map((x) => ({ ...x, tags: (x.tags ?? []).join('; ') })))))),
      h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['Site', 'Rating', 'Status', 'Tags', 'Notes', 'Found via', 'Added', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, list.map((x) => h('tr', {}, h('td', {}, x.domain), h('td', { class: 'mono' }, num(x.rating)),
          h('td', {}, h('select', { 'aria-label': `Status for ${x.domain}`, onchange: (e) => write((s) => { s[x.domain].status = e.target.value; return s }) }, STATUSES.map((v) => h('option', { value: v, selected: v === x.status }, v)))),
          h('td', {}, h('input', { class: 'cell-input', value: (x.tags ?? []).join(', '), 'aria-label': `Tags for ${x.domain}`, onchange: (e) => write((s) => { s[x.domain].tags = [...new Set(e.target.value.split(/[,;]/).map((t) => t.trim().toLowerCase()).filter(Boolean))]; return s }) })),
          h('td', {}, h('input', { class: 'cell-input', value: x.notes, 'aria-label': `Notes for ${x.domain}`, onchange: (e) => write((s) => { s[x.domain].notes = e.target.value.trim(); return s }) })),
          h('td', { class: 'small' }, x.source ?? '—'), h('td', { class: 'mono small' }, x.added),
          h('td', {}, h('button', { type: 'button', class: 'chip-x', 'aria-label': `Remove ${x.domain}`, onclick: () => write((s) => { delete s[x.domain]; return s }) }, '×'))))))))
  }
  const add = async (items, source, button) => {
    if (!items.length) { if (button) button.textContent = 'Select some first'; return }
    await write((s) => mergeProspects(s, items, { source }))
    if (button) button.textContent = `Added ${items.length}`
  }
  loadProspects(domain).then(draw)
  return { add, el: block('Outreach prospects', filter, out) }
}

export const Backlinks = {
  render(d, { go }) {
    const domain = registrableDomain(d.host)
    const pick = h('select', { 'aria-label': 'Domain', onchange: () => refresh() })
    const st = { domain, competitors: [], target: () => pick.value || domain }
    const prospects = prospectsBlock(domain)
    const summary = summaryBlock(st, go, prospects.add), links = linksBlock(st, go, prospects.add), gap = gapBlock(st, prospects.add)
    const refresh = () => Promise.all([summary.show(), links.show(), gap.show()])
    loadCompetitors(domain).then((list) => {
      st.competitors = list
      pick.replaceChildren(...[domain, ...list].map((c) => h('option', { value: c }, c === domain ? `${c} (you)` : c)))
      refresh()
    })
    return [head('Backlinks', `Sites linking to ${domain} or a competitor, from your data source.`), h('div', { class: 'bar-line' }, h('label', { class: 'small' }, 'Domain '), pick), summary.el, links.el, gap.el, prospects.el]
  },
}
