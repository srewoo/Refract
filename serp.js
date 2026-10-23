// Google results page: number organic results, export them (and People Also Ask) as CSV.
// Google re-renders results on scroll ("continuous scroll"), so re-number on DOM changes.
(async () => {
  const BADGE = 'sss-pos'
  // Shared with paa.js (same content-script world, loaded after this file). Defined before any await.
  globalThis.sssCsv = (rows) => rows.map((r) => r.map((c) => { const v = String(c ?? ''); return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v }).join(',')).join('\n')
  const cfg = (await globalThis.chrome?.storage?.sync.get({ serpBadges: true, serpDomain: '' })) ?? { serpBadges: true, serpDomain: '' }
  if (!cfg.serpBadges) return
  const style = document.createElement('style')
  style.textContent = `.${BADGE}{display:inline-block;min-width:22px;margin-right:6px;padding:0 5px;border-radius:9px;background:#2456d6;color:#fff;font:600 12px/18px system-ui;text-align:center;vertical-align:middle}
  #sss-export{position:fixed;right:16px;bottom:16px;z-index:2147483647;padding:8px 14px;border:0;border-radius:18px;background:#2456d6;color:#fff;font:600 13px system-ui;box-shadow:0 2px 8px #0003;cursor:pointer}
  #sss-layout{position:fixed;left:16px;bottom:16px;z-index:2147483647;width:290px;max-width:calc(100vw - 32px);box-sizing:border-box;background:#fff;color:#1d2330;border:1px solid #d0d4da;border-radius:10px;box-shadow:0 6px 24px #0003;padding:8px 12px;font:13px/1.45 system-ui}
  #sss-layout summary{font-weight:600;cursor:pointer}#sss-layout .out{margin:6px 0}#sss-layout .out div{margin:2px 0}
  #sss-layout input{width:100%;box-sizing:border-box;margin-top:2px;padding:4px 6px;border:1px solid #d0d4da;border-radius:6px;font:inherit}
  .sss-mine{outline:3px solid #e8a400;outline-offset:6px;border-radius:4px}`
  document.head.append(style)

  const organic = () => {
    const seen = new Set()
    const out = []
    for (const h3 of document.querySelectorAll('#search a h3, #botstuff a h3')) {
      const a = h3.closest('a')
      if (!a?.href || seen.has(a.href) || a.closest('[data-text-ad], #tads, #bottomads, [jsname="yEVEwb"]')) continue
      seen.add(a.href)
      out.push({ a, h3 })
    }
    return out
  }

  const paa = () => [...document.querySelectorAll('[jsname="yEVEwb"] [role="button"], div.related-question-pair')]
    .map((q) => q.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean)

  // SERP layout: what sits above the first organic result, how far down it is, whether an AI Overview shows and cites you.
  // ponytail: matches English heading text + page geometry, not Google's class names (they churn). Other UI languages see only Ads/pixels.
  const FEATURES = [[/^AI Overview/i, 'AI Overview'], [/^(Sponsored|Ads?)\b/i, 'Ads'], [/^People also ask/i, 'People also ask'], [/^Top stories/i, 'Top stories'],
    [/^Videos?\b/i, 'Videos'], [/^Images?\b/i, 'Images'], [/^(Places|Businesses|Locations)\b/i, 'Local pack'], [/^(Popular|Sponsored) products/i, 'Shopping'],
    [/About featured snippets/i, 'Featured snippet']]
  const y = (el) => Math.round(el.getBoundingClientRect().top + scrollY)
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' } }
  const mine = (u, d) => !!d && (host(u) === d || host(u).endsWith(`.${d}`))
  const cleanDomain = (v) => host(`https://${v.trim().replace(/^https?:\/\//i, '')}`)
  const isGoogle = (u) => /(^|\.)google\./.test(host(u))
  // Google (2026) wraps result links in opaque /goto?url=<encrypted> tokens. The visible <cite> breadcrumb
  // ("https://www.semrush.com › Blog") still names the site; '' when even that is missing (e.g. video results).
  const realUrl = (a) => {
    if (/^https?:/i.test(a.getAttribute('href') ?? '') && !isGoogle(a.href)) return a.href // relative hrefs are Google's own
    const c = a.querySelector('cite')?.textContent.split('›')[0].trim() ?? ''
    return /^https?:\/\/\S+$/.test(c) ? c : ''
  }
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const favHost = (img) => { const s = img.getAttribute('src') || img.getAttribute('data-src') || ''; return /faviconV2/.test(s) ? host(new URL(s, location.href).searchParams.get('url') ?? '') : '' }

  // AI Overview sources: exact hosts from direct links and favicons, else the site name Google puts in aria-label ("NAV43").
  // ponytail: name match compares the domain's first label ("nav43.com" ↔ "NAV43"); a subdomain typed as "your domain" won't name-match.
  function aiSources(box, domain) {
    const byKey = new Map() // one entry per site, keyed by normalised name
    const add = (key, label, h) => { if (key && !byKey.has(key)) byKey.set(key, { label, h }) }
    for (const img of box.querySelectorAll('img')) { const h = favHost(img); if (h) add(norm(h.split('.')[0]), h, h) }
    for (const a of box.querySelectorAll('a[href]')) {
      const u = realUrl(a)
      if (u) add(norm(host(u).split('.')[0]), host(u), host(u))
      // Only Google's redirect links name a source; its own UI links ("Go to Google Home") are not sites.
      else if (a.getAttribute('aria-label') && /\/(url|goto)\?/.test(a.getAttribute('href'))) { const name = a.getAttribute('aria-label').trim(); add(norm(name.split('·')[0]), name, '') }
    }
    const want = norm(domain.split('.')[0])
    const sources = [...byKey.entries()]
    const cites = !!domain && sources.some(([, s]) => (s.h && mine(`https://${s.h}`, domain)) || s.label.split('·').some((p) => norm(p) === want))
    return { sources: sources.map(([, s]) => s.label), cites }
  }

  function layout(results, domain) {
    const first = results[0] ? y(results[0].a) : null
    const marks = []
    for (const el of document.querySelectorAll('[role="heading"], h1, h2, #tads, a')) {
      if (el.closest('#sss-layout') || !el.getBoundingClientRect().height) continue
      const text = el.id === 'tads' ? 'Ads' : el.textContent.replace(/\s+/g, ' ').trim()
      if (el.tagName === 'A' && !/About featured snippets/i.test(text)) continue
      const hit = FEATURES.find(([re]) => re.test(text))
      if (hit) marks.push({ name: hit[1], y: y(el), el })
    }
    marks.sort((p, q) => p.y - q.y)
    const above = [...new Set(marks.filter((m) => first == null || m.y < first).map((m) => m.name))]
    const head = marks.find((m) => m.name === 'AI Overview')
    let aio = null
    if (head) {
      // AI Overview block = largest ancestor of its heading holding no result title. Collapsed overviews keep sources hidden
      // (zero size), so count every outside link in the block, not just visible ones.
      let box = head.el
      while (box.parentElement && box.parentElement !== document.body && !box.parentElement.querySelector('a h3')) box = box.parentElement
      aio = aiSources(box, domain)
    }
    const rank = results.findIndex(({ a }) => mine(realUrl(a), domain))
    return { first, above, aio, rank, rankY: rank < 0 ? null : y(results[rank].a) }
  }

  let domain = cleanDomain(cfg.serpDomain ?? '')
  const panel = document.createElement('details')
  panel.id = 'sss-layout'
  panel.innerHTML = '<summary></summary><div class="out"></div><label>Your domain<input type="text" placeholder="example.com" spellcheck="false" autocomplete="off"></label>'
  const [summary, out, input] = [panel.querySelector('summary'), panel.querySelector('.out'), panel.querySelector('input')]
  input.value = domain
  input.addEventListener('input', () => {
    domain = cleanDomain(input.value)
    globalThis.chrome?.storage?.sync.set({ serpDomain: domain })
    refresh()
  })
  document.body.append(panel)

  // Remember what this search showed for the saved domain; the Opportunities view reads 'serp:obs'.
  let lastObs = ''
  function remember(l) {
    const query = new URLSearchParams(location.search).get('q')?.trim()
    if (!domain || !query || !globalThis.chrome?.storage?.local) return
    const o = { domain, query, aio: !!l.aio, sources: l.aio?.sources ?? [], cites: !!l.aio?.cites, rank: l.rank + 1, firstY: l.first }
    const sig = JSON.stringify(o)
    if (sig === lastObs) return // the observer re-runs often; write only when something changed
    lastObs = sig
    // ponytail: last 300 searches, latest per domain+query; move to IndexedDB if people track thousands of keywords
    chrome.storage.local.get({ 'serp:obs': [] }).then(({ 'serp:obs': list }) => chrome.storage.local.set({
      'serp:obs': [...list.filter((x) => !(x.domain === domain && x.query === query)), { ...o, at: new Date().toISOString() }].slice(-300) }))
  }

  function showLayout(results) {
    const l = layout(results, domain)
    remember(l)
    results.forEach(({ a }) => a.classList.toggle('sss-mine', mine(realUrl(a), domain)))
    const px = (n) => `${n.toLocaleString()}px`
    const lines = l.first == null ? ['No organic results found on this page.'] : [
      `First organic result at ${px(l.first)}: ${l.first < innerHeight ? 'visible without scrolling' : 'needs a scroll'} (window ${px(innerHeight)}).`,
      l.above.length ? `Above it: ${l.above.join(', ')}.` : 'Nothing above it.',
    ]
    lines.push(!l.aio ? 'AI Overview: not shown.' : `AI Overview: shown, ${l.aio.sources.length} source site${l.aio.sources.length === 1 ? '' : 's'}${domain ? (l.aio.cites ? ', cites you.' : ', does not cite you.') : '.'}`)
    if (l.aio?.sources.length) lines.push(`Sources: ${l.aio.sources.slice(0, 6).join(', ')}${l.aio.sources.length > 6 ? ` +${l.aio.sources.length - 6}` : ''}.`)
    if (domain) lines.push(l.rank < 0 ? `${domain}: not in the ${results.length} loaded results.` : `${domain}: #${l.rank + 1} at ${px(l.rankY)}.`)
    const head = l.first == null ? 'SERP layout' : `SERP: first organic at ${px(l.first)}${l.aio ? ' · AI Overview' : ''}`
    if (summary.textContent !== head) summary.textContent = head // compare first: the observer below watches this subtree
    if (out.textContent !== lines.join('')) out.replaceChildren(...lines.map((t) => Object.assign(document.createElement('div'), { textContent: t })))
  }

  const btn = document.createElement('button')
  btn.id = 'sss-export'
  btn.textContent = 'Copy results CSV'
  btn.addEventListener('click', async () => {
    const rows = organic().map(({ a, h3 }, i) => [i + 1, [...h3.childNodes].filter((n) => !n.classList?.contains(BADGE)).map((n) => n.textContent).join('').trim(), realUrl(a) || a.href, y(a)])
    const csv = globalThis.sssCsv([['position', 'title', 'url', 'pixel_y'], ...rows, ...paa().map((q) => ['PAA', q, '', ''])])
    await navigator.clipboard.writeText(csv)
    btn.textContent = `Copied ${rows.length} results`
    setTimeout(() => { btn.textContent = 'Copy results CSV' }, 2000)
  })
  document.body.append(btn)

  function refresh() {
    const results = organic()
    results.forEach(({ h3 }, i) => {
      let b = h3.querySelector(`.${BADGE}`)
      if (!b) { b = document.createElement('span'); b.className = BADGE; h3.prepend(b) }
      if (b.textContent !== String(i + 1)) b.textContent = String(i + 1)
    })
    showLayout(results)
  }

  refresh()
  let pending = false
  new MutationObserver(() => {
    if (pending) return
    pending = true
    requestAnimationFrame(() => { pending = false; refresh() })
  }).observe(document.getElementById('search')?.parentElement ?? document.body, { childList: true, subtree: true })
})()
