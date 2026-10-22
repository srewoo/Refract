// Generators shown inside existing views: JSON-LD templates (Schema), hreflang set builder (Hreflang) and the
// expired-domain heritage check (Domain).
import { SCHEMA_TEMPLATES, hreflangSet, schemaTemplate } from './generators.js'
import { topicShift } from './site-analysis.js'
import { h, block, btn, tag, copyBtn } from './ui.js'
import { note } from './views-data.js'

/** Schema › templates from this page's data, no AI needed. Retired rich-result types are not offered. */
export function schemaTemplatesBlock(d) {
  const type = h('select', { 'aria-label': 'Schema template', onchange: () => draw() }, SCHEMA_TEMPLATES.map((t) => h('option', { value: t }, t)))
  const pre = h('pre', { class: 'code-out' })
  const draw = () => { pre.textContent = schemaTemplate(type.value, d) }
  draw()
  return block('JSON-LD template', h('div', { class: 'bar-line' }, type, copyBtn('Copy', () => pre.textContent)),
    note('Filled from this page; replace every ‹…› before publishing, then check it with the Rich Results Test. FAQPage, HowTo and other retired rich-result types are left out on purpose.'), pre)
}

/** Hreflang › build a full set: one row per language version, plus x-default. */
export function hreflangBuilder(d) {
  const start = d.hreflang.length ? d.hreflang.map((x) => `${x.lang} ${x.href}`).join('\n') : `${(d.lang || 'en').toLowerCase()} ${d.url.replace(/#.*/, '')}\nx-default ${new URL(d.url).origin}/`
  const area = h('textarea', { rows: 5, class: 'kw-input', 'aria-label': 'Language versions, one per line: code URL', oninput: () => draw() }); area.value = start
  const out = h('div')
  const draw = () => {
    const r = hreflangSet(area.value.split('\n').map((l) => l.trim().split(/\s+/)).filter((p) => p.length >= 2).map(([lang, url]) => ({ lang, url })))
    out.replaceChildren(r.problems.length ? h('ul', { class: 'checks' }, r.problems.map((p) => h('li', {}, tag('warn', 'Check'), p))) : h('p', { class: 'small' }, tag('good', 'Pass'), ' Codes valid, URLs absolute, x-default present.'),
      h('h3', {}, 'In <head> of every version'), h('div', { class: 'bar-line' }, copyBtn('Copy tags', () => r.tags)), h('pre', { class: 'code-out' }, r.tags),
      h('h3', {}, 'Or in the sitemap'), h('div', { class: 'bar-line' }, copyBtn('Copy sitemap XML', () => r.sitemap)), h('pre', { class: 'code-out' }, r.sitemap))
  }
  draw()
  return block('Build an hreflang set', note('One line per language version: code, a space, the absolute URL. Every version must carry the same full set, including itself.'), area, out)
}

const titleOf = (html) => { const doc = new DOMParser().parseFromString(html, 'text/html'); return { title: doc.querySelector('title')?.textContent.trim() ?? '', description: doc.querySelector('meta[name="description" i]')?.getAttribute('content') ?? '' } }
/** Domain › what the site was about when first archived, compared with today (Wayback Machine, free). */
export function heritageBlock(d) {
  const out = h('div')
  const run = btn('Compare with the first archived version', async (e) => {
    if (!(await chrome.permissions.request({ origins: ['https://web.archive.org/*'] }))) { out.replaceChildren(note('Refract needs access to web.archive.org to read the archived page.')); return }
    e.target.disabled = true; out.replaceChildren(note('Reading the Wayback Machine…'))
    try {
      const host = d.host.replace(/^www\./, '')
      const cdx = await (await fetch(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(host)}&limit=1&output=json&fl=timestamp,original&filter=statuscode:200&filter=mimetype:text/html`)).json()
      const [ts, original] = cdx[1] ?? []
      if (!ts) { out.replaceChildren(note('The Wayback Machine has no archived home page for this domain.')); return }
      const then = titleOf(await (await fetch(`https://web.archive.org/web/${ts}id_/${original}`)).text())
      const now = { title: d.title, description: d.description }
      const s = topicShift(then, now)
      const when = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`
      out.replaceChildren(
        h('p', { class: 'small' }, tag(s.shift ? 'warn' : 'good', s.shift ? 'Topic changed' : 'Same topic'), s.shift ? ' The first archived site was about something else. If the domain was bought for its old links, Google’s expired-domain abuse policy can apply; a genuine rebrand is fine.' : ` Shared words: ${s.shared.slice(0, 8).join(', ') || '—'}.`),
        h('dl', { class: 'kv' }, h('dt', {}, `First archived (${when})`), h('dd', {}, then.title || '(no title)', then.description ? h('div', { class: 'muted small' }, then.description) : ''), h('dt', {}, 'Today'), h('dd', {}, now.title || '(no title)')),
        note(`Source: web.archive.org snapshot ${ts}. One early snapshot, so a short-lived parked page can mislead; open the archive to check.`))
    } catch (x) { out.replaceChildren(note(`Wayback Machine lookup failed: ${x.message}. It rate-limits; try again in a minute.`)) } finally { e.target.disabled = false }
  })
  return block('Domain heritage', h('div', { class: 'bar-line' }, run), out)
}
