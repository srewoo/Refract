// Node check for scheduled runs (schedules.js): `node checks-schedules.mjs`. Fake chrome.storage, stubbed DataForSEO.
import assert from 'node:assert/strict'

const mem = {}
let granted = true
globalThis.chrome = {
  storage: { local: { get: async (k) => (k in mem ? { [k]: structuredClone(mem[k]) } : {}), set: async (o) => { Object.assign(mem, structuredClone(o)) } } },
  permissions: { contains: async () => granted },
  runtime: { getPlatformInfo: async () => ({}) },
}
let calls = 0
globalThis.fetch = async (url, init) => {
  calls++
  const { keyword } = JSON.parse(init.body)[0]
  return { ok: true, status: 200, json: async () => ({ status_code: 20000, cost: 0.002, tasks: [{ status_code: 20000, result: [{ items: [{ type: 'organic', domain: 'other.com', rank_group: 1, url: 'https://other.com/' }, { type: 'organic', domain: 'www.example.com', rank_group: keyword === 'shoes' ? 2 : 7, url: 'https://www.example.com/x' }] }] }] }) }
}
const { advance, isLate, runDue, loadSchedules } = await import('./schedules.js')

// --- advance: next slot after now, same time of day, missed slots skipped not queued
const H = 36e5, t0 = Date.parse('2026-10-01T09:00:00Z')
assert.equal(advance('2026-10-01T09:00:00.000Z', 'daily', t0), '2026-10-02T09:00:00.000Z')
assert.equal(advance('2026-10-01T09:00:00.000Z', 'daily', t0 + 5 * 24 * H + H), '2026-10-07T09:00:00.000Z', 'five missed days → one run, next slot tomorrow')
assert.equal(advance('2026-10-01T09:00:00.000Z', 'weekly', t0 - H), '2026-10-08T09:00:00.000Z')
assert.equal(isLate('2026-10-01T09:00:00Z', t0 + 30 * 60e3), false, 'a normal tick (≤30 min) is not late')
assert.equal(isLate('2026-10-01T09:00:00Z', t0 + 3 * H), true)

// --- a due schedule without a daily cap is skipped, never run, and still advances
const due = '2026-10-01T09:00:00.000Z', now = t0 + 3 * 24 * H // Chrome closed for three days
const sched = { id: 'ranks:example.com:us:desktop', kind: 'ranks', domain: 'example.com', label: 'x', every: 'daily', next: due, ranks: { market: 'us', device: 'desktop', depth: 100 } }
mem.byok = { creds: { dataforseo: { login: 'l', password: 'p' } }, route: { ranks: 'dataforseo' }, market: 'us' }
mem.schedules = { [sched.id]: sched }
mem[sched.id] = { keywords: ['shoes', 'boots'], history: {} }
await runDue(now)
let s = (await loadSchedules())[sched.id]
assert.equal(calls, 0, 'no cap → no paid call')
assert.ok(s.last.skipped && /daily cap/.test(s.last.message))
assert.equal(s.next, '2026-10-05T09:00:00.000Z')

// --- with a cap: runs once, marked late with its original due time, history stored, ledger records each call
mem.ledger = { caps: { dataforseo: 1 }, entries: [] }
mem.schedules[sched.id].next = due
await runDue(now)
s = (await loadSchedules())[sched.id]
assert.equal(calls, 2, 'one live check per keyword, once — not once per missed day')
assert.deepEqual([s.last.ok, s.last.late, s.last.due], [true, true, due])
assert.deepEqual(mem[sched.id].history.shoes.map((p) => p.position), [2])
assert.equal(mem.ledger.entries.length, 2)
await runDue(now)
assert.equal(calls, 2, 'not due again until the next slot')

// --- the cap stops a run: ledger already at the cap → calls refused, reported as a problem
mem.ledger = { caps: { dataforseo: 0.001 }, entries: [{ at: new Date().toISOString(), provider: 'dataforseo', action: 'x', ok: true, cost: 0.01 }] }
mem.schedules[sched.id].next = due
await runDue(now)
s = (await loadSchedules())[sched.id]
assert.equal(calls, 2)
assert.equal(s.last.ok, false); assert.match(s.last.message, /daily cap/)

// --- host permission revoked → skipped
granted = false; mem.ledger.entries = []; mem.schedules[sched.id].next = due
await runDue(now)
assert.match((await loadSchedules())[sched.id].last.message, /no longer has access/)

console.log('schedule checks OK')
