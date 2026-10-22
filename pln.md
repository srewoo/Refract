# Refract SEO feature-expansion plan

## Goal

Evolve Refract SEO from a strong browser-based, page-level diagnostic extension into a broader SEO research workspace, while preserving its differentiators: detailed current-page audits, bot-specific rendering checks, AI-crawl readiness, and live Google SERP tooling.

The priority gaps identified against OpenSEO are:

1. Persistent keyword research and clustering.
2. Configurable rank tracking.
3. Inbound backlink and referring-domain research.
4. Domain-level competitor intelligence.
5. Multi-engine AI citation and brand-visibility tracking.
6. MCP and reusable AI-agent workflows for a single local user (see Phase 6).

Target user: **one individual SEO on their own machine**. Feature parity with OpenSEO is the goal, with one accepted difference: schedules run only while Chrome is open (see M5).

Much of 1–4 already exists in a per-domain, single-view form. This plan **extends and migrates** those features into workspaces; it does not rebuild them.

## Progress (2026-10-22)

Built lazily on per-domain keys instead of Phase 0 workspaces (no migration needed yet):
- `npm run check` runs `test.mjs`; rank history records the provider, so live checks and index estimates never share a trend.
- Rank tracker: DataForSEO device + depth, one tracker per market/device (`ranks:<domain>:<market>:<device>`, old key read as desktop), cost estimate before / actual cost after, winners/losers/URL-change summary.
- Keyword metrics keep the 12-month trend (DataForSEO `monthly_searches`, Semrush `Td`).
- **Keyword research** view: discovery (DataForSEO Labs related/suggestions/ideas, Semrush related) with paging and cost estimate; saved keywords per domain (`kw:<domain>`) with tags, target URL, notes, metrics provenance, CSV import/export, "Get metrics"; "Save keyword" on Opportunities cards.
- **Competitors** view: competitor list (`competitors:<domain>`), keyword gap via Semrush/Ahrefs top keywords, stored per competitor+market (`domgap:…`), save gaps to keywords.

Closing Phases 1–3, then 4 and 5:
- Phase 0 (by other means): Settings › Research data backs up / restores all research keys as versioned JSON (`refract-seo-research` v1, never `byok` credentials) and deletes one domain's research after a confirm click.
- Phase 1: Google Ads discovery mode; token clustering (Jaccard ≥ 0.5 on stemmed tokens) with cluster tags; sources: this page's phrases, Google searches seen (`serp:obs`), PAA extractor CSV; Search Console "new query" flag; Keywords → **On-page terms** (old `?view=` still works).
- Phase 2: tracker adds saved keywords; DataForSEO checks store SERP features.
- Phase 3: Domain overview (DataForSEO / Semrush / Ahrefs totals + position spread + top pages, `domov:`); DataForSEO `ranked_keywords` powers the gap too.
- Phase 4 (`views-backlinks.js`, `links.js`): daily summary snapshots (`blsnap:`, newest 30), new / no-longer-listed referring domains, per-link rows with filters and export (`bllinks:`), most-linked pages, link gap vs a competitor, outreach prospects with status/notes (`prospects:`); Links → **On-page links**.
- Phase 5 (`views-ai.js`, `aivis.js`): prompts by topic on Google AI Overview, AI Mode, ChatGPT (web search) and Perplexity via DataForSEO; distinct cited / mentioned / not mentioned / engine cannot cite / check failed / no AI answer; run comparison, trend, CSV + HTML export, last 20 runs kept; Opportunities cards for competitor cited, missing comparison page, blocked AI crawler.

Deliberate differences: history stays one capped record per tracker/prompt rather than one key per run; no SERP-overlap check in clustering; no Ahrefs keyword discovery (docs unavailable); direct LLM provider keys (Phase 5 step 2) not added. Response shapes verified from provider docs only, not live accounts.

Gap pass (2026-10-22): broken/spam backlink signals (DataForSEO, Ahrefs) and DataForSEO broken/spam summary; Semrush/Ahrefs "lost only" filtered locally (no documented server filter) with offset paging fixed; prospect tags + filter; prompt editing (new wording/market clears history); retention limits + storage used in Settings; provider refusals now show the provider's own reason. `live-check.mjs dataforseo|semrush|ahrefs` checks every call's shape against the real APIs (DataForSEO sandbox by default) — DataForSEO blocked until account verification takes effect; Semrush/Ahrefs need keys.

Independent review fixes: renamed views crashed from issue links (now aliased + renamed at source); partial metric refreshes no longer wipe intent/trend/KD; a failed keyword no longer discards a paid rank run, and results can't land in another device's tracker; legacy rank history is labelled; AI trend skips days with no citable answers, a run can't fire twice, empty engine replies count as failed; backlink new/lost only compares same-size lists; delete confirms the domain it names; discovery searches can't mix; CSV exports neutralise formulas; DataForSEO KD failure keeps paid volumes.

claude-seo parity pass (2026-10-22): spend ledger + daily caps on every paid call (`ledger.js`, Settings › Spend; the M5 ledger half); retired rich-result list with replacements; merchant-listing Product fields; agent readiness (`agent.js`); Lighthouse via PageSpeed Insights incl. Agentic Browsing, single page + crawl batch; CrUX LCP sub-parts; Moz as a backlinks provider; Open PageRank authority; Cloud Natural Language entities; E-E-A-T signals + invisible-character rule; IndexNow (page + crawl); GA4 organic landing pages (own read-only scope); SERP-overlap clusters; content brief; local geo-grid (DataForSEO Maps); programmatic templates, parasite-SEO risk, sitemap.xml (crawl); domain heritage (Wayback); disavow file; live-link checks; schema templates, hreflang builder, comparison outline, Markdown/JSON audit export. Not built (need a server or an approval an extension can't get): Common Crawl graph files, Google Business Profile API, Indexing API, Google Ads Keyword Planner.

Still open: schedules (M5; the ledger and caps are done); Phase 6 (MCP) out of scope for now.

## Current state (baseline)

| Capability | Where it lives today | Storage |
|---|---|---|
| Provider routing + capabilities | `keys.js` (`PROVIDERS[id].can`), `providerFor(cfg, cap)` | `chrome.storage.local` keys record |
| Keyword metrics (volume, KD, CPC) | `providers.js` `API[id].keywords()` for DataForSEO, Semrush, Ahrefs; UI in `views-data.js` | not persisted |
| Rank tracking (≤50 keywords, 120 days, 1 point/day) | `views-data.js` "Check positions now" | one blob per domain |
| Domain top keywords | `API[id].rankedKeywords()` (Semrush/Ahrefs `domain_organic`), "What does this domain rank for?" | not persisted |
| Backlinks summary + top 25 referring domains | `views-data.js` `Backlinks`, `API[id].backlinks()` | `bl:<domain>` |
| GSC low-CTR opportunities | `opps.js` (`expectedCtr`, `low_ctr` cards), `gsc.js` | — |
| Phrase gaps vs competitor pages | `views-compare.js` | `gaps:<url>` |
| SERP observations | `serp.js` | `serp:obs` |
| Page history / crawl history | `history.js`, `views-crawl.js` | `hist:*`, `hist:index`, crawl keys |
| Full-tab view | `popup.html?full=1` opened via `openFull()` in `popup.js` | — |
| Cost reporting | DataForSEO returns `cost` per task (`providers.js` `dfsResult`) | not persisted |

`unlimitedStorage` is already granted, so quota is not the constraint; write amplification is (see Phase 0).

## Product boundaries

- Keep the extension useful without an account or paid data source.
- Keep provider credentials in `chrome.storage.local`; never include them in exported reports or workspace exports.
- Treat every paid provider request as opt-in. Show an estimated cost before it runs where the provider publishes per-request pricing (DataForSEO); otherwise show the request count and, for Semrush, the remaining API units.
- Continue to make the current-page audit and crawl work locally wherever possible.
- Extend the existing DataForSEO, Semrush, Ahrefs, Search Console, Bing Webmaster, crawl, history, compare, and SERP modules before adding a new service or provider.
- Preserve the present optional-host-permission model and request site/API access only at the point of use.

## Delivery order

Phases are ordered to match the milestones. Cheap extensions of existing features come first; new infrastructure arrives only in the phase that needs it.

| Phase | Outcome | Milestone | Why here |
|---|---|---|---|
| 0 | Minimal workspace foundation + migration | M1 | Every later feature needs a workspace id and a migration path for existing keys. |
| 1 | Persistent keyword research workspace | M1 | Turns existing GSC, PAA, SERP, and provider data into an actionable backlog. |
| 2 | Rank trackers (manual) | M2 | Existing tracker becomes configurable; connects chosen keywords to outcomes. |
| 3 | Domain overview + competitor gaps | M2/M3 | Mostly exists via `rankedKeywords()`; cheap strategic context. |
| 4 | Inbound backlink research | M3 | Extends the existing Backlinks view; completes authority/outreach workflow. |
| 5 | AI visibility tracking (manual) | M4 | Extends AI technical checks into measured visibility. |
| — | Schedules + request ledger | M5 | Only after manual runs are reliable. |
| 6 | Local MCP bridge + agent skills | M6 | Needs stable data contracts from Phases 0–5 and the request ledger from M5. |

## Phase 0 — minimal foundation

### Scope (only this)

- **Schema version + migration helper** with backward-compatible reads.
- **`workspace` record:** id, name, primary domain, country, language, competitors, created/updated timestamps.
- **Single partition key:** the workspace id. Domain, market, and language are fields on the workspace or record, not part of the partition scheme.
- **Migrate existing keys** into a default workspace per domain, keeping the old keys readable until the migration has been verified:
  - the rank-tracking blob in `views-data.js` → `rankTracker` + per-run records,
  - `bl:<domain>` → `backlinkSnapshot`,
  - `gaps:<url>` → competitor-gap record on the workspace.
  - `hist:*`, crawl keys, and `serp:obs` stay as they are (page/site-scoped, not workspace-scoped).
- **Workspace JSON export/import**, excluding API keys and OAuth tokens. Publish the export format as a versioned, documented schema — it is also the first step toward Phase 6.

Every other record type (`keyword`, `rankTracker`, `domainResearch`, `backlinkSnapshot`, `aiPrompt`) is defined in the phase that first uses it, not up front.

### Storage rules

- `chrome.storage.local.set` rewrites the whole value, so do not keep growing history in one blob. Store **one key per run** (tracker run, AI prompt run, backlink snapshot), indexed from its parent record, or move history-heavy records to IndexedDB. Decide per record type in its phase; default to one-key-per-run.
- Define a retention cap per record type when that record type is introduced, and surface caps in Settings.

### Surface

- Workspaces open in a full tab. Reuse the existing `popup.html?full=1` mechanism, but workspace views must not depend on the `tabId` binding (domain research is not tied to the current tab). If this proves awkward, add a dedicated `workspace.html`; decide during Phase 0.

### Acceptance criteria

- Existing audits, snapshots, crawls, settings, rank history, backlink cache, and phrase gaps remain readable after migration.
- Deleting a workspace removes only its own research records, after an in-page confirmation step.
- Every provider-driven view states its source, market, and retrieval time.

## Phase 1 — keyword research workspace

### Features

- Add a full-tab **Keywords** workspace, separate from the current page-density view.
- Create keyword lists from seed phrases, GSC queries, PAA extraction, SERP queries, page content, and competitor domains.
- **Keyword discovery modes** (today `API[id].keywords()` only enriches known terms; it never finds new ones):
  - **Related**, **Suggestions**, **Ideas** via DataForSEO Labs `related_keywords`, `keyword_suggestions`, `keyword_ideas` (live endpoints, existing connector).
  - **Google Ads** via `keywords_data/google_ads/keywords_for_keywords`.
  - Semrush (`phrase_related`) and Ahrefs (Keywords Explorer related/matching terms) as optional alternates, normalized into the same row shape.
  - Each mode shows row count and estimated cost before running; results paginate rather than fetching everything.
- **Monthly trend:** keep the 12-month `monthly_searches` series the Google Ads volume response already includes (currently discarded) and render a sparkline per keyword.
- Normalize provider metrics into: monthly volume, 12-month trend, difficulty, CPC, intent, SERP features, source, country, language, and collection date. `API[id].keywords()` already returns volume/KD/CPC; intent and SERP features are added only where the provider supplies them.
- Sortable/filterable opportunities with tags, notes, selection, bulk actions, and CSV import/export.
- Saved keyword collections; map each selected term to an existing or proposed target URL.
- **Striking-distance list:** `opps.js` `queryOpps()` already covers low CTR (≤ 5), striking distance (3–20), deep (> 20) and declining queries (previous-period data). Remaining: flag **new queries** (no previous-period row) and let the Keywords workspace save these cards as keywords.
- **Clustering (token-based only):** normalize terms, group by shared tokens/stems, then validate candidates by SERP-result overlap where provider SERP data is available. Semantic/embedding clustering is a non-goal this cycle (it would need an embeddings provider, key, and privacy update).

### Record

- `keyword`: phrase, market, language, source (incl. discovery mode + seed), tags, intent, volume/trend/difficulty/CPC snapshot + collection date, selected status, linked URL, notes.

### Reuse

- `gsc.js` for first-party query data; `opps.js` for opportunity scoring.
- `paa.js` and `serp.js` for question and live-result discovery.
- `providers.js` / `keys.js` for metrics via the existing `providerFor(cfg, 'keywords')` routing.

### UI

- Navigation entries: **Keyword research**, **Saved keywords**, **Clusters**.
- Rename the existing Keywords panel to **On-page terms**.
- Show data provenance beside each metric; never imply estimates are first-party Google data.

### Acceptance criteria

- A user can turn GSC queries or seed phrases into a saved, tagged keyword list.
- From one seed, each discovery mode returns new keywords with volume, trend, difficulty, CPC, and intent, and the user can save them in bulk.
- A user can attach target URLs and export the selected set.
- Works without a provider key: GSC/PAA/on-site sources stay available; only paid metrics are disabled.

## Phase 2 — rank tracking (manual)

### Starting point

The existing tracker in `views-data.js` stores ≤50 keywords per domain with daily history. Phase 2 migrates it into `rankTracker` records and makes it configurable.

### Provider reality

- **DataForSEO** performs a live SERP check per keyword and is the only provider that supports true tracking. Its `rank()` call currently hardcodes `device: 'desktop'` and `depth: 100` (`providers.js`); parameterize both.
- **Semrush/Ahrefs** positions come from the provider's index of the domain's top 50 keywords — a periodic snapshot, not a live check. Keep them as a fallback, but label results **"index estimate"** and disable device/depth options for them.

### Features

- Trackers defined by domain, country/location, language, device (desktop/mobile), SERP depth (DataForSEO only), and keywords.
- Add terms manually or from saved keyword collections and GSC opportunities.
- Store each run as its own record: position, previous position, ranking URL, visible SERP features, provider, cost, timestamp.
- Show movement, winners/losers, missing rankings, URL changes, and a per-keyword trend chart.
- Pre-run confirmation showing keyword count and the estimated DataForSEO cost (from published per-task pricing); actual cost from the response is stored with the run.

### Record

- `rankTracker`: domain, market, language, device, depth, keywords, provider, last run, and an index of run keys.

### Acceptance criteria

- A manual run writes a run record and renders position movement accurately.
- Tracker data stays separated by device, market, and language.
- Index-estimate results are visibly distinguished from live checks.

## Phase 3 — domain overview and competitor gaps

### Starting point

`rankedKeywords()` already returns a domain's top keywords from Semrush/Ahrefs; `views-compare.js` already computes page-level phrase gaps.

### Features

- **Domain overview** for any entered domain: estimated organic traffic, ranking keyword count, top pages, keyword distribution, link summary, market, provider, snapshot date. Persist as `domainResearch` snapshots.
- Competitors are stored on the workspace (already in the Phase 0 `workspace` record).
- Domain-keyword comparison: shared terms, competitor-only terms, user-only terms, suggested gaps.
- Extend `views-compare.js` with a domain-level mode; keep its existing phrase-gap mode.
- Promote a competitor keyword into the saved-keyword workspace in one action.

### Acceptance criteria

- Domain research never overwrites the user's own crawl or Search Console measurements.
- Every external estimate is labelled with provider and timestamp.
- Users can compare their domain with at least one competitor and export the gap table.

## Phase 4 — inbound backlink research

### Starting point

The existing `Backlinks` view shows a summary and top 25 referring domains for DataForSEO/Semrush/Ahrefs, with CSV export and a `bl:<domain>` cache. Phase 4 extends that view rather than adding a parallel one.

### Features

- Row-level data: backlinks, referring domains, anchors, linked pages, first/last seen, follow state, broken/lost state, domain-strength signal, and spam signal where supplied.
  - Note: row-level fields need different, more expensive endpoints (e.g. DataForSEO `backlinks/backlinks/live` rather than `summary`; DataForSEO Backlinks also needs its separate subscription, already gated by `dfsBacklinksOptIn`). Show the cost difference before fetching.
- Summary cards: backlinks, referring domains, top linked pages, follow/nofollow balance, new/lost links, linkable assets.
- Filters, pagination, CSV export, comparison with a stored competitor.
- Outreach/prospect list with tags and notes. No automated outreach.
- Each fetch is stored as its own `backlinkSnapshot` record.

### Provider strategy

- Normalize all three providers into the shared record shape (the summary shape already is).
- State that third-party backlink indexes are estimates and differ across providers.

### Acceptance criteria

- Existing outgoing-link checking is unchanged and renamed **On-page links**.
- Users can inspect their own and competitor inbound links and export filtered results.
- Provider failures show a recoverable error, never an empty/zero profile.

## Phase 5 — AI visibility tracking (manual)

### Features

- Keep the existing **AI search** technical-readiness view; add a separate **AI visibility** workspace.
- Save prompts under topics with engines, market, brand aliases, and competitor names.
- **Provider order:**
  1. Start with DataForSEO's AI Overview / LLM-mentions endpoints through the existing connector — no new key, host permission, or privacy change.
  2. Add direct LLM providers (e.g. Perplexity, OpenAI with web search, Gemini with grounding) only after (1) ships. Each needs a new key, a new optional host permission, and `privacy.html` updates. Note that model API answers do not equal consumer-product answers.
- Per engine, record whether it **can return citations**. "Not cited" is only reported for engines that can cite.
- Store each run as its own record: answer text, cited URLs, brand/domain mentions, competitor mentions, engine/model, run time, cost, failure state.
- Trend charts for mentions and citations, prompt-level evidence views, and CSV/HTML export.
- Turn findings into opportunity cards via `opps.js`: a cited competitor page, a missing comparison page, or an AI-crawler block.

### Record

- `aiPrompt`: prompt text, topic, engines, market, brand/competitors, latest run key, and an index of run keys.

### Accuracy rules

- Describe results as observations of a specific prompt, engine, configuration, and time — not an estimate of all AI conversations or traffic.
- A failed request is never classified as an absent mention/citation.
- Retain raw answer text only within the retention cap; provide delete controls for prompts and history.

### Acceptance criteria

- A saved prompt can be run, inspected, exported, and compared with its previous successful run.
- The UI distinguishes "not mentioned", "not cited", "engine cannot cite", and "check failed".

## M5 — schedules and request ledger

Built only after manual runs (Phases 2 and 5) are reliable.

- **Request ledger:** provider, capability, request time, estimated/actual cost when available, status, retry-safe error. Introduced here because unattended spending starts here.
- **Local schedules** via `chrome.alarms`, labelled "runs only while Chrome is running". Scheduled runs execute in the service worker, so the API host permissions must already be granted; the schedule setup UI requests them once.
- **Catch-up:** on browser start (`chrome.runtime.onStartup`) and on each alarm, run any schedule whose due time passed while Chrome was closed. Run it once, not once per missed slot, and mark it "ran late" with the original due time.
- Scheduled checks never run without a visible configured provider and a user-approved spend cap per period.
- **Accepted difference from OpenSEO:** OpenSEO runs schedules on a server, so they fire on time even when the user's machine is off. Refract's run when Chrome next opens. This is acceptable for a single user. State it in `help.html` and in the schedule setup UI.
- A remote worker or hosted sync is out of scope (non-goal).

## Phase 6 — local MCP bridge and agent skills

### Architecture decision

A local, single-user bridge. No network server and no account. Chrome must be running, which is acceptable for an individual working with an agent at their desk.

```
Claude Code / Codex / Cursor ──stdio──▶ refract-mcp (MCP server, launched by the client)
                                              │ local socket (Unix socket / Windows named pipe)
                                              ▼
                              refract-host (native-messaging host, launched by Chrome)
                                              │ chrome.runtime.connectNative
                                              ▼
                              Refract extension (service worker): storage, providers, crawl, GSC
```

- **Two entry points, one package.** Both live in a new `mcp/` folder with its own `package.json`. The extension stays build-free, and `store/package.py` excludes `mcp/` from the Web Store zip.
- **Pairing.** The extension connects to `refract-host` when the user turns on "Agent access" in Settings. That requests `nativeMessaging` as an optional permission, keeping the point-of-use model. The host writes a random per-session token to a user-only file (mode 0600), and `refract-mcp` must present it on the socket.
- **Install.** `npx refract-mcp install` writes the native-host manifest to Chrome's `NativeMessagingHosts` directory, with `allowed_origins` pinned to the extension id (stable, because `manifest.json` carries a `key`). It then prints the MCP client config snippet.
- **Extension not running** → every tool returns a clear error ("Open Chrome with Refract SEO and enable Agent access"), never empty data.
- **Credentials never cross the bridge.** Provider keys and the Google OAuth token stay in the extension; the extension makes all provider and GSC calls itself.
- **Review links.** Tools that save data return a `chrome-extension://<id>/popup.html?full=1&view=…` link, so the user can check the agent's work in the workspace, as OpenSEO links back to its app.

### Tools

**Read (free, no approval):**
`list_workspaces`, `get_keywords` (saved, with tags and clusters), `get_keyword_opportunities` (striking distance), `get_rank_tracker_results`, `get_domain_overview` (stored snapshots), `get_backlink_summary` (stored snapshots), `get_site_audit_summary` (latest crawl + history diff), `get_search_console_performance`, `get_ai_visibility_results`, `get_request_ledger`.

**Write, no spend (no approval; logged in the ledger):**
`save_keywords`, `tag_keywords` (including cluster tags), `set_target_url`, `add_competitor`, `save_ai_prompt`.

**Spend or browser actions (require in-extension approval):**
`discover_keywords`, `get_keyword_metrics`, `run_rank_tracker`, `fetch_domain_overview`, `fetch_backlinks`, `run_ai_visibility_check`, `start_site_crawl`, `inspect_url`.

- A spend tool creates a pending request showing the tool, inputs, and estimated cost or request count. The extension surfaces it with a badge and the approval view. The tool returns `pending` with a request id, and `get_request_status` returns the result after approval.
- Users can pre-approve a per-session spend cap. Requests under the cap run without prompting, and the ledger records each one.
- An agent can never start provider spending outside an approval or a user-set cap.

### Skills

Ship as Claude Code / Codex skill files in `mcp/skills/`. They match OpenSEO's set and add Refract's own:
- `/seo-coach`: guided next-best-action from audit, GSC, and saved keywords.
- `/seo-audit`: technical audit triage over crawl and page audits, including bot-render and AI-crawl checks.
- `/keyword-research`: discovery → metrics → token/SERP clustering → tag and save.
- `/competitor-analysis`: domain overview and keyword gap → promote gaps to saved keywords.
- `/striking-distance`: GSC positions 4–20 → target URL mapping.
- `/ai-visibility`: run saved prompts → opportunity cards.

### Acceptance criteria

- From Claude Code, a user can ask for keyword research on a seed and get discovered, clustered, tagged keywords saved to their workspace, with a review link. The only spend is behind one approval.
- With Chrome closed, or Agent access off, tools fail with an actionable message.
- The tool schemas are versioned and covered by fixture-based contract tests that run without Chrome or live credentials, using a fake host.
- Every write and spend appears in the request ledger.

## Cross-cutting UX and quality work

- Clear source labels: Browser audit, Search Console, crawl, DataForSEO, Semrush, Ahrefs, Bing, CrUX, or AI provider; plus "index estimate" vs "live check" for ranks.
- Progressive disclosure: keep Refract's quick current-page answer, linking to workspaces for deeper work.
- Empty states for missing permission, missing provider configuration, no data yet, and provider errors.
- All tables: keyboard navigation, CSV export, meaningful loading/progress state.
- Update `help.html`, `privacy.html`, and the manifest `description` before each public release; document every new API endpoint, retention behaviour, and permission.

### Testing

- There is no test framework, and none is added. Tests are plain-node `assert` scripts like the existing `checks-*.mjs`.
- `test.mjs` runs in `npm run check` (jsdom is a pinned devDependency).
- Every new normalizer and parser is a pure exported function (as in `providers.js` today) with recorded provider-response fixtures. No live credentials in automated tests.
- Add a migration check: fixture copies of current storage keys → migrate → assert that every existing view still reads its data.

## Milestones

| Milestone | Scope | Ship criterion |
|---|---|---|
| M1 | Phase 0 + Phase 1 | Users can create, tag, import/export, and retain keyword opportunities; existing data migrated intact. |
| M2 | Phase 2 + domain overview (Phase 3) | Users can assess an opportunity and record a rank baseline with correct live/estimate labelling. |
| M3 | Phase 4 + competitor gaps (Phase 3) | Users can make authority/content decisions from one workspace. |
| M4 | Phase 5 (DataForSEO AI endpoints) | Users can see prompt-specific mention/citation evidence. |
| M5 | Schedules (with catch-up) + request ledger | Scheduled runs operate within user-approved spend caps; missed runs catch up on browser start. |
| M6 | Phase 6 local MCP bridge + skills | An agent can research, save, and (with approval) spend through Refract; feature parity with OpenSEO for a single user. |

## Non-goals for the first implementation cycle

- Replacing Search Console with third-party traffic estimates.
- Automated outreach, email sending, or link-buying workflows.
- Browser automation/scraping of consumer AI chat products.
- Semantic/embedding-based keyword clustering.
- A network-exposed MCP server, remote worker, hosted sync, or multi-user/team workspaces.
- Requiring a remote account for page audits or crawls that already work locally.
- Removing or simplifying Refract's bot testing, SERP overlays, PAA extraction, or AI technical-audit functionality.
