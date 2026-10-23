// AI visibility: save prompts, run them on AI engines through DataForSEO, and see whether answers mention or cite this
// domain and its competitors. Kept apart from "AI search" (technical readiness of this page).
import { registrableDomain, toCsv } from './analyze.js'
import { ENGINES, compareRuns, deleteRuns, judge, loadPrompts, loadRuns, runPrompt, runRows, updatePrompts, verdict, visibilityTrend } from './aivis.js'
import { MARKETS, loadKeys } from './keys.js'
import { loadCompetitors } from './keywords.js'
import { scheduleBlock } from './views-schedule.js'
import { h, head, block, tag, btn, num, lineChart, download } from './ui.js'
import { failBox, note } from './views-data.js'

const running = new Set() // prompt ids with a paid run in flight; survives re-renders of the table
const usd = (v) => `$${v < 0.1 ? v.toFixed(3) : v.toFixed(2)}`
const estimate = (engines) => engines.reduce((t, e) => t + ENGINES[e].est, 0)
const OBSERVATION = 'Each result is what one engine answered to one prompt, in one market, at one time. It is not a measure of all AI conversations or traffic.'
function twoStep(label, ask, run) {
  let armed = null
  const b = btn(label, async () => {
    if (!armed) { b.textContent = ask; armed = setTimeout(() => { armed = null; b.textContent = label }, 4000); return }
    clearTimeout(armed); armed = null; b.textContent = label
    await run()
  })
  return b
}

// ---------------- Evidence for one prompt ----------------
function engineResult(r) {
  const j = r.judged, [st, label] = verdict(j)
  return h('div', { class: 'ai-result' },
    h('div', { class: 'bar-line' }, h('b', {}, ENGINES[r.engine]?.name ?? r.engine), tag(st, label), r.model ? h('span', { class: 'muted small' }, r.model) : '', r.cost != null ? h('span', { class: 'muted small mono' }, usd(r.cost)) : ''),
    !j.ok ? note(`The request failed, so this run says nothing about visibility: ${j.error}`) : !j.shown ? note('Google showed no AI answer for this prompt at this time.') : [
      j.citedUrls?.length ? h('p', { class: 'small' }, 'Your cited pages: ', j.citedUrls.join(', ')) : '',
      j.competitors?.length ? h('p', { class: 'small' }, 'Competitors: ', j.competitors.map((c) => `${c.domain} ${c.cited ? 'cited' : c.mentioned ? 'mentioned' : 'absent'}`).join(' · ')) : '',
      r.citations?.length ? h('details', {}, h('summary', { class: 'small' }, `${r.citations.length} source${r.citations.length === 1 ? '' : 's'} cited`), h('ul', { class: 'small' }, r.citations.map((c) => h('li', {}, c.title ? `${c.title} — ` : '', h('span', { class: 'mono' }, c.url))))) : '',
      r.text ? h('details', {}, h('summary', { class: 'small' }, 'Answer text'), h('p', { class: 'small ai-text' }, r.text)) : ''])
}

function evidence(domain, prompt, runs, onChange) {
  const cur = runs.at(-1)
  if (!cur) return note('Not run yet.')
  const prevOk = [...runs.slice(0, -1)].reverse().find((r) => r.results.some((x) => x.judged.ok))
  const changes = compareRuns(prevOk, cur)
  return h('div', {},
    note(`Run ${cur.at.slice(0, 16).replace('T', ' ')} UTC · ${MARKETS[cur.market]?.label ?? cur.market} · ${OBSERVATION}`),
    prevOk ? h('p', { class: 'small' }, `Since ${prevOk.at.slice(0, 10)}: `, changes.length ? changes.map((c) => `${ENGINES[c.engine]?.name}: ${c.from} → ${c.to}${c.competitorsNowCited.length ? ` (now cites ${c.competitorsNowCited.join(', ')})` : ''}`).join('; ') : 'no change.') : '',
    cur.results.map(engineResult),
    runs.length > 1 ? block('History', h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Run'), prompt.engines.map((e) => h('th', {}, ENGINES[e]?.name ?? e)))),
      h('tbody', {}, [...runs].reverse().map((run) => h('tr', {}, h('td', { class: 'mono small nowrap' }, run.at.slice(0, 10)), prompt.engines.map((e) => { const r = run.results.find((x) => x.engine === e); return h('td', {}, r ? tag(...verdict(r.judged)) : '—') }))))))) : '',
    h('div', { class: 'bar-line' }, btn('Export CSV', () => download(`ai-visibility-${prompt.id}.csv`, toCsv(runRows(prompt, runs)))),
      twoStep('Clear history', 'Delete every run? Click again', async () => { await deleteRuns(domain, prompt.id); await updatePrompts(domain, (s) => { if (s.prompts[prompt.id]) s.prompts[prompt.id].lastRun = null; return s }); onChange() })))
}

// ---------------- Prompts ----------------
function addPromptBlock(domain, onAdd) {
  const text = h('textarea', { rows: 2, class: 'kw-input', maxlength: 500, 'aria-label': 'Prompt', placeholder: 'A question your customers ask an AI, e.g. best family dentist in Austin' })
  const topic = h('input', { class: 'url-input', placeholder: 'Topic (optional)', 'aria-label': 'Topic', style: 'max-width:220px' })
  const boxes = Object.entries(ENGINES).map(([k, e]) => h('label', { class: 'small' }, h('input', { type: 'checkbox', value: k, checked: k === 'google_aio' || k === 'chatgpt' }), ` ${e.name}`))
  const msg = h('div')
  const save = btn('Save prompt', async () => {
    const p = text.value.trim(), engines = boxes.map((b) => b.querySelector('input')).filter((i) => i.checked).map((i) => i.value)
    if (!p || !engines.length) { msg.replaceChildren(note('Write a prompt and pick at least one engine.')); return }
    const cfg = await loadKeys(), id = `p${Date.now().toString(36)}`
    await updatePrompts(domain, (s) => ({ ...s, prompts: { ...s.prompts, [id]: { id, prompt: p, topic: topic.value.trim() || 'General', engines, market: cfg.market, created: new Date().toISOString(), lastRun: null } } }))
    text.value = ''; msg.replaceChildren(note(`Saved. Running it costs about ${usd(estimate(engines))} of DataForSEO credit.`))
    onAdd(id)
  }, { class: 'btn primary' })
  return block('Add a prompt', text, h('div', { class: 'bar-line' }, topic, boxes, save), msg)
}

/** Edit a saved prompt. New wording or market starts a fresh history: old runs answered a different question. */
function editForm(domain, p, done) {
  const text = h('textarea', { rows: 2, class: 'kw-input', maxlength: 500, 'aria-label': 'Edit prompt' }); text.value = p.prompt
  const topic = h('input', { class: 'url-input', value: p.topic, 'aria-label': 'Edit topic', style: 'max-width:220px' })
  const market = h('select', { 'aria-label': 'Edit market' }, Object.entries(MARKETS).map(([k, m]) => h('option', { value: k, selected: k === p.market }, m.label)))
  const boxes = Object.entries(ENGINES).map(([k, e]) => h('label', { class: 'small' }, h('input', { type: 'checkbox', value: k, checked: p.engines.includes(k) }), ` ${e.name}`))
  const msg = h('div')
  const save = btn('Save changes', async () => {
    const engines = boxes.map((b) => b.querySelector('input')).filter((i) => i.checked).map((i) => i.value), t = text.value.trim()
    if (!t || !engines.length) { msg.replaceChildren(note('Keep a prompt and at least one engine.')); return }
    const fresh = t !== p.prompt || market.value !== p.market
    if (fresh) await deleteRuns(domain, p.id)
    await updatePrompts(domain, (s) => { if (s.prompts[p.id]) s.prompts[p.id] = { ...s.prompts[p.id], prompt: t, topic: topic.value.trim() || 'General', engines, market: market.value, ...(fresh && { lastRun: null }) }; return s })
    done()
  }, { class: 'btn primary' })
  return block(`Edit · “${p.prompt}”`, text, h('div', { class: 'bar-line' }, topic, market), h('div', { class: 'bar-line' }, boxes),
    note('Changing the wording or the market clears this prompt’s history, because older runs answered a different question. Topic and engines keep it.'), h('div', { class: 'bar-line' }, save, btn('Cancel', done)), msg)
}

function promptTable(domain, data, latest, { select, edit, refresh }) {
  const list = Object.values(data.prompts).sort((a, b) => a.topic.localeCompare(b.topic) || a.created.localeCompare(b.created))
  if (!list.length) return note('No prompts yet.')
  return h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['Topic', 'Prompt', 'Latest results', 'Last run', ''].map((t) => h('th', {}, t)))),
    h('tbody', {}, list.map((p) => {
      const run = latest[p.id]
      const label = `Run · ~${usd(estimate(p.engines))}`, err = h('div')
      const go = btn(running.has(p.id) ? 'Running… (up to 2 min)' : label, async (e) => {
        if (running.has(p.id)) return
        running.add(p.id); e.target.disabled = true; e.target.textContent = 'Running… (up to 2 min)'; err.replaceChildren()
        let runs
        try { runs = await runPrompt(domain, p) }
        catch (x) { running.delete(p.id); err.replaceChildren(failBox(x)); e.target.disabled = false; e.target.textContent = label; return } // keep Run usable for a retry
        running.delete(p.id) // before the refresh, so the re-rendered Run button is enabled
        select(p.id); await refresh() // re-renders the selected prompt from fresh data
      }, { class: 'btn primary', disabled: running.has(p.id) })
      return h('tr', {}, h('td', { class: 'small nowrap' }, p.topic), h('td', {}, p.prompt, h('div', { class: 'muted small' }, p.engines.map((e) => ENGINES[e]?.name ?? e).join(', '))),
        h('td', {}, run ? run.results.map((r) => h('div', { class: 'small nowrap' }, `${ENGINES[r.engine]?.name.split(' (')[0]}: `, tag(...verdict(r.judged)))) : h('span', { class: 'muted small' }, 'not run')),
        h('td', { class: 'mono small nowrap' }, run ? run.at.slice(0, 10) : '—'),
        h('td', { class: 'nowrap' }, go, ' ', btn('Evidence', () => select(p.id)), ' ', btn('Edit', () => edit(p.id)), ' ',
          twoStep('Delete', 'Delete prompt and history? Click again', async () => { await deleteRuns(domain, p.id); await updatePrompts(domain, (s) => { delete s.prompts[p.id]; return s }); refresh() }), err))
    }))))
}

const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
function htmlReport(domain, data, latest) {
  const rows = Object.values(data.prompts).filter((p) => latest[p.id]).map((p) => latest[p.id].results.map((r) => `<tr><td>${escHtml(p.prompt)}</td><td>${escHtml(ENGINES[r.engine]?.name ?? r.engine)}</td><td>${escHtml(verdict(r.judged)[1])}</td><td>${escHtml((r.judged.citedUrls ?? []).join(' '))}</td><td>${escHtml((r.judged.competitors ?? []).filter((c) => c.cited).map((c) => c.domain).join(', '))}</td><td>${escHtml(latest[p.id].at.slice(0, 10))}</td></tr>`).join('')).join('')
  return `<!doctype html><meta charset="utf-8"><title>AI visibility · ${escHtml(domain)}</title><style>body{font:14px system-ui;margin:24px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px;text-align:left;vertical-align:top}</style><h1>AI visibility · ${escHtml(domain)}</h1><p>${escHtml(OBSERVATION)} Generated ${new Date().toISOString().slice(0, 10)}.</p><table><tr><th>Prompt</th><th>Engine</th><th>Result</th><th>Your cited pages</th><th>Competitors cited</th><th>Run</th></tr>${rows}</table>`
}

function trendBlock(runsAll) {
  const t = visibilityTrend(runsAll).filter((x) => x.answers)
  const plotted = t.filter((x) => x.citable) // a day without answers that could cite has no citation rate, not 0%
  if (t.length < 2) return note('Run prompts on different days to see a trend.')
  return h('div', {}, plotted.length > 1 ? lineChart(plotted.map((x) => ({ date: x.date, value: Math.round((x.cited / x.citable) * 100) })), { label: 'Cited in % of answers with sources', fmt: (v) => `${Math.round(v)}%`, height: 120 }) : note('Not enough days with answers that include sources to chart a citation rate.'),
    note(t.map((x) => `${x.date}: cited ${x.cited}/${x.citable} answers with sources, mentioned ${x.mentioned}/${x.answers}`).join(' · ')))
}

export const AiVisibility = {
  render(d, { go } = {}) {
    const domain = registrableDomain(d.host)
    const brand = h('input', { class: 'url-input', 'aria-label': 'Brand names', placeholder: 'Brand names, comma-separated (e.g. Smile Co, SmileCo)', onchange: (e) => updatePrompts(domain, (s) => ({ ...s, brand: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })) })
    const rivals = note(''), table = h('div'), detail = h('div'), trend = h('div'), tools = h('div', { class: 'bar-line' })
    let selected = null
    const refresh = async () => {
      const data = await loadPrompts(domain), comps = await loadCompetitors(domain)
      brand.value = data.brand.join(', ')
      rivals.textContent = comps.length ? `Competitors checked in every answer: ${comps.join(', ')} (edit them in Competitors).` : 'Add competitors in the Competitors view to see when AI answers cite them instead of you.'
      const runs = Object.fromEntries(await Promise.all(Object.keys(data.prompts).map(async (id) => [id, await loadRuns(domain, id)])))
      const latest = Object.fromEntries(Object.entries(runs).filter(([, r]) => r.length).map(([id, r]) => [id, r.at(-1)]))
      const select = (id) => { selected = id; const p = data.prompts[id]; detail.replaceChildren(p ? block(`Evidence · “${p.prompt}”`, evidence(domain, p, runs[id] ?? [], refresh)) : '') }
      const edit = (id) => { selected = null; detail.replaceChildren(editForm(domain, data.prompts[id], () => { selected = id; refresh() })) }
      table.replaceChildren(promptTable(domain, data, latest, { select, edit, refresh }))
      trend.replaceChildren(trendBlock(Object.values(runs).flat()))
      tools.replaceChildren(btn('Export all as CSV', () => download(`ai-visibility-${domain}.csv`, toCsv(Object.values(data.prompts).flatMap((p) => runRows(p, runs[p.id] ?? []))))),
        btn('Export HTML report', () => download(`ai-visibility-${domain}.html`, htmlReport(domain, data, latest), 'text/html')))
      if (selected) select(selected)
    }
    refresh()
    return [head('AI visibility', `Whether AI answers mention and cite ${domain} for the prompts you choose. Runs through your DataForSEO account.`),
      block('Your brand', brand, rivals), addPromptBlock(domain, (id) => { selected = id; refresh() }), block('Prompts', note(OBSERVATION), table, tools),
      scheduleBlock(() => ({ id: `ai:${domain}`, kind: 'ai', domain, label: `AI visibility · ${domain} (every saved prompt)` }), { go }), detail, block('Trend', trend)]
  },
}
