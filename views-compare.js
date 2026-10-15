// Compare: run the full audit on 1–2 competitor URLs in a background tab and line them up with this page.
import { density, linkStats } from './analyze.js'
import { band, geo, health } from './geo.js'
import { probeGlobals } from './probe.js'
import { loadIn, withWorkerTab } from './render.js'
import { stack } from './rules.js'
import { h, head, block, tag, btn, num } from './ui.js'

const HOSTS = { origins: ['<all_urls>'] }

async function audit(tabId, url) {
  await loadIn(tabId, url, { settleMs: 1200 })
  const [{ result: d }] = await chrome.scripting.executeScript({ target: { tabId }, files: ['collect.js'] })
  const [{ result: g }] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: probeGlobals }).catch(() => [{ result: {} }])
  return { ...d, globals: g, titlePx: null }
}

/** Pure: comparable rows. Each row: [label, valueFn, statusFn?]. */
export function compareRows() {
  const len = (s, lo, hi) => { const n = s?.length ?? 0; return n === 0 ? 'bad' : n < lo || n > hi ? 'warn' : 'good' }
  return [
    ['Health score', (d) => health(d).score, (d) => band(health(d).score).status],
    ['AI readiness', (d) => geo(d).score, (d) => band(geo(d).score).status],
    ['HTTP status', (d) => d.status ?? '—', (d) => (d.status && d.status < 300 ? 'good' : 'bad')],
    ['Indexable', (d) => (d.indexable ? 'yes' : 'no'), (d) => (d.indexable ? 'good' : 'bad')],
    ['Title', (d) => `${d.title.length} ch · ${d.title}`, (d) => len(d.title, 30, 60)],
    ['Description', (d) => `${d.description?.length ?? 0} ch`, (d) => len(d.description, 70, 160)],
    ['H1', (d) => d.headings.filter((x) => x.level === 1).map((x) => x.text).join(' | ') || '—', (d) => (d.headings.filter((x) => x.level === 1).length === 1 ? 'good' : 'warn')],
    ['Words', (d) => num(d.wordCount)],
    ['Headings (H2/H3)', (d) => `${d.headings.filter((x) => x.level === 2).length} / ${d.headings.filter((x) => x.level === 3).length}`],
    ['Internal / external links', (d) => { const s = linkStats(d.links); return `${s.internal} / ${s.external}` }],
    ['Images missing alt', (d) => `${d.images.filter((i) => i.alt === null).length} of ${d.images.length}`, (d) => (d.images.some((i) => i.alt === null) ? 'warn' : 'good')],
    ['Schema types', (d) => d.schema.types.join(', ') || '—', (d) => (d.schema.types.length ? 'good' : 'warn')],
    ['Open Graph image', (d) => (d.social['og:image'] ? 'yes' : 'no'), (d) => (d.social['og:image'] ? 'good' : 'warn')],
    ['Hreflang alternates', (d) => d.hreflang.length],
    ['Server-rendered text', (d) => (d.rawTextChars == null || !d.renderedTextChars ? '—' : `${Math.round(Math.min(1, d.rawTextChars / d.renderedTextChars) * 100)}%`)],
    ['Stack', (d) => stack(d.fw, d.globals).label],
  ]
}

/** Pure: shared vs competitor-only two-word phrases. */
export function phraseGaps(me, others) {
  const top = (d) => new Set(density(d.words, 2, 30).map((r) => r.term))
  const mine = top(me)
  const theirs = others.map(top)
  const union = new Set(theirs.flatMap((s) => [...s]))
  return { shared: [...mine].filter((p) => union.has(p)), gaps: [...union].filter((p) => !mine.has(p) && theirs.filter((s) => s.has(p)).length >= Math.min(2, theirs.length)) }
}

export const Compare = {
  render(d) {
    const inputs = [0, 1].map((i) => h('input', { type: 'url', placeholder: i ? 'Second competitor (optional)' : 'https://competitor.com/their-page', 'aria-label': `Competitor URL ${i + 1}`, class: 'url-input' }))
    const out = h('div')
    const status = h('p', { class: 'muted small' })
    const go = btn('Compare', async (e) => {
      const urls = inputs.map((x) => x.value.trim()).filter(Boolean)
      try { urls.forEach((u) => new URL(u)) } catch { status.textContent = 'Enter full URLs starting with https://'; return }
      if (!urls.length) { status.textContent = 'Enter at least one competitor URL.'; return }
      if (!(await chrome.permissions.request(HOSTS))) { status.textContent = 'Site access is needed to open competitor pages.'; return }
      e.target.disabled = true
      const results = []
      try {
        await withWorkerTab(async (tabId) => {
          for (const u of urls) { status.textContent = `Auditing ${u} in a background tab…`; results.push(await audit(tabId, u).catch((err) => ({ error: err.message, url: u }))) }
        })
        status.textContent = ''
        const cols = [{ ...d, label: 'This page' }, ...results.map((r, i) => ({ ...r, label: `Competitor ${i + 1}` }))]
        const ok = cols.filter((c) => !c.error)
        const gaps = phraseGaps(d, ok.slice(1))
        if (ok.length > 1) chrome.storage.local.set({ [`gaps:${d.url.replace(/#.*/, '')}`]: { at: new Date().toISOString(), gaps: gaps.gaps, competitors: ok.slice(1).map((c) => c.url) } }) // read by Opportunities
        out.replaceChildren(
          h('div', { class: 'scroll-x' }, h('table', { class: 'compare' },
            h('thead', {}, h('tr', {}, h('th', {}, ''), cols.map((c) => h('th', {}, c.label, h('div', { class: 'mono small' }, new URL(c.url).host))))),
            h('tbody', {}, compareRows().map(([label, val, st]) => h('tr', {}, h('th', {}, label), cols.map((c) => h('td', {}, c.error ? (label === 'Health score' ? `Failed: ${c.error}` : '') : [st ? tag(st(c), '') : '', ' ', String(val(c))]))))))),
          h('div', { class: 'split' },
            block(`Phrases you share (${gaps.shared.length})`, gaps.shared.length ? h('ul', { class: 'chips' }, gaps.shared.map((p) => h('li', {}, p))) : h('p', { class: 'muted small' }, 'None of the top phrases overlap.')),
            block(`Competitors use, you don’t (${gaps.gaps.length})`, gaps.gaps.length ? h('ul', { class: 'chips' }, gaps.gaps.map((p) => h('li', {}, p))) : h('p', { class: 'muted small' }, 'No gaps in the top phrases.'))),
          h('p', { class: 'muted small' }, 'Competitor pages are loaded in a background tab with your browser session, then closed. Lab speed is not compared: background tabs are throttled. Use Speed › Field data for real-user numbers.'))
      } finally { e.target.disabled = false }
    }, { class: 'btn primary' })
    return [head('Compare', 'Audit up to two competitor pages and line them up with this one.', go), h('div', { class: 'compare-inputs' }, inputs), status, out]
  },
}
