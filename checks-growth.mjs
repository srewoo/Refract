// Node check for Opportunities (opps.js) and How-to-fix (fixes.js): `node checks-growth.mjs`.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { aiOpps, coverage, expectedCtr, gapOpps, pageOpps, plan, queryOpps, ranked } from './opps.js'
import { PLATFORMS, fixFor, forPlatform, kindOf, platformOf } from './fixes.js'

const page = (o = {}) => ({ url: 'https://shop.example.com/blog/trail-shoes', host: 'shop.example.com', title: 'Trail running shoes guide', description: 'How to pick trail shoes.', lang: 'en', canonical: '',
  headings: [{ level: 1, text: 'Trail running shoes' }, { level: 2, text: 'How to choose' }], words: 'trail running shoes grip cushion choose'.split(' '), wordCount: 650,
  links: [{ internal: true, href: '/a' }], images: [], schema: { jsonLd: [], types: [], microdata: [] }, social: {}, structure: { lists: 0, tables: 0, questionHeadings: 0 }, ...o })
const d = page()

// --- coverage: which query words the page already uses
const cov = coverage('best waterproof trail running shoes', d)
assert.deepEqual([cov.title, cov.heading, cov.missing], [false, false, ['waterproof']])
assert.equal(coverage('trail running shoes', d).title, true)
assert.equal(expectedCtr(1), 0.28); assert.equal(expectedCtr(14), 0.01); assert.equal(expectedCtr(40), 0.002)

// --- Search Console query opportunities: one per query, right kind, gain sized by impressions
const row = (query, clicks, impressions, position, prev = null) => ({ query, clicks, impressions, ctr: clicks / impressions, position, prev })
const ops = queryOpps([
  row('waterproof trail shoes', 6, 400, 7.2),             // striking distance
  row('trail running shoes', 4, 300, 2.1),                // low CTR at #2 (1.3% vs ~15%)
  row('trail shoe sizing', 3, 90, 5, { clicks: 20, position: 3 }), // declining
  row('ultra marathon nutrition', 0, 120, 34),           // deep: page only touches it
  row('rare query', 0, 5, 8),                             // below the impression floor
], d)
assert.deepEqual(ops.map((o) => [o.query, o.kind]), [['waterproof trail shoes', 'striking'], ['trail running shoes', 'low_ctr'], ['trail shoe sizing', 'declining'], ['ultra marathon nutrition', 'deep']])
assert.equal(ops[0].gain, Math.round(400 * (0.11 - 6 / 400)))
assert.ok(ops[0].actions.some((a) => /title/.test(a)) && ops[0].actions.some((a) => /waterproof/.test(a)), 'striking actions name the missing title + words')
assert.equal(ops[2].gain, 17)
// new queries: flagged only when the previous period had data and the query wasn't in it
const fresh = queryOpps([row('waterproof trail shoes', 6, 400, 7.2), row('trail shoe sizing', 9, 90, 5, { clicks: 8, position: 6 })], d, { hadPrevious: true })
assert.deepEqual(fresh.map((o) => [o.query, !!o.fresh]), [['waterproof trail shoes', true], ['trail shoe sizing', false]])
assert.match(fresh[0].why, /^New this period\. /)
assert.ok(queryOpps([row('waterproof trail shoes', 6, 400, 7.2)], d).every((o) => !o.fresh), 'no previous-period data: nothing is new')

// --- AI Overview observations: latest per query, only where it doesn't cite you, only this domain
const obs = [
  { domain: 'example.com', query: 'trail shoes', at: '2026-10-01T00:00:00Z', aio: true, cites: true, sources: ['a.com'], rank: 3 },
  { domain: 'example.com', query: 'trail shoes', at: '2026-10-10T00:00:00Z', aio: true, cites: false, sources: ['rei.com', 'runnersworld.com'], rank: 4 },
  { domain: 'example.com', query: 'no overview', at: '2026-10-10T00:00:00Z', aio: false, cites: false, sources: [], rank: 1 },
  { domain: 'other.com', query: 'trail shoes', at: '2026-10-10T00:00:00Z', aio: true, cites: false, sources: ['x.com'], rank: 0 },
]
const ai = aiOpps(obs, 'example.com')
assert.equal(ai.length, 1); assert.match(ai[0].why, /rei\.com, runnersworld\.com, not you, although you rank #4/)

// --- page additions and competitor gaps
assert.deepEqual(pageOpps(d).map((o) => o.kind), ['depth', 'questions', 'scannable', 'internal', 'sources', 'media'])
const art = page({ wordCount: 1500, structure: { lists: 2, tables: 1, questionHeadings: 3 }, links: [1, 2, 3, 4, 5].map((i) => ({ internal: true, href: `/${i}` })).concat({ internal: false, href: 'https://nih.gov' }), images: [{ src: '/x.jpg' }],
  schema: { types: ['Article'], microdata: [], jsonLd: [{ ok: true, data: { '@type': 'Article', headline: 'x', dateModified: '2024-01-01' } }] } })
assert.deepEqual(pageOpps(art).map((o) => o.kind), ['fresh', 'author'], 'stale article without author; nothing else to add')
assert.equal(gapOpps(null).length, 0)
assert.match(gapOpps({ at: '2026-10-12T00:00:00Z', gaps: ['gore tex', 'heel drop'], competitors: ['a', 'b'] })[0].actions[0], /gore tex, heel drop/)

// --- ranking + plan: measured gains first, largest first
const all = ranked([...pageOpps(d), ...ai, ...ops])
assert.deepEqual(all.slice(0, 4).map((o) => o.kind), ['low_ctr', 'striking', 'declining', 'deep']) // gains ≈ 41, 38, 17, 3
assert.equal(all[4].kind, 'ai_overview')
assert.match(plan(d.url, all), /^# SEO opportunities: https:\/\/shop\.example\.com\/blog\/trail-shoes\n\n## 1\. Win more clicks for “trail running shoes” \(≈ \+/)

// --- How to fix: every check the engine can raise has a fix (except ones with no code-level fix)
const ruleIds = [...readFileSync('rules.js', 'utf8').matchAll(/add\(['`]([a-z_.$`{}A-Z()]+?)['`],/g)].map((m) => m[1]).filter((id) => !id.includes('$'))
const kinds = [...readFileSync('analyze.js', 'utf8').matchAll(/, '([a-z_.]+)'\)$/gm)].map((m) => m[1])
const NO_FIX = new Set(['robots.noarchive', 'perf.inp_slow', 'schema.retired', 'content.hidden_chars', 'canonical.og_url_mismatch'])
const missing = [...ruleIds.map((id) => ({ id })), ...kinds.map((kind) => ({ kind }))].filter((i) => !NO_FIX.has(i.id) && !kindOf(i))
assert.deepEqual(missing, [], 'every issue maps to a fix')
assert.ok(ruleIds.length > 40 && kinds.length >= 15, `found ${ruleIds.length} rule ids, ${kinds.length} kinds`)
const evil = page({ title: 'A "quoted" </script><b>x', headings: [{ level: 1, text: '</script><img onerror=x>' }] })
for (const kind of ['title', 'description', 'canonical', 'social', 'lang', 'indexable', 'schema', 'schema.no_breadcrumb', 'sitemap.missing', 'robots_txt', 'http.redirected', 'img.lazy_above_fold', 'h1'])
  for (const p of Object.keys(PLATFORMS)) {
    const e = forPlatform(fixFor({ kind }, evil), p)
    assert.ok(e.steps || e.code, `${kind}/${p} has content`)
    if (/ld\+json/.test(e.code ?? '')) assert.ok(!/<\/script><img|<\/script><b>/.test(e.code.split('ld+json')[1].split('</script>\n')[0]), `${kind}/${p}: page text can't close the script`)
  }
assert.match(forPlatform(fixFor({ kind: 'title' }, evil), 'html').code, /<title>A &quot;quoted&quot; &lt;\/script>&lt;b>x<\/title>/, 'HTML-escaped')
assert.match(forPlatform(fixFor({ kind: 'title' }, evil), 'next').code, /title: "A \\"quoted\\" <\/script><b>x"/, 'JS string-escaped')
assert.equal(platformOf('spa'), 'html'); assert.equal(platformOf('wordpress'), 'wordpress')
console.log(`growth checks OK · ${ruleIds.length} rule ids + ${kinds.length} basic checks all have a fix (except ${NO_FIX.size} with none)`)
