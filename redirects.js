// Redirect-chain tracer + header inspector for any URL. fetch() hides intermediate hops, so we observe
// our own request with chrome.webRequest (optional permission) and record every hop's status and headers.
import { AGENTS } from './ua.js'
import { LENS_RULE_BASE } from './lens.js'

export const NEEDS = { permissions: ['webRequest'], origins: ['<all_urls>'] }
const UA_RULE = LENS_RULE_BASE + 50

/** Trace `url` (optionally as a crawler User-Agent). Resolves { hops, error }. */
export async function trace(url, agent = null, timeoutMs = 20000) {
  const tabId = (await chrome.tabs.getCurrent?.())?.id ?? -1 // full-screen tab has an id; popup/panel requests are tab -1
  const filter = { urls: ['<all_urls>'], types: ['xmlhttprequest'], tabId }
  const hops = []
  let reqId = null
  const onBefore = (d) => { if (reqId == null && d.url === url && d.initiator?.startsWith('chrome-extension://')) { reqId = d.requestId; hops.push({ url: d.url, t0: d.timeStamp }) } }
  const onHeaders = (d) => {
    if (d.requestId !== reqId) return
    const hop = hops.at(-1)
    Object.assign(hop, { status: d.statusCode, statusLine: d.statusLine, headers: Object.fromEntries((d.responseHeaders ?? []).map((x) => [x.name.toLowerCase(), x.value ?? ''])), ms: Math.round(d.timeStamp - hop.t0) })
  }
  const onRedirect = (d) => { if (d.requestId !== reqId) return; hops.at(-1).location = d.redirectUrl; hops.push({ url: d.redirectUrl, t0: d.timeStamp }) }
  chrome.webRequest.onBeforeRequest.addListener(onBefore, filter)
  chrome.webRequest.onHeadersReceived.addListener(onHeaders, filter, ['responseHeaders'])
  chrome.webRequest.onBeforeRedirect.addListener(onRedirect, filter)
  if (agent) await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [UA_RULE], addRules: [{ id: UA_RULE, priority: 3, action: { type: 'modifyHeaders', requestHeaders: [{ header: 'user-agent', operation: 'set', value: AGENTS[agent] }] }, condition: { resourceTypes: ['xmlhttprequest'], tabIds: [tabId] } }] })
  let error = null
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    await fetch(url, { credentials: 'omit', cache: 'no-store', redirect: 'follow', signal: ctl.signal })
  } catch (e) {
    error = e.name === 'AbortError' ? `Timed out after ${timeoutMs / 1000}s` : /redirect/i.test(e.message) ? 'Too many redirects (loop?)' : String(e.message ?? e)
  } finally {
    clearTimeout(timer)
    chrome.webRequest.onBeforeRequest.removeListener(onBefore)
    chrome.webRequest.onHeadersReceived.removeListener(onHeaders)
    chrome.webRequest.onBeforeRedirect.removeListener(onRedirect)
    if (agent) await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [UA_RULE] })
  }
  return { hops: hops.map(({ t0, ...h }) => h), error }
}

const SECURITY = [
  ['strict-transport-security', 'HSTS', 'Forces HTTPS on return visits.'],
  ['content-security-policy', 'Content-Security-Policy', 'Limits where scripts and frames can load from.'],
  ['x-content-type-options', 'X-Content-Type-Options', 'Should be "nosniff".'],
  ['x-frame-options', 'X-Frame-Options', 'Clickjacking protection (or CSP frame-ancestors).'],
  ['referrer-policy', 'Referrer-Policy', 'Controls what URL is sent to other sites.'],
  ['permissions-policy', 'Permissions-Policy', 'Restricts camera, location, etc.'],
]

/** Pure: findings for a traced chain. */
export function analyseChain({ hops, error }) {
  const findings = []
  const add = (level, msg) => findings.push({ level, msg })
  const redirects = hops.filter((x) => x.status >= 300 && x.status < 400)
  const final = hops.at(-1)
  if (error) add('bad', error)
  if (new Set(hops.map((x) => x.url)).size < hops.length) add('bad', 'Redirect loop: a URL repeats in the chain')
  if (redirects.length > 1) add('warn', `${redirects.length} redirects before the final URL; link to the destination directly`)
  for (const r of redirects) {
    if ([302, 303, 307].includes(r.status) && !/internal redirect/i.test(r.statusLine ?? '')) add('warn', `${r.status} is temporary: search engines keep the old URL. Use 301/308 for permanent moves.`)
    if (r.url.startsWith('https:') && r.location?.startsWith('http:')) add('bad', 'Redirects from HTTPS down to HTTP')
  }
  if (final?.status && final.status >= 400) add('bad', `Final response is ${final.status}`)
  const H = final?.headers ?? {}
  if (/noindex|none/i.test(H['x-robots-tag'] ?? '')) add('bad', `X-Robots-Tag: ${H['x-robots-tag']}`)
  const security = SECURITY.map(([k, label, why]) => ({ label, why, value: H[k] ?? null, ok: k === 'x-frame-options' ? !!(H[k] || /frame-ancestors/i.test(H['content-security-policy'] ?? '')) : !!H[k] }))
  return { findings, redirects: redirects.length, final, security }
}
