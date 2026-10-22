// Keyword research › content brief: audit the pages ranking for a keyword (Google's top results via DataForSEO, or URLs
// you paste) in a background tab, then summarise what they cover. Uses your browser session for those pages, like Compare.
import { contentBrief } from './generators.js'
import { MARKETS, hasCreds, loadKeys } from './keys.js'
import { API } from './providers.js'
import { withWorkerTab } from './render.js'
import { audit, phraseGaps } from './views-compare.js'
import { h, block, btn, copyBtn, download } from './ui.js'
import { failBox, note } from './views-data.js'

export function contentBriefBlock(d, saved, go) {
  const kw = h('input', { class: 'url-input', placeholder: 'Keyword the page should rank for', 'aria-label': 'Brief keyword', list: 'brief-saved' })
  const options = h('datalist', { id: 'brief-saved' })
  const urls = h('textarea', { rows: 3, class: 'kw-input', 'aria-label': 'Competitor URLs, one per line', placeholder: 'Ranking pages to learn from, one per line (or fetch Google’s top results)' })
  const out = h('div')
  const fetchTop = btn('Fetch top results', async (e) => {
    const cfg = await loadKeys()
    if (!kw.value.trim()) { kw.focus(); return }
    if (!hasCreds(cfg, 'dataforseo')) { out.replaceChildren(note('Fetching Google’s top results uses DataForSEO (about $0.002). Or paste URLs instead.'), btn('Open Settings', () => go('Settings'))); return }
    e.target.disabled = true
    try { const r = await API.dataforseo.serpTop(cfg.creds.dataforseo, kw.value.trim(), MARKETS[cfg.market]); urls.value = r.urls.filter((u) => !u.includes(new URL(d.url).hostname)).slice(0, 5).join('\n') } catch (x) { out.replaceChildren(failBox(x)) } finally { e.target.disabled = false }
  })
  const build = btn('Build brief', async (e) => {
    const list = [...new Set(urls.value.split('\n').map((x) => x.trim()).filter((x) => /^https?:\/\//.test(x)))].slice(0, 6)
    if (!kw.value.trim() || !list.length) { out.replaceChildren(note('Enter a keyword and at least one competitor URL.')); return }
    if (!(await chrome.permissions.request({ origins: ['<all_urls>'] }))) { out.replaceChildren(note('Site access is needed to open the competitor pages.')); return }
    e.target.disabled = true
    const pages = []
    try {
      await withWorkerTab(async (tabId) => {
        for (const [i, u] of list.entries()) {
          out.replaceChildren(note(`Reading ${i + 1} of ${list.length}: ${u}`))
          try { const p = await audit(tabId, u); pages.push({ url: u, title: p.title, words: p.wordCount, headings: p.headings, schemaTypes: p.schema?.types ?? [], words_: p.words }) } catch (x) { pages.push({ url: u, error: x.message }) }
        }
      })
      const ok = pages.filter((p) => !p.error)
      const gaps = ok.length ? phraseGaps(d, ok.map((p) => ({ words: p.words_ }))) : []
      const text = contentBrief(kw.value.trim(), ok, gaps)
      out.replaceChildren(h('div', { class: 'bar-line' }, copyBtn('Copy brief', () => text), btn('Download .md', () => download(`brief-${kw.value.trim().replace(/\W+/g, '-')}.md`, text, 'text/markdown'))),
        pages.some((p) => p.error) ? note(`Couldn’t read: ${pages.filter((p) => p.error).map((p) => p.url).join(', ')}`) : '', h('pre', { class: 'code-out' }, text))
    } catch (x) { out.replaceChildren(failBox(x)) } finally { e.target.disabled = false }
  }, { class: 'btn primary' })
  options.replaceChildren(...Object.keys(saved.saved()).slice(0, 200).map((k) => h('option', { value: k })))
  kw.addEventListener('focus', () => options.replaceChildren(...Object.keys(saved.saved()).slice(0, 200).map((k) => h('option', { value: k }))))
  return block('Content brief', h('div', { class: 'bar-line' }, kw, fetchTop), options, urls, h('div', { class: 'bar-line' }, build, note('Opens each page in a background tab (with your browser session), like Compare. Terms are compared with the page you have open.')), out)
}
