// Chrome built-in AI (Gemini Nano via the Prompt API), ported from Refract src/ai/tier1.ts + firewall.ts.
// The model only writes *suggestions*: every number it emits must already exist in the grounding data
// (numeric firewall), markup is stripped, and every suggestion is re-measured by our own code.
import { density } from './analyze.js'
import { hasPath, SCHEMA_PROPS } from './rules.js'

const LANGS = ['en', 'de', 'es', 'fr', 'ja']
const lang = () => { const l = (chrome.i18n?.getUILanguage?.() ?? 'en').toLowerCase().split('-')[0]; return LANGS.includes(l) ? l : 'en' }
const SYSTEM = [
  'You are the suggestion layer of a technical SEO tool used by web developers.',
  'You receive structured facts about one web page. You never see the full HTML.',
  '- Never state a number that is not present in the data you were given.',
  '- Never invent facts, brands, prices, dates or claims about the page.',
  '- Plain, specific language. No marketing tone, no emoji, no "boost your rankings".',
].join('\n')

const api = () => globalThis.LanguageModel ?? null
const opts = (image) => ({ expectedInputs: [{ type: 'text', languages: [lang()] }, ...(image ? [{ type: 'image' }] : [])], expectedOutputs: [{ type: 'text', languages: [lang()] }] })

/** 'unsupported' | 'unavailable' | 'downloadable' | 'downloading' | 'available' */
export async function aiStatus(timeoutMs = 3000) {
  if (!api()) return 'unsupported'
  // availability() can hang (stuck model component); never let it block the audit.
  const timeout = new Promise((resolve) => setTimeout(() => resolve('unavailable'), timeoutMs))
  try { return await Promise.race([api().availability(opts(false)), timeout]) } catch { return 'unavailable' }
}

let warm = null
/** One warm session per page; creating it starts the model download when needed (must follow a click). */
export async function session(onProgress) {
  if (warm) return warm
  warm = api().create({
    initialPrompts: [{ role: 'system', content: SYSTEM }], ...opts(false),
    monitor: (m) => m.addEventListener('downloadprogress', (e) => onProgress?.(e.loaded)),
  }).catch((e) => { warm = null; throw e })
  return warm
}

// ---------- firewall (Refract firewall.ts) ----------
const HARMLESS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '100']
const normNum = (n) => n.replace(/,/g, '').replace(/\.0+$/, '')
export function allowedNumbers(grounding) {
  const ok = new Set(HARMLESS)
  const walk = (v, depth) => {
    if (depth > 8) return
    if (typeof v === 'number') { ok.add(normNum(String(v))); ok.add(String(Math.round(v))) } else if (typeof v === 'string') { for (const m of v.matchAll(/\d[\d,]*(\.\d+)?/g)) ok.add(normNum(m[0])) } else if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1))
    else if (v && typeof v === 'object') Object.values(v).forEach((x) => walk(x, depth + 1))
  }
  walk(grounding, 0)
  return ok
}
export function checkNumbers(text, grounding) {
  const ok = allowedNumbers(grounding)
  const invented = [...new Set([...text.matchAll(/\d[\d,]*(\.\d+)?/g)].map((m) => m[0]).filter((n) => !ok.has(normNum(n))))]
  return { ok: invented.length === 0, invented }
}
export const sanitise = (t) => String(t).replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim()

/** Run one prompt on a clone of the warm session; JSON-constrained; strings pass the firewall or are dropped. */
async function ask(prompt, schema, grounding, image) {
  const base = await session()
  const s = image ? await api().create({ initialPrompts: [{ role: 'system', content: SYSTEM }], ...opts(true) }) : await base.clone()
  try {
    const input = image ? [{ role: 'user', content: [{ type: 'text', value: prompt }, { type: 'image', value: image }] }] : prompt
    const raw = await s.prompt(input, { responseConstraint: schema })
    return JSON.parse(raw)
  } finally { s.destroy() }
}
const clean = (list, grounding) => {
  const kept = [], rejected = []
  for (const x of list) { const t = sanitise(x); const c = checkNumbers(t, grounding); (c.ok && t ? kept : rejected).push(c.ok ? t : `${t} (invented ${c.invented.join(', ')})`) }
  return { kept, rejected }
}
const options = { type: 'object', properties: { options: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 } }, required: ['options'] }
const facts = (d) => ({ url: d.url, title: d.title, description: d.description, h1: d.headings.filter((h) => h.level === 1).map((h) => h.text), h2: d.headings.filter((h) => h.level === 2).slice(0, 8).map((h) => h.text), topPhrases: density(d.words, 2, 8).map((r) => r.term), text: d.textSample.slice(0, 1500) })

export async function suggestTitles(d) {
  const g = facts(d)
  const r = await ask(`Write 3 alternative <title> tags for this page. Each 30–60 characters, main topic first, keep an existing brand suffix if the current title has one, no keyword stuffing, no clickbait.\nFacts: ${JSON.stringify(g)}`, options, g)
  return clean(r.options ?? [], g)
}
export async function suggestDescriptions(d) {
  const g = facts(d)
  const r = await ask(`Write 3 alternative meta descriptions. Each 70–155 characters, describe what the reader gets, include the main topic once, end with a reason to click. Only claims supported by the facts.\nFacts: ${JSON.stringify(g)}`, options, g)
  return clean(r.options ?? [], g)
}
export async function suggestAlt(img, d) {
  const g = { page: d.title, file: img.src.split(/[?#]/)[0].split('/').pop(), nearbyText: img.context ?? '' }
  let blob = null
  try { const res = await fetch(img.src, { credentials: 'omit' }); if (res.ok && /^image\//.test(res.headers.get('content-type') ?? '')) blob = await res.blob() } catch { /* text-only fallback */ }
  const prompt = `Write alt text for this image: what it shows and why it matters on the page, under 125 characters, no "image of".${blob ? ' Describe the attached image.' : ' The image itself is unavailable; infer only from the file name and nearby text, and say less rather than guess.'}\nFacts: ${JSON.stringify(g)}`
  const schema = { type: 'object', properties: { alt: { type: 'string' } }, required: ['alt'] }
  let r
  try { r = await ask(prompt, schema, g, blob) } catch { r = await ask(prompt.replace(' Describe the attached image.', ''), schema, g, null) } // device without multimodal
  return clean([r.alt ?? ''], g)
}
export async function draftJsonLd(d, type) {
  const g = { ...facts(d), author: d.author, published: d.structure.published, image: d.social['og:image'], siteName: d.social['og:site_name'] }
  const r = await ask(`Draft schema.org JSON-LD of @type ${type} for this page. Use only values present in the facts; omit any property you cannot fill truthfully. Include "@context": "https://schema.org". Return it as a JSON string in "jsonld".\nFacts: ${JSON.stringify(g)}`,
    { type: 'object', properties: { jsonld: { type: 'string' } }, required: ['jsonld'] }, g)
  const obj = JSON.parse(r.jsonld)
  const text = JSON.stringify(obj, null, 2)
  const c = checkNumbers(text, g)
  const spec = SCHEMA_PROPS[type]
  return { text, invented: c.invented, missing: spec ? [...spec[0], ...spec[1]].filter((k) => !hasPath(obj, k)) : [] }
}
export async function explainIssue(issue, d) {
  const g = { issue: issue.msg, fix: issue.fix ?? '', page: { url: d.url, title: d.title } }
  const r = await ask(`In at most 60 words, explain to a web developer why this matters for search or AI visibility and what to change. Do not repeat the issue text.\nFacts: ${JSON.stringify(g)}`,
    { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }, g)
  return clean([r.text ?? ''], g)
}
