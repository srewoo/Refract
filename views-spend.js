// Settings › Spend: daily caps per paid provider, today's totals, and the ledger of recent billed requests.
import { toCsv } from './analyze.js'
import { PROVIDERS } from './keys.js'
import { LEDGER_KEEP, USD_PROVIDERS, loadLedger, saveLedger, spentToday } from './ledger.js'
import { h, block, btn, num, download } from './ui.js'
import { note } from './views-data.js'

export const PAID = ['dataforseo', 'semrush', 'ahrefs', 'moz', 'pagespeed', 'openpagerank', 'naturallanguage']

export function spendBlock() {
  const out = h('div')
  let armed = null
  const draw = async () => {
    const l = await loadLedger()
    const setCap = (id) => async (e) => { const v = e.target.value.trim(); const cur = await loadLedger(); if (v === '') delete cur.caps[id]; else cur.caps[id] = Math.max(0, Number(v)); await saveLedger(cur); draw() }
    const clear = btn('Clear ledger', async (e) => {
      if (!armed) { e.target.textContent = 'Delete every entry? Click again'; armed = setTimeout(() => { armed = null; e.target.textContent = 'Clear ledger' }, 4000); return }
      clearTimeout(armed); armed = null
      await saveLedger({ caps: l.caps, entries: [] }); draw()
    })
    const recent = l.entries.slice(-100).reverse()
    out.replaceChildren(
      note('Every paid request is checked against today’s cap before it is sent and recorded here afterwards. DataForSEO reports its cost per request, so its cap is in dollars; other providers are capped by requests per day. Leave a cap empty for no limit. A request already running can take spend slightly over a cap.'),
      h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['Provider', 'Today', 'Daily cap'].map((t) => h('th', {}, t)))),
        h('tbody', {}, PAID.map((id) => {
          const t = spentToday(l.entries, id), usd = USD_PROVIDERS.has(id)
          return h('tr', {}, h('td', {}, PROVIDERS[id]?.name ?? id), h('td', { class: 'mono' }, usd ? `$${t.usd.toFixed(3)} · ${t.requests} requests` : `${t.requests} requests`),
            h('td', {}, h('input', { class: 'cell-input', type: 'number', min: 0, step: usd ? '0.01' : '1', value: l.caps[id] ?? '', placeholder: 'no cap', 'aria-label': `Daily cap for ${PROVIDERS[id]?.name ?? id}${usd ? ' in US dollars' : ' in requests'}`, onchange: setCap(id) }), h('span', { class: 'muted small' }, usd ? ' $ per day' : ' requests per day')))
        })))),
      h('div', { class: 'bar-line' }, btn('Export ledger CSV', () => download(`refract-spend-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(l.entries.map((e) => ({ ...e, cost: e.cost ?? '' }))))), clear,
        note(`${num(l.entries.length)} requests recorded (newest ${num(LEDGER_KEEP)} kept).`)),
      recent.length ? h('details', {}, h('summary', { class: 'small' }, `Recent requests (${recent.length})`), h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['When', 'Provider', 'Request', 'Cost', 'Result'].map((t) => h('th', {}, t)))),
        h('tbody', {}, recent.map((e) => h('tr', {}, h('td', { class: 'mono small nowrap' }, e.at.slice(0, 16).replace('T', ' ')), h('td', { class: 'small' }, PROVIDERS[e.provider]?.name ?? e.provider), h('td', { class: 'mono small' }, e.action),
          h('td', { class: 'mono small' }, e.cost != null ? `$${e.cost.toFixed(4)}` : '—'), h('td', { class: 'small' }, e.ok ? 'ok' : `failed: ${e.error ?? ''}`))))))) : '')
  }
  draw()
  return block('Spend', out)
}
