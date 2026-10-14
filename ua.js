// "View as Googlebot": per-tab User-Agent override via declarativeNetRequest session rules.
// The rule id is the tab id, so each tab has at most one override and it dies with the session.
// Only the HTTP header changes; navigator.userAgent inside the page stays the real one.

export const AGENTS = {
  'Googlebot Smartphone': 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.139 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Googlebot Desktop': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/131.0.6778.139 Safari/537.36',
  'Bingbot': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36',
  'GPTBot': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot',
}

const TYPES = ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'ping', 'media', 'websocket', 'other']
const HOSTS = { origins: ['<all_urls>'] }

/** Name of the agent active on this tab, or null. */
export async function currentAgent(tabId) {
  const [rule] = await chrome.declarativeNetRequest.getSessionRules({ ruleIds: [tabId] })
  const value = rule?.action.requestHeaders?.[0]?.value
  return value ? (Object.keys(AGENTS).find((k) => AGENTS[k] === value) ?? 'Custom') : null
}

/** Set (name) or clear (null) the override, then reload the tab. Must run inside a user gesture. */
export async function setAgent(tabId, name) {
  // request() first: an earlier await would drop the user gesture. Already granted → resolves true, no prompt.
  if (name && !(await chrome.permissions.request(HOSTS))) {
    throw new Error('Site access is needed to change the User-Agent header.')
  }
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [tabId],
    addRules: name ? [{
      id: tabId,
      priority: 1,
      action: { type: 'modifyHeaders', requestHeaders: [{ header: 'user-agent', operation: 'set', value: AGENTS[name] }] },
      condition: { tabIds: [tabId], resourceTypes: TYPES },
    }] : [],
  })
  await chrome.tabs.reload(tabId, { bypassCache: true })
}
