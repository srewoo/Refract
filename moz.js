// Moz Links API v2 (api.moz.com), the "backlinks" capability. Contract taken from claude-seo's tested client
// (scripts/moz_api.py; moz.com docs can't be fetched from here): POST JSON, auth either Basic "accessId:secret" or an
// x-moz-token header. Moz lists referring domains, not individual links, so there is no backlinkRows().
import { fetchJson } from './http.js'
import { billed } from './ledger.js'

const MOZ = 'https://api.moz.com'
const auth = (key) => (key.includes(':') ? { authorization: `Basic ${btoa(key)}` } : { 'x-moz-token': key })
async function moz(c, path, body) {
  return billed('moz', path.slice(4), async () => {
    const r = await fetchJson(`${MOZ}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...auth(c.key) }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(`Moz: ${j.error ?? j.message ?? `HTTP ${r.status}`}`)
    return j
  })
}

/** url_metrics → the shared backlink summary shape (plus Page Authority and Moz's spam score). */
export function parseMozMetrics(j) {
  const m = j.results?.[0] ?? {}
  return { backlinks: m.external_pages_to_root_domain ?? null, refDomains: m.root_domains_to_root_domain ?? null, rating: m.domain_authority ?? null, ratingName: 'Moz Domain Authority', pageAuthority: m.page_authority ?? null, mozSpam: m.spam_score ?? null }
}
/** linking_root_domains → referring domains in the shared shape. */
export const parseMozDomains = (j) => (j.results ?? []).map((i) => ({ domain: i.root_domain, backlinks: i.to_target?.pages ?? null, rating: i.domain_authority ?? null, spam: i.spam_score ?? null, firstSeen: null }))

export const mozApi = {
  // Moz has no free status call, so the test is one url_metrics row.
  test: (c) => moz(c, '/v2/url_metrics', { targets: ['moz.com'] }).then((j) => `Key works (moz.com Domain Authority ${parseMozMetrics(j).rating ?? '?'})`),
  async backlinks(c, domain, limit = 25) {
    const [m, rd] = await Promise.all([moz(c, '/v2/url_metrics', { targets: [domain] }), moz(c, '/v2/linking_root_domains', { target: domain, target_scope: 'root_domain', limit: Math.min(limit, 50) })])
    return { ...parseMozMetrics(m), top: parseMozDomains(rd) }
  },
}
