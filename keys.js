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
    flows: [['Your login, the site’s domain, competitor domains you compare, the keywords you track, the page’s top phrases or the seed keyword you research, and your market', 'DataForSEO (api.dataforseo.com)', 'Only when you press Check positions, Get volume & difficulty, Find keywords, Get metrics, Compare keywords, Get overview, Fetch backlinks or Load backlinks, or on a rank-tracking schedule you turn on.'], ['The AI visibility prompts you run', 'DataForSEO, which sends them to Google, OpenAI (ChatGPT) or Perplexity for the engines you pick', 'Only when you press Run on a prompt, or on an AI visibility schedule you turn on.']] },
  semrush: { name: 'Semrush', auth: 'key', price: 'API units (Business plan or API add-on)', hosts: ['api.semrush.com', 'www.semrush.com'], origins: ['https://api.semrush.com/*', 'https://www.semrush.com/*'], can: ['ranks', 'keywords', 'backlinks'], fields: [['key', 'API key']],
    flows: [['Your API key, the site’s domain, competitor domains you compare, the page’s top phrases or the seed keyword you research, and your market', 'Semrush (api.semrush.com)', 'Only when you press Check positions (or on a rank-tracking schedule you turn on), Get volume & difficulty, Find keywords, Get metrics, Compare keywords, Get overview, Fetch backlinks or Load backlinks.'], ['Your API key, to read remaining units', 'Semrush (www.semrush.com)', 'When you press Save & test.']] },
  ahrefs: { name: 'Ahrefs', auth: 'key', price: 'API units (Enterprise plan or API add-on)', hosts: ['api.ahrefs.com'], origins: ['https://api.ahrefs.com/*'], can: ['ranks', 'keywords', 'backlinks'], fields: [['key', 'API key (v3)']],
    flows: [['Your API key, the site’s domain, competitor domains you compare, the page’s top phrases and your market', 'Ahrefs (api.ahrefs.com)', 'Only when you press Check positions (or on a rank-tracking schedule you turn on), Get volume & difficulty, Get metrics, Compare keywords, Get overview, Fetch backlinks or Load backlinks.']] },
}
// Key-based connectors outside the three capabilities above (no `can`), plus Moz for backlinks.
Object.assign(PROVIDERS, {
  moz: { name: 'Moz', auth: 'key', price: 'Moz API plan (rows)', hosts: ['api.moz.com'], origins: ['https://api.moz.com/*'], can: ['backlinks'], fields: [['key', 'API token (or access ID:secret key)']],
    note: 'Moz lists Domain Authority, Page Authority, spam score and referring domains; it has no list of individual links.',
    flows: [['Your token and the domain whose backlinks you fetch (yours or a competitor’s)', 'Moz (api.moz.com)', 'Only when you press Fetch backlinks, and once when you press Save & test.']] },
  pagespeed: { name: 'PageSpeed Insights (Lighthouse)', auth: 'key', price: 'Free (Google API quota)', hosts: ['www.googleapis.com'], origins: ['https://www.googleapis.com/*'], can: [], fields: [['key', 'Google API key (PageSpeed Insights API enabled)']],
    note: 'The same Google Cloud key as Chrome UX Report works if both APIs are enabled on it.',
    flows: [['Your API key and the URL to test', 'Google (www.googleapis.com), which loads the page from its own servers', 'Only when you press Run Lighthouse, or Lighthouse on crawled pages.']] },
  openpagerank: { name: 'Open PageRank', auth: 'key', price: 'Free key (monthly domain quota)', hosts: ['openpagerank.keywordseverywhere.com'], origins: ['https://openpagerank.keywordseverywhere.com/*'], can: [], fields: [['key', 'API key (keywordseverywhere.com › Account › Open PageRank)']],
    note: 'From 1 November 2026, free keys only work from the IP address set on that account page.',
    flows: [['Your key and the domains you compare (yours and your competitors’)', 'Keywords Everywhere (openpagerank.keywordseverywhere.com)', 'Only when you press Check authority.']] },
  naturallanguage: { name: 'Google Cloud Natural Language', auth: 'key', price: 'Free monthly tier, then paid per 1,000 characters', hosts: ['language.googleapis.com'], origins: ['https://language.googleapis.com/*'], can: [], fields: [['key', 'Google API key (Cloud Natural Language API enabled)']],
    note: 'This is the one connector that sends page text: up to the first 20,000 characters, only when you press Analyse entities.',
    flows: [['Your API key and the visible text of the page you analyse (up to 20,000 characters)', 'Google (language.googleapis.com)', 'Only when you press Analyse entities.']] },
  indexnow: { name: 'IndexNow', auth: 'key', price: 'Free', hosts: ['api.indexnow.org'], origins: ['https://api.indexnow.org/*'], can: [], fields: [['key', 'Your IndexNow key (8–128 letters, digits or dashes)']],
    note: 'Host a text file named <key>.txt containing the key at the root of each site you submit. Bing, Yandex, Seznam, Naver and Yep use IndexNow; Google does not.',
    flows: [['Your key, the site’s host and the URLs you submit', 'IndexNow (api.indexnow.org), shared with participating search engines', 'Only when you press Submit to IndexNow.']] },
  ga4: { name: 'Google Analytics 4', auth: 'google', price: 'Free', hosts: ['analyticsadmin.googleapis.com', 'analyticsdata.googleapis.com'], can: [], fields: [],
    note: 'Uses its own read-only Analytics permission. Refract SEO’s Google Cloud project must list the analytics.readonly scope on its OAuth consent screen, and your account must be a test user while the app is in Testing.',
    flows: [['The list of GA4 properties your Google account can see', 'Google (analyticsadmin.googleapis.com)', 'When you open Search Console › Google Analytics.'], ['A request for Organic Search landing pages of the property you pick (read-only)', 'Google (analyticsdata.googleapis.com)', 'When you press Load organic landing pages.']] },
})
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
