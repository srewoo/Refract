// Spend ledger and daily caps for every paid provider call. Each call is checked against today's cap before it runs, and
// each billed HTTP request is recorded (provider, action, cost when the provider reports one, status, error). Fails closed: if the ledger can't
// be read, the paid call does not run. Storage: `ledger` = { caps: { [provider]: number }, entries: [...] } (newest last).
// Caps: DataForSEO in US dollars per day (it reports cost per call); every other provider in requests per day.

import { PROVIDERS } from './keys.js'

export const LEDGER_KEEP = 2000
const KEY = 'ledger'
const hasStore = () => !!globalThis.chrome?.storage?.local
export const USD_PROVIDERS = new Set(['dataforseo'])

export async function loadLedger() {
  const v = (await chrome.storage.local.get(KEY))[KEY] ?? {}
  return { caps: { ...v.caps }, entries: Array.isArray(v.entries) ? v.entries : [] }
}
export const saveLedger = (v) => chrome.storage.local.set({ [KEY]: { caps: v.caps, entries: v.entries.slice(-LEDGER_KEEP) } })

/** Today's (local date) totals for one provider: requests and dollars. */
export function spentToday(entries, provider, now = new Date()) {
  const day = now.toLocaleDateString('en-CA')
  const mine = entries.filter((e) => e.provider === provider && new Date(e.at).toLocaleDateString('en-CA') === day)
  return { requests: mine.length, usd: mine.reduce((t, e) => t + (e.cost ?? 0), 0) }
}

/** null when allowed, else the reason. Only the cap the user set applies; no cap = no limit. */
export function capReason(ledger, provider, now = new Date()) {
  const cap = ledger.caps[provider]
  if (cap == null || cap === '') return null
  const t = spentToday(ledger.entries, provider, now), name = PROVIDERS[provider]?.name ?? provider
  if (USD_PROVIDERS.has(provider)) return t.usd >= cap ? `Today’s ${name} spend ($${t.usd.toFixed(3)}) has reached your daily cap of $${Number(cap)}.` : null
  return t.requests >= cap ? `Today’s ${t.requests} ${name} requests have reached your daily cap of ${cap}.` : null
}

// ponytail: one read-modify-write per request; concurrent requests in two tabs can drop an entry. Move to one key per
// entry (or IndexedDB) if that ever matters. The cap is checked before a call, so one call can overshoot it.
/** Record one billed HTTP request. Called by each provider's request function, so multi-request methods count fully. */
export async function note(entry) {
  if (!hasStore()) return
  const l = await loadLedger()
  l.entries.push({ at: new Date().toISOString(), ok: true, cost: null, ...entry })
  await saveLedger(l)
}

/** Run one billed request and record it in the spend ledger (failures too, with their reason). */
export async function billed(provider, action, run, costOf = () => null) {
  try { const r = await run(); await note({ provider, action, cost: costOf(r) }); return r } catch (e) { await note({ provider, action, ok: false, error: String(e.message ?? e).slice(0, 200) }); throw e }
}

/**
 * Wrap a provider adapter: every method except `test` checks today's cap before it runs. Requests are recorded by
 * note() inside the adapter. Outside an extension page (Node tests, the live-check script) calls pass straight through.
 */
export function guard(provider, adapter) {
  return Object.fromEntries(Object.entries(adapter).map(([name, fn]) => [name, name === 'test' || typeof fn !== 'function' ? fn : async (...args) => {
    if (!hasStore()) return fn(...args)
    let ledger
    try { ledger = await loadLedger() } catch (e) { throw new Error(`Refract couldn’t read its spend ledger, so the paid call was not sent (${e.message ?? e}).`) }
    const stop = capReason(ledger, provider)
    if (stop) throw new Error(`${stop} Raise or clear it in Settings › Spend.`)
    return fn(...args)
  }]))
}
