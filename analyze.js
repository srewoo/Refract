// Pure helpers shared by the popup and the self-check (test.mjs). No chrome.* or DOM here.

const STOP = new Set(('a an and are as at be but by for from has have he her his i if in into is it its of on or our she so ' +
  'that the their them there they this to was we were what when which who will with you your not can all do does ' +
  'de la le les et des du un une el los las y en der die das und ist von zu').split(' '))

/** Top n-grams by count. n=1 drops stop words; n>1 drops grams that start or end with one. */
export function density(words, n = 1, top = 20) {
  const counts = new Map()
  for (let i = 0; i + n <= words.length; i++) {
    const gram = words.slice(i, i + n)
    if (STOP.has(gram[0]) || STOP.has(gram[n - 1]) || gram.some((w) => w.length < 2)) continue
    const k = gram.join(' ')
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const total = Math.max(1, words.length)
  return [...counts].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]).slice(0, top)
    .map(([term, count]) => ({ term, count, pct: Math.round((count / total) * 10000) / 100 }))
}

/** Length verdict against the common SERP truncation ranges. */
export function lengthStatus(text, [min, max]) {
  const len = text?.length ?? 0
  return { len, status: len === 0 ? 'bad' : len < min || len > max ? 'warn' : 'good' }
}
export const TITLE_RANGE = [30, 60]
export const DESC_RANGE = [70, 160]

/** Checklist of on-page problems, each { level: 'bad'|'warn', msg }. */
export function issues(d) {
  const out = []
  // kind: which fix (fixes.js) applies; not an id, so History keys for these checks stay as they were.
  const add = (level, msg, section = 'Overview', kind) => out.push({ level, msg, section, kind })
  const t = lengthStatus(d.title, TITLE_RANGE)
  const m = lengthStatus(d.description, DESC_RANGE)
  if (t.status === 'bad') add('bad', 'Missing <title>', 'Overview', 'title')
  else if (t.status === 'warn') add('warn', `Title is ${t.len} chars (aim ${TITLE_RANGE.join('–')})`, 'Overview', 'title')
  if (m.status === 'bad') add('bad', 'Missing meta description', 'Overview', 'description')
  else if (m.status === 'warn') add('warn', `Description is ${m.len} chars (aim ${DESC_RANGE.join('–')})`, 'Overview', 'description')
  const h1 = d.headings.filter((h) => h.level === 1).length
  if (h1 === 0) add('bad', 'No H1', 'Content', 'h1')
  if (h1 > 1) add('warn', `${h1} H1 tags`, 'Content', 'h1')
  if (!d.indexable) add('bad', 'Page is not indexable (noindex or non-2xx)', 'Overview', 'indexable')
  if (!d.canonical) add('warn', 'No canonical link', 'Overview', 'canonical')
  else if (d.canonicalSelf === false) add('warn', 'Canonical points to another URL', 'Overview', 'canonical')
  if (!d.lang) add('warn', 'No <html lang>', 'Overview', 'lang')
  if (!d.viewport) add('warn', 'No viewport meta (mobile)', 'Overview', 'viewport')
  const noAlt = d.images.filter((i) => i.alt === null).length
  if (noAlt) add('warn', `${noAlt} image(s) missing alt`, 'Images', 'img.no_alt')
  if (!d.social['og:title'] && !d.social['og:image']) add('warn', 'No Open Graph tags', 'Social', 'social')
  if (!d.schema.types.length && !d.schema.microdata.length) add('warn', 'No structured data', 'Schema', 'schema')
  if (d.schema.jsonLd.some((j) => !j.ok)) add('bad', 'Invalid JSON-LD block', 'Schema', 'schema.invalid')
  if (d.wordCount < 300) add('warn', `Thin content (${d.wordCount} words)`, 'On-page terms', 'content.thin')
  if (!d.robotsTxt) add('warn', 'robots.txt not found', 'Overview', 'robots_txt')
  return out
}

export function linkStats(links) {
  const uniq = new Set(links.map((l) => l.href))
  return {
    total: links.length,
    unique: uniq.size,
    internal: links.filter((l) => l.internal).length,
    external: links.filter((l) => !l.internal).length,
    nofollow: links.filter((l) => l.nofollow).length,
    sponsored: links.filter((l) => l.sponsored).length,
    ugc: links.filter((l) => l.ugc).length,
    noTitle: links.filter((l) => !l.title).length,
  }
}

export function sitemapsFrom(robotsTxt) {
  return (robotsTxt ?? '').split(/\r?\n/).map((l) => l.match(/^\s*sitemap:\s*(\S+)/i)?.[1]).filter(Boolean)
}

/** RFC 4180 CSV. Text starting with = + - @ (or tab/CR) gets a leading ' so spreadsheets don't run third-party text as a formula. */
export function toCsv(rows) {
  if (!rows.length) return ''
  const cols = Object.keys(rows[0])
  const safe = (v) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v)
  const esc = (raw) => { const v = safe(raw); return v == null ? '' : /[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v) }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')
}

// ponytail: naive registrable-domain guess (no Public Suffix List); swap in a PSL if odd ccTLDs matter.
const SLD = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu', 'ne', 'or', 'gob'])
export function registrableDomain(host) {
  if (/^[\d.]+$|:/.test(host)) return host // IPv4 / IPv6: no registrable domain
  const p = host.replace(/^www\./, '').split('.')
  if (p.length <= 2) return p.join('.')
  const take = p.at(-1).length === 2 && SLD.has(p.at(-2)) ? 3 : 2
  return p.slice(-take).join('.')
}

/** Outbound tool links (the "Tools"/"Quick links" tabs of the four originals, deduped). */
export function toolLinks(url, host) {
  const u = encodeURIComponent(url)
  const h = encodeURIComponent(host)
  const d = encodeURIComponent(registrableDomain(host))
  return {
    'Search engines': [
      ['Google site:', `https://www.google.com/search?q=site:${h}`],
      ['Bing site:', `https://www.bing.com/search?q=site:${h}`],
      ['Yandex site:', `https://yandex.com/search/?text=site:${h}`],
      ['Baidu site:', `https://www.baidu.com/s?wd=site:${h}`],
      ['DuckDuckGo site:', `https://duckduckgo.com/?q=site:${h}`],
      ['Naver site:', `https://search.naver.com/search.naver?query=site:${h}`],
      ['Sogou site:', `https://www.sogou.com/web?query=site:${h}`],
      ['Yahoo Japan site:', `https://search.yahoo.co.jp/search?p=site:${h}`],
      ['Google Trends', `https://trends.google.com/trends/explore?q=${d}`],
    ],
    'Traffic & backlinks': [
      ['SimilarWeb', `https://www.similarweb.com/website/${d}/`],
      ['Semrush', `https://www.semrush.com/analytics/overview/?q=${d}`],
      ['Ahrefs backlinks', `https://ahrefs.com/backlink-checker/?input=${d}`],
      ['Ahrefs authority', `https://ahrefs.com/website-authority-checker/?input=${d}`],
      ['Majestic', `https://majestic.com/reports/site-explorer?q=${d}`],
    ],
    'Validators': [
      ['PageSpeed Insights', `https://pagespeed.web.dev/analysis?url=${u}`],
      ['Rich Results Test', `https://search.google.com/test/rich-results?url=${u}`],
      ['Schema validator', `https://validator.schema.org/#url=${u}`],
      ['W3C HTML validator', `https://validator.w3.org/nu/?doc=${u}`],
      ['Facebook debugger', `https://developers.facebook.com/tools/debug/?q=${u}`],
      ['REDbot headers', `https://redbot.org/?uri=${u}`],
    ],
    'History & safety': [
      ['Wayback Machine', `https://web.archive.org/web/*/${h}`],
      ['Whois (ICANN)', `https://lookup.icann.org/en/lookup?name=${d}`],
      ['Google Safe Browsing', `https://transparencyreport.google.com/safe-browsing/search?url=${h}`],
      ['Norton Safe Web', `https://safeweb.norton.com/report/show?url=${h}`],
      ['McAfee SiteAdvisor', `https://www.siteadvisor.com/sitereport.html?url=${h}`],
      ['Sucuri SiteCheck', `https://sitecheck.sucuri.net/results/${h}`],
      ['VirusTotal', `https://www.virustotal.com/gui/domain/${d}`],
      ['BuiltWith', `https://builtwith.com/${d}`],
    ],
  }
}

/** robots.txt decision for one user-agent and path (RFC 9309: most specific group, longest match, Allow wins ties). */
export function robotsAllows(txt, agent, path = '/') {
  if (!txt) return true
  const groups = []
  let cur = null
  let lastWasAgent = false // a user-agent line after any other line (rules, Sitemap…) opens a new group
  for (const line of txt.split(/\r?\n/)) {
    const m = line.replace(/#.*/, '').match(/^\s*([a-z-]+)\s*:\s*(.*?)\s*$/i)
    if (!m) continue
    const key = m[1].toLowerCase(), val = m[2]
    if (key === 'user-agent') {
      if (!lastWasAgent) groups.push((cur = { agents: [], rules: [] }))
      cur.agents.push(val.toLowerCase())
    } else if ((key === 'allow' || key === 'disallow') && cur) cur.rules.push({ allow: key === 'allow', path: val })
    lastWasAgent = key === 'user-agent'
  }
  const a = agent.toLowerCase()
  const own = groups.filter((g) => g.agents.some((x) => x !== '*' && a.includes(x)))
  const rules = (own.length ? own : groups.filter((g) => g.agents.includes('*'))).flatMap((g) => g.rules)
  const toRe = (p) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`)
  let best = null
  for (const r of rules) {
    if (r.path === '' || !toRe(r.path).test(path)) continue
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r
  }
  return best ? best.allow : true
}
