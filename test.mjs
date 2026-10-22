// Self-check: `node test.mjs` (part of `npm run check`).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { robotsAllows, geo, health, outline, schemaTree, topDomains, imageFormats, placement } from './geo.js'
import { rules, directives, perBotNoindex, hasPath, stack } from './rules.js'
import { spentToday, capReason, guard, billed } from './ledger.js'
import { evaluateLlms, robotsSignals, evaluateAgent } from './agent.js'
import { parsePsi, agenticFraction, parseOpr, parseEntities, parseCategories, validIndexNowKey, indexNowMessage, parseGa4Properties, parseGa4Report } from './apis.js'
import { parseMozMetrics, parseMozDomains } from './moz.js'
import { parseSerpUrls, parseMaps } from './providers.js'
import { templates, templateProblems, parasiteRisk, sitemapCandidates, topicShift } from './site-analysis.js'
import { sitemapXml, hreflangSet, schemaTemplate, SCHEMA_TEMPLATES, isRetired, disavowFile, comparisonOutline, contentBrief, auditMarkdown, auditJson } from './generators.js'
import { serpClusters } from './keywords.js'
import { linkPresent } from './links.js'
import { gridPoints } from './local.js'
import { eeatSignals } from './geo.js'
import { classify } from './lens.js'
import { crawl, analyseCrawl, normalise, sitemapUrls } from './crawl.js'
import { checkNumbers, sanitise, aiStatus } from './ai.js'
import { parseRecord, parseHistory } from './crux.js'
import { API, dfsResult, parseDfsSerp, parseSemrush, dfsTrend, semTrend, parseDfsLabs, semRow, parseDfsRanked, parseDfsOverview, day, parseDfsLinks, parseSemLinks, parseAhLinks, parseAio, parseLlm } from './providers.js'
import { judge, verdict, mentions, compareRuns, visibilityTrend, runRows } from './aivis.js'
import { aiVisibilityOpps } from './opps.js'
import { diffRefDomains, linkGap, filterLinks, linkedPages, mergeProspects } from './links.js'
import { mergeKeywords, parseCsv, csvKeywords, exportRows, domainGap, cleanDomain, tokens, clusterKeywords, positionBuckets, topPages, buildBackup, readBackup, keyDomain } from './keywords.js'
import { providerFor } from './keys.js'
import { snapshot, diffSnapshots, diffCrawls } from './history.js'
import { analyseChain } from './redirects.js'
import { analyseLocal, localIssues, phoneKey } from './local.js'
import { phoneVariants } from './crawl.js'
import { compareRows, phraseGaps } from './views-compare.js'
import { sameKind, movement, dfsRankCost } from './views-data.js'
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
// rank history: trend/delta only across points of the latest point's kind (live vs index estimate)
const rh = [{ date: 'a', position: 9 }, { date: 'b', position: 4, provider: 'dataforseo' }, { date: 'c', position: 12, provider: 'semrush' }, { date: 'd', position: 10, provider: 'ahrefs' }]
assert.deepEqual(sameKind(rh).map((x) => x.date), ['c', 'd'])
assert.deepEqual(sameKind(rh.slice(0, 2)).map((x) => x.date), ['b'])
assert.deepEqual(sameKind(rh.slice(0, 1)).map((x) => x.date), ['a'])
assert.deepEqual(sameKind([]), [])
// movement: latest vs previous check; URL change only when ranked both times
const P = (position, url) => ({ position, url })
assert.deepEqual(movement([
  { prev: P(8, '/a'), last: P(5, '/a') }, { prev: P(3, '/b'), last: P(6, '/c') }, { prev: P(null), last: P(40, '/d') },
  { prev: P(12, '/e'), last: P(null) }, { prev: P(7, '/f'), last: P(7, '/f') }, { last: P(2, '/g') },
]), { up: 1, down: 1, entered: 1, dropped: 1, urlChanged: 1 })
// DataForSEO bills each 10 results (depth rounds up)
assert.equal(dfsRankCost(10, 100).toFixed(4), '0.2000')
assert.equal(dfsRankCost(1, 15).toFixed(4), '0.0040')
assert.equal(dfsRankCost(0, 100), 0)
// monthly trend parsers: oldest first
assert.deepEqual(dfsTrend([{ year: 2026, month: 2, search_volume: 5 }, { year: 2025, month: 12, search_volume: 3 }, { year: 2026, month: 1, search_volume: null }]), [3, null, 5])
assert.deepEqual(dfsTrend(undefined), [])
assert.deepEqual(semTrend('0.50,1.00,0.82'), [0.5, 1, 0.82])
assert.deepEqual(semTrend(''), [])
// DataForSEO Labs: related_keywords nests rows under keyword_data; ideas/suggestions are flat
const labsRow = { keyword: 'teeth whitening', keyword_info: { search_volume: 900, cpc: 3.1, monthly_searches: [{ year: 2026, month: 2, search_volume: 950 }, { year: 2026, month: 1, search_volume: 850 }] }, keyword_properties: { keyword_difficulty: 41 }, search_intent_info: { main_intent: 'commercial' } }
const wantKw = { keyword: 'teeth whitening', volume: 900, kd: 41, cpc: 3.1, intent: 'commercial', trend: [850, 950] }
assert.deepEqual(parseDfsLabs([{ total_count: 7, items: [{ keyword_data: labsRow, depth: 1 }] }]), { total: 7, rows: [wantKw] })
assert.deepEqual(parseDfsLabs([{ total_count: 7, items: [labsRow] }]).rows, [wantKw])
assert.deepEqual(parseDfsLabs([{ items: [{ keyword: 'x' }] }]).rows[0], { keyword: 'x', volume: null, kd: null, cpc: null, intent: null, trend: [] })
assert.deepEqual(parseDfsLabs([]), { total: null, rows: [] })
// Semrush phrase_related row (In codes 0–3)
assert.deepEqual(semRow({ Keyword: 'a b', 'Search Volume': '1300', CPC: '0.9', 'Keyword Difficulty Index': '37', Trends: '0.5,1', Intent: '1,3' }),
  { keyword: 'a b', volume: 1300, kd: 37, cpc: 0.9, intent: 'informational, transactional', trend: [0.5, 1] })
assert.equal(semRow({ Keyword: 'z', Intent: '' }).intent, null)

// saved keywords: merge keeps tags/notes/url, metrics carry provenance, keys are normalised
let kw = mergeKeywords({}, [{ keyword: '  Teeth   Whitening ' }, { keyword: '' }], { source: 'Added by hand', at: '2026-10-01' })
assert.deepEqual(Object.keys(kw), ['teeth whitening'])
assert.deepEqual(kw['teeth whitening'], { keyword: 'teeth whitening', tags: [], notes: '', url: '', added: '2026-10-01', source: 'Added by hand' })
kw['teeth whitening'] = { ...kw['teeth whitening'], tags: ['money'], notes: 'pillar', url: '/whitening' }
kw = mergeKeywords(kw, [{ keyword: 'teeth whitening', volume: 900, kd: 41, cpc: 3.1, tags: ['Q4'] }], { source: 'DataForSEO', provider: 'DataForSEO', market: 'us', at: '2026-10-02' })
assert.deepEqual(kw['teeth whitening'], { keyword: 'teeth whitening', tags: ['money', 'q4'], notes: 'pillar', url: '/whitening', added: '2026-10-01', source: 'Added by hand',
  volume: 900, kd: 41, cpc: 3.1, intent: null, trend: [], metricsFrom: 'DataForSEO', market: 'us', collected: '2026-10-02' })
// a partial refresh keeps what it doesn't supply: Labs gave intent + trend, "Get metrics" brings only volume/kd/cpc
const partial = mergeKeywords(mergeKeywords({}, [{ keyword: 'k', volume: 10, kd: 40, cpc: 1, intent: 'commercial', trend: [1, 2] }], { provider: 'DataForSEO', at: '2026-10-01' }), [{ keyword: 'k', volume: 12, kd: null, cpc: 2 }], { provider: 'Semrush', at: '2026-10-02' }).k
assert.deepEqual([partial.volume, partial.kd, partial.cpc, partial.intent, partial.trend, partial.metricsFrom], [12, 40, 2, 'commercial', [1, 2], 'Semrush'])
// a metric-less row (e.g. a gap save) must not wipe metrics
assert.equal(mergeKeywords(kw, [{ keyword: 'teeth whitening', tags: ['gap:rival.com'] }], { source: 'gap' })['teeth whitening'].volume, 900)

// CSV: quotes, escaped quotes, CRLF, BOM; header detection; round trip of our own export
assert.deepEqual(parseCsv('a,"b,c","say ""hi"""\r\n\r\nd,e,f\n'), [['a', 'b,c', 'say "hi"'], ['d', 'e', 'f']])
assert.deepEqual(csvKeywords('red shoes\nblue hats').map((r) => r.keyword), ['red shoes', 'blue hats'])
assert.deepEqual(csvKeywords('﻿Top queries,Clicks,Impressions\nsmile co,5,50\n').map((r) => r.keyword), ['smile co'])
const back = csvKeywords(toCsv(exportRows([kw['teeth whitening']])))
assert.deepEqual(mergeKeywords({}, back, { source: 'csv', at: '2026-10-03' })['teeth whitening'].tags, ['money', 'q4'])
assert.equal(back[0].volume, 900); assert.equal(back[0].url, '/whitening'); assert.equal(back[0].notes, 'pillar')

// domain gap
const gp = domainGap([{ keyword: 'Dentist Austin', position: 3, volume: 500, url: 'https://a/x' }, { keyword: 'mine only', position: 9, volume: 10 }],
  [{ keyword: 'dentist austin', position: 1, volume: 520, url: 'https://b/y' }, { keyword: 'implants', position: 4, volume: 900 }, { keyword: 'veneers', position: 7, volume: null }])
assert.deepEqual(gp.gap.map((r) => r.keyword), ['implants', 'veneers'])
assert.deepEqual(gp.shared, [{ keyword: 'dentist austin', volume: 520, you: 3, them: 1, yourUrl: 'https://a/x', theirUrl: 'https://b/y' }])
assert.deepEqual(gp.yours.map((r) => r.keyword), ['mine only'])
assert.equal(cleanDomain('https://www.Rival.com/path?q=1'), 'rival.com')
assert.equal(cleanDomain('rival.co.uk'), 'rival.co.uk')
assert.equal(cleanDomain('not a domain'), null)
assert.equal(cleanDomain('localhost'), null)
// SERP features: distinct non-organic item types on the results page
assert.deepEqual(parseDfsSerp([{ items: [{ type: 'ai_overview' }, { type: 'organic', rank_group: 1, domain: 'a.com' }, { type: 'people_also_ask' }, { type: 'organic', rank_group: 2, domain: 'b.com' }, { type: 'people_also_ask' }] }], 'b.com'),
  { position: 2, url: null, top: ['a.com', 'b.com'], features: ['ai_overview', 'people_also_ask'] })
// DataForSEO Labs ranked_keywords and domain_rank_overview
assert.deepEqual(parseDfsRanked([{ items: [{ keyword_data: { keyword: 'implants', keyword_info: { search_volume: 900 } }, ranked_serp_element: { serp_item: { rank_group: 4, url: 'https://r.com/implants' } } }] }]),
  [{ keyword: 'implants', position: 4, volume: 900, url: 'https://r.com/implants' }])
assert.deepEqual(parseDfsOverview([{ items: [{ metrics: { organic: { pos_1: 2, pos_2_3: 3, pos_4_10: 5, pos_11_20: 7, pos_21_30: 1, pos_91_100: 4, etv: 120.5, count: 22, estimated_paid_traffic_cost: 300 } } }] }]),
  { keywords: 22, traffic: 120.5, value: 300, dist: { '1': 2, '2–3': 3, '4–10': 5, '11–20': 7, '21–100': 5 } })
assert.deepEqual(parseDfsOverview([]), { keywords: null, traffic: null, value: null, dist: null })

// token clusters
assert.deepEqual(tokens('Best Teeth Whitening Strips for sensitive teeth'), ['teeth', 'whiten', 'strip', 'sensitive'])
const cl = clusterKeywords([{ keyword: 'teeth whitening', volume: 900 }, { keyword: 'whitening', volume: 50 }, { keyword: 'teeth whitening strips', volume: 300 },
  { keyword: 'teeth cleaning', volume: 400 }, { keyword: 'dentist austin', volume: 500 }, { keyword: 'austin dentists', volume: 20 }, { keyword: 'the', volume: 1 }])
assert.deepEqual(cl.map((c) => [c.head, c.members.length, c.volume]), [['teeth whitening', 3, 1250], ['dentist austin', 2, 520], ['teeth cleaning', 1, 400], ['the', 1, 1]])

// overview helpers from a ranked list
const rk = [{ keyword: 'a', position: 1, volume: 100, url: 'https://x/p1' }, { keyword: 'b', position: 5, volume: 300, url: 'https://x/p2' }, { keyword: 'c', position: 15, volume: 50, url: 'https://x/p1' }, { keyword: 'd', position: 40, volume: 10, url: null }]
assert.deepEqual(positionBuckets(rk), { '1': 1, '2–3': 0, '4–10': 1, '11–20': 1, '21–100': 1 })
assert.deepEqual(topPages(rk), [{ url: 'https://x/p2', keywords: 1, volume: 300, best: 5, top: 'b' }, { url: 'https://x/p1', keywords: 2, volume: 150, best: 1, top: 'a' }])

// backup: research keys only, never the keys record; restore validates and cleans
const all = { byok: { creds: { dataforseo: { password: 'secret' } } }, 'kw:a.com': { x: { keyword: 'x', tags: ['t'], notes: '', url: '' } }, 'ranks:a.com:us:desktop': { keywords: [] }, 'hist:index': [], 'serp:obs': [] }
const bk = buildBackup(all, '2026-10-22T00:00:00Z')
assert.deepEqual(Object.keys(bk.data), ['kw:a.com', 'ranks:a.com:us:desktop'])
assert.ok(!JSON.stringify(bk).includes('secret'))
assert.deepEqual(readBackup(JSON.parse(JSON.stringify(bk))), bk.data)
assert.throws(() => readBackup({ format: 'other' }), /not a Refract SEO research backup/)
assert.throws(() => readBackup({ ...bk, version: 99 }), /version 99/)
assert.deepEqual(readBackup({ ...bk, data: { keys: { x: 1 }, 'kw:b.com': { a: { keyword: ' A ', tags: 'oops' }, b: { nope: 1 } }, 'bl:b.com': 'str' } }),
  { 'kw:b.com': { a: { keyword: 'a', tags: [], notes: '', url: '' } } })
assert.deepEqual(['kw:a.com', 'domgap:a.com:r.com:us', 'ranks:a.com', 'gaps:https://www.a.com/p#x', 'gaps:nope'].map(keyDomain), ['a.com', 'a.com', 'a.com', 'a.com', null])
// backlinks: date normalising and the three providers' row shapes
assert.equal(day(1580410670), '2020-01-30'); assert.equal(day('2021-07-31 12:37:39 +00:00'), '2021-07-31'); assert.equal(day('2026-01-02T03:04:05Z'), '2026-01-02'); assert.equal(day(''), null)
const wantLink = { from: 'https://www.blog.example/post', fromDomain: 'blog.example', to: 'https://a.com/', anchor: 'A', follow: true, firstSeen: '2026-01-02', lastSeen: '2026-03-04', lost: false, rating: 55 }
assert.deepEqual(parseDfsLinks([{ items: [{ url_from: 'https://www.blog.example/post', url_to: 'https://a.com/', anchor: 'A', dofollow: true, first_seen: '2026-01-02 00:00:00 +00:00', last_seen: '2026-03-04 00:00:00 +00:00', is_lost: false, domain_from_rank: 55, is_broken: true, backlink_spam_score: 12 }] }]), [{ ...wantLink, broken: true, spam: 12 }])
assert.deepEqual(parseSemLinks([{ source_url: 'https://www.blog.example/post', target_url: 'https://a.com/', anchor: 'A', nofollow: 'false', first_seen: String(Date.parse('2026-01-02') / 1000), last_seen: String(Date.parse('2026-03-04') / 1000), lostlink: 'false', page_ascore: '55' }]), [{ ...wantLink, broken: null, spam: null }])
assert.deepEqual(parseAhLinks([{ url_from: 'https://www.blog.example/post', url_to: 'https://a.com/', anchor: 'A', is_dofollow: true, first_seen: '2026-01-02T00:00:00Z', last_seen: '2026-03-04T00:00:00Z', is_lost: false, domain_rating_source: 55, is_spam: true }]), [{ ...wantLink, broken: null, spam: true }])
assert.deepEqual(parseSemLinks([{ source_url: 'x', nofollow: '' }])[0].follow, null)

// snapshot diff, link gap, filters, linked pages, prospects
const bs1 = { provider: 'ahrefs', at: '2026-10-01T00:00:00Z', top: [{ domain: 'a.example' }, { domain: 'b.example' }] }
const bs2 = { provider: 'ahrefs', at: '2026-10-08T00:00:00Z', top: [{ domain: 'b.example' }, { domain: 'c.example' }] }
assert.deepEqual(diffRefDomains(bs1, bs2), { since: bs1.at, added: [{ domain: 'c.example' }], gone: [{ domain: 'a.example' }] })
assert.equal(diffRefDomains({ ...bs1, provider: 'semrush' }, bs2), null)
assert.equal(diffRefDomains(undefined, bs2), null)
assert.deepEqual(linkGap(bs1, { ...bs2, top: [{ domain: 'b.example', rating: 9 }, { domain: 'z.example', rating: 20 }, { domain: 'y.example', rating: 70 }] }).map((t) => t.domain), ['y.example', 'z.example'])
assert.equal(linkGap(bs1, { ...bs2, provider: 'semrush' }), null)
const lrows = [{ from: 'https://x.com/1', fromDomain: 'x.com', to: 'https://a.com/p', anchor: 'Best shoes', follow: true }, { from: 'https://y.com/1', fromDomain: 'y.com', to: 'https://a.com/p', anchor: 'here', follow: false }, { from: 'https://y.com/2', fromDomain: 'y.com', to: 'https://a.com/', anchor: '', follow: null }]
assert.deepEqual(filterLinks(lrows, { q: 'SHOES' }).map((r) => r.from), ['https://x.com/1'])
assert.deepEqual(filterLinks(lrows, { follow: 'nofollow' }).map((r) => r.from), ['https://y.com/1'])
assert.equal(filterLinks(lrows, { follow: 'follow' }).length, 1)
assert.deepEqual(linkedPages(lrows), [{ url: 'https://a.com/p', links: 2, domains: 2, follow: 1 }, { url: 'https://a.com/', links: 1, domains: 1, follow: 0 }])
let pr = mergeProspects({}, [{ domain: 'News.Example ', rating: 80 }, { domain: '' }], { source: 'gap', at: '2026-10-22' })
assert.deepEqual(pr, { 'news.example': { domain: 'news.example', rating: 80, status: 'to contact', tags: [], notes: '', source: 'gap', added: '2026-10-22' } })
pr['news.example'].status = 'contacted'
assert.equal(mergeProspects(pr, [{ domain: 'news.example', rating: 81 }], { source: 'other' })['news.example'].status, 'contacted')
assert.equal(keyDomain('blsnap:a.com:2026-10-22'), 'a.com')
// AI answers: Google AI Overview / AI Mode block and LLM responses → one shape
assert.deepEqual(parseAio([{ items: [{ type: 'organic' }] }]), { shown: false, text: '', citations: [] })
const aio = parseAio([{ items: [{ type: 'ai_overview', markdown: 'Smile Co is a dentist.', references: [{ url: 'https://www.smileco.com/a', title: 'A', domain: 'www.smileco.com' }], items: [{ text: 'x', references: [{ url: 'https://www.smileco.com/a', title: 'A' }, { url: 'https://rival.com/b', title: 'B' }] }] }] }])
assert.deepEqual(aio, { shown: true, text: 'Smile Co is a dentist.', citations: [{ url: 'https://www.smileco.com/a', title: 'A', domain: 'smileco.com' }, { url: 'https://rival.com/b', title: 'B', domain: 'rival.com' }] })
const llm = parseLlm([{ model_name: 'gpt-4.1-mini-2025', items: [{ type: 'reasoning', sections: [{ text: 'hidden' }] }, { type: 'message', sections: [{ text: 'Try Rival.', annotations: [{ url: 'https://rival.com/x', title: 'X' }] }] }] }])
assert.deepEqual(llm, { shown: true, model: 'gpt-4.1-mini-2025', text: 'Try Rival.', citations: [{ url: 'https://rival.com/x', title: 'X', domain: 'rival.com' }] })
assert.equal(parseLlm([{ items: [{ type: 'message', sections: [{ text: 'no search', annotations: null }] }] }]).citations, null)

// judging: mentions are whole words; citations by domain or subdomain; the four states stay distinct
assert.ok(mentions("Smile Co's team", 'Smile Co')); assert.ok(!mentions('SmileCorp', 'smile co')); assert.ok(mentions('see smileco.com.', 'smileco.com'))
const ctx = { domain: 'smileco.com', brand: ['Smile Co'], competitors: ['rival.com'] }
const jAio = judge(aio, ctx)
assert.deepEqual([jAio.mentioned, jAio.cited, jAio.citedUrls, jAio.competitors[0].cited], [true, true, ['https://www.smileco.com/a'], true])
assert.deepEqual(verdict(jAio), ['good', 'Cited'])
assert.deepEqual(verdict(judge(llm, ctx)), ['bad', 'Not mentioned'])
assert.equal(judge(llm, ctx).competitors[0].mentioned, true) // "Rival" from rival.com
assert.deepEqual(verdict(judge({ shown: true, text: 'Smile Co is fine', citations: [] }, ctx)), ['warn', 'Mentioned, not cited'])
assert.deepEqual(verdict(judge({ shown: true, text: 'nothing', citations: null }, ctx)), ['warn', 'Not mentioned · engine cannot cite'])
assert.deepEqual(verdict(judge({ error: 'HTTP 500' }, ctx)), ['bad', 'Check failed'])
assert.deepEqual(verdict(judge({ shown: false }, ctx)), ['warn', 'No AI answer shown'])
assert.equal(judge({ error: 'x' }, ctx).cited, undefined) // a failure carries no mention/citation claim

// run comparison skips failures; trend counts only answers with sources toward citation rate
const R = (at, results) => ({ at, market: 'us', results })
const jr = (engine, a) => ({ engine, judged: judge(a, ctx) })
const r1 = R('2026-10-01T00:00:00Z', [jr('google_aio', { shown: true, text: 'Smile Co', citations: [] }), jr('chatgpt', { shown: true, text: '', citations: [] })])
const r2 = R('2026-10-08T00:00:00Z', [jr('google_aio', aio), jr('chatgpt', { error: 'timeout' })])
assert.deepEqual(compareRuns(r1, r2), [{ engine: 'google_aio', from: 'Mentioned, not cited', to: 'Cited', competitorsNowCited: ['rival.com'] }])
assert.deepEqual(visibilityTrend([r1, r2]), [{ date: '2026-10-01', answers: 2, mentioned: 1, citable: 2, cited: 0 }, { date: '2026-10-08', answers: 1, mentioned: 1, citable: 1, cited: 1 }])
assert.equal(runRows({ prompt: 'p', topic: 't' }, [r2])[1].result, 'Check failed')

// AI visibility → opportunity cards
const aiPr = { prompt: 'best dentist austin vs rival', engines: ['google_aio', 'chatgpt'] }
const lostRun = R('2026-10-08T00:00:00Z', [jr('google_aio', { shown: true, text: 'Rival is great', citations: [{ url: 'https://rival.com/best' }] }), jr('chatgpt', { error: 'x' })])
const vo = aiVisibilityOpps([{ prompt: aiPr, run: lostRun }], { url: 'https://smileco.com/p', robotsTxt: 'User-agent: OAI-SearchBot\nDisallow: /' }, { engineBots: { chatgpt: ['OAI-SearchBot'], perplexity: ['PerplexityBot'] } })
assert.deepEqual(vo.map((o) => o.kind), ['ai_competitor', 'ai_comparison', 'ai_crawler'])
assert.match(vo[0].why, /cite rival\.com but not you/); assert.match(vo[2].title, /OAI-SearchBot/)
assert.deepEqual(aiVisibilityOpps([{ prompt: aiPr, run: R('2026-10-08T00:00:00Z', [jr('chatgpt', { error: 'x' })]) }], { url: 'https://smileco.com/', robotsTxt: '' }, {}), []) // failures produce no cards
// provider refusals carry the provider's own reason (e.g. DataForSEO 40104 "verify your account")
{
  const realFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ status_code: 40104, status_message: 'Please verify your account before using the API.' }), { status: 403 })
  await assert.rejects(API.dataforseo.keywords({ login: 'l', password: 'p' }, ['x'], { dfs: 'United States', lang: 'en' }), /refused the request \(403\)\. The provider says: “Please verify your account/)
  globalThis.fetch = async () => new Response('', { status: 401 })
  await assert.rejects(API.semrush.discover({ key: 'k' }, 'related', 'x', { semrush: 'us' }), /refused the request \(401\)\. Check the key in Settings\./)
  // Semrush "lost only" is filtered locally; paging must advance by what was fetched, not what was kept
  globalThis.fetch = async () => new Response('page_ascore;source_url;target_url;anchor;first_seen;last_seen;nofollow;lostlink\n10;https://x.com/1;https://a.com/;a;1580410670;1580410670;false;true\n20;https://y.com/1;https://a.com/;b;1580410670;1580410670;true;false\n')
  const lostOnly = await API.semrush.backlinkRows({ key: 'k' }, 'a.com', { limit: 2, lost: true })
  assert.deepEqual([lostOnly.rows.map((r) => r.from), lostOnly.fetched, lostOnly.lostLocal], [['https://x.com/1'], 2, true])
  assert.equal((await API.semrush.backlinkRows({ key: 'k' }, 'a.com', { limit: 2 })).rows.length, 2)
  globalThis.fetch = realFetch
}
// review fixes: no new/lost diff across list sizes; empty AI reply is a failure; CSV neutralises formulas
assert.equal(diffRefDomains({ provider: 'ahrefs', at: 'a', limit: 25, top: [{ domain: 'x' }] }, { provider: 'ahrefs', at: 'b', limit: 100, top: [{ domain: 'y' }] }), null)
assert.ok(diffRefDomains({ provider: 'ahrefs', at: 'a', limit: 100, top: [{ domain: 'x' }] }, { provider: 'ahrefs', at: 'b', limit: 100, top: [{ domain: 'y' }] }))
assert.throws(() => parseLlm([{ items: [] }]), /no answer/)
assert.throws(() => parseLlm([]), /no answer/)
assert.equal(toCsv([{ a: '=HYPERLINK("x")', b: '+1', c: '@x', d: -5, e: 'ok' }]), 'a,b,c,d,e\n"\'=HYPERLINK(""x"")",\'+1,\'@x,-5,ok')
// ---- spend ledger: totals per local day, caps (dollars for DataForSEO, requests elsewhere), guard + billed, fails closed
{
  const now = new Date('2026-10-22T12:00:00')
  const E = [{ at: '2026-10-22T09:00:00', provider: 'dataforseo', cost: 0.02 }, { at: '2026-10-22T10:00:00', provider: 'dataforseo', cost: 0.03 }, { at: '2026-10-21T10:00:00', provider: 'dataforseo', cost: 5 }, { at: '2026-10-22T10:00:00', provider: 'semrush', cost: null }]
  assert.deepEqual(spentToday(E, 'dataforseo', now), { requests: 2, usd: 0.05 })
  assert.equal(capReason({ caps: {}, entries: E }, 'dataforseo', now), null)
  assert.match(capReason({ caps: { dataforseo: 0.05 }, entries: E }, 'dataforseo', now), /DataForSEO spend \(\$0\.050\) has reached your daily cap of \$0\.05\./)
  assert.equal(capReason({ caps: { dataforseo: 0.06 }, entries: E }, 'dataforseo', now), null)
  assert.match(capReason({ caps: { semrush: 1 }, entries: E }, 'semrush', now), /1 Semrush requests have reached your daily cap of 1/)
  const mem = {}
  globalThis.chrome = { storage: { local: { get: async (k) => ({ [k]: mem[k] }), set: async (o) => Object.assign(mem, o) } } }
  const calls = []
  const api = guard('dataforseo', { test: async () => 'free', run: async (x) => billed('dataforseo', 'serp', async () => { calls.push(x); return { cost: 0.04 } }, (r) => r.cost) })
  await api.run(1)
  assert.deepEqual([calls, mem.ledger.entries.length, mem.ledger.entries[0].cost, mem.ledger.entries[0].ok], [[1], 1, 0.04, true])
  mem.ledger.caps = { dataforseo: 0.04 }
  await assert.rejects(api.run(2), /daily cap of \$0\.04\. Raise or clear it in Settings › Spend/)
  assert.deepEqual(calls, [1], 'capped call never reaches the provider')
  assert.equal(await api.test(), 'free', 'test calls are never capped')
  await assert.rejects(guard('semrush', { go: async () => billed('semrush', 'x', async () => { throw new Error('boom') }) }).go(), /boom/)
  assert.deepEqual([mem.ledger.entries.at(-1).ok, mem.ledger.entries.at(-1).error], [false, 'boom'])
  globalThis.chrome = { storage: { local: { get: async () => { throw new Error('disk') }, set: async () => {} } } }
  await assert.rejects(api.run(3), /couldn’t read its spend ledger, so the paid call was not sent/)
  assert.deepEqual(calls, [1])
  delete globalThis.chrome
}

// ---- retired rich results and merchant listing fields
{
  const sch = (types, nodes = []) => ({ ...d, schema: { ...d.schema, types, jsonLd: nodes.map((n) => ({ ok: true, data: n })) } })
  const r1 = rules(sch(['FAQPage', 'HowTo', 'Article']))
  assert.deepEqual(r1.filter((i) => i.id === 'schema.retired').map((i) => i.msg), ['FAQPage no longer produces a Google rich result (retired 7 May 2026)', 'HowTo no longer produces a Google rich result (retired September 2023)'])
  const prod = rules(sch(['Product'], [{ '@type': 'Product', name: 'Shoe', image: 'x', offers: { price: 1, priceCurrency: 'USD', availability: 'InStock' }, aggregateRating: {} }]))
  assert.match(prod.find((i) => i.id === 'schema.missing_recommended')?.msg ?? '', /brand\.name or brand, gtin or .*sku, offers\.shippingDetails, offers\.hasMerchantReturnPolicy/)
  assert.ok(rules({ ...d, hiddenChars: 3 }).some((i) => i.id === 'content.hidden_chars' && /3 invisible characters/.test(i.msg)))
}

// ---- agent readiness
{
  assert.deepEqual(evaluateLlms({ status: 404 }).verdict, 'missing')
  assert.match(evaluateLlms({ status: 200, type: 'text/html', text: '<!doctype html><html>' }).errors[0], /catch-all/)
  const good = evaluateLlms({ status: 200, type: 'text/plain', text: '# Smile Co\n\n> Family dentist in Austin.\n\n## Pages\n\n- [Services](https://smile.co/services): what we do\n' })
  assert.deepEqual([good.verdict, good.notes], ['pass', []])
  assert.deepEqual(evaluateLlms({ status: 200, type: 'text/plain', text: 'hello' }).errors, ['no H1 title (“# Title”)', 'no Markdown links', 'shorter than 50 characters'])
  const rs = robotsSignals('User-agent: *\nContent-Signal: search=yes, ai-input=yes, ai-train=no\nContent-Signal: foo=maybe\nAgentmap: https://a.com/ai-catalog.json\n')
  assert.deepEqual([rs.contentSignal[0], rs.problems, rs.agentmap], [{ search: 'yes', 'ai-input': 'yes', 'ai-train': 'no' }, ['foo=maybe'], ['https://a.com/ai-catalog.json']])
  const probe = { llms: { status: 404 }, llmsFull: { status: 404 }, catalog: { status: 200, type: 'application/json', text: '{}' }, apiCatalog: { status: 404 }, agentCard: { status: 200, type: 'text/html', text: '<html>' },
    markdown: { status: 200, type: 'text/markdown; charset=utf-8', vary: 'Accept' }, mdAlternate: null, catalogLink: null, webmcp: { api: false, registerTool: 2, forms: 3, annotatedForms: 1 } }
  const ev = Object.fromEntries(evaluateAgent(probe, '').map((c) => [c.label, c]))
  assert.deepEqual([ev['/llms.txt'].status, ev['Markdown version of this page'].status, ev['AI catalog (ai-catalog.json)'].status, ev['Agent card'].status, ev['WebMCP tools'].status], ['info', 'good', 'good', 'info', 'good'])
  assert.match(ev['Markdown version of this page'].detail, /Vary: Accept set/)
  assert.match(ev['WebMCP tools'].detail, /2 registerTool\(\) call\(s\) in inline scripts, 1 of 3 forms/)
}

// ---- PageSpeed / Lighthouse, Open PageRank, Natural Language, IndexNow, GA4, Moz, DataForSEO extras, CrUX LCP parts
{
  const lhr = { lighthouseVersion: '13.5.0', finalDisplayedUrl: 'https://a.com/', categories: { performance: { score: 0.91 }, seo: { score: 1 }, accessibility: { score: null }, 'agentic-browsing': { auditRefs: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }, { id: 'a4', group: 'hidden' }, { id: 'a5' }] } },
    audits: { a1: { score: 1, scoreDisplayMode: 'binary', title: 'A1' }, a2: { score: 0, scoreDisplayMode: 'binary', title: 'Has llms.txt' }, a3: { scoreDisplayMode: 'notApplicable' }, a4: { score: 0, scoreDisplayMode: 'binary' }, a5: { score: 0.5, scoreDisplayMode: 'informative' },
      'largest-contentful-paint': { numericValue: 2100 }, 'cumulative-layout-shift': { numericValue: 0.02 }, 'render-blocking-resources': { title: 'Eliminate render-blocking resources', details: { type: 'opportunity', overallSavingsMs: 640 } }, 'unused-js': { title: 'Reduce unused JavaScript', details: { type: 'opportunity', overallSavingsMs: 0 } } } }
  const ps = parsePsi({ lighthouseResult: lhr, loadingExperience: { overall_category: 'FAST' } })
  assert.deepEqual(ps.scores, { performance: 91, seo: 100, accessibility: null })
  assert.deepEqual(ps.agentic, { passed: 1, counted: 2, failed: ['Has llms.txt'] })
  assert.deepEqual([ps.lab.lcp, ps.lab.cls, ps.savings, ps.field, ps.version], [2100, 0.02, [{ id: 'render-blocking-resources', title: 'Eliminate render-blocking resources', savingsMs: 640 }], 'FAST', '13.5.0'])
  assert.equal(agenticFraction({ categories: {} }), null)
  assert.deepEqual(parseOpr({ results: [{ domain: 'a.com', found: true, open_page_rank: 4.5, rank: 9000, referring_domains: 120 }, { domain: 'b.com', found: false }] }), [{ domain: 'a.com', found: true, pageRank: 4.5, rank: 9000, refDomains: 120 }, { domain: 'b.com', found: false, pageRank: null, rank: null, refDomains: null }])
  assert.deepEqual(parseEntities({ entities: [{ name: 'B', type: 'ORGANIZATION', salience: 0.1 }, { name: 'A', type: 'PERSON', salience: 0.6, metadata: { wikipedia_url: 'w' }, mentions: [1, 2] }] }).map((e) => [e.name, e.wikipedia, e.mentions]), [['A', 'w', 2], ['B', null, 0]])
  assert.deepEqual(parseCategories({ categories: [{ name: '/Health', confidence: 0.8 }] }), [{ name: '/Health', confidence: 0.8 }])
  assert.ok(validIndexNowKey('a1b2c3d4') && !validIndexNowKey('short') && !validIndexNowKey('has space here'))
  assert.match(indexNowMessage(403), /key file was not found/); assert.match(indexNowMessage(202), /validating/); assert.match(indexNowMessage(500), /HTTP 500/)
  assert.deepEqual(parseGa4Properties({ accountSummaries: [{ displayName: 'Acme', propertySummaries: [{ property: 'properties/1', displayName: 'Site' }] }] }), [{ id: 'properties/1', name: 'Site', account: 'Acme' }])
  const ga = parseGa4Report({ dimensionHeaders: [{ name: 'landingPagePlusQueryString' }, { name: 'dateRange' }], metricHeaders: [{ name: 'sessions' }, { name: 'engagedSessions' }, { name: 'keyEvents' }],
    rows: [{ dimensionValues: [{ value: '/a' }, { value: 'date_range_0' }], metricValues: [{ value: '10' }, { value: '6' }, { value: '1' }] }, { dimensionValues: [{ value: '/a' }, { value: 'date_range_1' }], metricValues: [{ value: '7' }, { value: '3' }, { value: '0' }] }, { dimensionValues: [{ value: '/b' }, { value: 'date_range_0' }], metricValues: [{ value: '30' }, { value: '9' }, { value: '2' }] }, { dimensionValues: [{ value: '/old' }, { value: 'date_range_1' }], metricValues: [{ value: '5' }, { value: '1' }, { value: '0' }] }] })
  assert.deepEqual(ga.map((p) => [p.page, p.cur.sessions, p.prev?.sessions ?? null]), [['/b', 30, null], ['/a', 10, 7]])
  assert.deepEqual(parseMozMetrics({ results: [{ domain_authority: 41, page_authority: 38, spam_score: 2, root_domains_to_root_domain: 300, external_pages_to_root_domain: 5000 }] }), { backlinks: 5000, refDomains: 300, rating: 41, ratingName: 'Moz Domain Authority', pageAuthority: 38, mozSpam: 2 })
  assert.deepEqual(parseMozDomains({ results: [{ root_domain: 'news.example', domain_authority: 70, spam_score: 1, to_target: { pages: 4 } }] }), [{ domain: 'news.example', backlinks: 4, rating: 70, spam: 1, firstSeen: null }])
  assert.deepEqual(parseSerpUrls([{ items: [{ type: 'organic', url: 'https://a/1' }, { type: 'people_also_ask' }, { type: 'organic', url: 'https://b/2' }] }]), ['https://a/1', 'https://b/2'])
  const maps = [{ items: [{ type: 'maps_search', rank_group: 1, title: 'Rival Dental', domain: 'rival.com' }, { type: 'maps_search', rank_group: 2, title: 'Smile Co Dentistry', domain: 'www.smileco.com' }] }]
  assert.deepEqual(parseMaps(maps, 'smileco.com'), { position: 2, title: 'Smile Co Dentistry', top: ['Rival Dental', 'Smile Co Dentistry'] })
  assert.equal(parseMaps(maps, 'smile co').position, 2); assert.equal(parseMaps(maps, 'nobody').position, null)
  const cr = parseRecord({ record: { metrics: { largest_contentful_paint: { percentiles: { p75: 2600 }, histogram: [] }, largest_contentful_paint_image_time_to_first_byte: { percentiles: { p75: 600 } }, largest_contentful_paint_image_resource_load_delay: { percentiles: { p75: 900 } }, largest_contentful_paint_image_resource_load_duration: { percentiles: { p75: '400' } }, largest_contentful_paint_image_element_render_delay: { percentiles: { p75: 700 } } } } })
  assert.deepEqual(cr.lcpParts, { ttfb: 600, loadDelay: 900, loadDuration: 400, renderDelay: 700 })
  assert.equal(parseRecord({ record: { metrics: {} } }).lcpParts, null)
}

// ---- site analysis, generators, SERP clusters, live-link check, geo grid, trust signals
{
  const P = (url, title, words = 120, extra = {}) => ({ url, finalUrl: url, status: 200, type: 'text/html', title, words, ...extra })
  const cities = ['austin', 'dallas', 'houston', 'boston', 'denver', 'miami', 'tampa', 'reno'].map((c) => P(`https://a.com/dentists/${c}`, `Best dentists in ${c} | A`))
  const ps = [...cities, P('https://a.com/', 'Home', 900), ...['1', '2', '3'].map((n) => P(`https://a.com/deals/casino-bonus-${n}`, `Casino bonus ${n}`)), P('https://a.com/x', 'X', 400, { robots: 'noindex' }), P('https://a.com/y', 'Y', 400, { canonical: 'https://a.com/' })]
  const t = templates(ps)
  assert.deepEqual([t[0].template, t[0].pages, t[0].thin, t[0].slugOnlyTitles], ['/dentists/{slug}', 8, 8, 7])
  assert.equal(templateProblems(t[0]).length, 2)
  assert.deepEqual(parasiteRisk(ps).map((s) => [s.section, s.risky.length, s.terms]), [['/deals', 3, ['casino']]])
  assert.ok(!sitemapCandidates(ps).includes('https://a.com/x') && !sitemapCandidates(ps).includes('https://a.com/y') && sitemapCandidates(ps).includes('https://a.com/'))
  assert.deepEqual(topicShift({ title: 'Smith Veterinary Clinic Ohio' }, { title: 'Best crypto casino bonuses' }), { shared: [], shift: true })
  assert.equal(topicShift({ title: 'Home' }, { title: 'Crypto' }).shift, false, 'too little text to call a shift')
  assert.match(sitemapXml(['https://a.com/?a=1&b=<2>']), /<loc>https:\/\/a\.com\/\?a=1&amp;b=&lt;2&gt;<\/loc>/)
  const hs = hreflangSet([{ lang: 'en', url: 'https://a.com/' }, { lang: 'EN', url: 'https://a.com/x' }, { lang: 'english', url: '/fr' }])
  assert.deepEqual(hs.problems, ['“english” is not a valid code (use en, en-GB, x-default…)', '/fr must be an absolute URL', 'en is listed more than once', 'no x-default (recommended for the language picker or fallback page)'])
  assert.match(hreflangSet([{ lang: 'de', url: 'https://a.com/de/' }]).sitemap, /<xhtml:link rel="alternate" hreflang="de" href="https:\/\/a\.com\/de\/" \/>/)
  const evil = { ...d, title: 'A </script><img onerror=x>', description: 'd', social: { 'og:site_name': 'Shop' }, links: [{ href: 'https://www.linkedin.com/company/shop', internal: false }] }
  for (const type of SCHEMA_TEMPLATES) { const out = schemaTemplate(type, evil); assert.ok(out.startsWith('<script type="application/ld+json">') && !/<\/script><img/.test(out), `${type} escapes page text`); JSON.parse(out.split('\n').slice(1, -1).join('\n')) }
  assert.match(schemaTemplate('Organization', evil), /linkedin\.com\/company\/shop/)
  assert.equal(schemaTemplate('FAQPage', evil), null); assert.ok(isRetired('FAQPage') && !isRetired('QAPage'))
  assert.equal(disavowFile([{ domain: 'B.example' }, { url: 'https://c.example/p' }, { domain: 'b.example' }]).split('\n').slice(1).join('|'), 'domain:b.example|https://c.example/p|')
  assert.match(comparisonOutline('smile.co', 'rival.com', ['dentist austin']), /^# smile\.co vs rival\.com[\s\S]*\| Price \|[\s\S]*- dentist austin[\s\S]*Not FAQPage/)
  const brief = contentBrief('teeth whitening', [{ url: 'https://a/1', title: 'A', words: 1200, headings: [{ level: 2, text: 'How much does it cost?' }, { level: 2, text: 'Risks' }], schemaTypes: ['Article', 'FAQPage'] }, { url: 'https://a/2', title: 'B', words: 1600, headings: [{ level: 2, text: 'risks' }], schemaTypes: ['Article'] }], [{ term: 'enamel' }])
  assert.match(brief, /- Risks \(2 of 2\)/); assert.match(brief, /- How much does it cost\?/); assert.match(brief, /- enamel/); assert.ok(!/FAQPage/.test(brief), 'retired types left out of the brief')
  const hl = health(d), g = geo(d)
  assert.match(auditMarkdown(d, hl, g), new RegExp(`^# SEO audit: ${d.url.replace(/[.?]/g, '\\$&')}[\\s\\S]*Page health: \\*\\*${hl.score}/100`))
  const aj = JSON.parse(auditJson(d, hl, g)); assert.deepEqual([aj.tool, aj.health.score, aj.health.issues.length, aj.ai.score], ['Refract SEO', hl.score, hl.list.length, g.score])
  const U = (...xs) => ({ urls: xs.map((x) => `https://${x}/`) })
  assert.deepEqual(serpClusters([{ keyword: 'a', volume: 5, serp: U('1', '2', '3', '4') }, { keyword: 'b', volume: 9, serp: U('1', '2', '3?x', '9') }, { keyword: 'c', serp: U('7', '8', '9', '10') }, { keyword: 'd' }]).map((x) => [x.head, x.members.map((m) => m.keyword)]), [['b', ['b', 'a']], ['c', ['c']]])
  const page = '<a href="/x">x</a><a href="https://www.target.com/page/?utm=1">t</a>'
  assert.equal(linkPresent(page, 'https://blog.example/post', 'https://target.com/page'), true)
  assert.equal(linkPresent(page, 'https://blog.example/post', 'target.com'), true)
  assert.equal(linkPresent(page, 'https://blog.example/post', 'https://target.com/other'), false)
  assert.equal(linkPresent('', 'https://b/', 'target.com'), null)
  const gp = gridPoints(30.2672, -97.7431, 3, 1)
  assert.deepEqual([gp.length, gp[4].lat, gp[4].lng], [9, 30.2672, -97.7431]); assert.ok(Math.abs(gp[0].lat - gp[4].lat - 1 / 110.574) < 1e-5)
  const tr = Object.fromEntries(eeatSignals({ ...d, author: 'Sam', hiddenChars: 2, links: [{ href: 'https://shop.example.co.uk/about-us', text: 'About', internal: true }, { href: 'https://nih.gov/x', internal: false }, { href: 'https://who.int/y', internal: false }] }).map((s) => [s.label.split(':')[0], s.ok]))
  assert.deepEqual([tr['Author named'], tr['Links to an About page'], tr['Links to a Contact page'], tr['2 followed links to other sites (sources)'], tr['2 invisible characters in the text']], [true, true, false, true, false])
}
console.log('sss self-check: ok')
