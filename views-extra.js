// Redirects & headers tracer, and Local SEO.
import { analyseLocal } from './local.js'
import { geoGridBlock } from './views-geogrid.js'
import { analyseChain, NEEDS, trace } from './redirects.js'
import { AGENTS } from './ua.js'
import { h, head, block, kv, tag, btn, ext } from './ui.js'

export const Redirects = {
  name: 'Redirects & headers',
  render(d) {
    const input = h('input', { type: 'url', value: d.url, 'aria-label': 'URL to trace', class: 'url-input' })
    const ua = h('select', { 'aria-label': 'Request as' }, h('option', { value: '' }, 'Browser'), Object.keys(AGENTS).map((k) => h('option', { value: k }, k)))
    const out = h('div')
    const go = btn('Trace', async (e) => {
      let url
      try { url = new URL(input.value.trim()).href } catch { out.replaceChildren(h('p', { class: 'empty' }, 'Enter a full URL starting with http:// or https://')); return }
      if (!(await chrome.permissions.request(NEEDS))) { out.replaceChildren(h('p', { class: 'empty' }, 'Tracing needs the webRequest permission and site access, to see each hop.')); return }
      e.target.disabled = true; out.replaceChildren(h('p', { class: 'muted small' }, 'Tracing…'))
      try {
        const t = await trace(url, ua.value || null)
        const a = analyseChain(t)
        out.replaceChildren(
          a.findings.length ? h('ul', { class: 'checks' }, a.findings.map((f) => h('li', {}, tag(f.level), f.msg))) : h('p', {}, tag('good', 'Clean'), ` ${a.redirects ? `${a.redirects} redirect, permanent, ends in ${a.final?.status}` : `No redirects; ${a.final?.status ?? 'no response'}`}.`),
          block(`Chain (${t.hops.length} request${t.hops.length === 1 ? '' : 's'})`, h('ol', { class: 'hops' }, t.hops.map((x, i) => h('li', {},
            h('div', { class: 'hop-h' }, h('span', { class: `code st-${!x.status ? 'bad' : x.status < 300 ? 'good' : x.status < 400 ? 'warn' : 'bad'}` }, x.status ?? '—'), h('span', { class: 'mono' }, x.url), x.ms != null ? h('span', { class: 'muted small' }, `${x.ms} ms`) : ''),
            x.location ? h('div', { class: 'mono small muted' }, `Location → ${x.location}`) : '',
            x.headers ? h('details', { open: i === t.hops.length - 1 }, h('summary', {}, `${Object.keys(x.headers).length} response headers`), kv(Object.entries(x.headers).sort().map(([k, v]) => [h('span', { class: 'mono' }, k), h('span', { class: 'mono small' }, v)]))) : '')))),
          a.final?.headers ? block('Security headers (final response)', h('ul', { class: 'checks' }, a.security.map((s) => h('li', {}, tag(s.ok ? 'good' : 'warn', s.ok ? 'Set' : 'Missing'), h('b', {}, s.label), ' ', h('span', { class: 'muted small' }, s.value ?? s.why))))) : '')
      } catch (err) { out.replaceChildren(h('p', { class: 'empty' }, `Trace failed: ${err.message}`)) } finally { e.target.disabled = false }
    }, { class: 'btn primary' })
    return [head('Redirects & headers', 'Follow any URL hop by hop: status, Location, timing and every response header. No cookies are sent.'), h('div', { class: 'bar-line' }, input, ua, go), out]
  },
}

export const Local = {
  name: 'Local SEO',
  count: (d) => { const a = analyseLocal(d); return a.looksLocal ? a.checks.filter((c) => !c.ok).length || null : null },
  render(d, ctx) {
    const a = analyseLocal(d)
    if (!a.looksLocal) return [head('Local SEO', 'This page doesn’t look like a local business page (no LocalBusiness schema, map, Maps links, or phone + address).'), block('Links', h('div', { class: 'linkgrid' }, a.links.map(([l, u]) => ext(u, l))))]
    return [
      head('Local SEO', a.business ? `${a.business.name || 'Business'}: ${a.checks.filter((c) => !c.ok).length} local checks to look at.` : 'Local signals found, but no LocalBusiness schema.'),
      a.business ? block('Business (from schema)', kv([['Name', a.business.name], ['Phone', a.business.phone], ['Address', a.business.address], ['Hours', [].concat(a.business.hours ?? []).join(', ') || null]])) : '',
      block('Checks', h('ul', { class: 'checks' }, a.checks.map((c) => h('li', {}, tag(c.ok ? 'good' : c.level, c.ok ? 'Pass' : 'Check'), c.label)))),
      block(`Name / address / phone found (${a.sources.length})`, h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['Source', 'Name', 'Phone', 'Address'].map((t) => h('th', {}, t)))),
        h('tbody', {}, a.sources.map((s) => h('tr', {}, h('td', {}, s.source), h('td', {}, s.name), h('td', { class: 'mono nowrap' }, s.phone), h('td', { class: 'small' }, s.address))))))),
      geoGridBlock(d, a, ctx),
      a.gbpLinks.length ? block('Google Maps / Business Profile links on the page', h('div', {}, a.gbpLinks.map((u) => h('div', { class: 'mono small' }, ext(u))))) : '',
      block('Check the listing', h('div', { class: 'linkgrid' }, a.links.map(([l, u]) => ext(u, l)))),
      h('p', { class: 'muted small' }, 'Phones are compared on their last 10 digits. "Page text" matches are pattern-based and can include non-phone numbers.'),
    ]
  },
}
