# Refract SEO: SEO & AI-search audit

> **Same extension ID as Refract.** `manifest.json` carries Refract's `key` and `oauth2` block so the existing Google Cloud OAuth client works. Chrome treats this and the old Refract build as the same extension: remove or disable the old one before loading this folder.

One MV3 extension combining the features of AITDK SEO, Detailed SEO, SEO META in 1 Click and Open SEO Stats.
Clean-room: features were mapped from the four published packages; no code was copied.

**Load:** `chrome://extensions` → Developer mode → Load unpacked → this folder. No build step.

The popup is a 780×590 panel: a rail with the site, a health score and 15 views. Each view's count shows how many things need attention there. Every view opens with a one-line answer, then the evidence.

| View | Answers | Charts / diagrams |
|---|---|---|
| Overview | Can this rank, and what do I fix first? | health ring, indexability chain (status → robots → X-Robots → canonical → result), SERP snippet with title/description length meters |
| Issues | Everything wrong, worst first | each issue jumps to its view |
| AI search | Will AI engines crawl, parse and cite it? | readiness ring, 5 pillar bars (26 real checks), AI-bot robots.txt grid (GPTBot, ClaudeBot, PerplexityBot…), server-rendered text bar, `llms.txt` |
| Content | Is the heading hierarchy sound? | H1–H6 bars, outline tree flagging skipped levels, bold/italic lists |
| Keywords | What is this page actually about? | 1–5 word density bars with title/description/H1 placement marks, CSV |
| Links | Where does link equity go? | internal/external and follow/nofollow/sponsored stacked bars, top external domains, filterable table, nofollow highlighter, **Check links** (status of every link: OK / redirect / restricted / broken / no response, `linkcheck.js`), CSV |
| Images | Is alt text covered? | alt coverage stacked bar, format bars, thumbnails, CSV |
| Schema | What does structured data declare? | JSON-LD type tree (nested via property), microdata, validators, raw blocks |
| Social | What will a share look like? | OG and X card previews |
| Hreflang | Are alternates valid? | self-reference / x-default / duplicate / code checks |
| Speed | Where did load time go? | phase timeline (redirect → DNS → TLS → request → response → DOM → load) with LCP marker, CLS, protocol, compression |
| Ads & tags | Who monetises/tracks this page? | AdSense publisher + slots, GA4, GTM, legacy UA, 10 other trackers |
| Domain | How big and how old is the site? | Tranco rank line chart (hover), domain lifetime (registered → today → expires), RDAP whois, IP location (ipinfo), DNS, first Wayback capture |
| Tools | | View-as-crawler switch, site:/index links (8 engines), traffic/backlink tools, validators, safety reports |
| Settings | | SERP badges, PAA button, start view (chrome.storage.sync) |

Design: warm paper/graphite with one teal accent; status tags pair a glyph with a word; chart colours validated for colour-vision deficiency in light and dark (`popup.css` header has the reasoning). Dark mode follows the OS.

AITDK's traffic, Domain Rating and backlink counts come from its private API and aren't reproduced. Domain shows the public Tranco rank instead, and Tools links out to Semrush, Ahrefs and SimilarWeb.

### Ported from Refract

Single-page checks from Refract's rule engine, rewritten in plain JS (`rules.js`), feed the health score, Issues (each with a one-line fix) and the sidebar counts:

- Rendering: title, description or canonical added by JavaScript (server HTML vs rendered); robots meta changed by JS.
- Directives: `none`, page-level `nofollow`, `nosnippet`, `noarchive`, `noimageindex`, `max-image-preview`, `unavailable_after` (past date is critical), per-bot noindex (`X-Robots-Tag: GPTBot: noindex`, `<meta name="GPTBot">`).
- Canonical: multiple/conflicting, relative, cross-host, `og:url` mismatch, and a probe of the target (redirects, non-200, noindex, chains).
- HTTP/security: redirects, meta refresh, mixed content.
- Title width in pixels (Arial 20px, ~580px limit; skipped for non-Latin scripts), title = H1, invalid `lang`, viewport not responsive or blocking zoom.
- Images: missing width/height, lazy above the fold, legacy formats, alt on decorative images. Performance: lazy LCP image, LCP/CLS thresholds, **INP** (slowest interaction so far).
- Links: generic anchors, no internal links. Social: relative `og:image`, missing `twitter:card`.
- Schema: Google's required/recommended properties for 12 types, Organization without `sameAs`, no breadcrumbs, retired FAQ/HowTo rich results.
- Hreflang: invalid codes, no self-reference. Sitemap: missing/invalid, URL not listed, implausible `lastmod` (`probe.js` follows robots.txt sitemaps and indexes, capped at 6 files).
- AI: search bots blocked while training bots are allowed; `llms.txt` contradicting robots.txt.
- Stack detection (Next.js App/Pages Router, Nuxt, Astro, SvelteKit, Remix, Shopify, WordPress, Angular, React/Vue).

Also from Refract:

- **Bot's eye** (`lens.js`): fetches the URL as Googlebot, Bingbot, GPTBot, OAI-SearchBot, ClaudeBot and PerplexityBot (their User-Agent, no cookies) and classifies each response as Served / Blocked (403/429/503 or CDN challenge) / Unverified. Compares title and words with the browser and with robots.txt, so a CDN blocking a bot robots.txt allows is visible. Temporary DNR rules scoped to the exact URL, removed after each fetch and cleared on worker start.
- **Side panel**: "Open in side panel" enables a panel for *this tab only* (off globally, cleaned up on tab close, kept when the tab moves windows) and re-audits when the tab navigates.
- **Overlays**: highlight nofollow links, mark images with no alt, label headings, each toggled from its view.
- **Export report**: one self-contained HTML file (inline CSS, no scripts, page text escaped) with scores, issues and fixes, indexing, AI readiness and bot's-eye results.

Not ported (would complicate SSS): framework fix snippets/Live Preview, on-device AI, Search Console/CrUX/Ahrefs connectors, site crawl, workspace/projects.

### Surfaces

- **Popup**: the quick view.
- **Side panel**: per tab, re-audits on navigation.
- **Full screen** (⤢, top right): opens the same UI in a new tab (`popup.html?tabId=…&full=1&view=…`).
- **Pop out** (⧉): opens it in a separate window.

Full screen and pop-out keep auditing the original tab and re-audit when it navigates, except while a crawl is running.

### Site crawl (`crawl.js`, `views-crawl.js`)

Port of Refract's bounded crawl. It is user-started and runs in the full-screen tab or side panel, never the popup, which dies on blur.

- **Limits:** at most **1,000 pages** and depth 6, same origin, anonymous, obeys robots.txt, one request at a time with a 300 ms pause, stops on 429/503.
- **Findings:** broken internal links with their source, duplicate titles and descriptions, missing title/description/H1, noindex, canonicalised pages, redirecting links, orphans, hreflang without return links, thin, slow and deep pages, status and depth charts, CSV export.
- **Always says why it stopped.** Orphans are reported only when the crawl completed.
- The last crawl per site is kept in `chrome.storage.local`.

### Chrome built-in AI (`ai.js`, `ai-ui.js`)

Gemini Nano through the Prompt API, ported from Refract's `tier1.ts` and `firewall.ts`. It runs on-device and is shown only when Chrome reports the model as available or downloadable.

- **Overview:** Suggest titles and Suggest descriptions. Each option is re-measured for characters and pixel width.
- **Images:** Suggest alt. It looks at the image where the device supports image input, otherwise uses the file name and nearby text.
- **Schema:** Draft JSON-LD. Built only from page facts, then checked against the required/recommended property table.
- **Issues:** Explain.
- **Numeric firewall:** any suggestion stating a number that isn't in the grounding data is dropped. Markup is stripped. Output is JSON-constrained.
- **Settings:** shows model status and a one-time Download button.

### Data sources, accounts and analyst workflow

- **Search Console** (`gsc.js`): Refract's method: `chrome.identity.getAuthToken` with Refract's Chrome-extension OAuth client (`manifest.oauth2`), which works because the manifest carries Refract's `key` (same extension ID). Read-only scope. Shows clicks, impressions, CTR, position, daily clicks and top queries, each against the previous 28 days (% change, position change, new queries); URL Inspection runs on **Inspect** (daily quota). **While the Cloud app is in Testing, the Google account must be a Test user on its OAuth consent screen**; the connector card and the view say so.
- **Bing Webmaster** (`bing.js`): API key. Shows page clicks, impressions and position, the site's top queries and inbound links.
- **BYOK providers** (`keys.js`, `providers.js`): DataForSEO, Semrush and Ahrefs, routed per capability (ranks, keyword volume/difficulty, backlinks) with a market setting. Keys live in `chrome.storage.local` and go only to their provider; each API host is requested as a permission when its key is saved. Request and response contracts come from Refract's connectors.
- **CrUX field data** (`crux.js`): free Google key; URL and origin p75 plus good/needs-work/poor shares, phone or desktop, and a 25-week trend, in Speed.
- **Rank tracking:** positions stored per domain per day, so trends build over time.
- **History** (`history.js`): an automatic snapshot per audit (50 per URL, 300 URLs) with field diffs and issues added or resolved. Crawls diff against the previous crawl.
- **Compare** (`views-compare.js`): full audit of one or two competitor URLs in a background tab, side by side, with phrase gaps.
- **Redirects & headers** (`redirects.js`): any URL hop by hop via `webRequest` (optional permission), as a browser or a crawler, with security-header checks.
- **Local SEO** (`local.js`): NAP from schema, `tel:` links and text, consistency checks, LocalBusiness completeness, Maps and Business Profile links. The crawl reports phone variants across pages.
- **Crawl:** up to 1,000 pages (`unlimitedStorage`), optional JavaScript rendering in a worker tab (`render.js`) with a "content that needs JavaScript" report.

Checks: `node sss/smoke-data.mjs` drives all of the above in real Chromium with intercepted provider APIs (no real keys).

### Docs

`help.html` (user guide) and `privacy.html` (privacy policy: data read and stored, every outside request, permissions) ship inside the extension. They are linked from the sidebar footer and Settings. **Before publishing, fill in the contact line in `privacy.html`.**

Right-click menu (`background.js`): view the site in Ahrefs/Semrush/SimilarWeb/Majestic/Moz/Archive.org, `site:` and `site: -inurl:https` searches, highlight nofollow links, and "check duplicates" of selected text across the web or on this site. The Links tab also has a nofollow-highlight button.

On Google results pages (`serp.js`) results get position badges plus a "Copy results CSV" button (with each result's pixel offset). A **SERP layout** panel shows how far down the first organic result sits, which blocks are above it (ads, AI Overview, featured snippet, PAA, local pack…), whether an AI Overview shows and which sites it links to, and, for a saved domain, highlights that domain's result and says whether the AI Overview cites it. Blocks are matched by English heading text plus page geometry, not Google class names. `paa.js` adds **Extract People Also Ask**: pick a depth (1–3); it expands each question, records the answer source, and follows the questions Google adds, breadth-first (cap 100). Results show level and parent, with Copy/Download CSV.

**View as crawler** (Tools tab, `ua.js`): Googlebot Smartphone/Desktop, Bingbot or GPTBot. A declarativeNetRequest session rule sets the `User-Agent` header for that tab only and reloads it. The popup shows a banner with a "Back to normal" button while it's on, and the rule is dropped when the tab closes. Only the header changes; in-page `navigator.userAgent` stays the real one.

Permissions: `activeTab`, `scripting`, `contextMenus`, `declarativeNetRequestWithHostAccess`, `storage`, `sidePanel`. Site access (`<all_urls>`) is an *optional* permission, requested the first time you pick a crawler view run Bot's eye or Check links. That keeps the install warning-free. Nothing runs until you click the icon, except the SERP scripts on Google.

**Not ported:** AITDK traffic/keyword numbers and Open SEO Stats' IP geolocation. Both come from those vendors' private APIs, so they're linked out (SimilarWeb, Semrush, ipinfo) instead.

Checks: `node sss/test.mjs` (collector, analysis, robots.txt matcher, GEO scoring in jsdom), `node sss/smoke.mjs` (real Chromium: all 17 views, full screen tab and pop-out window, a crawl in full screen, help/privacy pages, the AI path with a stubbed model (firewall drops an invented number), Refract rules in Issues, bot's eye against 403/challenge fixtures, overlays, report download, side-panel layout and per-tab enablement, Googlebot switch, PAA extraction).

External lookups (Domain view only, on open): dns.google, rdap.org, tranco-list.eu, ipinfo.io, archive.org. Everything else runs in the page.

## How the originals were analysed

1. Packages downloaded from the Chrome Web Store update endpoint and unzipped.
2. Manifests, UI strings, endpoints and `chrome.*` calls extracted with grep. This produced most of the feature map.
3. [REA](https://github.com/morluto/rea) `analyze_javascript_application` run on all four. It inventoried modules, but its semantic pass hit the heap limit on every main bundle, and its graph tracer (built for Electron/Node) matched no extension APIs. Its source recovery tool needs Linux x64. The grep of Detailed SEO's service worker that ran alongside it surfaced the right-click menu, which was then added here.
