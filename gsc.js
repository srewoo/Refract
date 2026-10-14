// Google Search Console. Endpoints and sign-in method from Refract src/connectors/gsc. Read-only scope.
export const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'
const API = 'https://www.googleapis.com/webmasters/v3'
const INSPECT = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect'
export const GSC_PERMS = { permissions: ['identity'], origins: ['https://www.googleapis.com/*', 'https://searchconsole.googleapis.com/*'] }
export const TEST_USER_MSG = 'While Refract SEO’s Google Cloud app is in Testing, your Google account must be listed as a Test user on its OAuth consent screen (Google Cloud Console › APIs & Services › OAuth consent screen › Audience › Test users). Ask the project owner to add you. The same account also needs access to the site’s property in Search Console.'

// Refract's method (src/connectors/gsc/auth.ts): the Chrome-extension OAuth client in manifest.oauth2,
// tied to this extension's ID via manifest.key. Chrome caches and refreshes the token itself.
export const oauthConfigured = () => /\.apps\.googleusercontent\.com$/.test(chrome.runtime.getManifest().oauth2?.client_id ?? '')
/** Extension ID that manifest.key produces: SHA-256 of the key bytes, first 32 hex digits mapped 0-f → a-p. */
export async function idFromKey(b64) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return [...hash.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('').replace(/[0-9a-f]/g, (c) => 'abcdefghijklmnop'[parseInt(c, 16)])
}

/** Why Google sign-in can't work in the *loaded* build, or null. Chrome reads manifest.json only when the
 *  extension is (re)loaded, while pages read fresh JS from disk, so the two can disagree after an update. */
export async function oauthProblem() {
  const loaded = chrome.runtime.getManifest()
  const disk = await fetch(chrome.runtime.getURL('manifest.json')).then((r) => r.json()).catch(() => null)
  const want = disk?.key ? await idFromKey(disk.key) : null
  if (!oauthConfigured()) {
    return disk?.oauth2?.client_id
      ? 'Chrome is still running an older copy of this extension’s manifest, without the Google sign-in client. Open chrome://extensions, remove Refract SEO (and any older Refract build, which shares its ID), then Load unpacked this folder again.'
      : 'This build has no Google OAuth client (manifest oauth2.client_id).'
  }
  if (want && chrome.runtime.id !== want) return `This copy is running with extension ID ${chrome.runtime.id}, but the Google sign-in client is registered for ${want}. Remove it in chrome://extensions and Load unpacked again so Chrome applies the manifest key.`
  return null
}

const hasIdentity = () => chrome.permissions.contains({ permissions: ['identity'] })

/** A token, or throws Error with a user-facing message. interactive=false never shows UI. */
export async function token(interactive = false) {
  if (!oauthConfigured()) throw new Error('This build has no Google OAuth client (manifest oauth2.client_id).')
  if (!(await hasIdentity())) throw new Error('Not connected.')
  try {
    const r = await chrome.identity.getAuthToken({ interactive, scopes: [GSC_SCOPE] })
    const t = typeof r === 'string' ? r : r?.token
    if (!t) throw new Error('no token')
    return t
  } catch (e) {
    if (!interactive) throw new Error('Not connected.')
    throw new Error(`Google did not grant access (${e.message}). If Google showed “Access blocked” or “has not completed the Google verification process”: ${TEST_USER_MSG}`)
  }
}
export const signIn = () => token(true)
export async function signOut() {
  const t = await token(false).catch(() => null)
  if (!t) return
  await chrome.identity.removeCachedAuthToken({ token: t })
  fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t)}`, { method: 'POST', credentials: 'omit' }).catch(() => {}) // best effort
}
export const isConnected = async () => !!(await token(false).catch(() => null))

async function call(tok, url, body) {
  const r = await fetch(url, { method: body ? 'POST' : 'GET', credentials: 'omit', headers: { authorization: `Bearer ${tok}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const j = await r.json().catch(() => ({}))
  if (r.status === 401) { await chrome.identity.removeCachedAuthToken({ token: tok }); throw new Error('Google sign-in expired. Press Connect again.') }
  if (r.status === 403) throw new Error(`Google refused (403): ${j.error?.message ?? 'no access'}. Check the Search Console API is enabled in your Cloud project and this account can see the property.`)
  if (!r.ok) throw new Error(`Search Console: ${j.error?.message ?? `HTTP ${r.status}`}`)
  return j
}

/** Pure: the property that covers `url` — longest URL-prefix match, else the domain property. */
export function pickProperty(sites, url) {
  const u = new URL(url)
  const usable = sites.filter((s) => s.permissionLevel !== 'siteUnverifiedUser')
  const prefix = usable.filter((s) => !s.siteUrl.startsWith('sc-domain:') && url.startsWith(s.siteUrl)).sort((a, b) => b.siteUrl.length - a.siteUrl.length)[0]
  if (prefix) return prefix.siteUrl
  const host = u.hostname.replace(/^www\./, '')
  return usable.find((s) => s.siteUrl.startsWith('sc-domain:') && (host === s.siteUrl.slice(10) || host.endsWith(`.${s.siteUrl.slice(10)}`)))?.siteUrl ?? null
}

const day = (offset) => new Date(Date.now() - offset * 864e5).toISOString().slice(0, 10)
const variants = (url) => { const u = url.replace(/#.*/, ''); return [...new Set([u, u.endsWith('/') ? u.slice(0, -1) : `${u}/`])] }

/** Page performance for the last 28 days (data lags ~2–3 days). */
export async function pagePerformance(tok, property, url) {
  const q = (dimensions, page, rowLimit = 1000) => call(tok, `${API}/sites/${encodeURIComponent(property)}/searchAnalytics/query`, { startDate: day(30), endDate: day(2), dimensions, rowLimit, dataState: 'all', dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'equals', expression: page }] }] })
  let page = url, daily = null
  for (const v of variants(url)) { daily = await q(['date'], v); if (daily.rows?.length) { page = v; break } } // Google reports the URL it chose
  const queries = daily?.rows?.length ? await q(['query'], page, 25) : { rows: [] }
  return summarise(daily?.rows ?? [], queries.rows ?? [], page)
}
/** Pure. */
export function summarise(dailyRows, queryRows, page) {
  const clicks = dailyRows.reduce((s, r) => s + r.clicks, 0), impressions = dailyRows.reduce((s, r) => s + r.impressions, 0)
  const pos = impressions ? dailyRows.reduce((s, r) => s + r.position * r.impressions, 0) / impressions : null
  return { page, clicks, impressions, ctr: impressions ? clicks / impressions : null, position: pos,
    daily: dailyRows.map((r) => ({ date: r.keys[0], clicks: r.clicks, impressions: r.impressions })),
    queries: queryRows.map((r) => ({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })) }
}
export const listSites = async (tok) => (await call(tok, `${API}/sites`)).siteEntry ?? []
export const inspect = async (tok, property, url) => (await call(tok, INSPECT, { inspectionUrl: url, siteUrl: property })).inspectionResult ?? {}
