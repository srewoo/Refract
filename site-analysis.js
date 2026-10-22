// Site-level analyses over a crawl (and domain history): programmatic page templates, parasite-SEO risk, sitemap
// candidates, expired-domain topic shift. Pure: no chrome.*, no DOM.
import { tokens } from './keywords.js'

const html = (pages) => pages.filter((p) => !p.error && p.status === 200 && !p.redirected && (p.type ?? 'text/html').includes('html'))
const noindex = (p) => /noindex|none/i.test(`${p.robots ?? ''} ${p.xRobots ?? ''}`)
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0 }

/** Indexable, self-canonical 200 pages: what a sitemap should list. */
export const sitemapCandidates = (pages) => html(pages).filter((p) => !noindex(p) && (!p.canonical || p.canonical === p.finalUrl || p.canonical === p.url)).map((p) => p.finalUrl ?? p.url)

/** URL path → template: numeric segments become {n}; within a group the varying segment becomes {slug}. */
const shape = (u) => new URL(u).pathname.split('/').filter(Boolean).map((s) => (/^\d+$/.test(s) ? '{n}' : s))
/**
 * Programmatic templates: URL groups of ≥ minPages that share every path segment but one (the slug). Per group:
 * median words, share of thin pages, duplicate titles/descriptions, noindex, and whether titles differ only by the slug.
 */
export function templates(pages, { minPages = 8 } = {}) {
  const groups = new Map()
  for (const p of html(pages)) {
    const segs = shape(p.url)
    if (segs.length < 1) continue
    for (let i = 0; i < segs.length; i++) { // a page joins one group per position its slug could be in
      const key = segs.map((s, j) => (j === i ? '{slug}' : s)).join('/')
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(p)
    }
  }
  const seen = new Set(), out = []
  for (const [key, ps] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    const fresh = ps.filter((p) => !seen.has(p.url))
    if (fresh.length < minPages) continue
    fresh.forEach((p) => seen.add(p.url))
    const titles = fresh.map((p) => p.title ?? ''), descs = fresh.map((p) => p.description ?? '').filter(Boolean)
    const dup = (xs) => xs.length - new Set(xs).size
    const skeleton = (p) => tokens(p.title ?? '').filter((t) => !tokens(decodeURIComponent(new URL(p.url).pathname.split('/').pop() ?? '').replace(/[-_]/g, ' ')).includes(t)).join(' ')
    const sameSkeleton = fresh.length - new Set(fresh.map(skeleton)).size
    out.push({ template: `/${key}`, pages: fresh.length, medianWords: median(fresh.map((p) => p.words ?? 0)), thin: fresh.filter((p) => (p.words ?? 0) < 300).length,
      dupTitles: dup(titles), dupDescriptions: dup(descs), noindex: fresh.filter(noindex).length, slugOnlyTitles: sameSkeleton, examples: fresh.slice(0, 3).map((p) => p.url) })
  }
  return out
}
/** Plain-language problems for one template group (empty = looks fine). */
export function templateProblems(t) {
  const share = (n) => n / t.pages
  return [
    share(t.thin) > 0.5 && `${t.thin} of ${t.pages} pages are thin (< 300 words; median ${t.medianWords})`,
    share(t.dupTitles) > 0.1 && `${t.dupTitles} duplicate titles`,
    share(t.dupDescriptions) > 0.1 && `${t.dupDescriptions} duplicate descriptions`,
    share(t.slugOnlyTitles) > 0.5 && 'titles differ only by the swapped-in word (thin variation, a scaled-content risk)',
  ].filter(Boolean)
}

// Topics Google's site-reputation-abuse policy examples cluster around (third-party coupons, gambling, loans, CBD…).
const RISKY = /\b(coupons?|promo[- ]?codes?|discount[- ]?codes?|casinos?|betting|gambl\w*|poker|slots?|sportsbook|payday|loans?|cbd|vapes?|essay[- ]?writ\w*|forex|crypto[- ]?casino|viagra|replica|escorts?)\b/i
/** Site sections (first path segment) with risky-topic pages: ≥ 3 pages or ≥ 30% of the section. */
export function parasiteRisk(pages) {
  const by = new Map()
  for (const p of html(pages)) {
    const sec = `/${new URL(p.url).pathname.split('/').filter(Boolean)[0] ?? ''}`
    const s = by.get(sec) ?? { section: sec, pages: 0, risky: [] }
    s.pages++
    const m = `${decodeURIComponent(new URL(p.url).pathname)} ${p.title ?? ''}`.match(RISKY)
    if (m) s.risky.push({ url: p.url, term: m[0].toLowerCase() })
    by.set(sec, s)
  }
  return [...by.values()].filter((s) => s.section !== '/' && (s.risky.length >= 3 || (s.risky.length && s.risky.length / s.pages >= 0.3)))
    .map((s) => ({ ...s, terms: [...new Set(s.risky.map((r) => r.term))] })).sort((a, b) => b.risky.length - a.risky.length)
}

/** Earliest archived snapshot vs today: shared topic words. shift=true when two meaningful titles share none. */
export function topicShift(then, now) {
  const a = tokens(`${then.title ?? ''} ${then.description ?? ''}`), b = new Set(tokens(`${now.title ?? ''} ${now.description ?? ''}`))
  const shared = a.filter((t) => b.has(t))
  return { shared, shift: a.length >= 2 && b.size >= 2 && shared.length === 0 }
}
