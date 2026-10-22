// Search Console › Google Analytics 4: Organic Search landing pages, last 28 days vs the 28 before (read-only sign-in),
// and Bing Webmaster › IndexNow for this page.
import { GA4_PERMS, ga4Connected, ga4Organic, ga4Properties, ga4SignIn, indexNow, validIndexNowKey } from './apis.js'
import { hasCreds, loadKeys } from './keys.js'
import { oauthProblem } from './gsc.js'
import { h, block, btn, num, tag } from './ui.js'
import { failBox, note } from './views-data.js'

const delta = (cur, prev) => (prev == null ? '' : cur === prev ? ' (=)' : ` (${cur > prev ? '+' : ''}${num(cur - prev)})`)
export function ga4Block(d) {
  const host = d.host.replace(/^www\./, '')
  const k = `ga4prop:${host}`
  const out = h('div', {}, note('Checking Google Analytics connection…'))
  const table = (rows, prop) => {
    const page = new URL(d.url).pathname
    const mine = rows.find((r) => r.page.split('?')[0] === page)
    return h('div', {},
      mine ? h('p', { class: 'small' }, tag('good', 'This page'), ` ${num(mine.cur.sessions)} organic sessions${delta(mine.cur.sessions, mine.prev?.sessions)}, ${num(mine.cur.engagedSessions)} engaged, ${num(mine.cur.keyEvents)} key events in 28 days.`) : note(`This page isn’t among the top ${rows.length} organic landing pages.`),
      h('div', { class: 'scroll-x crawl-list' }, h('table', {}, h('thead', {}, h('tr', {}, ['Landing page', 'Sessions', 'Engaged', 'Key events'].map((t) => h('th', {}, t)))),
        h('tbody', {}, rows.map((r) => h('tr', {}, h('td', { class: 'mono small' }, r.page), h('td', { class: 'mono nowrap' }, `${num(r.cur.sessions)}${delta(r.cur.sessions, r.prev?.sessions)}`), h('td', { class: 'mono' }, num(r.cur.engagedSessions)), h('td', { class: 'mono' }, num(r.cur.keyEvents))))))),
      note(`GA4 ${prop} · Organic Search channel · last 28 days (vs the 28 before in brackets). Analytics counts sessions; Search Console counts clicks, so they differ.`))
  }
  const load = async () => {
    if (!(await ga4Connected())) {
      const problem = await oauthProblem()
      out.replaceChildren(note(problem ?? 'Connect Google Analytics (read-only) to see organic landing pages.'), problem ? '' : btn('Connect Google Analytics', async (e) => {
        if (!(await chrome.permissions.request(GA4_PERMS))) return
        e.target.disabled = true
        try { await ga4SignIn(); load() } catch (x) { out.replaceChildren(failBox(x)) }
      }))
      return
    }
    try {
      const props = await ga4Properties()
      if (!props.length) { out.replaceChildren(note('This Google account can’t see any GA4 property.')); return }
      const saved = (await chrome.storage.local.get(k))[k]
      const pick = h('select', { 'aria-label': 'GA4 property' }, props.map((p) => h('option', { value: p.id, selected: p.id === saved }, `${p.name} · ${p.account}`)))
      const res = h('div')
      const run = btn('Load organic landing pages', async (e) => {
        e.target.disabled = true; res.replaceChildren(note('Asking Google Analytics…'))
        await chrome.storage.local.set({ [k]: pick.value })
        try { res.replaceChildren(table(await ga4Organic(pick.value), pick.value)) } catch (x) { res.replaceChildren(failBox(x)) } finally { e.target.disabled = false }
      }, { class: 'btn primary' })
      out.replaceChildren(h('div', { class: 'bar-line' }, pick, run), note('Pick the property that tracks this site; Refract remembers it per domain.'), res)
    } catch (x) { out.replaceChildren(failBox(x)) }
  }
  load()
  return block('Google Analytics 4 · organic landing pages', out)
}

export function indexNowPageBlock(d, { go }) {
  const out = h('div')
  const send = btn('Submit this page to IndexNow', async (e) => {
    const cfg = await loadKeys()
    if (!hasCreds(cfg, 'indexnow') || !validIndexNowKey(cfg.creds.indexnow.key)) { out.replaceChildren(note('Add your IndexNow key in Settings › Connectors › IndexNow, and host <key>.txt at the site root.'), btn('Open Settings', () => go('Settings'))); return }
    e.target.disabled = true
    try { const r = await indexNow(cfg.creds.indexnow.key, [d.url.replace(/#.*/, '')]); out.replaceChildren(h('p', { class: 'small' }, tag(r.ok ? 'good' : 'bad', r.ok ? 'Sent' : 'Refused'), ` ${r.message} Key file: ${r.keyLocation}`)) } catch (x) { out.replaceChildren(note(`Could not reach IndexNow: ${x.message}`)) } finally { e.target.disabled = false }
  })
  return block('IndexNow', h('div', { class: 'bar-line' }, send, note('Tells Bing and other IndexNow engines this page changed. To submit many pages, use Crawl › IndexNow.')), out)
}
