// Real-Chromium smoke for data sources, history, compare, redirects, local SEO and JS-rendered crawl.
// `node sss/smoke-data.mjs [screenshotDir]` from the repo root. Provider APIs are intercepted with fixtures:
// no real keys, no credit spent.
import { chromium } from 'playwright-core'
import { chromiumPath } from '../scripts/e2e/harness.mjs'
import { createServer } from 'node:http'
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const OUT = process.argv[2] ?? tmpdir(), EXT = mkdtempSync(join(tmpdir(), 'pl-ext-'))
cpSync(resolve('sss'), EXT, { recursive: true })
const m = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'))
m.permissions.push('tabs', 'webRequest', 'identity'); m.host_permissions = ['<all_urls>'] // stands in for the click-time grants
writeFileSync(join(EXT, 'manifest.json'), JSON.stringify(m))

const page = (body, head = '') => `<!doctype html><html lang="en"><head><title>Smile Co dental clinic in Austin, Texas</title><meta name="description" content="Family dentist in Austin offering cleanings, fillings and whitening. Book online or call us today.">${head}</head><body>${body}</body></html>`
const P = page(`<h1>Smile Co</h1><h2>Services</h2><p>${'gentle dental care cleanings whitening '.repeat(60)}</p>
<a href="tel:+15551234567">Call us</a><address>1 Main St, Austin, TX</address><a href="/spa">App page</a><a href="/about">About</a>`,
`<script type="application/ld+json">{"@context":"https://schema.org","@type":"Dentist","name":"Smile Co","telephone":"+1 555 999 0000","address":{"streetAddress":"1 Main St","addressLocality":"Austin"}}</script>`)
const SPA = page('<div id="app"></div><script>document.getElementById("app").innerHTML = "<h1>Rendered</h1><p>" + "client side words ".repeat(120) + "</p>"</script>')
const COMP = page(`<h1>Rival dental</h1><p>${'teeth whitening austin dentist implants '.repeat(80)}</p>`).replace('Smile Co dental clinic', 'Rival Dental')
const srv = createServer((q, r) => {
  const html = (b, s = 200) => { r.writeHead(s, { 'content-type': 'text/html' }); r.end(b) }
  if (q.url === '/r1') { r.writeHead(302, { location: '/r2' }); r.end(); return }
  if (q.url === '/r2') { r.writeHead(301, { location: '/p' }); r.end(); return }
  if (q.url === '/robots.txt') { r.end('User-agent: *\nAllow: /'); return }
  if (q.url === '/p') return html(P)
  if (q.url === '/spa') return html(SPA)
  if (q.url === '/about') return html(page('<h1>About</h1><a href="tel:+15551234567">Call</a>'))
  if (q.url === '/comp') return html(COMP)
  html('nf', 404)
}).listen(0)
const origin = `http://127.0.0.1:${srv.address().port}`

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'pl-')), { executablePath: chromiumPath(), headless: false, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--headless=new'] })
const sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent('serviceworker')
const id = sw.url().split('/')[2]

// ---- provider API fixtures
const calls = []
await ctx.route('https://chromeuxreport.googleapis.com/**', (route) => {
  const body = route.request().postDataJSON(); calls.push(`crux:${route.request().url().split(':').pop()}:${body.url ? 'url' : 'origin'}`)
  if (/History/.test(route.request().url())) return route.fulfill({ json: { record: { collectionPeriods: [1, 2, 3].map((d) => ({ lastDate: { year: 2026, month: 9, day: d * 7 } })), metrics: { largest_contentful_paint: { percentilesTimeseries: { p75s: [2400, 2600, 2300] } }, interaction_to_next_paint: { percentilesTimeseries: { p75s: [180, 220, 190] } }, cumulative_layout_shift: { percentilesTimeseries: { p75s: ['0.05', '0.08', '0.12'] } } } } } })
  if (body.url) return route.fulfill({ status: 404, json: { error: { message: 'not found' } } }) // URL-level: not enough data
  return route.fulfill({ json: { record: { collectionPeriod: { firstDate: { year: 2026, month: 9, day: 1 }, lastDate: { year: 2026, month: 9, day: 28 } }, metrics: {
    largest_contentful_paint: { histogram: [{ density: 0.81 }, { density: 0.12 }, { density: 0.07 }], percentiles: { p75: 2210 } },
    interaction_to_next_paint: { histogram: [{ density: 0.7 }, { density: 0.2 }, { density: 0.1 }], percentiles: { p75: 240 } },
    cumulative_layout_shift: { histogram: [{ density: 0.95 }, { density: 0.03 }, { density: 0.02 }], percentiles: { p75: '0.03' } } } } } })
})
const dfsOk = (result) => ({ json: { status_code: 20000, status_message: 'Ok.', cost: 0.01, tasks: [{ id: 't', status_code: 20000, status_message: 'Ok.', result }] } })
await ctx.route('https://api.dataforseo.com/**', (route) => {
  const u = route.request().url(); calls.push(`dfs:${u.replace('https://api.dataforseo.com', '')}`)
  if (!/^Basic /.test(route.request().headers().authorization ?? '')) return route.fulfill({ status: 401, body: '' })
  if (u.endsWith('/appendix/user_data')) return route.fulfill(dfsOk([{ money: { balance: 42.5 } }]))
  if (u.includes('/serp/')) { const kw = route.request().postDataJSON()[0].keyword; return route.fulfill(dfsOk([{ items: [{ type: 'organic', rank_group: 1, domain: 'other.com' }, ...(kw.includes('dental') ? [{ type: 'organic', rank_group: 4, domain: '127.0.0.1', url: `${origin}/p` }] : [])] }])) }
  if (u.includes('search_volume')) return route.fulfill(dfsOk(route.request().postDataJSON()[0].keywords.map((k, i) => ({ keyword: k, search_volume: 1000 - i * 100, cpc: 2.5 }))))
  if (u.includes('keyword_difficulty')) return route.fulfill(dfsOk([{ items: route.request().postDataJSON()[0].keywords.map((k, i) => ({ keyword: k, keyword_difficulty: 20 + i * 15 })) }]))
  return route.fulfill({ status: 404, body: '' })
})
await ctx.route('https://api.ahrefs.com/**', (route) => {
  const u = route.request().url(); calls.push(`ahrefs:${new URL(u).pathname}`)
  if (u.includes('limits-and-usage')) return route.fulfill({ json: { limits_and_usage: { units_usage_api_key: 1200, units_limit_api_key: 50000 } } })
  if (u.includes('domain-rating')) return route.fulfill({ json: { domain_rating: { domain_rating: 37 } } })
  if (u.includes('backlinks-stats')) return route.fulfill({ json: { metrics: { live: 1520, live_refdomains: 210 } } })
  if (u.includes('refdomains')) return route.fulfill({ json: { refdomains: [{ domain: 'news.example', domain_rating: 80, links_to_target: 40 }, { domain: 'blog.example', domain_rating: 55, links_to_target: 12 }] } })
  return route.fulfill({ status: 404, json: {} })
})

// chrome.identity.getAuthToken needs a real signed-in Chrome profile; stub it in extension pages only.
await ctx.addInitScript(() => {
  if (location.protocol !== 'chrome-extension:' || !globalThis.chrome?.identity) return
  chrome.identity.getAuthToken = async () => ({ token: 'test-token' })
  chrome.identity.removeCachedAuthToken = async () => { globalThis.__removed = true }
})
const errors = []
const target = await ctx.newPage(); await target.goto(`${origin}/p`)
const ui = await ctx.newPage(); ui.on('pageerror', (e) => errors.push(String(e)))
await ui.goto(`chrome-extension://${id}/popup.html`)
const tid = await ui.evaluate(async (u) => (await chrome.tabs.query({ url: u }))[0]?.id, `${origin}/p`)
// Seed an older snapshot so History has something to diff against.
await ui.evaluate(async (k) => chrome.storage.local.set({ [k]: [{ at: '2026-09-01T10:00:00.000Z', health: 40, ai: 50, status: 200, indexable: true, title: 'Old title', description: '', canonical: '', robots: '', xRobots: '', h1: 'Smile Co', headings: 1, words: 100, internal: 1, external: 0, nofollow: 0, images: 0, noAlt: 0, schema: '', ogTitle: '', ogImage: '', hreflang: 0, stack: 'No framework detected', lcp: null, cls: null, issues: ['old.issue'], issueText: { 'old.issue': 'An issue that was fixed' } }] }), `hist:${origin}/p`)
await ui.goto(`chrome-extension://${id}/popup.html?tabId=${tid}&full=1`)
await ui.setViewportSize({ width: 1300, height: 900 })
const nav = (v) => ui.locator(`nav [data-view="${v}"]`)
await nav('Overview').waitFor()
console.log('nav groups:', (await ui.locator('.nav-group').allInnerTexts()).join(' / '))

// Settings › Connectors: connect CrUX, DataForSEO and Ahrefs through their cards; route backlinks to Ahrefs
await nav('Settings').click()
const card = (name) => ui.locator('.conn', { has: ui.locator('.conn-name', { hasText: name }) })
const connectKey = async (name, values, ok) => {
  await card(name).getByRole('button', { name: 'Connect' }).click()
  for (const [i, v] of values.entries()) await card(name).locator('input').nth(i).fill(v)
  await card(name).getByRole('button', { name: 'Save & test' }).click()
  await card(name).getByText(ok).waitFor()
}
console.log('connectors:', (await ui.locator('.conn-name').allInnerTexts()).join(' | '))
await connectKey('Chrome UX Report', ['test-crux-key'], /✓/)
await connectKey('DataForSEO', ['login', 'pw'], /Balance/)
await connectKey('Ahrefs', ['ahrefs-key'], /API units used/)
await card('Routing').locator('select').nth(2).selectOption('ahrefs')
console.log('dfs card:', (await card('DataForSEO').innerText()).replace(/\s+/g, ' ').slice(0, 220))
await ui.screenshot({ path: `${OUT}/d-connectors.png`, fullPage: true })

await nav('Speed').click()
await ui.getByText('Whole site (origin)').waitFor()
await ui.locator('.crux-m').first().waitFor()
console.log('crux:', (await ui.locator('.block', { hasText: 'Field data' }).first().innerText()).replace(/\s+/g, ' ').slice(0, 260))
await ui.screenshot({ path: `${OUT}/d-speed.png`, fullPage: false })

await nav('Keywords').click()
await ui.getByRole('button', { name: 'Get volume & difficulty' }).click()
await ui.getByText(/DataForSEO · United States/).waitFor()
console.log('keyword metrics rows:', await ui.locator('.block', { hasText: 'Search demand' }).locator('tbody tr').count())

await nav('Rankings').click()
await ui.locator('textarea').fill('dental care austin\nwhitening\n')
await ui.getByRole('button', { name: 'Check positions now' }).click()
await ui.getByText(/Checked 2 keywords/).waitFor()
console.log('ranks:', (await ui.locator('main tbody tr').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).join(' || '))

await nav('Backlinks').click()
await ui.getByRole('button', { name: 'Fetch backlinks' }).click()
await ui.getByText(/Ahrefs · fetched/).waitFor()
console.log('backlinks:', (await ui.locator('.stats-row').innerText()).replace(/\s+/g, ' '))

await nav('History').click()
await ui.getByText('Compare latest with').waitFor()
console.log('history:', (await ui.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 400))
await ui.screenshot({ path: `${OUT}/d-history.png` })

await nav('Local SEO').click()
console.log('local:', (await ui.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 300))

await nav('Redirects & headers').click()
await ui.locator('input.url-input').fill(`${origin}/r1`)
await ui.getByRole('button', { name: 'Trace' }).click()
await ui.locator('ol.hops li').nth(2).waitFor({ timeout: 15000 })
console.log('redirects:', (await ui.locator('ol.hops > li .hop-h').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).join(' → '), '|', (await ui.locator('main ul.checks').first().innerText()).replace(/\s+/g, ' '))
await ui.screenshot({ path: `${OUT}/d-redirects.png` })

await nav('Compare').click()
await ui.locator('input.url-input').first().fill(`${origin}/comp`)
const tabsBefore = (await ui.evaluate(() => chrome.tabs.query({}))).length
await ui.locator('main').getByRole('button', { name: 'Compare' }).click()
await ui.locator('table.compare').waitFor({ timeout: 40000 })
console.log('compare:', (await ui.locator('table.compare tbody tr').first().innerText()).replace(/\s+/g, ' '), '| gaps:', (await ui.locator('.block', { hasText: 'Competitors use' }).innerText()).replace(/\s+/g, ' ').slice(0, 120))
console.log('worker tab closed:', (await ui.evaluate(() => chrome.tabs.query({}))).length === tabsBefore)
await ui.screenshot({ path: `${OUT}/d-compare.png` })

await nav('Crawl').click()
await ui.locator('label.setting', { hasText: 'Render JavaScript' }).locator('input').check()
await ui.getByRole('button', { name: 'Start crawl' }).click()
await ui.getByText(/Crawl complete|Stopped/).first().waitFor({ timeout: 120000 })
console.log('crawl JS:', (await ui.locator('.block', { hasText: 'Content that needs JavaScript' }).innerText().catch(() => 'missing')).replace(/\s+/g, ' ').slice(0, 160))
console.log('crawl phones:', (await ui.locator('.block', { hasText: 'Phone numbers' }).innerText().catch(() => 'missing')).replace(/\s+/g, ' ').slice(0, 120))


// ---- Search Console (Google sign-in itself can't run headless: seed a session token, intercept the APIs)
await ctx.route('https://www.googleapis.com/webmasters/v3/**', (route) => {
  const u = route.request().url(); calls.push(`gsc:${u.includes('searchAnalytics') ? 'searchAnalytics' : 'sites'}`)
  if (route.request().headers().authorization !== 'Bearer test-token') return route.fulfill({ status: 401, json: {} })
  if (u.endsWith('/sites')) return route.fulfill({ json: { siteEntry: [{ siteUrl: `${origin}/`, permissionLevel: 'siteOwner' }] } })
  const b = route.request().postDataJSON()
  if (b.dimensions[0] === 'date') return route.fulfill({ json: { rows: [1, 2, 3, 4].map((i) => ({ keys: [`2026-10-0${i}`], clicks: i * 3, impressions: i * 40, position: 5 + i })) } })
  return route.fulfill({ json: { rows: [{ keys: ['austin dentist'], clicks: 20, impressions: 300, ctr: 0.067, position: 4.2 }] } })
})
await ctx.route('https://searchconsole.googleapis.com/**', (route) => { calls.push('gsc:inspect'); route.fulfill({ json: { inspectionResult: { indexStatusResult: { verdict: 'PASS', coverageState: 'Submitted and indexed', indexingState: 'INDEXING_ALLOWED', robotsTxtState: 'ALLOWED', pageFetchState: 'SUCCESSFUL', lastCrawlTime: '2026-10-10T08:00:00Z', crawledAs: 'MOBILE', googleCanonical: `${origin}/p/`, userCanonical: `${origin}/p` } } } }) })
await nav('Settings').click()
console.log('gsc card:', (await card('Google Search Console').innerText()).replace(/\s+/g, ' ').slice(0, 160))
await nav('Search Console').click()
await ui.locator('.notice').first().waitFor()
console.log('gsc notice:', (await ui.locator('.notice').first().innerText()).slice(0, 90))
await ui.getByRole('button', { name: 'Inspect' }).click()
await ui.getByText('Submitted and indexed').waitFor({ timeout: 15000 })
console.log('gsc:', (await ui.locator('main').innerText()).replace(/\s+/g, ' ').replace(/^.*?Property/, 'Property').slice(0, 520))
await ui.screenshot({ path: `${OUT}/d-gsc.png` })
await ui.locator('main').getByRole('button', { name: 'Disconnect' }).click()
console.log('gsc disconnect cleared cached token:', await ui.evaluate(() => globalThis.__removed === true))

// ---- Bing Webmaster
await ctx.route('https://ssl.bing.com/**', (route) => {
  const m = new URL(route.request().url()).pathname.split('/').pop(); calls.push(`bing:${m}`)
  const site = `${origin}/`
  const day = (d) => `/Date(${Date.parse(`2026-10-0${d}`)})/`
  const body = { GetUserSites: [{ Url: site, IsVerified: true }], GetQueryStats: [{ Query: 'smile co', Clicks: 5, Impressions: 50, AvgImpressionPosition: 3, Date: day(1) }],
    GetPageStats: [{ Query: `${origin}/p`, Clicks: 4, Impressions: 60, AvgImpressionPosition: 6, Date: day(1) }, { Query: `${origin}/p`, Clicks: 2, Impressions: 20, AvgImpressionPosition: 2, Date: day(8) }],
    GetUrlLinks: { Details: [{ Url: 'https://news.example/story', AnchorText: 'Smile Co' }], TotalPages: 1 } }[m]
  return route.fulfill({ json: { d: body } })
})
await nav('Settings').click()
await connectKey('Bing Webmaster Tools', ['bing-key'], /site\(s\) in this account/)
await nav('Bing Webmaster').click()
await ui.getByText('Inbound links to this page').waitFor({ timeout: 15000 })
console.log('bing:', (await ui.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 360))
console.log('api calls:', [...new Set(calls)].join(', '))
console.log('errors:', errors)
await ctx.close(); srv.close()
