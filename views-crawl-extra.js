// Crawl › extras over a finished crawl: sitemap.xml, programmatic templates, parasite-SEO risk, Lighthouse on crawled
// pages and IndexNow submission.
import { indexNow, validIndexNowKey } from './apis.js'
import { hasCreds, loadKeys } from './keys.js'
import { sitemapXml } from './generators.js'
import { parasiteRisk, sitemapCandidates, templateProblems, templates } from './site-analysis.js'
import { h, block, btn, num, tag, download } from './ui.js'
import { lighthouseBatch } from './views-lighthouse.js'
import { note } from './views-data.js'

const short = (u, origin) => u.replace(origin, '') || '/'

function indexNowBlock(urls, changed, go) {
  const scope = h('select', { 'aria-label': 'Pages to submit' }, [['changed', `New or changed since the last crawl (${num(changed.length)})`], ['all', `Every indexable page (${num(urls.length)})`]].map(([v, l]) => h('option', { value: v }, l)))
  const out = h('div')
  const send = btn('Submit to IndexNow', async (e) => {
    const cfg = await loadKeys()
    if (!hasCreds(cfg, 'indexnow') || !validIndexNowKey(cfg.creds.indexnow.key)) { out.replaceChildren(note('Add your IndexNow key in Settings › Connectors › IndexNow, and host <key>.txt at the root of this site.'), btn('Open Settings', () => go('Settings'))); return }
    const list = scope.value === 'all' ? urls : changed
    if (!list.length) { out.replaceChildren(note('Nothing to submit.')); return }
    e.target.disabled = true
    try { const r = await indexNow(cfg.creds.indexnow.key, list); out.replaceChildren(h('p', { class: 'small' }, tag(r.ok ? 'good' : 'bad', r.ok ? 'Sent' : 'Refused'), ` ${r.message} ${num(r.count)} URLs · key file ${r.keyLocation}`)) } catch (x) { out.replaceChildren(note(`Could not reach IndexNow: ${x.message}`)) } finally { e.target.disabled = false }
  })
  return block('IndexNow', h('div', { class: 'bar-line' }, scope, send), note('Tells Bing, Yandex, Seznam, Naver and Yep the pages changed. Google doesn’t use IndexNow.'), out)
}

export function crawlExtras(saved, origin, { go }) {
  const pages = saved.result.pages
  const urls = sitemapCandidates(pages)
  const changed = saved.changes ? [...new Set([...saved.changes.added, ...saved.changes.titles.map((x) => x.url), ...saved.changes.status.map((x) => x.url)])].filter((u) => urls.includes(u)) : urls
  const groups = templates(pages).filter((t) => t.pages >= 8)
  const risky = parasiteRisk(pages)
  return [
    block(`Sitemap from this crawl (${num(urls.length)} URLs)`, h('div', { class: 'bar-line' }, btn('Download sitemap.xml', () => download('sitemap.xml', sitemapXml(urls), 'application/xml')),
      note('Indexable, self-canonical pages that answered 200. Upload it to the site root and list it in robots.txt; a partial crawl gives a partial sitemap.'))),
    block(`Programmatic page templates (${groups.length})`, groups.length ? h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['Template', 'Pages', 'Median words', 'Problems'].map((t) => h('th', {}, t)))),
      h('tbody', {}, groups.map((t) => { const p = templateProblems(t); return h('tr', {}, h('td', { class: 'mono small' }, t.template, h('div', { class: 'muted' }, t.examples.map((u) => short(u, origin)).join('  ·  '))), h('td', { class: 'mono' }, num(t.pages)), h('td', { class: 'mono' }, num(t.medianWords)), h('td', { class: 'small' }, p.length ? [tag('warn', 'Check'), ' ', p.join('; ')] : tag('good', 'Looks varied'))) }))))
      : note('No URL pattern with 8 or more pages that differ only by one segment.')),
    block(`Parasite-SEO risk (${risky.length})`, risky.length ? [h('p', { class: 'small' }, tag('warn', 'Check'), ' Sections with coupon, gambling, loan, CBD or similar pages. If third parties publish them to borrow your site’s reputation, Google’s site reputation abuse policy applies whatever your involvement.'),
      h('ul', { class: 'small' }, risky.map((s) => h('li', {}, h('b', {}, s.section), ` — ${s.risky.length} of ${s.pages} pages (${s.terms.join(', ')}): `, s.risky.slice(0, 3).map((r) => short(r.url, origin)).join(', '))))]
      : note('No section stands out for coupon, gambling, loan, CBD or similar third-party topics.')),
    lighthouseBatch(urls, { go }),
    indexNowBlock(urls, changed, go),
  ]
}
