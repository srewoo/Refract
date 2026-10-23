// Real-Chrome check of serp.js (badges, SERP layout panel, domain highlight): `node serp-check.mjs [extDir]`. Needs playwright-core + Chrome.
import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
const EXT = process.argv[2] ?? '.'
const SERP = `<!doctype html><html><body style="margin:0"><div id="rcnt"><div id="search">
<div id="tads" style="height:200px"><a href="https://ad.example/"><h3>Ad title</h3></a></div>
<div><h2>AI Overview</h2><p style="height:300px">Answer <a href="https://b.com/guide">b.com</a> <span hidden><a href="https://www.wiki.org/x">wiki</a></span> <a href="https://www.google.com/goto?url=CAESx" aria-label="Search Engine Land"></a> <a href="https://www.google.com/x">g</a> <a href="/webhp?hl=en" aria-label="Go to Google Home"></a></p></div>
<div><div role="heading">People also ask</div><div style="height:250px"></div></div>
<a href="https://a.com/"><h3>First result</h3></a><div style="height:120px"></div>
<a href="https://www.b.com/page"><h3>Second result</h3></a><div style="height:120px"></div>
<a href="https://c.com/"><h3>Third</h3></a><div style="height:120px"></div>
<a href="https://www.google.com/goto?url=CAESopaque"><h3>Wrapped</h3><cite>https://www.d-site.com › Blog</cite></a></div></div></body></html>`
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const p = await b.newPage({ viewport: { width: 1280, height: 720 } })
const errs = []; p.on('pageerror', (e) => errs.push(String(e)))
await p.setContent(SERP)
await p.addScriptTag({ path: EXT + '/serp.js' })
const panel = p.locator('#sss-layout')
await panel.locator('summary').click()
const text = async () => (await panel.locator('.out').innerText()).replace(/\s+/g, ' ')
let t = await text(); console.log('no domain :', t); console.log('summary   :', await panel.locator('summary').innerText())
assert.deepEqual(await p.locator('.sss-pos').allInnerTexts(), ['1', '2', '3', '4'], 'ad excluded from numbering')
assert.match(t, /needs a scroll/); assert.match(t, /Above it: Ads, AI Overview, People also ask\./); assert.match(t, /AI Overview: shown, 3 source sites\./)
await panel.locator('input').fill('https://B.com/whatever')
t = await text(); console.log('domain b  :', t)
assert.match(t, /b\.com: #2 at /); assert.match(t, /cites you/)
assert.equal(await p.locator('a.sss-mine').count(), 1, 'only the organic b.com result outlined')
await panel.locator('input').fill('c.com'); t = await text(); console.log('domain c  :', t)
assert.match(t, /does not cite you/); assert.match(t, /c\.com: #3/)
await panel.locator('input').fill('zzz.com'); t = await text(); assert.match(t, /not in the 4 loaded results/)
await panel.locator('input').fill('d-site.com'); t = await text(); assert.match(t, /d-site\.com: #4/, 'wrapped /goto result matched via cite')
await panel.locator('input').fill('searchengineland.com'); t = await text(); assert.match(t, /cites you/, 'aria-label name match')
// observer must settle: no runaway refresh loop
const n = await p.evaluate(() => new Promise((r) => { let c = 0; const o = new MutationObserver(() => c++); o.observe(document.body, { childList: true, subtree: true }); setTimeout(() => r(c), 500) }))
assert.ok(n < 5, 'mutation loop: ' + n)
// no AI Overview / no results
await p.setContent('<div id="search"><a href="https://a.com/"><h3>Only</h3></a></div>'); await p.addScriptTag({ path: EXT + '/serp.js' })
t = (await p.locator('#sss-layout .out').textContent()); console.log('plain     :', t); assert.match(t, /Nothing above it.*AI Overview: not shown/)
assert.deepEqual(errs, []); console.log('ALL OK'); await b.close()
