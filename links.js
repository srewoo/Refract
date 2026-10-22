// Backlink snapshots, last loaded backlinks and outreach prospects per domain (chrome.storage.local), plus pure helpers.
// Storage: `blsnap:<domain>:<YYYY-MM-DD>` = one summary snapshot per day (newest KEEP kept); `bllinks:<domain>` = last loaded
// backlink rows; `prospects:<domain>` = { [referring domain]: record }. The old single cache `bl:<domain>` is read as a snapshot.
import { clean } from './keywords.js'

const KEEP = 30
export const BL_KEEP = KEEP
const get = async (k) => (await chrome.storage.local.get(k))[k]
const set = (k, v) => chrome.storage.local.set({ [k]: v })

// ponytail: reads every key to find one domain's snapshots; add an index key if storage grows to many thousands of keys.
export async function listSnapshots(domain) {
  const all = await chrome.storage.local.get(null)
  const snaps = Object.entries(all).filter(([k]) => k.startsWith(`blsnap:${domain}:`)).map(([, v]) => v)
  const old = all[`bl:${domain}`]
  if (old?.r && !snaps.some((s) => s.at.slice(0, 10) === old.at.slice(0, 10))) snaps.push({ ...old.r, provider: old.id, at: old.at, limit: old.r.top?.length ?? 25 })
  return snaps.sort((a, b) => a.at.localeCompare(b.at))
}
export async function saveSnapshot(domain, snap) {
  await set(`blsnap:${domain}:${snap.at.slice(0, 10)}`, snap)
  const keys = Object.keys(await chrome.storage.local.get(null)).filter((k) => k.startsWith(`blsnap:${domain}:`)).sort()
  if (keys.length > KEEP) await chrome.storage.local.remove(keys.slice(0, keys.length - KEEP))
}
export const loadLinks = (domain) => get(`bllinks:${domain}`)
export const saveLinks = (domain, v) => set(`bllinks:${domain}`, { ...v, rows: v.rows.slice(0, 2000) }) // ponytail: newest load only, 2,000 rows
export const loadProspects = async (domain) => (await get(`prospects:${domain}`)) ?? {}
export async function updateProspects(domain, fn) {
  const p = fn(await loadProspects(domain)) ?? {}
  await set(`prospects:${domain}`, p)
  return p
}

/** Referring domains in `cur` but not `prev` (added) and the reverse (gone). null when the two can't be compared fairly. */
export function diffRefDomains(prev, cur) {
  // Same provider and same list size only: top 25 yesterday vs top 100 today would invent 75 "new" domains.
  if (!prev || !cur || prev.provider !== cur.provider || (prev.top?.length ?? 0) === 0 || (prev.limit ?? 25) !== (cur.limit ?? 25)) return null
  const a = new Set(prev.top.map((t) => t.domain)), b = new Set(cur.top.map((t) => t.domain))
  return { since: prev.at, added: cur.top.filter((t) => !a.has(t.domain)), gone: prev.top.filter((t) => !b.has(t.domain)) }
}

/** Competitor's referring domains that don't appear among yours (both from the same provider), strongest first. */
export function linkGap(mine, theirs) {
  if (!mine || !theirs || mine.provider !== theirs.provider) return null
  const have = new Set(mine.top.map((t) => t.domain))
  return theirs.top.filter((t) => !have.has(t.domain)).sort((x, y) => (y.rating ?? -1) - (x.rating ?? -1))
}

/** Loaded backlinks → filtered: text matches source, anchor or target; follow 'all' | 'follow' | 'nofollow'. */
export function filterLinks(rows, { q = '', follow = 'all' } = {}) {
  const t = clean(q)
  return rows.filter((r) => (follow === 'all' || (follow === 'follow' ? r.follow === true : r.follow === false))
    && (!t || [r.from, r.anchor, r.to].some((x) => (x ?? '').toLowerCase().includes(t))))
}

/** Loaded backlinks → the pages they point at: links, distinct referring domains, followed links. */
export function linkedPages(rows, n = 10) {
  const by = new Map()
  for (const r of rows) {
    if (!r.to) continue
    const p = by.get(r.to) ?? { url: r.to, links: 0, domains: new Set(), follow: 0 }
    p.links++; p.domains.add(r.fromDomain); if (r.follow) p.follow++
    by.set(r.to, p)
  }
  return [...by.values()].map((p) => ({ ...p, domains: p.domains.size })).sort((a, b) => b.domains - a.domains || b.links - a.links).slice(0, n)
}

export const STATUSES = ['to contact', 'contacted', 'replied', 'won', 'not interested']
/** Add referring domains to the prospect list; existing prospects keep their status and notes. */
export function mergeProspects(saved, items, { source, at = new Date().toISOString().slice(0, 10) } = {}) {
  const out = { ...saved }
  for (const it of items) {
    const domain = clean(it.domain)
    if (!domain) continue
    out[domain] = out[domain] ? { ...out[domain], rating: it.rating ?? out[domain].rating } : { domain, rating: it.rating ?? null, status: STATUSES[0], tags: [], notes: '', source, added: at }
  }
  return out
}

/** Does `html` (the linking page, fetched now) still contain a link to `target` (a URL, or a domain)? null = can't tell. */
export function linkPresent(html, base, target) {
  if (!html) return null
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const want = target.includes('/') ? target.replace(/[#?].*$/, '').replace(/\/$/, '') : null
  const domain = (want ? new URL(want).hostname : target).replace(/^www\./, '').toLowerCase()
  return [...doc.querySelectorAll('a[href]')].some((a) => {
    try {
      const u = new URL(a.getAttribute('href'), base)
      const host = u.hostname.replace(/^www\./, '').toLowerCase()
      return want ? `${u.origin}${u.pathname}`.replace(/\/$/, '').replace(/^https?:\/\/www\./, 'https://').replace(/^http:/, 'https:') === want.replace(/^https?:\/\/www\./, 'https://').replace(/^http:/, 'https:') : host === domain || host.endsWith(`.${domain}`)
    } catch { return false }
  })
}
