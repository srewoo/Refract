// Google results page: number organic results, export them (and People Also Ask) as CSV.
// Google re-renders results on scroll ("continuous scroll"), so re-number on DOM changes.
(async () => {
  const BADGE = 'sss-pos'
  // Shared with paa.js (same content-script world, loaded after this file). Defined before any await.
  globalThis.sssCsv = (rows) => rows.map((r) => r.map((c) => { const v = String(c ?? ''); return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v }).join(',')).join('\n')
  const cfg = (await globalThis.chrome?.storage?.sync.get({ serpBadges: true })) ?? { serpBadges: true }
  if (!cfg.serpBadges) return
  const style = document.createElement('style')
  style.textContent = `.${BADGE}{display:inline-block;min-width:22px;margin-right:6px;padding:0 5px;border-radius:9px;background:#2456d6;color:#fff;font:600 12px/18px system-ui;text-align:center;vertical-align:middle}
  #sss-export{position:fixed;right:16px;bottom:16px;z-index:2147483647;padding:8px 14px;border:0;border-radius:18px;background:#2456d6;color:#fff;font:600 13px system-ui;box-shadow:0 2px 8px #0003;cursor:pointer}`
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

  const number = () => organic().forEach(({ h3 }, i) => {
    let b = h3.querySelector(`.${BADGE}`)
    if (!b) { b = document.createElement('span'); b.className = BADGE; h3.prepend(b) }
    if (b.textContent !== String(i + 1)) b.textContent = String(i + 1)
  })

  const btn = document.createElement('button')
  btn.id = 'sss-export'
  btn.textContent = 'Copy results CSV'
  btn.addEventListener('click', async () => {
    const rows = organic().map(({ a, h3 }, i) => [i + 1, [...h3.childNodes].filter((n) => !n.classList?.contains(BADGE)).map((n) => n.textContent).join('').trim(), a.href])
    const csv = globalThis.sssCsv([['position', 'title', 'url'], ...rows, ...paa().map((q) => ['PAA', q, ''])])
    await navigator.clipboard.writeText(csv)
    btn.textContent = `Copied ${rows.length} results`
    setTimeout(() => { btn.textContent = 'Copy results CSV' }, 2000)
  })
  document.body.append(btn)

  number()
  let pending = false
  new MutationObserver(() => {
    if (pending) return
    pending = true
    requestAnimationFrame(() => { pending = false; number() })
  }).observe(document.getElementById('search')?.parentElement ?? document.body, { childList: true, subtree: true })
})()
