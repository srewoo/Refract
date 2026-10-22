// DOM + SVG building blocks and the small chart kit used by the views.
// Strings always become text nodes, so page data is never parsed as HTML.

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag)
  setAttrs(el, attrs)
  el.append(...flat(kids))
  return el
}
const SVGNS = 'http://www.w3.org/2000/svg'
export function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVGNS, tag)
  setAttrs(el, attrs)
  el.append(...flat(kids))
  return el
}
function setAttrs(el, attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else el.setAttribute(k, v === true ? '' : v)
  }
}
const flat = (kids) => kids.flat(Infinity).filter((k) => k != null && k !== false && k !== '').map((k) => (k instanceof Node ? k : String(k)))

export const ext = (href, text = href) => (/^https?:/i.test(href) ? h('a', { href, target: '_blank', rel: 'noopener' }, text) : h('span', {}, text))
export const ms = (v) => (v == null || Number.isNaN(v) || v < 0 ? '—' : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`)
export const num = (n) => (n == null ? '—' : Number(n).toLocaleString())
export const STATUS_LABEL = { good: 'Pass', warn: 'Check', bad: 'Fix' }

/** Section header: a title plus the one-line answer the section exists to give. */
export const head = (title, answer, ...actions) => h('header', { class: 'vh' }, h('div', {}, h('h1', {}, title), answer ? h('p', { class: 'answer' }, answer) : ''), actions.length ? h('div', { class: 'actions' }, actions) : '')
export const block = (title, ...kids) => h('section', { class: 'block' }, title ? h('h2', {}, title) : '', kids)
export const kv = (rows) => h('dl', { class: 'kv' }, rows.filter(Boolean).map(([k, v, extra]) => [h('dt', {}, k), h('dd', {}, v ?? h('span', { class: 'muted' }, '—'), extra ? h('span', { class: 'aside' }, extra) : '')]))
export const tag = (status, text = STATUS_LABEL[status]) => h('span', { class: `tag ${status}` }, h('i', { 'aria-hidden': 'true' }), text)
export const btn = (label, onclick, attrs = {}) => h('button', { class: 'btn', type: 'button', onclick, ...attrs }, label)

export function download(name, text, type = 'text/csv') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
export const copyBtn = (label, text) => btn(label, async (e) => { await navigator.clipboard.writeText(text()); e.target.textContent = 'Copied' })

// ---------- charts --------------------------------------------------------------------------

/** Score ring: one number, its status colour, and the grade as text. */
export function ring(score, status, { size = 96, label = '' } = {}) {
  const r = size / 2 - 7
  const c = 2 * Math.PI * r
  return h('div', { class: 'ring', role: 'img', 'aria-label': `${label} ${score} of 100` },
    s('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` },
      s('circle', { cx: size / 2, cy: size / 2, r, class: 'ring-track' }),
      s('circle', { cx: size / 2, cy: size / 2, r, class: `ring-val st-${status}`, 'stroke-dasharray': `${(score / 100) * c} ${c}`, transform: `rotate(-90 ${size / 2} ${size / 2})` })),
    h('b', {}, score))
}

/** Length meter: shaded recommended band, a tick for the current value. Answers "is this too short/long?". */
export function lengthMeter(len, [min, max], { scaleMax = Math.max(max * 1.4, len + 5), unit = 'chars' } = {}) {
  const x = (v) => `${Math.min(100, (v / scaleMax) * 100)}%`
  const status = len === 0 ? 'bad' : len < min || len > max ? 'warn' : 'good'
  return h('div', { class: 'meter', title: `${len} ${unit}; recommended ${min}–${max}` },
    h('div', { class: 'meter-track' },
      h('span', { class: 'meter-band', style: `left:${x(min)};width:calc(${x(max)} - ${x(min)})` }),
      h('span', { class: `meter-tick st-${status}`, style: `left:${x(len)}` })),
    h('div', { class: 'meter-legend' }, h('span', {}, `${len} ${unit}`), tag(status), h('span', { class: 'muted' }, `aim ${min}–${max}`)))
}

/** Horizontal bars, one series. Value labels sit at the bar end; hover shows the exact value. */
export function bars(rows, { fmt = num, extra } = {}) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return h('div', { class: 'bars' }, rows.map((r) => h('div', { class: 'bar-row', title: `${r.label}: ${fmt(r.value)}` },
    h('span', { class: 'bar-label' }, r.label),
    h('span', { class: 'bar-track' }, h('span', { class: 'bar', style: `width:${Math.max(1.5, (r.value / max) * 100)}%` })),
    h('span', { class: 'bar-val' }, fmt(r.value)),
    extra ? extra(r) : '')))
}

/** 100% stacked bar, up to 3 parts (validated categorical slots 1–3), every part labelled with its count.
 *  A part may set `status` ('good'|'warn'|'bad') when the bar encodes state rather than category. */
export function stack(parts, { caption } = {}) {
  const total = parts.reduce((a, p) => a + p.value, 0)
  return h('figure', { class: 'stack' },
    caption ? h('figcaption', {}, caption) : '',
    h('div', { class: 'stack-bar', role: 'img', 'aria-label': parts.map((p) => `${p.label} ${p.value}`).join(', ') },
      total ? parts.filter((p) => p.value).map((p, i) => h('span', { class: `seg ${p.status ? `st-${p.status}` : `c${parts.indexOf(p) + 1}`}`, style: `flex:${p.value}`, title: `${p.label}: ${p.value} (${Math.round((p.value / total) * 100)}%)` })) : h('span', { class: 'seg empty' })),
    h('div', { class: 'stack-legend' }, parts.map((p, i) => h('span', {}, h('i', { class: `sw ${p.status ? `st-${p.status}` : `c${i + 1}`}`, 'aria-hidden': 'true' }), `${p.label} `, h('b', {}, num(p.value))))))
}

/** Single-series line over time with crosshair + tooltip. points: [{ date, value }].
 *  invert: smaller is better and drawn at the top (ranks). thresholds: [{ at, status, label }] dashed guides. */
export function lineChart(points, { width = 560, height = 150, fmt = num, invert = false, thresholds = [], label = 'value', padRatio = 0.1 } = {}) {
  const m = { l: 52, r: 12, t: 10, b: 22 }
  const vals = points.map((p) => p.value)
  const raw = [...vals, ...thresholds.map((t) => t.at)]
  let lo = Math.min(...raw), hi = Math.max(...raw)
  const pad = Math.max((hi - lo) * 0.2, Math.abs(hi) * padRatio, invert ? 2 : 0) || 1 // a 1-step move must not read as a cliff
  lo = invert ? Math.max(1, lo - pad) : Math.max(0, lo - pad); hi += pad
  const span = hi - lo || 1
  const x = (i) => m.l + (i / Math.max(1, points.length - 1)) * (width - m.l - m.r)
  const y = (v) => (invert ? m.t + ((v - lo) / span) * (height - m.t - m.b) : height - m.b - ((v - lo) / span) * (height - m.t - m.b))
  const ticks = [lo, lo + span / 2, hi]
  const tip = h('div', { class: 'tip', hidden: true })
  const cross = s('line', { class: 'cross', y1: m.t, y2: height - m.b, visibility: 'hidden' })
  const dot = s('circle', { r: 4, class: 'line-dot', visibility: 'hidden' })
  const svg = s('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart', role: 'img', 'aria-label': `${label} from ${points[0].date} to ${points.at(-1).date}: ${fmt(vals[0])} to ${fmt(vals.at(-1))}` },
    ticks.map((t) => [s('line', { class: 'grid', x1: m.l, x2: width - m.r, y1: y(t), y2: y(t) }), s('text', { class: 'axis', x: m.l - 6, y: y(t) + 4, 'text-anchor': 'end' }, fmt(t))]),
    thresholds.map((t) => s('line', { class: `thr st-${t.status}`, x1: m.l, x2: width - m.r, y1: y(t.at), y2: y(t.at) }, s('title', {}, t.label ?? ''))),
    s('text', { class: 'axis', x: m.l, y: height - 6 }, points[0].date.slice(5)),
    s('text', { class: 'axis', x: width - m.r, y: height - 6, 'text-anchor': 'end' }, points.at(-1).date.slice(5)),
    s('polyline', { class: 'line', points: points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ') }),
    cross, dot,
    s('rect', { x: m.l, y: 0, width: width - m.l - m.r, height, fill: 'transparent',
      onpointermove: (e) => {
        const box = svg.getBoundingClientRect()
        const vx = ((e.clientX - box.left) / box.width) * width
        const i = Math.max(0, Math.min(points.length - 1, Math.round(((vx - m.l) / (width - m.l - m.r)) * (points.length - 1))))
        const p = points[i]
        cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible')
        dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(p.value)); dot.setAttribute('visibility', 'visible')
        tip.replaceChildren(h('b', {}, fmt(p.value)), ` ${p.date}`)
        tip.hidden = false
        tip.style.left = `${(x(i) / width) * 100}%`
      },
      onpointerleave: () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden') } }))
  return h('div', { class: 'chart-wrap' }, svg, tip)
}
/** Tiny axis-less trend line for a table cell (e.g. 12 months of search volume). */
export function spark(values, { width = 72, height = 18 } = {}) {
  const v = values.filter((x) => x != null)
  if (v.length < 2) return h('span', { class: 'muted' }, '—')
  const lo = Math.min(...v), span = Math.max(...v) - lo || 1
  return s('svg', { viewBox: `0 0 ${width} ${height}`, width, height, class: 'chart spark', role: 'img', 'aria-label': `Trend over ${v.length} months: ${num(v[0])} to ${num(v.at(-1))}` },
    s('polyline', { class: 'line', points: v.map((x, i) => `${((i / (v.length - 1)) * width).toFixed(1)},${(height - 1 - ((x - lo) / span) * (height - 2)).toFixed(1)}`).join(' ') }))
}
export const rankLine = (points, o = {}) => lineChart(points.map((p) => ({ date: p.date, value: p.rank })), { ...o, invert: true, fmt: (v) => `#${num(Math.round(v))}`, label: 'Rank' })

/** Gantt-style timeline rows on one shared ms axis, with optional vertical markers (e.g. LCP). */
export function timeline(rows, { markers = [] } = {}) {
  const end = Math.max(1, ...rows.map((r) => r.end), ...markers.map((m) => m.at))
  const pc = (v) => `${(v / end) * 100}%`
  return h('div', { class: 'tl' },
    rows.map((r) => h('div', { class: 'tl-row', title: `${r.name}: ${ms(r.start)} → ${ms(r.end)} (${ms(r.end - r.start)})` },
      h('span', { class: 'tl-label' }, r.name),
      h('span', { class: 'tl-track' }, h('span', { class: 'tl-bar', style: `left:${pc(r.start)};width:max(2px, calc(${pc(r.end)} - ${pc(r.start)}))` }),
        markers.map((m) => h('span', { class: `tl-mark st-${m.status}`, style: `left:${pc(m.at)}` }))),
      h('span', { class: 'tl-val' }, ms(r.end - r.start)))),
    h('div', { class: 'tl-axis' }, h('span', {}, '0'), markers.map((m) => h('span', { class: 'tl-mlabel', style: `left:${pc(m.at)}` }, `${m.name} ${ms(m.at)}`)), h('span', {}, ms(end))))
}

/** Indented tree with connector rails. rows: [{ depth, label, note, status }] */
export function tree(rows) {
  return h('ol', { class: 'tree' }, rows.map((r) => h('li', { style: `--d:${r.depth}`, class: r.status ? `st-${r.status}` : '' },
    h('span', { class: 'tree-label' }, r.label), r.note ? h('span', { class: 'tree-note' }, r.note) : '')))
}

/** Left-to-right chain of checks; the first failing link explains the outcome. */
export function chain(steps) {
  return h('ol', { class: 'chain' }, steps.map((st) => h('li', { class: `st-${st.status}` },
    h('span', { class: 'chain-k' }, st.label), h('span', { class: 'chain-v' }, st.value ?? '—'), tag(st.status))))
}
