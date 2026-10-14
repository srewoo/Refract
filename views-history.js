// History: what changed on this URL between audits.
import { diffSnapshots, loadSnapshots } from './history.js'
import { h, head, block, tag, lineChart } from './ui.js'

const show = (v) => (v === '' || v == null ? h('span', { class: 'muted' }, '(empty)') : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v))
const when = (iso) => iso.slice(0, 16).replace('T', ' ')

export const History = {
  render(d) {
    const out = h('div', {}, h('p', { class: 'muted small' }, 'Loading snapshots…'))
    loadSnapshots(d.url).then((list) => {
      if (list.length < 2) { out.replaceChildren(h('p', { class: 'empty' }, `${list.length} snapshot so far. Refract SEO saves one each time you audit this URL (at most hourly when nothing changed); come back after the page changes or in a few days.`)); return }
      const latest = list.at(-1)
      // Default comparison: the snapshot closest to 30 days ago, else the oldest.
      const target = Date.parse(latest.at) - 30 * 864e5
      const def = list.slice(0, -1).reduce((best, s, i) => (Math.abs(Date.parse(s.at) - target) < Math.abs(Date.parse(list[best].at) - target) ? i : best), 0)
      const diffOut = h('div')
      const draw = (i) => {
        const r = diffSnapshots(list[i], latest)
        diffOut.replaceChildren(
          r.changes.length ? h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['Field', when(list[i].at), when(latest.at)].map((t) => h('th', {}, t)))),
            h('tbody', {}, r.changes.map((c) => h('tr', {}, h('td', {}, c.label), h('td', { class: 'was' }, show(c.before)), h('td', { class: 'now' }, show(c.after))))))) : h('p', { class: 'muted' }, 'No tracked field changed.'),
          h('div', { class: 'split' },
            block(`New issues (${r.added.length})`, r.added.length ? h('ul', { class: 'checks' }, r.added.map((t) => h('li', {}, tag('bad', 'New'), t))) : h('p', { class: 'muted small' }, 'None.')),
            block(`Resolved (${r.resolved.length})`, r.resolved.length ? h('ul', { class: 'checks' }, r.resolved.map((t) => h('li', {}, tag('good', 'Fixed'), t))) : h('p', { class: 'muted small' }, 'None.'))))
      }
      const pick = h('select', { 'aria-label': 'Compare latest with', onchange: (e) => draw(Number(e.target.value)) }, list.slice(0, -1).map((s, i) => h('option', { value: i, selected: i === def }, `${when(s.at)} · health ${s.health}`)).reverse())
      draw(def)
      const series = (k, label) => lineChart(list.map((s) => ({ date: s.at.slice(0, 10), value: s[k] })), { label, height: 120, fmt: (v) => String(Math.round(v)) })
      out.replaceChildren(
        h('div', { class: 'split' }, block('Health score', series('health', 'Health')), block('AI readiness', series('ai', 'AI readiness'))),
        block('Compare latest with', pick, diffOut))
    })
    return [head('History', 'Snapshots of this URL saved on each audit, kept on this computer. See what changed and which issues appeared or were fixed.'), out]
  },
}
