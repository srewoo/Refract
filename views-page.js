// Page-level views: Overview, Issues, AI search (GEO), Content, Keywords, Speed.
import { density, sitemapsFrom, toCsv, TITLE_RANGE, DESC_RANGE } from './analyze.js'
import { band, geo, health, outline, placement } from './geo.js'
import { overlay } from './page-actions.js'
import { cruxBlock, keywordMetricsBlock } from './views-data.js'
import { aiReady, descSuggest, explainBtn, titleSuggest } from './ai-ui.js'
import { buildReport } from './report.js'
import { stack, SERP_TITLE_PX } from './rules.js'
import { h, head, block, kv, tag, btn, ext, ms, num, ring, lengthMeter, bars, timeline, tree, chain, copyBtn, download } from './ui.js'

export const Overview = {
  count: (d) => health(d).bad || null,
  render(d, { go }) {
    const hl = health(d)
    const b = band(hl.score)
    const robots = sitemapsFrom(d.robotsTxt)
    const xr = d.headers['x-robots-tag'] ?? ''
    return [
      head('Page health', hl.list.length ? `${hl.bad} to fix, ${hl.warn} to check before this page ranks well.` : 'Nothing on this page needs fixing.', reportBtn(d)),
      h('div', { class: 'split' },
        h('div', { class: 'score-card' }, ring(hl.score, b.status, { label: 'Health' }),
          h('div', {}, h('div', { class: 'grade' }, `Grade ${b.grade}`), h('div', { class: 'muted' }, `${hl.bad} fix · ${hl.warn} check`), btn('All issues', () => go('Issues')))),
        block('Fix first', hl.list.length ? h('ol', { class: 'fixlist' }, hl.list.slice(0, 5).map((i) => h('li', {}, tag(i.level), h('button', { class: 'link', type: 'button', onclick: () => go(i.section) }, i.msg))))
          : h('p', { class: 'muted' }, 'No issues found.'))),
      block('Can Google index this URL?', chain([
        { label: 'HTTP status', value: d.status ?? 'unknown', status: d.status == null ? 'warn' : d.status < 300 ? 'good' : 'bad' },
        { label: 'Meta robots', value: d.robots ?? 'not set', status: /noindex/i.test(d.robots ?? '') ? 'bad' : 'good' },
        { label: 'X-Robots-Tag', value: xr || 'not set', status: /noindex/i.test(xr) ? 'bad' : 'good' },
        { label: 'Canonical', value: d.canonical ? (d.canonicalSelf ? 'self' : 'other URL') : 'missing', status: !d.canonical ? 'warn' : d.canonicalSelf ? 'good' : 'warn' },
        { label: 'Result', value: d.indexable ? 'indexable' : 'blocked', status: d.indexable ? 'good' : 'bad' },
      ])),
      block('Search snippet',
        h('div', { class: 'serp' }, h('div', { class: 'serp-site' }, h('img', { src: d.favicon, alt: '', width: 16, height: 16, onerror: (e) => { e.target.style.visibility = 'hidden' } }), h('span', { class: 'mono' }, d.url)),
          h('div', { class: 'serp-title' }, d.title || '(no title)'), h('div', { class: 'serp-desc' }, d.description ?? '(no meta description, Google will pick page text)')),
        h('div', { class: 'meters' }, h('div', {}, h('h3', {}, 'Title'), lengthMeter(d.title.length, TITLE_RANGE), d.titlePx != null ? h('div', { class: 'muted small' }, `${d.titlePx}px of ~${SERP_TITLE_PX}px Google shows`) : '', aiReady(d) ? titleSuggest(d) : ''), h('div', {}, h('h3', {}, 'Description'), lengthMeter(d.description?.length ?? 0, DESC_RANGE), aiReady(d) ? descSuggest(d) : ''))),
      block('Meta', kv([
        ['Stack', stack(d.fw, d.globals).label],
        ['Canonical', d.canonical && ext(d.canonical)],
        ['In sitemap', sitemapCell(d)],
        ['Keywords', d.keywords], ['Author', d.author], ['Lang', d.lang], ['Charset', d.charset], ['Viewport', d.viewport],
        ['robots.txt', d.robotsTxt ? ext(`${new URL(d.url).origin}/robots.txt`, 'found') : null],
        ['Sitemaps', robots.length ? h('div', {}, robots.map((u) => h('div', {}, ext(u)))) : null],
        ['Words', num(d.wordCount)],
      ])),
    ]
  },
}

export const Issues = {
  count: (d) => health(d).list.length || null,
  render(d, { go }) {
    const hl = health(d)
    const groups = [['bad', 'Fix'], ['warn', 'Check']].map(([lvl, label]) => [label, hl.list.filter((i) => i.level === lvl)])
    return [
      head('Issues', `${hl.list.length} found on this page.`, copyBtn('Copy list', () => hl.list.map((i) => `[${i.level}] ${i.msg}${i.fix ? ` — ${i.fix}` : ''}`).join('\n')), reportBtn(d)),
      groups.map(([label, list]) => list.length ? block(`${label} (${list.length})`, h('ul', { class: 'issue-list' }, list.map((i) =>
        h('li', {}, tag(i.level), h('span', {}, i.msg, i.fix ? h('span', { class: 'fix' }, i.fix) : '', aiReady(d) ? explainBtn(d, i) : ''), h('button', { class: 'link', type: 'button', onclick: () => go(i.section) }, `Open ${i.section}`))))) : ''),
      hl.list.length ? '' : h('p', { class: 'empty' }, 'No issues. Check AI search readiness next.', btn('AI search', () => go('AI search'))),
    ]
  },
}

export const GEO = {
  name: 'AI search',
  count: (d) => geo(d).bots.filter((b) => !b.allowed).length || null,
  render(d) {
    const g = geo(d)
    const b = band(g.score)
    return [
      head('AI search readiness', `How likely AI answer engines are to crawl, understand and cite this page. Scored from ${g.pillars.reduce((n, p) => n + p.checks.length, 0)} checks below.`),
      h('div', { class: 'split' },
        h('div', { class: 'score-card' }, ring(g.score, b.status, { label: 'AI readiness' }), h('div', {}, h('div', { class: 'grade' }, `Grade ${b.grade}`), h('div', { class: 'muted' }, 'average of 5 pillars'))),
        block('Pillars', bars(g.pillars.map((p) => ({ label: p.name, value: p.score })), { fmt: (v) => `${v}` }))),
      block('AI crawlers (robots.txt)', h('div', { class: 'bots' }, g.bots.map((bt) => h('span', { class: `bot st-${bt.allowed ? 'good' : 'bad'}` }, tag(bt.allowed ? 'good' : 'bad', bt.allowed ? 'Allowed' : 'Blocked'), h('span', { class: 'mono' }, bt.name))))),
      g.ssrRatio != null ? block('Text present before JavaScript runs', h('div', { class: 'ssr' },
        h('div', { class: 'ssr-track', title: `${Math.round(g.ssrRatio * 100)}% of rendered text exists in the server HTML` }, h('span', { class: `ssr-fill st-${g.ssrRatio >= 0.7 ? 'good' : g.ssrRatio >= 0.3 ? 'warn' : 'bad'}`, style: `width:${g.ssrRatio * 100}%` })),
        h('span', {}, `${Math.round(g.ssrRatio * 100)}% server-rendered · ${num(d.rawTextChars)} of ${num(d.renderedTextChars)} chars`))) : '',
      g.pillars.map((p) => block(`${p.name} · ${p.score}`, h('ul', { class: 'checks' }, p.checks.map((c) => h('li', {}, tag(c.ok ? 'good' : 'warn', c.ok ? 'Pass' : 'Miss'), c.label))))),
    ]
  },
}

export const Content = {
  count: (d) => outline(d.headings).skips.length || null,
  render(d) {
    const o = outline(d.headings)
    const per = [1, 2, 3, 4, 5, 6].map((l) => ({ label: `H${l}`, value: d.headings.filter((x) => x.level === l).length }))
    return [
      head('Content structure', o.skips.length ? `${o.skips.length} skipped heading level${o.skips.length > 1 ? 's' : ''}; screen readers and crawlers lose the hierarchy there.` : `${d.headings.length} headings, no skipped levels.`,
        overlayBtn(d, 'headings', 'Label headings on page'), copyBtn('Copy outline', () => d.headings.map((x) => `${'  '.repeat(x.level - 1)}H${x.level} ${x.text}`).join('\n'))),
      h('div', { class: 'split wide-right' }, block('Heading count', bars(per)),
        block('Outline', d.headings.length ? tree(o.rows.map((r) => ({ depth: r.level - 1, label: `H${r.level}`, note: r.text || '(empty heading)', status: r.skipped ? 'warn' : !r.text ? 'bad' : null }))) : h('p', { class: 'empty' }, 'No headings. Add one H1 that states the page topic.'))),
      h('div', { class: 'split' },
        block(`Bold / strong (${d.emphasis.strong.length})`, d.emphasis.strong.length ? h('ul', { class: 'chips' }, d.emphasis.strong.map((t) => h('li', {}, t))) : h('p', { class: 'muted' }, 'None')),
        block(`Italic / em (${d.emphasis.em.length})`, d.emphasis.em.length ? h('ul', { class: 'chips' }, d.emphasis.em.map((t) => h('li', {}, t))) : h('p', { class: 'muted' }, 'None'))),
    ]
  },
}

export const Keywords = {
  render(d, ctx) {
    let n = 1
    const out = h('div')
    const tabs = h('div', { class: 'seg-ctl', role: 'tablist' })
    const draw = () => {
      const rows = density(d.words, n, 25)
      tabs.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-selected', String(i + 1 === n)))
      out.replaceChildren(rows.length ? bars(rows.map((r) => ({ label: r.term, value: r.count, pct: r.pct })), {
        extra: (r) => {
          const p = placement(r.label, d)
          return h('span', { class: 'place' }, h('span', { class: 'mono' }, `${r.pct}%`), ...['title', 'description', 'h1'].map((k) => h('abbr', { class: p[k] ? 'on' : '', title: `${p[k] ? 'In' : 'Not in'} ${k}` }, k === 'description' ? 'D' : k === 'title' ? 'T' : 'H1')))
        },
      }) : h('p', { class: 'empty' }, `No ${n}-word phrase repeats. Pages under ~300 words rarely have measurable density.`))
    }
    ;[1, 2, 3, 4, 5].forEach((k) => tabs.append(h('button', { role: 'tab', type: 'button', onclick: () => { n = k; draw() } }, `${k} word${k > 1 ? 's' : ''}`, h('small', {}, num(density(d.words, k, 1000).length)))))
    draw()
    return [
      head('Keyword density', `${num(d.wordCount)} words. T, D and H1 mark whether a phrase also appears in the title, description and H1.`,
        btn('Export CSV', () => download(`keywords-${d.host}.csv`, toCsv([1, 2, 3, 4, 5].flatMap((k) => density(d.words, k, 100).map((r) => ({ words: k, ...r }))))))),
      tabs, out,
      keywordMetricsBlock(d, ctx),
    ]
  },
}

export const Speed = {
  count: (d) => (d.perf.lcp > 4000 || d.perf.cls > 0.25 ? 1 : null),
  render(d, ctx) {
    const p = d.perf
    const lcpSt = p.lcp == null ? 'warn' : p.lcp <= 2500 ? 'good' : p.lcp <= 4000 ? 'warn' : 'bad'
    const clsSt = p.cls == null ? 'warn' : p.cls <= 0.1 ? 'good' : p.cls <= 0.25 ? 'warn' : 'bad'
    return [
      head('Load timing', `This load in your browser: TTFB ${ms(p.ttfb)}, LCP ${ms(p.lcp)}, fully loaded ${ms(p.load)}. Field data (CrUX) can differ.`),
      kv([
        ['LCP', ms(p.lcp), tag(lcpSt, `${lcpSt === 'good' ? '≤ 2.5 s' : lcpSt === 'warn' ? '≤ 4 s' : '> 4 s'}`)],
        ['CLS', p.cls ?? '—', tag(clsSt, clsSt === 'good' ? '≤ 0.1' : clsSt === 'warn' ? '≤ 0.25' : '> 0.25')],
        ['INP so far', p.inp != null ? ms(p.inp) : h('span', { class: 'muted' }, 'no interactions yet; click around the page and reopen'), p.inp != null ? tag(p.inp <= 200 ? 'good' : p.inp <= 500 ? 'warn' : 'bad', p.inp <= 200 ? '≤ 200 ms' : p.inp <= 500 ? '≤ 500 ms' : '> 500 ms') : ''],
        ['LCP element', p.lcpEl ? h('span', { class: 'mono' }, `<${p.lcpEl.tag}>${p.lcpEl.url ? ` ${p.lcpEl.url.split('/').pop().slice(0, 50)}` : ''}`) : null, p.lcpEl?.lazy ? tag('bad', 'lazy-loaded') : ''],
        ['TTFB', ms(p.ttfb)], ['HTML transfer', p.transferKb != null ? `${p.transferKb} KB` : null], ['Protocol', p.protocol],
        ['DOM nodes', num(p.domNodes)], ['Server', d.headers.server], ['Compression', d.headers['content-encoding']], ['Cache-Control', d.headers['cache-control']],
      ]),
      cruxBlock(d, ctx),
      p.phases?.length ? block('Where the time went (this load, lab)', timeline(p.phases, { markers: p.lcp ? [{ name: 'LCP', at: p.lcp, status: lcpSt }] : [] })) : h('p', { class: 'empty' }, 'Navigation timing is not available for this page.'),
    ]
  },
}

export const reportBtn = (d) => btn('Export report', () => download(`seo-report-${d.host}.html`, buildReport(d, d.lenses), 'text/html'))
/** Toggle an on-page overlay layer; the label tracks the page state. */
export const overlayBtn = (d, layer, label) => btn(label, async (e) => {
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: d.tabId }, func: overlay, args: [layer] })
  e.target.setAttribute('aria-pressed', String(result))
})
function sitemapCell(d) {
  const sm = d.probe?.sitemap
  if (!sm) return null
  const ok = sm.files.find((f) => f.status === 200 && !f.error)
  if (!ok) return h('span', {}, tag('warn', 'None found'))
  return h('span', {}, tag(sm.contains ? 'good' : 'warn', sm.contains ? 'Listed' : 'Not listed'), ' ', h('span', { class: 'muted small' }, `${sm.files.length} file${sm.files.length > 1 ? 's' : ''} checked via ${sm.source}${sm.lastmod ? ` · lastmod ${sm.lastmod}` : ''}`))
}
