// UI glue for the Chrome AI suggestions: one button per task, results re-measured by our own code.
import { DESC_RANGE, TITLE_RANGE, lengthStatus } from './analyze.js'
import { draftJsonLd, explainIssue, session, suggestAlt, suggestDescriptions, suggestTitles } from './ai.js'
import { SERP_TITLE_PX } from './rules.js'
import { h, tag, btn, copyBtn } from './ui.js'

const STATUS_MSG = {
  unsupported: 'Chrome’s built-in AI is not available in this browser (needs Chrome 138+ with the Prompt API).',
  unavailable: 'Chrome’s built-in AI is not supported on this device (hardware or storage requirements).',
}
export const aiReady = (d) => ['available', 'downloadable', 'downloading'].includes(d.ai)

/** A "Suggest" button that runs `task`, shows progress (incl. first-time model download) and renders the result. */
export function aiAction(d, label, task, render) {
  const out = h('div', { class: 'ai-out' })
  const run = btn(label, async (e) => {
    if (!aiReady(d)) { out.replaceChildren(h('p', { class: 'muted small' }, STATUS_MSG[d.ai] ?? 'AI unavailable.')); return }
    e.target.disabled = true
    out.replaceChildren(h('p', { class: 'muted small' }, d.ai === 'available' ? 'Thinking on-device…' : 'Downloading Chrome’s model (one time)…'))
    try {
      await session((p) => out.replaceChildren(h('p', { class: 'muted small' }, `Downloading Chrome’s model: ${Math.round(p * 100)}%`)))
      d.ai = 'available'
      out.replaceChildren(render(await task()))
    } catch (err) {
      out.replaceChildren(h('p', { class: 'muted small' }, `The model could not answer: ${err.message ?? err}`))
    } finally { e.target.disabled = false }
  }, { class: 'btn ai' })
  return h('div', { class: 'ai-action' }, run, out)
}

const rejectedNote = (r) => (r.rejected.length ? h('p', { class: 'muted small' }, `${r.rejected.length} suggestion${r.rejected.length > 1 ? 's' : ''} dropped for stating numbers not on the page.`) : '')

function measurePx(text) {
  const ctx = document.createElement('canvas').getContext('2d')
  ctx.font = '400 20px Arial, Helvetica, sans-serif'
  return Math.round(ctx.measureText(text).width)
}

export const titleSuggest = (d) => aiAction(d, 'Suggest titles', () => suggestTitles(d), (r) => h('div', {},
  h('ul', { class: 'suggest' }, r.kept.map((t) => {
    const s = lengthStatus(t, TITLE_RANGE)
    const px = measurePx(t)
    return h('li', {}, h('span', {}, t), h('span', { class: 'mono small' }, `${s.len} ch · ${px}px`), tag(s.status === 'good' && px <= SERP_TITLE_PX ? 'good' : 'warn', px > SERP_TITLE_PX ? 'Too wide' : s.status === 'good' ? 'Fits' : 'Length'), copyBtn('Copy', () => t))
  })), rejectedNote(r)))

export const descSuggest = (d) => aiAction(d, 'Suggest descriptions', () => suggestDescriptions(d), (r) => h('div', {},
  h('ul', { class: 'suggest' }, r.kept.map((t) => {
    const s = lengthStatus(t, DESC_RANGE)
    return h('li', {}, h('span', {}, t), h('span', { class: 'mono small' }, `${s.len} ch`), tag(s.status, s.status === 'good' ? 'Fits' : 'Length'), copyBtn('Copy', () => t))
  })), rejectedNote(r)))

export const altSuggest = (d, img) => aiAction(d, 'Suggest alt', () => suggestAlt(img, d), (r) => h('div', {},
  r.kept[0] ? h('div', { class: 'suggest-one' }, h('code', {}, `alt="${r.kept[0].replace(/"/g, '&quot;')}"`), copyBtn('Copy', () => r.kept[0])) : '', rejectedNote(r)))

export const explainBtn = (d, issue) => aiAction(d, 'Explain', () => explainIssue(issue, d), (r) => h('div', {}, r.kept[0] ? h('p', { class: 'ai-text' }, r.kept[0]) : '', rejectedNote(r)))

export function jsonLdDraft(d) {
  const type = h('select', { 'aria-label': 'Schema type' }, ['Article', 'BlogPosting', 'Product', 'Organization', 'LocalBusiness', 'Event', 'Recipe', 'VideoObject'].map((t) => h('option', { value: t, selected: t === guessType(d) }, t)))
  return h('div', { class: 'bar-line' }, type, aiAction(d, 'Draft JSON-LD', () => draftJsonLd(d, type.value), (r) => h('div', {},
    r.invented.length ? h('p', { class: 'small' }, tag('warn', 'Check'), ` Contains values not found on the page: ${r.invented.join(', ')}. Verify before publishing.`) : '',
    r.missing.length ? h('p', { class: 'muted small' }, `Not filled (no data on the page): ${r.missing.map((k) => k.replace(/\|/g, ' or ')).join(', ')}`) : '',
    h('pre', { class: 'code-block' }, `<script type="application/ld+json">\n${r.text}\n</script>`),
    copyBtn('Copy snippet', () => `<script type="application/ld+json">\n${r.text}\n</script>`))))
}
const guessType = (d) => (d.tags?.adsense?.length || d.structure?.published ? 'Article' : /product|shop|buy/i.test(d.url) ? 'Product' : 'Organization')
