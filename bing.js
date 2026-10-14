// Bing Webmaster Tools API (key from Bing Webmaster › Settings › API access). Contract from Refract src/connectors/bing.
const BASE = 'https://ssl.bing.com/webmaster/api.svc/json'
export const BING_PERMS = { origins: ['https://ssl.bing.com/*'] }

async function call(key, method, params = {}) {
  const r = await fetch(`${BASE}/${method}?${new URLSearchParams({ ...params, apikey: key })}`, { credentials: 'omit' })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(/apikey|notauthorized|unauthori/i.test(JSON.stringify(j)) || r.status === 401 ? 'Bing rejected the API key. Check it in Settings.' : `Bing Webmaster: ${j.Message ?? `HTTP ${r.status}`}`)
  return j.d
}
/** Pure: Bing's "/Date(1696118400000)/" → "2023-10-01". */
export const bingDate = (raw) => { const ms = raw ? /\/Date\((-?\d+)/.exec(raw)?.[1] : null; return ms ? new Date(Number(ms)).toISOString().slice(0, 10) : null }
/** Pure: the verified site covering url (longest prefix, host match as fallback). */
export function pickSite(sites, url) {
  const host = new URL(url).hostname.replace(/^www\./, '')
  const ok = sites.filter((s) => s.IsVerified !== false)
  return ok.filter((s) => url.startsWith(s.Url)).sort((a, b) => b.Url.length - a.Url.length)[0]?.Url
    ?? ok.find((s) => { try { return new URL(s.Url).hostname.replace(/^www\./, '') === host } catch { return false } })?.Url ?? null
}
/** Pure: aggregate rows (one per week) for keys matching `match`. */
export function rollup(rows, match = () => true) {
  const m = new Map()
  for (const r of rows.filter((x) => match(x.Query))) {
    const k = r.Query
    const a = m.get(k) ?? { key: k, clicks: 0, impressions: 0, posW: 0 }
    a.clicks += r.Clicks; a.impressions += r.Impressions; a.posW += (r.AvgImpressionPosition ?? 0) * r.Impressions
    m.set(k, a)
  }
  return [...m.values()].map((a) => ({ key: a.key, clicks: a.clicks, impressions: a.impressions, position: a.impressions ? a.posW / a.impressions : null })).sort((a, b) => b.impressions - a.impressions)
}

export const bingTest = async (key) => `${(await call(key, 'GetUserSites')).length} site(s) in this account`
export async function bingForPage(key, url) {
  const sites = await call(key, 'GetUserSites')
  const site = pickSite(sites, url)
  if (!site) return { site: null, sites: sites.map((s) => s.Url) }
  const norm = (u) => u.replace(/#.*/, '').replace(/\/$/, '')
  const [queries, pages, links] = await Promise.all([
    call(key, 'GetQueryStats', { siteUrl: site }),
    call(key, 'GetPageStats', { siteUrl: site }),
    call(key, 'GetUrlLinks', { siteUrl: site, link: url, page: '0' }).catch(() => null),
  ])
  const page = rollup(pages ?? [], (q) => norm(q) === norm(url))[0] ?? null
  const dates = (pages ?? []).map((r) => bingDate(r.Date)).filter(Boolean).sort()
  return { site, page, topQueries: rollup(queries ?? []).slice(0, 25), inbound: (links?.Details ?? []).map((l) => ({ source: l.Url, anchor: l.AnchorText ?? null })), inboundPages: links?.TotalPages ?? null, range: dates.length ? `${dates[0]} → ${dates.at(-1)}` : '' }
}
