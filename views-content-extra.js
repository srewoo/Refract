// Content › content score for a target keyword, trust signals (E-E-A-T) and entity analysis with Google Cloud Natural
// Language (your key; sends page text only when you press the button).
import { analyseText } from './apis.js'
import { contentScore } from './content-score.js'
import { band, eeatSignals } from './geo.js'
import { hasCreds, loadKeys } from './keys.js'
import { h, block, btn, tag, bars, ring } from './ui.js'
import { failBox, note } from './views-data.js'

export function trustBlock(d) {
  const s = eeatSignals(d)
  return block(`Trust signals (E-E-A-T) · ${s.filter((x) => x.ok).length} of ${s.length}`, h('ul', { class: 'checks' }, s.map((x) => h('li', {}, tag(x.ok ? 'good' : 'warn', x.ok ? 'Pass' : 'Miss'), x.label, x.ok ? '' : h('span', { class: 'muted small' }, ` — ${x.hint}`)))),
    note('Signals readers and Google’s quality raters look for: who made the page, how, and why. Trust weighs most. These are page signals, not a ranking score.'))
}

export function entitiesBlock(d, { go }) {
  const out = h('div')
  const run = btn('Analyse entities', async (e) => {
    const cfg = await loadKeys()
    if (!hasCreds(cfg, 'naturallanguage')) { out.replaceChildren(note('Needs a Google Cloud Natural Language API key (Settings › Connectors). It is the one connector that sends page text.'), btn('Open Settings', () => go('Settings'))); return }
    if (!d.bodyText) { out.replaceChildren(note('No page text to analyse.')); return }
    e.target.disabled = true; out.replaceChildren(note('Sending the page text to Google Cloud Natural Language…'))
    try {
      const r = await analyseText(cfg.creds.naturallanguage.key, d.bodyText)
      out.replaceChildren(
        r.categories.length ? h('p', { class: 'small' }, 'Google classifies the page as: ', r.categories.map((c) => `${c.name} (${Math.round(c.confidence * 100)}%)`).join(' · ')) : '',
        bars(r.entities.slice(0, 15).map((x) => ({ label: `${x.name} · ${x.type.toLowerCase()}`, value: Math.round(x.salience * 1000) / 10 })), { fmt: (v) => `${v}%` }),
        h('p', { class: 'small' }, 'Known entities (with a Wikipedia page): ', r.entities.filter((x) => x.wikipedia).slice(0, 12).map((x) => x.name).join(', ') || 'none'),
        note(`Salience = how central Google’s language model thinks each entity is to the text. If your main topic isn’t near the top, the page may read as being about something else.${r.truncated ? ' Only the first 20,000 characters were sent.' : ''}`))
    } catch (x) { out.replaceChildren(failBox(x)) } finally { e.target.disabled = false }
  })
  return block('Entities · Google Cloud Natural Language', h('div', { class: 'bar-line' }, run, note('Sends up to 20,000 characters of this page’s text to Google, only when pressed.')), out)
}

/** Score this page against a keyword and the questions searchers ask; both are saved per URL. */
export function contentScoreBlock(d) {
  const key = `cscore:${d.url.replace(/#.*/, '')}`
  const kw = h('input', { class: 'url-input', placeholder: 'Target keyword, e.g. crm for startups', 'aria-label': 'Target keyword' })
  const qs = h('textarea', { rows: 3, class: 'kw-input', 'aria-label': 'Questions to answer, one per line', placeholder: 'Questions searchers ask, one per line (on Google: Extract People Also Ask)' })
  const out = h('div')
  const draw = () => {
    if (!kw.value.trim()) { out.replaceChildren(note('Enter the keyword this page should rank for.')); return }
    const r = contentScore(d, kw.value, qs.value.split('\n'))
    const b = band(r.score)
    out.replaceChildren(
      h('div', { class: 'split' },
        h('div', { class: 'score-card' }, ring(r.score, b.status, { label: 'Content score' }), h('div', {}, h('div', { class: 'grade' }, `Grade ${b.grade}`), h('div', { class: 'muted' }, `average of ${r.dims.length} dimensions`))),
        bars(r.dims.map((x) => ({ label: x.name, value: x.score })), { fmt: (v) => `${v}` })),
      ...r.dims.map((x) => {
        const isQ = x.name === 'Questions answered'
        return h('div', {}, h('h3', {}, isQ ? `${x.name} · ${x.checks.filter((c) => c.ok).length} of ${x.checks.length}` : `${x.name} · ${x.score}`),
          h('ul', { class: 'checks' }, x.checks.map((c) => h('li', {}, tag(c.ok ? 'good' : 'warn', isQ ? (c.ok ? 'Covered' : 'Not yet') : c.ok ? 'Pass' : 'Miss'), c.label, c.ok ? '' : h('span', { class: 'muted small' }, ` — ${c.fix}`)))))
      }))
  }
  const run = btn('Score', async () => { draw(); if (kw.value.trim()) await chrome.storage.local.set({ [key]: { keyword: kw.value.trim(), questions: qs.value } }) })
  chrome.storage.local.get(key).then((v) => { if (v[key]) { kw.value = v[key].keyword; qs.value = v[key].questions ?? ''; draw() } })
  return block('Content score', h('div', { class: 'bar-line' }, kw, run), qs, out,
    note('Keyword coverage, readability (Flesch, English pages), structure and questions answered. A question counts as covered when a heading or paragraph uses most of its words.'))
}
