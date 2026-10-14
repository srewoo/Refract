// Shell for every surface: popup, per-tab side panel (?panel=1) and full screen tab/window (?full=1).
// Collects page data once, then renders one view at a time beside a counted nav.
import { aiStatus } from './ai.js'
import { band, health } from './geo.js'
import { currentAgent, setAgent } from './ua.js'
import { probeGlobals, probeSite } from './probe.js'
import { h, ring, btn } from './ui.js'
import { BotsEye } from './views-bots.js'
import { Crawl } from './views-crawl.js'
import { Backlinks, Rankings } from './views-data.js'
import { Compare } from './views-compare.js'
import { Local, Redirects } from './views-extra.js'
import { History } from './views-history.js'
import { Bing, SearchConsole } from './views-webmaster.js'
import { saveSnapshot } from './history.js'
import * as page from './views-page.js'
import * as site from './views-site.js'

// Grouped so ~25 sections stay scannable: what's on the page, how crawlers see it, the whole site, and your workflow.
const GROUPS = {
  Page: { Overview: page.Overview, Issues: page.Issues, 'AI search': page.GEO, Content: page.Content, Keywords: page.Keywords, Links: site.Links, Images: site.Images, Schema: site.Schema, Social: site.Social, Hreflang: site.Hreflang, 'Local SEO': Local, Speed: page.Speed },
  Crawlers: { "Bot's eye": BotsEye, 'Redirects & headers': Redirects },
  Site: { 'Search Console': SearchConsole, 'Bing Webmaster': Bing, Crawl, Rankings, Backlinks, Domain: site.Domain, 'Ads & tags': site.Tags },
  Workflow: { History, Compare, Tools: site.Tools, Settings: site.Settings },
}
const VIEWS = Object.assign({}, ...Object.values(GROUPS))

async function main() {
  const view = document.getElementById('view')
  const nav = document.getElementById('nav')
  const params = new URLSearchParams(location.search)
  const mode = params.has('panel') ? 'panel' : params.has('full') ? 'full' : 'popup'
  document.documentElement.classList.add(mode)
  const qs = params.get('tabId') // set by side panel / full screen paths and the e2e tests
  const tab = qs ? await chrome.tabs.get(Number(qs)) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0]

  let current = params.get('view') ?? 'Overview'
  const surfaceUrl = (v, extra) => `popup.html?tabId=${tab.id}&${extra}${v ? `&view=${encodeURIComponent(v)}` : ''}`
  const openFull = (v) => { chrome.tabs.create({ url: surfaceUrl(v ?? current, 'full=1'), index: tab.index + 1 }); if (mode === 'popup') window.close() }
  const popOut = () => { chrome.windows.create({ url: surfaceUrl(current, 'full=1'), type: 'popup', width: 1200, height: 860 }); if (mode === 'popup') window.close() }
  document.getElementById('winbar').replaceChildren(
    mode !== 'full' ? h('button', { type: 'button', class: 'icon-btn', title: 'Open full screen in a new tab', 'aria-label': 'Open full screen in a new tab', onclick: () => openFull() }, '⤢', h('span', {}, 'Full screen')) : '',
    h('button', { type: 'button', class: 'icon-btn', title: 'Pop out into its own window', 'aria-label': 'Pop out into its own window', onclick: popOut }, '⧉', h('span', {}, 'Pop out')))

  // Panel and full screen outlive navigation: re-audit when the inspected tab loads a new page (not mid-crawl).
  if (mode !== 'popup') chrome.tabs.onUpdated.addListener((id, info) => { if (id === tab.id && info.status === 'complete' && !document.body.dataset.busy) location.reload() })

  let data
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['collect.js'] })
    data = res?.result
    if (!data) throw new Error('The page returned no data.')
    const target = { tabId: tab.id }
    const [probe, globals, agent, ai] = await Promise.all([
      chrome.scripting.executeScript({ target, func: probeSite, args: [data.url, data.canonical, data.robotsTxt] }).then(([r]) => r?.result, () => null),
      chrome.scripting.executeScript({ target, world: 'MAIN', func: probeGlobals }).then(([r]) => r?.result, () => ({})),
      currentAgent(tab.id),
      aiStatus(),
    ])
    Object.assign(data, { tabId: tab.id, agent, probe, globals, ai, titlePx: titleWidth(data.title) })
  } catch (e) {
    view.replaceChildren(h('div', { class: 'empty' }, h('b', {}, 'This page can’t be analysed.'),
      h('p', {}, 'Chrome blocks extensions on browser pages, the Web Store and the PDF viewer. Open a normal web page and click Refract SEO again.'), h('p', { class: 'muted mono small' }, String(e.message ?? e))))
    return
  }

  const hl = health(data)
  const siteEl = document.getElementById('site')
  siteEl.replaceChildren(
    h('img', { src: data.favicon, alt: '', width: 16, height: 16, onerror: (e) => { e.target.style.visibility = 'hidden' } }),
    h('span', { class: 'mono', title: data.url }, data.host),
    ring(hl.score, band(hl.score).status, { size: 34, label: 'Health' }))
  if (mode === 'popup') siteEl.after(h('div', { class: 'rail-actions' }, btn('Open in side panel', async () => {
    // Per-tab only (never a global panel): enable for this tab, open inside the click, then close the popup.
    await chrome.sidePanel.setOptions({ tabId: tab.id, path: surfaceUrl(null, 'panel=1'), enabled: true })
    await chrome.sidePanel.open({ tabId: tab.id })
    window.close()
  })))
  if (data.agent) siteEl.after(h('div', { class: 'banner', role: 'status' }, `Viewing as ${data.agent}`, h('button', { class: 'btn', type: 'button', onclick: () => setAgent(tab.id, null).then(() => mode === 'popup' ? window.close() : location.reload()) }, 'Back to normal')))
  document.getElementById('docs').replaceChildren(h('a', { href: 'help.html', target: '_blank' }, 'Help'), h('a', { href: 'privacy.html', target: '_blank' }, 'Privacy'))

  const go = (name) => {
    current = name
    nav.querySelectorAll('button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.view === name)))
    view.replaceChildren(...[VIEWS[name].render(data, { go, views: Object.keys(VIEWS), mode, openFull })].flat(Infinity).filter((x) => x != null && x !== ''))
    view.scrollTop = 0
  }
  nav.append(...Object.entries(GROUPS).flatMap(([group, views]) => [h('div', { class: 'nav-group', role: 'presentation' }, group), ...Object.entries(views).map(([name, v]) => {
    const n = v.count?.(data)
    return h('button', { type: 'button', 'data-view': name, onclick: () => go(name) }, h('span', {}, name), n ? h('span', { class: 'count', title: `${n} to look at` }, n) : '')
  })]))
  saveSnapshot(data).catch(() => {}) // change tracking; never blocks the audit
  nav.addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return
    const items = [...nav.querySelectorAll('button')]
    const i = items.indexOf(document.activeElement) + (e.key === 'ArrowDown' ? 1 : -1)
    items[(i + items.length) % items.length]?.focus()
    e.preventDefault()
  })
  const { startView } = await chrome.storage.sync.get(site.DEFAULTS)
  const want = params.get('view') ?? startView
  go(VIEWS[want] ? want : 'Overview')
}

/** Title width in Google's desktop SERP face (Arial 20px). null for scripts we have no metrics for (Refract §9.9). */
function titleWidth(title) {
  if (!title || /[^\u0000-\u024F\u1E00-\u1EFF\u2000-\u206F\u20A0-\u20CF]/.test(title)) return null
  const ctx = document.createElement('canvas').getContext('2d')
  ctx.font = '400 20px Arial, Helvetica, sans-serif'
  return Math.round(ctx.measureText(title).width)
}
main()
