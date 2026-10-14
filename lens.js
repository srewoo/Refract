// Bot's-eye lens (port of Refract background/lens.ts + ua.ts): fetch this URL as each crawler
// would — anonymous, with that crawler's User-Agent — and classify what came back.
// fetch() cannot set User-Agent (forbidden header), so a DNR session rule rewrites it, scoped to
// this exact URL and to XHR/fetch only (not the tab's own navigation), then removed.
import { AGENTS } from './ua.js'

export const LENSES = {
  'Googlebot Smartphone': AGENTS['Googlebot Smartphone'],
  'Bingbot': AGENTS.Bingbot,
  'GPTBot': AGENTS.GPTBot,
  'OAI-SearchBot': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot',
  'ClaudeBot': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  'PerplexityBot': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
}
// ponytail: reserved id band far above real tab ids (ua.js uses tab ids as rule ids).
export const LENS_RULE_BASE = 1_900_000_000
const TIMEOUT_MS = 12000
const CHALLENGE = ['cf-browser-verification', 'cf_chl_opt', 'challenge-platform', 'just a moment', 'attention required', 'access denied', 'incapsula', '_imperva_', 'perimeterx', 'px-captcha', 'ddos-guard']

/** Pure: classify a fetched response. Exported for tests. */
export function classify(status, contentType, body) {
  if ([403, 429, 503].includes(status)) return { outcome: 'blocked', detail: `HTTP ${status}` }
  if (status === 401) return { outcome: 'unverified', detail: 'Requires authentication' }
  if (status >= 400) return { outcome: 'unverified', detail: `HTTP ${status}` }
  if (!/html/i.test(contentType ?? '')) return { outcome: 'unverified', detail: `Not HTML (${contentType || 'no content-type'})` }
  const head = body.slice(0, 4000).toLowerCase()
  if (CHALLENGE.some((f) => head.includes(f))) return { outcome: 'blocked', detail: 'CDN challenge page instead of content' }
  const doc = new DOMParser().parseFromString(body, 'text/html')
  doc.querySelectorAll('script,style,noscript,template').forEach((n) => n.remove())
  // Join text nodes with spaces: textContent would glue adjacent blocks ("<h1>x</h1><p>one" → "xone").
  const walker = doc.createTreeWalker(doc.body ?? doc, 4 /* NodeFilter.SHOW_TEXT */)
  const parts = []
  while (walker.nextNode()) parts.push(walker.currentNode.data)
  const text = parts.join(' ').replace(/\s+/g, ' ').trim()
  const words = text ? text.split(' ').length : 0
  if (words < 60 && head.includes('<form') && head.includes('password')) return { outcome: 'unverified', detail: 'Login wall' }
  return {
    outcome: 'served',
    title: doc.querySelector('title')?.textContent.trim() ?? '',
    words,
    robots: doc.querySelector('meta[name="robots" i]')?.getAttribute('content') ?? null,
    canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
    h1: doc.querySelectorAll('h1').length,
  }
}

export async function fetchAs(url, name, i = 0) {
  const id = LENS_RULE_BASE + i
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [id],
    addRules: [{ id, priority: 2, action: { type: 'modifyHeaders', requestHeaders: [{ header: 'user-agent', operation: 'set', value: LENSES[name] }] },
      condition: { urlFilter: `|${url}|`, resourceTypes: ['xmlhttprequest'] } }],
  })
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  const t0 = performance.now()
  try {
    // Anonymous on purpose: a crawler carries no cookies, so sending the user's session would lie.
    const r = await fetch(url, { credentials: 'omit', cache: 'no-store', redirect: 'follow', signal: ctl.signal, headers: { accept: 'text/html,application/xhtml+xml' } })
    const body = await r.text()
    return { name, status: r.status, ms: Math.round(performance.now() - t0), bytes: body.length, finalUrl: r.url, xRobots: r.headers.get('x-robots-tag'), ...classify(r.status, r.headers.get('content-type'), body) }
  } catch (e) {
    return { name, outcome: 'unverified', detail: e.name === 'AbortError' ? `Timed out after ${TIMEOUT_MS / 1000}s` : String(e.message ?? e) }
  } finally {
    clearTimeout(timer)
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id] }) // a stale rule is a browser-wide side effect
  }
}

/** Sequential so rules never overlap and the origin isn't hammered. */
export async function runLenses(url, onResult) {
  const out = []
  for (const [i, name] of Object.keys(LENSES).entries()) { const r = await fetchAs(url, name, i); out.push(r); onResult?.(r, out) }
  return out
}
