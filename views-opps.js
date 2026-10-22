// Opportunities: what to change or add to gain clicks, rankings and AI citations, biggest first.
// Search Console queries (when connected), AI Overviews seen on Google (serp.js), Compare's phrase gaps, page checks.
import { registrableDomain } from './analyze.js'
import { listSites, pagePerformance, pickProperty, token } from './gsc.js'
import { aiReady, descSuggest, titleSuggest } from './ai-ui.js'
import { aiOpps, aiVisibilityOpps, gapOpps, pageOpps, plan, queryOpps, ranked } from './opps.js'
import { ENGINES, ENGINE_BOTS, loadPrompts, loadRuns } from './aivis.js'
import { mergeKeywords, updateSaved } from './keywords.js'
import { h, head, block, tag, btn, copyBtn, num } from './ui.js'

const LABEL = { declining: ['bad', 'Losing clicks'], low_ctr: ['warn', 'Low click-through'], striking: ['good', 'Near the top'], deep: ['warn', 'Thin coverage'],
  ai_overview: ['warn', 'AI Overview'], gap: ['warn', 'Competitor gap'], ai_competitor: ['warn', 'AI visibility'], ai_comparison: ['warn', 'AI visibility'], ai_crawler: ['bad', 'AI crawler blocked'] }
const note = (t) => h('p', { class: 'muted small' }, t)

/** Search Console part: opportunities, or a note saying why there are none. */
async function fromSearchConsole(d) {
  let tok
  try { tok = await token(false) } catch { return { list: [], note: 'connect' } }
  const property = pickProperty(await listSites(tok), d.url)
  if (!property) return { list: [], note: 'No Search Console property covers this URL for the connected account.' }
  const perf = await pagePerformance(tok, property, d.url, { queryLimit: 250 })
  if (!perf.queries.length) return { list: [], note: 'Search Console has no queries for this URL in the last 28 days.' }
  return { list: queryOpps(perf.queries, d, { hadPrevious: !!perf.previous }), note: `${num(perf.queries.length)} queries checked from ${property} (last 28 days vs the 28 before).` }
}

async function saved(d) {
  const { 'serp:obs': obs = [], [`gaps:${d.url.replace(/#.*/, '')}`]: gaps } = await chrome.storage.local.get(['serp:obs', `gaps:${d.url.replace(/#.*/, '')}`])
  const host = d.host.replace(/^www\./, '')
  const doms = [...new Set(obs.map((o) => o.domain))].filter((dm) => host === dm || host.endsWith(`.${dm}`) || dm === registrableDomain(host))
  const dm = registrableDomain(d.host), { prompts } = await loadPrompts(dm)
  const latest = (await Promise.all(Object.values(prompts).map(async (prompt) => ({ prompt, run: (await loadRuns(dm, prompt.id)).at(-1) })))).filter((x) => x.run)
  const vis = aiVisibilityOpps(latest, d, { engineBots: ENGINE_BOTS, engineNames: Object.fromEntries(Object.entries(ENGINES).map(([k, v]) => [k, v.name])) })
  return { ai: [...doms.flatMap((dm) => aiOpps(obs, dm)), ...vis], gaps, seen: obs.filter((o) => doms.includes(o.domain)).length, prompts: latest.length }
}

const keywordish = (o) => o.query && !['ai_competitor', 'ai_comparison'].includes(o.kind) // AI prompts are questions, not keywords
/** Save the card's query to Keyword research; Search Console queries are this page's, so it becomes the target URL. */
const saveKeyword = (d, o) => btn('Save keyword', async (e) => {
  const gsc = o.kind !== 'ai_overview'
  await updateSaved(registrableDomain(d.host), (s) => mergeKeywords(s, [{ keyword: o.query, url: gsc ? d.url.replace(/#.*/, '') : '', tags: [o.kind.replace('_', ' ')] }], { source: gsc ? 'Search Console' : 'Google results (AI Overview)' }))
  e.target.textContent = 'Saved'; e.target.disabled = true
})

function card(d, o) {
  const [st, label] = LABEL[o.kind] ?? ['good', 'Add']
  return h('li', { class: 'opp' },
    h('div', { class: 'opp-head' }, tag(st, label), o.fresh ? tag('good', 'New query') : '', h('b', {}, o.title), o.gain ? h('span', { class: 'opp-gain mono', title: 'Estimate from a typical click-through curve' }, `≈ +${num(o.gain)} clicks / 28 days`) : ''),
    h('p', { class: 'small' }, o.why),
    h('ul', { class: 'opp-actions' }, o.actions.map((a) => h('li', {}, a))),
    keywordish(o) || (o.kind === 'low_ctr' && aiReady(d)) ? h('div', { class: 'bar-line' }, o.kind === 'low_ctr' && aiReady(d) ? [titleSuggest(d), descSuggest(d)] : '', keywordish(o) ? saveKeyword(d, o) : '') : '')
}

export const Opportunities = {
  render(d, { go }) {
    const answer = h('p', { class: 'answer' }, 'Looking for opportunities…')
    const out = h('div', {}, note('Checking Search Console and saved Google results…'))
    const header = head('Opportunities', '')
    header.firstChild.append(answer) // head() renders no answer line for '', so it goes in the title block
    ;(async () => {
      const [gsc, s] = await Promise.all([fromSearchConsole(d).catch((e) => ({ list: [], note: `Search Console: ${e.message}` })), saved(d)])
      const all = ranked([...gsc.list, ...s.ai, ...gapOpps(s.gaps), ...pageOpps(d)])
      const clicks = all.reduce((n, o) => n + (o.gain ?? 0), 0)
      answer.textContent = all.length ? `${all.length} things to change or add${clicks ? `, worth ≈ +${num(clicks)} clicks per 28 days by estimate` : ''}. Biggest first.` : 'Nothing stands out. Connect Search Console and check your keywords on Google to find more.'
      header.querySelector('.actions')?.remove()
      if (all.length) header.append(h('div', { class: 'actions' }, copyBtn('Copy action plan', () => plan(d.url, all))))
      out.replaceChildren(
        all.length ? h('ul', { class: 'opp-list' }, all.map((o) => card(d, o))) : '',
        block('Where these come from',
          h('ul', { class: 'opp-sources small' },
            h('li', {}, h('b', {}, 'Search Console: '), gsc.note === 'connect' ? ['not connected. ', btn('Connect in Settings', () => go('Settings'))] : gsc.note),
            h('li', {}, h('b', {}, 'AI Overviews: '), s.seen ? `${s.seen} Google search${s.seen === 1 ? '' : 'es'} recorded for this site.` : 'none recorded yet. On Google, type your domain into the SERP layout panel (bottom left) and search your target keywords; each search is saved here.'),
            h('li', {}, h('b', {}, 'AI visibility: '), s.prompts ? `latest runs of ${s.prompts} saved prompt${s.prompts === 1 ? '' : 's'}. ` : 'no prompts run yet. ', btn('Open AI visibility', () => go('AI visibility'))),
            h('li', {}, h('b', {}, 'Competitors: '), s.gaps ? `phrase gaps from Compare on ${s.gaps.at.slice(0, 10)}. ` : 'none yet. ', btn(s.gaps ? 'Compare again' : 'Run Compare', () => go('Compare'))),
            h('li', {}, h('b', {}, 'This page: '), 'content depth, structure, links, freshness and authorship checks.')),
          note('Click estimates use a typical click-through-rate-by-position curve; treat them as relative size, not a forecast.')))
    })()
    return [header, out]
  },
}
