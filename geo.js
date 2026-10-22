// Scores and diagram data derived from the collected page. Pure: no chrome.*, no DOM.
import { issues, robotsAllows } from './analyze.js'
import { rules } from './rules.js'
import { localIssues } from './local.js'
export { robotsAllows }

export const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'CCBot', 'Applebot-Extended']

const pct = (n) => Math.max(0, Math.min(100, Math.round(n)))

/** Each pillar: score 0–100 plus the checks that produced it, so the UI never shows a number without its reasons. */
export function geo(d) {
  const path = new URL(d.url).pathname
  const bots = AI_BOTS.map((name) => ({ name, allowed: robotsAllows(d.robotsTxt, name, path) }))
  const ssrRatio = d.rawTextChars == null || !d.renderedTextChars ? null : Math.min(1, d.rawTextChars / d.renderedTextChars)
  const types = d.schema.types
  const check = (ok, label) => ({ ok, label })
  const pillar = (name, checks) => ({ name, checks, score: pct((checks.filter((c) => c.ok).length / checks.length) * 100) })
  const pillars = [
    pillar('AI crawler access', [
      ...bots.map((b) => check(b.allowed, `${b.name} ${b.allowed ? 'allowed' : 'blocked'} by robots.txt`)),
      check(d.indexable, 'Page is indexable'),
    ]),
    pillar('Machine readability', [
      check(ssrRatio == null || ssrRatio >= 0.7, ssrRatio == null ? 'Server HTML not readable' : `${Math.round(ssrRatio * 100)}% of text is in server HTML`),
      check(!!d.lang, 'Declares <html lang>'),
      check(d.headings.filter((h) => h.level === 1).length === 1, 'Exactly one H1'),
      check(outline(d.headings).skips.length === 0, 'No skipped heading levels'),
      check(!!d.llmsTxt, '/llms.txt present'),
    ]),
    pillar('Structured data', [
      check(types.length > 0, types.length ? `JSON-LD: ${types.slice(0, 4).join(', ')}` : 'No JSON-LD'),
      check(types.some((t) => /Organization|Person|WebSite/.test(t)), 'Identifies publisher (Organization/Person/WebSite)'),
      check(types.some((t) => /Article|Product|FAQPage|HowTo|Recipe|Event|LocalBusiness|BreadcrumbList/.test(t)), 'Describes the content type'),
      check(!d.schema.jsonLd.some((j) => !j.ok), 'All JSON-LD parses'),
    ]),
    pillar('Content & citability', [
      check(d.wordCount >= 600, `${d.wordCount.toLocaleString()} words (≥ 600)`),
      check(d.structure.lists + d.structure.tables > 0, `${d.structure.lists} lists, ${d.structure.tables} tables`),
      check(d.structure.questionHeadings > 0, `${d.structure.questionHeadings} question-style headings`),
      check(!!d.description, 'Has meta description'),
    ]),
    pillar('Trust (E-E-A-T)', [
      check(!!d.author || types.includes('Person'), d.author ? `Author: ${d.author}` : 'Author named'),
      check(!!d.structure.published, d.structure.published ? `Published ${d.structure.published.slice(0, 10)}` : 'Publish date'),
      check(new URL(d.url).protocol === 'https:', 'Served over HTTPS'),
      check(!!d.canonical, 'Canonical URL set'),
    ]),
  ]
  return { score: pct(pillars.reduce((s, p) => s + p.score, 0) / pillars.length), pillars, bots, ssrRatio }
}

/** Page health 0–100 from the base issues + ported Refract rules: critical −12, warning −4 (floor 0). */
export function health(d) {
  const list = [...issues(d), ...rules(d), ...localIssues(d)]
  const bad = list.filter((i) => i.level === 'bad').length
  const warn = list.length - bad
  return { score: pct(100 - bad * 12 - warn * 4), bad, warn, list: [...list].sort((a, b) => (a.level === b.level ? 0 : a.level === 'bad' ? -1 : 1)) }
}

export const band = (score) => (score >= 90 ? { grade: 'A', status: 'good' } : score >= 75 ? { grade: 'B', status: 'good' } : score >= 50 ? { grade: 'C', status: 'warn' } : { grade: 'D', status: 'bad' })

/** Heading outline with skipped levels (H2 → H4) marked. */
export function outline(headings) {
  const skips = []
  const rows = headings.map((h, i) => {
    const prev = i ? headings[i - 1].level : 0
    const skipped = h.level > prev + 1 && i > 0
    if (skipped) skips.push(i)
    return { ...h, skipped }
  })
  return { rows, skips }
}

export function topDomains(links, n = 8) {
  const c = new Map()
  for (const l of links) if (!l.internal) { try { const h = new URL(l.href).hostname.replace(/^www\./, ''); c.set(h, (c.get(h) ?? 0) + 1) } catch { /* bad href */ } }
  return [...c].sort((a, b) => b[1] - a[1]).slice(0, n).map(([label, value]) => ({ label, value }))
}

export function imageFormats(images) {
  const c = new Map()
  for (const i of images) {
    const ext = (i.src.match(/^data:image\/([a-z+]+)/i)?.[1] ?? i.src.split(/[?#]/)[0].match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? 'other').toLowerCase().replace('jpeg', 'jpg')
    c.set(ext, (c.get(ext) ?? 0) + 1)
  }
  return [...c].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))
}

/** Where a term appears: title, description, H1. */
export function placement(term, d) {
  const has = (s) => (s ?? '').toLowerCase().includes(term)
  return { title: has(d.title), description: has(d.description), h1: d.headings.some((h) => h.level === 1 && has(h.text)) }
}

/** JSON-LD @type tree for the schema diagram: [{ type, depth }]. */
export function schemaTree(jsonLd) {
  const out = []
  const walk = (node, depth, key) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, depth, key))
    if (!node || typeof node !== 'object') return
    const t = node['@type']
    if (t) out.push({ type: [].concat(t).join(', '), depth, key })
    for (const [k, v] of Object.entries(node)) if (k !== '@type' && k !== '@context') walk(v, t ? depth + 1 : depth, k === '@graph' ? null : k)
  }
  jsonLd.filter((j) => j.ok).forEach((j) => walk(j.data, 0, null))
  return out
}

const SOCIAL = /(facebook|instagram|linkedin|twitter|x|youtube|tiktok|pinterest|github|threads)\.com\//i
/** Who / how / why signals readers and quality raters look for (Google's helpful-content questions). Each: { ok, label, hint }. */
export function eeatSignals(d) {
  const links = d.links ?? [], internal = links.filter((l) => l.internal), has = (re) => internal.some((l) => re.test(`${l.href} ${l.text}`))
  const types = d.schema?.types ?? []
  const cites = links.filter((l) => !l.internal && !l.nofollow && !l.sponsored && !SOCIAL.test(l.href)).length
  const s = (ok, label, hint) => ({ ok, label, hint })
  return [
    s(!!d.author || types.includes('Person'), d.author ? `Author named: ${d.author}` : 'Author named', 'Show who wrote it (byline + Person in Article schema).'),
    s(has(/\/(authors?|team|people|staff|about-?(me|us)?)\b|rel=author/i) || links.some((l) => /\/authors?\//i.test(l.href)), 'Links to an author or team page', 'Link the byline to a page showing the author’s credentials.'),
    s(has(/\babout\b/i), 'Links to an About page', 'Say who is behind the site.'),
    s(has(/\bcontact\b/i), 'Links to a Contact page', 'Give readers a way to reach you; trust starts here.'),
    s(has(/privacy/i), 'Links to a privacy policy', 'Expected on any site that collects data.'),
    s(!!(d.structure?.published || d.structure?.modified), d.structure?.modified ? `Updated ${d.structure.modified.slice(0, 10)}` : d.structure?.published ? `Published ${d.structure.published.slice(0, 10)}` : 'Shows a date', 'Show when it was published and last updated.'),
    s(cites >= 2, `${cites} followed links to other sites (sources)`, 'Cite primary sources for facts and numbers.'),
    s(types.some((t) => /Organization|LocalBusiness/.test(t)), 'Identifies the organisation in schema', 'Add Organization schema with sameAs profiles.'),
    s(new URL(d.url).protocol === 'https:', 'Served over HTTPS', 'Serve every page over HTTPS.'),
    s(!(d.hiddenChars > 0), d.hiddenChars > 0 ? `${d.hiddenChars} invisible characters in the text` : 'No invisible characters in the text', 'Zero-width and direction-control characters often come from AI tools or copy-paste; remove them.'),
  ]
}
