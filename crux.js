// Chrome UX Report API: real-user (field) Core Web Vitals, p75 over the last 28 days, plus a 25-week history.
// Contract from Refract src/connectors/crux/api.ts: key in x-goog-api-key, 404 means "not enough traffic".
const BASE = 'https://chromeuxreport.googleapis.com/v1/records'
export const METRICS = {
  largest_contentful_paint: { label: 'LCP', unit: 'ms', good: 2500, poor: 4000 },
  interaction_to_next_paint: { label: 'INP', unit: 'ms', good: 200, poor: 500 },
  cumulative_layout_shift: { label: 'CLS', unit: '', good: 0.1, poor: 0.25 },
  first_contentful_paint: { label: 'FCP', unit: 'ms', good: 1800, poor: 3000 },
  experimental_time_to_first_byte: { label: 'TTFB', unit: 'ms', good: 800, poor: 1800 },
}

async function post(key, path, body) {
  const r = await fetch(`${BASE}:${path}`, { method: 'POST', credentials: 'omit', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (r.status === 404) return null // no field data: not enough Chrome users visited this URL/origin
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`CrUX: ${j.error?.message ?? `HTTP ${r.status}`}`)
  return j
}

/** Pure: p75 + good/needs-improvement/poor shares per metric. */
export function parseRecord(json) {
  if (!json?.record) return null
  const out = {}
  for (const [k, spec] of Object.entries(METRICS)) {
    const m = json.record.metrics?.[k] ?? (k === 'experimental_time_to_first_byte' ? json.record.metrics?.time_to_first_byte : null)
    if (!m) continue
    const p75 = Number(m.percentiles?.p75)
    const dens = (m.histogram ?? []).map((b) => b.density ?? 0)
    out[k] = { ...spec, p75, good: dens[0] ?? 0, ni: dens[1] ?? 0, poor: dens[2] ?? 0, status: p75 <= spec.good ? 'good' : p75 <= spec.poor ? 'warn' : 'bad' }
  }
  // LCP sub-parts (image LCPs only): where the p75 LCP time goes. Returned whenever no metrics filter is sent.
  const sub = (k) => { const v = Number(json.record.metrics?.[`largest_contentful_paint_image_${k}`]?.percentiles?.p75); return Number.isFinite(v) ? v : null }
  const lcpParts = { ttfb: sub('time_to_first_byte'), loadDelay: sub('resource_load_delay'), loadDuration: sub('resource_load_duration'), renderDelay: sub('element_render_delay') }
  const p = json.record.collectionPeriod
  return { metrics: out, lcpParts: Object.values(lcpParts).some((v) => v != null) ? lcpParts : null, period: p ? `${p.firstDate.year}-${String(p.firstDate.month).padStart(2, '0')}-${String(p.firstDate.day).padStart(2, '0')} → ${p.lastDate.year}-${String(p.lastDate.month).padStart(2, '0')}-${String(p.lastDate.day).padStart(2, '0')}` : '' }
}

/** Pure: weekly p75 series for LCP / INP / CLS. */
export function parseHistory(json) {
  const r = json?.record
  if (!r) return null
  const dates = (r.collectionPeriods ?? []).map((p) => `${p.lastDate.year}-${String(p.lastDate.month).padStart(2, '0')}-${String(p.lastDate.day).padStart(2, '0')}`)
  const series = (k) => (r.metrics?.[k]?.percentilesTimeseries?.p75s ?? []).map((v, i) => ({ date: dates[i], value: v == null ? null : Number(v) })).filter((p) => p.value != null && Number.isFinite(p.value))
  return { lcp: series('largest_contentful_paint'), inp: series('interaction_to_next_paint'), cls: series('cumulative_layout_shift') }
}

/** url + origin records and history, for one form factor ('PHONE' | 'DESKTOP'). */
export async function cruxFor(key, url, formFactor = 'PHONE') {
  const origin = new URL(url).origin
  const hist = ['largest_contentful_paint', 'interaction_to_next_paint', 'cumulative_layout_shift']
  const [u, o, uh, oh] = await Promise.all([
    // No `metrics` filter: an unknown metric name fails the whole request, and the API returns all it has.
    post(key, 'queryRecord', { url, formFactor }),
    post(key, 'queryRecord', { origin, formFactor }),
    post(key, 'queryHistoryRecord', { url, formFactor, metrics: hist, collectionPeriodCount: 25 }),
    post(key, 'queryHistoryRecord', { origin, formFactor, metrics: hist, collectionPeriodCount: 25 }),
  ])
  return { url: parseRecord(u), origin: parseRecord(o), urlHistory: parseHistory(uh), originHistory: parseHistory(oh) }
}

export const cruxTest = async (key) => { const r = await post(key, 'queryRecord', { origin: 'https://www.google.com', formFactor: 'PHONE' }); return r ? 'Key works' : 'Key works (no data for the test origin)' }
