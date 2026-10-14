// Local SEO: name / address / phone (NAP) consistency on one page. Pure.
import { typedNodes } from './rules.js'

const LOCAL_TYPE = /LocalBusiness|Store|Restaurant|Dentist|Physician|Hotel|Attorney|LegalService|AutoDealer|RealEstateAgent|HealthClub|BeautySalon|Plumber|Electrician|HomeAndConstructionBusiness|MedicalBusiness|FoodEstablishment|ProfessionalService|AutomotiveBusiness|LodgingBusiness/
export const phoneKey = (p) => String(p ?? '').replace(/\D/g, '').slice(-10)
const addr = (a) => (typeof a === 'string' ? a : a && typeof a === 'object' ? [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode, a.addressCountry?.name ?? a.addressCountry].filter(Boolean).join(', ') : '')

export function analyseLocal(d) {
  const L = d.local ?? { telLinks: [], visiblePhones: [], addresses: [], mapEmbeds: 0, gbpLinks: [] }
  const nodes = typedNodes(d.schema.jsonLd).filter((n) => [].concat(n['@type']).some((t) => LOCAL_TYPE.test(t)) || (n.address && n.telephone))
  const org = typedNodes(d.schema.jsonLd).find((n) => [].concat(n['@type']).includes('Organization'))
  const biz = nodes[0] ?? null
  const sources = [
    ...nodes.map((n) => ({ source: `Schema (${[].concat(n['@type']).join(', ')})`, name: n.name ?? '', phone: n.telephone ?? '', address: addr(n.address) })),
    ...(org && !nodes.includes(org) ? [{ source: 'Schema (Organization)', name: org.name ?? '', phone: org.telephone ?? '', address: addr(org.address) }] : []),
    ...L.telLinks.map((p) => ({ source: 'Click-to-call link', name: '', phone: p, address: '' })),
    ...L.addresses.map((a) => ({ source: '<address> element', name: '', phone: '', address: a })),
    ...L.visiblePhones.map((p) => ({ source: 'Page text (pattern match)', name: '', phone: p, address: '' })),
  ]
  const phones = [...new Set(sources.map((s) => phoneKey(s.phone)).filter((k) => k.length >= 7))]
  const looksLocal = !!biz || L.mapEmbeds > 0 || L.gbpLinks.length > 0 || (L.telLinks.length > 0 && L.addresses.length > 0)
  const checks = []
  const add = (ok, label, level = 'warn') => checks.push({ ok, label, level })
  if (looksLocal) {
    add(!!biz, biz ? `LocalBusiness-type schema: ${[].concat(biz['@type']).join(', ')}` : 'No LocalBusiness (or subtype) schema')
    if (biz) {
      add(!!biz.address, 'Schema has an address')
      add(!!biz.telephone, 'Schema has a telephone')
      add(!!(biz.geo || biz.hasMap), 'Schema has geo coordinates or hasMap')
      add(!!(biz.openingHours || biz.openingHoursSpecification), 'Schema has opening hours')
      add([].concat(biz.sameAs ?? []).some((u) => /google\.[a-z.]+\/maps|g\.page|maps\.app\.goo\.gl/i.test(u)) || L.gbpLinks.length > 0, 'Links to the Google Business Profile / Maps listing')
    }
    add(phones.length <= 1, phones.length <= 1 ? 'One phone number across schema, links and text' : `${phones.length} different phone numbers on the page`)
    add(L.telLinks.length > 0, 'Phone is a tap-to-call link (tel:)')
    add(L.mapEmbeds > 0 || L.gbpLinks.length > 0, 'Map embed or Maps link present')
  }
  const name = biz?.name ?? org?.name ?? d.social['og:site_name'] ?? ''
  const where = addr(biz?.address) || L.addresses[0] || ''
  const q = encodeURIComponent([name, where].filter(Boolean).join(' '))
  return {
    looksLocal, business: biz ? { name: biz.name ?? '', phone: biz.telephone ?? '', address: addr(biz.address), hours: biz.openingHours ?? null } : null,
    sources, phones, checks, mapEmbeds: L.mapEmbeds, gbpLinks: L.gbpLinks,
    links: name ? [
      ['Find on Google Maps', `https://www.google.com/maps/search/?api=1&query=${q}`],
      ['Google search for the business', `https://www.google.com/search?q=${q}`],
      ['Google Business Profile manager', 'https://business.google.com/'],
      ['Rich Results Test', `https://search.google.com/test/rich-results?url=${encodeURIComponent(d.url)}`],
    ] : [['Google Business Profile manager', 'https://business.google.com/']],
  }
}

/** Issues for health(): only on pages that look like a local business. */
export function localIssues(d) {
  const a = analyseLocal(d)
  if (!a.looksLocal) return []
  const out = []
  if (!a.business) out.push({ id: 'local.schema_missing', level: 'warn', section: 'Local SEO', msg: 'Looks like a local business page but has no LocalBusiness schema', fix: 'Add LocalBusiness (or a subtype) JSON-LD with name, address, telephone, geo and hours.' })
  if (a.phones.length > 1) out.push({ id: 'local.phone_mismatch', level: 'warn', section: 'Local SEO', msg: `${a.phones.length} different phone numbers on the page`, fix: 'Use one consistent number in schema, links and text (NAP consistency).' })
  return out
}
