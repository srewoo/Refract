// BYOK data views: CrUX field data, keyword metrics, rank tracking, backlinks, and the Settings section for keys.
import { density, registrableDomain, toCsv } from './analyze.js'
import { cruxFor } from './crux.js'
import { MARKETS, PROVIDERS, hasCreds, loadKeys, providerFor } from './keys.js'
import { API } from './providers.js'
import { h, head, block, kv, tag, btn, num, bars, stack, lineChart, download } from './ui.js'

const note = (text) => h('p', { class: 'muted small' }, text)
const failBox = (e) => h('p', { class: 'empty' }, `Could not fetch: ${e.message ?? e}`)
const needKey = (what, go) => h('div', { class: 'empty' }, h('b', {}, `${what} needs a data source.`), h('p', {}, 'Connect DataForSEO, Semrush or Ahrefs in Settings › Connectors. Keys stay on this computer.'), btn('Open Settings', () => go('Settings')))
const store = { get: async (k) => (await chrome.storage.local.get(k))[k], set: (k, v) => chrome.storage.local.set({ [k]: v }) }
const ms = (v, unit) => (unit === 'ms' ? (v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`) : String(Number(v).toFixed(2)))

// ---------------- CrUX field data (inside Speed) ----------------
export function cruxBlock(d, { go }) {
  const out = h('div', {}, note('Loading real-user data…'))
  let ff = 'PHONE'
  const seg = h('div', { class: 'seg-ctl', role: 'tablist' }, ['PHONE', 'DESKTOP'].map((f) => h('button', { role: 'tab', type: 'button', 'aria-selected': String(f === ff), onclick: (e) => { ff = f; seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b === e.currentTarget))); load() } }, f === 'PHONE' ? 'Phone' : 'Desktop')))
  const card = (title, rec) => block(title, !rec ? note('Not enough Chrome users visited this in the last 28 days for CrUX to report.') : [
    h('div', { class: 'crux' }, Object.values(rec.metrics).map((m) => h('div', { class: 'crux-m' },
      h('div', { class: 'crux-h' }, h('b', {}, m.label), h('span', { class: 'mono' }, ms(m.p75, m.unit)), tag(m.status, m.status === 'good' ? 'Good' : m.status === 'warn' ? 'Needs work' : 'Poor')),
      stack([{ label: 'Good', value: Math.round(m.good * 100), status: 'good' }, { label: 'Needs work', value: Math.round(m.ni * 100), status: 'warn' }, { label: 'Poor', value: Math.round(m.poor * 100), status: 'bad' }])))),
    note(`p75 over ${rec.period}. Percentages are shares of page loads.`)])
  const trend = (hist, scope) => {
    if (!hist) return ''
    const one = (pts, label, fmt, good, poor) => (pts.length > 1 ? h('div', {}, h('h3', {}, `${label} p75 · ${scope}`), lineChart(pts, { fmt, label, height: 120, thresholds: [{ at: good, status: 'good', label: 'good' }, { at: poor, status: 'bad', label: 'poor' }] })) : '')
    return block('25-week trend', h('div', { class: 'split3' }, one(hist.lcp, 'LCP', (v) => ms(v, 'ms'), 2500, 4000), one(hist.inp, 'INP', (v) => ms(v, 'ms'), 200, 500), one(hist.cls, 'CLS', (v) => Number(v).toFixed(2), 0.1, 0.25)))
  }
  const load = async () => {
    const cfg = await loadKeys()
    if (!hasCreds(cfg, 'crux')) { out.replaceChildren(h('div', { class: 'empty' }, h('b', {}, 'Field data needs a free Google CrUX API key.'), h('p', {}, 'Lab numbers above are one load on your machine; CrUX is what real Chrome users experienced, and what Google uses.'), btn('Connect in Settings', () => go('Settings')))); return }
    out.replaceChildren(note('Loading real-user data…'))
    try {
      const r = await cruxFor(cfg.creds.crux.key, d.url, ff)
      out.replaceChildren(h('div', { class: 'split' }, card('This URL', r.url), card('Whole site (origin)', r.origin)), trend(r.urlHistory?.lcp.length > 1 ? r.urlHistory : r.originHistory, r.urlHistory?.lcp.length > 1 ? 'URL' : 'origin'))
    } catch (e) { out.replaceChildren(failBox(e)) }
  }
  load()
  return block('Field data · Chrome UX Report (real users, 28 days)', seg, out)
}

// ---------------- Keyword volume & difficulty (inside Keywords) ----------------
export function keywordMetricsBlock(d, { go }) {
  const out = h('div')
  const run = btn('Get volume & difficulty', async (e) => {
    const cfg = await loadKeys()
    const id = providerFor(cfg, 'keywords')
    if (!id) { out.replaceChildren(needKey('Keyword data', go)); return }
    const phrases = [...new Set([...density(d.words, 2, 12), ...density(d.words, 3, 8), ...density(d.words, 1, 5)].map((r) => r.term))].slice(0, 20)
    e.target.disabled = true; out.replaceChildren(note(`Asking ${PROVIDERS[id].name} about ${phrases.length} phrases from this page…`))
    try {
      const rows = (await API[id].keywords(cfg.creds[id], phrases, MARKETS[cfg.market])).sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1))
      out.replaceChildren(h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['Phrase', 'Monthly volume', 'Difficulty', 'CPC'].map((t) => h('th', {}, t)))),
        h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, r.keyword), h('td', { class: 'mono nowrap' }, num(r.volume)), h('td', {}, r.kd == null ? '—' : h('span', { class: 'kd' }, h('i', { class: `st-${r.kd < 30 ? 'good' : r.kd < 60 ? 'warn' : 'bad'}`, style: `width:${r.kd}%` }), h('span', { class: 'mono' }, Math.round(r.kd)))), h('td', { class: 'mono nowrap' }, r.cpc == null ? '—' : `$${Number(r.cpc).toFixed(2)}`)))))),
        note(`${PROVIDERS[id].name} · ${MARKETS[cfg.market].label}. Difficulty 0–100 on the provider’s own scale.`), btn('Export CSV', () => download(`keyword-metrics-${d.host}.csv`, toCsv(rows))))
    } catch (err) { out.replaceChildren(failBox(err)) } finally { e.target.disabled = false }
  })
  return block('Search demand', h('div', { class: 'bar-line' }, run, note('Uses your data-source credits.')), out)
}

// ---------------- Rank tracking ----------------
export const Rankings = {
  render(d, { go }) {
    const domain = registrableDomain(d.host)
    const k = `ranks:${domain}`
    const out = h('div')
    const area = h('textarea', { rows: 5, 'aria-label': 'Keywords to track, one per line', class: 'kw-input' })
    const draw = (saved) => {
      const rows = saved.keywords.map((kw) => { const hist = saved.history[kw] ?? []; const last = hist.at(-1); const prev = hist.at(-2); return { kw, hist, last, prev } })
      out.replaceChildren(rows.some((r) => r.last) ? h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['Keyword', 'Position', 'Change', 'Best', 'Ranking URL', 'Checked'].map((t) => h('th', {}, t)))),
        h('tbody', {}, rows.map((r) => {
          const pos = r.last?.position, before = r.prev?.position
          const delta = pos && before ? before - pos : null
          const best = Math.min(...r.hist.map((x) => x.position ?? 999))
          return h('tr', { class: 'clickable', onclick: () => chart.replaceChildren(r.hist.filter((x) => x.position).length > 1 ? block(`“${r.kw}” over time`, lineChart(r.hist.filter((x) => x.position).map((x) => ({ date: x.date, value: x.position })), { invert: true, fmt: (v) => `#${Math.round(v)}`, label: 'Position' })) : note('Check again on another day to build a trend.')) },
            h('td', {}, r.kw), h('td', { class: 'mono nowrap' }, pos ? `#${pos}` : r.last ? 'not in top 100' : '—'),
            h('td', { class: 'mono nowrap' }, delta == null ? '—' : delta > 0 ? tag('good', `▲ ${delta}`) : delta < 0 ? tag('bad', `▼ ${-delta}`) : '='),
            h('td', { class: 'mono nowrap' }, best < 999 ? `#${best}` : '—'), h('td', { class: 'mono small' }, r.last?.url ? r.last.url.replace(/^https?:\/\/[^/]+/, '') || '/' : '—'), h('td', { class: 'mono small nowrap' }, r.last?.date ?? '—'))
        })))) : note('No checks yet.'))
    }
    const chart = h('div')
    const check = btn('Check positions now', async (e) => {
      const cfg = await loadKeys()
      const id = providerFor(cfg, 'ranks')
      if (!id) { out.replaceChildren(needKey('Rank tracking', go)); return }
      const saved = (await store.get(k)) ?? { keywords: [], history: {} }
      saved.keywords = [...new Set(area.value.split('\n').map((x) => x.trim().toLowerCase()).filter(Boolean))].slice(0, 50)
      e.target.disabled = true
      const date = new Date().toISOString().slice(0, 10)
      try {
        const m = MARKETS[cfg.market]
        let results
        if (id === 'dataforseo') {
          results = []
          for (const kw of saved.keywords) { status.textContent = `Checking “${kw}” (${results.length + 1}/${saved.keywords.length})…`; results.push(await API.dataforseo.rank(cfg.creds.dataforseo, kw, domain, m)) }
        } else {
          status.textContent = `Reading ${domain}’s ranking keywords from ${PROVIDERS[id].name}…`
          const ranked = await API[id].rankedKeywords(cfg.creds[id], domain, m)
          results = saved.keywords.map((kw) => { const hit = ranked.find((r) => r.keyword.toLowerCase() === kw); return { keyword: kw, position: hit?.position ?? null, url: hit?.url ?? null } })
        }
        for (const r of results) {
          const hist = (saved.history[r.keyword] ?? []).filter((x) => x.date !== date) // one point per day
          saved.history[r.keyword] = [...hist, { date, position: r.position, url: r.url }].slice(-120)
        }
        await store.set(k, saved)
        status.textContent = `Checked ${results.length} keywords with ${PROVIDERS[id].name} (${m.label}).${id !== 'dataforseo' ? ' Positions come from the provider’s index of the domain’s top keywords; a blank means not in its top 50.' : ''}`
        draw(saved)
      } catch (err) { out.replaceChildren(failBox(err)) } finally { e.target.disabled = false }
    }, { class: 'btn primary' })
    const status = note('')
    const ranking = btn('What does this domain rank for?', async (e) => {
      const cfg = await loadKeys()
      const id = ['semrush', 'ahrefs'].find((p) => hasCreds(cfg, p))
      if (!id) { extra.replaceChildren(note('Needs a Semrush or Ahrefs key.')); return }
      e.target.disabled = true
      try {
        const rows = await API[id].rankedKeywords(cfg.creds[id], domain, MARKETS[cfg.market])
        extra.replaceChildren(block(`Top keywords for ${domain} · ${PROVIDERS[id].name}`, h('div', { class: 'scroll-x crawl-list' }, h('table', {}, h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, r.keyword), h('td', { class: 'mono' }, `#${r.position}`), h('td', { class: 'mono' }, num(r.volume)), h('td', { class: 'mono small' }, (r.url ?? '').replace(/^https?:\/\/[^/]+/, '') || '/'))))))))
      } catch (err) { extra.replaceChildren(failBox(err)) } finally { e.target.disabled = false }
    })
    const extra = h('div')
    store.get(k).then((saved) => {
      const kws = saved?.keywords?.length ? saved.keywords : density(d.words, 2, 8).map((r) => r.term)
      area.value = kws.join('\n')
      if (saved) draw(saved)
    })
    return [head('Rank tracking', `Google positions for ${domain}. Each check is stored here, so positions build a history over time.`, check), area, status, out, chart, h('div', { class: 'bar-line' }, ranking), extra]
  },
}

// ---------------- Backlinks ----------------
export const Backlinks = {
  render(d, { go }) {
    const domain = registrableDomain(d.host)
    const k = `bl:${domain}`
    const out = h('div')
    const show = (r, id, at) => out.replaceChildren(
      h('div', { class: 'stats-row' }, [[r.rating, r.ratingName], [r.refDomains, 'Referring domains'], [r.backlinks, 'Backlinks']].map(([v, l]) => h('div', { class: 'stat' }, h('b', {}, num(v)), h('span', {}, l)))),
      r.top.length ? block('Top referring domains (by links to this site)', bars(r.top.map((t) => ({ label: t.domain, value: t.backlinks ?? 0 })).slice(0, 20))) : '',
      note(`${PROVIDERS[id].name} · fetched ${at.slice(0, 10)}. Counts are the provider’s index, not every link on the web.`),
      btn('Export CSV', () => download(`backlinks-${domain}.csv`, toCsv(r.top))))
    const fetchNow = btn('Fetch backlinks', async (e) => {
      const cfg = await loadKeys()
      const id = providerFor(cfg, 'backlinks')
      if (!id) { out.replaceChildren(needKey('Backlink data', go)); return }
      if (id === 'dataforseo' && !cfg.dfsBacklinksOptIn) { out.replaceChildren(h('p', { class: 'empty' }, 'DataForSEO’s Backlinks API is a separate monthly subscription. Confirm you have it in Settings › Connectors › Routing, or route backlinks to Semrush or Ahrefs.')); return }
      e.target.disabled = true; out.replaceChildren(note(`Asking ${PROVIDERS[id].name}…`))
      try { const r = await API[id].backlinks(cfg.creds[id], domain); const at = new Date().toISOString(); await store.set(k, { r, id, at }); show(r, id, at) } catch (err) { out.replaceChildren(failBox(err)) } finally { e.target.disabled = false }
    }, { class: 'btn primary' })
    store.get(k).then((c) => { if (c) show(c.r, c.id, c.at) }) // cached result; refetch is explicit (costs credits)
    return [head('Backlinks', `Links pointing to ${domain}, from your data source.`, fetchNow), out]
  },
}
