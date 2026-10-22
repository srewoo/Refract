// Link/asset/site views: Links, Images, Schema, Social, Hreflang, Ads & tags, Domain, Tools, Settings.
import { linkStats, registrableDomain, toCsv, toolLinks } from './analyze.js'
import { backupBlock } from './views-backup.js'
import { spendBlock } from './views-spend.js'
import { heritageBlock, hreflangBuilder, schemaTemplatesBlock } from './views-tools.js'
import { imageFormats, schemaTree, topDomains } from './geo.js'
import { overlayBtn } from './views-page.js'
import { aiReady, altSuggest, jsonLdDraft } from './ai-ui.js'
import { aiStatus, session } from './ai.js'
import { connectorsPanel } from './connectors.js'
import { AGENTS, setAgent } from './ua.js'
import { LINK_CHECK_MAX, checkLinks, targetKey, uniqueTargets } from './linkcheck.js'
import { h, head, block, kv, tag, btn, ext, num, bars, stack, tree, rankLine, download } from './ui.js'

// Link check outcome → status tag. Status code shown where the response gave one.
const LINK_TAG = { ok: ['good', 'OK'], redirect: ['warn', 'Redirect'], restricted: ['warn', 'Restricted'], broken: ['bad', 'Broken'], error: ['bad', 'No response'] }
const linkTag = (r) => tag(LINK_TAG[r.outcome][0], `${LINK_TAG[r.outcome][1]}${r.status ? ` ${r.status}` : ''}`)

export const Links = {
  render(d) {
    const st = linkStats(d.links)
    let filter = 'all'
    const list = h('div', { class: 'scroll-x' })
    const filters = h('div', { class: 'seg-ctl', role: 'tablist' })
    const result = (l) => d.linkCheck?.get(targetKey(l.href))
    const problem = (l) => { const r = result(l); return !!r && r.outcome !== 'ok' }
    const summary = h('div')
    const draw = () => {
      filters.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.f === filter)))
      const rows = d.links.filter((l) => filter === 'all' || (filter === 'internal' ? l.internal : filter === 'external' ? !l.internal : filter === 'problems' ? problem(l) : l.nofollow || l.sponsored || l.ugc))
      list.replaceChildren(h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Anchor text'), h('th', {}, 'URL'), h('th', {}, 'rel'), d.linkCheck ? h('th', {}, 'Status') : '')),
        h('tbody', {}, rows.slice(0, 400).map((l) => h('tr', {}, h('td', {}, l.text || h('span', { class: 'muted' }, '(no text)')), h('td', { class: 'mono' }, ext(l.href)),
          h('td', { class: 'mono' }, [l.nofollow && 'nofollow', l.sponsored && 'sponsored', l.ugc && 'ugc'].filter(Boolean).join(' ') || '—'),
          d.linkCheck ? h('td', { class: 'link-st' }, result(l) ? linkTag(result(l)) : h('span', { class: 'muted' }, targetKey(l.href) ? '…' : 'not http')) : '')))),
      rows.length > 400 ? h('p', { class: 'muted' }, `First 400 of ${rows.length}; Export CSV has all.`) : '')
      if (!d.linkCheck) return
      const counts = Object.fromEntries(Object.keys(LINK_TAG).map((k) => [k, 0]))
      for (const r of d.linkCheck.values()) counts[r.outcome]++
      summary.replaceChildren(stack([{ label: 'OK', value: counts.ok, status: 'good' }, { label: 'Redirect', value: counts.redirect, status: 'warn' }, { label: 'Restricted (401/403/429)', value: counts.restricted, status: 'warn' }, { label: 'Broken', value: counts.broken, status: 'bad' }, { label: 'No response', value: counts.error, status: 'bad' }], { caption: 'Link status' }))
    }
    ;['all', 'internal', 'external', 'nofollow', 'problems'].forEach((f) => filters.append(h('button', { role: 'tab', type: 'button', 'data-f': f, onclick: () => { filter = f; draw() } }, f)))
    draw()
    const dom = topDomains(d.links)
    const checkStatus = h('span', { class: 'muted small', role: 'status' })
    const checkBtn = btn('Check links', async (e) => {
      // permissions.request first, inside the click: an earlier await would drop the user gesture.
      if (!(await chrome.permissions.request({ origins: ['<all_urls>'] }))) { checkStatus.textContent = 'Site access is needed to request the links.'; return }
      e.target.disabled = true
      d.linkCheck = new Map()
      let queued = false
      const redraw = () => { if (!queued) { queued = true; setTimeout(() => { queued = false; draw() }, 250) } }
      try {
        await checkLinks(d.links, (url, r, done, total) => { d.linkCheck.set(url, r); checkStatus.textContent = `Checked ${done} of ${total}…`; redraw() })
        const bad = [...d.linkCheck.values()].filter((r) => r.outcome === 'broken' || r.outcome === 'error').length
        const total = uniqueTargets(d.links).length
        checkStatus.textContent = `Done. ${bad} broken or not responding${total > LINK_CHECK_MAX ? ` · first ${LINK_CHECK_MAX} of ${total} unique links checked` : ''}.`
      } catch (err) { checkStatus.textContent = `Check failed: ${err.message ?? err}` } finally { e.target.disabled = false; draw() }
    })
    return [
      head('On-page links', `${num(st.total)} links (${num(st.unique)} unique) to ${num(new Set(d.links.filter((l) => !l.internal).map((l) => { try { return new URL(l.href).hostname } catch { return l.href } })).size)} external hosts.`,
        checkBtn, overlayBtn(d, 'nofollow', 'Highlight nofollow'),
        btn('Export CSV', () => download(`links-${d.host}.csv`, toCsv(d.linkCheck ? d.links.map((l) => ({ ...l, status: result(l)?.status ?? '', outcome: result(l)?.outcome ?? '' })) : d.links)))),
      h('p', { class: 'muted small' }, 'Check links requests every unique link on this page (up to 300, six at a time, no cookies) and reports its status. ', checkStatus),
      summary,
      h('div', { class: 'split' },
        h('div', {}, stack([{ label: 'Internal', value: st.internal }, { label: 'External', value: st.external }], { caption: 'Where links point' }),
          stack([{ label: 'Follow', value: st.total - st.nofollow }, { label: 'Nofollow', value: st.nofollow }, { label: 'Sponsored / UGC', value: st.sponsored + st.ugc }], { caption: 'How much link equity passes' })),
        block('Most-linked external domains', dom.length ? bars(dom) : h('p', { class: 'muted' }, 'No external links.'))),
      filters, list,
    ]
  },
}

export const Images = {
  count: (d) => d.images.filter((i) => i.alt === null).length || null,
  render(d) {
    const missing = d.images.filter((i) => i.alt === null)
    const empty = d.images.filter((i) => i.alt === '')
    return [
      head('Images', missing.length ? `${missing.length} of ${d.images.length} images have no alt attribute.` : `All ${d.images.length} images declare alt text.`,
        overlayBtn(d, 'alt', 'Mark on page'), btn('Export all', () => download(`images-${d.host}.csv`, toCsv(d.images))), missing.length ? btn('Export missing alt', () => download(`images-noalt-${d.host}.csv`, toCsv(missing))) : ''),
      h('div', { class: 'split' },
        stack([{ label: 'Descriptive alt', value: d.images.length - missing.length - empty.length }, { label: 'Missing alt', value: missing.length }, { label: 'Empty (decorative)', value: empty.length }], { caption: 'Alt text coverage' }),
        block('Formats', bars(imageFormats(d.images)))),
      h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Alt text'), h('th', {}, 'Size'), h('th', {}, 'Lazy'))),
        h('tbody', {}, d.images.slice(0, 250).map((i) => h('tr', {},
          h('td', {}, i.src ? h('img', { class: 'thumb', src: i.src, alt: '', loading: 'lazy' }) : ''),
          h('td', {}, i.alt === null ? tag('bad', 'No alt') : i.alt || h('span', { class: 'muted' }, '(empty)'), h('div', { class: 'mono small' }, ext(i.src, i.src.split('/').pop().slice(0, 70) || i.src)), i.alt === null && aiReady(d) ? altSuggest(d, i) : ''),
          h('td', { class: 'mono' }, i.width ? `${i.width}×${i.height}` : '—'), h('td', {}, i.lazy ? 'yes' : '—')))))),
    ]
  },
}

export const Schema = {
  count: (d) => d.schema.jsonLd.filter((j) => !j.ok).length || null,
  render(d) {
    const sc = d.schema
    const t = schemaTree(sc.jsonLd)
    return [
      head('Structured data', sc.types.length ? `${sc.jsonLd.length} JSON-LD block${sc.jsonLd.length > 1 ? 's' : ''} describing ${sc.types.length} type${sc.types.length > 1 ? 's' : ''}.` : 'No JSON-LD. Rich results and AI answers lean on it.',
        btn('Rich Results Test', () => chrome.tabs.create({ url: `https://search.google.com/test/rich-results?url=${encodeURIComponent(d.url)}` })),
        btn('Schema validator', () => chrome.tabs.create({ url: `https://validator.schema.org/#url=${encodeURIComponent(d.url)}` })),
        sc.jsonLd.length ? btn('Export JSON', () => download(`schema-${d.host}.json`, JSON.stringify(sc.jsonLd.map((j) => j.data ?? j.raw), null, 2), 'application/json')) : ''),
      aiReady(d) ? block('Draft with Chrome AI (on-device)', jsonLdDraft(d)) : '',
      schemaTemplatesBlock(d),
      t.length ? block('Type tree', tree(t.map((n) => ({ depth: n.depth, label: n.type, note: n.key ? `via ${n.key}` : '' })))) : '',
      sc.microdata.length ? block('Microdata', h('ul', { class: 'chips mono' }, sc.microdata.map((m) => h('li', {}, m)))) : '',
      sc.jsonLd.map((j, i) => h('details', { class: 'code', open: !j.ok }, h('summary', {}, `Block ${i + 1}`, j.ok ? '' : tag('bad', 'Invalid JSON')), h('pre', {}, j.ok ? JSON.stringify(j.data, null, 2) : `${j.error}\n\n${j.raw}`))),
    ]
  },
}

export const Social = {
  count: (d) => (!d.social['og:title'] && !d.social['og:image'] ? 1 : null),
  render(d) {
    const so = d.social
    const og = { title: so['og:title'], desc: so['og:description'], img: so['og:image'] }
    const tw = { title: so['twitter:title'] ?? og.title, desc: so['twitter:description'] ?? og.desc, img: so['twitter:image'] ?? og.img }
    const card = (c, label) => h('figure', { class: 'card' }, c.img ? h('img', { src: new URL(c.img, d.url).href, alt: '' }) : h('div', { class: 'card-noimg' }, 'No image: the share will be text-only'),
      h('figcaption', {}, h('span', { class: 'muted small' }, `${label} · ${d.host}`), h('b', {}, c.title ?? '(no title)'), h('span', { class: 'muted' }, c.desc ?? '')))
    return [
      head('Social previews', `${Object.keys(so).length} Open Graph / Twitter tags. Card type: ${so['twitter:card'] ?? 'not set'}.`,
        btn('Facebook debugger', () => chrome.tabs.create({ url: `https://developers.facebook.com/tools/debug/?q=${encodeURIComponent(d.url)}` }))),
      h('div', { class: 'split' }, block('Facebook / LinkedIn', card(og, 'Open Graph')), block('X / Twitter', card(tw, so['twitter:card'] ?? 'summary'))),
      Object.keys(so).length ? block('All tags', kv(Object.entries(so).map(([k, v]) => [h('span', { class: 'mono' }, k), v]))) : '',
    ]
  },
}

const LANG_RE = /^(x-default|[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|\d{3}))?)$/i
export const Hreflang = {
  count: (d) => d.hreflang.filter((x) => !LANG_RE.test(x.lang)).length || null,
  render(d) {
    const hl = d.hreflang
    if (!hl.length) return [head('Hreflang', 'No hreflang annotations. Only needed if this page has language or region variants.'), hreflangBuilder(d)]
    const self = hl.some((x) => x.href.replace(/#.*/, '') === d.url.replace(/#.*/, ''))
    const dup = hl.map((x) => x.lang.toLowerCase()).filter((v, i, a) => a.indexOf(v) !== i)
    return [
      head('Hreflang', `${hl.length} alternates.`),
      block('Checks', h('ul', { class: 'checks' },
        h('li', {}, tag(self ? 'good' : 'bad', self ? 'Pass' : 'Fix'), 'Includes a self-referencing entry'),
        h('li', {}, tag(hl.some((x) => x.lang === 'x-default') ? 'good' : 'warn', hl.some((x) => x.lang === 'x-default') ? 'Pass' : 'Check'), 'Has x-default'),
        h('li', {}, tag(dup.length ? 'bad' : 'good', dup.length ? 'Fix' : 'Pass'), dup.length ? `Duplicate codes: ${[...new Set(dup)].join(', ')}` : 'No duplicate language codes'))),
      h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Code'), h('th', {}, 'URL'), h('th', {}, ''))),
        h('tbody', {}, hl.map((x) => h('tr', {}, h('td', { class: 'mono' }, x.lang), h('td', { class: 'mono' }, ext(x.href)), h('td', {}, LANG_RE.test(x.lang) ? '' : tag('bad', 'Invalid code'))))))),
      hreflangBuilder(d),
    ]
  },
}

export const Tags = {
  name: 'Ads & tags',
  render(d) {
    const t = d.tags
    const list = (ids) => (ids.length ? h('div', {}, ids.map((i) => h('div', { class: 'mono' }, i))) : null)
    return [
      head('Ads & tracking', t.adsense.length ? `AdSense publisher ${t.adsense.join(', ')} with ${t.adSlots} ad slot${t.adSlots === 1 ? '' : 's'} on this page.` : 'No AdSense code found on this page.'),
      kv([
        ['AdSense publisher', list(t.adsense), t.adsense.length ? ext(`https://${new URL(d.url).hostname}/ads.txt`, 'ads.txt') : ''],
        ['Ad slots', t.adSlots || null],
        ['Google Analytics 4', list(t.ga4)], ['Tag Manager', list(t.gtm)], ['Universal Analytics (retired)', list(t.uaLegacy), t.uaLegacy.length ? tag('warn', 'Remove') : ''],
        ['Other trackers', t.other.length ? t.other.join(', ') : null],
      ]),
      h('p', { class: 'muted small' }, 'Detected from script URLs and inline scripts present in the DOM; tags injected later by consent managers may not show.'),
    ]
  },
}

async function json(url) {
  const r = await fetch(url, { headers: { accept: 'application/json, application/rdap+json' } })
  if (!r.ok) throw new Error(`${r.status}`)
  return r.json()
}
const year = (iso) => new Date(iso).getFullYear() + new Date(iso).getMonth() / 12

export const Domain = {
  render(d) {
    if (/^[\d.]+$|:/.test(d.host)) return [head('Domain', `${d.host} is an IP address, so there is no domain rank, registration or archive history to look up.`)]
    const out = h('div', {}, h('p', { class: 'muted' }, 'Looking up rank, registration, DNS and archive history…'))
    loadDomain(d).then((parts) => out.replaceChildren(...parts), (e) => out.replaceChildren(h('p', { class: 'empty' }, `Lookup failed: ${e.message}`)))
    return [head('Domain', `${registrableDomain(d.host)} · popularity, age, hosting and history from public sources.`), out]
  },
}

async function loadDomain(d) {
  const domain = registrableDomain(d.host)
  const dns = async (type) => (await json(`https://dns.google/resolve?name=${encodeURIComponent(d.host)}&type=${type}`)).Answer?.map((a) => a.data) ?? []
  const [rank, rdap, a, aaaa, ns, mx, wb] = await Promise.allSettled([
    json(`https://tranco-list.eu/api/ranks/domain/${domain}`),
    json(`https://rdap.org/domain/${encodeURIComponent(domain)}`),
    dns('A'), dns('AAAA'), dns('NS'), dns('MX'),
    json(`https://archive.org/wayback/available?url=${encodeURIComponent(domain)}&timestamp=19900101`),
  ])
  const val = (r) => (r.status === 'fulfilled' ? r.value : null)
  const ip = val(a)?.find((x) => /^\d+\.\d+\.\d+\.\d+$/.test(x))
  const geo = ip ? await json(`https://ipinfo.io/${ip}/json`).catch(() => null) : null
  const reg = val(rdap)
  const ev = (k) => reg?.events?.find((e) => e.eventAction === k)?.eventDate
  const created = ev('registration'), expires = ev('expiration')
  const firstSnap = val(wb)?.archived_snapshots?.closest
  const firstArchived = firstSnap?.timestamp ? `${firstSnap.timestamp.slice(0, 4)}-${firstSnap.timestamp.slice(4, 6)}-${firstSnap.timestamp.slice(6, 8)}` : null
  const registrar = reg?.entities?.find((e) => e.roles?.includes('registrar'))?.vcardArray?.[1]?.find((f) => f[0] === 'fn')?.[3]
  const ranks = (val(rank)?.ranks ?? []).slice().sort((x, y) => x.date.localeCompare(y.date))
  const list = (r) => { const v = val(r); return v?.length ? h('div', {}, v.map((x) => h('div', { class: 'mono' }, x))) : r.status === 'rejected' ? h('span', { class: 'muted' }, 'lookup failed') : null }

  const marks = [['First archived', firstArchived], ['Registered', created], ['Today', new Date().toISOString()], ['Expires', expires]].filter(([, v]) => v)
  const y0 = Math.floor(Math.min(...marks.map(([, v]) => year(v)))), y1 = Math.ceil(Math.max(...marks.map(([, v]) => year(v))))
  const pos = (v) => `${((year(v) - y0) / Math.max(1, y1 - y0)) * 100}%`
  return [
    block('Popularity · Tranco top-sites rank', ranks.length > 1 ? [rankLine(ranks), h('p', { class: 'muted small' }, `Latest #${num(ranks.at(-1).rank)} on ${ranks.at(-1).date}. Tranco ranks the top ~1M sites; lower is more popular.`)]
      : h('p', { class: 'empty' }, rank.status === 'rejected' ? 'Tranco is rate-limiting; open this tab again in a minute.' : `${domain} is outside the Tranco top 1M, so traffic is likely small.`)),
    marks.length > 1 ? block('Domain lifetime', h('div', { class: 'life' }, h('div', { class: 'life-track' }, created && expires ? h('span', { class: 'life-span', style: `left:${pos(created)};width:calc(${pos(expires)} - ${pos(created)})` }) : ''),
      // Alternate labels above/below the bar so close dates (Today vs Expires) never collide; ends anchor inward.
      marks.map(([label, v], i) => h('span', { class: `life-mark ${i % 2 ? 'below' : 'above'}${i === 0 ? ' first' : ''}${i === marks.length - 1 ? ' last' : ''}${label === 'Today' ? ' now' : ''}`, style: `left:${pos(v)}`, title: `${label}: ${v.slice(0, 10)}` }, h('b', {}, label), h('span', {}, v.slice(0, 10)))),
    )) : '',
    h('div', { class: 'split' },
      block('Registration (RDAP)', reg ? kv([['Registrar', registrar], ['Created', created?.slice(0, 10), created ? `${((Date.now() - Date.parse(created)) / 3.156e10).toFixed(1)} yrs` : ''], ['Expires', expires?.slice(0, 10)], ['Updated', ev('last changed')?.slice(0, 10)], ['Status', reg.status?.join(', ')], ['Nameservers', reg.nameservers?.length ? h('div', {}, reg.nameservers.map((n) => h('div', { class: 'mono' }, n.ldhName.toLowerCase()))) : null]])
        : h('p', { class: 'muted' }, 'No RDAP for this TLD. ', ext(`https://lookup.icann.org/en/lookup?name=${domain}`, 'ICANN lookup'))),
      block('Hosting', kv([['IP', ip && h('span', { class: 'mono' }, ip)], ['Location', geo && [geo.city, geo.region, geo.country].filter(Boolean).join(', ')], ['Network', geo?.org], ['Reverse DNS', geo?.hostname], ['First archived', firstArchived && ext(`https://web.archive.org/web/${firstSnap.timestamp}/${domain}`, firstArchived)]]))),
    block('DNS', kv([['A', list(a)], ['AAAA', list(aaaa)], ['NS', list(ns)], ['MX', list(mx)]])),
    heritageBlock(d),
  ]
}

export const Tools = {
  render(d) {
    const status = h('span', { class: 'muted' })
    const pick = h('select', { 'aria-label': 'Request this page as', onchange: async (e) => {
      try {
        await setAgent(d.tabId, e.target.value || null)
        status.textContent = `Reloaded${e.target.value ? ` as ${e.target.value}` : ''}. Reopen Refract SEO to analyse that version.`
      } catch (err) { status.textContent = err.message; e.target.value = d.agent ?? '' }
    } }, h('option', { value: '' }, 'Normal browser'), Object.keys(AGENTS).map((k) => h('option', { value: k, selected: k === d.agent }, k)))
    return [
      head('Tools', 'Crawler view for this tab, plus the outside tools for this site.'),
      block('View as crawler (this tab)', h('div', { class: 'bar-line' }, pick, status),
        h('p', { class: 'muted small' }, 'Sets the User-Agent header for every request from this tab, then reloads. In-page navigator.userAgent is unchanged.')),
      Object.entries(toolLinks(d.url, d.host)).map(([group, items]) => block(group, h('div', { class: 'linkgrid' }, items.map(([label, href]) => ext(href, label))))),
    ]
  },
}

export const DEFAULTS = { serpBadges: true, paaButton: true, startView: 'Overview' }
/** Old view names → current ones: issue links, ?view= links and saved start views still use the old names. */
export const RENAMED = { Keywords: 'On-page terms', Links: 'On-page links' }
export const viewName = (v) => RENAMED[v] ?? v
export const Settings = {
  render(d, { views }) {
    const out = h('div')
    chrome.storage.sync.get(DEFAULTS).then((cfg) => {
      const save = (k, v) => chrome.storage.sync.set({ [k]: v })
      const toggle = (k, label, hint) => h('label', { class: 'setting' }, h('input', { type: 'checkbox', checked: cfg[k], onchange: (e) => save(k, e.target.checked) }), h('span', {}, h('b', {}, label), h('span', { class: 'muted small' }, hint)))
      out.replaceChildren(
        toggle('serpBadges', 'Google results: position badges, SERP layout panel and Copy results CSV', 'Applies on next Google search.'),
        toggle('paaButton', 'Google results: People Also Ask extractor button', 'Applies on next Google search.'),
        aiSetting(d),
        h('label', { class: 'setting' }, h('span', {}, h('b', {}, 'Open on'), h('span', { class: 'muted small' }, 'First view when the popup opens.')),
          h('select', { onchange: (e) => save('startView', e.target.value) }, views.map((v) => h('option', { value: v, selected: v === viewName(cfg.startView) }, v)))))
    })
    return [head('Settings', 'Preferences sync with your Chrome profile; API keys stay on this computer.'), out, connectorsPanel(), spendBlock(), backupBlock(), h('p', { class: 'muted small' }, h('a', { href: 'help.html', target: '_blank' }, 'Help'), ' · ', h('a', { href: 'privacy.html', target: '_blank' }, 'Privacy policy'))]
  },
}

const AI_LABEL = { available: 'Ready', downloadable: 'Not downloaded yet', downloading: 'Downloading…', unavailable: 'Not supported on this device', unsupported: 'Not available in this Chrome' }
function aiSetting(d) {
  const st = h('span', { class: 'muted small' }, `${AI_LABEL[d.ai] ?? d.ai}. Suggestions for titles, descriptions, alt text and JSON-LD run on-device; page text never leaves this computer.`)
  const dl = ['downloadable', 'downloading'].includes(d.ai) ? btn('Download model', async (e) => {
    e.target.disabled = true
    try { await session((p) => { st.textContent = `Downloading: ${Math.round(p * 100)}%` }); d.ai = await aiStatus(); st.textContent = AI_LABEL[d.ai] } catch (err) { st.textContent = `Download failed: ${err.message ?? err}`; e.target.disabled = false }
  }) : ''
  return h('div', { class: 'setting' }, h('span', {}, h('b', {}, 'Chrome built-in AI (Gemini Nano)'), st), dl)
}
