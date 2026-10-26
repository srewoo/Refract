// Saved keywords and competitors per domain (chrome.storage.local), and the pure helpers behind them.
// Storage: `kw:<domain>` = { [keyword]: record }, `competitors:<domain>` = [domain], `domgap:<domain>:<competitor>:<market>` = last comparison.

const get = async (k) => (await chrome.storage.local.get(k))[k]
const set = (k, v) => chrome.storage.local.set({ [k]: v })
export const loadSaved = async (domain) => (await get(`kw:${domain}`)) ?? {}
export const storeSaved = (domain, saved) => set(`kw:${domain}`, saved)
export const loadCompetitors = async (domain) => (await get(`competitors:${domain}`)) ?? []
export const storeCompetitors = (domain, list) => set(`competitors:${domain}`, list)
export const gapKey = (domain, competitor, market) => `domgap:${domain}:${competitor}:${market}`
export const overviewKey = (domain, market) => `domov:${domain}:${market}`
export const loadRecord = (k) => get(k) // stored gap and overview snapshots
export const storeRecord = (k, v) => set(k, v)
/** Read-modify-write so two open views never drop each other's edits. */
export async function updateSaved(domain, fn) {
  const s = fn(await loadSaved(domain)) ?? {}
  await storeSaved(domain, s)
  return s
}

export const clean = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
/** "https://www.Example.com/path" → "example.com"; null when it isn't a host name. */
export function cleanDomain(input) {
  try {
    const host = new URL(/:\/\//.test(input) ? input.trim() : `https://${input.trim()}`).hostname.replace(/^www\./, '').toLowerCase()
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null
  } catch { return null }
}

/**
 * Add or refresh keywords. Metrics a row carries replace the old ones (with provider, market and date); missing ones are kept;
 * tags merge; notes and target URL are only overwritten by non-empty values; `source` records where it was first found.
 */
export function mergeKeywords(saved, rows, { source, provider = source, market = null, at = new Date().toISOString().slice(0, 10) } = {}) {
  const out = { ...saved }
  for (const r of rows) {
    const keyword = clean(r.keyword)
    if (!keyword) continue
    const old = out[keyword] ?? { keyword, tags: [], notes: '', url: '', added: at, source }
    const metrics = r.volume != null || r.kd != null || r.cpc != null
    out[keyword] = {
      ...old,
      // each field keeps its old value when the new source doesn't supply it (e.g. "Get metrics" returns no intent)
      ...(metrics && { volume: r.volume ?? old.volume ?? null, kd: r.kd ?? old.kd ?? null, cpc: r.cpc ?? old.cpc ?? null, intent: r.intent ?? old.intent ?? null, trend: r.trend?.length ? r.trend : old.trend ?? [], metricsFrom: provider, market, collected: at }),
      tags: [...new Set([...old.tags, ...(r.tags ?? []).map(clean).filter(Boolean)])],
      notes: r.notes || old.notes,
      url: r.url || old.url,
    }
  }
  return out
}

/** CSV text → rows of strings: quoted fields, "" escapes, CRLF or LF. */
export function parseCsv(text) {
  const rows = [[]]
  let f = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++ } else if (c === '"') q = false; else f += c }
    else if (c === '"') q = true
    else if (c === ',') { rows.at(-1).push(f); f = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; rows.at(-1).push(f); f = ''; rows.push([]) }
    else f += c
  }
  rows.at(-1).push(f)
  return rows.filter((r) => r.some((x) => x.trim()))
}

/** Imported CSV → keyword rows. Uses a header row with a keyword/query column (our export, Search Console, Semrush, Ahrefs); else the first column. */
export function csvKeywords(text) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''))
  if (!rows.length) return []
  const head = rows[0].map(clean)
  const col = (...names) => head.findIndex((x) => names.includes(x))
  const k = col('keyword', 'keywords', 'query', 'top queries', 'phrase', 'question') // question: the PAA extractor's CSV
  if (k < 0) return rows.map((r) => ({ keyword: r[0] }))
  const [v, d, c, t, u, nt] = [col('volume', 'search volume'), col('kd', 'difficulty', 'keyword difficulty'), col('cpc'), col('tags'), col('url', 'target url'), col('notes')]
  const num = (i, r) => (i < 0 || !r[i]?.trim() || Number.isNaN(Number(r[i])) ? null : Number(r[i]))
  const str = (i, r) => (i < 0 ? '' : (r[i] ?? '').trim())
  return rows.slice(1).map((r) => ({ keyword: r[k], volume: num(v, r), kd: num(d, r), cpc: num(c, r), tags: str(t, r).split(/[;|]/), url: str(u, r), notes: str(nt, r) }))
}

/** Saved records → flat CSV rows (tags joined with "; " so csvKeywords reads them back). */
export const exportRows = (list) => list.map((r) => ({ keyword: r.keyword, volume: r.volume, kd: r.kd, cpc: r.cpc, intent: r.intent, trend: r.trend?.join(' ') ?? '',
  tags: r.tags.join('; '), url: r.url, notes: r.notes, source: r.source, metrics_from: r.metricsFrom, market: r.market, collected: r.collected }))

// ---------------- Token clusters ----------------
const STOP = new Set('a an and are as at be best by can do does for from how i in is it my near of on or the to vs what when where which who why with your you'.split(' '))
// ponytail: naive stemming (plural s/ies, -ing); a Porter stemmer would merge more variants. No SERP-overlap check yet:
// that needs stored SERP results per keyword.
const stem = (t) => (t.length <= 3 ? t : t.endsWith('ies') ? `${t.slice(0, -3)}y` : t.endsWith('ing') && t.length > 5 ? t.slice(0, -3) : t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t)
export const tokens = (k) => [...new Set(clean(k).split(/[^\p{L}\p{N}]+/u).filter((t) => t && !STOP.has(t)).map(stem))]
const jaccard = (a, b) => { const B = new Set(b), inter = a.filter((x) => B.has(x)).length; return inter / (new Set([...a, ...b]).size || 1) }
/** Biggest keyword first becomes a cluster head; each keyword joins the first head sharing at least half the combined tokens. */
export function clusterKeywords(list) {
  const out = []
  for (const r of [...list].sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1) || a.keyword.length - b.keyword.length)) {
    const t = tokens(r.keyword)
    const c = t.length ? out.find((x) => jaccard(x.tokens, t) >= 0.5) : null
    if (c) c.members.push(r); else out.push({ head: r.keyword, tokens: t, members: [r] })
  }
  return out.map(({ head, members }) => ({ head, members, volume: members.reduce((n, m) => n + (m.volume ?? 0), 0) })).sort((a, b) => b.volume - a.volume || b.members.length - a.members.length)
}

/**
 * Clusters by shared search results: keywords whose top-10 URLs overlap by ≥ minShared join one group (union-find), the
 * usual test for "one page can rank for both". Only keywords with stored results (record.serp.urls) take part.
 */
export function serpClusters(list, minShared = 3) {
  const ks = list.filter((r) => r.serp?.urls?.length)
  const parent = ks.map((_, i) => i)
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const sets = ks.map((r) => new Set(r.serp.urls.map((u) => u.replace(/[#?].*$/, '').replace(/\/$/, ''))))
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) if ([...sets[i]].filter((u) => sets[j].has(u)).length >= minShared) parent[find(i)] = find(j)
  const groups = new Map()
  ks.forEach((r, i) => { const g = groups.get(find(i)) ?? []; g.push(r); groups.set(find(i), g) })
  return [...groups.values()].map((m) => m.sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1))).map((m) => ({ head: m[0].keyword, members: m, volume: m.reduce((t, r) => t + (r.volume ?? 0), 0) })).sort((a, b) => b.members.length - a.members.length || b.volume - a.volume)
}

// ---------------- Backup / restore ----------------
// Research data only: never API keys (the `byok` record), Search Console tokens (Chrome holds them) or page history.
export const BACKUP_PREFIXES = ['kw:', 'competitors:', 'domgap:', 'domov:', 'ranks:', 'bl:', 'blsnap:', 'bllinks:', 'prospects:', 'aiprompts:', 'airuns:', 'gaps:', 'cscore:']
const isResearch = (k) => BACKUP_PREFIXES.some((p) => k.startsWith(p))
export const BACKUP_FORMAT = 'refract-seo-research', BACKUP_VERSION = 1
export const buildBackup = (all, at = new Date().toISOString()) => ({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exported: at, data: Object.fromEntries(Object.entries(all).filter(([k]) => isResearch(k))) })
/** Parsed backup JSON → the research entries to write; throws a readable error for anything else. */
export function readBackup(json) {
  if (json?.format !== BACKUP_FORMAT) throw new Error('This is not a Refract SEO research backup.')
  if (json.version > BACKUP_VERSION) throw new Error(`This backup is version ${json.version}; update Refract SEO to import it.`)
  if (!json.data || typeof json.data !== 'object' || Array.isArray(json.data)) throw new Error('The backup has no data.')
  const entries = Object.entries(json.data).filter(([k, v]) => isResearch(k) && v != null && typeof v === 'object')
  return Object.fromEntries(entries.map(([k, v]) => [k, k.startsWith('kw:') ? cleanSaved(v) : v]))
}
// Saved-keyword records drive editable tables: keep only well-formed ones, with the fields the table relies on.
const cleanSaved = (v) => Object.fromEntries(Object.values(v).filter((r) => typeof r?.keyword === 'string' && clean(r.keyword))
  .map((r) => [clean(r.keyword), { ...r, keyword: clean(r.keyword), tags: Array.isArray(r.tags) ? r.tags.filter((t) => typeof t === 'string') : [], notes: String(r.notes ?? ''), url: String(r.url ?? '') }]))
/** Domain each research key belongs to ("kw:example.com" → example.com; "gaps:<url>" → its host). */
export function keyDomain(k) {
  const rest = k.slice(k.indexOf(':') + 1)
  if (k.startsWith('gaps:') || k.startsWith('cscore:')) { try { return new URL(rest).hostname.replace(/^www\./, '') } catch { return null } }
  return rest.split(':')[0]
}

const BUCKETS = [['1', 1, 1], ['2–3', 2, 3], ['4–10', 4, 10], ['11–20', 11, 20], ['21–100', 21, 100]]
/** Ranked keywords → how many sit in each position band. */
export const positionBuckets = (ranked) => Object.fromEntries(BUCKETS.map(([label, lo, hi]) => [label, ranked.filter((r) => r.position >= lo && r.position <= hi).length]))
/** Ranked keywords → the pages carrying them, by total keyword volume. */
export function topPages(ranked, n = 10) {
  const by = new Map()
  for (const r of ranked) {
    if (!r.url) continue
    const p = by.get(r.url) ?? { url: r.url, keywords: 0, volume: 0, best: null, top: r.keyword }
    p.keywords++; p.volume += r.volume ?? 0
    if (r.position && (p.best == null || r.position < p.best)) p.best = r.position
    by.set(r.url, p)
  }
  return [...by.values()].sort((a, b) => b.volume - a.volume || b.keywords - a.keywords).slice(0, n)
}

/** Two ranked-keyword lists → shared, competitor-only (gap) and yours-only; biggest volume first. */
export function domainGap(mine, theirs) {
  const m = new Map(mine.map((r) => [clean(r.keyword), r])), t = new Map(theirs.map((r) => [clean(r.keyword), r]))
  const byVol = (a, b) => (b.volume ?? -1) - (a.volume ?? -1)
  return {
    gap: [...t].filter(([k]) => !m.has(k)).map(([k, r]) => ({ keyword: k, volume: r.volume, them: r.position, theirUrl: r.url })).sort(byVol),
    shared: [...t].filter(([k]) => m.has(k)).map(([k, r]) => ({ keyword: k, volume: r.volume ?? m.get(k).volume, you: m.get(k).position, them: r.position, yourUrl: m.get(k).url, theirUrl: r.url })).sort(byVol),
    yours: [...m].filter(([k]) => !t.has(k)).map(([k, r]) => ({ keyword: k, volume: r.volume, you: r.position, yourUrl: r.url })).sort(byVol),
  }
}
