// Agent readiness: what AI agents (not just crawlers) find on this site. probeAgent runs *in the page* via
// executeScript, so same-origin fetches need no host permission; it is serialized, so it has no imports or closures.
// evaluateAgent is pure and turns the probe into checks. Draft standards are labelled as drafts.

export async function probeAgent() {
  const origin = location.origin
  const get = async (path, headers = {}) => {
    try {
      const r = await fetch(origin + path, { cache: 'no-store', credentials: 'omit', headers })
      const type = r.headers.get('content-type') ?? ''
      return { status: r.status, type, vary: r.headers.get('vary') ?? '', link: r.headers.get('link') ?? '', text: r.ok ? (await r.text()).slice(0, 6000) : '' }
    } catch (e) { return { status: null, error: String(e.message ?? e) } }
  }
  const [llms, llmsFull, catalog, apiCatalog, agentCard, markdown] = await Promise.all([
    get('/llms.txt'), get('/llms-full.txt'), get('/.well-known/ai-catalog.json'), get('/.well-known/api-catalog'), get('/.well-known/agent-card.json'),
    get(location.pathname + location.search, { accept: 'text/markdown' }),
  ])
  const scripts = [...document.scripts].map((s) => s.textContent).join('\n').slice(0, 400000)
  const forms = [...document.forms]
  return {
    llms, llmsFull, catalog, apiCatalog, agentCard,
    markdown: { status: markdown.status, type: markdown.type, vary: markdown.vary, link: markdown.link },
    mdAlternate: document.querySelector('link[rel~="alternate"][type="text/markdown"]')?.getAttribute('href') ?? null,
    catalogLink: document.querySelector('link[rel~="ai-catalog"]')?.getAttribute('href') ?? null,
    webmcp: {
      api: 'modelContext' in navigator || 'modelContext' in document,
      registerTool: (scripts.match(/\bregisterTool\s*\(/g) ?? []).length,
      forms: forms.length, annotatedForms: forms.filter((f) => f.hasAttribute('toolname') || f.hasAttribute('tooldescription')).length,
    },
  }
}

const CS_KEYS = ['search', 'ai-input', 'ai-train']
/** robots.txt Content-Signal lines (draft) and Agentmap directives. */
export function robotsSignals(robotsTxt) {
  const lines = (robotsTxt ?? '').split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim())
  const signals = lines.filter((l) => /^content-signal\s*:/i.test(l)).map((l) => l.split(':').slice(1).join(':').trim())
  const parsed = signals.map((v) => Object.fromEntries(v.split(',').map((p) => p.split('=').map((x) => x.trim().toLowerCase())).filter((p) => p.length === 2)))
  const problems = parsed.flatMap((o) => Object.entries(o).filter(([k, v]) => !CS_KEYS.includes(k) || !['yes', 'no'].includes(v)).map(([k, v]) => `${k}=${v}`))
  return { contentSignal: parsed, problems, agentmap: lines.filter((l) => /^agentmap\s*:/i.test(l)).map((l) => l.split(':').slice(1).join(':').trim()) }
}

/** Lighthouse 13.5 "llms-txt" rules, plus llmstxt.org structure notes. 4xx = not applicable (no file). */
export function evaluateLlms(rec) {
  if (!rec || rec.status == null) return { verdict: 'fail', errors: ['could not be fetched'], notes: [] }
  if (rec.status >= 500) return { verdict: 'fail', errors: [`HTTP ${rec.status}`], notes: [] }
  if (rec.status >= 400) return { verdict: 'missing', errors: [], notes: [] }
  const t = (rec.text ?? '').replace(/^\uFEFF/, '')
  if (/^\s*<(!doctype|html)/i.test(t) || /text\/html/i.test(rec.type ?? '')) return { verdict: 'fail', errors: ['the server answers /llms.txt with an HTML page (a catch-all), not a text file'], notes: [] }
  const errors = [], notes = []
  if (!/^\s*#\s+.+/m.test(t)) errors.push('no H1 title (“# Title”)')
  if (!/\[.+\]\(.+\)/.test(t)) errors.push('no Markdown links')
  if (t.length < 50) errors.push('shorter than 50 characters')
  const first = t.split(/\r?\n/).find((l) => l.trim())
  if (first && !first.trim().startsWith('# ')) notes.push('llmstxt.org expects the H1 on the first line')
  if (!/^\s*>\s+\S/m.test(t)) notes.push('no “> summary” line')
  if (!/^\s*##\s+\S/m.test(t)) notes.push('no H2 sections grouping the links')
  return { verdict: errors.length ? 'fail' : 'pass', errors, notes }
}

const found = (rec, json) => rec?.status === 200 && (!json || /json/i.test(rec.type ?? '')) && !/^\s*</.test(rec.text ?? '')
/** Probe + robots.txt → checks: { label, status: 'good'|'warn'|'info', detail, standard }. Order: most actionable first. */
export function evaluateAgent(p, robotsTxt) {
  const llm = evaluateLlms(p.llms), rs = robotsSignals(robotsTxt)
  const md = /text\/markdown/i.test(p.markdown?.type ?? '')
  const catalogVia = [rs.agentmap.length && 'robots.txt Agentmap', p.catalogLink && '<link rel="ai-catalog">', /ai-catalog/i.test(p.markdown?.link ?? '') && 'HTTP Link header', found(p.catalog, true) && '/.well-known/ai-catalog.json'].filter(Boolean)
  return [
    { label: '/llms.txt', standard: 'llmstxt.org (community); Lighthouse checks it; Google Search ignores it',
      status: llm.verdict === 'pass' ? (llm.notes.length ? 'warn' : 'good') : llm.verdict === 'missing' ? 'info' : 'warn',
      detail: llm.verdict === 'missing' ? 'Not published. Optional: Lighthouse leaves it out of the score when absent.' : llm.verdict === 'pass' ? (llm.notes.length ? `Passes Lighthouse; ${llm.notes.join('; ')}.` : 'Passes Lighthouse’s rules.') : `Fails: ${llm.errors.join('; ')}.` },
    { label: '/llms-full.txt', standard: 'llmstxt.org (community)', status: found(p.llmsFull) ? 'good' : 'info', detail: found(p.llmsFull) ? 'Published.' : 'Not published (optional full-text companion).' },
    { label: 'Markdown version of this page', standard: 'Accept: text/markdown or rel="alternate" type="text/markdown"',
      status: md || p.mdAlternate ? 'good' : 'info',
      detail: md ? `Served on request${/accept/i.test(p.markdown.vary) ? ' (Vary: Accept set)' : '; add “Vary: Accept” so caches keep HTML and Markdown apart'}.` : p.mdAlternate ? `Linked as ${p.mdAlternate}.` : 'None. Agents read HTML instead.' },
    { label: 'Content-Signal in robots.txt', standard: 'draft (contentsignals.org)',
      status: rs.contentSignal.length ? (rs.problems.length ? 'warn' : 'good') : 'info',
      detail: rs.contentSignal.length ? (rs.problems.length ? `Unrecognised: ${rs.problems.join(', ')} (use search, ai-input, ai-train = yes/no).` : rs.contentSignal.map((o) => Object.entries(o).map(([k, v]) => `${k}=${v}`).join(', ')).join(' · ')) : 'None. Optional, e.g. “Content-Signal: search=yes, ai-input=yes, ai-train=no” inside a user-agent group.' },
    { label: 'AI catalog (ai-catalog.json)', standard: 'draft (Agentic Resource Discovery)', status: catalogVia.length ? 'good' : 'info', detail: catalogVia.length ? `Discoverable via ${catalogVia.join(', ')}.` : 'None. Only relevant if you offer agent-usable APIs or tools.' },
    { label: 'API catalog', standard: 'RFC 9727 (/.well-known/api-catalog)', status: found(p.apiCatalog) ? 'good' : 'info', detail: found(p.apiCatalog) ? 'Published.' : 'None. Only relevant if you publish APIs.' },
    { label: 'Agent card', standard: 'A2A protocol (/.well-known/agent-card.json)', status: found(p.agentCard, true) ? 'good' : 'info', detail: found(p.agentCard, true) ? 'Published.' : 'None. Only relevant if you run an A2A agent.' },
    { label: 'WebMCP tools', standard: 'draft (W3C community group)',
      status: p.webmcp.registerTool || p.webmcp.annotatedForms ? 'good' : 'info',
      detail: p.webmcp.registerTool || p.webmcp.annotatedForms ? `${p.webmcp.registerTool} registerTool() call(s) in inline scripts, ${p.webmcp.annotatedForms} of ${p.webmcp.forms} forms annotated with toolname.` : `None${p.webmcp.forms ? `; ${p.webmcp.forms} form(s) could carry toolname / tooldescription so agents can use them` : ''}.` },
  ]
}
