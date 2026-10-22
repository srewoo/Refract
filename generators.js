// Things Refract writes for you to paste or upload: sitemap.xml, hreflang tags, JSON-LD templates, a disavow file,
// a comparison-page outline, a content brief and the audit as Markdown/JSON. Pure: text in, text out.
import { tokens } from './keywords.js'
import { RETIRED } from './rules.js'

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const J = (o) => JSON.stringify(o, null, 2).replace(/</g, '\\u003c') // page text can't close the <script>
const ld = (o) => `<script type="application/ld+json">\n${J(o)}\n</script>`
const TODO = (what) => `‹${what}›`
const md = (s) => String(s ?? '').replace(/([\\`*_[\]|<>])/g, '\\$1').replace(/\n+/g, ' ')

/** sitemap.xml for the given URLs (≤ 50,000 per file, as the protocol allows). */
export function sitemapXml(urls, lastmod = new Date().toISOString().slice(0, 10)) {
  const list = [...new Set(urls)].slice(0, 50000)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${list.map((u) => `  <url><loc>${xml(u)}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n')}\n</urlset>\n`
}

const LANG = /^(x-default|[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|\d{3}))?)$/i
/** rows [{ lang, url }] → <link> tags for every page in the set, the sitemap form, and problems found. */
export function hreflangSet(rows) {
  const set = rows.map((r) => ({ lang: r.lang.trim(), url: r.url.trim() })).filter((r) => r.lang && r.url)
  const problems = [
    ...set.filter((r) => !LANG.test(r.lang)).map((r) => `“${r.lang}” is not a valid code (use en, en-GB, x-default…)`),
    ...set.filter((r) => !/^https?:\/\//.test(r.url)).map((r) => `${r.url} must be an absolute URL`),
    ...[...new Set(set.map((r) => r.lang.toLowerCase()))].filter((l, _, all) => set.filter((r) => r.lang.toLowerCase() === l).length > 1 && all).map((l) => `${l} is listed more than once`),
    ...(set.some((r) => r.lang.toLowerCase() === 'x-default') ? [] : ['no x-default (recommended for the language picker or fallback page)']),
  ]
  const tags = set.map((r) => `<link rel="alternate" hreflang="${xml(r.lang)}" href="${xml(r.url)}" />`).join('\n')
  const sitemap = set.filter((r) => r.lang !== 'x-default').map((r) => `  <url>\n    <loc>${xml(r.url)}</loc>\n${set.map((a) => `    <xhtml:link rel="alternate" hreflang="${xml(a.lang)}" href="${xml(a.url)}" />`).join('\n')}\n  </url>`).join('\n')
  return { tags, sitemap: `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${sitemap}\n</urlset>`, problems: [...new Set(problems)] }
}

const SOCIAL = /(facebook|instagram|linkedin|twitter|x|youtube|tiktok|pinterest|github|threads)\.com\//i
/** JSON-LD templates filled from the page; ‹…› marks what Refract couldn't know. Retired rich-result types are not offered. */
export function schemaTemplate(type, d) {
  const u = new URL(d.url), origin = u.origin, site = d.social?.['og:site_name'] || u.hostname.replace(/^www\./, '')
  const image = d.social?.['og:image'] || TODO('image URL, at least 1200 px wide')
  const sameAs = [...new Set((d.links ?? []).filter((l) => !l.internal && SOCIAL.test(l.href)).map((l) => l.href))].slice(0, 8)
  const org = { '@type': 'Organization', name: site, url: origin }
  const T = {
    Article: { '@context': 'https://schema.org', '@type': 'Article', headline: d.title || TODO('headline'), description: d.description || undefined, image, datePublished: d.structure?.published || TODO('YYYY-MM-DD'), dateModified: d.structure?.modified || d.structure?.published || TODO('YYYY-MM-DD'), author: { '@type': 'Person', name: d.author || TODO('author name'), url: TODO('author page URL') }, publisher: org, mainEntityOfPage: d.canonical || d.url },
    Organization: { '@context': 'https://schema.org', ...org, logo: TODO('logo URL (square, ≥ 112 px)'), sameAs: sameAs.length ? sameAs : [TODO('official profile URLs')] },
    WebSite: { '@context': 'https://schema.org', '@type': 'WebSite', name: site, url: `${origin}/` },
    BreadcrumbList: { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [`${origin}/`, ...u.pathname.split('/').filter(Boolean).map((_, i, a) => `${origin}/${a.slice(0, i + 1).join('/')}`)].map((item, i, all) => ({ '@type': 'ListItem', position: i + 1, name: i === 0 ? 'Home' : i === all.length - 1 && d.title ? d.title.split(/\s[|–-]\s/)[0] : decodeURIComponent(item.split('/').pop()).replace(/[-_]/g, ' '), item })) },
    LocalBusiness: { '@context': 'https://schema.org', '@type': 'LocalBusiness', name: site, url: origin, image, telephone: TODO('+1 555 000 0000'), address: { '@type': 'PostalAddress', streetAddress: TODO('street'), addressLocality: TODO('city'), postalCode: TODO('postcode'), addressCountry: TODO('country code') }, geo: { '@type': 'GeoCoordinates', latitude: TODO('lat'), longitude: TODO('lng') }, openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '09:00', closes: '17:00' }] },
    Product: { '@context': 'https://schema.org', '@type': 'Product', name: d.headings?.find((x) => x.level === 1)?.text || d.title || TODO('product name'), image, description: d.description || TODO('description'), sku: TODO('SKU'), gtin: TODO('GTIN if you have one'), brand: { '@type': 'Brand', name: site },
      offers: { '@type': 'Offer', url: d.url, price: TODO('19.99'), priceCurrency: TODO('USD'), availability: 'https://schema.org/InStock', shippingDetails: { '@type': 'OfferShippingDetails', shippingRate: { '@type': 'MonetaryAmount', value: TODO('0'), currency: TODO('USD') }, shippingDestination: { '@type': 'DefinedRegion', addressCountry: TODO('US') } }, hasMerchantReturnPolicy: { '@type': 'MerchantReturnPolicy', applicableCountry: TODO('US'), returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow', merchantReturnDays: 30 } } },
    QAPage: { '@context': 'https://schema.org', '@type': 'QAPage', mainEntity: { '@type': 'Question', name: d.headings?.find((x) => x.level === 1)?.text || TODO('the question'), answerCount: 1, acceptedAnswer: { '@type': 'Answer', text: TODO('the answer'), url: d.url } } },
  }
  return T[type] ? ld(T[type]) : null
}
export const SCHEMA_TEMPLATES = ['Article', 'Organization', 'WebSite', 'BreadcrumbList', 'LocalBusiness', 'Product', 'QAPage']
export const isRetired = (type) => RETIRED.some(([t]) => t === type)

/** Google disavow file: whole domains as domain:, single pages as URLs. */
export function disavowFile(items, note = 'Refract SEO') {
  const domains = [...new Set(items.filter((i) => i.domain).map((i) => i.domain.toLowerCase()))].sort()
  const urls = [...new Set(items.filter((i) => i.url && !i.domain).map((i) => i.url))].sort()
  return [`# Disavow file from ${note}, ${new Date().toISOString().slice(0, 10)}. Upload only after review: disavowing good links can hurt.`, ...domains.map((x) => `domain:${x}`), ...urls].join('\n') + '\n'
}

/** Outline for an honest "You vs Competitor" page, seeded with the keywords both rank for. */
export function comparisonOutline(you, rival, shared = []) {
  return [`# ${you} vs ${rival}: ${TODO('the decision the reader is making')}`, '',
    `> One-paragraph verdict: who should pick ${you}, who should pick ${rival}. Answer engines quote this line.`, '',
    '## At a glance', '', `| | ${you} | ${rival} |`, '|---|---|---|', ...['Best for', 'Price', 'Key features', 'Support', 'Free trial'].map((r) => `| ${r} | ${TODO('…')} | ${TODO('…')} |`), '',
    `## Where ${you} is stronger`, '', `## Where ${rival} is stronger`, '', '## Pricing compared', '', '## Who should choose which', '',
    shared.length ? ['## Questions searchers ask', '', ...shared.slice(0, 8).map((k) => `- ${k}`), ''].join('\n') : '',
    '## Method', '', `How you compared them and when (dated). Link to ${rival}’s own pages for its claims.`, '',
    '<!-- Schema: Article (with dateModified) plus ItemList or Product for each option. Not FAQPage: retired 7 May 2026. -->'].filter((x) => x !== '').join('\n')
}

/**
 * Content brief from audited competitor pages: [{ url, title, words, headings: [{ level, text }], schemaTypes }].
 * H2 topics that ≥ 2 pages cover, questions they answer, a length target and terms they use that you don't (gaps).
 */
export function contentBrief(keyword, pages, gaps = []) {
  const ok = pages.filter((p) => p.headings)
  const words = ok.map((p) => p.words).filter(Boolean).sort((a, b) => a - b)
  const target = words.length ? Math.round(words[Math.floor(words.length / 2)] / 100) * 100 : null
  const topics = new Map()
  for (const p of ok) for (const hd of new Map(p.headings.filter((x) => x.level === 2 && x.text).map((x) => [tokens(x.text).sort().join(' '), x.text])))
    if (hd[0]) { const t = topics.get(hd[0]) ?? { text: hd[1], pages: new Set() }; t.pages.add(p.url); topics.set(hd[0], t) }
  const common = [...topics.values()].filter((t) => t.pages.size >= 2).sort((a, b) => b.pages.size - a.pages.size)
  const questions = [...new Set(ok.flatMap((p) => p.headings.filter((x) => x.level <= 3 && /\?$/.test(x.text ?? '')).map((x) => x.text)))].slice(0, 12)
  const schema = [...new Set(ok.flatMap((p) => p.schemaTypes ?? []))].filter((t) => !isRetired(t))
  return [`# Content brief: ${md(keyword)}`, '', `Built ${new Date().toISOString().slice(0, 10)} from ${ok.length} ranking page${ok.length === 1 ? '' : 's'}.`, '',
    '## Target', '', `- Primary keyword: **${md(keyword)}**`, target ? `- Length: about ${target.toLocaleString()} words (median of the pages below; cover the topics, don't pad)` : '- Length: no word counts available',
    `- Title: lead with “${md(keyword)}” and a specific benefit; under ~60 characters`, '',
    '## Sections most ranking pages cover', '', ...(common.length ? common.slice(0, 12).map((t) => `- ${md(t.text)} (${t.pages.size} of ${ok.length})`) : ['- No H2 topic is shared by two or more pages; structure around the searcher’s main question.']), '',
    '## Questions to answer', '', ...(questions.length ? questions.map((q) => `- ${md(q)}`) : ['- None phrased as questions on these pages.']), '',
    '## Terms they use that your page doesn’t', '', ...(gaps.length ? gaps.slice(0, 20).map((g) => `- ${md(g.term ?? g)}`) : ['- Run Compare against this page to list them.']), '',
    '## Structured data they use', '', schema.length ? schema.map((s) => `- ${md(s)}`).join('\n') : '- None found.', '',
    '## Pages analysed', '', ...ok.map((p) => `- [${md(p.title || p.url)}](${p.url}) · ${p.words?.toLocaleString() ?? '?'} words`)].join('\n')
}

/** The audit as Markdown (issues by severity, AI readiness pillars) and as JSON for other tools. */
export function auditMarkdown(d, hl, g) {
  const sev = (lv) => hl.list.filter((i) => i.level === lv)
  return [`# SEO audit: ${d.url}`, '', `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · Refract SEO`, '',
    `- Page health: **${hl.score}/100** (${hl.bad} to fix, ${hl.warn} to check)`, `- AI readiness: **${g.score}/100**`, `- Title: ${md(d.title || '(none)')}`, `- Status ${d.status ?? '?'} · ${d.indexable ? 'indexable' : 'not indexable'} · ${d.wordCount} words`, '',
    '## Fix', '', ...(sev('bad').length ? sev('bad').map((i) => `- **${md(i.msg)}** (${i.section}). ${md(i.fix ?? '')}`) : ['- Nothing critical.']), '',
    '## Check', '', ...(sev('warn').length ? sev('warn').map((i) => `- ${md(i.msg)} (${i.section}). ${md(i.fix ?? '')}`) : ['- Nothing to check.']), '',
    '## AI readiness', '', ...g.pillars.map((p) => `- ${p.name}: ${p.score}/100${p.checks.filter((c) => !c.ok).length ? ` (missing: ${p.checks.filter((c) => !c.ok).map((c) => md(c.label)).join('; ')})` : ''}`)].join('\n') + '\n'
}
export const auditJson = (d, hl, g) => JSON.stringify({ tool: 'Refract SEO', version: 1, url: d.url, at: new Date().toISOString(), status: d.status ?? null, indexable: d.indexable, title: d.title, description: d.description, words: d.wordCount,
  health: { score: hl.score, fix: hl.bad, check: hl.warn, issues: hl.list.map((i) => ({ id: i.id ?? i.kind ?? null, level: i.level, section: i.section, message: i.msg, fix: i.fix ?? null })) },
  ai: { score: g.score, pillars: g.pillars.map((p) => ({ name: p.name, score: p.score, checks: p.checks })) }, schema: d.schema?.types ?? [] }, null, 2)
