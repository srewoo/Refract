// Competitors: the domains you compete with, an overview of any of them (or yours), and a keyword gap
// (top keywords from DataForSEO, Semrush or Ahrefs). Every fetch is stored, so reopening it costs nothing.
import { registrableDomain, toCsv } from './analyze.js'
import { MARKETS, PROVIDERS, hasCreds, loadKeys, providerFor } from './keys.js'
import { API, costText, overviewCost, rankedCost } from './providers.js'
import { cleanDomain, domainGap, gapKey, loadCompetitors, loadRecord, mergeKeywords, overviewKey, positionBuckets, storeCompetitors, storeRecord, topPages, updateSaved } from './keywords.js'
import { h, head, block, btn, num, bars, copyBtn, download } from './ui.js'
import { comparisonOutline } from './generators.js'
import { authorityBlock } from './views-authority.js'
import { failBox, note } from './views-data.js'

const ranker = (cfg) => [providerFor(cfg, 'ranks'), 'semrush', 'ahrefs', 'dataforseo'].find((p) => p && hasCreds(cfg, p))
const path = (url) => (url ? url.replace(/^https?:\/\/[^/]+/, '') || '/' : '—')
const pos = (p) => (p ? `#${p}` : '—')
const TABS = {
  gap: ['Gaps', (c) => `${c} ranks, you don’t`, ['Keyword', 'Volume', 'Their position', 'Their URL'], (r) => [r.keyword, num(r.volume), pos(r.them), path(r.theirUrl)]],
  shared: ['Shared', () => 'both rank', ['Keyword', 'Volume', 'You', 'Them', 'Your URL'], (r) => [r.keyword, num(r.volume), pos(r.you), pos(r.them), path(r.yourUrl)]],
  yours: ['Yours', () => 'you rank, they don’t', ['Keyword', 'Volume', 'You', 'Your URL'], (r) => [r.keyword, num(r.volume), pos(r.you), path(r.yourUrl)]],
}

function gapView(domain, c, snap, onSaved) {
  const g = domainGap(snap.mine, snap.theirs)
  const sel = new Set()
  let tab = 'gap'
  const body = h('div')
  const tabs = h('div', { class: 'seg-ctl', role: 'tablist' }, Object.entries(TABS).map(([k, [label]]) => h('button', { role: 'tab', type: 'button', 'aria-selected': String(k === tab),
    onclick: (e) => { tab = k; sel.clear(); tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b === e.currentTarget))); draw() } }, label, h('small', {}, num(g[k].length)))))
  const draw = () => {
    const [, sub, cols, cells] = TABS[tab], rows = g[tab]
    const box = (k) => h('input', { type: 'checkbox', 'aria-label': `Select ${k}`, checked: sel.has(k), onchange: (e) => { if (e.target.checked) sel.add(k); else sel.delete(k); save.textContent = `Save ${sel.size} to keywords` } })
    const save = btn(`Save ${sel.size} to keywords`, async (e) => {
      if (!sel.size) return
      await updateSaved(domain, (s) => mergeKeywords(s, [...sel].map((keyword) => ({ keyword, tags: [`gap:${c}`] })), { source: `${PROVIDERS[snap.provider].name} gap vs ${c}` }))
      e.target.textContent = `Saved ${sel.size}`
      onSaved?.()
    })
    body.replaceChildren(
      h('div', { class: 'bar-line' }, note(`${num(rows.length)} keywords: ${sub(c)}.`), save,
        btn('Export CSV', () => download(`${tab}-${domain}-vs-${c}.csv`, toCsv(rows.map((r) => ({ ...r, provider: PROVIDERS[snap.provider].name, market: snap.market, fetched: snap.at.slice(0, 10) }))))), copyBtn('Copy comparison-page outline', () => comparisonOutline(domain, c, g.shared.map((r) => r.keyword)))),
      rows.length ? h('div', { class: 'scroll-x crawl-list' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, ''), cols.map((t) => h('th', {}, t)))),
        h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, box(r.keyword)), cells(r).map((v, i) => h('td', { class: i ? 'mono small' : '' }, v))))))) : '')
  }
  draw()
  return h('div', {},
    note(`${PROVIDERS[snap.provider].name} · ${MARKETS[snap.market]?.label ?? snap.market} · top ${num(snap.limit)} keywords by traffic for each domain · fetched ${snap.at.slice(0, 10)}. A gap means ${c} ranks for it and it is not in ${domain}’s top ${num(snap.limit)}; you may still rank lower down. Volumes are provider estimates.`),
    tabs, body)
}

// ---------------- Domain overview ----------------
function overviewView(dom, snap) {
  const o = snap.overview, money = (v) => (v == null ? '—' : `$${num(Math.round(v))}`)
  const dist = o.dist ?? positionBuckets(snap.top)
  const pages = topPages(snap.top)
  return h('div', {},
    note(`${dom} · ${PROVIDERS[snap.provider].name} · ${MARKETS[snap.market]?.label ?? snap.market} · fetched ${snap.at.slice(0, 10)}. Traffic and value are the provider’s estimates from rankings × search volume, not analytics or Search Console.`),
    h('div', { class: 'stats-row' }, [[num(o.keywords), snap.provider === 'dataforseo' ? 'Results it ranks in (top 100)' : 'Ranking keywords'], [num(o.traffic == null ? null : Math.round(o.traffic)), 'Est. monthly organic visits'], [money(o.value), 'Est. traffic value / month'], o.top3 != null ? [num(o.top3), 'Keywords in top 3'] : null].filter(Boolean)
      .map(([v, l]) => h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, l)))),
    h('h3', {}, o.dist ? 'Positions (all ranking keywords)' : `Positions (its top ${num(snap.top.length)} keywords by traffic)`),
    bars(Object.entries(dist).map(([label, value]) => ({ label: `#${label}`, value }))),
    pages.length ? [h('h3', {}, `Top pages (from its top ${num(snap.top.length)} keywords)`), h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['Page', 'Keywords', 'Their volume', 'Best position', 'Top keyword'].map((t) => h('th', {}, t)))),
      h('tbody', {}, pages.map((p) => h('tr', {}, h('td', { class: 'mono small' }, path(p.url)), h('td', { class: 'mono' }, p.keywords), h('td', { class: 'mono' }, num(p.volume)), h('td', { class: 'mono' }, pos(p.best)), h('td', { class: 'small' }, p.top))))))] : '')
}

function overviewBlock(domain, st) {
  const choose = h('select', { 'aria-label': 'Domain to overview', onchange: () => show() })
  const cost = note(''), out = h('div')
  const show = async () => {
    const id = ranker(st.cfg)
    cost.textContent = id ? `${PROVIDERS[id].name} · ${MARKETS[st.cfg.market].label} · overview + top 100 keywords · ${costText(overviewCost(id))} + ${costText(rankedCost(id, 100))}` : 'Needs a DataForSEO, Semrush or Ahrefs key (Settings › Connectors).'
    const snap = choose.value && (await loadRecord(overviewKey(choose.value, st.cfg.market)))
    out.replaceChildren(snap ? overviewView(choose.value, snap) : note(`No overview of ${choose.value} yet in ${MARKETS[st.cfg.market].label}.`))
  }
  const run = btn('Get overview', async (e) => {
    st.cfg = await loadKeys()
    const id = ranker(st.cfg), dom = choose.value
    if (!id) return show()
    e.target.disabled = true
    out.replaceChildren(note(`Reading ${dom} from ${PROVIDERS[id].name}…`))
    try {
      const m = MARKETS[st.cfg.market]
      const [overview, top] = await Promise.all([API[id].overview(st.cfg.creds[id], dom, m), API[id].rankedKeywords(st.cfg.creds[id], dom, m, 100)])
      const snap = { at: new Date().toISOString(), provider: id, market: st.cfg.market, overview, top }
      await storeRecord(overviewKey(dom, st.cfg.market), snap)
      out.replaceChildren(overviewView(dom, snap))
    } catch (err) { out.replaceChildren(failBox(err)) } finally { e.target.disabled = false }
  }, { class: 'btn primary' })
  const refresh = () => { const keep = choose.value; choose.replaceChildren(...[domain, ...st.list].map((c) => h('option', { value: c, selected: c === keep }, c === domain ? `${c} (you)` : c))); show() }
  return { refresh, el: block('Domain overview', h('div', { class: 'bar-line' }, choose, run), cost, out) }
}

export const Competitors = {
  render(d, { go }) {
    const domain = registrableDomain(d.host)
    const st = { list: [], cfg: null }
    const chips = h('ul', { class: 'chips' }), msg = h('div'), out = h('div'), cost = note('')
    const input = h('input', { class: 'url-input', placeholder: 'competitor.com', 'aria-label': 'Competitor domain', onkeydown: (e) => { if (e.key === 'Enter') add() } })
    const choose = h('select', { 'aria-label': 'Competitor to compare', onchange: () => showStored() })
    const limit = h('select', { 'aria-label': 'Keywords per domain', onchange: () => estimate() }, [100, 250, 500].map((v) => h('option', { value: v }, `Top ${v} each`)))
    const estimate = () => {
      const id = st.cfg && ranker(st.cfg)
      if (!id) { cost.textContent = 'Needs a DataForSEO, Semrush or Ahrefs key (Settings › Connectors).'; return }
      cost.textContent = `${PROVIDERS[id].name} · ${MARKETS[st.cfg.market].label} · 2 requests · ${costText(rankedCost(id, +limit.value, 2))}`
    }
    const overview = overviewBlock(domain, st)
    const save = async (list) => { st.list = list; await storeCompetitors(domain, list); drawList(); overview.refresh() }
    const add = async () => {
      const c = cleanDomain(input.value)
      if (!c || c === domain) { msg.replaceChildren(note(c ? 'That is this site’s own domain.' : 'Enter a domain like rival.com.')); return }
      msg.replaceChildren(); input.value = ''
      await save([...new Set([...st.list, c])])
      choose.value = c
      showStored()
    }
    const drawList = () => {
      chips.replaceChildren(...st.list.map((c) => h('li', {}, c, h('button', { type: 'button', class: 'chip-x', 'aria-label': `Remove ${c}`, onclick: () => save(st.list.filter((x) => x !== c)).then(showStored) }, '×'))))
      const keep = choose.value
      choose.replaceChildren(...st.list.map((c) => h('option', { value: c, selected: c === keep }, c)))
    }
    const showStored = async () => {
      const c = choose.value
      const snap = c && (await loadRecord(gapKey(domain, c, st.cfg.market)))
      if (snap) { limit.value = String(snap.limit); estimate() }
      out.replaceChildren(snap ? gapView(domain, c, snap) : note(c ? `No comparison with ${c} yet in ${MARKETS[st.cfg.market].label}.` : 'Add a competitor to compare keywords.'))
    }
    const run = btn('Compare keywords', async (e) => {
      st.cfg = await loadKeys()
      const id = ranker(st.cfg), c = choose.value, n = +limit.value
      if (!id) { estimate(); return }
      if (!c) { input.focus(); return }
      e.target.disabled = true
      out.replaceChildren(note(`Reading the top ${n} keywords for ${domain} and ${c} from ${PROVIDERS[id].name}…`))
      try {
        const m = MARKETS[st.cfg.market]
        const [mine, theirs] = await Promise.all([API[id].rankedKeywords(st.cfg.creds[id], domain, m, n), API[id].rankedKeywords(st.cfg.creds[id], c, m, n)])
        const snap = { at: new Date().toISOString(), provider: id, market: st.cfg.market, limit: n, mine, theirs }
        await storeRecord(gapKey(domain, c, st.cfg.market), snap)
        out.replaceChildren(gapView(domain, c, snap))
      } catch (err) { out.replaceChildren(failBox(err)) } finally { e.target.disabled = false }
    }, { class: 'btn primary' })
    ;(async () => {
      st.cfg = await loadKeys()
      st.list = await loadCompetitors(domain)
      drawList(); estimate(); showStored(); overview.refresh()
    })()
    return [head('Competitors', `Domains you compete with for ${domain}: how big each one is in search, and the keywords they rank for that you don’t.`),
      block('Your competitors', chips, h('div', { class: 'bar-line' }, input, btn('Add', add)), msg),
      authorityBlock(domain, st, go),
      overview.el,
      block('Keyword gap', h('div', { class: 'bar-line' }, choose, limit, run), cost, out)]
  },
}
