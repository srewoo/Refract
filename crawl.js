// Bounded, user-initiated crawl of one origin (port of Refract background/crawl.ts).
// Obeys robots.txt, anonymous (no cookies), paced, hard caps on pages and depth, and always says why it
// stopped: every set-membership answer (orphans, duplicates) is only "complete" when the frontier emptied.
import { robotsAllows } from './analyze.js'

export const CRAWL_CAP = 1000
export const DEPTH_CAP = 6
const SKIP_EXT = /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|css|js|mjs|json|xml|txt|zip|gz|mp4|mp3|webm|woff2?|ttf|eot|docx?|xlsx?|pptx?)(\?|$)/i
const UA_NAME = 'RefractSEO-Crawler' // matched against robots.txt groups; falls back to *

export function normalise(href, base) {
  try {
    const u = new URL(href, base)
    if (!/^https?:$/.test(u.protocol)) return null
    u.hash = ''
    u.hostname = u.hostname.toLowerCase()
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|gclid|fbclid|mc_)/i.test(k)) u.searchParams.delete(k)
    return u.href
  } catch { return null }
}

/** Parse one HTML response into the fields the site report needs. Pure (needs DOMParser). */
export function parsePage(html, url) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const meta = (n) => doc.querySelector(`meta[name="${n}" i]`)?.getAttribute('content')?.trim() ?? null
  const origin = new URL(url).origin
  const links = new Set()
  for (const a of doc.querySelectorAll('a[href]')) {
    if (/\bnofollow\b/i.test(a.getAttribute('rel') ?? '')) continue
    const n = normalise(a.getAttribute('href'), url)
    if (n && new URL(n).origin === origin && !SKIP_EXT.test(new URL(n).pathname)) links.add(n)
  }
  doc.querySelectorAll('script,style,noscript,template').forEach((n) => n.remove())
  const walker = doc.createTreeWalker(doc.body ?? doc, 4)
  const parts = []
  while (walker.nextNode()) parts.push(walker.currentNode.data)
  const text = parts.join(' ').replace(/\s+/g, ' ').trim()
  return {
    title: doc.querySelector('title')?.textContent.trim() ?? '',
    description: meta('description'),
    robots: meta('robots'),
    canonical: (() => { const c = doc.querySelector('link[rel="canonical"]')?.getAttribute('href'); return c ? normalise(c, url) : null })(),
    h1: doc.querySelectorAll('h1').length,
    words: text ? text.split(' ').length : 0,
    hreflang: [...doc.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => ({ lang: l.getAttribute('hreflang'), href: normalise(l.getAttribute('href'), url) })),
    links: [...links],
    phones: [...new Set([...doc.querySelectorAll('a[href^="tel:" i]')].map((a) => a.getAttribute('href').slice(4).replace(/[^\d+]/g, '')).filter((p) => p.length >= 7))],
  }
}

/** Every <loc> in the site's sitemaps (robots.txt-listed or /sitemap.xml), following indexes; capped. */
export async function sitemapUrls(origin, robotsTxt, fetchImpl = fetch, maxFiles = 10, maxUrls = 5000) {
  const listed = (robotsTxt ?? '').split(/\r?\n/).map((l) => l.match(/^\s*sitemap:\s*(\S+)/i)?.[1]).filter(Boolean)
  const queue = listed.length ? listed : [`${origin}/sitemap.xml`]
  const urls = new Set()
  let files = 0
  while (queue.length && files < maxFiles && urls.size < maxUrls) {
    files++
    try {
      const r = await fetchImpl(queue.shift(), { credentials: 'omit' })
      if (!r.ok) continue
      const xml = new DOMParser().parseFromString(await r.text(), 'application/xml')
      const locs = [...xml.getElementsByTagNameNS('*', 'loc')].map((l) => l.textContent.trim())
      if (xml.documentElement.localName === 'sitemapindex') queue.push(...locs)
      else locs.forEach((l) => { const n = normalise(l, origin); if (n && new URL(n).origin === origin) urls.add(n) })
    } catch { /* skip unreadable file */ }
  }
  return { urls: [...urls].slice(0, maxUrls), files, exhausted: queue.length === 0 }
}

/**
 * Breadth-first crawl from `start`. Options: robotsTxt, fetchImpl, cap, depthCap, delayMs, signal, onProgress,
 * renderImpl(url) → rendered fields (JavaScript rendering; server-HTML word count kept as rawWords).
 * Returns { pages, stoppedBecause: 'done'|'page_cap'|'depth_cap'|'rate_limited'|'stopped', complete }.
 */
export async function crawl(start, { robotsTxt = null, fetchImpl = fetch, cap = CRAWL_CAP, depthCap = DEPTH_CAP, delayMs = 300, signal, onProgress, renderImpl = null } = {}) {
  const origin = new URL(start).origin
  const seen = new Set([normalise(start)])
  const queue = [{ url: normalise(start), depth: 0, from: null }]
  const pages = []
  const skipped = { robots: 0, depth: 0 }
  let stoppedBecause = 'done'
  while (queue.length) {
    if (signal?.aborted) { stoppedBecause = 'stopped'; break }
    if (pages.length >= cap) { stoppedBecause = 'page_cap'; break }
    const { url, depth, from } = queue.shift()
    if (!robotsAllows(robotsTxt, UA_NAME, new URL(url).pathname + new URL(url).search)) { skipped.robots++; continue }
    const t0 = Date.now()
    const page = { url, depth, from, status: null, finalUrl: url, redirected: false, ms: 0, type: null, error: null }
    try {
      const r = await fetchImpl(url, { credentials: 'omit', redirect: 'follow', cache: 'no-store', signal, headers: { accept: 'text/html' } })
      Object.assign(page, { status: r.status, finalUrl: normalise(r.url || url), redirected: !!r.redirected, type: r.headers.get('content-type'), xRobots: r.headers.get('x-robots-tag') })
      if (r.status === 429 || r.status === 503) { pages.push(page); stoppedBecause = 'rate_limited'; break }
      if (r.ok && /html/i.test(page.type ?? '')) {
        Object.assign(page, parsePage(await r.text(), page.finalUrl))
        if (renderImpl) {
          try { const raw = page.words; Object.assign(page, await renderImpl(page.finalUrl), { rendered: true, rawWords: raw }) } catch (e) { page.renderError = String(e.message ?? e) }
        }
      }
    } catch (e) {
      if (signal?.aborted) { stoppedBecause = 'stopped'; break }
      page.error = String(e.message ?? e)
    }
    page.ms = Date.now() - t0
    pages.push(page)
    for (const l of page.links ?? []) {
      if (seen.has(l) || new URL(l).origin !== origin) continue
      seen.add(l)
      if (depth + 1 > depthCap) { skipped.depth++; continue }
      queue.push({ url: l, depth: depth + 1, from: url })
    }
    onProgress?.({ done: pages.length, queued: queue.length, url })
    if (delayMs) await new Promise((res) => setTimeout(res, delayMs))
  }
  if (stoppedBecause === 'done' && skipped.depth) stoppedBecause = 'depth_cap'
  return { start, origin, pages, skipped, stoppedBecause, complete: stoppedBecause === 'done', finishedAt: new Date().toISOString() }
}

/** Site-level findings from a crawl result. Pure. */
export function analyseCrawl(result, sitemap = { urls: [] }) {
  const html = result.pages.filter((p) => p.status >= 200 && p.status < 300 && p.title !== undefined)
  const byUrl = new Map(result.pages.map((p) => [p.url, p]))
  const group = (key) => {
    const m = new Map()
    for (const p of html) { const v = (p[key] ?? '').trim().toLowerCase(); if (v) m.set(v, [...(m.get(v) ?? []), p.url]) }
    return [...m].filter(([, us]) => us.length > 1).map(([value, urls]) => ({ value, urls })).sort((a, b) => b.urls.length - a.urls.length)
  }
  const inlinks = new Map()
  for (const p of result.pages) for (const l of p.links ?? []) inlinks.set(l, (inlinks.get(l) ?? 0) + 1)
  const broken = []
  for (const p of result.pages) for (const l of p.links ?? []) { const t = byUrl.get(l); if (t && (t.status >= 400 || t.error)) broken.push({ from: p.url, to: l, status: t.status ?? t.error }) }
  const hreflangMissingReturn = []
  for (const p of html) for (const alt of p.hreflang ?? []) {
    if (!alt.href || alt.href === p.url) continue
    const t = byUrl.get(alt.href)
    if (t?.hreflang && !t.hreflang.some((x) => x.href === p.url)) hreflangMissingReturn.push({ from: p.url, to: alt.href, lang: alt.lang })
  }
  const depth = new Map()
  for (const p of result.pages) depth.set(p.depth, (depth.get(p.depth) ?? 0) + 1)
  const status = { ok: 0, redirect: 0, client: 0, server: 0, error: 0 }
  for (const p of result.pages) {
    if (p.error || p.status == null) status.error++
    else if (p.status >= 500) status.server++
    else if (p.status >= 400) status.client++
    else if (p.redirected) status.redirect++
    else status.ok++
  }
  return {
    status,
    broken,
    dupTitles: group('title'),
    dupDescriptions: group('description'),
    missingTitle: html.filter((p) => !p.title).map((p) => p.url),
    missingDescription: html.filter((p) => !p.description).map((p) => p.url),
    missingH1: html.filter((p) => !p.h1).map((p) => p.url),
    noindex: html.filter((p) => /noindex|none/i.test(`${p.robots ?? ''} ${p.xRobots ?? ''}`)).map((p) => p.url),
    canonicalised: html.filter((p) => p.canonical && p.canonical !== p.finalUrl).map((p) => ({ url: p.url, canonical: p.canonical })),
    redirects: result.pages.filter((p) => p.redirected).map((p) => ({ url: p.url, to: p.finalUrl })),
    thin: html.filter((p) => p.words < 300).map((p) => ({ url: p.url, words: p.words })),
    slow: result.pages.filter((p) => p.ms > 1500).map((p) => ({ url: p.url, ms: p.ms })).sort((a, b) => b.ms - a.ms),
    deep: result.pages.filter((p) => p.depth > 3).map((p) => ({ url: p.url, depth: p.depth })),
    depth: [...depth].sort((a, b) => a[0] - b[0]).map(([k, v]) => ({ label: `Depth ${k}`, value: v })),
    // Orphans: in the sitemap, never linked from any crawled page. Only a complete crawl can claim this.
    orphans: sitemap.urls.filter((u) => !inlinks.has(u) && u !== normalise(result.start)),
    hreflangMissingReturn,
    // Content that only exists after JavaScript: rendered text more than double the server HTML.
    jsDependent: html.filter((p) => p.rendered && p.words >= 150 && p.rawWords * 2 < p.words).map((p) => ({ url: p.url, raw: p.rawWords, rendered: p.words })),
    phones: phoneVariants(result.pages),
  }
}

/** Pure: distinct click-to-call numbers across the crawl (compared on the last 10 digits). */
export function phoneVariants(pages) {
  const m = new Map()
  for (const p of pages) for (const ph of p.phones ?? []) { const k = ph.replace(/\D/g, '').slice(-10); if (k.length >= 7) m.set(k, { number: m.get(k)?.number ?? ph, urls: [...(m.get(k)?.urls ?? []), p.url] }) }
  return [...m.values()].sort((a, b) => b.urls.length - a.urls.length)
}
