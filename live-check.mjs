// Live shape check: every provider call Refract makes, through the real adapters and parsers in providers.js.
//   node live-check.mjs dataforseo [--live]   sandbox.dataforseo.com by default (free, demo data); --live uses credit
//   node live-check.mjs semrush               real API, tiny row limits: a few hundred API units
//   node live-check.mjs ahrefs                real API; targets ahrefs.com (free test target) except the keyword lookup
// Credentials: env vars, or ~/.refract-keys (chmod 600) with DFS_LOGIN, DFS_PASSWORD, SEMRUSH_KEY, AHREFS_KEY lines.
// Values are never printed.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { API } from './providers.js'
import { MARKETS } from './keys.js'
import { judge, verdict } from './aivis.js'

const provider = process.argv[2], live = process.argv.includes('--live')
const fileVars = (name) => { try { return readFileSync(`${homedir()}/${name}`, 'utf8').split('\n').map((l) => l.trim().split('=')).filter(([k, v]) => k && v) } catch { return [] } }
const env = { ...Object.fromEntries([...fileVars('.refract-dfs'), ...fileVars('.refract-keys')]), ...process.env }
const CREDS = { dataforseo: { login: env.DFS_LOGIN, password: env.DFS_PASSWORD }, semrush: { key: env.SEMRUSH_KEY }, ahrefs: { key: env.AHREFS_KEY } }
const c = CREDS[provider]
if (!c) { console.error('Usage: node live-check.mjs dataforseo|semrush|ahrefs [--live]'); process.exit(2) }
if (Object.values(c).some((v) => !v)) { console.error(`Missing credentials for ${provider} (env or ~/.refract-keys).`); process.exit(2) }
if (provider === 'dataforseo' && !live) { const real = globalThis.fetch; globalThis.fetch = (url, init) => real(String(url).replace('https://api.dataforseo.com', 'https://sandbox.dataforseo.com'), init) }

const api = API[provider], m = MARKETS.us
const domain = provider === 'ahrefs' ? 'ahrefs.com' : provider === 'semrush' ? 'semrush.com' : 'dataforseo.com', seed = 'seo tools'
const isNum = (v) => v == null || typeof v === 'number'
const isStr = (v) => typeof v === 'string' && v.length > 0
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v ?? '')
let failed = 0
async function check(name, run, shape) {
  try {
    const r = await run()
    const problems = shape(r).filter(([, ok]) => !ok).map(([what]) => what)
    if (problems.length) failed++
    console.log(`${problems.length ? '✗' : '✓'} ${name}${problems.length ? ` — shape: ${problems.join('; ')}` : ''}`)
  } catch (e) { failed++; console.log(`✗ ${name} — ${e.message}`) }
}
const kwShape = (rows) => [['has rows', rows.length > 0], ['keyword is text', rows.every((r) => isStr(r.keyword))], ['volume/kd/cpc numeric', rows.every((r) => isNum(r.volume) && isNum(r.kd) && isNum(r.cpc))], ['some volume', rows.some((r) => r.volume != null)], ['trend array', rows.every((r) => !r.trend || Array.isArray(r.trend))]]

console.log(`${provider}${provider === 'dataforseo' ? (live ? ' LIVE (costs credit)' : ' sandbox') : ''} · market ${m.label} · target ${domain}\n`)
await check('connection test', () => api.test(c), (r) => [['status text', isStr(r)]])
if (api.rank) await check('rank (mobile, top 10)', () => api.rank(c, seed, domain, m, { device: 'mobile', depth: 10 }), (r) => [['position numeric/null', isNum(r.position)], ['features array', Array.isArray(r.features)]])
await check('keyword metrics', () => api.keywords(c, [seed], m), kwShape)
for (const mode of provider === 'dataforseo' ? ['related', 'suggestions', 'ideas', 'ads'] : provider === 'semrush' ? ['related'] : []) {
  await check(`discover: ${mode}`, () => api.discover(c, mode, seed, m, { limit: provider === 'semrush' ? 3 : 10 }), (r) => [...kwShape(r.rows), ['intent text/null', r.rows.every((x) => x.intent == null || isStr(x.intent))], ['total numeric/null', isNum(r.total)]])
}
await check('ranked keywords', () => api.rankedKeywords(c, domain, m, 3), (rows) => [['has rows', rows.length > 0], ['keyword text', rows.every((r) => isStr(r.keyword))], ['position number', rows.every((r) => typeof r.position === 'number')], ['url text', rows.every((r) => isStr(r.url))]])
await check('domain overview', () => api.overview(c, domain, m), (r) => [['keywords number', typeof r.keywords === 'number'], ['traffic number', typeof r.traffic === 'number'], ['value number/null', isNum(r.value)]])
await check('backlinks summary', () => api.backlinks(c, domain, 3), (r) => [['backlinks number', typeof r.backlinks === 'number'], ['ref domains number', typeof r.refDomains === 'number'], ['rating number', typeof r.rating === 'number'], ['top domains', r.top.length > 0 && r.top.every((t) => isStr(t.domain))], ['first seen date', r.top.some((t) => isDay(t.firstSeen))]])
await check('backlink rows', () => api.backlinkRows(c, domain, { limit: 3 }), (r) => [['has rows', r.rows.length > 0], ['from/to urls', r.rows.every((x) => isStr(x.from) && isStr(x.to))], ['from domain', r.rows.every((x) => isStr(x.fromDomain))], ['follow boolean', r.rows.every((x) => typeof x.follow === 'boolean')], ['first seen date', r.rows.every((x) => isDay(x.firstSeen))]])
if (api.aiAnswer) for (const engine of ['google_aio', 'google_ai_mode', 'chatgpt', 'perplexity']) {
  await check(`AI answer: ${engine}`, async () => { const a = await api.aiAnswer(c, engine, 'best seo api for rank tracking', m); return { a, j: judge(a, { domain, brand: ['DataForSEO'], competitors: ['semrush.com'] }) } },
    ({ a, j }) => { console.log(`    → ${verdict(j)[1]} · shown ${a.shown} · ${a.citations == null ? 'no sources' : `${a.citations.length} sources`} · ${a.text.length} chars${a.model ? ` · ${a.model}` : ''}`)
      return [['judged ok', j.ok], ['text when shown', !a.shown || isStr(a.text)], ['citations urls', a.citations == null || a.citations.every((x) => isStr(x.url) && isStr(x.domain))]] })
}
console.log(`\n${failed ? `${failed} check(s) failed` : 'all checks passed'}`)
process.exit(failed ? 1 : 0)
