// Google Search Console and Bing Webmaster Tools views, plus their Settings block.
import { bingForPage } from './bing.js'
import { ga4Block, indexNowPageBlock } from './views-ga4.js'
import { GSC_PERMS, TEST_USER_MSG, change, inspect, listSites, oauthProblem, pagePerformance, pickProperty, signIn, signOut, token } from './gsc.js'
import { loadKeys } from './keys.js'
import { h, head, block, kv, tag, btn, num, lineChart, ext } from './ui.js'

const note = (t) => h('p', { class: 'muted small' }, t)
const notice = () => h('div', { class: 'notice', role: 'note' }, h('b', {}, 'Test user required. '), TEST_USER_MSG)
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
const pos = (v) => (v == null ? '—' : v.toFixed(1))
const tiles = (rows) => h('div', { class: 'stats-row' }, rows.map(([v, l, delta]) => h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, l), delta ?? '')))
// Period-over-period deltas as status tags (glyph + word). Position: lower is better, shown as places gained or lost.
const pctDelta = (now, before) => { const c = change(now, before); return c == null ? '' : tag(c > 0.005 ? 'good' : c < -0.005 ? 'bad' : 'warn', `${c > 0 ? '+' : ''}${(c * 100).toFixed(c > -0.1 && c < 0.1 ? 1 : 0)}%`) }
const posDelta = (now, before) => { if (now == null || before == null) return ''; const d = before - now; return tag(d > 0.05 ? 'good' : d < -0.05 ? 'bad' : 'warn', Math.abs(d) < 0.05 ? '0.0' : `${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)}`) }

export const SearchConsole = {
  name: 'Search Console',
  render(d) {
    const out = h('div', {}, note('Checking connection…'))
    const connect = () => btn('Connect Google account', async (e) => {
      if (!(await chrome.permissions.request(GSC_PERMS))) { out.prepend(note('Chrome needs the identity permission and access to Google’s APIs to connect.')); return }
      e.target.disabled = true
      try { await signIn(); load() } catch (err) { out.replaceChildren(h('div', { class: 'empty' }, h('b', {}, 'Sign-in failed'), h('p', {}, err.message), connect())) }
    }, { class: 'btn primary' })
    const load = async () => {
      const problem = await oauthProblem()
      if (problem) { out.replaceChildren(h('div', { class: 'empty' }, h('b', {}, 'Google sign-in isn’t available in the loaded build yet'), h('p', {}, problem))); return }
      let tok
      try { tok = await token(false) } catch { out.replaceChildren(h('div', { class: 'empty' }, h('b', {}, 'Not connected'), h('p', {}, 'Connect the Google account that can see this site in Search Console.'), connect())); return }
      out.replaceChildren(note('Loading Search Console data…'))
      try {
        const sites = await listSites(tok)
        const property = pickProperty(sites, d.url)
        if (!property) { out.replaceChildren(h('div', { class: 'empty' }, h('b', {}, 'No Search Console property covers this URL for this Google account.'), h('p', {}, `Properties you can see: ${sites.map((s) => s.siteUrl).join(', ') || 'none'}.`), btn('Disconnect', () => signOut().then(load)))); return }
        const perf = await pagePerformance(tok, property, d.url)
        const insOut = h('div', {}, note('Ask Google whether this URL is indexed. Uses Search Console’s daily URL Inspection quota.'))
        const inspectBtn = btn('Inspect', async (e) => {
          e.target.disabled = true; insOut.replaceChildren(note('Inspecting…'))
          try { insOut.replaceChildren(inspection(await inspect(tok, property, d.url))) } catch (err) { insOut.replaceChildren(note(`Inspection failed: ${err.message}`)) } finally { e.target.disabled = false }
        }, { class: 'btn primary' })
        const p = perf.previous
        out.replaceChildren(
          note(`Property: ${property} · last 28 days vs the 28 days before (Search Console data lags 2–3 days)${perf.page !== d.url.replace(/#.*/, '') ? ` · reported as ${perf.page}` : ''}`),
          tiles([[num(perf.clicks), 'Clicks', pctDelta(perf.clicks, p?.clicks)], [num(perf.impressions), 'Impressions', pctDelta(perf.impressions, p?.impressions)],
            [pct(perf.ctr), 'CTR', pctDelta(perf.ctr, p?.ctr)], [pos(perf.position), 'Avg position', posDelta(perf.position, p?.position)]]),
          p ? '' : note('No data for the previous 28 days, so there is nothing to compare against.'),
          perf.daily.length > 1 ? block('Clicks per day', lineChart(perf.daily.map((x) => ({ date: x.date, value: x.clicks })), { label: 'Clicks', height: 130 })) : note('No search traffic recorded for this URL in the period.'),
          perf.queries.length ? block(`Top queries (${perf.queries.length})`, h('div', { class: 'scroll-x crawl-list' }, h('table', {}, h('thead', {}, h('tr', {}, ['Query', 'Clicks', 'Δ clicks', 'Impr.', 'CTR', 'Pos.', 'Δ pos.'].map((t) => h('th', {}, t)))),
            h('tbody', {}, perf.queries.map((q) => h('tr', {}, h('td', {}, q.query), h('td', { class: 'mono' }, num(q.clicks)),
              h('td', { class: 'mono nowrap' }, q.prev ? pctDelta(q.clicks, q.prev.clicks) || (q.clicks ? tag('good', 'new clicks') : '—') : tag('good', 'new')),
              h('td', { class: 'mono' }, num(q.impressions)), h('td', { class: 'mono' }, pct(q.ctr)), h('td', { class: 'mono' }, pos(q.position)),
              h('td', { class: 'mono nowrap' }, q.prev ? posDelta(q.position, q.prev.position) : '—'))))))) : '',
          block('URL Inspection (Google’s index)', h('div', { class: 'bar-line' }, inspectBtn), insOut),
          h('div', { class: 'bar-line' }, btn('Disconnect', () => signOut().then(load))))
      } catch (e) { out.replaceChildren(h('div', { class: 'empty' }, h('p', {}, e.message), /403|denied|verification/i.test(e.message) ? h('p', { class: 'small' }, TEST_USER_MSG) : '')) }
    }
    load()
    return [head('Search Console', 'Google’s own data for this URL: clicks, impressions, queries and index status.'), notice(), out, ga4Block(d)]
  },
}

function inspection(ins) {
  const ix = ins.indexStatusResult ?? {}
  const canonMismatch = ix.googleCanonical && ix.userCanonical && ix.googleCanonical !== ix.userCanonical
  return h('div', {}, kv([
    ['Verdict', ix.verdict ?? '—', ix.verdict ? tag(ix.verdict === 'PASS' ? 'good' : ix.verdict === 'NEUTRAL' ? 'warn' : 'bad', ix.verdict === 'PASS' ? 'Indexed' : 'Not indexed') : ''],
    ['Coverage', ix.coverageState], ['Indexing allowed', ix.indexingState], ['robots.txt', ix.robotsTxtState], ['Page fetch', ix.pageFetchState],
    ['Last crawl', ix.lastCrawlTime?.replace('T', ' ').slice(0, 16)], ['Crawled as', ix.crawledAs],
    ['Google-selected canonical', ix.googleCanonical && h('span', { class: 'mono small' }, ix.googleCanonical), canonMismatch ? tag('warn', 'Differs from yours') : ''],
    ['Your canonical', ix.userCanonical && h('span', { class: 'mono small' }, ix.userCanonical)],
    ['Rich results', (ins.richResultsResult?.detectedItems ?? []).map((i) => i.richResultType).join(', ') || null, ins.richResultsResult?.verdict ? tag(ins.richResultsResult.verdict === 'PASS' ? 'good' : 'warn', ins.richResultsResult.verdict) : ''],
  ]), ins.inspectionResultLink ? ext(ins.inspectionResultLink, 'Open in Search Console') : '')
}

export const Bing = {
  name: 'Bing Webmaster',
  render(d, { go }) {
    const out = h('div', {}, note('Loading…'))
    loadKeys().then(async (cfg) => {
      const key = cfg.creds.bing?.key
      if (!key) { out.replaceChildren(h('div', { class: 'empty' }, h('b', {}, 'Connect Bing Webmaster Tools'), h('p', {}, 'Connect Bing Webmaster Tools in Settings › Connectors with an API key (Bing Webmaster › Settings › API access).'), btn('Open Settings', () => go('Settings')))); return }
      try {
        const r = await bingForPage(key, d.url)
        if (!r.site) { out.replaceChildren(h('p', { class: 'empty' }, `No verified Bing Webmaster site covers this URL. Sites in this account: ${r.sites.join(', ') || 'none'}.`)); return }
        out.replaceChildren(
          note(`Site: ${r.site}${r.range ? ` · ${r.range}` : ''}`),
          r.page ? tiles([[num(r.page.clicks), 'Clicks (this page)'], [num(r.page.impressions), 'Impressions'], [pos(r.page.position), 'Avg position']]) : note('Bing has no click or impression data for this exact URL.'),
          r.topQueries.length ? block('Top queries (whole site)', h('div', { class: 'scroll-x crawl-list' }, h('table', {}, h('thead', {}, h('tr', {}, ['Query', 'Clicks', 'Impr.', 'Pos.'].map((t) => h('th', {}, t)))),
            h('tbody', {}, r.topQueries.map((q) => h('tr', {}, h('td', {}, q.key), h('td', { class: 'mono' }, num(q.clicks)), h('td', { class: 'mono' }, num(q.impressions)), h('td', { class: 'mono' }, pos(q.position)))))))) : '',
          block(`Inbound links to this page (${r.inbound.length}${r.inboundPages > 1 ? '+' : ''})`, r.inbound.length ? h('div', { class: 'scroll-x crawl-list' }, h('table', {}, h('tbody', {}, r.inbound.map((l) => h('tr', {}, h('td', { class: 'mono small' }, ext(l.source)), h('td', { class: 'small' }, l.anchor ?? '')))))) : note('Bing reports no inbound links to this URL.')))
      } catch (e) { out.replaceChildren(h('p', { class: 'empty' }, e.message)) }
    })
    return [head('Bing Webmaster', 'Bing’s data for this URL: clicks, impressions, top queries and inbound links.'), out, indexNowPageBlock(d, { go })]
  },
}
