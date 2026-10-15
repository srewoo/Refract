// Node check for the Search Console period comparison and the on-page link checker: `node checks-gsc-links.mjs`.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { change, compare } from './gsc.js'
import { checkLinks, classify, targetKey, uniqueTargets } from './linkcheck.js'

// --- Search Console: split at the first current-period day, attach previous query rows
const daily = [['2026-08-20', 4, 100, 10], ['2026-09-01', 6, 100, 8], ['2026-09-20', 15, 200, 5], ['2026-10-01', 5, 100, 4]].map(([d, clicks, impressions, position]) => ({ keys: [d], clicks, impressions, position }))
const r = compare(daily, [{ keys: ['shoes'], clicks: 12, impressions: 200, ctr: 0.06, position: 3 }, { keys: ['boots'], clicks: 1, impressions: 9, ctr: 0.1, position: 9 }],
  [{ keys: ['shoes'], clicks: 8, impressions: 150, ctr: 0.05, position: 6 }], 'u', '2026-09-15')
assert.deepEqual([r.clicks, r.impressions, r.daily.length], [20, 300, 2], 'current period = rows on/after split')
assert.deepEqual([r.previous.clicks, r.previous.impressions, r.previous.position], [10, 200, 9], 'previous period, impression-weighted position')
assert.deepEqual(r.queries[0].prev, { clicks: 8, position: 6 }); assert.equal(r.queries[1].prev, null, 'query new this period')
assert.equal(change(20, 10), 1); assert.equal(change(5, 0), null); assert.equal(change(null, 3), null)
assert.equal(compare(daily.slice(2), [], [], 'u', '2026-09-15').previous, null, 'no previous data → null, not zeros')

// --- link checker: pure parts
assert.deepEqual(uniqueTargets([{ href: 'https://a.com/x#top' }, { href: 'https://a.com/x' }, { href: 'mailto:a@b.c' }, { href: 'javascript:void 0' }]), ['https://a.com/x'])
assert.equal(targetKey('tel:123'), null)
assert.deepEqual([200, 0, 301, 403, 429, 404, 500, null].map(classify), ['ok', 'redirect', 'redirect', 'restricted', 'restricted', 'broken', 'broken', 'error'])

// --- link checker against a real server
const srv = createServer((q, s) => {
  const code = { '/ok': 200, '/moved': 301, '/gone': 404, '/forbid': 403, '/err': 500 }[q.url]
  if (q.url === '/nohead') { s.writeHead(q.method === 'HEAD' ? 405 : 200); s.end('x'); return }
  s.writeHead(code ?? 404, code === 301 ? { location: '/ok' } : {}); s.end('x')
}).listen(0)
const base = `http://127.0.0.1:${srv.address().port}`
const seen = []
const res = await checkLinks(['/ok', '/moved', '/gone', '/forbid', '/err', '/nohead', '/ok#dup'].map((p) => ({ href: base + p })).concat({ href: 'http://127.0.0.1:1/dead' }), (u, x, done, total) => seen.push([done, total]))
const out = Object.fromEntries([...res].map(([u, x]) => [u.replace(base, '').replace('http://127.0.0.1:1', ''), `${x.outcome}:${x.status}`]))
assert.deepEqual(out, { '/ok': 'ok:200', '/moved': 'redirect:301', '/gone': 'broken:404', '/forbid': 'restricted:403', '/err': 'broken:500', '/nohead': 'ok:200', '/dead': 'error:null' })
assert.deepEqual(seen.at(-1), [7, 7], 'progress reaches total; #fragment duplicate collapsed')
srv.close()
console.log('gsc + linkcheck checks OK')
