// Local SEO › geo-grid: where the business ranks in Google Maps at points around it (DataForSEO Maps SERP, your key).
// Latest grid per keyword is kept in `geogrid:<host>:<keyword>`.
import { gridPoints } from './local.js'
import { MARKETS, hasCreds, loadKeys } from './keys.js'
import { API } from './providers.js'
import { h, block, btn } from './ui.js'
import { failBox, note } from './views-data.js'

// ponytail: DataForSEO Maps is billed per SERP of up to 100 results (about $0.002 at list price); actual cost is shown after.
const PER_POINT = 0.002
const cell = (p) => (p == null ? '—' : `#${p}`)
const shade = (p) => (p == null ? 'bad' : p <= 3 ? 'good' : p <= 10 ? 'warn' : 'bad')

function gridView(g) {
  const size = Math.sqrt(g.points.length)
  const found = g.points.filter((p) => p.position != null)
  return h('div', {},
    h('div', { class: 'geogrid', style: `grid-template-columns: repeat(${size}, 1fr)` }, g.points.map((p) => h('div', { class: `gg st-${shade(p.position)}`, title: `${p.lat}, ${p.lng}${p.top?.length ? ` · top: ${p.top.join(', ')}` : ''}${p.error ? ` · failed: ${p.error}` : ''}` }, p.error ? '!' : cell(p.position)))),
    note(`“${g.keyword}” · ${g.size}×${g.size} grid, ${g.spacing} km apart · ${found.length} of ${g.points.length} points show the business in the top 20${found.length ? `; average #${(found.reduce((t, p) => t + p.position, 0) / found.length).toFixed(1)}` : ''} · ${g.at.slice(0, 10)}${g.cost ? ` · cost $${g.cost.toFixed(3)}` : ''}. Hover a cell for its coordinates and the top 3 there.`))
}

export function geoGridBlock(d, a, { go }) {
  const host = d.host.replace(/^www\./, '')
  const kw = h('input', { class: 'url-input', placeholder: 'Keyword, e.g. dentist near me', 'aria-label': 'Maps keyword' })
  const coords = h('input', { class: 'url-input', placeholder: 'lat, lng', 'aria-label': 'Grid centre (lat, lng)', value: a.geo ? `${a.geo.lat}, ${a.geo.lng}` : '', style: 'max-width:220px' })
  const size = h('select', { 'aria-label': 'Grid size', onchange: () => est() }, [3, 5, 7].map((v) => h('option', { value: v }, `${v}×${v}`)))
  const spacing = h('select', { 'aria-label': 'Spacing' }, [0.5, 1, 2, 5].map((v) => h('option', { value: v, selected: v === 1 }, `${v} km apart`)))
  const match = h('input', { class: 'url-input', 'aria-label': 'Business to find (domain or name)', value: a.business?.name || host, style: 'max-width:220px' })
  const cost = note(''), out = h('div')
  const est = () => { cost.textContent = `${size.value * size.value} Maps searches · about $${(size.value * size.value * PER_POINT).toFixed(3)} of DataForSEO credit. Matches the listing by website domain or name.` }
  const k = () => `geogrid:${host}:${kw.value.trim().toLowerCase()}`
  const run = btn('Check the grid', async (e) => {
    const cfg = await loadKeys()
    if (!hasCreds(cfg, 'dataforseo')) { out.replaceChildren(note('The geo-grid uses DataForSEO’s Maps results: connect it in Settings › Connectors.'), btn('Open Settings', () => go('Settings'))); return }
    const [lat, lng] = coords.value.split(',').map((x) => Number(x.trim()))
    if (!kw.value.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { out.replaceChildren(note('Enter a keyword and the centre as “lat, lng” (from the business’s schema, or Google Maps › right-click › coordinates).')); return }
    const pts = gridPoints(lat, lng, +size.value, +spacing.value), m = MARKETS[cfg.market]
    e.target.disabled = true
    let cost = 0
    for (const [i, p] of pts.entries()) { // one at a time: Maps live SERPs take a few seconds each
      out.replaceChildren(note(`Point ${i + 1} of ${pts.length}…`))
      try { const r = await API.dataforseo.mapsAt(cfg.creds.dataforseo, kw.value.trim(), `${p.lat},${p.lng},15z`, m, match.value.trim()); Object.assign(p, { position: r.position, top: r.top }); cost += r.cost ?? 0 } catch (x) { p.error = x.message; p.position = null }
    }
    e.target.disabled = false
    if (pts.every((p) => p.error)) { out.replaceChildren(failBox(new Error(pts[0].error))); return }
    const g = { keyword: kw.value.trim(), size: +size.value, spacing: +spacing.value, at: new Date().toISOString(), cost, points: pts }
    await chrome.storage.local.set({ [k()]: g })
    out.replaceChildren(gridView(g))
  }, { class: 'btn primary' })
  kw.addEventListener('change', async () => { const g = (await chrome.storage.local.get(k()))[k()]; out.replaceChildren(g ? gridView(g) : '') })
  est()
  return block('Geo-grid rankings (Google Maps)', h('div', { class: 'bar-line' }, kw, coords), h('div', { class: 'bar-line' }, size, spacing, match, run), cost, out)
}
