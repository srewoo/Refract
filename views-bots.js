// "Bot's eye": what each crawler actually receives for this URL, next to what the browser rendered.
import { robotsAllows } from './analyze.js'
import { LENSES, runLenses } from './lens.js'
import { h, head, block, tag, btn, num, bars } from './ui.js'

const OUTCOME = { served: ['good', 'Served'], blocked: ['bad', 'Blocked'], unverified: ['warn', 'Unverified'] }
const HOSTS = { origins: ['<all_urls>'] }

export const BotsEye = {
  name: "Bot's eye",
  count: (d) => d.lenses?.filter((l) => l.outcome === 'blocked').length || null,
  render(d) {
    const path = new URL(d.url).pathname
    const out = h('div')
    const chart = h('div')
    const status = h('span', { class: 'muted small' })
    const draw = (rows) => {
      const served = rows.filter((r) => r.outcome === 'served')
      chart.replaceChildren(served.length ? block('Words received vs. your browser', bars([{ label: 'Your browser', value: d.wordCount }, ...served.map((r) => ({ label: r.name, value: r.words }))])) : '')
      out.replaceChildren(h('div', { class: 'scroll-x' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Crawler', 'Result', 'HTTP', 'robots.txt', 'Title matches', 'Words', 'Time'].map((t) => h('th', {}, t)))),
        h('tbody', {}, Object.keys(LENSES).map((name) => {
          const r = rows.find((x) => x.name === name)
          const rb = robotsAllows(d.robotsTxt, name.split(' ')[0], path)
          if (!r) return h('tr', {}, h('td', { class: 'mono' }, name), h('td', { colspan: 6, class: 'muted' }, rows.length ? 'waiting…' : '—'))
          const [st, label] = OUTCOME[r.outcome]
          return h('tr', {},
            h('td', { class: 'mono' }, name),
            h('td', {}, tag(st, label), r.detail ? h('div', { class: 'muted small' }, r.detail) : ''),
            h('td', { class: 'mono nowrap' }, r.status ?? '—'),
            h('td', {}, tag(rb ? 'good' : 'bad', rb ? 'Allowed' : 'Disallowed'), !rb && r.outcome === 'served' ? h('div', { class: 'muted small' }, 'compliant bots won’t fetch; the server doesn’t enforce it') : '', rb && r.outcome === 'blocked' ? h('div', { class: 'muted small' }, 'robots allows it, the server/CDN blocks it') : ''),
            h('td', {}, r.outcome !== 'served' ? '—' : r.title === d.title ? tag('good', 'Same') : tag('warn', r.title ? 'Differs' : 'None'), r.outcome === 'served' && r.title !== d.title ? h('div', { class: 'muted small' }, r.title || '(empty)') : ''),
            h('td', { class: 'mono nowrap' }, r.words != null ? `${num(r.words)}${d.wordCount ? ` (${Math.round((r.words / d.wordCount) * 100)}%)` : ''}` : '—'),
            h('td', { class: 'mono nowrap' }, r.ms != null ? `${r.ms} ms` : '—'))
        })))))
    }
    const run = btn('Fetch as crawlers', async (e) => {
      // request() first, inside the click: any earlier await would lose the user gesture.
      if (!(await chrome.permissions.request(HOSTS))) { status.textContent = 'Site access is needed to fetch the page as a crawler.'; return }
      e.target.disabled = true
      status.textContent = `Fetching ${Object.keys(LENSES).length} crawlers one at a time, without cookies…`
      d.lenses = await runLenses(d.url, (_, all) => draw(all))
      status.textContent = `Done. ${d.lenses.filter((l) => l.outcome === 'blocked').length} blocked.`
      e.target.disabled = false
    })
    draw(d.lenses ?? [])
    return [
      head("Bot's eye", 'Fetches this URL the way each crawler does: its User-Agent, no cookies, no JavaScript. Catches CDNs and firewalls that block AI bots even when robots.txt allows them.', run),
      status, chart, out,
      h('p', { class: 'muted small' }, 'Anonymous fetches: pages behind a login show as Unverified. Server-side bot detection that also checks IP ranges (not just User-Agent) can treat these requests differently from the real crawler.'),
    ]
  },
}
