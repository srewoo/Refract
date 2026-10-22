// BYOK data views: CrUX field data, keyword metrics and rank tracking (Backlinks lives in views-backlinks.js).
import { density, registrableDomain, toCsv } from './analyze.js'
import { cruxFor } from './crux.js'
import { MARKETS, PROVIDERS, hasCreds, loadKeys, providerFor } from './keys.js'
import { API } from './providers.js'
import { loadSaved } from './keywords.js'
import { h, head, block, kv, tag, btn, num, bars, stack, lineChart, spark, download } from './ui.js'

export const note = (text) => h('p', { class: 'muted small' }, text)
export const failBox = (e) => h('p', { class: 'empty' }, `Could not fetch: ${e.message ?? e}`)
export const needKey = (what, go) => h('div', { class: 'empty' }, h('b', {}, `${what} needs a data source.`), h('p', {}, 'Connect DataForSEO, Semrush or Ahrefs in Settings › Connectors. Keys stay on this computer.'), btn('Open Settings', () => go('Settings')))
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
    rec.lcpParts ? h('div', {}, h('h3', {}, 'Where LCP time goes (p75, image LCPs)'), bars([['Server response (TTFB)', rec.lcpParts.ttfb], ['Load delay', rec.lcpParts.loadDelay], ['Load duration', rec.lcpParts.loadDuration], ['Render delay', rec.lcpParts.renderDelay]].filter(([, v]) => v != null).map(([label, value]) => ({ label, value })), { fmt: (v) => ms(v, 'ms') }),
      note('Load delay = time before the image starts downloading (discover it earlier: preload, fetchpriority). Render delay = downloaded but not painted (blocking scripts or CSS).')) : '',
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
export const kdCell = (kd) => (kd == null ? '—' : h('span', { class: 'kd' }, h('i', { class: `st-${kd < 30 ? 'good' : kd < 60 ? 'warn' : 'bad'}`, style: `width:${Math.min(100, kd) * 0.6}px` }), h('span', { class: 'mono' }, Math.round(kd)))) // 0–100 → 0–60px bar
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
      out.replaceChildren(h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['Phrase', 'Monthly volume', '12-month trend', 'Difficulty', 'CPC'].map((t) => h('th', {}, t)))),
        h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, r.keyword), h('td', { class: 'mono nowrap' }, num(r.volume)), h('td', {}, spark(r.trend ?? [])), h('td', {}, kdCell(r.kd)), h('td', { class: 'mono nowrap' }, r.cpc == null ? '—' : `$${Number(r.cpc).toFixed(2)}`)))))),
        note(`${PROVIDERS[id].name} · ${MARKETS[cfg.market].label}. Difficulty 0–100 on the provider’s own scale.${id === 'semrush' ? ' Trend is relative to the peak month.' : ''}`), btn('Export CSV', () => download(`keyword-metrics-${d.host}.csv`, toCsv(rows.map((r) => ({ ...r, trend: r.trend?.join(' ') ?? '' }))))))
    } catch (err) { out.replaceChildren(failBox(err)) } finally { e.target.disabled = false }
  })
  return block('Search demand', h('div', { class: 'bar-line' }, run, note('Uses your data-source credits.')), out)
}

// ---------------- Rank tracking ----------------
export const RANK_KEYWORDS = 50, RANK_POINTS = 120 // per tracker; one point per keyword per day
// DataForSEO is a live SERP check; Semrush/Ahrefs positions come from their index of the domain's top keywords.
const rankKind = (pt) => (pt?.provider == null ? 'unknown' : pt.provider === 'dataforseo' ? 'live' : 'estimate')
/** History points of the same kind as the latest one, so a trend never joins live checks to index estimates. */
export const sameKind = (hist) => hist.filter((x) => rankKind(x) === rankKind(hist.at(-1)))
// ponytail: DataForSEO Live SERP price per 10 results, from its pricing page (2026-10); the real cost of each check is stored with it.
const DFS_PER_10 = 0.002
export const dfsRankCost = (keywords, depth) => keywords * Math.ceil(depth / 10) * DFS_PER_10
const usd = (v) => `$${v < 0.1 ? v.toFixed(3) : v.toFixed(2)}`
const path = (url) => url.replace(/^https?:\/\/[^/]+/, '') || '/'

/** Latest check vs the one before it, across keywords ({ last, prev } per keyword). */
export function movement(rows) {
  const m = { up: 0, down: 0, entered: 0, dropped: 0, urlChanged: 0 }
  for (const { last, prev } of rows) {
    if (!last || !prev) continue
    const a = prev.position, b = last.position
    if (a && b) { if (b < a) m.up++; else if (b > a) m.down++ } else if (b) m.entered++; else if (a) m.dropped++
    if (a && b && prev.url && last.url && prev.url !== last.url) m.urlChanged++
  }
  return m
}

function rankTable(saved, chart) {
  const rows = saved.keywords.map((kw) => { const hist = sameKind(saved.history[kw] ?? []); return { kw, hist, last: hist.at(-1), prev: hist.at(-2) } })
  if (!rows.some((r) => r.last)) return note('No checks yet.')
  const mv = movement(rows)
  const summary = [mv.up && tag('good', `▲ ${mv.up} up`), mv.down && tag('bad', `▼ ${mv.down} down`), mv.entered && tag('good', `${mv.entered} new`), mv.dropped && tag('bad', `${mv.dropped} lost`), mv.urlChanged && tag('warn', `${mv.urlChanged} ranking URL changed`)].filter(Boolean)
  return h('div', {}, summary.length ? h('div', { class: 'bar-line' }, summary, note('vs the previous check')) : '', h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['Keyword', 'Position', 'Change', 'Best', 'Ranking URL', 'SERP features', 'Checked'].map((t) => h('th', {}, t)))),
    h('tbody', {}, rows.map((r) => {
      const pos = r.last?.position, before = r.prev?.position
      const delta = pos && before ? before - pos : null
      const best = Math.min(...r.hist.map((x) => x.position ?? 999))
      const moved = r.last?.url && r.prev?.url && r.last.url !== r.prev.url
      const pts = r.hist.filter((x) => x.position)
      return h('tr', { class: 'clickable', onclick: () => chart.replaceChildren(pts.length > 1 ? block(`“${r.kw}” over time`, lineChart(pts.map((x) => ({ date: x.date, value: x.position })), { invert: true, fmt: (v) => `#${Math.round(v)}`, label: 'Position' })) : note('Check again on another day to build a trend.')) },
        h('td', {}, r.kw), h('td', { class: 'mono nowrap' }, pos ? `#${pos}` : r.last ? `not in top ${r.last.depth ?? 100}` : '—', rankKind(r.last) === 'estimate' ? h('span', { class: 'muted small', title: `Index estimate from ${PROVIDERS[r.last.provider]?.name ?? r.last.provider}, not a live check` }, ' est.') : ''),
        h('td', { class: 'mono nowrap' }, delta == null ? '—' : delta > 0 ? tag('good', `▲ ${delta}`) : delta < 0 ? tag('bad', `▼ ${-delta}`) : '='),
        h('td', { class: 'mono nowrap' }, best < 999 ? `#${best}` : '—'),
        h('td', { class: 'mono small' }, r.last?.url ? path(r.last.url) : '—', moved ? h('span', { class: 'muted' }, ` (was ${path(r.prev.url)})`) : ''),
        h('td', { class: 'small' }, r.last?.features?.length ? r.last.features.join(', ').replaceAll('_', ' ') : '—'),
        h('td', { class: 'mono small nowrap' }, r.last?.date ?? '—'))
    })))))
}

export const Rankings = {
  render(d, { go }) {
    const domain = registrableDomain(d.host)
    let cfg
    const out = h('div'), chart = h('div'), cost = note('')
    const area = h('textarea', { rows: 5, 'aria-label': 'Keywords to track, one per line', class: 'kw-input', oninput: () => estimate() })
    const pick = (label, values, fmt, onchange) => h('select', { 'aria-label': label, onchange }, values.map((v) => h('option', { value: v }, fmt(v))))
    const device = pick('Device', ['desktop', 'mobile'], (v) => v[0].toUpperCase() + v.slice(1), () => load())
    const depth = pick('Results to check', [100, 50, 20, 10], (v) => `Top ${v}`, () => estimate())
    const opts = h('div', { class: 'bar-line', hidden: true }, device, depth, cost)
    const isDfs = () => cfg && providerFor(cfg, 'ranks') === 'dataforseo'
    const keywords = () => [...new Set(area.value.split('\n').map((x) => x.trim().toLowerCase()).filter(Boolean))].slice(0, RANK_KEYWORDS)
    const estimate = () => { cost.textContent = isDfs() ? `${keywords().length} live checks · about ${usd(dfsRankCost(keywords().length, +depth.value))} of DataForSEO credit` : '' }
    // One tracker per market and device; trackers saved before that (one per domain) are read as desktop and left in place.
    const key = () => `ranks:${domain}:${cfg.market}:${isDfs() ? device.value : 'desktop'}`
    // The pre-split tracker didn't record its market, so it is offered under every market's desktop tracker, with a note.
    const read = async (k = key()) => { const own = await store.get(k); return own ? { saved: own } : k.endsWith(':desktop') ? { saved: await store.get(`ranks:${domain}`), legacy: true } : {} }
    const legacyNote = 'Showing history saved before trackers were split by market and device; its market was not recorded. The next check starts this market’s own tracker from it.'
    const load = async () => {
      cfg = await loadKeys()
      opts.hidden = !isDfs()
      const { saved, legacy } = await read()
      if (!area.value) area.value = (saved?.keywords?.length ? saved.keywords : density(d.words, 2, 8).map((r) => r.term)).join('\n')
      chart.replaceChildren()
      out.replaceChildren(saved ? rankTable(saved, chart) : '')
      status.textContent = saved && legacy ? legacyNote : ''
      estimate()
    }
    const check = btn('Check positions now', async (e) => {
      cfg = await loadKeys()
      opts.hidden = !isDfs()
      const id = providerFor(cfg, 'ranks')
      if (!id) { out.replaceChildren(needKey('Rank tracking', go)); return }
      const k = key() // fixed for this check: the device menu can't redirect results mid-run
      const saved = (await read(k)).saved ?? { keywords: [], history: {} }
      saved.keywords = keywords()
      e.target.disabled = device.disabled = depth.disabled = true
      const date = new Date().toISOString().slice(0, 10)
      const failed = []
      try {
        const m = MARKETS[cfg.market]
        const o = id === 'dataforseo' ? { device: device.value, depth: +depth.value } : { depth: 50 }
        let results
        if (id === 'dataforseo') {
          results = []
          for (const [i, kw] of saved.keywords.entries()) { // one failure must not discard the checks already paid for
            status.textContent = `Checking “${kw}” (${i + 1}/${saved.keywords.length})…`
            try { results.push(await API.dataforseo.rank(cfg.creds.dataforseo, kw, domain, m, o)) } catch (x) { failed.push([kw, x.message ?? String(x)]) }
          }
          if (!results.length && failed.length) throw new Error(failed[0][1])
        } else {
          status.textContent = `Reading ${domain}’s ranking keywords from ${PROVIDERS[id].name}…`
          const ranked = await API[id].rankedKeywords(cfg.creds[id], domain, m)
          results = saved.keywords.map((kw) => { const hit = ranked.find((r) => r.keyword.toLowerCase() === kw); return { keyword: kw, position: hit?.position ?? null, url: hit?.url ?? null } })
        }
        for (const r of results) {
          const hist = (saved.history[r.keyword] ?? []).filter((x) => x.date !== date) // one point per day
          saved.history[r.keyword] = [...hist, { date, position: r.position, url: r.url, provider: id, ...o, cost: r.cost, features: r.features }].slice(-RANK_POINTS)
        }
        await store.set(k, saved)
        const spent = results.reduce((t, r) => t + (r.cost ?? 0), 0)
        status.textContent = `Checked ${results.length} keywords with ${PROVIDERS[id].name} (${m.label}${o.device ? `, ${o.device}, top ${o.depth}` : ''}).${id === 'dataforseo' ? ` Cost ${usd(spent)}.` : ' Positions come from the provider’s index of the domain’s top keywords; a blank means not in its top 50.'}${failed.length ? ` ${failed.length} failed and were not saved (${failed.slice(0, 3).map(([kw]) => `“${kw}”`).join(', ')}): ${failed[0][1]}` : ''}`
        chart.replaceChildren()
        out.replaceChildren(rankTable(saved, chart))
      } catch (err) { out.replaceChildren(failBox(err)) } finally { e.target.disabled = device.disabled = depth.disabled = false }
    }, { class: 'btn primary' })
    const status = note('')
    const ranking = btn('What does this domain rank for?', async (e) => {
      const cfg = await loadKeys()
      const id = ['semrush', 'ahrefs', 'dataforseo'].find((p) => hasCreds(cfg, p))
      if (!id) { extra.replaceChildren(note('Needs a Semrush, Ahrefs or DataForSEO key.')); return }
      e.target.disabled = true
      try {
        const rows = await API[id].rankedKeywords(cfg.creds[id], domain, MARKETS[cfg.market])
        extra.replaceChildren(block(`Top keywords for ${domain} · ${PROVIDERS[id].name}`, h('div', { class: 'scroll-x crawl-list' }, h('table', {}, h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, r.keyword), h('td', { class: 'mono' }, r.position ? `#${r.position}` : '—'), h('td', { class: 'mono' }, num(r.volume)), h('td', { class: 'mono small' }, (r.url ?? '').replace(/^https?:\/\/[^/]+/, '') || '/'))))))))
      } catch (err) { extra.replaceChildren(failBox(err)) } finally { e.target.disabled = false }
    })
    const extra = h('div')
    const fromSaved = btn('Add saved keywords', async () => {
      const kws = Object.values(await loadSaved(domain)).sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1)).map((r) => r.keyword)
      const have = keywords()
      area.value = [...new Set([...have, ...kws])].slice(0, RANK_KEYWORDS).join('\n')
      status.textContent = kws.length ? `Added saved keywords from Keyword research (highest volume first; the tracker holds 50).` : 'No saved keywords yet: save some in Keyword research.'
      estimate()
    })
    load()
    return [head('Rank tracking', `Google positions for ${domain}. Each check is stored here, so positions build a history over time.`, check), area, h('div', { class: 'bar-line' }, fromSaved), opts, status, out, chart, h('div', { class: 'bar-line' }, ranking), extra]
  },
}

