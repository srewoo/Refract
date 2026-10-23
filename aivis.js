// AI visibility: saved prompts per domain, their runs across AI engines, and the pure judging behind each result.
// A result is an observation of one prompt on one engine, configuration and time — never an estimate of all AI traffic.
// Storage: `aiprompts:<domain>` = { brand: [aliases], prompts: { [id]: prompt } };
//          `airuns:<domain>:<id>` = runs, newest last (RUN_KEEP kept; answer text capped at TEXT_CAP chars).
import { clean, loadCompetitors } from './keywords.js'
import { MARKETS, hasCreds, loadKeys } from './keys.js'
import { API } from './providers.js'

// ponytail: est. is the DataForSEO task fee plus a typical model charge; the real cost of each run is stored with it.
export const ENGINES = {
  google_aio: { name: 'Google AI Overview', est: 0.004 },
  google_ai_mode: { name: 'Google AI Mode', est: 0.004 },
  chatgpt: { name: 'ChatGPT (gpt-4.1-mini, web search)', est: 0.01 },
  perplexity: { name: 'Perplexity (sonar)', est: 0.01 },
}
// Robots.txt user agents each engine's answers depend on (Google AI features use ordinary Googlebot).
export const ENGINE_BOTS = { chatgpt: ['OAI-SearchBot', 'ChatGPT-User'], perplexity: ['PerplexityBot'] }
export const RUN_KEEP = 20, TEXT_CAP = 6000

const get = async (k) => (await chrome.storage.local.get(k))[k]
const set = (k, v) => chrome.storage.local.set({ [k]: v })
export const loadPrompts = async (domain) => (await get(`aiprompts:${domain}`)) ?? { brand: [], prompts: {} }
export async function updatePrompts(domain, fn) { const v = fn(await loadPrompts(domain)) ?? { brand: [], prompts: {} }; await set(`aiprompts:${domain}`, v); return v }
export const loadRuns = async (domain, id) => (await get(`airuns:${domain}:${id}`)) ?? []
export async function addRun(domain, id, run) {
  const runs = [...(await loadRuns(domain, id)), { ...run, results: run.results.map((r) => ({ ...r, text: (r.text ?? '').slice(0, TEXT_CAP) })) }].slice(-RUN_KEEP)
  await set(`airuns:${domain}:${id}`, runs)
  return runs
}
export const deleteRuns = (domain, id) => chrome.storage.local.remove(`airuns:${domain}:${id}`)

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Whole-word, case-insensitive: "Smile Co" matches "smile co's" but not "smilecorp". */
export const mentions = (text, name) => !!name && new RegExp(`(^|[^\\p{L}\\p{N}])${esc(clean(name))}($|[^\\p{L}\\p{N}])`, 'iu').test(clean(text))
const onDomain = (url, domain) => { try { const h = new URL(url).hostname.replace(/^www\./, ''); return h === domain || h.endsWith(`.${domain}`) } catch { return false } }
// ponytail: a competitor's name is its domain and the domain's first label ("rival.com" → "rival", 4+ letters).
const namesFor = (domain, aliases = []) => [domain, ...aliases, ...(domain.split('.')[0].length >= 4 ? [domain.split('.')[0]] : [])]

/** One engine answer (or a failure) → what it says about you and your competitors. */
export function judge(answer, { domain, brand = [], competitors = [] }) {
  if (answer.error) return { ok: false, error: answer.error }
  if (!answer.shown) return { ok: true, shown: false }
  const canCite = answer.citations != null
  const cites = (d) => canCite && answer.citations.some((c) => onDomain(c.url, d))
  return {
    ok: true, shown: true, canCite,
    mentioned: namesFor(domain, brand).some((n) => mentions(answer.text, n)),
    cited: cites(domain),
    citedUrls: canCite ? answer.citations.filter((c) => onDomain(c.url, domain)).map((c) => c.url) : [],
    competitors: competitors.map((c) => ({ domain: c, mentioned: namesFor(c).some((n) => mentions(answer.text, n)), cited: cites(c), urls: canCite ? answer.citations.filter((x) => onDomain(x.url, c)).map((x) => x.url) : [] })),
  }
}

/** The four states the UI must keep apart, plus "no AI answer shown" for Google features that may not appear. */
export function verdict(j) {
  if (!j.ok) return ['bad', 'Check failed']
  if (!j.shown) return ['warn', 'No AI answer shown']
  if (j.cited) return ['good', 'Cited']
  if (!j.canCite) return ['warn', j.mentioned ? 'Mentioned · engine cannot cite' : 'Not mentioned · engine cannot cite']
  return j.mentioned ? ['warn', 'Mentioned, not cited'] : ['bad', 'Not mentioned']
}

/** What changed per engine between two runs; failed checks are skipped, never read as a loss. */
export function compareRuns(prev, cur) {
  if (!prev || !cur) return []
  const before = new Map(prev.results.map((r) => [r.engine, r]))
  return cur.results.flatMap((r) => {
    const p = before.get(r.engine)
    if (!p || !p.judged.ok || !r.judged.ok) return []
    const [a, b] = [verdict(p.judged)[1], verdict(r.judged)[1]]
    const newly = (r.judged.competitors ?? []).filter((c) => c.cited && !(p.judged.competitors ?? []).find((x) => x.domain === c.domain)?.cited).map((c) => c.domain)
    return a !== b || newly.length ? [{ engine: r.engine, from: a, to: b, competitorsNowCited: newly }] : []
  })
}

/** Runs across prompts → per day: checks that could cite, how many cited you, how many mentioned you. */
export function visibilityTrend(runs) {
  const by = new Map()
  for (const run of runs) for (const r of run.results) {
    if (!r.judged.ok || !r.judged.shown) continue
    const d = run.at.slice(0, 10), t = by.get(d) ?? { date: d, answers: 0, mentioned: 0, citable: 0, cited: 0 }
    t.answers++; if (r.judged.mentioned) t.mentioned++
    if (r.judged.canCite) { t.citable++; if (r.judged.cited) t.cited++ }
    by.set(d, t)
  }
  return [...by.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** Flat rows for CSV export: one per prompt × run × engine. */
export const runRows = (prompt, runs) => runs.flatMap((run) => run.results.map((r) => ({ prompt: prompt.prompt, topic: prompt.topic, engine: ENGINES[r.engine]?.name ?? r.engine, model: r.model ?? '', market: run.market, run_at: run.at,
  result: verdict(r.judged)[1], mentioned: r.judged.mentioned ?? '', cited: r.judged.cited ?? '', cited_urls: (r.judged.citedUrls ?? []).join(' '),
  competitors_cited: (r.judged.competitors ?? []).filter((c) => c.cited).map((c) => c.domain).join(' '), cost: r.cost ?? '', error: r.judged.error ?? '' })))

/** Run one saved prompt on its engines and store the run. Used by the AI visibility view and scheduled runs. */
export async function runPrompt(domain, prompt) {
  const cfg = await loadKeys()
  if (!hasCreds(cfg, 'dataforseo')) throw new Error('AI visibility runs through DataForSEO: connect it in Settings › Connectors.')
  const [competitors, { brand }] = await Promise.all([loadCompetitors(domain), loadPrompts(domain)])
  const m = MARKETS[prompt.market] ?? MARKETS[cfg.market]
  const results = await Promise.all(prompt.engines.map(async (engine) => {
    try {
      const a = await API.dataforseo.aiAnswer(cfg.creds.dataforseo, engine, prompt.prompt, m)
      return { engine, model: a.model ?? null, cost: a.cost ?? null, text: a.text, citations: a.citations, judged: judge(a, { domain, brand, competitors }) }
    } catch (e) { return { engine, cost: null, judged: judge({ error: e.message ?? String(e) }, { domain }) } } // a failure is never "not mentioned"
  }))
  const runs = await addRun(domain, prompt.id, { at: new Date().toISOString(), market: prompt.market, results })
  await updatePrompts(domain, (s) => { if (s.prompts[prompt.id]) s.prompts[prompt.id].lastRun = runs.at(-1).at; return s })
  return runs
}
