// Fix kinds beyond <head> tags: structured data, images, sitemaps, robots.txt / AI bots, redirects, content.
// Same shape as fixes.js: kind → (ctx, d) → { platform: { steps, code? } }. Pure.

const J = (o) => JSON.stringify(o, null, 2).replace(/</g, '\\u003c') // page text can't close the <script>
const title = (s) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())

/** JSON-LD rendered for every platform. */
function ld(obj, note, wp, shop) {
  const json = J(obj)
  return {
    html: { steps: `${note} Add before </head> (or anywhere in <body>).`, code: `<script type="application/ld+json">\n${json}\n</script>` },
    next: { steps: `${note} Render it in the route’s page component.`, code: `const jsonLd = ${json}\n\n<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />` },
    nuxt: { steps: note, code: `useHead({ script: [{ type: 'application/ld+json', innerHTML: JSON.stringify(${json.replace(/\n/g, '\n  ')}) }] })` },
    astro: { steps: note, code: `---\nconst schema = ${json}\n---\n<script type="application/ld+json" set:html={JSON.stringify(schema)} />` },
    sveltekit: { steps: note, code: `<script>\n  const schema = ${json.replace(/\n/g, '\n  ')}\n</script>\n<svelte:head>\n  {@html \`<script type="application/ld+json">\${JSON.stringify(schema)}</script>\`}\n</svelte:head>` },
    remix: { steps: `${note} Remix v2 meta supports script:ld+json.`, code: `export const meta = () => [{ 'script:ld+json': ${json.replace(/\n/g, '\n  ')} }]` },
    wordpress: { steps: wp, code: `<?php // functions.php: only if your SEO plugin can't do it. ‹page-slug› = this page.\nadd_action('wp_head', function () { if (!is_page('‹page-slug›')) return; ?>\n<script type="application/ld+json">\n${json}\n</script>\n<?php });` },
    shopify: { steps: shop, code: '{%- comment -%} sections/main-product.liquid or main-article.liquid {%- endcomment -%}\n<script type="application/ld+json">{{ product | structured_data }}</script>' },
  }
}

const steps = (text, code) => ({ html: { steps: text, code } })
const robotsBlock = (c) => `User-agent: *\nAllow: /\n\n# AI search engines (they cite and link to you)\nUser-agent: OAI-SearchBot\nUser-agent: ChatGPT-User\nUser-agent: PerplexityBot\nUser-agent: Claude-SearchBot\nAllow: /\n\n# AI training crawlers: allow or block as you prefer\n# User-agent: GPTBot\n# Disallow: /\n\nSitemap: ${c.origin}/sitemap.xml`

const catalog = {
  schema: (c, d) => {
    const home = new URL(d.url).pathname === '/'
    const org = { '@type': 'Organization', name: '‹Brand name›', url: c.origin, logo: `${c.origin}/‹logo›.png`, sameAs: ['‹https://www.linkedin.com/company/…›', '‹https://x.com/…›'] }
    const obj = home ? { '@context': 'https://schema.org', '@graph': [org, { '@type': 'WebSite', name: '‹Brand name›', url: c.origin }] }
      : { '@context': 'https://schema.org', '@type': 'Article', headline: c.h1, description: d.description || undefined, url: c.url, image: c.image, datePublished: '‹2026-01-31›', dateModified: '‹2026-10-01›', author: { '@type': 'Person', name: '‹Author name›', url: `${c.origin}/‹about-author›` }, publisher: org }
    return ld(obj, home ? 'Home page: Organization + WebSite.' : 'Example: Article. Use Product, LocalBusiness, Recipe, Event… if that matches the page better, and fill every ‹placeholder›.',
      'Yoast/Rank Math › Search Appearance › Knowledge Graph (Organization, logo, social profiles), then per page › Schema tab › choose the type.',
      'Most themes output Product/Article schema; if not, add the line below. For other page types paste a JSON-LD block into the template.')
  },
  breadcrumb: (c, d) => {
    const segs = new URL(d.url).pathname.split('/').filter(Boolean)
    const items = [{ name: 'Home', item: `${c.origin}/` }, ...segs.map((s, i) => ({ name: i === segs.length - 1 ? c.h1 : title(decodeURIComponent(s)), item: `${c.origin}/${segs.slice(0, i + 1).join('/')}${i === segs.length - 1 ? '' : '/'}` }))]
    return ld({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((x, i) => ({ '@type': 'ListItem', position: i + 1, ...x })) },
      'Built from this URL’s path; rename the steps to match your visible breadcrumb trail.', 'Yoast › Settings › Breadcrumbs (enable), Rank Math › General › Breadcrumbs; both add the schema.', 'Add a visible breadcrumb snippet to the theme and output this JSON-LD from it.')
  },
  sameAs: (c) => ld({ '@context': 'https://schema.org', '@type': 'Organization', name: '‹Brand name›', url: c.origin, sameAs: ['‹https://www.linkedin.com/company/…›', '‹https://www.youtube.com/@…›', '‹https://www.wikidata.org/wiki/Q…›'] },
    'List every official profile so Google and AI engines tie them to one entity.', 'Yoast › Settings › Site representation › Other profiles (Rank Math › Titles & Meta › Local SEO).', 'Add your profiles in Online Store › Themes › Customize › Theme settings › Social media; most themes print sameAs from there.'),
  schemaInvalid: () => steps('One JSON-LD block does not parse. Paste it into validator.schema.org; the usual causes are a trailing comma, an unescaped quote or two objects without a wrapping [ ] or @graph.'),
  lcpImage: () => ({
    html: { steps: 'The hero (largest above-the-fold) image must load first.', code: '<img src="‹hero›.webp" width="1200" height="630" fetchpriority="high" alt="‹describe the image›">\n<!-- and no loading="lazy" on it -->' },
    next: { steps: 'Mark the hero image priority (next/image then skips lazy loading and preloads it).', code: '<Image src={hero} alt="‹…›" priority sizes="100vw" />' },
    nuxt: { steps: '@nuxt/image', code: '<NuxtImg src="/‹hero›.webp" loading="eager" fetchpriority="high" preload width="1200" height="630" alt="‹…›" />' },
    astro: { steps: 'astro:assets', code: '<Image src={hero} alt="‹…›" loading="eager" fetchpriority="high" />' },
    wordpress: { steps: 'WordPress 6.3+ adds fetchpriority to the first big image automatically. If a lazy-load plugin (or the theme) lazy-loads it anyway, exclude the hero image or class in that plugin’s settings.' },
    shopify: { steps: 'In the hero/banner section.', code: "{{ section.settings.image | image_url: width: 1600 | image_tag: loading: 'eager', fetchpriority: 'high', sizes: '100vw' }}" },
  }),
  imgDims: () => ({
    html: { steps: 'Give every image its intrinsic width and height (CSS can still resize it); the browser then reserves the space.', code: '<img src="‹photo›.webp" width="800" height="600" alt="‹…›" style="max-width:100%;height:auto">' },
    next: { steps: 'next/image requires width and height (or fill with a sized parent).', code: '<Image src={photo} width={800} height={600} alt="‹…›" />' },
    wordpress: { steps: 'Images inserted through the editor carry dimensions. Hard-coded <img> in the theme or page builders often don’t: add width/height there.' },
    shopify: { steps: 'Use the image_tag filter, which writes width and height for you.', code: "{{ image | image_url: width: 800 | image_tag: alt: image.alt }}" },
  }),
  imgFormat: () => ({
    html: { steps: 'Serve AVIF/WebP with a fallback; convert with squoosh.app or your build tool.', code: '<picture>\n  <source srcset="‹photo›.avif" type="image/avif">\n  <source srcset="‹photo›.webp" type="image/webp">\n  <img src="‹photo›.jpg" width="800" height="600" alt="‹…›">\n</picture>' },
    next: { steps: 'next/image converts to WebP/AVIF automatically; enable AVIF in next.config.', code: "module.exports = { images: { formats: ['image/avif', 'image/webp'] } }" },
    wordpress: { steps: 'WordPress accepts WebP/AVIF uploads; a converter plugin (e.g. an image-optimisation plugin) can convert the existing library.' },
    shopify: { steps: 'Use image_url (not asset_url): Shopify’s CDN then serves WebP/AVIF to browsers that support it.', code: "{{ image | image_url: width: 1200 | image_tag }}" },
  }),
  alt: () => ({
    html: { steps: 'Describe what the image shows in a short phrase; use alt="" only for decorative images.', code: '<img src="‹…›" alt="‹What the image shows, e.g. Red trail running shoe, side view›">' },
    wordpress: { steps: 'Media › Library › select the image › Alternative Text (also in the block sidebar).' },
    shopify: { steps: 'Products › open product › click the image › Add alt text.' },
  }),
  sitemap: (c) => ({
    html: { steps: 'Publish /sitemap.xml with every indexable canonical URL, list it in robots.txt and submit it in Search Console › Sitemaps.', code: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${c.url}</loc><lastmod>‹YYYY-MM-DD›</lastmod></url>\n</urlset>` },
    next: { steps: 'app/sitemap.ts (served at /sitemap.xml).', code: `export default async function sitemap() {\n  const pages = ['/', /* ‹every public path› */]\n  return pages.map((p) => ({ url: ${JSON.stringify(c.origin)} + p, lastModified: new Date() }))\n}` },
    nuxt: { steps: 'Install the sitemap module.', code: "npx nuxi module add @nuxtjs/sitemap\n// nuxt.config.ts\nexport default defineNuxtConfig({ site: { url: " + JSON.stringify(c.origin) + ' } })' },
    astro: { steps: 'Official integration.', code: `npx astro add sitemap\n// astro.config.mjs\nexport default defineConfig({ site: ${JSON.stringify(c.origin)}, integrations: [sitemap()] })` },
    wordpress: { steps: 'WordPress serves /wp-sitemap.xml; Yoast/Rank Math replace it with /sitemap_index.xml. Make sure the page isn’t excluded (noindex or post type turned off) and submit the index in Search Console.' },
    shopify: { steps: 'Shopify generates /sitemap.xml automatically; submit it in Search Console. Hidden or password-protected pages are left out.' },
  }),
  robotsTxt: (c) => ({
    html: { steps: `Serve this as ${c.origin}/robots.txt.`, code: robotsBlock(c) },
    next: { steps: 'app/robots.ts', code: `export default function robots() {\n  return { rules: [{ userAgent: '*', allow: '/' }], sitemap: ${JSON.stringify(`${c.origin}/sitemap.xml`)} }\n}` },
    wordpress: { steps: 'WordPress serves a virtual robots.txt. Edit it in Yoast › Tools › File editor (Rank Math › General › Edit robots.txt).', code: robotsBlock(c) },
    shopify: { steps: 'Online Store › Themes › Edit code › Add a new template › robots.txt (robots.txt.liquid). Keep Shopify’s default rules and add yours.' },
  }),
  aiBots: (c) => steps('Allow the AI *search* crawlers, which cite and link to you; blocking them while allowing training crawlers gets you used without credit. Then make llms.txt match robots.txt.', robotsBlock(c)),
  mixed: (c) => steps('Change every http:// resource on this page to https:// (or a relative URL). As a safety net, ask browsers to upgrade the rest.', '<meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests">'),
  redirect: (c, d) => ({
    html: { steps: 'Update internal links to the final URL, and redirect old URLs with a server-side 301, not a meta refresh.', code: `# nginx\nlocation = /‹old-path› { return 301 ${new URL(d.url).pathname}; }\n\n# Apache (.htaccess)\nRedirect 301 /‹old-path› ${new URL(d.url).pathname}` },
    next: { steps: 'next.config.js', code: `module.exports = { async redirects() { return [{ source: '/‹old-path›', destination: ${JSON.stringify(new URL(d.url).pathname)}, permanent: true }] } }` },
    wordpress: { steps: 'Use a redirect plugin (e.g. Redirection) for 301s, and update menus/links to the final URL.' },
    shopify: { steps: 'Online Store › Navigation › URL Redirects › Create redirect. Update menu links to the final URL.' },
  }),
  h1: (c) => ({
    html: { steps: 'Exactly one H1 stating the page’s topic (it can differ from the title); use H2/H3 for sections.', code: `<h1>${c.h1.replace(/</g, '&lt;')}</h1>` },
    wordpress: { steps: 'Most themes render the post/page title as the H1. If the H1 is missing, the theme hides the title; if there are several, change extra Heading blocks to H2.' },
    shopify: { steps: 'The theme’s main section usually renders the title as H1; set section headings to H2 in Online Store › Customize.' },
  }),
  hreflang: (c) => steps('Every language version lists all versions, including itself, plus x-default.', `<link rel="alternate" hreflang="${c.lang}" href="${c.url}">\n<link rel="alternate" hreflang="‹other-lang›" href="‹URL of that version›">\n<link rel="alternate" hreflang="x-default" href="${c.url}">`),
  thin: () => steps('Cover the topic people search for: answer the main question early, then add the details, steps, examples, comparisons or FAQs searchers expect. Check Opportunities for the queries this page already gets.'),
  links: () => steps('Use descriptive anchor text (“trail running shoe sizing guide”, not “click here”), and link this page from 2–3 related pages on your site, and to them from here.'),
}

const MAP = [
  [/^schema\.no_breadcrumb/, 'breadcrumb'], [/^schema\.no_sameas/, 'sameAs'], [/^schema\.invalid$/, 'schemaInvalid'], [/^schema\.missing_|^schema$/, 'schema'],
  [/^img\.lazy_above_fold|^perf\.lcp/, 'lcpImage'], [/^img\.no_dimensions|^perf\.cls/, 'imgDims'], [/^img\.legacy_format/, 'imgFormat'], [/^img\.no_alt|^img\.decorative/, 'alt'],
  [/^sitemap\./, 'sitemap'], [/^robots_txt$/, 'robotsTxt'], [/^geo\.|^llms_txt\.|^xrobots\.per_bot/, 'aiBots'], [/^security\.mixed/, 'mixed'], [/^http\./, 'redirect'],
  [/^h1\.|^h1$/, 'h1'], [/^hreflang\./, 'hreflang'], [/^content\.thin$/, 'thin'], [/^links\./, 'links'],
]
export const MORE = { catalog, kindOf: (k) => MAP.find(([re]) => re.test(k))?.[1] ?? null }
