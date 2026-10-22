// Growth opportunities: what to change or add so this page earns more clicks, better positions and AI citations.
// Pure. Inputs: page data, Search Console query rows (with previous-period values), Google-results observations
// saved by serp.js, Compare's phrase gaps and AI visibility runs. Each opportunity: { kind, title, why, actions[], gain, score }.
import { typedNodes } from './rules.js'
import { robotsAllows } from './analyze.js'

// ponytail: one generic desktop CTR-by-position curve; real CTR swings with SERP layout and intent, so gains are estimates.
const CTR = [0.28, 0.15, 0.11, 0.08, 0.07, 0.05, 0.04, 0.03, 0.03, 0.025]
export const expectedCtr = (pos) => (pos <= 10 ? CTR[Math.max(0, Math.round(pos) - 1)] : pos <= 20 ? 0.01 : 0.002)

const STOP = new Set('a an and are as at be best by can do does for from get how i in is it of on or the to vs what when where which who why will with you your near me'.split(' '))
const terms = (q) => q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !STOP.has(w))

/** Pure: where the query's meaningful words already appear on the page. */
export function coverage(query, d) {
  const t = terms(query)
  const inText = (s) => t.length > 0 && t.every((w) => (s ?? '').toLowerCase().includes(w))
  const body = new Set(d.words ?? [])
  const missing = t.filter((w) => !body.has(w) && ![...body].some((b) => b.startsWith(w)))
  return { terms: t, title: inText(d.title), description: inText(d.description), heading: d.headings.some((x) => x.level <= 3 && inText(x.text)), missing }
}

const q = (s) => `“${s}”`
const round = (n) => Math.max(1, Math.round(n))

/**
 * Search Console queries → opportunities. One per query, the most urgent kind wins.
 * `hadPrevious`: the previous period has data, so a query missing from it is new (flagged `fresh`).
 */
export function queryOpps(queries, d, { minImpressions = 20, hadPrevious = false } = {}) {
  const out = []
  for (const r of queries) {
    const cov = coverage(r.query, d)
    const onPage = [
      !cov.title && `Put ${q(r.query)} (or its main words) in the title.`,
      !cov.heading && `Add an H2 that answers ${q(r.query)} directly, with the answer in the first sentence below it.`,
      cov.missing.length && `Use the words searchers use that the page lacks: ${cov.missing.join(', ')}.`,
    ].filter(Boolean)
    if (r.prev && r.prev.clicks >= 5 && r.clicks <= r.prev.clicks * 0.7) {
      out.push({ kind: 'declining', query: r.query, title: `Recover ${q(r.query)}`, gain: round(r.prev.clicks - r.clicks),
        why: `Clicks fell from ${r.prev.clicks} to ${r.clicks} vs the previous 28 days${r.prev.position && r.position > r.prev.position + 0.5 ? `; position slipped ${r.prev.position.toFixed(1)} → ${r.position.toFixed(1)}` : ''}.`,
        actions: ['Search the query and see who now outranks you and what their page covers that yours doesn’t (run Compare on the top result).', 'Refresh the content: update facts and dates, add what’s missing, and set dateModified.', ...onPage] })
      continue
    }
    if (r.impressions < minImpressions) continue
    const exp = expectedCtr(r.position)
    if (r.position <= 5 && r.ctr < exp * 0.5) {
      out.push({ kind: 'low_ctr', query: r.query, title: `Win more clicks for ${q(r.query)}`, gain: round(r.impressions * (exp - r.ctr)),
        why: `You rank ${r.position.toFixed(1)} but only ${(r.ctr * 100).toFixed(1)}% of ${r.impressions} searchers click (≈${(exp * 100).toFixed(0)}% is typical at this position).`,
        actions: [`Rewrite the title and meta description around ${q(r.query)}: say what the searcher gets, add a specific benefit or number that is true.`, 'Check the results page (SERP layout panel): ads, an AI Overview or a featured snippet above you take clicks; aim to be the source they cite.', 'Add structured data that earns a rich result (reviews, product, breadcrumbs).'] })
    } else if (r.position > 3 && r.position <= 20) {
      out.push({ kind: 'striking', query: r.query, title: `Push ${q(r.query)} to the top 3`, gain: round(r.impressions * Math.max(0, expectedCtr(3) - r.ctr)),
        why: `Position ${r.position.toFixed(1)} with ${r.impressions} impressions in 28 days: ${r.position <= 10 ? 'on page one but below the top results' : 'just off page one'}.`,
        actions: [...onPage, `Link to this page from 2–3 related pages on your site with anchor text close to ${q(r.query)}.`, 'Expand the section that answers it: examples, steps, a table or an image the top results lack.'] })
    } else if (r.position > 20) {
      out.push({ kind: 'deep', query: r.query, title: `Cover ${q(r.query)} properly`, gain: round(r.impressions * expectedCtr(10)),
        why: `Google shows this page for it (${r.impressions} impressions) but at position ${r.position.toFixed(0)}: the page only touches the topic.`,
        actions: [`Add a dedicated section (or a separate page, linked from here) that fully answers ${q(r.query)}.`, ...onPage.slice(0, 1)] })
    }
  }
  const fresh = new Set(hadPrevious ? queries.filter((r) => r.prev === null).map((r) => r.query) : [])
  return out.map((o) => (fresh.has(o.query) ? { ...o, fresh: true, why: `New this period. ${o.why}` } : o))
}

/** AI Overviews seen on Google (serp.js) for this site's domain that don't cite it. Latest observation per query. */
export function aiOpps(observations, domain) {
  const latest = new Map()
  for (const o of observations) if (o.domain === domain && (!latest.has(o.query) || latest.get(o.query).at < o.at)) latest.set(o.query, o)
  return [...latest.values()].filter((o) => o.aio && !o.cites).map((o) => ({
    kind: 'ai_overview', query: o.query, title: `Get cited in the AI Overview for ${q(o.query)}`, gain: null,
    why: `Google’s AI Overview cites ${o.sources.slice(0, 4).join(', ')}${o.sources.length > 4 ? ` and ${o.sources.length - 4} more` : ''}, not you${o.rank > 0 ? `, although you rank #${o.rank}` : ''} (seen ${o.at.slice(0, 10)}).`,
    actions: [`Answer ${q(o.query)} in 40–60 words right under a heading phrased like the question; AI Overviews quote short, self-contained answers.`, 'Back it with specifics the cited pages have: numbers, steps, definitions, a comparison table.', 'Check AI search: AI bots allowed, text in the server HTML, Organization/author schema.'],
  }))
}

/** On-page additions that tend to win rankings, snippets and AI citations, from data already collected. */
export function pageOpps(d) {
  const out = []
  const add = (kind, title, why, actions) => out.push({ kind, title, why, actions, gain: null })
  const s = d.structure ?? {}
  if (d.wordCount >= 300 && d.wordCount < 800) add('depth', 'Go deeper than the competition', `${d.wordCount} words. Pages that rank for competitive queries usually cover the topic and its follow-up questions.`, ['Add the follow-up questions people ask (Google’s People Also Ask; the PAA extractor on Google results exports them) as H2s with direct answers.'])
  if (!s.questionHeadings) add('questions', 'Add question-style headings', 'No H2/H3 is phrased as a question. Question headings match how people search and feed People Also Ask and AI answers.', ['Turn 2–3 section headings into the questions searchers ask (What is…? How do I…? Is … worth it?) and answer each in the first sentence.'])
  if (!s.lists && !s.tables) add('scannable', 'Add a list or table', 'No lists or tables in the content. They are easy for Google to show as a featured snippet and for AI to quote.', ['Summarise the key steps as a numbered list, or the options as a comparison table.'])
  const internal = d.links.filter((l) => l.internal).length
  if (internal < 5) add('internal', 'Connect this page to the rest of the site', `Only ${internal} internal link${internal === 1 ? '' : 's'}. Links pass authority and help Google understand what the page is about.`, ['Link from here to 3–5 closely related pages, and from those pages back here with descriptive anchor text.'])
  if (!d.links.some((l) => !l.internal && !l.nofollow)) add('sources', 'Cite your sources', 'No outbound links. Citing data and authoritative sources signals expertise (E-E-A-T) and gives AI engines something to verify.', ['Link to 1–3 primary sources (studies, official docs, data) where you state facts.'])
  const nodes = typedNodes(d.schema.jsonLd)
  const art = nodes.find((n) => /Article|BlogPosting|NewsArticle/.test([].concat(n['@type']).join()))
  const modified = Date.parse(art?.dateModified ?? art?.datePublished ?? '')
  if (art && (!modified || Date.now() - modified > 365 * 864e5)) add('fresh', 'Refresh this article', modified ? `Last updated ${new Date(modified).toISOString().slice(0, 10)}, over a year ago.` : 'The article declares no datePublished/dateModified.', ['Update facts, examples and screenshots, then set dateModified (and show “Updated on” on the page).'])
  if (art && !art.author) add('author', 'Show who wrote it', 'The article has no author. Named, credible authors are an expertise signal for Google and AI engines.', ['Add a visible byline with a short bio linking to an author page, and author in the Article schema.'])
  if (!d.images.some((i) => i.src && !i.decorative)) add('media', 'Add an original image or diagram', 'No content images. Images rank in Google Images, earn shares and keep readers on the page.', ['Add at least one original image, chart or diagram with descriptive alt text.'])
  return out
}

/** Phrases competitors use and this page doesn't (saved by Compare). */
export const gapOpps = (saved) => (saved?.gaps?.length ? [{ kind: 'gap', title: 'Cover what competitors cover', gain: null,
  why: `Phrases ${saved.competitors.length > 1 ? 'both competitors use' : 'the competitor uses'} that this page doesn’t (Compare, ${saved.at.slice(0, 10)}).`,
  actions: [`Address these where relevant: ${saved.gaps.slice(0, 12).join(', ')}.`] }] : [])

// Order: measured click gains first (largest first), then AI citations, competitor gaps, on-page additions.
const RANK = { declining: 3, low_ctr: 3, striking: 3, deep: 3, ai_overview: 2, ai_competitor: 2, ai_crawler: 2, ai_comparison: 2, gap: 1 }
export const ranked = (list) => [...list].sort((a, b) => (RANK[b.kind] ?? 0) - (RANK[a.kind] ?? 0) || (b.gain ?? 0) - (a.gain ?? 0))

/** Markdown action plan for copying into a ticket or doc. */
export const plan = (url, list) => [`# SEO opportunities: ${url}`, '', ...list.flatMap((o, i) => [`## ${i + 1}. ${o.title}${o.gain ? ` (≈ +${o.gain} clicks / 28 days)` : ''}`, o.why, ...o.actions.map((a) => `- [ ] ${a}`), ''])].join('\n')

const COMPARISON = /\b(vs\.?|versus|alternatives?|compare[ds]?|comparison|best|top \d+)\b/i
/**
 * AI visibility (aivis.js) → cards. `items`: [{ prompt, run }] with each prompt's latest run; `engineBots`: engine → robots.txt agents.
 * Only answered, citation-capable checks count: a failed check or an engine that gave no sources is never read as "not cited".
 */
export function aiVisibilityOpps(items, d, { engineBots = {}, engineNames = {} } = {}) {
  const out = [], name = (e) => engineNames[e] ?? e
  for (const { prompt, run } of items) {
    const ok = run.results.filter((r) => r.judged.ok && r.judged.shown)
    const lost = ok.filter((r) => r.judged.canCite && !r.judged.cited && r.judged.competitors.some((c) => c.cited))
    if (lost.length) {
      const rivals = [...new Set(lost.flatMap((r) => r.judged.competitors.filter((c) => c.cited).map((c) => c.domain)))]
      const urls = [...new Set(lost.flatMap((r) => r.judged.competitors.flatMap((c) => c.urls)))].slice(0, 3)
      out.push({ kind: 'ai_competitor', query: prompt.prompt, title: `Get cited for ${q(prompt.prompt)}`, gain: null,
        why: `${lost.map((r) => name(r.engine)).join(', ')} cite ${rivals.join(', ')} but not you (checked ${run.at.slice(0, 10)}).`,
        actions: [`Read what the cited page${urls.length > 1 ? 's' : ''} answer that yours doesn’t: ${urls.join(', ')}.`, 'Answer the prompt in the first paragraph of your best-matching page, with specifics (numbers, steps, prices) an engine can quote.', 'Get mentioned on the other sites these engines cite for it.'] })
    }
    if (COMPARISON.test(prompt.prompt) && ok.length && !ok.some((r) => r.judged.mentioned || r.judged.cited)) {
      out.push({ kind: 'ai_comparison', query: prompt.prompt, title: `Publish a comparison page for ${q(prompt.prompt)}`, gain: null,
        why: `No AI engine checked (${ok.map((r) => name(r.engine)).join(', ')}) mentions you for this comparison prompt.`,
        actions: ['Write an honest comparison or “best of” page that includes you, with a summary table near the top.', 'State who each option suits; AI answers quote those lines.', 'Link to it from your product and pricing pages.'] })
    }
  }
  const tracked = new Set(items.flatMap(({ prompt }) => prompt.engines))
  const path = (() => { try { return new URL(d.url).pathname } catch { return '/' } })()
  for (const [engine, bots] of Object.entries(engineBots)) {
    const blocked = tracked.has(engine) ? bots.filter((b) => !robotsAllows(d.robotsTxt, b, path)) : []
    if (blocked.length) out.push({ kind: 'ai_crawler', title: `Let ${blocked.join(' and ')} crawl your site`, gain: null,
      why: `robots.txt blocks ${blocked.join(', ')}, so ${name(engine)} can’t fetch your pages to cite them, and you track prompts on it.`,
      actions: [`Allow ${blocked.join(' and ')} in robots.txt (they fetch pages for answers; they are not training crawlers).`, 'Re-run your AI visibility prompts a few days after the change.'] })
  }
  return out
}
