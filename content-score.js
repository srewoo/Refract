// Content score for one target keyword (Veritas-style): keyword coverage, readability, structure and questions answered,
// each with the checks behind it. Plus two answer-engine checks used by the AI search view. Pure: no chrome.*, no DOM.
import { outline } from './geo.js'
import { tokens } from './keywords.js'

const pct = (n) => Math.max(0, Math.min(100, Math.round(n)))
const wordsOf = (s) => s.split(/\s+/).filter(Boolean)
const has = (text, toks) => { const t = new Set(tokens(text ?? '')); return toks.length > 0 && toks.every((x) => t.has(x)) }
const share = (text, toks) => { const t = new Set(tokens(text ?? '')); return toks.length ? toks.filter((x) => t.has(x)).length / toks.length : 0 }
const check = (ok, label, fix) => ({ ok, label, fix })
const dim = (name, checks) => ({ name, checks, score: pct((checks.filter((c) => c.ok).length / checks.length) * 100) })

// ponytail: vowel-group syllable count (English only), ~90% accurate; a dictionary would be exact.
const syllables = (w) => Math.max(1, (w.toLowerCase().replace(/[^a-z]/g, '').replace(/e$/, '').match(/[aeiouy]+/g) ?? []).length)
/** Flesch Reading Ease of the body paragraphs, or null when there is too little English text to judge. */
export function readingEase(paras, lang) {
  if (lang && !/^en\b/i.test(lang)) return null
  const text = paras.map((p) => p.text).join(' ')
  const words = wordsOf(text).filter((w) => /[a-z]/i.test(w))
  if (words.length < 50) return null
  const sentences = Math.max(1, (text.match(/[.!?]+(\s|$)/g) ?? []).length)
  const syl = words.reduce((n, w) => n + syllables(w), 0)
  return { ease: Math.round(206.835 - 1.015 * (words.length / sentences) - 84.6 * (syl / words.length)), perSentence: Math.round(words.length / sentences) }
}

/** Answer engines quote the first paragraph: a short direct answer up top is what gets lifted. */
export function answerFirst(paras = []) {
  const n = paras[0] ? wordsOf(paras[0].text).length : 0
  return { ok: n > 0 && n <= 60, words: n }
}

const STAT = /\b\d+(?:\.\d+)?\s?%|\b\d{1,3}(?:,\d{3})+\b|\$\s?\d|\b\d+(?:\.\d+)?\s?(?:x|times|million|billion)\b|\baccording to\b|\b(?:study|survey|research)\b/i
/** Sentences stating a number or study in paragraphs that link no outside source. */
export function unsourcedClaims(paras = []) {
  return paras.filter((p) => !p.cited).flatMap((p) => p.text.split(/(?<=[.!?])\s+/)).filter((s) => STAT.test(s)).slice(0, 20)
}

/** 0–100 = mean of the dimensions that apply; readability is skipped for non-English pages, questions when none are given. */
export function contentScore(d, keyword, questions = []) {
  const paras = d.paras ?? []
  const k = tokens(keyword)
  const sub = d.headings.filter((x) => x.level === 2 || x.level === 3)
  const lead = wordsOf(paras.map((p) => p.text).join(' ')).slice(0, 100).join(' ')
  const slug = decodeURIComponent(new URL(d.url).pathname).replace(/[-_/]+/g, ' ')
  const q = `“${keyword}”`
  const dims = [dim('Keyword coverage', [
    check(has(d.title, k), `${q} in the title`, `Work ${q} into the title, near the start.`),
    check(d.headings.some((x) => x.level === 1 && has(x.text, k)), `${q} in the H1`, `Say ${q} in the H1.`),
    check(has(d.description, k), `${q} in the meta description`, `Use ${q} in the meta description; Google bolds it in results.`),
    check(has(lead, k), `${q} in the first 100 words`, `Mention ${q} in the opening paragraph.`),
    check(sub.some((x) => has(x.text, k)), `${q} in an H2/H3`, `Use ${q} or a close variant in at least one subheading.`),
    check(has(slug, k), `${q} in the URL`, `Put the keyword in the URL slug (only for new pages; changing a live URL needs a redirect).`),
  ])]
  const r = readingEase(paras, d.lang)
  const long = paras.filter((p) => wordsOf(p.text).length > 150).length
  if (r) {
    const x = dim('Readability', [
      check(r.ease >= 60, `Reading ease ${r.ease} (60+ reads plainly)`, `Shorten sentences and swap long words for short ones.`),
      check(r.perSentence <= 20, `${r.perSentence} words per sentence (≤ 20)`, 'Split sentences over ~25 words.'),
      check(long === 0, long ? `${long} paragraph${long > 1 ? 's' : ''} over 150 words` : 'No paragraph over 150 words', 'Break long paragraphs up; one idea each.'),
    ])
    // Half reading ease (20 → 0, 60+ → 100), half checks passed, so a failed check always lowers the number.
    dims.push({ ...x, score: pct((pct(((r.ease - 20) / 40) * 100) + x.score) / 2) })
  }
  const h2 = d.headings.filter((x) => x.level === 2).length
  dims.push(dim('Structure', [
    check(d.headings.filter((x) => x.level === 1).length === 1, 'Exactly one H1', 'Use one H1 that states the topic.'),
    check(d.wordCount < 300 || h2 >= 2, `${h2} H2 sections`, 'Split the body into H2 sections a reader can scan.'),
    check(outline(d.headings).skips.length === 0, 'No skipped heading levels', 'Don’t jump from H2 to H4.'),
    check((d.structure?.lists ?? 0) + (d.structure?.tables ?? 0) > 0, 'Has a list or table', 'Turn steps, options or specs into a list or table.'),
    check(d.wordCount >= 300, `${d.wordCount.toLocaleString()} words (≥ 300)`, 'Expand the thin sections; cover what the searcher needs to decide.'),
  ]))
  const qs = questions.map((x) => x.trim()).filter(Boolean)
  if (qs.length) {
    const texts = [...d.headings.map((x) => x.text), ...paras.map((p) => p.text)]
    dims.push(dim('Questions answered', qs.map((x) => check(texts.some((t) => share(t, tokens(x)) >= 0.7), x, 'Answer it under its own H2/H3, first sentence first.'))))
  }
  return { score: pct(dims.reduce((s, x) => s + x.score, 0) / dims.length), dims }
}
