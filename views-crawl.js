// Site crawl view: runs in the full-tab or side-panel page (a popup dies on blur and would kill the crawl).
import { toCsv } from './analyze.js'
import { analyseCrawl, crawl, CRAWL_CAP, DEPTH_CAP, sitemapUrls } from './crawl.js'
import { diffCrawls } from './history.js'
import { renderer, withWorkerTab } from './render.js'
import { h, head, block, btn, ext, num, bars, stack, tag, download } from './ui.js'

const HOSTS = { origins: ['<all_urls>'] }
const STOPPED = {
  done: 'Crawl complete: every reachable page was fetched.',
  page_cap: `Stopped at the ${num(CRAWL_CAP)}-page limit. Site-wide answers (orphans, duplicates) cover only the pages fetched.`,
  depth_cap: `Complete to depth ${DEPTH_CAP}; deeper links were not followed.`,
  rate_limited: 'Stopped early: the server asked us to slow down (429/503).',
  stopped: 'Stopped by you. Results cover the pages fetched so far.',
}
const key = (origin) => `crawl:${origin}`
const short = (u, origin) => u.replace(origin, '') || '/'

export const Crawl = {
  name: 'Crawl',
  render(d, { mode, openFull }) {
    const origin = new URL(d.url).origin
    if (mode === 'popup') return [head('Site crawl', `Crawls up to ${num(CRAWL_CAP)} pages of ${new URL(d.url).host} to find broken links, duplicates, orphans and more. Runs in a full-screen tab so it keeps going while you work.`, btn('Open full screen to crawl', () => openFull('Crawl')))]
    const out = h('div', {}, h('p', { class: 'empty' }, 'No crawl yet for this site. Start one to see site-wide issues.'))
    const status = h('p', { class: 'muted small' })
    const progress = h('div', { class: 'progress', hidden: true }, h('span'))
    let ctl = null
    const renderBox = h('input', { type: 'checkbox' })
    const options = h('label', { class: 'setting' }, renderBox, h('span', {}, h('b', {}, 'Render JavaScript'),
      h('span', { class: 'muted small' }, `Loads each page in a background tab so React/Vue/Angular content is seen. About 3–5 s per page (up to ~1 h for ${num(CRAWL_CAP)} pages) and it uses your browser session (cookies), unlike the default anonymous crawl. Without it, ${num(CRAWL_CAP)} pages take roughly 10–15 min.`)))
    const start = btn('Start crawl', async (e) => {
      if (!(await chrome.permissions.request(HOSTS))) { status.textContent = 'Site access is needed to fetch other pages of this site.'; return }
      ctl = new AbortController()
      e.target.disabled = true; stop.hidden = false; progress.hidden = false
      document.body.dataset.busy = '1' // shell won't auto-reload on tab navigation mid-crawl
      status.textContent = 'Reading sitemap…'
      const sm = await sitemapUrls(origin, d.robotsTxt)
      const run = (renderImpl) => crawl(d.url, { robotsTxt: d.robotsTxt, signal: ctl.signal, renderImpl, onProgress: (p) => {
        progress.firstChild.style.width = `${(p.done / CRAWL_CAP) * 100}%`
        status.textContent = `${p.done} / ${CRAWL_CAP} pages · ${p.queued} queued · ${short(p.url, origin)}`
      } })
      const result = renderBox.checked ? await withWorkerTab((tabId) => run(renderer(tabId))) : await run(null)
      const prev = (await chrome.storage.local.get(key(origin)))[key(origin)]
      const saved = { result, sitemap: sm, changes: prev?.result ? diffCrawls(prev.result, result) : null }
      await chrome.storage.local.set({ [key(origin)]: saved }).catch((err) => { status.textContent = `Could not save this crawl: ${err.message}` }) // last crawl per site; its diff vs the one before
      delete document.body.dataset.busy
      e.target.disabled = false; stop.hidden = true; progress.hidden = true
      status.textContent = ''
      out.replaceChildren(...report(saved, origin))
    }, { class: 'btn primary' })
    const stop = btn('Stop', () => ctl?.abort(), { hidden: true })
    chrome.storage.local.get(key(origin)).then((s) => { if (s[key(origin)]) out.replaceChildren(...report(s[key(origin)], origin)) })
    return [
      head('Site crawl', `Up to ${num(CRAWL_CAP)} pages of ${new URL(d.url).host}, depth ≤ ${DEPTH_CAP}: same site only, obeys robots.txt, no cookies, one request at a time.`, start, stop),
      options, progress, status,
      out,
    ]
  },
}

function report(saved, origin) {
  const { result, sitemap } = saved
  const a = analyseCrawl(result, sitemap)
  const n = result.pages.length
  const list = (title, rows, cell, empty) => block(`${title} (${rows.length})`, rows.length ? h('div', { class: 'scroll-x crawl-list' }, h('table', {}, h('tbody', {}, rows.slice(0, 100).map((r) => h('tr', {}, cell(r)))))) : h('p', { class: 'muted small' }, empty ?? 'None.'))
  const link = (u) => h('td', { class: 'mono' }, ext(u, short(u, origin)))
  const problems = a.broken.length + a.dupTitles.length + a.missingTitle.length + a.noindex.length + (result.complete ? a.orphans.length : 0)
  return [
    h('p', {}, tag(result.complete ? 'good' : 'warn', result.complete ? 'Complete' : 'Partial'), ' ', STOPPED[result.stoppedBecause], h('span', { class: 'muted small' }, ` · ${num(n)} pages · ${result.finishedAt.slice(0, 16).replace('T', ' ')} UTC${result.skipped.robots ? ` · ${result.skipped.robots} skipped by robots.txt` : ''}`),
      ' ', btn('Export CSV', () => download(`crawl-${new URL(origin).host}.csv`, toCsv(result.pages.map((p) => ({ url: p.url, status: p.status ?? p.error, depth: p.depth, ms: p.ms, title: p.title ?? '', description: p.description ?? '', h1: p.h1 ?? '', words: p.words ?? '', canonical: p.canonical ?? '', robots: p.robots ?? '', redirected_to: p.redirected ? p.finalUrl : '' })))))),
    h('div', { class: 'split' },
      h('div', {}, stack([{ label: 'OK', value: a.status.ok, status: 'good' }, { label: 'Redirected', value: a.status.redirect, status: 'warn' }, { label: 'Error (4xx/5xx/failed)', value: a.status.client + a.status.server + a.status.error, status: 'bad' }], { caption: 'Response status' }),
        h('p', { class: 'answer' }, problems ? `${problems} site-wide issues to look at below.` : 'No site-wide issues found in the crawled pages.')),
      block('Click depth from this page', bars(a.depth))),
    list('Broken internal links', a.broken, (r) => [link(r.from), h('td', {}, '→'), link(r.to), h('td', { class: 'mono nowrap' }, r.status)], 'No links to error pages.'),
    list('Duplicate titles', a.dupTitles, (g) => [h('td', {}, h('b', {}, g.value), h('div', { class: 'mono small' }, g.urls.map((u) => short(u, origin)).join('  ·  ')))], 'Every title is unique.'),
    list('Duplicate descriptions', a.dupDescriptions, (g) => [h('td', {}, g.value, h('div', { class: 'mono small' }, g.urls.map((u) => short(u, origin)).join('  ·  ')))]),
    list('Missing title', a.missingTitle, (u) => [link(u)]),
    list('Missing meta description', a.missingDescription, (u) => [link(u)]),
    list('Missing H1', a.missingH1, (u) => [link(u)]),
    list('Noindex pages', a.noindex, (u) => [link(u)]),
    list('Canonicalised to another URL', a.canonicalised, (r) => [link(r.url), h('td', {}, '→'), link(r.canonical)]),
    list('Redirecting internal links', a.redirects, (r) => [link(r.url), h('td', {}, '→'), link(r.to)]),
    block(`Orphan pages (${a.orphans.length})`, !sitemap.urls.length ? h('p', { class: 'muted small' }, 'No sitemap found, so orphans cannot be identified.')
      : !result.complete ? h('p', { class: 'muted small' }, `Not reported: the crawl stopped before every page was found, so "nothing links here" can’t be claimed. ${a.orphans.length} of ${sitemap.urls.length} sitemap URLs were not reached.`)
      : a.orphans.length ? h('div', { class: 'scroll-x crawl-list' }, h('table', {}, h('tbody', {}, a.orphans.slice(0, 100).map((u) => h('tr', {}, link(u)))))) : h('p', { class: 'muted small' }, 'Every sitemap URL is linked from a crawled page.')),
    list('Hreflang without return link', a.hreflangMissingReturn, (r) => [link(r.from), h('td', { class: 'mono' }, r.lang), link(r.to)]),
    saved.changes ? changesBlock(saved.changes, origin) : '',
    result.pages.some((p) => p.rendered) ? list('Content that needs JavaScript', a.jsDependent, (r) => [link(r.url), h('td', { class: 'mono nowrap' }, `${num(r.raw)} → ${num(r.rendered)} words`)], 'Every rendered page has most of its text in the server HTML.') : '',
    a.phones.length > 1 ? block(`Phone numbers (${a.phones.length} different)`, h('p', { class: 'small' }, tag('warn', 'Check'), ' Different click-to-call numbers across the site. Fine for departments; a problem if it’s one business (NAP consistency).'),
      h('div', { class: 'scroll-x crawl-list' }, h('table', {}, h('tbody', {}, a.phones.map((p) => h('tr', {}, h('td', { class: 'mono nowrap' }, p.number), h('td', { class: 'mono small' }, `${p.urls.length} page${p.urls.length > 1 ? 's' : ''}: ${p.urls.slice(0, 4).map((u) => short(u, origin)).join(', ')}${p.urls.length > 4 ? '…' : ''}`))))))) : '',
    list('Thin pages (< 300 words)', a.thin, (r) => [link(r.url), h('td', { class: 'mono nowrap' }, num(r.words))]),
    list('Slow responses (> 1.5 s)', a.slow, (r) => [link(r.url), h('td', { class: 'mono nowrap' }, `${r.ms} ms`)]),
    list(`Deeper than 3 clicks`, a.deep, (r) => [link(r.url), h('td', { class: 'mono nowrap' }, `depth ${r.depth}`)]),
  ]
}

function changesBlock(c, origin) {
  const short = (u) => u.replace(origin, '') || '/'
  const rows = [
    ...c.added.slice(0, 50).map((u) => ['New page', short(u), '']),
    ...c.removed.slice(0, 50).map((u) => ['Gone', short(u), '']),
    ...c.status.map((x) => ['Status', short(x.url), `${x.before} → ${x.after}`]),
    ...c.indexing.map((x) => ['Indexing', short(x.url), `${x.before} → ${x.after}`]),
    ...c.titles.slice(0, 50).map((x) => ['Title', short(x.url), `“${x.before}” → “${x.after}”`]),
  ]
  return block(`Changes since the crawl on ${c.since.slice(0, 10)} (${c.added.length} new, ${c.removed.length} gone, ${c.status.length} status, ${c.titles.length} titles)`,
    rows.length ? h('div', { class: 'scroll-x crawl-list' }, h('table', {}, h('tbody', {}, rows.map(([k, u, v]) => h('tr', {}, h('td', {}, k), h('td', { class: 'mono' }, u), h('td', { class: 'small' }, v)))))) : h('p', { class: 'muted small' }, 'Nothing changed.'))
}
