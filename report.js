// Self-contained HTML report (one file, inline CSS, no scripts) for handing to a client or developer.
import { geo, health, band } from './geo.js'
import { linkStats } from './analyze.js'
import { stack } from './rules.js'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export function buildReport(d, lenses = null) {
  const hl = health(d)
  const g = geo(d)
  const st = linkStats(d.links)
  const fw = stack(d.fw, d.globals)
  const when = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const row = (k, v) => `<tr><th>${esc(k)}</th><td>${v == null || v === '' ? '<span class=m>—</span>' : esc(v)}</td></tr>`
  const issue = (i) => `<li class="${i.level}"><b>${i.level === 'bad' ? 'Fix' : 'Check'}</b> ${esc(i.msg)}${i.fix ? `<div class=m>${esc(i.fix)}</div>` : ''}<span class=s>${esc(i.section)}</span></li>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SEO report · ${esc(d.host)}</title><style>
body{font:14px/1.5 system-ui,sans-serif;color:#1c1d1f;background:#fbfaf7;max-width:880px;margin:0 auto;padding:32px 20px}
h1{font-size:22px;margin:0}h2{font-size:15px;margin:28px 0 8px;border-bottom:1px solid #e2dfd7;padding-bottom:4px}
.m{color:#6b6862;font-size:12.5px}.mono,td{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;word-break:break-all}
.scores{display:flex;gap:28px;margin:18px 0}.score b{font-size:34px;font-family:ui-monospace,Menlo,monospace;display:block}
ul{list-style:none;padding:0;margin:0}li{padding:7px 0 7px 12px;border-bottom:1px solid #e2dfd7;border-left:4px solid #fab219;position:relative}
li.bad{border-left-color:#d03b3b}li b{font-size:11px;text-transform:uppercase;margin-right:6px}.s{position:absolute;right:0;top:7px;font-size:11px;color:#6b6862}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:5px 8px 5px 0;border-bottom:1px solid #e2dfd7;vertical-align:top}th{font-weight:600;width:190px;font-family:system-ui,sans-serif}
@media print{body{background:#fff}}</style></head><body>
<h1>SEO report · ${esc(d.host)}</h1><div class="m mono">${esc(d.url)}<br>Generated ${esc(when)} UTC by Refract SEO · data from this page load</div>
<div class=scores><div class=score><span class=m>Page health</span><b>${hl.score}</b>Grade ${band(hl.score).grade} · ${hl.bad} fix · ${hl.warn} check</div>
<div class=score><span class=m>AI search readiness</span><b>${g.score}</b>Grade ${band(g.score).grade}</div></div>
<h2>Issues (${hl.list.length})</h2><ul>${hl.list.map(issue).join('') || '<li class=good>No issues found.</li>'}</ul>
<h2>Indexing</h2><table>${row('HTTP status', d.status)}${row('Indexable', d.indexable ? 'yes' : 'no')}${row('Meta robots', d.robots)}${row('X-Robots-Tag', d.headers['x-robots-tag'])}${row('Canonical', d.canonical)}${row('In sitemap', d.probe?.sitemap ? (d.probe.sitemap.contains ? `yes${d.probe.sitemap.lastmod ? ` (lastmod ${d.probe.sitemap.lastmod})` : ''}` : 'no') : null)}</table>
<h2>Snippet</h2><table>${row('Title', `${d.title} (${d.title.length} chars${d.titlePx ? `, ${d.titlePx}px` : ''})`)}${row('Description', d.description ? `${d.description} (${d.description.length} chars)` : null)}${row('H1', d.headings.filter((h) => h.level === 1).map((h) => h.text).join(' | '))}</table>
<h2>AI search</h2><table>${g.pillars.map((p) => row(p.name, `${p.score}/100 · ${p.checks.filter((c) => !c.ok).map((c) => c.label).join('; ') || 'all checks pass'}`)).join('')}${row('Blocked AI crawlers', g.bots.filter((b) => !b.allowed).map((b) => b.name).join(', ') || 'none')}</table>
${lenses ? `<h2>What crawlers receive</h2><table>${lenses.map((l) => row(l.name, `${l.outcome}${l.status ? ` · HTTP ${l.status}` : ''}${l.words != null ? ` · ${l.words} words` : ''}${l.detail ? ` · ${l.detail}` : ''}`)).join('')}</table>` : ''}
<h2>Page</h2><table>${row('Stack', fw.label)}${row('Words', d.wordCount)}${row('Headings', d.headings.length)}${row('Links', `${st.total} (${st.internal} internal, ${st.external} external, ${st.nofollow} nofollow)`)}${row('Images', `${d.images.length} (${d.images.filter((i) => i.alt === null).length} missing alt)`)}${row('Structured data', d.schema.types.join(', '))}${row('LCP / CLS / INP', `${d.perf.lcp ?? '—'} ms / ${d.perf.cls ?? '—'} / ${d.perf.inp ?? '—'} ms (lab, this load)`)}</table>
</body></html>`
}
