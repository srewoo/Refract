// Rank checks without UI, shared by the Rank tracking view and scheduled runs (schedules.js, in the service worker).
// Storage: `ranks:<domain>:<market>:<device>` = { keywords: [...], history: { [keyword]: [points] } }; the legacy
// per-domain `ranks:<domain>` tracker is read as the desktop tracker of every market.
import { API } from './providers.js'
import { MARKETS, PROVIDERS } from './keys.js'

export const RANK_KEYWORDS = 50, RANK_POINTS = 120 // per tracker; one point per keyword per day
const get = async (k) => (await chrome.storage.local.get(k))[k]

export const trackerKey = (domain, market, device) => `ranks:${domain}:${market}:${device}`
export async function readTracker(domain, k) {
  const own = await get(k)
  return own ? { saved: own } : k.endsWith(':desktop') ? { saved: await get(`ranks:${domain}`), legacy: true } : {}
}

/**
 * Check `keywords` for `domain` with provider `id` and store one point per keyword for today in tracker `k`.
 * DataForSEO checks each keyword live, so one failure keeps the checks already paid for; Semrush/Ahrefs read the
 * domain's ranked keywords from their index. Throws only when nothing could be checked.
 */
export async function checkRanks({ cfg, id, k, domain, keywords, device = 'desktop', depth = 100, onProgress = () => {} }) {
  const saved = (await readTracker(domain, k)).saved ?? { keywords: [], history: {} }
  saved.keywords = keywords
  const date = new Date().toISOString().slice(0, 10)
  const m = MARKETS[cfg.market]
  const o = id === 'dataforseo' ? { device, depth } : { depth: 50 }
  const failed = []
  let results
  if (id === 'dataforseo') {
    results = []
    for (const [i, kw] of keywords.entries()) {
      onProgress(`Checking “${kw}” (${i + 1}/${keywords.length})…`)
      try { results.push(await API.dataforseo.rank(cfg.creds.dataforseo, kw, domain, m, o)) } catch (x) { failed.push([kw, x.message ?? String(x)]) }
    }
    if (!results.length && failed.length) throw new Error(failed[0][1])
  } else {
    onProgress(`Reading ${domain}’s ranking keywords from ${PROVIDERS[id].name}…`)
    const ranked = await API[id].rankedKeywords(cfg.creds[id], domain, m)
    results = keywords.map((kw) => { const hit = ranked.find((r) => r.keyword.toLowerCase() === kw); return { keyword: kw, position: hit?.position ?? null, url: hit?.url ?? null } })
  }
  for (const r of results) {
    const hist = (saved.history[r.keyword] ?? []).filter((x) => x.date !== date) // one point per day
    saved.history[r.keyword] = [...hist, { date, position: r.position, url: r.url, provider: id, ...o, cost: r.cost, features: r.features }].slice(-RANK_POINTS)
  }
  await chrome.storage.local.set({ [k]: saved })
  return { saved, results, failed, o, m, spent: results.reduce((t, r) => t + (r.cost ?? 0), 0) }
}
