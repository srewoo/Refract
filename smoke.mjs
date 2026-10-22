// Real-Chromium smoke: `node sss/smoke.mjs [screenshotDir]` from the repo root. Opens every popup view.
import { chromium } from 'playwright-core'
import { chromiumPath } from '../scripts/e2e/harness.mjs'
import { createServer } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
const OUT = process.argv[2] ?? tmpdir(), EXT = mkdtempSync(join(tmpdir(), 'sss-ext-'))
cpSync(resolve('sss'), EXT, { recursive: true })
const m = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8')); m.permissions.push('tabs'); m.host_permissions = ['<all_urls>'] // stands in for the activeTab click
writeFileSync(join(EXT, 'manifest.json'), JSON.stringify(m))
const html = `<!doctype html><html lang="en"><head><title>Example product page for SSS smoke test</title>
<meta name="description" content="A page used to check the SSS extension renders all its tabs in a real browser session.">
<meta name="viewport" content="width=device-width"><link rel="canonical" href="/p">
<meta property="og:title" content="OG title"><meta property="og:description" content="OG desc">
<link rel="alternate" hreflang="en" href="/p"><link rel="alternate" hreflang="de-DE" href="/de/p"><link rel="alternate" hreflang="english" href="/x">
<meta name="author" content="Sam Writer"><meta property="article:published_time" content="2026-09-01">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Article","headline":"x","author":{"@type":"Person","name":"Sam"}},{"@type":"Organization","name":"Ex"}]}</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ"></script>
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1234567890123456"></script></head>
<body><h1>Hello</h1><h2>What does it audit?</h2><h4>Skipped level</h4><p>${'seo audit tool chrome extension '.repeat(80)} <strong>bold claim</strong> <em>quiet aside</em></p>
<ul><li>one</li><li>two</li></ul><ins class="adsbygoogle" data-ad-client="ca-pub-1234567890123456"></ins>
<a href="/x">int</a><a href="https://example.org/a" rel="nofollow">ext</a><a href="https://example.org/b">ext2</a><a href="https://w3.org/" rel="sponsored">w3</a>
<img src="/i.png"><img src="/logo.svg" alt="Logo"><img src="/d.webp" alt=""></body></html>`
const SERP = `<!doctype html><html><head><title>q - Google Search</title></head><body><div id="search">
<a href="https://a.com/"><h3>First result</h3></a><a href="https://b.com/"><h3>10 tips second</h3></a>
<div jsname="yEVEwb" id="paa"></div></div><script>
const paa = document.getElementById('paa')
const item = (text) => { const d = document.createElement('div'); d.dataset.q = text
  const t = document.createElement('div'); t.setAttribute('role', 'button'); t.setAttribute('aria-expanded', 'false'); t.textContent = text
  t.onclick = () => { t.setAttribute('aria-expanded', 'true')
    setTimeout(() => { const a = document.createElement('a'); a.href = 'https://ans.example/' + encodeURIComponent(text); a.innerHTML = '<h3></h3>'; a.firstChild.textContent = 'Answer to ' + text; d.append(a)
      paa.append(item(text + '.1'), item(text + '.2')) }, 150) }
  d.append(t); return d }
paa.append(item('Q1'), item('Q2'))
</script></body></html>`
const srv = createServer((q, r) => { if (q.url === '/ua') { r.writeHead(200, { 'content-type': 'text/html' }); r.end(`<title>ua</title><pre id=ua>${q.headers['user-agent']}</pre>`); return }
  if (q.url === '/serp') { r.writeHead(200, { 'content-type': 'text/html' }); r.end(SERP); return }
  if (q.url === '/robots.txt') { r.end(`User-agent: *\nSitemap: http://${q.headers.host}/sitemap.xml\n\nUser-agent: GPTBot\nDisallow: /`); return }
  if (q.url === '/sitemap.xml') { r.writeHead(200, { 'content-type': 'application/xml' }); r.end(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>http://${q.headers.host}/p</loc><lastmod>2026-09-01</lastmod></url></urlset>`); return }
  // Bot's-eye fixtures: GPTBot gets a 403, ClaudeBot a CDN challenge, everyone else the page.
  const ua = q.headers['user-agent'] ?? ''
  if (q.url === '/p' && /GPTBot/.test(ua)) { r.writeHead(403); r.end('Forbidden'); return }
  if (q.url === '/p' && /ClaudeBot/.test(ua)) { r.writeHead(200, { 'content-type': 'text/html' }); r.end('<title>Just a moment...</title><div id=cf_chl_opt></div>'); return }
  if (q.url === '/llms.txt') { r.writeHead(200, { 'content-type': 'text/plain' }); r.end('# Example'); return }
  r.writeHead(q.url === '/p' ? 200 : 404, { 'content-type': 'text/html', 'x-robots-tag': 'all' }); r.end(html) }).listen(0)
const origin = `http://127.0.0.1:${srv.address().port}`
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'sss-')), { executablePath: chromiumPath(), headless: false,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--headless=new'] })
const id = await (async () => { for (let i = 0; i < 50; i++) { const p = await ctx.newPage(); await p.goto('chrome://extensions'); const ids = await p.evaluate(() => chrome.management?.getAll ? new Promise(r => chrome.management.getAll(a => r(a.map(x => x.id)))) : []); await p.close(); if (ids.length) return ids[0] } })()
const page = await ctx.newPage(); await page.goto(`${origin}/p`)
let popup = await ctx.newPage(); const errors = []
popup.on('pageerror', e => errors.push(String(e))); popup.on('console', m => m.type() === 'error' && errors.push(m.text()))
await popup.goto(`chrome-extension://${id}/popup.html`)
const tid = await popup.evaluate(async (u) => (await chrome.tabs.query({ url: u }))[0]?.id, `${origin}/p`)
await popup.goto(`chrome-extension://${id}/popup.html?tabId=${tid}`)
await popup.setViewportSize({ width: 780, height: 590 })
const nav = (v) => popup.locator(`nav [data-view="${v}"]`)
await nav('Overview').waitFor()
console.log('nav:', (await popup.locator('nav').innerText()).replace(/\s+/g, ' '))
for (const v of ['Overview', 'Issues', 'AI search', 'Content', 'On-page terms', 'On-page links', 'Images', 'Schema', 'Social', 'Hreflang', 'Speed', 'Ads & tags', 'Domain', 'Tools', 'Settings']) {
  await nav(v).click()
  if (v === 'Domain') await popup.waitForTimeout(4000)
  console.log(`${v}: ${(await popup.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 150)}`)
  await popup.screenshot({ path: `${OUT}/v-${v.replace(/\W+/g, '_')}.png` })
}
await popup.emulateMedia({ colorScheme: 'dark' }); await nav('AI search').click(); await popup.screenshot({ path: `${OUT}/dark-geo.png` }); await popup.emulateMedia({ colorScheme: 'light' })
await nav('Overview').click(); await popup.locator('.fixlist button').first().click()
console.log('fix-first jump ->', await popup.locator('nav [aria-current="true"]').innerText())

// --- Tier 1: ported rules surface in Issues with fixes
await nav('Issues').click()
console.log('issues:', (await popup.locator('.issue-list li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').slice(0, 90)).join(' || '))
await nav('Overview').click()
console.log('meta rows:', (await popup.locator('.kv').first().innerText()).replace(/\s+/g, ' ').slice(0, 220))

// --- Tier 2: bot's eye
await nav("Bot's eye").click()
await popup.getByRole('button', { name: 'Fetch as crawlers' }).click()
await popup.getByText(/^Done\./).waitFor({ timeout: 60000 })
console.log("bot's eye:", (await popup.locator('main tbody tr').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).join(' || '))
await popup.screenshot({ path: `${OUT}/v-bots.png` })
const leftover = await popup.evaluate(async () => (await chrome.declarativeNetRequest.getSessionRules()).filter((r) => r.id >= 1_900_000_000).length)
console.log('leftover lens rules:', leftover)

// --- Tier 2: overlays
await nav('Images').click(); await popup.getByRole('button', { name: 'Mark on page' }).click()
await nav('Content').click(); await popup.getByRole('button', { name: 'Label headings on page' }).click()
console.log('overlay badges:', await page.evaluate(() => [...document.querySelectorAll('[data-sss-alt],[data-sss-headings]')].map((b) => b.textContent).join(',')))
await popup.getByRole('button', { name: 'Label headings on page' }).click()
console.log('headings toggled off:', await page.evaluate(() => document.querySelectorAll('[data-sss-headings]').length === 0))

// --- Tier 2: report download
await nav('Overview').click()
const [dl] = await Promise.all([popup.waitForEvent('download'), popup.getByRole('button', { name: 'Export report' }).click()])
const reportHtml = readFileSync(await dl.path(), 'utf8')
console.log('report:', dl.suggestedFilename(), reportHtml.length, 'bytes; has crawler table:', reportHtml.includes('What crawlers receive'), '; scripts:', /<script/i.test(reportHtml))

// --- Tier 2: side panel layout + per-tab enablement
const panelPage = await ctx.newPage(); await panelPage.setViewportSize({ width: 380, height: 760 })
await panelPage.goto(`chrome-extension://${id}/popup.html?tabId=${tid}&panel=1`)
await panelPage.locator('nav [data-view="Overview"]').waitFor()
await panelPage.screenshot({ path: `${OUT}/panel.png` })
console.log('panel has side-panel button:', await panelPage.getByRole('button', { name: 'Open in side panel' }).count())
await popup.goto(`chrome-extension://${id}/popup.html?tabId=${tid}`)
await popup.getByRole('button', { name: 'Open in side panel' }).click().catch(() => {})
const sw0 = ctx.serviceWorkers()[0]
console.log('side panel options:', JSON.stringify(await sw0.evaluate(async (t) => [await chrome.sidePanel.getOptions({ tabId: t }), await chrome.sidePanel.getOptions({})], tid)))
popup = await ctx.newPage() // "Open in side panel" closes the popup by design
await popup.goto(`chrome-extension://${id}/popup.html?tabId=${tid}`)
popup.on('pageerror', e => errors.push(String(e)))
await nav('On-page links').click()
await popup.getByRole('button', { name: 'Highlight nofollow' }).click()
await page.waitForFunction(() => !!document.getElementById('sss-overlay-nofollow'))
console.log('nofollow outline:', await page.evaluate(() => getComputedStyle(document.querySelector('a[rel=nofollow]')).outlineStyle))
const sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent('serviceworker')
console.log('service worker:', sw.url().split('/').pop())

// --- View as Googlebot: popup → DNR session rule → header seen by the server
const uaPage = await ctx.newPage(); await uaPage.goto(`${origin}/ua`)
const uaTab = await popup.evaluate(async (u) => (await chrome.tabs.query({ url: u }))[0]?.id, `${origin}/ua`)
await popup.goto(`chrome-extension://${id}/popup.html?tabId=${uaTab}`)
await popup.locator('nav [data-view="Tools"]').click()
await popup.getByLabel('Request this page as').selectOption('Googlebot Smartphone')
await uaPage.waitForFunction(() => /Googlebot/.test(document.getElementById('ua')?.textContent ?? ''), null, { timeout: 10000 })
console.log('server saw UA:', (await uaPage.locator('#ua').innerText()).slice(-60))
await popup.goto(`chrome-extension://${id}/popup.html?tabId=${uaTab}`)
console.log('banner:', await popup.getByRole('status').innerText())
await popup.locator('nav [data-view="Tools"]').click()
await popup.getByLabel('Request this page as').selectOption('')
await uaPage.waitForFunction(() => !/Googlebot/.test(document.getElementById('ua')?.textContent ?? ''), null, { timeout: 10000 })
console.log('after reset UA has Googlebot:', /Googlebot/.test(await uaPage.locator('#ua').innerText()))

// --- PAA deep extraction on a fake SERP (content scripts injected manually: matches are Google-only)
const serp = await ctx.newPage(); await serp.goto(`${origin}/serp`)
await serp.addScriptTag({ path: join(EXT, 'serp.js') }); await serp.addScriptTag({ path: join(EXT, 'paa.js') })
console.log('badges:', await serp.locator('.sss-pos').allInnerTexts())
await serp.getByRole('button', { name: 'Extract People Also Ask' }).click()
await serp.getByLabel('Extraction depth').selectOption('2')
await serp.getByRole('dialog').getByRole('button', { name: 'Start' }).click()
await serp.getByRole('button', { name: 'Copy CSV' }).waitFor({ timeout: 30000 })
console.log('PAA rows:', (await serp.getByRole('dialog').locator('tr').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).join(' | '))
await serp.screenshot({ path: `${OUT}/paa.png` })

// --- Full screen tab + pop-out window + crawl (crawl runs in full screen, not the popup)
const fsPopup = await ctx.newPage(); fsPopup.on('pageerror', (e) => errors.push(String(e)))
await fsPopup.goto(`chrome-extension://${id}/popup.html?tabId=${tid}`)
await fsPopup.locator('nav [data-view="Crawl"]').click()
const [full] = await Promise.all([ctx.waitForEvent('page'), fsPopup.getByRole('button', { name: 'Open full screen to crawl' }).click()])
full.on('pageerror', (e) => errors.push(String(e)))
await full.waitForLoadState(); await full.setViewportSize({ width: 1400, height: 900 })
console.log('full screen url:', full.url().replace(/^.*popup\.html/, 'popup.html'))
await full.getByRole('button', { name: 'Start crawl' }).click()
await full.getByText(/Crawl complete|Stopped at|Complete to depth|Stopped early/).first().waitFor({ timeout: 60000 })
console.log('crawl:', (await full.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 420))
await full.screenshot({ path: `${OUT}/full-crawl.png` })
const [pop] = await Promise.all([ctx.waitForEvent('page'), full.getByRole('button', { name: 'Pop out into its own window' }).click()])
await pop.waitForLoadState(); console.log('pop-out url:', pop.url().replace(/^.*popup\.html/, 'popup.html'))

// --- Help + privacy pages
for (const doc of ['help.html', 'privacy.html']) {
  const dp = await ctx.newPage(); dp.on('pageerror', (e) => errors.push(String(e)))
  await dp.goto(`chrome-extension://${id}/${doc}`)
  console.log(`${doc}:`, await dp.locator('h1').innerText(), '·', (await dp.locator('h2').allInnerTexts()).length, 'sections')
}

// --- Chrome AI path with a stubbed LanguageModel (test Chromium ships no model). One title states a number
// that is not on the page, so the firewall must drop it.
await ctx.addInitScript(() => {
  if (!location.href.startsWith('chrome-extension://')) return
  const reply = (input) => {
    const text = typeof input === 'string' ? input : input[0].content[0].value
    if (/<title> tags/.test(text)) return { options: ['Example product page for SSS audits', 'SSS smoke test: example product page', 'Top 37 secrets of example pages'] }
    if (/meta descriptions/.test(text)) return { options: ['A page that checks the SSS extension renders every view in a real browser.', 'b', 'c'] }
    if (/alt text/.test(text)) return { alt: 'Product photo' }
    if (/JSON-LD/.test(text)) return { jsonld: JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: 'Hello', author: { '@type': 'Person', name: 'Sam Writer' } }) }
    return { text: 'Crawlers rely on this to understand the page.' }
  }
  const session = { prompt: async (input) => JSON.stringify(reply(input)), clone: async () => session, destroy() {} }
  globalThis.LanguageModel = { availability: async () => 'available', create: async () => session, params: async () => ({}) }
})
const aiPage = await ctx.newPage(); aiPage.on('pageerror', (e) => errors.push(String(e)))
await aiPage.setViewportSize({ width: 780, height: 590 })
await aiPage.goto(`chrome-extension://${id}/popup.html?tabId=${tid}`)
await aiPage.getByRole('button', { name: 'Suggest titles' }).click()
await aiPage.locator('.suggest li').first().waitFor()
console.log('AI titles:', (await aiPage.locator('.suggest li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).join(' | '), '·', await aiPage.getByText(/dropped for stating numbers/).innerText())
await aiPage.locator('nav [data-view="Schema"]').click()
await aiPage.getByRole('button', { name: 'Draft JSON-LD' }).click()
console.log('AI JSON-LD:', (await aiPage.locator('pre.code-block').innerText()).replace(/\s+/g, ' ').slice(0, 160))
await aiPage.locator('nav [data-view="Issues"]').click()
await aiPage.getByRole('button', { name: 'Explain' }).first().click()
console.log('AI explain:', await aiPage.locator('.ai-text').first().innerText())
await aiPage.locator('nav [data-view="Settings"]').click()
console.log('AI setting:', (await aiPage.locator('.setting').last().innerText()).replace(/\s+/g, ' ').slice(0, 80))
await aiPage.locator('nav [data-view="Overview"]').click(); await aiPage.screenshot({ path: `${OUT}/ai-overview.png` })
console.log('errors:', errors)
await ctx.close(); srv.close()
