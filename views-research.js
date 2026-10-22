// Keyword research: discover keywords around a seed (DataForSEO Labs / Semrush), save them for this domain,
// then tag, map to a target URL, enrich with metrics and export. Saved keywords live in keywords.js.
import { density, registrableDomain, toCsv } from './analyze.js'
import { MARKETS, PROVIDERS, hasCreds, loadKeys, providerFor } from './keys.js'
import { API, DISCOVER, discoverCost } from './providers.js'
import { clean, clusterKeywords, csvKeywords, exportRows, loadSaved, mergeKeywords, serpClusters, updateSaved } from './keywords.js'
import { contentBriefBlock } from './views-brief.js'
import { h, head, block, btn, num, spark, tag, download } from './ui.js'
import { failBox, kdCell, needKey, note } from './views-data.js'

const METRIC_HEAD = ['Volume', 'Trend', 'Difficulty', 'CPC', 'Intent']
const metricCells = (r) => [h('td', { class: 'mono nowrap' }, num(r.volume)), h('td', {}, spark(r.trend ?? [])), h('td', {}, kdCell(r.kd)),
  h('td', { class: 'mono nowrap' }, r.cpc == null ? '—' : `$${Number(r.cpc).toFixed(2)}`), h('td', { class: 'small nowrap' }, r.intent ?? '—')]
const pick = (sel, k, onchange) => h('input', { type: 'checkbox', 'aria-label': `Select ${k}`, checked: sel.has(k), onchange: (e) => { if (e.target.checked) sel.add(k); else sel.delete(k); onchange() } })
const pickAll = (sel, keys, onchange) => h('input', { type: 'checkbox', 'aria-label': 'Select all', checked: keys.length > 0 && keys.every((k) => sel.has(k)), onchange: (e) => { keys.forEach((k) => (e.target.checked ? sel.add(k) : sel.delete(k))); onchange() } })
const today = () => new Date().toISOString().slice(0, 10)

// ---------------- Discover ----------------
function discoverBlock(domain, onSaved) {
  const seed = h('input', { class: 'url-input', type: 'search', placeholder: 'Seed keyword, e.g. teeth whitening', 'aria-label': 'Seed keyword', onkeydown: (e) => { if (e.key === 'Enter') run.click() } })
  const mode = h('select', { 'aria-label': 'Discovery mode', onchange: () => estimate() })
  const limit = h('select', { 'aria-label': 'Rows per request', onchange: () => estimate() }, [50, 100, 250].map((v) => h('option', { value: v, selected: v === 100 }, `${v} rows`)))
  const cost = note(''), out = h('div')
  const st = { cfg: null, id: null, rows: [], offset: 0, more: false, seed: '', mode: '', spent: 0, total: null, sel: new Set() }
  const estimate = () => {
    if (!st.id) return
    const c = discoverCost(st.id, +limit.value, mode.value), ads = mode.value === 'ads'
    limit.hidden = ads
    cost.textContent = `${PROVIDERS[st.id].name} · ${MARKETS[st.cfg.market].label} · ${ads ? 'one request returns every idea (no difficulty or intent)' : `up to ${limit.value} rows per request`} · ${c.usd != null ? `about $${c.usd.toFixed(3)}` : `up to ${num(c.units)} API units`}`
  }
  let search = 0 // bumps on each new search, so a late "load more" reply can't land in a newer search's results
  const fetchPage = async (button, fresh) => {
    if (fresh) { search++; Object.assign(st, { rows: [], offset: 0, spent: 0, seed: seed.value.trim(), mode: mode.value, sel: new Set() }) }
    if (!st.seed) { seed.focus(); return }
    const mine = search
    button.disabled = true
    if (fresh) out.replaceChildren(note(`Asking ${PROVIDERS[st.id].name}…`))
    try {
      const r = await API[st.id].discover(st.cfg.creds[st.id], st.mode, st.seed, MARKETS[st.cfg.market], { limit: +limit.value, offset: st.offset })
      if (mine !== search) return
      Object.assign(st, { rows: [...st.rows, ...r.rows], offset: st.offset + r.rows.length, spent: st.spent + (r.cost ?? 0), total: r.total })
      st.more = !r.complete && (r.total != null ? st.offset < r.total : r.rows.length === +limit.value)
      draw()
    } catch (err) { if (mine === search) { if (fresh) out.replaceChildren(failBox(err)); else out.prepend(failBox(err)) } } finally { button.disabled = false } // a failed "load more" keeps the rows already paid for
  }
  const draw = () => out.replaceChildren(resultsTable(st, draw, async (button) => {
    const rows = st.rows.filter((r) => st.sel.has(r.keyword))
    await updateSaved(domain, (s) => mergeKeywords(s, rows, { source: `${PROVIDERS[st.id].name} · ${DISCOVER[st.id][st.mode]} “${st.seed}”`, provider: PROVIDERS[st.id].name, market: st.cfg.market }))
    button.textContent = `Saved ${rows.length}`
    onSaved()
  }, (button) => fetchPage(button, false)))
  const run = btn('Find keywords', (e) => fetchPage(e.target, true), { class: 'btn primary' })
  ;(async () => {
    st.cfg = await loadKeys()
    st.id = [providerFor(st.cfg, 'keywords'), 'dataforseo', 'semrush'].find((p) => p && DISCOVER[p] && hasCreds(st.cfg, p))
    if (!st.id) { run.disabled = true; out.replaceChildren(note('Keyword discovery needs DataForSEO or Semrush (Settings › Connectors). Saved keywords below work without one.')); return }
    mode.replaceChildren(...Object.entries(DISCOVER[st.id]).map(([k, label]) => h('option', { value: k }, label)))
    estimate()
  })()
  return block('Discover', h('div', { class: 'bar-line' }, seed, mode, limit, run), cost, out)
}

function resultsTable(st, redraw, save, more) {
  if (!st.rows.length) return note('No keywords found for that seed in this market.')
  const capped = st.mode === 'ads' && st.total > st.rows.length ? ` (showing the top ${num(st.rows.length)} by volume)` : ''
  const keys = st.rows.map((r) => r.keyword)
  const saveBtn = btn(`Save ${st.sel.size} selected`, (e) => save(e.target), { disabled: st.sel.size === 0, class: 'btn primary' })
  const spent = st.id === 'dataforseo' ? ` · cost $${st.spent.toFixed(3)}` : ''
  return h('div', {},
    note(`${PROVIDERS[st.id].name} · ${DISCOVER[st.id][st.mode]} for “${st.seed}” · ${MARKETS[st.cfg.market].label} · ${today()} · ${num(st.rows.length)}${st.total != null ? ` of ${num(st.total)}` : ''} keywords${capped}${spent}. Difficulty is the provider’s own 0–100 scale; volumes are its estimates, not Search Console data.`),
    h('div', { class: 'bar-line' }, saveBtn, st.more ? btn(`Load ${num(st.rows.length)}+ more`, (e) => more(e.target)) : '', btn('Export CSV', () => download(`keyword-ideas-${st.seed.replace(/\W+/g, '-')}.csv`, toCsv(st.rows.map((r) => ({ ...r, trend: r.trend?.join(' ') ?? '' })))))),
    h('div', { class: 'scroll-x crawl-list' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, pickAll(st.sel, keys, redraw)), h('th', {}, 'Keyword'), METRIC_HEAD.map((t) => h('th', {}, t)))),
      h('tbody', {}, st.rows.map((r) => h('tr', {}, h('td', {}, pick(st.sel, r.keyword, redraw)), h('td', {}, r.keyword), metricCells(r)))))))
}

// ---------------- Saved keywords ----------------
const SORTS = {
  'Highest volume': (a, b) => (b.volume ?? -1) - (a.volume ?? -1),
  'Easiest first': (a, b) => (a.kd ?? 999) - (b.kd ?? 999),
  'Recently added': (a, b) => (b.added ?? '').localeCompare(a.added ?? ''),
  'A–Z': (a, b) => a.keyword.localeCompare(b.keyword),
}

function savedBlock(domain, go, d) {
  const st = { saved: {}, sel: new Set() }
  const out = h('div'), msg = h('div')
  const filter = h('input', { class: 'url-input', type: 'search', placeholder: 'Filter by keyword or tag', 'aria-label': 'Filter saved keywords', oninput: () => draw() })
  const sort = h('select', { 'aria-label': 'Sort saved keywords', onchange: () => draw() }, Object.keys(SORTS).map((k) => h('option', { value: k }, k)))
  const visible = () => { const q = clean(filter.value); return Object.values(st.saved).filter((r) => !q || r.keyword.includes(q) || r.tags.some((t) => t.includes(q))).sort(SORTS[sort.value]) }
  const write = async (fn) => { st.saved = await updateSaved(domain, fn); draw() }
  const draw = () => out.replaceChildren(savedTable(st, visible(), draw, write))
  const refresh = async () => { st.saved = await loadSaved(domain); [...st.sel].forEach((k) => st.saved[k] || st.sel.delete(k)); draw() }

  const add = h('textarea', { rows: 3, class: 'kw-input', 'aria-label': 'Keywords to add, one per line', placeholder: 'Add keywords, one per line' })
  const file = h('input', { type: 'file', accept: '.csv,text/csv', hidden: true, onchange: async (e) => {
    const f = e.target.files[0]
    e.target.value = ''
    if (!f) return
    if (f.size > 5e6) { msg.replaceChildren(note(`${f.name} is over 5 MB; split it first.`)); return }
    const rows = csvKeywords(await f.text())
    await write((s) => mergeKeywords(s, rows, { source: `CSV ${f.name}`, provider: `CSV ${f.name}` }))
    msg.replaceChildren(note(`Imported ${num(rows.length)} rows from ${f.name}.`))
  } })
  const tools = h('div', { class: 'bar-line' },
    btn('Add', () => { const rows = add.value.split('\n').map((keyword) => ({ keyword })); add.value = ''; return write((s) => mergeKeywords(s, rows, { source: 'Added by hand' })) }),
    btn('Import CSV', () => file.click()), file,
    btn('Add this page’s top phrases', () => { const rows = [...density(d.words, 2, 10), ...density(d.words, 3, 5)].map((r) => ({ keyword: r.term, url: d.url.replace(/#.*/, '') })); return write((s) => mergeKeywords(s, rows, { source: 'This page’s content' })) }),
    btn('Add searches seen on Google', async () => {
      const { 'serp:obs': obs = [] } = await chrome.storage.local.get('serp:obs')
      const rows = obs.filter((o) => o.domain === domain || o.domain.endsWith(`.${domain}`) || domain.endsWith(`.${o.domain}`)).map((o) => ({ keyword: o.query }))
      msg.replaceChildren(note(rows.length ? `Added ${rows.length} searches you ran on Google with the SERP layout panel.` : 'No Google searches recorded for this domain yet: set it in the SERP layout panel on Google and search.'))
      return write((s) => mergeKeywords(s, rows, { source: 'Google results seen' }))
    }),
    note('CSV: our export, a Search Console queries export, the People Also Ask extractor’s CSV, or any file with a keyword column.'))
  const bulk = bulkBar(st, domain, go, visible, write, msg)
  refresh()
  return { refresh, el: block('Saved keywords', add, tools, h('div', { class: 'bar-line' }, filter, sort), bulk, msg, out), saved: () => st.saved, write }
}

function bulkBar(st, domain, go, visible, write, msg) {
  const tagIn = h('input', { class: 'url-input', placeholder: 'tag', 'aria-label': 'Tag to add to selected keywords', style: 'max-width:160px' })
  const chosen = () => [...st.sel].filter((k) => st.saved[k])
  let armed = null
  const remove = btn('Remove selected', (e) => {
    const ks = chosen()
    if (!ks.length) return
    if (!armed) { e.target.textContent = `Remove ${ks.length}? Click again`; armed = setTimeout(() => { armed = null; e.target.textContent = 'Remove selected' }, 4000); return }
    clearTimeout(armed); armed = null; e.target.textContent = 'Remove selected'
    ks.forEach((k) => st.sel.delete(k))
    return write((s) => { ks.forEach((k) => delete s[k]); return s })
  })
  const metrics = btn('Get metrics for selected', async (e) => {
    const cfg = await loadKeys(), id = providerFor(cfg, 'keywords')
    if (!id) { msg.replaceChildren(needKey('Keyword data', go)); return }
    const cap = id === 'semrush' ? 25 : 100, ks = chosen().slice(0, cap)
    if (!ks.length) { msg.replaceChildren(note('Select some keywords first.')); return }
    e.target.disabled = true; msg.replaceChildren(note(`Asking ${PROVIDERS[id].name} about ${ks.length} keywords${chosen().length > cap ? ` (the first ${cap})` : ''}…`))
    try {
      const rows = await API[id].keywords(cfg.creds[id], ks, MARKETS[cfg.market])
      await write((s) => mergeKeywords(s, rows, { provider: PROVIDERS[id].name, market: cfg.market }))
      msg.replaceChildren(note(`Updated ${rows.length} keywords from ${PROVIDERS[id].name} (${MARKETS[cfg.market].label}).`))
    } catch (err) { msg.replaceChildren(failBox(err)) } finally { e.target.disabled = false }
  })
  return h('div', { class: 'bar-line' }, tagIn,
    btn('Tag selected', () => { const t = clean(tagIn.value); if (!t) return tagIn.focus(); tagIn.value = ''; return write((s) => { chosen().forEach((k) => { s[k].tags = [...new Set([...s[k].tags, t])] }); return s }) }),
    metrics, remove,
    btn('Export CSV', () => { const ks = chosen(); download(`keywords-${domain}.csv`, toCsv(exportRows(ks.length ? ks.map((k) => st.saved[k]) : visible()))) }))
}

function savedTable(st, list, redraw, write) {
  const total = Object.keys(st.saved).length
  if (!total) return note('Nothing saved yet. Find keywords above, add them by hand, import a CSV, or use “Save keyword” on Opportunities.')
  const set = (k, field, value) => write((s) => { if (s[k]) s[k][field] = value; return s })
  const cell = (r, field, label, value = r[field]) => h('input', { class: 'cell-input', value: value ?? '', 'aria-label': `${label} for ${r.keyword}`,
    onchange: (e) => set(r.keyword, field, field === 'tags' ? [...new Set(e.target.value.split(/[,;]/).map(clean).filter(Boolean))] : e.target.value.trim()) })
  return h('div', {},
    note(`${num(list.length)} of ${num(total)} saved · ${st.sel.size} selected. Export takes the selection, or every keyword shown when nothing is selected.`),
    h('div', { class: 'scroll-x' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, pickAll(st.sel, list.map((r) => r.keyword), redraw)), h('th', {}, 'Keyword'), METRIC_HEAD.map((t) => h('th', {}, t)), ['Tags', 'Target URL', 'Notes', 'Data'].map((t) => h('th', {}, t)))),
      h('tbody', {}, list.map((r) => h('tr', {}, h('td', {}, pick(st.sel, r.keyword, redraw)), h('td', { title: `Found via ${r.source ?? 'unknown'} on ${r.added}` }, r.keyword), metricCells(r),
        h('td', {}, cell(r, 'tags', 'Tags', r.tags.join(', '))), h('td', {}, cell(r, 'url', 'Target URL')), h('td', {}, cell(r, 'notes', 'Notes')),
        h('td', { class: 'small muted nowrap' }, r.metricsFrom ? `${r.metricsFrom} · ${MARKETS[r.market]?.label ?? r.market ?? ''} · ${r.collected}` : 'no metrics yet')))))))
}

// ---------------- Clusters ----------------
function clusterBlock(saved) {
  const out = h('div')
  const show = () => {
    const groups = clusterKeywords(Object.values(saved.saved()))
    if (!groups.length) { out.replaceChildren(note('Save some keywords first.')); return }
    const multi = groups.filter((g) => g.members.length > 1)
    out.replaceChildren(
      note(`${groups.length} clusters (${multi.length} with more than one keyword). Grouped by shared words, so each cluster is a candidate for one page; check the results pages before merging topics.`),
      h('div', { class: 'bar-line' }, btn('Tag keywords with their cluster', async (e) => {
        const head = new Map(groups.flatMap((g) => g.members.map((m) => [m.keyword, `cluster: ${g.head}`])))
        await saved.write((s) => { for (const [k, t] of head) if (s[k]) s[k].tags = [...s[k].tags.filter((x) => !x.startsWith('cluster: ')), t]; return s })
        e.target.textContent = 'Tagged'
      })),
      h('div', { class: 'scroll-x crawl-list' }, h('table', {}, h('thead', {}, h('tr', {}, ['Cluster', 'Keywords', 'Total volume', 'Members'].map((t) => h('th', {}, t)))),
        h('tbody', {}, groups.map((g) => h('tr', {}, h('td', {}, h('b', {}, g.head)), h('td', { class: 'mono' }, g.members.length), h('td', { class: 'mono' }, num(g.volume)),
          h('td', { class: 'small' }, g.members.slice(1).map((m) => m.keyword).join(', ') || '—')))))))
  }
  const serpOut = h('div')
  // ponytail: DataForSEO live SERP at depth 10 ≈ $0.002 per keyword (pricing page, 2026-10); actual cost is in Settings › Spend.
  const SERP_CAP = 30
  const check = btn('Check with search results', async (e) => {
    const cfg = await loadKeys()
    if (!hasCreds(cfg, 'dataforseo')) { serpOut.replaceChildren(note('Checking clusters against Google’s results uses DataForSEO (Settings › Connectors).')); return }
    const all = Object.values(saved.saved()), todo = all.filter((r) => !r.serp?.urls?.length || r.serp.market !== cfg.market).sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1)).slice(0, SERP_CAP)
    e.target.disabled = true
    for (const [i, r] of todo.entries()) {
      serpOut.replaceChildren(note(`Fetching Google’s top 10 for “${r.keyword}” (${i + 1} of ${todo.length})…`))
      try { const res = await API.dataforseo.serpTop(cfg.creds.dataforseo, r.keyword, MARKETS[cfg.market]); await saved.write((s) => { if (s[r.keyword]) s[r.keyword].serp = { urls: res.urls, market: cfg.market, at: new Date().toISOString().slice(0, 10) }; return s }) } catch (x) { serpOut.replaceChildren(failBox(x)); e.target.disabled = false; return }
    }
    e.target.disabled = false
    const groups = serpClusters(Object.values(saved.saved()))
    const words = new Map(clusterKeywords(Object.values(saved.saved())).flatMap((g) => g.members.map((m) => [m.keyword, g.head])))
    serpOut.replaceChildren(note(`${groups.length} groups of keywords that share 3 or more of Google’s top-10 results (${MARKETS[cfg.market].label}). Keywords in one group can usually be served by one page.`),
      h('div', { class: 'scroll-x crawl-list' }, h('table', {}, h('thead', {}, h('tr', {}, ['Group', 'Keywords', 'Word clusters it spans'].map((t) => h('th', {}, t)))),
        h('tbody', {}, groups.map((g) => { const spans = [...new Set(g.members.map((m) => words.get(m.keyword)))]; return h('tr', {}, h('td', {}, h('b', {}, g.head)), h('td', { class: 'small' }, g.members.map((m) => m.keyword).join(', ')), h('td', { class: 'small' }, spans.length > 1 ? [tag('warn', 'Merge?'), ` ${spans.join(' + ')}`] : tag('good', 'Matches'))) })))),
      note(all.length > SERP_CAP ? `Checked the ${SERP_CAP} highest-volume keywords; run again for the next ${SERP_CAP}.` : ''))
  })
  const est = note(`Fetches Google’s top 10 for up to ${SERP_CAP} saved keywords not yet checked (about $0.002 each with DataForSEO), then groups keywords whose results overlap.`)
  return block('Clusters', h('div', { class: 'bar-line' }, btn('Group saved keywords', show), note('Free: works on your saved list, no provider request.')), out, h('div', { class: 'bar-line' }, check), est, serpOut)
}

export const Research = {
  render(d, { go }) {
    const domain = registrableDomain(d.host)
    const saved = savedBlock(domain, go, d)
    return [head('Keyword research', `Find keywords around a seed, save the ones worth targeting for ${domain}, then tag them and map each to a page.`), discoverBlock(domain, saved.refresh), saved.el, clusterBlock(saved), contentBriefBlock(d, saved, go)]
  },
}
