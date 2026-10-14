// Network probes run *in the page* via executeScript({ func: probeSite, args }), so same-origin
// fetches need no host permission. Self-contained: no imports, no closures (it is serialized).

export async function probeSite(url, canonical, robotsTxt) {
  const MAX_FILES = 6 // ponytail: index + 5 children; giant sitemap sets get "not found in sampled files"
  const page = new URL(url)
  const norm = (u) => { try { const x = new URL(u, page); x.hash = ''; return x.href.replace(/\/$/, '') } catch { return u } }
  const target = norm(url)
  const fetchText = async (u, opts = {}) => {
    try {
      const r = await fetch(u, { cache: 'no-store', credentials: 'same-origin', ...opts })
      return { r, text: opts.redirect === 'manual' ? '' : await r.text() }
    } catch (e) { return { r: null, text: '', error: String(e.message ?? e) } }
  }

  // ---- sitemap: listed in robots.txt, else /sitemap.xml; follow sitemap indexes breadth-first
  const listed = (robotsTxt ?? '').split(/\r?\n/).map((l) => l.match(/^\s*sitemap:\s*(\S+)/i)?.[1]).filter(Boolean)
  const queue = (listed.length ? listed : [`${page.origin}/sitemap.xml`]).filter((u) => { try { return new URL(u).origin === page.origin } catch { return false } })
  const sitemap = { source: listed.length ? 'robots.txt' : 'default path', files: [], contains: false, lastmod: null, crossOrigin: listed.length - queue.length }
  const parser = new DOMParser()
  while (queue.length && sitemap.files.length < MAX_FILES) {
    const u = queue.shift()
    const { r, text, error } = await fetchText(u)
    const file = { url: u, status: r?.status ?? null, error: error ?? null, kind: null, count: 0 }
    sitemap.files.push(file)
    if (!r?.ok) continue
    const xml = parser.parseFromString(text, 'application/xml')
    if (xml.querySelector('parsererror')) { file.error = 'Not valid XML'; continue }
    const root = xml.documentElement.localName
    file.kind = root
    if (root === 'sitemapindex') {
      const kids = [...xml.getElementsByTagNameNS('*', 'loc')].map((l) => l.textContent.trim())
      file.count = kids.length
      queue.push(...kids.filter((k) => { try { return new URL(k).origin === page.origin } catch { return false } }))
    } else if (root === 'urlset') {
      const urls = [...xml.getElementsByTagNameNS('*', 'url')]
      file.count = urls.length
      const hit = urls.find((n) => norm(n.getElementsByTagNameNS('*', 'loc')[0]?.textContent.trim() ?? '') === target)
      if (hit) { sitemap.contains = true; sitemap.lastmod = hit.getElementsByTagNameNS('*', 'lastmod')[0]?.textContent.trim() ?? null; break }
    } else file.error = `Unexpected root <${root}>`
  }
  sitemap.exhausted = queue.length === 0

  // ---- canonical target: only same-origin is fetchable from the page
  let canonicalTarget = null
  if (canonical && norm(canonical) !== target) {
    const c = new URL(canonical, page)
    if (c.origin !== page.origin) canonicalTarget = { crossOrigin: true, url: c.href }
    else {
      const hop = await fetchText(c.href, { redirect: 'manual' })
      if (hop.r?.type === 'opaqueredirect') canonicalTarget = { url: c.href, redirects: true }
      else {
        const { r, text } = await fetchText(c.href)
        const doc = parser.parseFromString(text, 'text/html')
        const robots = `${doc.querySelector('meta[name="robots" i]')?.getAttribute('content') ?? ''} ${r?.headers.get('x-robots-tag') ?? ''}`
        canonicalTarget = { url: c.href, status: r?.status ?? null, noindex: /noindex|none/i.test(robots), canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null }
      }
    }
  }
  return { sitemap, canonicalTarget }
}

/** MAIN-world probe: framework globals the isolated content-script world cannot see. */
export function probeGlobals() {
  const w = window
  return {
    nuxtGlobal: '__NUXT__' in w, svelteGlobal: '__SVELTEKIT' in w || Object.keys(w).some((k) => k.startsWith('__sveltekit')),
    remixContext: '__remixContext' in w, remixManifest: '__remixManifest' in w, shopifyGlobal: 'Shopify' in w,
    nextGlobal: '__NEXT_DATA__' in w || 'next' in w,
  }
}
