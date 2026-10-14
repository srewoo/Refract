// A hidden worker tab for things a fetch can't do: render JavaScript (crawl) or run the full audit on
// another URL (Compare). One tab, inactive, closed in finally. It uses the browser's normal session.

export async function withWorkerTab(fn) {
  const tab = await chrome.tabs.create({ url: 'about:blank', active: false })
  try { return await fn(tab.id) } finally { chrome.tabs.remove(tab.id).catch(() => {}) }
}

/** Navigate the worker tab and resolve once loaded + `settleMs` for client rendering. Rejects after `timeoutMs`. */
export function loadIn(tabId, url, { timeoutMs = 25000, settleMs = 1500 } = {}) {
  return new Promise((resolve, reject) => {
    let started = false
    const timer = setTimeout(() => { cleanup(); reject(new Error(`Timed out loading ${url}`)) }, timeoutMs)
    const onUpdated = (id, info) => {
      if (id !== tabId) return
      if (info.status === 'loading') started = true
      if (info.status === 'complete' && started) { cleanup(); setTimeout(resolve, settleMs) }
    }
    const cleanup = () => { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(onUpdated) }
    chrome.tabs.onUpdated.addListener(onUpdated)
    chrome.tabs.update(tabId, { url }).catch((e) => { cleanup(); reject(e) })
  })
}

/** Injected into the rendered page (self-contained). Same fields as crawl.js parsePage, read from the live DOM. */
export function extractRendered() {
  const SKIP = /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|css|js|mjs|json|xml|txt|zip|gz|mp4|mp3|webm|woff2?|ttf|eot|docx?|xlsx?|pptx?)(\?|$)/i
  const norm = (href) => {
    try { const u = new URL(href, location.href); if (!/^https?:$/.test(u.protocol)) return null; u.hash = ''; for (const k of [...u.searchParams.keys()]) if (/^(utm_|gclid|fbclid|mc_)/i.test(k)) u.searchParams.delete(k); return u.href } catch { return null }
  }
  const meta = (n) => document.querySelector(`meta[name="${n}" i]`)?.getAttribute('content')?.trim() ?? null
  const links = new Set()
  for (const a of document.querySelectorAll('a[href]')) {
    if (/\bnofollow\b/i.test(a.getAttribute('rel') ?? '')) continue
    const n = norm(a.getAttribute('href'))
    if (n && new URL(n).origin === location.origin && !SKIP.test(new URL(n).pathname)) links.add(n)
  }
  const text = (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim()
  const canon = document.querySelector('link[rel="canonical"]')?.getAttribute('href')
  return {
    title: document.title.trim(), description: meta('description'), robots: meta('robots'), canonical: canon ? norm(canon) : null,
    h1: document.querySelectorAll('h1').length, words: text ? text.split(' ').length : 0,
    hreflang: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => ({ lang: l.getAttribute('hreflang'), href: norm(l.getAttribute('href')) })),
    links: [...links],
    phones: [...new Set([...document.querySelectorAll('a[href^="tel:" i]')].map((a) => a.getAttribute('href').slice(4).replace(/[^\d+]/g, '')).filter((p) => p.length >= 7))],
  }
}

/** A renderImpl for crawl(): render `url` in the worker tab and read it. */
export const renderer = (tabId) => async (url) => {
  await loadIn(tabId, url)
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: extractRendered })
  return result
}
