// Provider adapters for ranks, keyword metrics and backlinks (contracts from Refract src/connectors/*).
// Each capability returns one shape whatever the provider; parsers are pure and exported for tests.
// Errors are thrown as Error(message) with a human-readable message.

const fetchJson = async (url, init = {}) => {
  let r
  try { r = await fetch(url, { credentials: 'omit', ...init }) } catch (e) { throw new Error(`Network error: ${e.message ?? e}`) }
  if (r.status === 401 || r.status === 403) throw new Error('The provider rejected the key (401/403). Check it in Settings.')
  if (r.status === 402) throw new Error('The provider says the account is out of credit (402).')
  if (r.status === 429) throw new Error('Rate limited by the provider (429). Try again shortly.')
  return r
}

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
  const r = await fetchJson(`${DFS}${path}`, { method: body ? 'POST' : 'GET', headers: { authorization: basic(c), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  if (!r.ok) throw new Error(`DataForSEO HTTP ${r.status}`)
  return dfsResult(await r.json())
}
export const parseDfsSerp = (result, domain) => {
  const items = (result[0]?.items ?? []).filter((i) => i.type === 'organic')
  const hit = items.find((i) => i.domain && (i.domain === domain || i.domain.endsWith(`.${domain}`)))
  return { position: hit?.rank_group ?? null, url: hit?.url ?? null, top: items.slice(0, 3).map((i) => i.domain) }
}
const dfsApi = {
  test: (c) => dfs(c, '/v3/appendix/user_data').then((r) => `Balance $${Number(r.result[0]?.money?.balance ?? 0).toFixed(2)}`),
  async rank(c, keyword, domain, m) {
    const r = await dfs(c, '/v3/serp/google/organic/live/advanced', [{ keyword, location_name: m.dfs, language_code: m.lang, device: 'desktop', depth: 100 }])
    return { keyword, ...parseDfsSerp(r.result, domain), cost: r.cost }
  },
  async keywords(c, keywords, m) {
    const [vol, kd] = await Promise.all([
      dfs(c, '/v3/keywords_data/google_ads/search_volume/live', [{ keywords, location_name: m.dfs, language_code: m.lang }]),
      dfs(c, '/v3/dataforseo_labs/google/bulk_keyword_difficulty/live', [{ keywords, location_name: m.dfs, language_code: m.lang }]),
    ])
    const kdMap = new Map((kd.result[0]?.items ?? []).map((i) => [i.keyword, i.keyword_difficulty ?? null]))
    return vol.result.map((v) => ({ keyword: v.keyword, volume: v.search_volume ?? null, kd: kdMap.get(v.keyword) ?? null, cpc: v.cpc ?? null }))
  },
  async backlinks(c, domain) {
    const [s, rd] = await Promise.all([dfs(c, '/v3/backlinks/summary/live', [{ target: domain }]), dfs(c, '/v3/backlinks/referring_domains/live', [{ target: domain, limit: 25, order_by: ['backlinks,desc'] }])])
    const sum = s.result[0] ?? {}
    return { backlinks: sum.backlinks ?? null, refDomains: sum.referring_domains ?? null, rating: sum.rank ?? null, ratingName: 'DataForSEO rank (0–1000)', top: (rd.result[0]?.items ?? []).map((i) => ({ domain: i.domain, backlinks: i.backlinks ?? null, rating: i.rank ?? null })) }
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
  const r = await fetchJson(url)
  return parseSemrush(await r.text())
}
const n = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))
const semApi = {
  test: (c) => fetchJson(`https://www.semrush.com/users/countapiunits.html?key=${encodeURIComponent(c.key)}`).then((r) => r.text()).then((t) => { if (/ERROR/.test(t)) throw new Error(`Semrush: ${t.trim()}`); return `${Number(t).toLocaleString()} API units left` }),
  async rankedKeywords(c, domain, m) {
    const rows = await sem(`${SEM}?${new URLSearchParams({ type: 'domain_organic', key: c.key, domain, database: m.semrush, display_limit: '50', display_sort: 'tr_desc', export_columns: 'Ph,Po,Nq,Ur' })}`)
    return rows.map((r) => ({ keyword: r.Keyword, position: n(r.Position), volume: n(r['Search Volume']), url: r.Url }))
  },
  async keywords(c, keywords, m) {
    const out = []
    for (const k of keywords.slice(0, 25)) { // one request per phrase; capped to protect API units
      const [v] = await sem(`${SEM}?${new URLSearchParams({ type: 'phrase_this', key: c.key, phrase: k, database: m.semrush, export_columns: 'Ph,Nq,Cp' })}`)
      const [kd] = await sem(`${SEM}?${new URLSearchParams({ type: 'phrase_kdi', key: c.key, phrase: k, database: m.semrush, export_columns: 'Ph,Kd' })}`)
      out.push({ keyword: k, volume: n(v?.['Search Volume']), kd: n(kd?.['Keyword Difficulty Index'] ?? kd?.['Keyword Difficulty']), cpc: n(v?.CPC) })
    }
    return out
  },
  async backlinks(c, domain) {
    const base = 'https://api.semrush.com/analytics/v1/?'
    const [o] = await sem(`${base}${new URLSearchParams({ type: 'backlinks_overview', key: c.key, target: domain, target_type: 'root_domain', export_columns: 'ascore,total,domains_num' })}`)
    const top = await sem(`${base}${new URLSearchParams({ type: 'backlinks_refdomains', key: c.key, target: domain, target_type: 'root_domain', export_columns: 'domain_ascore,domain,backlinks_num', display_limit: '25' })}`)
    return { backlinks: n(o?.total), refDomains: n(o?.domains_num), rating: n(o?.ascore), ratingName: 'Authority Score', top: top.map((r) => ({ domain: r.domain, backlinks: n(r.backlinks_num), rating: n(r.domain_ascore) })) }
  },
}

// ---------------- Ahrefs v3 (Bearer) ----------------
const AH = 'https://api.ahrefs.com/v3'
async function ah(c, path, params) {
  const r = await fetchJson(`${AH}${path}?${new URLSearchParams(params)}`, { headers: { authorization: `Bearer ${c.key}`, accept: 'application/json' } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`Ahrefs: ${j.error ?? `HTTP ${r.status}`}`)
  return j
}
const today = () => new Date().toISOString().slice(0, 10)
const ahApi = {
  test: (c) => ah(c, '/subscription-info/limits-and-usage', {}).then((j) => { const u = j.limits_and_usage ?? {}; return `${(u.units_usage_api_key ?? u.units_usage_workspace ?? 0).toLocaleString()} of ${(u.units_limit_api_key ?? u.units_limit_workspace ?? 0).toLocaleString()} API units used` }),
  async rankedKeywords(c, domain, m) {
    const j = await ah(c, '/site-explorer/organic-keywords', { target: domain, mode: 'subdomains', country: m.ahrefs, date: today(), select: 'keyword,best_position,volume,best_position_url', order_by: 'sum_traffic:desc', limit: '50' })
    return (j.keywords ?? []).map((k) => ({ keyword: k.keyword, position: k.best_position ?? null, volume: k.volume ?? null, url: k.best_position_url ?? null }))
  },
  async keywords(c, keywords, m) {
    const j = await ah(c, '/keywords-explorer/overview', { country: m.ahrefs, keywords: keywords.join(','), select: 'keyword,volume,difficulty,cpc' })
    return (j.keywords ?? []).map((k) => ({ keyword: k.keyword, volume: k.volume ?? null, kd: k.difficulty ?? null, cpc: k.cpc == null ? null : k.cpc / 100 })) // Ahrefs v3 money fields are USD cents
  },
  async backlinks(c, domain) {
    const [dr, stats, rd] = await Promise.all([
      ah(c, '/site-explorer/domain-rating', { target: domain, date: today() }),
      ah(c, '/site-explorer/backlinks-stats', { target: domain, mode: 'subdomains', date: today() }),
      ah(c, '/site-explorer/refdomains', { target: domain, mode: 'subdomains', select: 'domain,domain_rating,links_to_target', order_by: 'domain_rating:desc', limit: '25' }),
    ])
    return { backlinks: stats.metrics?.live ?? null, refDomains: stats.metrics?.live_refdomains ?? null, rating: dr.domain_rating?.domain_rating ?? null, ratingName: 'Domain Rating', top: (rd.refdomains ?? []).map((r) => ({ domain: r.domain, backlinks: r.links_to_target ?? null, rating: r.domain_rating ?? null })) }
  },
}

export const API = { dataforseo: dfsApi, semrush: semApi, ahrefs: ahApi }
