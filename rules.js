// Single-page checks ported from Refract's rule engine (src/engine/rules/*), rewritten against
// sss's collected data. Each returns { id, level: 'bad'|'warn', msg, fix, section }. Pure.
import { robotsAllows } from './analyze.js'

export const SERP_TITLE_PX = 580 // Google desktop title width (Refract SERP_PX.titleDesktop)

/** JSON-LD properties Google documents as required/recommended (Refract schema.ts). `a|b` = either. */
export const SCHEMA_PROPS = {
  Article: [['headline'], ['image', 'datePublished', 'dateModified', 'author.name']],
  NewsArticle: [['headline'], ['image', 'datePublished', 'author.name']],
  BlogPosting: [['headline'], ['image', 'datePublished', 'dateModified', 'author.name']],
  // Merchant listing fields (shipping, returns, identifiers, brand) are what Google Shopping surfaces read.
  Product: [['name'], ['image', 'offers.price', 'offers.priceCurrency', 'offers.availability', 'review|aggregateRating', 'brand.name|brand', 'gtin|gtin8|gtin12|gtin13|gtin14|mpn|sku', 'offers.shippingDetails', 'offers.hasMerchantReturnPolicy']],
  BreadcrumbList: [['itemListElement'], ['itemListElement.name', 'itemListElement.item']],
  Recipe: [['name', 'recipeIngredient|recipeInstructions'], ['image', 'author.name', 'cookTime', 'recipeYield']],
  VideoObject: [['name', 'thumbnailUrl|thumbnail', 'uploadDate'], ['description', 'duration', 'contentUrl|embedUrl']],
  Event: [['name', 'startDate', 'location'], ['image', 'endDate', 'offers.price', 'eventStatus']],
  Organization: [['name'], ['logo|image', 'url', 'sameAs']],
  LocalBusiness: [['name', 'address'], ['telephone', 'openingHours|openingHoursSpecification', 'geo', 'priceRange']],
  Review: [['reviewRating', 'author'], ['datePublished', 'reviewBody', 'itemReviewed.name']],
  SoftwareApplication: [['name', 'offers|aggregateRating'], ['applicationCategory', 'operatingSystem']],
}

/** Rich results Google retired, with the date and what to do instead (developers.google.com/search, checked 2026-09). */
export const RETIRED = [
  ['FAQPage', '7 May 2026', 'Keep it only if other consumers use it; use QAPage for genuine single-question pages. Don’t add FAQPage for Google.'],
  ['HowTo', 'September 2023', 'No replacement. Clear H2 step headings help readers; the markup no longer changes results.'],
  ['SpecialAnnouncement', 'July 2025', 'Use Event if it is time-bound, otherwise Article or WebPage.'],
  ['ClaimReview', 'June 2025', 'No Search replacement; keep it only for Google Fact Check Explorer.'],
  ['VehicleListing', 'June 2025', 'Use Product with vehicle properties if the car is sold online.'],
  ['EstimatedSalary', 'June 2025', 'Use JobPosting with baseSalary for specific roles.'],
  ['OccupationalAggregateRating', 'June 2025', 'No replacement.'],
  ['LearningVideo', 'June 2025', 'Use VideoObject, which still shows video results.'],
  ['PracticeProblem', 'January 2026', 'No replacement.'],
]
const SEARCH_BOTS = ['OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Claude-SearchBot']
const TRAINING_BOTS = ['GPTBot', 'ClaudeBot', 'CCBot', 'Google-Extended', 'Applebot-Extended']
const GENERIC_ANCHOR = /^(click here|here|read more|learn more|more|this|link|continue|details|go|this page)$/i
const BCP47 = /^[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|\d{3}))?(-[a-z0-9]{5,8})*$/i

/** Value at a dotted path, descending through arrays; truthy if any branch has it. */
export function hasPath(node, path) {
  return path.split('|').some((alt) => {
    const walk = (n, keys) => {
      if (Array.isArray(n)) return n.some((x) => walk(x, keys))
      if (!keys.length) return n != null && n !== ''
      return n && typeof n === 'object' ? walk(n[keys[0]], keys.slice(1)) : false
    }
    return walk(node, alt.split('.'))
  })
}

/** Every JSON-LD node that declares an @type, flattened out of @graph / nesting. */
export function typedNodes(jsonLd) {
  const out = []
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk)
    if (!n || typeof n !== 'object') return
    if (n['@type']) out.push(n)
    Object.entries(n).forEach(([k, v]) => k !== '@context' && walk(v))
  }
  jsonLd.filter((j) => j.ok).forEach((j) => walk(j.data))
  return out
}

/** Robots directives that apply to Google (generic + googlebot meta + un-prefixed header parts). */
export function directives(d) {
  const metas = d.botMetas.filter((m) => /^(robots|googlebot)$/i.test(m.name)).map((m) => m.content)
  const header = (d.headers['x-robots-tag'] ?? '').split(/,(?=\s*[a-z-]+\s*:\s*[a-z])|\n/i).filter((p) => !/^\s*[a-z-]+bot[^:]*:/i.test(p) || /^\s*googlebot\s*:/i.test(p))
  return [...metas, ...header].join(',').toLowerCase().split(/\s*,\s*/).map((x) => x.replace(/^googlebot\s*:\s*/, '').trim()).filter(Boolean)
}

/** Bots named in a per-bot X-Robots-Tag or <meta name="GPTBot"> with noindex/none. */
export function perBotNoindex(d) {
  const fromHeader = [...(d.headers['x-robots-tag'] ?? '').matchAll(/([a-z-]*bot[a-z-]*)\s*:\s*([^,]*(?:noindex|none))/gi)].map((m) => m[1])
  const fromMeta = d.botMetas.filter((m) => !/^(robots|googlebot)$/i.test(m.name) && /noindex|none/i.test(m.content)).map((m) => m.name)
  return [...new Set([...fromHeader, ...fromMeta])]
}

export function rules(d) {
  const out = []
  const add = (id, level, section, msg, fix) => out.push({ id, level, section, msg, fix })
  const norm = (u) => { try { const x = new URL(u, d.url); x.hash = ''; return x.href.replace(/\/$/, '') } catch { return u } }
  const raw = d.rawMeta
  const dir = directives(d)
  const path = new URL(d.url).pathname

  // ---- rendering: what a non-JS crawler gets
  if (raw) {
    if (d.title && raw.title !== d.title) add('title.js_injected', 'warn', 'Overview', raw.title ? 'Title is rewritten by JavaScript' : 'Title only exists after JavaScript runs', 'Render the final <title> on the server (metadata API / SSR head).')
    if (d.description && !raw.description) add('description.js_injected', 'warn', 'Overview', 'Meta description is added by JavaScript', 'Emit it in the server HTML.')
    if (d.canonical && !raw.canonical) add('canonical.js_injected', 'warn', 'Overview', 'Canonical is added by JavaScript', 'Google may ignore client-set canonicals; put it in the server HTML.')
    if (/noindex|none/i.test(raw.robots ?? '') !== /noindex|none/i.test(d.robots ?? '')) add('robots.js_changed', 'bad', 'Overview', 'JavaScript changes the robots meta (server HTML and rendered page disagree)', 'Set robots once, on the server.')
  }
  // ---- HTTP
  if (d.redirected || d.redirectCount) add('http.redirected', 'warn', 'Overview', `Reached through ${d.redirectCount || 1} redirect${d.redirectCount > 1 ? 's' : ''}`, 'Link to the final URL directly.')
  if (d.metaRefresh) add('http.meta_refresh', 'warn', 'Overview', `Meta refresh: "${d.metaRefresh}"`, 'Use a 301 instead of <meta http-equiv="refresh">.')
  if (d.mixedContent.length) add('security.mixed_content', 'bad', 'Overview', `${d.mixedContent.length} resource${d.mixedContent.length > 1 ? 's' : ''} loaded over http:// on an https page`, d.mixedContent[0])
  // ---- directives
  if (dir.includes('none')) add('robots.none_directive', 'bad', 'Overview', 'robots "none" = noindex + nofollow', 'Remove it if the page should rank.')
  else if (dir.includes('nofollow')) add('robots.nofollow_page', 'warn', 'Overview', 'Page-level nofollow: no links on this page pass signals', 'Use rel="nofollow" on specific links instead.')
  if (dir.includes('nosnippet')) add('robots.nosnippet', 'warn', 'Overview', 'nosnippet: no text snippet in Google, and excluded from AI Overviews', 'Use data-nosnippet on specific blocks instead.')
  if (dir.includes('noarchive')) add('robots.noarchive', 'warn', 'Overview', 'noarchive is set', 'Harmless for ranking; remove if unintended.')
  if (dir.includes('noimageindex')) add('robots.noimageindex', 'warn', 'Images', 'noimageindex: images on this page are kept out of Google Images', 'Remove unless intended.')
  const mip = dir.find((x) => x.startsWith('max-image-preview'))
  if (mip && !/large/.test(mip)) add('robots.max_image_preview', 'warn', 'Images', `${mip}: small previews, not eligible for Discover large images`, 'Use max-image-preview:large.')
  const ua = dir.find((x) => x.startsWith('unavailable_after'))
  if (ua) { const when = Date.parse(ua.split(':').slice(1).join(':')); add('robots.unavailable_after', when < Date.now() ? 'bad' : 'warn', 'Overview', `${ua}${when < Date.now() ? ' (date has passed: page is dropping out)' : ''}`, 'Remove or move the date.') }
  const bots = perBotNoindex(d)
  if (bots.length) add('xrobots.per_bot', 'warn', 'AI search', `noindex targeted at ${bots.join(', ')}`, 'Check this is intended; these engines will not show the page.')
  // ---- canonical
  const canon = [...new Set(d.canonicals.map(norm))]
  if (canon.length > 1) add('canonical.conflict', 'bad', 'Overview', `${canon.length} different canonical tags`, 'Keep exactly one.')
  if (d.canonicals.some((c) => c && !/^https?:\/\//i.test(c))) add('canonical.relative', 'warn', 'Overview', 'Canonical uses a relative URL', 'Use an absolute https:// URL.')
  if (d.canonical && new URL(d.canonical).hostname !== d.host) add('canonical.cross_origin', 'warn', 'Overview', `Canonical points to another host (${new URL(d.canonical).hostname})`, 'Fine for syndication; otherwise this page is giving away its ranking.')
  const ct = d.probe?.canonicalTarget
  if (ct && !ct.crossOrigin) {
    if (ct.redirects) add('canonical.target_redirects', 'bad', 'Overview', 'Canonical target redirects', 'Point the canonical at the final URL.')
    else if (ct.status && ct.status !== 200) add('canonical.target_not_200', 'bad', 'Overview', `Canonical target returns ${ct.status}`, 'Point the canonical at a live 200 page.')
    else if (ct.noindex) add('canonical.target_noindex', 'bad', 'Overview', 'Canonical target is noindex', 'Contradictory signals: Google may drop both.')
    else if (ct.canonical && norm(ct.canonical) !== norm(ct.url)) add('canonical.chain', 'warn', 'Overview', 'Canonical target canonicalises somewhere else (chain)', 'Point straight at the final canonical.')
  }
  const ogUrl = d.social['og:url']
  if (ogUrl && d.canonical && norm(ogUrl) !== norm(d.canonical)) add('canonical.og_url_mismatch', 'warn', 'Social', 'og:url differs from the canonical', 'Make og:url equal the canonical URL.')
  // ---- title / meta
  if (d.titlePx != null && d.titlePx > SERP_TITLE_PX) add('title.pixel_width.over', 'warn', 'Overview', `Title is ${d.titlePx}px wide; Google truncates near ${SERP_TITLE_PX}px`, 'Front-load the keyword and trim the tail.')
  const h1 = d.headings.find((x) => x.level === 1)?.text.trim().toLowerCase()
  if (h1 && d.title.trim().toLowerCase() === h1) add('title.duplicate_h1', 'warn', 'Content', 'Title and H1 are identical', 'Let the title target the query and the H1 serve the reader.')
  if (d.lang && !BCP47.test(d.lang)) add('html.lang_invalid', 'warn', 'Overview', `<html lang="${d.lang}"> is not a valid language code`, 'Use BCP 47, e.g. en or en-GB.')
  const vp = (d.viewport ?? '').toLowerCase()
  if (vp && !/width\s*=\s*device-width/.test(vp)) add('mobile.viewport_not_responsive', 'warn', 'Overview', 'Viewport does not set width=device-width', 'Use <meta name="viewport" content="width=device-width, initial-scale=1">.')
  if (/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/.test(vp)) add('mobile.viewport_blocks_zoom', 'warn', 'Overview', 'Viewport blocks pinch-zoom', 'Remove user-scalable=no / maximum-scale=1 (accessibility).')
  // ---- images & performance
  const imgs = d.images.filter((i) => i.src && !i.src.startsWith('data:'))
  const noDims = imgs.filter((i) => !i.hasDims).length
  if (noDims) add('img.no_dimensions', 'warn', 'Images', `${noDims} image${noDims > 1 ? 's' : ''} without width/height attributes`, 'Set width and height so the browser reserves space (CLS).')
  const lazyTop = imgs.filter((i) => i.lazy && i.aboveFold).length
  if (lazyTop) add('img.lazy_above_fold', 'warn', 'Images', `${lazyTop} above-the-fold image${lazyTop > 1 ? 's are' : ' is'} lazy-loaded`, 'Remove loading="lazy" from images visible on load.')
  const legacy = imgs.filter((i) => /\.(jpe?g|png|gif|bmp)(\?|#|$)/i.test(i.src)).length
  if (legacy >= 3) add('img.legacy_format', 'warn', 'Images', `${legacy} images are JPEG/PNG/GIF`, 'Serve WebP or AVIF; typically 25–50% smaller.')
  const decoAlt = d.images.filter((i) => i.decorative && i.alt).length
  if (decoAlt) add('img.decorative_with_alt', 'warn', 'Images', `${decoAlt} decorative image${decoAlt > 1 ? 's have' : ' has'} alt text`, 'Use alt="" on presentational images.')
  const p = d.perf
  if (p.lcpEl?.lazy) add('perf.lcp_element_lazy', 'bad', 'Speed', 'The LCP image is lazy-loaded', 'Drop loading="lazy" and add fetchpriority="high" to it.')
  if (p.lcp > 2500) add('perf.lcp_slow', p.lcp > 4000 ? 'bad' : 'warn', 'Speed', `LCP ${(p.lcp / 1000).toFixed(1)} s in this load (good ≤ 2.5 s)`, 'Lab measurement; confirm with field data.')
  if (p.cls > 0.1) add('perf.cls_high', p.cls > 0.25 ? 'bad' : 'warn', 'Speed', `CLS ${p.cls} (good ≤ 0.1)`, 'Reserve space for images, ads and embeds.')
  if (p.inp > 200) add('perf.inp_slow', p.inp > 500 ? 'bad' : 'warn', 'Speed', `Slowest interaction so far: ${p.inp} ms (good ≤ 200 ms)`, 'Break up long tasks in click/key handlers.')
  // ---- links
  const generic = d.links.filter((l) => GENERIC_ANCHOR.test(l.text)).length
  if (generic) add('links.generic_anchor', 'warn', 'On-page links', `${generic} link${generic > 1 ? 's use' : ' uses'} generic text ("click here", "read more")`, 'Describe the destination in the anchor.')
  if (!d.links.some((l) => l.internal)) add('links.no_internal', 'warn', 'On-page links', 'No internal links', 'Link to related pages so crawlers and users can continue.')
  // ---- social
  const ogImg = d.social['og:image']
  if (ogImg && !/^https?:\/\//i.test(ogImg)) add('og.image_not_absolute', 'warn', 'Social', 'og:image is a relative URL', 'Most scrapers need an absolute URL.')
  if (!d.social['twitter:card'] && (d.social['og:title'] || ogImg)) add('twitter.card_missing', 'warn', 'Social', 'No twitter:card', 'Add twitter:card = summary_large_image.')
  // ---- schema
  const nodes = typedNodes(d.schema.jsonLd)
  for (const n of nodes) for (const t of [].concat(n['@type'])) {
    const spec = SCHEMA_PROPS[t]
    if (!spec) continue
    const missReq = spec[0].filter((k) => !hasPath(n, k))
    const missRec = spec[1].filter((k) => !hasPath(n, k))
    const say = (ks) => ks.map((k) => k.replace(/\|/g, ' or ')).join(', ')
    if (missReq.length) add('schema.missing_required', 'bad', 'Schema', `${t} is missing required ${say(missReq)}`, 'Without these Google shows no rich result.')
    else if (missRec.length) add('schema.missing_recommended', 'warn', 'Schema', `${t} is missing recommended ${say(missRec)}`, 'Adds richer result features.')
  }
  const types = d.schema.types
  if (types.includes('Organization') && !nodes.some((n) => [].concat(n['@type']).includes('Organization') && hasPath(n, 'sameAs'))) add('schema.no_sameas', 'warn', 'Schema', 'Organization has no sameAs profiles', 'Link official profiles so engines resolve the entity.')
  if (types.length && path !== '/' && !types.includes('BreadcrumbList')) add('schema.no_breadcrumb', 'warn', 'Schema', 'No BreadcrumbList on an inner page', 'Breadcrumbs replace the URL in results.')
  if (d.hiddenChars > 0) add('content.hidden_chars', 'warn', 'Content', `${d.hiddenChars} invisible character${d.hiddenChars > 1 ? 's' : ''} in the page text`, 'Zero-width and direction-control characters usually come from AI tools or copy-paste. Remove them from the source text.')
  for (const [t, when, instead] of RETIRED) if (types.includes(t)) add('schema.retired', 'warn', 'Schema', `${t} no longer produces a Google rich result (retired ${when})`, instead)
  // ---- hreflang
  if (d.hreflang.length) {
    if (d.hreflang.some((x) => !LANG_OK(x.lang))) add('hreflang.invalid_code', 'bad', 'Hreflang', 'Invalid hreflang code', 'Use ISO 639-1 language (+ optional ISO 3166 region) or x-default.')
    if (!d.hreflang.some((x) => norm(x.href) === norm(d.url))) add('hreflang.no_self', 'bad', 'Hreflang', 'Hreflang set has no self-reference', 'Each page must list itself.')
  }
  // ---- sitemap
  const sm = d.probe?.sitemap
  if (sm) {
    const okFiles = sm.files.filter((f) => f.status === 200 && !f.error)
    if (!okFiles.length) add('sitemap.missing', 'warn', 'Overview', sm.files.some((f) => f.error === 'Not valid XML') ? 'Sitemap is not valid XML' : 'No sitemap found (robots.txt or /sitemap.xml)', 'Publish a sitemap and list it in robots.txt.')
    else if (!sm.contains) add('sitemap.url_absent', 'warn', 'Overview', sm.exhausted ? 'This URL is not in the sitemap' : `This URL is not in the first ${sm.files.length} sitemap files checked`, 'Include every indexable canonical URL.')
    else if (sm.lastmod && (Date.parse(sm.lastmod) > Date.now() + 864e5 || Number.isNaN(Date.parse(sm.lastmod)))) add('sitemap.lastmod_implausible', 'warn', 'Overview', `Sitemap lastmod "${sm.lastmod}" is invalid or in the future`, 'Use the real last-modified date.')
  }
  // ---- AI crawlers: search vs training
  if (d.robotsTxt) {
    const allowed = (b) => robotsAllows(d.robotsTxt, b, path)
    const searchBlocked = SEARCH_BOTS.filter((b) => !allowed(b))
    const trainingAllowed = TRAINING_BOTS.filter(allowed)
    if (searchBlocked.length && trainingAllowed.length) add('geo.training_allowed_search_blocked', 'bad', 'AI search', `AI search bots blocked (${searchBlocked.join(', ')}) while training bots are allowed`, 'Usually backwards: allow search bots so you can be cited; block training if you prefer.')
    if (d.llmsTxt && ['GPTBot', 'ClaudeBot', 'PerplexityBot'].some((b) => !allowed(b))) add('llms_txt.contradicts_robots', 'warn', 'AI search', 'llms.txt invites AI crawlers that robots.txt blocks', 'Align the two files.')
  }
  return out
}
const LANG_OK = (c) => c === 'x-default' || BCP47.test(c)

/** Framework from signals (port of Refract framework/detect.ts, minus version gating). */
export function stack(fw = {}, g = {}) {
  const on = (k) => !!(fw[k] || g[k])
  if (on('nextData') || on('nextStatic') || on('nextGlobal')) {
    const app = on('rscFlight') || on('nextAppLayout')
    return { id: 'next', label: app ? 'Next.js (App Router)' : on('nextData') ? 'Next.js (Pages Router)' : 'Next.js', confidence: app && on('rscFlight') ? 0.95 : 0.8 }
  }
  if (on('nuxt') || on('nuxtGlobal')) return { id: 'nuxt', label: 'Nuxt 3+', confidence: 0.9 }
  if (on('astro')) return { id: 'astro', label: 'Astro', confidence: 0.9 }
  if (on('sveltekit') || on('svelteGlobal')) return { id: 'sveltekit', label: 'SvelteKit', confidence: 0.85 }
  if (on('remix') || on('remixContext') || on('remixManifest')) return { id: 'remix', label: 'Remix', confidence: on('remixContext') ? 0.9 : 0.7 }
  if (on('shopify') || on('shopifyGlobal')) return { id: 'shopify', label: 'Shopify', confidence: 0.9 }
  if (on('wordpress')) return { id: 'wordpress', label: `WordPress${/WordPress (\d[\d.]*)/.exec(fw.generator ?? '')?.[1] ? ` ${/WordPress (\d[\d.]*)/.exec(fw.generator)[1]}` : ''}`, confidence: 0.85 }
  if (on('angular')) return { id: 'angular', label: 'Angular', confidence: 0.8 }
  if (on('react') || on('vue')) return { id: 'spa', label: on('vue') ? 'Vue' : 'React', confidence: 0.7 }
  return { id: 'plain-html', label: fw.generator || 'No framework detected', confidence: 0.5 }
}
