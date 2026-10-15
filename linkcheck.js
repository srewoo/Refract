// "Check links": request every unique http(s) link on the page and classify the answer.
// Runs in the extension page with <all_urls> granted, so cross-origin responses are readable (no CORS).
const MAX = 300 // ponytail: cap per run; pages with more get the first 300 unique links, crawl covers site-wide
const CONCURRENCY = 6
const TIMEOUT = 10000

/** Pure: unique http(s) URLs without fragments, in page order. */
export function uniqueTargets(links) {
  const out = new Set()
  for (const l of links) {
    try { const u = new URL(l.href); if (!/^https?:$/.test(u.protocol)) continue; u.hash = ''; out.add(u.href) } catch { /* not a URL */ }
  }
  return [...out]
}

/** Pure: the key a link's result is stored under, or null for non-http links. */
export const targetKey = (href) => uniqueTargets([{ href }])[0] ?? null

/** Pure: status code (0 = opaque redirect, null = network error) → outcome. 401/403/429 often mean "bots not welcome", not broken. */
export function classify(status) {
  if (status == null) return 'error'
  if (status === 0 || (status >= 300 && status < 400)) return 'redirect'
  if (status >= 200 && status < 300) return 'ok'
  if ([401, 403, 429].includes(status)) return 'restricted'
  return 'broken'
}

async function probe(url) {
  const once = async (method) => {
    const r = await fetch(url, { method, redirect: 'manual', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT) })
    if (method === 'GET') r.body?.cancel().catch(() => {}) // headers are enough
    return r.type === 'opaqueredirect' ? 0 : r.status
  }
  try {
    const s = await once('HEAD')
    return [403, 405, 501].includes(s) ? await once('GET') : s // many servers reject HEAD
  } catch (e) {
    if (e.name === 'TimeoutError') return null // don't wait twice on a dead host
    try { return await once('GET') } catch { return null } // some servers drop HEAD connections
  }
}

/** Checks up to MAX targets; onResult(url, {status, outcome}) fires as each finishes. Returns Map url → result. */
export async function checkLinks(links, onResult = () => {}) {
  const targets = uniqueTargets(links).slice(0, MAX)
  const results = new Map()
  let next = 0
  const worker = async () => {
    while (next < targets.length) {
      const url = targets[next++]
      const status = await probe(url)
      const r = { status, outcome: classify(status) }
      results.set(url, r)
      onResult(url, r, results.size, targets.length)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return results
}
export const LINK_CHECK_MAX = MAX
