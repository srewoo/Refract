// Bring-your-own-key data sources. Keys live in chrome.storage.local (this computer only, never synced)
// and are sent only to the provider they belong to.

// Each connector says exactly what leaves this machine, where it goes and when (shown on its card).
export const PROVIDERS = {
  gsc: { name: 'Google Search Console', auth: 'google', price: 'Free', hosts: ['www.googleapis.com', 'searchconsole.googleapis.com'], can: ['webmaster'], fields: [],
    flows: [
      ['The list of Search Console properties your Google account can see', 'Google (googleapis.com)', 'When you connect, and when you open Search Console.'],
      ['The URL of a page you audit, to fetch its clicks, impressions, position and top queries', 'Google (googleapis.com)', 'When you open Search Console for that page.'],
      ['The page URL, to ask Google whether it is indexed (URL Inspection)', 'Google (searchconsole.googleapis.com)', 'When you press Inspect, within Google’s daily quota.'],
    ] },
  bing: { name: 'Bing Webmaster Tools', auth: 'key', price: 'Free', hosts: ['ssl.bing.com'], origins: ['https://ssl.bing.com/*'], can: ['webmaster'], fields: [['key', 'API key (Bing Webmaster › Settings › API access)']],
    flows: [['Your API key and the URL of a page you audit, for its clicks, impressions, queries and inbound links', 'Microsoft (ssl.bing.com)', 'When you open Bing Webmaster.']] },
  crux: { name: 'Chrome UX Report (field data)', auth: 'key', price: 'Free', hosts: ['chromeuxreport.googleapis.com'], origins: ['https://chromeuxreport.googleapis.com/*'], can: ['field'], fields: [['key', 'Google API key (Chrome UX Report API enabled)']],
    flows: [['Your API key and the URL and origin of a page you audit', 'Google (chromeuxreport.googleapis.com)', 'When you open Speed.']] },
  dataforseo: { name: 'DataForSEO', auth: 'key', price: 'Pay-as-you-go (your account)', hosts: ['api.dataforseo.com'], origins: ['https://api.dataforseo.com/*'], can: ['ranks', 'keywords', 'backlinks'], fields: [['login', 'API login'], ['password', 'API password']],
    note: 'Backlinks API is a separate monthly subscription.',
    flows: [['Your login, the site’s domain, the keywords you track or the page’s top phrases, and your market', 'DataForSEO (api.dataforseo.com)', 'Only when you press Check positions, Get volume & difficulty or Fetch backlinks.']] },
  semrush: { name: 'Semrush', auth: 'key', price: 'API units (Business plan or API add-on)', hosts: ['api.semrush.com', 'www.semrush.com'], origins: ['https://api.semrush.com/*', 'https://www.semrush.com/*'], can: ['ranks', 'keywords', 'backlinks'], fields: [['key', 'API key']],
    flows: [['Your API key, the site’s domain, the page’s top phrases and your market', 'Semrush (api.semrush.com)', 'Only when you press Check positions, Get volume & difficulty or Fetch backlinks.'], ['Your API key, to read remaining units', 'Semrush (www.semrush.com)', 'When you press Save & test.']] },
  ahrefs: { name: 'Ahrefs', auth: 'key', price: 'API units (Enterprise plan or API add-on)', hosts: ['api.ahrefs.com'], origins: ['https://api.ahrefs.com/*'], can: ['ranks', 'keywords', 'backlinks'], fields: [['key', 'API key (v3)']],
    flows: [['Your API key, the site’s domain, the page’s top phrases and your market', 'Ahrefs (api.ahrefs.com)', 'Only when you press Check positions, Get volume & difficulty or Fetch backlinks.']] },
}
export const CAPABILITIES = { ranks: 'Rank tracking', keywords: 'Keyword volume & difficulty', backlinks: 'Backlinks' }

// One market setting maps onto each provider's own location vocabulary.
export const MARKETS = {
  us: { label: 'United States', dfs: 'United States', lang: 'en', semrush: 'us', ahrefs: 'us' },
  uk: { label: 'United Kingdom', dfs: 'United Kingdom', lang: 'en', semrush: 'uk', ahrefs: 'gb' },
  ca: { label: 'Canada', dfs: 'Canada', lang: 'en', semrush: 'ca', ahrefs: 'ca' },
  au: { label: 'Australia', dfs: 'Australia', lang: 'en', semrush: 'au', ahrefs: 'au' },
  in: { label: 'India', dfs: 'India', lang: 'en', semrush: 'in', ahrefs: 'in' },
  de: { label: 'Germany', dfs: 'Germany', lang: 'de', semrush: 'de', ahrefs: 'de' },
  fr: { label: 'France', dfs: 'France', lang: 'fr', semrush: 'fr', ahrefs: 'fr' },
  es: { label: 'Spain', dfs: 'Spain', lang: 'es', semrush: 'es', ahrefs: 'es' },
  it: { label: 'Italy', dfs: 'Italy', lang: 'it', semrush: 'it', ahrefs: 'it' },
  br: { label: 'Brazil', dfs: 'Brazil', lang: 'pt', semrush: 'br', ahrefs: 'br' },
  nl: { label: 'Netherlands', dfs: 'Netherlands', lang: 'nl', semrush: 'nl', ahrefs: 'nl' },
  jp: { label: 'Japan', dfs: 'Japan', lang: 'ja', semrush: 'jp', ahrefs: 'jp' },
}

const KEY = 'byok'
const EMPTY = { creds: {}, status: {}, route: { ranks: null, keywords: null, backlinks: null }, market: 'us', dfsBacklinksOptIn: false }

export async function loadKeys() {
  const s = (await chrome.storage.local.get(KEY))[KEY] ?? {}
  return { ...EMPTY, ...s, creds: { ...s.creds }, status: { ...s.status }, route: { ...EMPTY.route, ...s.route } }
}
export async function saveKeys(cfg) { await chrome.storage.local.set({ [KEY]: cfg }) }

export const hasCreds = (cfg, id) => PROVIDERS[id].fields.length > 0 && PROVIDERS[id].fields.every(([f]) => cfg.creds[id]?.[f])

/** Ask for just this provider's API host. Must run inside a click. */
export const grantProvider = (id) => chrome.permissions.request({ origins: PROVIDERS[id].origins })

/** Resolve the provider for a capability: explicit route, else the first provider with keys that can do it. */
export function providerFor(cfg, cap) {
  const pick = cfg.route[cap]
  if (pick && hasCreds(cfg, pick) && PROVIDERS[pick].can.includes(cap)) return pick
  return Object.keys(PROVIDERS).find((id) => PROVIDERS[id].can.includes(cap) && hasCreds(cfg, id)) ?? null
}
