// Lighthouse through PageSpeed Insights (your Google API key): category scores, lab metrics, biggest savings and the
// Agentic Browsing fraction, for this page (Speed view) or a batch of crawled pages (Crawl view). Latest result per
// URL and strategy is kept in `psi:<strategy>:<url>`, so reopening a view doesn't spend quota again.
import { pagespeed } from './apis.js'
import { hasCreds, loadKeys } from './keys.js'
import { h, block, btn, num, tag, download } from './ui.js'
import { toCsv } from './analyze.js'
import { failBox, note } from './views-data.js'

const key = (strategy, url) => `psi:${strategy}:${url.replace(/#.*/, '')}`
const get = async (k) => (await chrome.storage.local.get(k))[k]
const st = (score) => (score == null ? 'warn' : score >= 90 ? 'good' : score >= 50 ? 'warn' : 'bad')
const msx = (v) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`)
const LABEL = { performance: 'Performance', accessibility: 'Accessibility', 'best-practices': 'Best practices', seo: 'SEO' }
const needKey = (go) => h('div', { class: 'empty' }, h('b', {}, 'Lighthouse needs a free Google API key with the PageSpeed Insights API enabled.'), h('p', {}, 'Connect it in Settings › Connectors › PageSpeed Insights. The Chrome UX Report key works if both APIs are enabled on it.'), btn('Open Settings', () => go('Settings')))

function resultView(r) {
  return h('div', {},
    h('div', { class: 'stats-row' }, Object.entries(r.scores).map(([id, v]) => h('div', { class: 'stat' }, h('b', {}, v ?? '—'), h('span', {}, LABEL[id] ?? id), tag(st(v), v == null ? 'n/a' : v >= 90 ? 'Good' : v >= 50 ? 'Needs work' : 'Poor'))),
      r.agentic ? h('div', { class: 'stat' }, h('b', {}, `${r.agentic.passed}/${r.agentic.counted}`), h('span', {}, 'Agentic Browsing')) : ''),
    h('p', { class: 'small' }, `Lab (${r.strategy}, Lighthouse ${r.version ?? '?'}): LCP ${msx(r.lab.lcp)} · CLS ${r.lab.cls == null ? '—' : r.lab.cls.toFixed(3)} · TBT ${msx(r.lab.tbt)} · FCP ${msx(r.lab.fcp)} · Speed Index ${msx(r.lab.si)}${r.field ? ` · field verdict ${r.field.toLowerCase()}` : ''}.`),
    r.savings.length ? h('div', {}, h('h3', {}, 'Biggest savings'), h('ul', { class: 'small' }, r.savings.map((s) => h('li', {}, `${s.title} — about ${msx(s.savingsMs)}`)))) : '',
    r.agentic?.failed.length ? h('p', { class: 'small' }, 'Agentic Browsing audits to fix: ', r.agentic.failed.join(', '), '.') : '',
    r.agenticUnsupported ? note('PageSpeed Insights didn’t run the Agentic Browsing category for this request (it needs Lighthouse 13.2 or later).') : '',
    note(`Run ${r.at.slice(0, 16).replace('T', ' ')} UTC from Google’s servers. One lab run varies; field data above is what real users get.`))
}

/** Speed view: run Lighthouse for this page on mobile or desktop. */
export function lighthouseBlock(d, { go }) {
  const url = d.url.replace(/#.*/, '')
  const out = h('div'), strategy = h('select', { 'aria-label': 'Lighthouse device', onchange: () => show() }, [['mobile', 'Mobile'], ['desktop', 'Desktop']].map(([v, l]) => h('option', { value: v }, l)))
  const show = async () => { const r = await get(key(strategy.value, url)); out.replaceChildren(r ? resultView(r) : note('Not run yet for this page and device. Free within Google’s daily quota; takes 10–30 seconds.')) }
  const run = btn('Run Lighthouse', async (e) => {
    const cfg = await loadKeys()
    if (!hasCreds(cfg, 'pagespeed')) { out.replaceChildren(needKey(go)); return }
    e.target.disabled = true; out.replaceChildren(note('Running Lighthouse on Google’s servers…'))
    try {
      const r = { ...(await pagespeed(cfg.creds.pagespeed.key, url, strategy.value)), strategy: strategy.value, at: new Date().toISOString() }
      await chrome.storage.local.set({ [key(strategy.value, url)]: r })
      out.replaceChildren(resultView(r))
    } catch (x) { out.replaceChildren(failBox(x)) } finally { e.target.disabled = false }
  }, { class: 'btn primary' })
  show()
  return block('Lighthouse · PageSpeed Insights', h('div', { class: 'bar-line' }, strategy, run), out)
}

/** Crawl view: Lighthouse for the first N crawled pages, one at a time (PSI quota is per minute). */
export function lighthouseBatch(urls, { go }) {
  const n = h('select', { 'aria-label': 'Pages to test' }, [5, 10, 25].map((v) => h('option', { value: v }, `${v} pages`)))
  const out = h('div')
  const run = btn('Run Lighthouse on crawled pages', async (e) => {
    const cfg = await loadKeys()
    if (!hasCreds(cfg, 'pagespeed')) { out.replaceChildren(needKey(go)); return }
    const list = urls.slice(0, +n.value), rows = []
    e.target.disabled = true
    for (const [i, u] of list.entries()) {
      out.replaceChildren(note(`Lighthouse ${i + 1} of ${list.length}: ${u}`))
      try {
        const r = { ...(await pagespeed(cfg.creds.pagespeed.key, u, 'mobile')), strategy: 'mobile', at: new Date().toISOString() }
        await chrome.storage.local.set({ [key('mobile', u)]: r })
        rows.push({ url: u, ...Object.fromEntries(Object.entries(r.scores).map(([k, v]) => [k, v])), lcp_ms: r.lab.lcp == null ? null : Math.round(r.lab.lcp), cls: r.lab.cls, agentic: r.agentic ? `${r.agentic.passed}/${r.agentic.counted}` : '' })
      } catch (x) { rows.push({ url: u, error: x.message }) }
    }
    e.target.disabled = false
    out.replaceChildren(h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['Page', 'Performance', 'Accessibility', 'Best practices', 'SEO', 'LCP', 'CLS', 'Agentic'].map((t) => h('th', {}, t)))),
      h('tbody', {}, rows.map((r) => h('tr', {}, h('td', { class: 'mono small' }, r.url.replace(/^https?:\/\/[^/]+/, '') || '/'), r.error ? h('td', { colspan: 7, class: 'small' }, `failed: ${r.error}`)
        : [r.performance, r.accessibility, r['best-practices'], r.seo].map((v) => h('td', {}, tag(st(v), v ?? '—'))).concat([h('td', { class: 'mono' }, msx(r.lcp_ms)), h('td', { class: 'mono' }, r.cls == null ? '—' : r.cls.toFixed(3)), h('td', { class: 'mono' }, r.agentic || '—')])))))),
      btn('Export CSV', () => download('lighthouse-crawl.csv', toCsv(rows))), note(`${num(rows.filter((r) => !r.error).length)} of ${rows.length} pages tested (mobile).`))
  })
  return block('Lighthouse on crawled pages', h('div', { class: 'bar-line' }, n, run), note('Mobile Lighthouse for the first pages of the crawl, one at a time. Uses your PageSpeed Insights key.'), out)
}
