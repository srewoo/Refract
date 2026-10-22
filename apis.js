// Key-based Google and open APIs outside the ranks/keywords/backlinks capabilities: PageSpeed Insights (Lighthouse),
// Open PageRank, Cloud Natural Language, IndexNow and Google Analytics 4. Parsers are pure and exported for tests.
// Paid or quota'd calls go through billed(), so they appear in Settings › Spend.
import { fetchJson } from './http.js'
import { billed } from './ledger.js'

const googleErr = async (r, what) => { const j = await r.json().catch(() => ({})); return new Error(`${what}: ${j.error?.message ?? `HTTP ${r.status}`}`) }

// ---------------- PageSpeed Insights v5 (Lighthouse in Google's data centre) ----------------
const PSI = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
const CATS = ['PERFORMANCE', 'ACCESSIBILITY', 'BEST_PRACTICES', 'SEO']
/** Lighthouse's own pass bar (ReportUtils.showAsPassed): score ≥ 0.9. */
const passes = (a) => a.scoreDisplayMode !== 'error' && a.score != null && a.score >= 0.9
/** Agentic Browsing is reported as a fraction, the way the Lighthouse report counts it (ReportUtils.calculateCategoryFraction). */
export function agenticFraction(lhr) {
  const cat = lhr?.categories?.['agentic-browsing']
  if (!cat) return null
  let passed = 0, counted = 0
  const failed = []
  for (const ref of cat.auditRefs ?? []) {
    const a = lhr.audits?.[ref.id]
    if (!a || ref.group === 'hidden' || ['manual', 'notApplicable', 'informative'].includes(a.scoreDisplayMode)) continue
    counted++
    if (passes(a)) passed++; else failed.push(a.title ?? ref.id)
  }
  return { passed, counted, failed }
}
/** PSI response → scores (0–100), lab metrics, biggest savings, Agentic Browsing fraction and field verdict. */
export function parsePsi(j) {
  const lhr = j.lighthouseResult ?? {}, au = lhr.audits ?? {}
  const num = (id) => au[id]?.numericValue ?? null
  const scores = Object.fromEntries(Object.entries(lhr.categories ?? {}).filter(([id]) => id !== 'agentic-browsing').map(([id, c]) => [id, c.score == null ? null : Math.round(c.score * 100)]))
  const savings = Object.entries(au).filter(([, a]) => a.details?.type === 'opportunity' && a.details.overallSavingsMs > 0)
    .map(([id, a]) => ({ id, title: a.title, savingsMs: Math.round(a.details.overallSavingsMs) })).sort((a, b) => b.savingsMs - a.savingsMs).slice(0, 6)
  return { version: lhr.lighthouseVersion ?? null, url: lhr.finalDisplayedUrl ?? lhr.finalUrl ?? j.id ?? null, scores,
    lab: { fcp: num('first-contentful-paint'), lcp: num('largest-contentful-paint'), tbt: num('total-blocking-time'), cls: num('cumulative-layout-shift'), si: num('speed-index') },
    savings, agentic: agenticFraction(lhr), field: j.loadingExperience?.overall_category ?? null }
}
async function psiCall(key, url, strategy, cats) {
  const q = new URLSearchParams({ url, strategy })
  cats.forEach((c) => q.append('category', c))
  const r = await fetchJson(`${PSI}?${q}`, { headers: { 'x-goog-api-key': key } })
  if (!r.ok) throw await googleErr(r, 'PageSpeed Insights')
  return r.json()
}
/** Lighthouse run for one URL. Agentic Browsing (Lighthouse 13.2+) is asked for too; if PSI rejects it, the run repeats without it. */
export async function pagespeed(key, url, strategy = 'mobile') {
  return billed('pagespeed', strategy, async () => {
    try { return parsePsi(await psiCall(key, url, strategy, [...CATS, 'AGENTIC_BROWSING'])) } catch (e) {
      if (!/category|AGENTIC/i.test(e.message)) throw e
      return { ...parsePsi(await psiCall(key, url, strategy, CATS)), agenticUnsupported: true }
    }
  })
}
export const psiTest = async (key) => { const r = await pagespeed(key, 'https://www.google.com/', 'desktop'); return `Key works (Lighthouse ${r.version ?? '?'})` }

// ---------------- Open PageRank (free key, Keywords Everywhere) ----------------
const OPR = 'https://openpagerank.keywordseverywhere.com/v1/domains/bulk'
export const parseOpr = (j) => (j.results ?? []).map((x) => ({ domain: x.domain, found: !!x.found, pageRank: x.open_page_rank ?? null, rank: x.rank ?? null, refDomains: x.referring_domains ?? null }))
/** Up to 100 domains per request; each unique domain counts once against the monthly quota. */
export async function openPageRank(key, domains) {
  return billed('openpagerank', `${domains.length} domains`, async () => {
    const r = await fetchJson(OPR, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ domains: domains.slice(0, 100), include_history: false }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(`Open PageRank: ${j.error?.message ?? j.error ?? `HTTP ${r.status}`}`)
    return { rows: parseOpr(j), asOf: j.as_of ?? null }
  })
}
export const oprTest = async (key) => { const r = await openPageRank(key, ['google.com']); return `Key works (google.com Open PageRank ${r.rows[0]?.pageRank ?? '?'})` }

// ---------------- Cloud Natural Language (entities + categories) ----------------
const NLP = 'https://language.googleapis.com/v1/documents'
export const NLP_CHARS = 20000 // ponytail: first 20,000 characters (20 billing units); long pages are truncated
export const parseEntities = (j) => (j.entities ?? []).map((e) => ({ name: e.name, type: e.type, salience: e.salience ?? 0, wikipedia: e.metadata?.wikipedia_url ?? null, mentions: e.mentions?.length ?? 0 })).sort((a, b) => b.salience - a.salience)
export const parseCategories = (j) => (j.categories ?? []).map((c) => ({ name: c.name, confidence: c.confidence ?? 0 }))
async function nlp(key, method, text) {
  return billed('naturallanguage', method, async () => {
    const r = await fetchJson(`${NLP}:${method}`, { method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify({ document: { type: 'PLAIN_TEXT', content: text.slice(0, NLP_CHARS) }, encodingType: 'UTF8' }) })
    if (!r.ok) throw await googleErr(r, 'Natural Language')
    return r.json()
  })
}
export async function analyseText(key, text) {
  const [e, c] = await Promise.allSettled([nlp(key, 'analyzeEntities', text), nlp(key, 'classifyText', text)])
  if (e.status === 'rejected') throw e.reason
  return { entities: parseEntities(e.value), categories: c.status === 'fulfilled' ? parseCategories(c.value) : [], truncated: text.length > NLP_CHARS }
}
export const nlpTest = async (key) => { const r = await nlp(key, 'analyzeEntities', 'Google is a technology company based in Mountain View, California.'); return `Key works (${parseEntities(r).length} entities found in a test sentence)` }

// ---------------- IndexNow (Bing, Yandex, Seznam, Naver, Yep; not Google) ----------------
export const INDEXNOW = 'https://api.indexnow.org/indexnow'
export const validIndexNowKey = (k) => /^[a-zA-Z0-9-]{8,128}$/.test(k ?? '')
const INDEXNOW_STATUS = { 200: 'Submitted.', 202: 'Received; the search engines are still validating your key file.', 400: 'Rejected: bad request format.', 403: 'Rejected: the key file was not found at the key location, or doesn’t contain the key.', 422: 'Rejected: the URLs don’t belong to this host, or the key location doesn’t cover them.', 429: 'Too many submissions; try later.' }
export const indexNowMessage = (status) => INDEXNOW_STATUS[status] ?? `Unexpected reply (HTTP ${status}).`
/** Submit up to 10,000 URLs of one host. The key file must be live at keyLocation (default https://host/<key>.txt). */
export async function indexNow(key, urls, keyLocation) {
  const host = new URL(urls[0]).host
  const loc = keyLocation || `${new URL(urls[0]).origin}/${key}.txt`
  const r = await fetch(INDEXNOW, { method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ host, key, keyLocation: loc, urlList: urls.slice(0, 10000) }) })
  return { status: r.status, ok: r.status === 200 || r.status === 202, message: indexNowMessage(r.status), keyLocation: loc, count: Math.min(urls.length, 10000) }
}

// ---------------- Google Analytics 4 (read-only, separate Google sign-in scope) ----------------
export const GA4_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'
export const GA4_PERMS = { permissions: ['identity'], origins: ['https://analyticsdata.googleapis.com/*', 'https://analyticsadmin.googleapis.com/*'] }
async function ga4Token(interactive) {
  if (!(await chrome.permissions.contains({ permissions: ['identity'] }))) throw new Error('Not connected.')
  try { const r = await chrome.identity.getAuthToken({ interactive, scopes: [GA4_SCOPE] }); const t = typeof r === 'string' ? r : r?.token; if (!t) throw new Error('no token'); return t } catch (e) { throw new Error(interactive ? `Google did not grant Analytics access (${e.message}).` : 'Not connected.') }
}
export const ga4SignIn = () => ga4Token(true)
export const ga4Connected = async () => !!(await ga4Token(false).catch(() => null))
export async function ga4SignOut() { const t = await ga4Token(false).catch(() => null); if (t) await chrome.identity.removeCachedAuthToken({ token: t }) }
async function ga4Call(url, body) {
  const tok = await ga4Token(false)
  const r = await fetch(url, { method: body ? 'POST' : 'GET', credentials: 'omit', headers: { authorization: `Bearer ${tok}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  if (r.status === 401) { await chrome.identity.removeCachedAuthToken({ token: tok }); throw new Error('Google sign-in expired. Connect Google Analytics again.') }
  if (!r.ok) throw await googleErr(r, 'Google Analytics')
  return r.json()
}
export const parseGa4Properties = (j) => (j.accountSummaries ?? []).flatMap((a) => (a.propertySummaries ?? []).map((p) => ({ id: p.property, name: p.displayName, account: a.displayName })))
export const ga4Properties = async () => parseGa4Properties(await ga4Call('https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200'))
/** Two date ranges add a "dateRange" dimension to every row (date_range_0 = current, date_range_1 = previous). */
export function parseGa4Report(j) {
  const metrics = (j.metricHeaders ?? []).map((m) => m.name), dims = (j.dimensionHeaders ?? []).map((d) => d.name)
  const pages = new Map()
  for (const row of j.rows ?? []) {
    const dv = Object.fromEntries(dims.map((d, i) => [d, row.dimensionValues?.[i]?.value]))
    const vals = Object.fromEntries(metrics.map((m, i) => [m, Number(row.metricValues?.[i]?.value ?? 0)]))
    const p = pages.get(dv.landingPagePlusQueryString) ?? { page: dv.landingPagePlusQueryString, cur: null, prev: null }
    p[dv.dateRange === 'date_range_1' ? 'prev' : 'cur'] = vals
    pages.set(p.page, p)
  }
  return [...pages.values()].filter((p) => p.cur).sort((a, b) => b.cur.sessions - a.cur.sessions)
}
/** Organic Search landing pages, last 28 days vs the 28 before. */
export async function ga4Organic(property, { limit = 50 } = {}) {
  const body = {
    dateRanges: [{ startDate: '28daysAgo', endDate: 'yesterday' }, { startDate: '56daysAgo', endDate: '29daysAgo' }],
    dimensions: [{ name: 'landingPagePlusQueryString' }],
    metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }, { name: 'keyEvents' }],
    dimensionFilter: { filter: { fieldName: 'sessionDefaultChannelGroup', stringFilter: { value: 'Organic Search' } } },
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit,
  }
  return parseGa4Report(await ga4Call(`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, body))
}
