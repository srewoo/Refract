// "How to fix" disclosure under an issue: steps + snippet for the chosen platform, defaulting to the detected stack.
import { PLATFORMS, fixFor, forPlatform, platformOf } from './fixes.js'
import { stack } from './rules.js'
import { h, copyBtn } from './ui.js'

let chosen = null // one platform choice for every issue on the page

export function howTo(d, issue) {
  const fix = fixFor(issue, d)
  if (!fix) return ''
  const detected = platformOf(stack(d.fw, d.globals).id)
  const body = h('div', { class: 'howto-body' })
  const draw = () => {
    const key = chosen ?? detected
    const entry = forPlatform(fix, key)
    const pick = h('select', { 'aria-label': 'Platform', onchange: (e) => { chosen = e.target.value; draw() } },
      Object.entries(PLATFORMS).filter(([k]) => fix.platforms[k] || k === 'html' || k === key).map(([k, label]) => h('option', { value: k, selected: k === key }, `${label}${k === detected ? ' (detected)' : ''}`)))
    body.replaceChildren(
      h('div', { class: 'bar-line' }, pick, entry.code ? copyBtn('Copy code', () => entry.code) : ''),
      key !== 'html' && !fix.platforms[key] ? h('p', { class: 'muted small' }, `Nothing specific to ${PLATFORMS[key]}; the plain HTML fix applies.`) : '',
      entry.steps ? h('p', { class: 'small' }, entry.steps) : '',
      entry.code ? h('pre', { class: 'code-block' }, entry.code) : '',
      /‹/.test(entry.code ?? '') ? h('p', { class: 'muted small' }, 'Replace every ‹placeholder› with your own value.') : '')
  }
  // Drawn when opened, so a platform picked on one issue applies to every issue opened after it.
  return h('details', { class: 'howto', ontoggle: (e) => { if (e.target.open) draw() } }, h('summary', {}, 'How to fix'), body)
}
