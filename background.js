// Right-click menu: open the current site in SEO tools, duplicate-content checks, nofollow highlighting.
import { registrableDomain } from './analyze.js'
import { highlightNofollow } from './page-actions.js'
import { LENS_RULE_BASE } from './lens.js'

const SITE = {
  ahrefs: ['Ahrefs', (d) => `https://ahrefs.com/backlink-checker/?input=${d}`],
  semrush: ['Semrush', (d) => `https://www.semrush.com/analytics/overview/?q=${d}`],
  similarweb: ['SimilarWeb', (d) => `https://www.similarweb.com/website/${d}/`],
  majestic: ['Majestic', (d) => `https://majestic.com/reports/site-explorer?q=${d}`],
  moz: ['Moz', (d) => `https://moz.com/domain-analysis?site=${d}`],
  wayback: ['Archive.org', (d) => `https://web.archive.org/web/*/${d}`],
  site: ['Google site: search', (d) => `https://www.google.com/search?q=site:${d}`],
  http: ['Google site: -inurl:https (HTTP pages)', (d) => `https://www.google.com/search?q=site:${d}+-inurl:https`],
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'sss', title: 'Refract SEO', contexts: ['page', 'link', 'selection'] })
    for (const [id, [label]] of Object.entries(SITE)) chrome.contextMenus.create({ id: `site:${id}`, parentId: 'sss', title: `View site in ${label}`, contexts: ['page', 'link'] })
    chrome.contextMenus.create({ id: 'nofollow', parentId: 'sss', title: 'Highlight nofollow links', contexts: ['page', 'link'] })
    chrome.contextMenus.create({ id: 'dup:web', parentId: 'sss', title: 'Check duplicates of “%s” across the web', contexts: ['selection'] })
    chrome.contextMenus.create({ id: 'dup:site', parentId: 'sss', title: 'Check duplicates of “%s” on this site', contexts: ['selection'] })
  })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const host = new URL(info.pageUrl ?? tab.url).hostname
  const d = encodeURIComponent(registrableDomain(host))
  const q = (s) => `https://www.google.com/search?q=${encodeURIComponent(s)}`
  const [kind, key] = String(info.menuItemId).split(':')
  if (kind === 'site') chrome.tabs.create({ url: SITE[key][1](d), index: tab.index + 1 })
  else if (kind === 'dup') chrome.tabs.create({ url: q(`"${info.selectionText.trim()}"${key === 'site' ? ` site:${host}` : ` -site:${host}`}`), index: tab.index + 1 })
  else if (kind === 'nofollow') chrome.scripting.executeScript({ target: { tabId: tab.id }, func: highlightNofollow })
})

// Drop the tab's User-Agent override when the tab closes (rule id === tab id, see ua.js).
chrome.tabs.onRemoved.addListener((tabId) => chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tabId] }))

// Side panel: never global. Off everywhere at worker start; the popup enables it per tab on request.
chrome.sidePanel.setOptions({ enabled: false })
chrome.tabs.onRemoved.addListener((tabId) => chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(() => {}))
// A tab dragged to another window keeps its id; re-apply its panel so it isn't lost.
chrome.tabs.onAttached.addListener(async (tabId) => {
  const o = await chrome.sidePanel.getOptions({ tabId })
  if (o.enabled && o.path) chrome.sidePanel.setOptions({ tabId, path: o.path, enabled: true })
})

// A crashed lens run must not leave a UA-rewriting rule installed browser-wide (Refract ua.ts reconcile()).
chrome.declarativeNetRequest.getSessionRules().then((rules) => {
  const stale = rules.filter((r) => r.id >= LENS_RULE_BASE).map((r) => r.id)
  if (stale.length) chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: stale })
})
