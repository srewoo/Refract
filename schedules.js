// Scheduled rank checks and AI visibility runs (M5). They run in the service worker on a chrome.alarms tick, so only
// while Chrome is running: a run missed while Chrome was closed happens once when it next opens, marked late with
// its original due time. A schedule never runs without its provider connected, its API host granted and a daily
// spend cap set for that provider (the ledger guard then enforces the cap on every call).
// Storage: `schedules` = { [id]: { id, kind: 'ranks' | 'ai', domain, label, every, next, last, ranks? } }, where the id
// is the rank tracker key or `ai:<domain>`, and `last` = { at, due, late, ok, message }.
import { PROVIDERS, hasCreds, loadKeys, providerFor } from './keys.js'
import { loadLedger } from './ledger.js'
import { checkRanks, readTracker } from './ranks.js'
import { loadPrompts, runPrompt } from './aivis.js'

const KEY = 'schedules'
const DAY = 864e5
export const PERIODS = { daily: DAY, weekly: 7 * DAY }
export const LATE_AFTER = 60 * 60e3 // the alarm ticks every 30 minutes, so later than this means Chrome was closed
export const TICK_MINUTES = 30

/** First due time after `now`, keeping the schedule's time of day: missed slots are skipped, not queued. */
export function advance(due, every, now = Date.now()) {
  const p = PERIODS[every], t = Date.parse(due)
  return new Date(t + Math.max(1, Math.ceil((now - t + 1) / p)) * p).toISOString()
}
export const isDue = (s, now = Date.now()) => Date.parse(s.next) <= now
export const isLate = (due, now = Date.now()) => now - Date.parse(due) > LATE_AFTER

export const loadSchedules = async () => (await chrome.storage.local.get(KEY))[KEY] ?? {}
export async function updateSchedules(fn) { const v = fn(await loadSchedules()) ?? {}; await chrome.storage.local.set({ [KEY]: v }); return v }
export const providerOf = (s, cfg) => (s.kind === 'ai' ? 'dataforseo' : providerFor(cfg, 'ranks'))

/** null when the schedule may run, else why not. Shared by the setup UI and each run. */
export async function blocker(s, cfg, { access = true } = {}) {
  const id = providerOf(s, cfg), name = PROVIDERS[id]?.name ?? id
  if (!id || !hasCreds(cfg, id)) return s.kind === 'ai' ? 'Connect DataForSEO in Settings › Connectors.' : 'Connect a rank tracking provider in Settings › Connectors.'
  const cap = (await loadLedger()).caps[id]
  if (cap == null || cap === '') return `Set a daily cap for ${name} in Settings › Spend first: scheduled runs never spend without one.`
  if (access && !(await chrome.permissions.contains({ origins: PROVIDERS[id].origins }))) return `Refract no longer has access to ${name}’s API. Save its key again in Settings › Connectors.`
  return null
}

async function runOne(s, cfg) {
  if (s.kind === 'ranks') {
    const id = providerOf(s, cfg)
    const keywords = (await readTracker(s.domain, s.id)).saved?.keywords ?? []
    if (!keywords.length) return { ok: false, message: 'No keywords in this tracker yet: check positions once by hand first.' }
    const r = await checkRanks({ cfg: { ...cfg, market: s.ranks.market }, id, k: s.id, domain: s.domain, keywords, device: s.ranks.device, depth: s.ranks.depth })
    return { ok: !r.failed.length, message: `Checked ${r.results.length} keywords with ${PROVIDERS[id].name}${id === 'dataforseo' ? `, cost $${r.spent.toFixed(3)}` : ''}.${r.failed.length ? ` ${r.failed.length} failed: ${r.failed[0][1]}` : ''}` }
  }
  const prompts = Object.values((await loadPrompts(s.domain)).prompts)
  if (!prompts.length) return { ok: false, message: 'No saved prompts for this domain.' }
  let failed = 0, answers = 0
  for (const p of prompts) for (const r of (await runPrompt(s.domain, p)).at(-1).results) { answers++; if (!r.judged.ok) failed++ }
  return { ok: !failed, message: `Ran ${prompts.length} prompts (${answers} engine answers${failed ? `, ${failed} failed` : ''}).` }
}

let busy = false // one service worker instance; the claim below covers a worker restarted mid-run
/** Run every due schedule once. Called on each alarm tick and on browser start. */
export async function runDue(now = Date.now()) {
  if (busy) return
  busy = true
  // ponytail: getPlatformInfo every 20 s keeps the worker alive through long provider calls (AI answers take up to 2 min).
  const alive = setInterval(() => chrome.runtime.getPlatformInfo(), 20e3)
  try {
    const due = Object.values(await loadSchedules()).filter((s) => isDue(s, now))
    if (!due.length) return
    // Claim before running: a worker killed mid-run skips that slot instead of repeating paid calls.
    await updateSchedules((all) => { for (const s of due) if (all[s.id]) all[s.id].next = advance(s.next, s.every, now); return all })
    const cfg = await loadKeys()
    for (const s of due) {
      const at = new Date().toISOString(), base = { at, due: s.next, late: isLate(s.next, now) }
      let last
      try { const stop = await blocker(s, cfg); last = stop ? { ...base, ok: false, skipped: true, message: stop } : { ...base, ...(await runOne(s, cfg)) } }
      catch (e) { last = { ...base, ok: false, message: String(e.message ?? e).slice(0, 300) } }
      await updateSchedules((all) => { if (all[s.id]) all[s.id].last = last; return all })
    }
  } finally { clearInterval(alive); busy = false }
}

export const describe = (s) => `${s.every === 'daily' ? 'Daily' : 'Weekly'}, next ${s.next.slice(0, 16).replace('T', ' ')} UTC`
export const lastText = (l) => (!l ? 'Not run yet.' : `Last run ${l.at.slice(0, 16).replace('T', ' ')} UTC${l.late ? ` (ran late: was due ${l.due.slice(0, 16).replace('T', ' ')} UTC while Chrome was closed)` : ''}: ${l.skipped ? 'skipped. ' : l.ok ? '' : 'problem. '}${l.message}`)
