// Provider adapters for ranks, keyword metrics and backlinks (contracts from Refract src/connectors/*).
// Each capability returns one shape whatever the provider; parsers are pure and exported for tests.
// Errors are thrown as Error(message) with a human-readable message.

import { bool, day, fetchJson, hostOf, linkRow, n, onlyLost, today } from './http.js'
import { billed, guard } from './ledger.js'
import { mozApi } from './moz.js'
export { day, linkRow } // parsers' public surface (tests import them from here)

// ---------------- DataForSEO (Basic auth, task envelope) ----------------
const DFS = 'https://api.dataforseo.com'
const basic = (c) => `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(`${c.login}:${c.password}`)))}`
export function dfsResult(json) {
  if (json?.status_code !== 20000) throw new Error(`DataForSEO: ${json?.status_message ?? 'unexpected reply'}`)
  const t = json.tasks?.[0]
  if (!t) throw new Error('DataForSEO: empty reply')
  if (t.status_code !== 20000) throw new Error(`DataForSEO: ${t.status_message}${t.status_code >= 40200 && t.status_code < 40300 ? ' (billing/subscription)' : ''}`)
  return { result: t.result ?? [], cost: json.cost ?? t.cost ?? 0 }
}
async function dfs(c, path, body) {
  const run = async () => {
    const r = await fetchJson(`${DFS}${path}`, { method: body ? 'POST' : 'GET', headers: { authorization: basic(c), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
    if (!r.ok) throw new Error(`DataForSEO HTTP ${r.status}`)
    return dfsResult(await r.json())
  }
  return path.startsWith('/v3/appendix/') ? run() : billed('dataforseo', path.replace(/^\/v3\//, ''), run, (r) => r.cost) // appendix (balance) is free
}
export const parseDfsSerp = (result, domain) => {
  const items = (result[0]?.items ?? []).filter((i) => i.type === 'organic')
  const hit = items.find((i) => i.domain && (i.domain === domain || i.domain.endsWith(`.${domain}`)))
  const features = [...new Set((result[0]?.items ?? []).map((i) => i.type).filter((t) => t && t !== 'organic'))]
  return { position: hit?.rank_group ?? null, url: hit?.url ?? null, top: items.slice(0, 3).map((i) => i.domain), features }
}
/** Google Ads monthly_searches (newest first) → 12 volumes, oldest first. */
export const dfsTrend = (months) => (months ?? []).toSorted((a, b) => a.year - b.year || a.month - b.month).map((x) => x.search_volume ?? null)
const dfsKw = (k) => ({ keyword: k.keyword, volume: k.keyword_info?.search_volume ?? null, kd: k.keyword_properties?.keyword_difficulty ?? null, cpc: k.keyword_info?.cpc ?? null, intent: k.search_intent_info?.main_intent ?? null, trend: dfsTrend(k.keyword_info?.monthly_searches) })
/** DataForSEO Labs keyword lists; related_keywords nests each row under keyword_data, ideas/suggestions don't. */
export const parseDfsLabs = (result) => ({ total: result[0]?.total_count ?? null, rows: (result[0]?.items ?? []).map((i) => dfsKw(i.keyword_data ?? i)) })
/** Labs ranked_keywords → the domain's keywords with its position and URL. */
export const parseDfsRanked = (result) => (result[0]?.items ?? []).map((i) => ({ keyword: i.keyword_data?.keyword, position: i.ranked_serp_element?.serp_item?.rank_group ?? null, volume: i.keyword_data?.keyword_info?.search_volume ?? null, url: i.ranked_serp_element?.serp_item?.url ?? null }))
/** Labs domain_rank_overview → shared overview shape. `count` counts SERPs the domain appears in. */
export function parseDfsOverview(result) {
  const o = result[0]?.items?.[0]?.metrics?.organic ?? {}
  const deep = Object.entries(o).filter(([k]) => /^pos_(2[1-9]|[3-9]\d)/.test(k)).reduce((t, [, v]) => t + (v ?? 0), 0)
  return { keywords: o.count ?? null, traffic: o.etv ?? null, value: o.estimated_paid_traffic_cost ?? null, dist: o.count == null ? null : { '1': o.pos_1 ?? 0, '2–3': o.pos_2_3 ?? 0, '4–10': o.pos_4_10 ?? 0, '11–20': o.pos_11_20 ?? 0, '21–100': deep } }
}
export const parseDfsLinks = (result) => (result[0]?.items ?? []).map((i) => linkRow({ from: i.url_from, to: i.url_to, anchor: i.anchor, follow: i.dofollow ?? null, firstSeen: i.first_seen, lastSeen: i.last_seen, lost: i.is_lost ?? null, rating: i.domain_from_rank ?? null, broken: i.is_broken ?? null, spam: i.backlink_spam_score ?? null }))
// ---- AI answers (DataForSEO SERP AI Overview / AI Mode, and its LLM Responses API) ----
const cite = (r) => ({ url: r.url, title: r.title ?? '', domain: r.domain?.replace(/^www\./, '') ?? hostOf(r.url) })
const uniqueBy = (list, key) => [...new Map(list.map((x) => [key(x), x])).values()]
/** Google SERP with an AI Overview / AI Mode block → answer text and its references; shown=false when Google showed none. */
export function parseAio(result) {
  const aio = (result[0]?.items ?? []).find((i) => i.type === 'ai_overview')
  if (!aio) return { shown: false, text: '', citations: [] }
  const refs = [...(aio.references ?? []), ...(aio.items ?? []).flatMap((e) => e.references ?? [])].filter((r) => r?.url)
  return { shown: true, text: aio.markdown ?? (aio.items ?? []).map((e) => e.markdown ?? e.text ?? '').join('\n\n'), citations: uniqueBy(refs.map(cite), (r) => r.url) }
}
/** LLM Responses → answer text and sources. citations=null when the model did no web search, so it could not cite. */
export function parseLlm(result) {
  const r = result[0] ?? {}
  const sections = (r.items ?? []).filter((i) => i.type === 'message').flatMap((i) => i.sections ?? [])
  if (!sections.length) throw new Error('The AI engine returned no answer.') // judged as a failed check, never as "not mentioned"
  const notes = sections.map((s) => s.annotations).filter((a) => a != null)
  return { shown: true, model: r.model_name ?? null, text: sections.map((s) => s.text ?? '').join('\n\n').trim(), citations: notes.length ? uniqueBy(notes.flat().filter((a) => a?.url).map(cite), (a) => a.url) : null }
}
const AI_CALL = {
  google_aio: (q, m) => ['/v3/serp/google/organic/live/advanced', { keyword: q, location_name: m.dfs, language_code: m.lang, device: 'desktop', depth: 10, load_async_ai_overview: true }, parseAio],
  google_ai_mode: (q, m) => ['/v3/serp/google/ai_mode/live/advanced', { keyword: q, location_name: m.dfs, language_code: m.lang }, parseAio],
  chatgpt: (q, m) => ['/v3/ai_optimization/chat_gpt/llm_responses/live', { user_prompt: q, model_name: 'gpt-4.1-mini', web_search: true, web_search_country_iso_code: m.ahrefs.toUpperCase() }, parseLlm],
  perplexity: (q, m) => ['/v3/ai_optimization/perplexity/llm_responses/live', { user_prompt: q, model_name: 'sonar', web_search_country_iso_code: m.ahrefs.toUpperCase() }, parseLlm],
}

export const parseSerpUrls = (result) => (result[0]?.items ?? []).filter((i) => i.type === 'organic' && i.url).map((i) => i.url)
/** Maps SERP → our listing's position (by domain or name) and the top 3 names. */
export function parseMaps(result, match) {
  const items = (result[0]?.items ?? []).filter((i) => i.type === 'maps_search')
  const want = String(match ?? '').toLowerCase().replace(/^www\./, '')
  const hit = items.find((i) => (i.domain && want && (i.domain.replace(/^www\./, '') === want || i.domain.endsWith(`.${want}`))) || (want && (i.title ?? '').toLowerCase().includes(want)))
  return { position: hit?.rank_group ?? null, title: hit?.title ?? null, top: items.slice(0, 3).map((i) => i.title) }
}
const dfsApi = {
  async aiAnswer(c, engine, prompt, m) {
    const [path, body, parse] = AI_CALL[engine](prompt, m)
    const r = await dfs(c, path, [body])
    return { ...parse(r.result), cost: r.cost }
  },
  test: (c) => dfs(c, '/v3/appendix/user_data').then((r) => `Balance $${Number(r.result[0]?.money?.balance ?? 0).toFixed(2)}`),
  async rank(c, keyword, domain, m, { device = 'desktop', depth = 100 } = {}) {
    const r = await dfs(c, '/v3/serp/google/organic/live/advanced', [{ keyword, location_name: m.dfs, language_code: m.lang, device, depth }])
    return { keyword, ...parseDfsSerp(r.result, domain), cost: r.cost }
  },
  async discover(c, mode, seed, m, { limit = 100, offset = 0 } = {}) {
    const o = { location_name: m.dfs, language_code: m.lang, limit, offset }
    if (mode === 'ads') { // Google Ads: one flat list per request (no paging), no difficulty or intent
      const r = await dfs(c, '/v3/keywords_data/google_ads/keywords_for_keywords/live', [{ keywords: [seed], location_name: m.dfs, language_code: m.lang, sort_by: 'search_volume' }])
      const rows = r.result.map((v) => ({ keyword: v.keyword, volume: v.search_volume ?? null, kd: null, cpc: v.cpc ?? null, intent: null, trend: dfsTrend(v.monthly_searches) }))
      return { rows: rows.slice(0, 1000), total: rows.length, cost: r.cost, complete: true }
    }
    const [path, body] = { related: ['related_keywords', { keyword: seed, depth: 3, ...o }], suggestions: ['keyword_suggestions', { keyword: seed, ...o }], ideas: ['keyword_ideas', { keywords: [seed], ...o }] }[mode]
    const r = await dfs(c, `/v3/dataforseo_labs/google/${path}/live`, [body])
    return { ...parseDfsLabs(r.result), cost: r.cost }
  },
  /** Top organic result URLs for a keyword (depth 10 = one billed SERP page). */
  async serpTop(c, keyword, m, depth = 10) {
    const r = await dfs(c, '/v3/serp/google/organic/live/advanced', [{ keyword, location_name: m.dfs, language_code: m.lang, device: 'desktop', depth }])
    return { keyword, urls: parseSerpUrls(r.result), cost: r.cost }
  },
  /** Google Maps results at one point ("lat,lng,zoom"); position of the business matching `match` (domain or name). */
  async mapsAt(c, keyword, coord, m, match) {
    const r = await dfs(c, '/v3/serp/google/maps/live/advanced', [{ keyword, location_coordinate: coord, language_code: m.lang, depth: 20 }])
    return { ...parseMaps(r.result, match), cost: r.cost }
  },
  async rankedKeywords(c, domain, m, limit = 50) {
    const r = await dfs(c, '/v3/dataforseo_labs/google/ranked_keywords/live', [{ target: domain, location_name: m.dfs, language_code: m.lang, limit, item_types: ['organic'], order_by: ['keyword_data.keyword_info.search_volume,desc'] }])
    return parseDfsRanked(r.result)
  },
  async overview(c, domain, m) {
    const r = await dfs(c, '/v3/dataforseo_labs/google/domain_rank_overview/live', [{ target: domain, location_name: m.dfs, language_code: m.lang }])
    return { ...parseDfsOverview(r.result), cost: r.cost }
  },
  async keywords(c, keywords, m) {
    const [volR, kdR] = await Promise.allSettled([
      dfs(c, '/v3/keywords_data/google_ads/search_volume/live', [{ keywords, location_name: m.dfs, language_code: m.lang }]),
      dfs(c, '/v3/dataforseo_labs/google/bulk_keyword_difficulty/live', [{ keywords, location_name: m.dfs, language_code: m.lang }]),
    ])
    if (volR.status === 'rejected') throw volR.reason
    const vol = volR.value // a difficulty failure leaves KD empty rather than discarding the volumes already paid for
    const kdMap = new Map(kdR.status === 'fulfilled' ? (kdR.value.result[0]?.items ?? []).map((i) => [i.keyword, i.keyword_difficulty ?? null]) : [])
    return vol.result.map((v) => ({ keyword: v.keyword, volume: v.search_volume ?? null, kd: kdMap.get(v.keyword) ?? null, cpc: v.cpc ?? null, trend: dfsTrend(v.monthly_searches) }))
  },
  async backlinks(c, domain, limit = 25) {
    const [s, rd] = await Promise.all([dfs(c, '/v3/backlinks/summary/live', [{ target: domain }]), dfs(c, '/v3/backlinks/referring_domains/live', [{ target: domain, limit, order_by: ['backlinks,desc'] }])])
    const sum = s.result[0] ?? {}
    return { backlinks: sum.backlinks ?? null, refDomains: sum.referring_domains ?? null, nofollowDomains: sum.referring_domains_nofollow ?? null, broken: sum.broken_backlinks ?? null, spamScore: sum.backlinks_spam_score ?? null, rating: sum.rank ?? null, ratingName: 'DataForSEO rank (0–1000)',
      top: (rd.result[0]?.items ?? []).map((i) => ({ domain: i.domain, backlinks: i.backlinks ?? null, rating: i.rank ?? null, firstSeen: day(i.first_seen) })), cost: s.cost + rd.cost }
  },
  async backlinkRows(c, domain, { limit = 100, offset = 0, perDomain = true, lost = false } = {}) {
    const r = await dfs(c, '/v3/backlinks/backlinks/live', [{ target: domain, limit, offset, mode: perDomain ? 'one_per_domain' : 'as_is', backlinks_status_type: lost ? 'lost' : 'live', order_by: ['domain_from_rank,desc'] }])
    return { rows: parseDfsLinks(r.result), total: r.result[0]?.total_count ?? null, cost: r.cost }
  },
}

// ---------------- Semrush (key in query, semicolon CSV) ----------------
const SEM = 'https://api.semrush.com/'
export function parseSemrush(text) {
  const t = text.trim()
  const err = /^ERROR\s+(\d+)\s*::\s*(.*)$/m.exec(t)
  if (err) { if (err[1] === '50') return []; throw new Error(`Semrush: ${err[2]}`) } // 50 = nothing found
  const [head, ...rows] = t.split(/\r?\n/)
  const cols = head.split(';')
  return rows.filter(Boolean).map((r) => Object.fromEntries(r.split(';').map((v, i) => [cols[i], v])))
}
async function sem(url) {
  return billed('semrush', new URL(url).searchParams.get('type') ?? 'request', async () => parseSemrush(await (await fetchJson(url)).text()))
}
/** Semrush Td column: 12 monthly values, each relative to the peak month (0–1), oldest first. */
export const semTrend = (td) => (td ? td.split(',').map(n) : [])
const INTENT = ['commercial', 'informational', 'navigational', 'transactional'] // Semrush In column codes
export const semIntent = (v) => (v ? v.split(',').map((x) => INTENT[x.trim()]).filter(Boolean).join(', ') || null : null)
export const semRow = (r) => ({ keyword: r.Keyword, volume: n(r['Search Volume']), kd: n(r['Keyword Difficulty Index'] ?? r['Keyword Difficulty']), cpc: n(r.CPC), intent: semIntent(r.Intent), trend: semTrend(r.Trends) })
const SEM_BL = 'https://api.semrush.com/analytics/v1/?'
export const parseSemLinks = (rows) => rows.map((r) => linkRow({ from: r.source_url, to: r.target_url, anchor: r.anchor, follow: bool(r.nofollow) == null ? null : !bool(r.nofollow), firstSeen: r.first_seen, lastSeen: r.last_seen, lost: bool(r.lostlink), rating: n(r.page_ascore) }))
const semApi = {
  test: (c) => fetchJson(`https://www.semrush.com/users/countapiunits.html?key=${encodeURIComponent(c.key)}`).then((r) => r.text()).then((t) => { if (/ERROR/.test(t)) throw new Error(`Semrush: ${t.trim()}`); return `${Number(t).toLocaleString()} API units left` }),
  async discover(c, mode, seed, m, { limit = 100, offset = 0 } = {}) {
    const rows = await sem(`${SEM}?${new URLSearchParams({ type: 'phrase_related', key: c.key, phrase: seed, database: m.semrush, display_limit: String(limit), display_offset: String(offset), display_sort: 'nq_desc', export_columns: 'Ph,Nq,Cp,Kd,Td,In' })}`)
    return { rows: rows.map(semRow), total: null }
  },
  async overview(c, domain, m) {
    const [o] = await sem(`${SEM}?${new URLSearchParams({ type: 'domain_rank', key: c.key, domain, database: m.semrush, export_columns: 'Dn,Rk,Or,Ot,Oc' })}`)
    return { keywords: n(o?.['Organic Keywords']), traffic: n(o?.['Organic Traffic']), value: n(o?.['Organic Cost']), dist: null }
  },
  async rankedKeywords(c, domain, m, limit = 50) {
    const rows = await sem(`${SEM}?${new URLSearchParams({ type: 'domain_organic', key: c.key, domain, database: m.semrush, display_limit: String(limit), display_sort: 'tr_desc', export_columns: 'Ph,Po,Nq,Ur' })}`)
    return rows.map((r) => ({ keyword: r.Keyword, position: n(r.Position), volume: n(r['Search Volume']), url: r.Url }))
  },
  async keywords(c, keywords, m) {
    const out = []
    for (const k of keywords.slice(0, 25)) { // one request per phrase; capped to protect API units
      const [v] = await sem(`${SEM}?${new URLSearchParams({ type: 'phrase_this', key: c.key, phrase: k, database: m.semrush, export_columns: 'Ph,Nq,Cp,Td' })}`)
      const [kd] = await sem(`${SEM}?${new URLSearchParams({ type: 'phrase_kdi', key: c.key, phrase: k, database: m.semrush, export_columns: 'Ph,Kd' })}`)
      out.push({ keyword: k, volume: n(v?.['Search Volume']), kd: n(kd?.['Keyword Difficulty Index'] ?? kd?.['Keyword Difficulty']), cpc: n(v?.CPC), trend: semTrend(v?.Trends) })
    }
    return out
  },
  async backlinks(c, domain, limit = 25) {
    const [o] = await sem(`${SEM_BL}${new URLSearchParams({ type: 'backlinks_overview', key: c.key, target: domain, target_type: 'root_domain', export_columns: 'ascore,total,domains_num,follows_num,nofollows_num' })}`)
    const top = await sem(`${SEM_BL}${new URLSearchParams({ type: 'backlinks_refdomains', key: c.key, target: domain, target_type: 'root_domain', export_columns: 'domain_ascore,domain,backlinks_num,first_seen', display_limit: String(limit) })}`)
    return { backlinks: n(o?.total), refDomains: n(o?.domains_num), follows: n(o?.follows_num), nofollows: n(o?.nofollows_num), rating: n(o?.ascore), ratingName: 'Authority Score',
      top: top.map((r) => ({ domain: r.domain, backlinks: n(r.backlinks_num), rating: n(r.domain_ascore), firstSeen: day(r.first_seen) })) }
  },
  async backlinkRows(c, domain, { limit = 100, offset = 0, lost = false } = {}) {
    const rows = await sem(`${SEM_BL}${new URLSearchParams({ type: 'backlinks', key: c.key, target: domain, target_type: 'root_domain', export_columns: 'page_ascore,source_url,target_url,anchor,first_seen,last_seen,nofollow,lostlink', display_limit: String(limit), display_offset: String(offset) })}`)
    return { rows: onlyLost(parseSemLinks(rows), lost), total: null, fetched: rows.length, lostLocal: lost }
  },
}

// ---------------- Ahrefs v3 (Bearer) ----------------
const AH = 'https://api.ahrefs.com/v3'
async function ah(c, path, params) {
  const run = async () => {
    const r = await fetchJson(`${AH}${path}?${new URLSearchParams(params)}`, { headers: { authorization: `Bearer ${c.key}`, accept: 'application/json' } })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(`Ahrefs: ${j.error ?? `HTTP ${r.status}`}`)
    return j
  }
  return path.startsWith('/subscription-info') ? run() : billed('ahrefs', path.slice(1), run) // usage lookup is free
}
export const parseAhLinks = (rows) => (rows ?? []).map((r) => linkRow({ from: r.url_from, to: r.url_to, anchor: r.anchor, follow: r.is_dofollow ?? null, firstSeen: r.first_seen, lastSeen: r.last_seen, lost: r.is_lost ?? null, rating: r.domain_rating_source ?? null, spam: r.is_spam ?? null }))
const ahApi = {
  test: (c) => ah(c, '/subscription-info/limits-and-usage', {}).then((j) => { const u = j.limits_and_usage ?? {}; return `${(u.units_usage_api_key ?? u.units_usage_workspace ?? 0).toLocaleString()} of ${(u.units_limit_api_key ?? u.units_limit_workspace ?? 0).toLocaleString()} API units used` }),
  async rankedKeywords(c, domain, m, limit = 50) {
    const j = await ah(c, '/site-explorer/organic-keywords', { target: domain, mode: 'subdomains', country: m.ahrefs, date: today(), select: 'keyword,best_position,volume,best_position_url', order_by: 'sum_traffic:desc', limit: String(limit) })
    return (j.keywords ?? []).map((k) => ({ keyword: k.keyword, position: k.best_position ?? null, volume: k.volume ?? null, url: k.best_position_url ?? null }))
  },
  async overview(c, domain, m) {
    const j = await ah(c, '/site-explorer/metrics', { target: domain, mode: 'subdomains', country: m.ahrefs, date: today() })
    const o = j.metrics ?? {}
    return { keywords: o.org_keywords ?? null, traffic: o.org_traffic ?? null, value: o.org_cost == null ? null : o.org_cost / 100, dist: null, top3: o.org_keywords_1_3 ?? null } // org_cost is USD cents
  },
  async keywords(c, keywords, m) {
    const j = await ah(c, '/keywords-explorer/overview', { country: m.ahrefs, keywords: keywords.join(','), select: 'keyword,volume,difficulty,cpc' })
    return (j.keywords ?? []).map((k) => ({ keyword: k.keyword, volume: k.volume ?? null, kd: k.difficulty ?? null, cpc: k.cpc == null ? null : k.cpc / 100 })) // Ahrefs v3 money fields are USD cents
  },
  async backlinks(c, domain, limit = 25) {
    const [dr, stats, rd] = await Promise.all([
      ah(c, '/site-explorer/domain-rating', { target: domain, date: today() }),
      ah(c, '/site-explorer/backlinks-stats', { target: domain, mode: 'subdomains', date: today() }),
      ah(c, '/site-explorer/refdomains', { target: domain, mode: 'subdomains', history: 'live', select: 'domain,domain_rating,links_to_target,dofollow_links,first_seen', order_by: 'domain_rating:desc', limit: String(limit) }),
    ])
    return { backlinks: stats.metrics?.live ?? null, refDomains: stats.metrics?.live_refdomains ?? null, rating: dr.domain_rating?.domain_rating ?? null, ratingName: 'Domain Rating',
      top: (rd.refdomains ?? []).map((r) => ({ domain: r.domain, backlinks: r.links_to_target ?? null, rating: r.domain_rating ?? null, firstSeen: day(r.first_seen) })) }
  },
  async backlinkRows(c, domain, { limit = 100, perDomain = true, lost = false } = {}) { // no offset in all-backlinks: one page, up to `limit`
    const j = await ah(c, '/site-explorer/all-backlinks', { target: domain, mode: 'subdomains', aggregation: perDomain ? '1_per_domain' : 'similar_links', history: lost ? 'all_time' : 'live', limit: String(limit),
      select: 'url_from,url_to,anchor,is_dofollow,first_seen,last_seen,domain_rating_source,is_lost,is_spam', order_by: 'domain_rating_source:desc' })
    return { rows: onlyLost(parseAhLinks(j.backlinks), lost), total: null, complete: true, fetched: (j.backlinks ?? []).length, lostLocal: lost }
  },
}

export const API = { dataforseo: guard('dataforseo', dfsApi), semrush: guard('semrush', semApi), ahrefs: guard('ahrefs', ahApi), moz: guard('moz', mozApi) }

/** Keyword discovery modes per provider (Ahrefs has none here yet). */
export const DISCOVER = {
  dataforseo: { related: 'Related searches', suggestions: 'Contains the seed', ideas: 'Same topic (ideas)', ads: 'Google Ads planner' },
  semrush: { related: 'Related keywords' },
}
// ponytail: published prices (2026-10): DataForSEO Labs $0.012/request + $0.00012/row, Google Ads keywords_for_keywords
// about $0.075/request (sample cost; their pricing page didn't load); Semrush 40 units/row for phrase_related and 10 units/row
// for domain_organic / domain_rank. Ahrefs bills per row by plan, so only rows are shown for it. Actual DataForSEO cost is shown after.
const labs = (rows) => 0.012 + 0.00012 * rows
export const discoverCost = (id, rows, mode) => (id === 'dataforseo' ? { usd: mode === 'ads' ? 0.075 : labs(rows) } : { units: rows * 40 })
/** Cost of `requests` ranked-keyword lists of `rows` each. */
export const rankedCost = (id, rows, requests = 1) => (id === 'dataforseo' ? { usd: requests * labs(rows) } : id === 'semrush' ? { units: requests * rows * 10 } : { rows: requests * rows })
export const overviewCost = (id) => (id === 'dataforseo' ? { usd: labs(1) } : id === 'semrush' ? { units: 10 } : { rows: 1 })
// ponytail: DataForSEO Backlinks is billed inside its own subscription (about $0.02/request + $0.00003/row at list price; not
// re-verified, their pricing page didn't load); Semrush 40 units per line (refdomains, backlinks) + 40 per overview; Ahrefs by rows.
export const backlinkCost = (id, rows, requests = 1) => (id === 'dataforseo' ? { usd: requests * 0.02 + 0.00003 * rows } : id === 'semrush' ? { units: 40 * rows + 40 * (requests - 1) } : { rows })
export const costText = (c) => (c.usd != null ? `about $${c.usd.toFixed(3)}` : c.units != null ? `about ${c.units.toLocaleString()} API units` : `${c.rows.toLocaleString()} rows of API units`)
