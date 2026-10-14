// Self-check: `node sss/test.mjs` (uses jsdom from the parent repo's node_modules).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { robotsAllows, geo, health, outline, schemaTree, topDomains, imageFormats, placement } from './geo.js'
import { rules, directives, perBotNoindex, hasPath, stack } from './rules.js'
import { classify } from './lens.js'
import { crawl, analyseCrawl, normalise, sitemapUrls } from './crawl.js'
import { checkNumbers, sanitise, aiStatus } from './ai.js'
import { parseRecord, parseHistory } from './crux.js'
import { dfsResult, parseDfsSerp, parseSemrush } from './providers.js'
import { providerFor } from './keys.js'
import { snapshot, diffSnapshots, diffCrawls } from './history.js'
import { analyseChain } from './redirects.js'
import { analyseLocal, localIssues, phoneKey } from './local.js'
import { phoneVariants } from './crawl.js'
import { compareRows, phraseGaps } from './views-compare.js'
import { pickProperty, summarise } from './gsc.js'
import { pickSite, rollup, bingDate } from './bing.js'
import { buildReport } from './report.js'
import { density, issues, linkStats, registrableDomain, sitemapsFrom, toCsv } from './analyze.js'

const html = `<!doctype html><html lang="en"><head><title>Best running shoes 2026</title>
<meta name="description" content="Short">
<link rel="canonical" href="https://shop.example.co.uk/shoes">
<meta property="og:title" content="Shoes"><meta name="twitter:card" content="summary">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","offers":{"@type":"Offer"}}</script>
<script type="application/ld+json">{broken</script>
</head><body><h1>Running shoes</h1><h2>Road</h2><h2></h2>
<p>running shoes are great. running shoes for road. trail running shoes too.</p>
<a href="/a">A</a><a href="/a" rel="nofollow">A again</a><a href="https://other.com/x" rel="sponsored ugc" title="t">X</a><a href="mailto:x@y.z">mail</a>
<img src="/1.png"><img src="/2.png" alt=""><img src="/3.png" alt="shoe" title="t">
<div itemscope itemtype="https://schema.org/Review"></div></body></html>`

const dom = new JSDOM(html, { url: 'https://shop.example.co.uk/shoes', runScripts: 'outside-only' })
const d = structuredClone(await dom.window.eval(readFileSync(new URL('./collect.js', import.meta.url), 'utf8'))) // mirrors executeScript's serialization

assert.equal(d.title, 'Best running shoes 2026')
assert.equal(d.canonicalSelf, true)
assert.deepEqual(d.headings.map((h) => h.level), [1, 2, 2])
assert.equal(d.links.length, 3, 'mailto dropped')
assert.deepEqual(linkStats(d.links), { total: 3, unique: 2, internal: 2, external: 1, nofollow: 1, sponsored: 1, ugc: 1, noTitle: 2 })
assert.equal(d.images.filter((i) => i.alt === null).length, 1)
assert.deepEqual(d.schema.types, ['Product', 'Offer'])
assert.deepEqual(d.schema.microdata, ['https://schema.org/Review'])
assert.equal(d.schema.jsonLd[1].ok, false)
assert.equal(d.social['twitter:card'], 'summary')

const msgs = issues(d).map((i) => i.msg).join('|')
assert.match(msgs, /Description is 5 chars/)
assert.match(msgs, /Invalid JSON-LD/)
assert.match(msgs, /1 image\(s\) missing alt/)
assert.doesNotMatch(msgs, /No H1/)

assert.deepEqual(density(['running', 'shoes', 'the', 'running', 'shoes', 'x'], 2)[0], { term: 'running shoes', count: 2, pct: 33.33 })
assert.equal(density(['the', 'the', 'the'], 1).length, 0, 'stop words dropped')
assert.equal(registrableDomain('www.shop.example.co.uk'), 'example.co.uk')
assert.equal(registrableDomain('blog.example.com'), 'example.com')
assert.equal(registrableDomain('example.io'), 'example.io')
assert.equal(registrableDomain('127.0.0.1'), '127.0.0.1')
assert.deepEqual(sitemapsFrom('User-agent: *\nSitemap: https://a.com/s.xml\r\nsitemap:  https://a.com/2.xml'), ['https://a.com/s.xml', 'https://a.com/2.xml'])
assert.equal(toCsv([{ a: 'x,y', b: 'q"z', c: null }]), 'a,b,c\n"x,y","q""z",')

// robots.txt matching (RFC 9309): specific group beats *, longest path wins, Allow wins ties
const robots = 'User-agent: *\nDisallow: /private\n\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow: /\nAllow: /blog\n'
assert.equal(robotsAllows(robots, 'GPTBot', '/x'), false)
assert.equal(robotsAllows(robots, 'ClaudeBot', '/blog/post'), true)
assert.equal(robotsAllows(robots, 'ClaudeBot', '/shop'), false)
assert.equal(robotsAllows(robots, 'PerplexityBot', '/private/a'), false)
assert.equal(robotsAllows(robots, 'PerplexityBot', '/public'), true)
assert.equal(robotsAllows('User-agent: *\nDisallow: /*.pdf$', 'x', '/a.pdf'), false)
assert.equal(robotsAllows('User-agent: *\nDisallow: /*.pdf$', 'x', '/a.pdfx'), true)
assert.equal(robotsAllows(null, 'GPTBot', '/'), true)
const withSitemap = 'User-agent: *\nSitemap: https://a.com/s.xml\n\nUser-agent: GPTBot\nDisallow: /'
assert.equal(robotsAllows(withSitemap, 'ClaudeBot', '/'), true, 'Sitemap line must not merge * with the GPTBot group')
assert.equal(robotsAllows(withSitemap, 'GPTBot', '/'), false)
assert.equal(robotsAllows('User-agent: a\nUser-agent: b\nDisallow: /', 'b', '/'), false, 'consecutive agents share a group')

const o = outline([{ level: 1, text: 'a' }, { level: 2, text: 'b' }, { level: 4, text: 'c' }, { level: 2, text: 'd' }])
assert.deepEqual(o.skips, [2])
assert.deepEqual(schemaTree([{ ok: true, data: { '@graph': [{ '@type': 'Article', author: { '@type': 'Person' } }] } }]).map((n) => `${n.depth}:${n.type}`), ['0:Article', '1:Person'])
assert.deepEqual(topDomains([{ internal: false, href: 'https://www.a.com/1' }, { internal: false, href: 'https://a.com/2' }, { internal: true, href: '/x' }]), [{ label: 'a.com', value: 2 }])
assert.deepEqual(imageFormats([{ src: 'https://x/a.JPEG?w=1' }, { src: 'data:image/svg+xml;base64,x' }, { src: 'https://x/b.jpg' }]).map((f) => `${f.label}:${f.value}`), ['jpg:2', 'svg+xml:1'])
assert.deepEqual(placement('running shoes', d), { title: true, description: false, h1: true })

const g = geo({ ...d, robotsTxt: robots, llmsTxt: false, rawTextChars: 50, renderedTextChars: 100, structure: { lists: 0, tables: 0, questionHeadings: 0, published: null } })
assert.equal(g.bots.find((b) => b.name === 'GPTBot').allowed, false)
assert.equal(g.ssrRatio, 0.5)
assert.ok(g.score > 0 && g.score < 100)
const hl = health(d)
assert.equal(hl.list[0].level, 'bad', 'critical issues sort first')
assert.ok(hl.list.every((i) => i.section), 'every issue names its section')

// ---- ported Refract rules
const ids = (x) => rules(x).map((r) => r.id)
const base = { ...d, rawMeta: { title: d.title, description: d.description, canonical: '/shoes', robots: null }, probe: null, titlePx: 300 }
assert.ok(rules(base).every((r) => r.id && r.level && r.section && r.msg), 'every rule result is complete')
assert.ok(ids({ ...base, rawMeta: { ...base.rawMeta, title: '' } }).includes('title.js_injected'))
assert.ok(ids({ ...base, rawMeta: { ...base.rawMeta, robots: 'noindex' } }).includes('robots.js_changed'))
assert.ok(ids({ ...base, titlePx: 640 }).includes('title.pixel_width.over'))
assert.ok(!ids({ ...base, titlePx: null }).includes('title.pixel_width.over'), 'no px claim for unmeasured scripts')
const hdr = (v, metas = []) => ({ ...base, headers: { 'x-robots-tag': v }, botMetas: metas })
assert.deepEqual(directives(hdr('noarchive, GPTBot: noindex')), ['noarchive'])
assert.deepEqual(directives(hdr('googlebot: nosnippet', [{ name: 'robots', content: 'max-image-preview:standard' }])).sort(), ['max-image-preview:standard', 'nosnippet'])
assert.deepEqual(perBotNoindex(hdr('GPTBot: noindex, nofollow', [{ name: 'CCBot', content: 'none' }])).sort(), ['CCBot', 'GPTBot'])
assert.ok(ids(hdr('', [{ name: 'robots', content: 'none' }])).includes('robots.none_directive'))
assert.ok(ids(hdr('unavailable_after: 2001-01-01')).includes('robots.unavailable_after'))
assert.equal(rules(hdr('unavailable_after: 2001-01-01')).find((r) => r.id === 'robots.unavailable_after').level, 'bad', 'past date is critical')
assert.ok(ids({ ...base, canonicals: ['/a', 'https://shop.example.co.uk/b'] }).includes('canonical.conflict'))
assert.ok(ids({ ...base, probe: { canonicalTarget: { url: 'x', redirects: true } } }).includes('canonical.target_redirects'))
assert.ok(ids({ ...base, probe: { canonicalTarget: { url: 'x', status: 404 } } }).includes('canonical.target_not_200'))
assert.ok(ids({ ...base, probe: { sitemap: { files: [{ status: 404 }], contains: false } } }).includes('sitemap.missing'))
assert.ok(ids({ ...base, probe: { sitemap: { files: [{ status: 200, error: null }], contains: false, exhausted: true } } }).includes('sitemap.url_absent'))
assert.ok(ids({ ...base, mixedContent: ['http://x/a.js'] }).includes('security.mixed_content'))
assert.ok(ids({ ...base, viewport: 'width=device-width, user-scalable=no' }).includes('mobile.viewport_blocks_zoom'))
assert.ok(ids({ ...base, lang: 'english' }).includes('html.lang_invalid'))
assert.ok(ids({ ...base, perf: { ...base.perf, lcpEl: { tag: 'img', lazy: true } } }).includes('perf.lcp_element_lazy'))
assert.ok(ids({ ...base, perf: { ...base.perf, inp: 650 } }).includes('perf.inp_slow'))
assert.ok(ids({ ...base, links: [{ text: 'Read more', internal: true, href: '/x' }] }).includes('links.generic_anchor'))
assert.ok(ids({ ...base, robotsTxt: 'User-agent: OAI-SearchBot\nDisallow: /' }).includes('geo.training_allowed_search_blocked'))
assert.ok(!ids({ ...base, robotsTxt: 'User-agent: GPTBot\nDisallow: /' }).includes('geo.training_allowed_search_blocked'), 'blocking training only is fine')
// schema property table
assert.ok(hasPath({ author: [{ name: 'A' }] }, 'author.name'))
assert.ok(hasPath({ thumbnail: 'x' }, 'thumbnailUrl|thumbnail'))
assert.ok(!hasPath({ author: {} }, 'author.name'))
const prod = (data) => ({ ...base, schema: { ...base.schema, jsonLd: [{ ok: true, data }], types: ['Product'] } })
assert.ok(ids(prod({ '@graph': [{ '@type': 'Product' }] })).includes('schema.missing_required'))
const rec = rules(prod({ '@type': 'Product', name: 'Shoe' })).find((r) => r.id === 'schema.missing_recommended')
assert.match(rec.msg, /image, offers\.price/)
// framework detection
assert.equal(stack({ nextStatic: true, rscFlight: true }).label, 'Next.js (App Router)')
assert.equal(stack({}, { nuxtGlobal: true }).id, 'nuxt')
assert.equal(stack({ wordpress: true, generator: 'WordPress 6.6.2' }).label, 'WordPress 6.6.2')
assert.equal(stack({}).id, 'plain-html')
// lens classifier (DOMParser from jsdom)
globalThis.DOMParser = dom.window.DOMParser
assert.equal(classify(403, 'text/html', '').outcome, 'blocked')
assert.equal(classify(200, 'text/html', '<title>Just a moment...</title>').outcome, 'blocked', 'challenge page is not content')
assert.equal(classify(200, 'text/html', '<form><input type=password></form>').outcome, 'unverified', 'login wall')
assert.equal(classify(200, 'application/json', '{}').outcome, 'unverified')
const served = classify(200, 'text/html; charset=utf-8', '<title>T</title><h1>x</h1><p>one two three</p><script>var a</script>')
assert.deepEqual([served.outcome, served.title, served.words, served.h1], ['served', 'T', 4, 1])
// report is self-contained and escapes page text
const rep = buildReport({ ...base, title: '<script>x</script>', fw: {}, globals: {} })
assert.ok(!rep.includes('<script>x'), 'page text is escaped')
assert.ok(!/<script|src="http/i.test(rep), 'no scripts or remote assets')

// ---- crawler against an in-memory site
const SITE = {
  '/': '<title>Home</title><meta name="description" content="d"><h1>H</h1><a href="/a">a</a><a href="/b?utm_source=x">b</a><a href="/missing">m</a><a href="/secret">s</a><a href="https://other.com/">ext</a><a href="/file.pdf">pdf</a>',
  '/a': '<title>Same</title><h1>A</h1><link rel="alternate" hreflang="de" href="/de"><a href="/c">c</a>',
  '/b': '<title>Same</title><h1>B</h1><meta name="robots" content="noindex"><a href="/">home</a>',
  '/c': '<title>C</title><a href="/d">d</a>',
  '/d': '<title>D</title><link rel="canonical" href="/c">',
  '/de': '<title>DE</title><h1>de</h1>',
  '/secret': '<title>S</title>',
}
const fakeFetch = (statusFor = {}) => async (u) => {
  const p = new URL(u).pathname
  const st = statusFor[p] ?? (SITE[p] ? 200 : 404)
  return { status: st, ok: st < 300, url: u, redirected: false, headers: new Map([['content-type', 'text/html']]), text: async () => SITE[p] ?? 'not found' }
}
const robotsSite = 'User-agent: *\nDisallow: /secret'
const cr = await crawl('https://ex.com/', { robotsTxt: robotsSite, fetchImpl: fakeFetch(), delayMs: 0 })
const crawled = cr.pages.map((p) => new URL(p.url).pathname).sort()
assert.deepEqual(crawled, ['/', '/a', '/b', '/c', '/d', '/missing'], 'follows <a> links only (hreflang alternates are not links)')
assert.ok(!crawled.includes('/secret'), 'robots.txt Disallow obeyed')
assert.ok(!crawled.includes('/file.pdf'), 'non-HTML extensions skipped')
assert.ok(cr.pages.every((p) => new URL(p.url).host === 'ex.com'), 'same origin only')
assert.ok(cr.pages.some((p) => p.url === 'https://ex.com/b'), 'tracking params stripped before dedupe')
assert.equal(cr.stoppedBecause, 'done'); assert.equal(cr.complete, true)
const an = analyseCrawl(cr, { urls: ['https://ex.com/a', 'https://ex.com/orphan'] })
assert.deepEqual(an.broken.map((b) => new URL(b.to).pathname), ['/missing'])
assert.deepEqual(an.dupTitles.map((g) => g.value), ['same'])
assert.deepEqual(an.noindex.map((u) => new URL(u).pathname), ['/b'])
assert.deepEqual(an.canonicalised.map((c) => new URL(c.url).pathname), ['/d'])
assert.deepEqual(an.orphans, ['https://ex.com/orphan'])
assert.equal(an.status.client, 1)
const capped = await crawl('https://ex.com/', { fetchImpl: fakeFetch(), delayMs: 0, cap: 2 })
assert.equal(capped.pages.length, 2); assert.equal(capped.stoppedBecause, 'page_cap'); assert.equal(capped.complete, false)
const shallow = await crawl('https://ex.com/', { fetchImpl: fakeFetch(), delayMs: 0, depthCap: 1 })
assert.equal(shallow.stoppedBecause, 'depth_cap')
const limited = await crawl('https://ex.com/', { fetchImpl: fakeFetch({ '/a': 429 }), delayMs: 0 })
assert.equal(limited.stoppedBecause, 'rate_limited')
const ctl = new AbortController(); ctl.abort()
assert.equal((await crawl('https://ex.com/', { fetchImpl: fakeFetch(), delayMs: 0, signal: ctl.signal })).stoppedBecause, 'stopped')
assert.equal(normalise('/x?utm_medium=a&id=2#top', 'https://EX.com/'), 'https://ex.com/x?id=2')
const sm = await sitemapUrls('https://ex.com', 'Sitemap: https://ex.com/idx.xml', async (u) => ({ ok: true, text: async () => u.endsWith('idx.xml')
  ? '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://ex.com/s1.xml</loc></sitemap></sitemapindex>'
  : '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://ex.com/a</loc></url><url><loc>https://other.com/z</loc></url></urlset>' }))
assert.deepEqual(sm.urls, ['https://ex.com/a'], 'follows sitemap index, keeps same-origin URLs')

// ---- AI firewall (Refract firewall.ts)
assert.equal(checkNumbers('Title is 71 characters', { title: 'abc' }).ok, false, 'invented number rejected')
assert.equal(checkNumbers('Fits within 2,340 words', { words: 2340 }).ok, true)
assert.equal(checkNumbers('Top 3 tips', {}).ok, true, 'small counting numbers are harmless')
assert.equal(sanitise('<b>Hi</b>\u0007 there'), 'Hi there')

// ---- CrUX parsing
const crux = parseRecord({ record: { metrics: { largest_contentful_paint: { histogram: [{ density: 0.7 }, { density: 0.2 }, { density: 0.1 }], percentiles: { p75: 2900 } }, cumulative_layout_shift: { histogram: [{ density: 0.9 }, { density: 0.05 }, { density: 0.05 }], percentiles: { p75: '0.04' } }, time_to_first_byte: { histogram: [], percentiles: { p75: 600 } } },
  collectionPeriod: { firstDate: { year: 2026, month: 9, day: 1 }, lastDate: { year: 2026, month: 9, day: 28 } } } })
assert.equal(crux.metrics.largest_contentful_paint.status, 'warn')
assert.equal(crux.metrics.cumulative_layout_shift.p75, 0.04, 'CLS p75 arrives as a string')
assert.equal(crux.metrics.experimental_time_to_first_byte.p75, 600, 'TTFB under either API name')
assert.equal(crux.period, '2026-09-01 → 2026-09-28')
assert.equal(parseRecord(null), null)
const ch = parseHistory({ record: { collectionPeriods: [{ lastDate: { year: 2026, month: 1, day: 4 } }, { lastDate: { year: 2026, month: 1, day: 11 } }], metrics: { largest_contentful_paint: { percentilesTimeseries: { p75s: [2100, null] } } } } })
assert.deepEqual(ch.lcp, [{ date: '2026-01-04', value: 2100 }], 'null weeks dropped')

// ---- providers
assert.throws(() => dfsResult({ status_code: 20000, tasks: [{ status_code: 40210, status_message: 'Insufficient funds' }] }), /billing/)
assert.throws(() => dfsResult({ status_code: 40100, status_message: 'Auth' }), /Auth/)
const serp = parseDfsSerp([{ items: [{ type: 'featured_snippet', domain: 'ex.com' }, { type: 'organic', rank_group: 1, domain: 'other.com' }, { type: 'organic', rank_group: 2, domain: 'www.ex.com', url: 'https://www.ex.com/a' }] }], 'ex.com')
assert.deepEqual([serp.position, serp.url], [2, 'https://www.ex.com/a'], 'subdomain match, organic only')
assert.equal(parseDfsSerp([{ items: [] }], 'ex.com').position, null)
assert.deepEqual(parseSemrush('Keyword;Position;Search Volume\nshoes;3;1000\n'), [{ Keyword: 'shoes', Position: '3', 'Search Volume': '1000' }])
assert.deepEqual(parseSemrush('ERROR 50 :: NOTHING FOUND'), [], 'nothing found is empty, not an error')
assert.throws(() => parseSemrush('ERROR 120 :: WRONG KEY'), /WRONG KEY/)
const cfg = { creds: { semrush: { key: 'k' }, ahrefs: { key: 'a' } }, route: { ranks: 'ahrefs', keywords: 'dataforseo', backlinks: null } }
assert.equal(providerFor(cfg, 'ranks'), 'ahrefs', 'explicit route wins')
assert.equal(providerFor(cfg, 'keywords'), 'semrush', 'route without keys falls back')
assert.equal(providerFor({ creds: {}, route: {} }, 'backlinks'), null)

// ---- change tracking
const s1 = snapshot({ ...base, fw: {}, globals: {} }, new Date('2026-09-01'))
const s2 = snapshot({ ...base, fw: {}, globals: {}, title: 'New title for the page here', images: [...base.images, { src: 'x', alt: null }] }, new Date('2026-10-01'))
const df = diffSnapshots(s1, s2)
assert.ok(df.changes.some((c) => c.field === 'title'))
assert.ok(df.changes.some((c) => c.field === 'noAlt'))
assert.ok(!df.added.some((t) => /missing alt/.test(t)) && !df.resolved.some((t) => /missing alt/.test(t)), 'a count change is not fixed+new')
const cA = { finishedAt: '2026-09-01', pages: [{ url: 'a', status: 200, title: 'A' }, { url: 'b', status: 200, title: 'B', robots: null }] }
const cB = { pages: [{ url: 'a', status: 404, title: 'A' }, { url: 'b', status: 200, title: 'B2', robots: 'noindex' }, { url: 'c', status: 200 }] }
const dc = diffCrawls(cA, cB)
assert.deepEqual([dc.added, dc.removed, dc.status.map((x) => x.url), dc.titles.map((x) => x.url), dc.indexing.map((x) => x.url)], [['c'], [], ['a'], ['b'], ['b']])

// ---- redirect chains
const chain = analyseChain({ hops: [{ url: 'http://ex.com/', status: 302, location: 'https://ex.com/' }, { url: 'https://ex.com/', status: 301, location: 'https://www.ex.com/' }, { url: 'https://www.ex.com/', status: 200, headers: { 'strict-transport-security': 'max-age=1', 'content-security-policy': "frame-ancestors 'none'" } }] })
assert.equal(chain.redirects, 2)
assert.ok(chain.findings.some((f) => /temporary/.test(f.msg)) && chain.findings.some((f) => /2 redirects/.test(f.msg)))
assert.ok(chain.security.find((x) => x.label === 'X-Frame-Options').ok, 'CSP frame-ancestors counts')
assert.ok(analyseChain({ hops: [{ url: 'a', status: 301, location: 'b' }, { url: 'b', status: 301, location: 'a' }, { url: 'a', status: 301 }] }).findings.some((f) => /loop/.test(f.msg)))
assert.ok(analyseChain({ hops: [{ url: 'https://a/', status: 301, location: 'http://a/' }, { url: 'http://a/', status: 200 }] }).findings.some((f) => /HTTPS down to HTTP/.test(f.msg)))

// ---- local SEO
const biz = { '@type': 'Dentist', name: 'Smile Co', telephone: '+1 (555) 123-4567', address: { streetAddress: '1 Main St', addressLocality: 'Austin' } }
const ld = (o) => ({ ...base, social: {}, schema: { ...base.schema, jsonLd: [{ ok: true, data: o }] }, local: { telLinks: ['+15551234567'], visiblePhones: [], addresses: [], mapEmbeds: 0, gbpLinks: [] } })
const la = analyseLocal(ld(biz))
assert.equal(la.looksLocal, true); assert.equal(la.business.address, '1 Main St, Austin')
assert.equal(la.phones.length, 1, 'formatting differences are the same number')
assert.ok(la.checks.some((c) => !c.ok && /opening hours/.test(c.label)))
assert.deepEqual(localIssues({ ...ld(biz), local: { ...ld(biz).local, telLinks: ['+15559999999'] } }).map((i) => i.id), ['local.phone_mismatch'])
assert.deepEqual(localIssues({ ...ld({ '@type': 'Article' }), local: { telLinks: ['1'], visiblePhones: [], addresses: ['x'], mapEmbeds: 1, gbpLinks: [] } }).map((i) => i.id), ['local.schema_missing'])
assert.equal(analyseLocal({ ...base, local: { telLinks: [], visiblePhones: [], addresses: [], mapEmbeds: 0, gbpLinks: [] } }).looksLocal, false)
assert.equal(phoneKey('+44 (0)20 7946 0018'), '2079460018')
assert.deepEqual(phoneVariants([{ url: 'a', phones: ['+15551234567'] }, { url: 'b', phones: ['555-123-4567'] }, { url: 'c', phones: ['+15559999999'] }]).map((p) => p.urls.length), [2, 1])

// ---- compare
const rows = compareRows()
assert.ok(rows.every(([l, v]) => typeof l === 'string' && typeof v === 'function'))
assert.ok(rows.every(([, v]) => v({ ...base, fw: {}, globals: {} }) !== undefined))
const gap = phraseGaps({ words: 'red shoes red shoes blue hats'.split(' ') }, [{ words: 'red shoes red shoes trail boots trail boots'.split(' ') }])
assert.deepEqual([gap.shared, gap.gaps], [['red shoes'], ['trail boots']])

// ---- Search Console
const sites = [{ siteUrl: 'sc-domain:ex.com', permissionLevel: 'siteOwner' }, { siteUrl: 'https://www.ex.com/blog/', permissionLevel: 'siteFullUser' }, { siteUrl: 'https://www.ex.com/', permissionLevel: 'siteUnverifiedUser' }]
assert.equal(pickProperty(sites, 'https://www.ex.com/blog/post'), 'https://www.ex.com/blog/', 'longest verified URL-prefix wins')
assert.equal(pickProperty(sites, 'https://www.ex.com/shop'), 'sc-domain:ex.com', 'unverified prefix skipped; domain property covers www')
assert.equal(pickProperty(sites, 'https://other.com/'), null)
const sum = summarise([{ keys: ['2026-10-01'], clicks: 10, impressions: 100, position: 4 }, { keys: ['2026-10-02'], clicks: 0, impressions: 300, position: 8 }], [{ keys: ['shoes'], clicks: 10, impressions: 400, ctr: 0.025, position: 7 }], 'u')
assert.deepEqual([sum.clicks, sum.impressions, sum.ctr, sum.position], [10, 400, 0.025, 7], 'position is impression-weighted')
// ---- Bing
assert.equal(bingDate('/Date(1696118400000)/'), '2023-10-01')
assert.equal(pickSite([{ Url: 'https://www.ex.com/', IsVerified: true }, { Url: 'https://other.com/' }], 'https://www.ex.com/a'), 'https://www.ex.com/')
assert.equal(pickSite([{ Url: 'https://ex.com/' }], 'https://www.ex.com/a'), 'https://ex.com/', 'www-insensitive host fallback')
const rolled = rollup([{ Query: 'a', Clicks: 1, Impressions: 10, AvgImpressionPosition: 2 }, { Query: 'a', Clicks: 1, Impressions: 30, AvgImpressionPosition: 6 }, { Query: 'b', Clicks: 0, Impressions: 5, AvgImpressionPosition: 1 }])
assert.deepEqual(rolled.map((r) => [r.key, r.clicks, r.impressions, r.position]), [['a', 2, 40, 5], ['b', 0, 5, 1]])

// a hanging availability() must not block the audit
globalThis.LanguageModel = { availability: () => new Promise(() => {}) }
assert.equal(await aiStatus(50), 'unavailable')
delete globalThis.LanguageModel
console.log('sss self-check: ok')
