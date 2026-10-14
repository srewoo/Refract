// Change tracking: compact per-URL snapshots in chrome.storage.local, and pure diffs (page and crawl).
import { linkStats } from './analyze.js'
import { geo, health } from './geo.js'
import { stack } from './rules.js'

const PER_URL = 50
const MAX_URLS = 300 // ponytail: LRU by last audit; a few MB at most
const MIN_GAP_MS = 3600e3 // identical audits within an hour are not re-saved

export const FIELDS = [
  ['health', 'Health score'], ['ai', 'AI readiness'], ['status', 'HTTP status'], ['indexable', 'Indexable'],
  ['title', 'Title'], ['description', 'Meta description'], ['canonical', 'Canonical'], ['robots', 'Meta robots'], ['xRobots', 'X-Robots-Tag'],
  ['h1', 'H1'], ['headings', 'Headings'], ['words', 'Word count'], ['internal', 'Internal links'], ['external', 'External links'], ['nofollow', 'Nofollow links'],
  ['images', 'Images'], ['noAlt', 'Images missing alt'], ['schema', 'Schema types'], ['ogTitle', 'og:title'], ['ogImage', 'og:image'],
  ['hreflang', 'Hreflang alternates'], ['stack', 'Stack'], ['lcp', 'LCP (lab, ms)'], ['cls', 'CLS (lab)'],
]

// Base issues have no id and carry counts in their text; digits are normalised so "3 images" → "5 images" is one issue, not fixed + new.
const issueKey = (i) => i.id ?? i.msg.replace(/\d[\d,.]*/g, '#')
export const pageKey = (url) => `hist:${url.replace(/#.*/, '')}`

/** Pure: the fields worth tracking, flattened to comparable values. */
export function snapshot(d, now = new Date()) {
  const st = linkStats(d.links)
  const hl = health(d)
  return {
    at: now.toISOString(), health: hl.score, ai: geo(d).score, status: d.status, indexable: d.indexable,
    title: d.title, description: d.description ?? '', canonical: d.canonical ?? '', robots: d.robots ?? '', xRobots: d.headers['x-robots-tag'] ?? '',
    h1: d.headings.filter((x) => x.level === 1).map((x) => x.text).join(' | '), headings: d.headings.length, words: d.wordCount,
    internal: st.internal, external: st.external, nofollow: st.nofollow, images: d.images.length, noAlt: d.images.filter((i) => i.alt === null).length,
    schema: [...d.schema.types].sort().join(', '), ogTitle: d.social['og:title'] ?? '', ogImage: d.social['og:image'] ?? '',
    hreflang: d.hreflang.length, stack: stack(d.fw, d.globals).label, lcp: d.perf.lcp ?? null, cls: d.perf.cls ?? null,
    issues: hl.list.map(issueKey),
    issueText: Object.fromEntries(hl.list.map((i) => [issueKey(i), i.msg])),
  }
}

/** Pure: field-level and issue-level differences between two snapshots (older a → newer b). */
export function diffSnapshots(a, b) {
  const volatile = new Set(['lcp', 'cls']) // lab timings jitter; only report big moves
  const changes = FIELDS.filter(([k]) => {
    if (a[k] === b[k]) return false
    if (volatile.has(k)) return a[k] != null && b[k] != null && Math.abs(b[k] - a[k]) > (k === 'lcp' ? 500 : 0.05)
    return true
  }).map(([k, label]) => ({ field: k, label, before: a[k], after: b[k] }))
  const A = new Set(a.issues), B = new Set(b.issues)
  return {
    changes,
    added: b.issues.filter((i) => !A.has(i)).map((i) => b.issueText?.[i] ?? i),
    resolved: a.issues.filter((i) => !B.has(i)).map((i) => a.issueText?.[i] ?? i),
  }
}

const same = (a, b) => JSON.stringify({ ...a, at: 0, lcp: 0, cls: 0 }) === JSON.stringify({ ...b, at: 0, lcp: 0, cls: 0 })

export async function saveSnapshot(d) {
  const key = pageKey(d.url)
  const snap = snapshot(d)
  const { [key]: list = [], 'hist:index': index = {} } = await chrome.storage.local.get([key, 'hist:index'])
  const last = list.at(-1)
  if (last && Date.now() - Date.parse(last.at) < MIN_GAP_MS && same(last, snap)) return list
  const next = [...list, snap].slice(-PER_URL)
  index[key] = snap.at
  const evict = Object.entries(index).sort((x, y) => y[1].localeCompare(x[1])).slice(MAX_URLS).map(([k]) => k)
  evict.forEach((k) => delete index[k])
  await chrome.storage.local.set({ [key]: next, 'hist:index': index })
  if (evict.length) await chrome.storage.local.remove(evict)
  return next
}
export const loadSnapshots = async (url) => (await chrome.storage.local.get(pageKey(url)))[pageKey(url)] ?? []

/** Pure: what changed between two crawls of the same site. */
export function diffCrawls(prev, cur) {
  const P = new Map(prev.pages.map((p) => [p.url, p])), C = new Map(cur.pages.map((p) => [p.url, p]))
  const both = [...C.keys()].filter((u) => P.has(u))
  return {
    since: prev.finishedAt,
    added: [...C.keys()].filter((u) => !P.has(u)),
    removed: [...P.keys()].filter((u) => !C.has(u)),
    status: both.filter((u) => (P.get(u).status ?? P.get(u).error) !== (C.get(u).status ?? C.get(u).error)).map((u) => ({ url: u, before: P.get(u).status ?? 'error', after: C.get(u).status ?? 'error' })),
    titles: both.filter((u) => (P.get(u).title ?? '') !== (C.get(u).title ?? '')).map((u) => ({ url: u, before: P.get(u).title ?? '', after: C.get(u).title ?? '' })),
    indexing: both.filter((u) => /noindex/i.test(P.get(u).robots ?? '') !== /noindex/i.test(C.get(u).robots ?? '')).map((u) => ({ url: u, before: P.get(u).robots ?? 'index', after: C.get(u).robots ?? 'index' })),
  }
}
