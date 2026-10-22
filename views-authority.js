// Competitors › authority: Open PageRank (free key) for this domain and every stored competitor, side by side.
// Latest result per domain is kept in `opr:<domain>`.
import { openPageRank } from './apis.js'
import { hasCreds, loadKeys } from './keys.js'
import { h, block, btn, num } from './ui.js'
import { failBox, note } from './views-data.js'

export function authorityBlock(domain, st, go) {
  const out = h('div')
  const k = `opr:${domain}`
  const view = (r) => h('div', {}, h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['Domain', 'Open PageRank (0–10)', 'Global rank', 'Referring domains'].map((t) => h('th', {}, t)))),
    h('tbody', {}, r.rows.map((x) => h('tr', {}, h('td', {}, x.domain === domain ? h('b', {}, `${x.domain} (you)`) : x.domain), h('td', { class: 'mono' }, x.found ? x.pageRank ?? '—' : 'not found'), h('td', { class: 'mono' }, num(x.rank)), h('td', { class: 'mono' }, num(x.refDomains))))))),
    note(`Open PageRank from Common Crawl link data (via Keywords Everywhere)${r.asOf ? `, as of ${r.asOf}` : ''}; checked ${r.at.slice(0, 10)}. A free, rough authority signal: compare within one source, not against Moz or Ahrefs numbers.`))
  const run = btn('Check authority', async (e) => {
    const cfg = await loadKeys()
    if (!hasCreds(cfg, 'openpagerank')) { out.replaceChildren(note('Needs a free Open PageRank key (Settings › Connectors › Open PageRank).'), btn('Open Settings', () => go('Settings'))); return }
    e.target.disabled = true
    try {
      const r = { ...(await openPageRank(cfg.creds.openpagerank.key, [domain, ...st.list])), at: new Date().toISOString() }
      r.rows.sort((a, b) => (b.pageRank ?? -1) - (a.pageRank ?? -1))
      await chrome.storage.local.set({ [k]: r })
      out.replaceChildren(view(r))
    } catch (x) { out.replaceChildren(failBox(x)) } finally { e.target.disabled = false }
  })
  chrome.storage.local.get(k).then((v) => { if (v[k]) out.replaceChildren(view(v[k])) })
  return block('Authority (free)', h('div', { class: 'bar-line' }, run, note('One request covers you and every competitor (up to 100 domains).')), out)
}
