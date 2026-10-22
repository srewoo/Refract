// Injected into the inspected tab via chrome.scripting.executeScript({ files }).
// The file's completion value (a promise) is what the popup receives, so the last
// expression must be the call. Everything returned must be structured-cloneable.
globalThis.__sssCollect = async (doc, loc) => {
  const $$ = (sel) => [...doc.querySelectorAll(sel)]
  const meta = (attr, name) => doc.querySelector(`meta[${attr}="${name}" i]`)?.getAttribute('content')?.trim() ?? null
  const abs = (href) => { try { return new URL(href, loc.href) } catch { return null } }

  const bodyText = (doc.body?.innerText ?? doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim()
  const words = bodyText.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []

  const links = $$('a[href]').map((a) => {
    const u = abs(a.getAttribute('href'))
    const rel = (a.getAttribute('rel') ?? '').toLowerCase().split(/\s+/)
    return {
      href: u?.href ?? a.getAttribute('href'),
      text: (a.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
      title: a.getAttribute('title'),
      internal: u ? u.hostname === loc.hostname : false,
      nofollow: rel.includes('nofollow'),
      sponsored: rel.includes('sponsored'),
      ugc: rel.includes('ugc'),
    }
  }).filter((l) => !/^(javascript|mailto|tel):/i.test(l.href))

  const fold = innerHeight || 800
  const images = $$('img').map((img) => {
    const r = img.getBoundingClientRect?.() ?? { top: 9e9, bottom: 9e9, width: 0 }
    return {
      src: img.currentSrc || abs(img.getAttribute('src') ?? '')?.href || '',
      alt: img.getAttribute('alt'),
      title: img.getAttribute('title'),
      width: img.naturalWidth || null,
      height: img.naturalHeight || null,
      lazy: img.getAttribute('loading') === 'lazy',
      hasDims: img.hasAttribute('width') && img.hasAttribute('height'),
      aboveFold: r.top + scrollY < fold && r.width > 0,
      decorative: img.getAttribute('role') === 'presentation' || img.getAttribute('aria-hidden') === 'true',
      // Grounding for AI alt-text suggestions: caption or nearby text, only where alt is missing.
      context: img.getAttribute('alt') === null ? ((img.closest('figure')?.querySelector('figcaption')?.textContent ?? img.closest('a,p,li,section,article,div')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 240)) : null,
    }
  })

  const jsonLd = $$('script[type="application/ld+json"]').map((s) => {
    try { return { ok: true, data: JSON.parse(s.textContent) } } catch (e) { return { ok: false, error: String(e), raw: s.textContent.slice(0, 500) } }
  })
  const ldTypes = (node, out = []) => {
    if (Array.isArray(node)) node.forEach((n) => ldTypes(n, out))
    else if (node && typeof node === 'object') {
      if (node['@type']) out.push(...[].concat(node['@type']))
      Object.values(node).forEach((v) => ldTypes(v, out))
    }
    return out
  }

  const timing = performance.getEntriesByType?.('navigation')?.[0]
  const vitals = await new Promise((resolve) => {
    const v = { lcp: null, cls: 0, inp: null, lcpEl: null }
    const done = () => resolve(v)
    if (typeof PerformanceObserver === 'undefined') return done()
    try {
      new PerformanceObserver((l) => {
        const e = l.getEntries().at(-1)
        if (!e) return
        v.lcp = Math.round(e.startTime)
        const el = e.element
        v.lcpEl = el ? { tag: el.tagName.toLowerCase(), url: e.url || null, lazy: el.getAttribute?.('loading') === 'lazy' } : null
      }).observe({ type: 'largest-contentful-paint', buffered: true })
      // INP so far: slowest interaction observed in this page's life (buffered event timing).
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.interactionId) v.inp = Math.max(v.inp ?? 0, Math.round(e.duration)) })
        .observe({ type: 'event', buffered: true, durationThreshold: 16 })
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) v.cls += e.value })
        .observe({ type: 'layout-shift', buffered: true })
    } catch { /* unsupported entry type */ }
    setTimeout(done, 150) // buffered entries are delivered on the next task
  })

  // Same-origin fetches from the page: no host permission needed.
  const get = async (url, method = 'GET') => {
    try { return await fetch(url, { method, cache: 'no-store', credentials: 'same-origin' }) } catch { return null }
  }
  // GET (not HEAD): the raw HTML body tells us how much text exists before JavaScript runs.
  const [head, robotsRes, llmsRes] = await Promise.all([get(loc.href), get(`${loc.origin}/robots.txt`), get(`${loc.origin}/llms.txt`)])
  const robotsTxt = robotsRes?.ok ? (await robotsRes.text()).slice(0, 20000) : null
  const llmsTxt = llmsRes?.ok && !/html/i.test(llmsRes.headers.get('content-type') ?? '')
  let rawTextChars = null
  let rawMeta = null // what a non-rendering crawler sees in <head>
  try {
    const raw = new DOMParser().parseFromString(await head.text(), 'text/html')
    rawMeta = {
      title: raw.querySelector('title')?.textContent.trim() ?? '',
      description: raw.querySelector('meta[name="description" i]')?.getAttribute('content')?.trim() ?? null,
      canonical: raw.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
      robots: raw.querySelector('meta[name="robots" i]')?.getAttribute('content') ?? null,
      h1: raw.querySelectorAll('h1').length,
    }
    raw.querySelectorAll('script,style,noscript,template').forEach((n) => n.remove())
    rawTextChars = (raw.body?.textContent ?? '').replace(/\s+/g, ' ').trim().length
  } catch { /* no body (opaque/failed fetch) */ }
  const headers = head ? Object.fromEntries(['x-robots-tag', 'content-type', 'server', 'cache-control', 'last-modified', 'content-encoding']
    .map((h) => [h, head.headers.get(h)]).filter(([, v]) => v)) : {}

  const robotsMeta = meta('name', 'robots')
  const canonical = doc.querySelector('link[rel="canonical"]')?.href ?? null
  const noindex = /\b(noindex|none)\b/i.test(`${robotsMeta ?? ''} ${headers['x-robots-tag'] ?? ''}`)

  const htmlSrc = doc.documentElement.outerHTML.slice(0, 400000)
  const scriptSrcs = $$('script[src]').map((x) => x.getAttribute('src') ?? '')
  return {
    rawMeta,
    finalUrl: head?.url ?? loc.href,
    redirected: !!head?.redirected,
    redirectCount: timing?.redirectCount ?? 0,
    botMetas: $$('meta[name]').filter((m) => /robots|bot/i.test(m.getAttribute('name'))).map((m) => ({ name: m.getAttribute('name'), content: m.getAttribute('content') ?? '' })),
    dataNosnippet: $$('[data-nosnippet]').length,
    canonicals: $$('link[rel="canonical"]').map((l) => l.getAttribute('href')),
    metaRefresh: doc.querySelector('meta[http-equiv="refresh" i]')?.getAttribute('content') ?? null,
    mixedContent: loc.protocol === 'https:' ? [...new Set($$('img[src],script[src],iframe[src],video[src],audio[src],source[src],link[rel~="stylesheet"][href]')
      .map((e) => e.getAttribute('src') ?? e.getAttribute('href')).filter((u) => /^http:\/\//i.test(u ?? '')))].slice(0, 50) : [],
    // Framework fingerprints readable from the DOM (ported from Refract's signals.ts); window globals come from a MAIN-world probe.
    fw: {
      nextData: !!doc.getElementById('__NEXT_DATA__'),
      nextStatic: scriptSrcs.some((x) => x.includes('/_next/static/')),
      rscFlight: /self\.__next_f\b/.test(htmlSrc),
      nextAppLayout: scriptSrcs.some((x) => /\/_next\/static\/chunks\/app[/-]/.test(x)),
      nuxt: scriptSrcs.some((x) => x.includes('/_nuxt/')),
      astro: !!doc.querySelector('astro-island') || /data-astro-cid-/.test(htmlSrc),
      sveltekit: scriptSrcs.some((x) => x.includes('/_app/immutable/')),
      remix: scriptSrcs.some((x) => /\/build\/(?:entry\.client|root)-[A-Z0-9]{8}\.js/.test(x)),
      wordpress: /wp-content|wp-json/.test(htmlSrc),
      shopify: /cdn\.shopify\.com/.test(htmlSrc),
      angular: !!doc.querySelector('[ng-version]'),
      react: !!doc.querySelector('[data-reactroot]'),
      vue: !!doc.querySelector('[data-v-app]'),
      generator: meta('name', 'generator') ?? '',
    },
    url: loc.href,
    host: loc.hostname,
    status: head?.status ?? null,
    title: doc.title?.trim() ?? '',
    description: meta('name', 'description'),
    keywords: meta('name', 'keywords'),
    author: meta('name', 'author'),
    robots: robotsMeta,
    canonical,
    canonicalSelf: canonical ? abs(canonical)?.href.replace(/#.*/, '') === loc.href.replace(/#.*/, '') : null,
    indexable: !noindex && (head?.status ?? 200) < 300,
    lang: doc.documentElement.getAttribute('lang'),
    viewport: meta('name', 'viewport'),
    charset: doc.characterSet,
    hreflang: $$('link[rel="alternate"][hreflang]').map((l) => ({ lang: l.getAttribute('hreflang'), href: l.href })),
    headers,
    headings: $$('h1,h2,h3,h4,h5,h6').map((h) => ({ level: Number(h.tagName[1]), text: (h.textContent ?? '').replace(/\s+/g, ' ').trim() })),
    links,
    images,
    schema: { jsonLd, types: [...new Set(jsonLd.flatMap((j) => (j.ok ? ldTypes(j.data) : [])))], microdata: [...new Set($$('[itemtype]').map((e) => e.getAttribute('itemtype')))] },
    social: Object.fromEntries($$('meta[property^="og:"],meta[name^="twitter:"],meta[property^="twitter:"]')
      .map((m) => [m.getAttribute('property') ?? m.getAttribute('name'), m.getAttribute('content')])),
    // Local SEO (NAP) signals; structured data comes from schema.jsonLd.
    local: {
      telLinks: [...new Set($$('a[href^="tel:" i]').map((x) => decodeURIComponent(x.getAttribute('href').slice(4)).trim()))].slice(0, 20),
      visiblePhones: [...new Set(bodyText.match(/(?:\+\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]\d{3,4}[\s.-]\d{3,4}\b/g) ?? [])].filter((p) => p.replace(/\D/g, '').length >= 9).slice(0, 10),
      addresses: $$('address').map((x) => (x.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 5),
      mapEmbeds: $$('iframe[src]').filter((f) => /google\.[a-z.]+\/maps|maps\.google\./i.test(f.getAttribute('src'))).length,
      gbpLinks: [...new Set($$('a[href]').map((x) => x.href).filter((u) => /maps\.app\.goo\.gl|g\.page\/|google\.[a-z.]+\/maps|business\.google\.com|search\.google\.com\/local/i.test(u)))].slice(0, 10),
    },
    textSample: bodyText.slice(0, 4000), // AI grounding: the only page text a model ever sees
    words: words.slice(0, 50000), // ponytail: density on first 50k words; enough for any real page
    wordCount: words.length,
    // Zero-width and bidi control characters: invisible in the page, left behind by AI tools and copy-paste pipelines.
    hiddenChars: (bodyText.match(/[\u200B-\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/g) ?? []).length,
    bodyText: bodyText.slice(0, 20000), // for on-request entity analysis (Content › Natural Language)
    robotsTxt,
    llmsTxt,
    favicon: doc.querySelector('link[rel~="icon" i]')?.href ?? `${loc.origin}/favicon.ico`,
    emphasis: {
      strong: [...new Set($$('strong,b').map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 60),
      em: [...new Set($$('em,i').filter((e) => !e.className.includes('icon')).map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 60),
    },
    tags: (() => {
      // AdSense / analytics IDs from script URLs and inline scripts (AITDK "Adsense" tab, extended to tags).
      const src = $$('script').map((s) => `${s.src} ${s.src ? '' : s.textContent.slice(0, 20000)}`).join('\n') + $$('ins[data-ad-client]').map((i) => i.dataset.adClient).join(' ')
      const ids = (re) => [...new Set(src.match(re) ?? [])]
      return {
        adsense: ids(/ca-pub-\d{10,20}/g),
        adSlots: $$('ins.adsbygoogle').length,
        ga4: ids(/\bG-[A-Z0-9]{6,12}\b/g),
        gtm: ids(/\bGTM-[A-Z0-9]{4,9}\b/g),
        uaLegacy: ids(/\bUA-\d{4,10}-\d{1,4}\b/g),
        other: [['Meta Pixel', /fbevents\.js|fbq\(/], ['Hotjar', /static\.hotjar\.com/], ['Microsoft Clarity', /clarity\.ms/], ['Plausible', /plausible\.io/],
          ['Matomo', /matomo|piwik/i], ['Segment', /cdn\.segment\.com/], ['HubSpot', /js\.hs-scripts\.com|hs-analytics/], ['LinkedIn Insight', /snap\.licdn\.com/],
          ['TikTok Pixel', /analytics\.tiktok\.com/], ['Cloudflare Web Analytics', /static\.cloudflareinsights\.com/]]
          .filter(([, re]) => re.test(src)).map(([n]) => n),
      }
    })(),
    rawTextChars,
    renderedTextChars: bodyText.length,
    structure: {
      lists: $$('ul,ol').filter((l) => !l.closest('nav,header,footer')).length,
      tables: $$('table').length,
      questionHeadings: $$('h2,h3').filter((h) => /\?\s*$/.test(h.textContent ?? '')).length,
      published: meta('property', 'article:published_time') ?? doc.querySelector('time[datetime]')?.getAttribute('datetime') ?? null,
      modified: meta('property', 'article:modified_time') ?? null,
    },
    perf: timing ? {
      ttfb: Math.round(timing.responseStart - timing.startTime),
      dcl: Math.round(timing.domContentLoadedEventEnd - timing.startTime),
      load: Math.round(timing.loadEventEnd - timing.startTime),
      transferKb: Math.round((timing.transferSize ?? 0) / 1024),
      protocol: timing.nextHopProtocol || null,
      // Open SEO Stats-style phase breakdown, each [start, end] ms from navigation start.
      phases: [
        ['Redirect', timing.redirectStart, timing.redirectEnd],
        ['DNS', timing.domainLookupStart, timing.domainLookupEnd],
        ['Connect', timing.connectStart, timing.secureConnectionStart || timing.connectEnd],
        ['TLS', timing.secureConnectionStart, timing.secureConnectionStart ? timing.connectEnd : 0],
        ['Request', timing.requestStart, timing.responseStart],
        ['Response', timing.responseStart, timing.responseEnd],
        ['DOM processing', timing.responseEnd, timing.domInteractive],
        ['DOMContentLoaded', timing.domContentLoadedEventStart, timing.domContentLoadedEventEnd],
        ['Subresources', timing.domInteractive, timing.domComplete],
        ['Load event', timing.loadEventStart, timing.loadEventEnd],
      ].map(([name, a, b]) => ({ name, start: Math.round(a - timing.startTime), end: Math.round(b - timing.startTime) }))
        .filter((p) => p.end > p.start && p.start >= 0),
      domNodes: $$('*').length,
      ...vitals, cls: Math.round(vitals.cls * 1000) / 1000,
    } : { domNodes: $$('*').length, ...vitals },
  }
}
globalThis.__sssCollect(document, location)
