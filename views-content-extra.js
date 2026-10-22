// Content › trust signals (E-E-A-T) and entity analysis with Google Cloud Natural Language (your key; sends page text
// only when you press the button).
import { analyseText } from './apis.js'
import { eeatSignals } from './geo.js'
import { hasCreds, loadKeys } from './keys.js'
import { h, block, btn, tag, bars } from './ui.js'
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
