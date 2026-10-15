// "How to fix": steps plus a paste-ready snippet for the platform the page runs on, filled with this page's
// own values (URL, title, description, language). Pure: no chrome.*, no DOM. More fix kinds in fixes-more.js.
import { MORE } from './fixes-more.js'

export const PLATFORMS = { html: 'Plain HTML', next: 'Next.js', nuxt: 'Nuxt', astro: 'Astro', sveltekit: 'SvelteKit', remix: 'Remix', wordpress: 'WordPress', shopify: 'Shopify' }
/** Detected stack id → platform key (React/Vue SPAs, Angular and unknown stacks get plain HTML). */
export const platformOf = (stackId) => (PLATFORMS[stackId] ? stackId : 'html')

const attr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const js = (s) => JSON.stringify(String(s ?? ''))

/** Page values the snippets use. Placeholders in ‹angle quotes› mark what the user must write. */
export function fixContext(d) {
  const url = (d.canonical || d.url).replace(/#.*/, '')
  return {
    url, origin: new URL(d.url).origin, host: d.host, lang: d.lang && d.lang.length < 12 ? d.lang : 'en',
    title: d.title || '‹Main keyword – Brand›', description: d.description || '‹One or two sentences, 70–160 characters, that answer the search›',
    image: d.social?.['og:image'] && /^https?:/i.test(d.social['og:image']) ? d.social['og:image'] : `${new URL(d.url).origin}/‹share-image-1200x630›.jpg`,
    h1: d.headings?.find((x) => x.level === 1)?.text || '‹What this page is about›',
  }
}

/** One set of <head> values rendered for every platform. f: { title, description, canonical, og, robots, lang, viewport } */
function head(c, f, wpSteps, shopSteps) {
  const tags = [
    f.title && `<title>${attr(c.title)}</title>`,
    f.description && `<meta name="description" content="${attr(c.description)}">`,
    f.canonical && `<link rel="canonical" href="${attr(c.url)}">`,
    f.viewport && '<meta name="viewport" content="width=device-width, initial-scale=1">',
    f.robots && `<meta name="robots" content="${f.robots}">`,
    ...(f.og ? [`<meta property="og:title" content="${attr(c.title)}">`, `<meta property="og:description" content="${attr(c.description)}">`, `<meta property="og:image" content="${attr(c.image)}">`, `<meta property="og:url" content="${attr(c.url)}">`, '<meta name="twitter:card" content="summary_large_image">'] : []),
  ].filter(Boolean).join('\n')
  const meta = [
    f.title && `  title: ${js(c.title)},`,
    f.description && `  description: ${js(c.description)},`,
    f.canonical && `  alternates: { canonical: ${js(c.url)} },`,
    f.robots && `  robots: { index: ${!/noindex|none/.test(f.robots)}, follow: ${!/nofollow|none/.test(f.robots)}${/max-image/.test(f.robots) ? ", 'max-image-preview': 'large'" : ''} },`,
    f.og && `  openGraph: { title: ${js(c.title)}, description: ${js(c.description)}, images: [${js(c.image)}], url: ${js(c.url)} },\n  twitter: { card: 'summary_large_image' },`,
  ].filter(Boolean).join('\n')
  const seo = [f.title && `title: ${js(c.title)}`, f.description && `description: ${js(c.description)}`, f.og && `ogTitle: ${js(c.title)}, ogDescription: ${js(c.description)}, ogImage: ${js(c.image)}, twitterCard: 'summary_large_image'`, f.robots && `robots: ${js(f.robots)}`].filter(Boolean).join(', ')
  return {
    html: { steps: 'Put these in the page’s <head>, in the server HTML (not added later by JavaScript).', code: tags },
    next: { steps: f.viewport ? 'App Router: export viewport from the layout or page (Next 14+). Pages Router: put the meta tag in next/head.' : 'App Router: export metadata from the route’s page.tsx or layout.tsx (Pages Router: render the same tags inside next/head).',
      code: f.viewport ? "export const viewport = { width: 'device-width', initialScale: 1 }" : `export const metadata = {\n${meta}\n}` },
    nuxt: { steps: 'In the page component’s <script setup>.', code: f.canonical ? `useHead({ link: [{ rel: 'canonical', href: ${js(c.url)} }] })${seo ? `\nuseSeoMeta({ ${seo} })` : ''}` : seo ? `useSeoMeta({ ${seo} })` : `useHead({ meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }] })` },
    astro: { steps: 'In the layout’s <head> (pass page values in as props).', code: tags.replace(attr(c.url), '{Astro.url.href}') },
    sveltekit: { steps: 'In the route’s +page.svelte.', code: `<svelte:head>\n${tags.replace(/^/gm, '  ')}\n</svelte:head>` },
    remix: { steps: 'In the route module.', code: `export const meta = () => [\n${[f.title && `  { title: ${js(c.title)} },`, f.description && `  { name: 'description', content: ${js(c.description)} },`, f.canonical && `  { tagName: 'link', rel: 'canonical', href: ${js(c.url)} },`, f.robots && `  { name: 'robots', content: ${js(f.robots)} },`, f.og && `  { property: 'og:title', content: ${js(c.title)} },\n  { property: 'og:image', content: ${js(c.image)} },\n  { name: 'twitter:card', content: 'summary_large_image' },`, f.viewport && "  { name: 'viewport', content: 'width=device-width, initial-scale=1' },"].filter(Boolean).join('\n')}\n]` },
    wordpress: { steps: wpSteps },
    shopify: { steps: shopSteps, code: f.canonical ? '<link rel="canonical" href="{{ canonical_url }}">' : f.viewport ? '<meta name="viewport" content="width=device-width, initial-scale=1">' : undefined },
  }
}

const YOAST = 'Edit the page › Yoast SEO (or Rank Math) panel below the editor'
const SHOP = 'Shopify admin › Online Store › Pages (or Products/Collections) › edit › Search engine listing › Edit'
const CATALOG = {
  title: (c) => head(c, { title: true }, `${YOAST} › SEO title. Put the main search phrase first, keep it under ~60 characters.`, `${SHOP} › Page title.`),
  description: (c) => head(c, { description: true }, `${YOAST} › Meta description.`, `${SHOP} › Meta description.`),
  canonical: (c) => head(c, { canonical: true }, 'Yoast and Rank Math output a self-referencing canonical automatically. To point elsewhere: edit the page › Yoast › Advanced › Canonical URL. Remove any second canonical your theme adds.', 'Most themes already have it in layout/theme.liquid; if missing, add this inside <head>. Remove duplicates.'),
  viewport: (c) => head(c, { viewport: true }, 'Use a responsive theme; the viewport tag belongs in the theme’s header.php inside <head>.', 'Add to layout/theme.liquid inside <head> (and remove user-scalable=no / maximum-scale=1).'),
  social: (c) => head(c, { og: true }, `${YOAST} › Social tab: title, description and a 1200×630 image.`, 'Online Store › Preferences › Social sharing image; per page/product the featured image is used. Themes render the tags from snippets/social-meta-tags.liquid.'),
  indexable: (c) => head(c, { robots: 'index, follow' }, 'Settings › Reading › untick “Discourage search engines from indexing this site”. Then edit the page › Yoast › Advanced › “Allow search engines to show this page” = Yes.', 'Shopify pages are indexable by default. Remove any noindex added in theme.liquid or by an app, and make sure the store has no password page.'),
  maxImagePreview: (c) => head(c, { robots: 'index, follow, max-image-preview:large' }, 'Yoast adds max-image-preview:large by default; check no other plugin overrides the robots meta.', 'Add the tag to layout/theme.liquid inside <head>.'),
  lang: (c) => ({
    html: { steps: 'Set it on the root element.', code: `<html lang="${attr(c.lang)}">` },
    next: { steps: 'app/layout.tsx (Pages Router: pages/_document.tsx).', code: `<html lang="${attr(c.lang)}">` },
    nuxt: { steps: 'nuxt.config.ts', code: `export default defineNuxtConfig({ app: { head: { htmlAttrs: { lang: ${js(c.lang)} } } } })` },
    astro: { steps: 'In the base layout.', code: `<html lang="${attr(c.lang)}">` },
    sveltekit: { steps: 'src/app.html', code: `<html lang="${attr(c.lang)}">` },
    remix: { steps: 'app/root.tsx', code: `<html lang="${attr(c.lang)}">` },
    wordpress: { steps: 'Settings › General › Site Language. Themes print it with language_attributes() on <html>.' },
    shopify: { steps: 'layout/theme.liquid', code: '<html lang="{{ request.locale.iso_code }}">' },
  }),
}

/** Issue → fix kind: rule ids map directly; the basic checks carry `kind`. */
const KIND = [
  [/^title\.|^title$/, 'title'], [/^description/, 'description'], [/^canonical\./, 'canonical'], [/^canonical$/, 'canonical'],
  [/^mobile\.|^viewport$/, 'viewport'], [/^og\.|^twitter\.|^social$/, 'social'], [/^indexable$|^robots\.none|^robots\.nofollow|^robots\.unavailable|^robots\.js_changed/, 'indexable'],
  [/^robots\.max_image_preview|^robots\.nosnippet|^robots\.noimageindex/, 'maxImagePreview'], [/^html\.lang|^lang$/, 'lang'],
]
export const kindOf = (issue) => { const k = issue.kind ?? issue.id ?? ''; return KIND.find(([re]) => re.test(k))?.[1] ?? MORE.kindOf(k) }

/** { kind, platforms: { key: { steps, code? } } } for an issue, or null when there is no specific fix. */
export function fixFor(issue, d) {
  const kind = kindOf(issue)
  const build = CATALOG[kind] ?? MORE.catalog[kind]
  return build ? { kind, platforms: build(fixContext(d), d) } : null
}
/** The platform's entry, falling back to plain HTML when a platform has nothing specific. */
export const forPlatform = (fix, key) => fix.platforms[key] ?? fix.platforms.html
