// Settings › Research data: back up / restore research data as one JSON file, and delete one domain's research.
// Never includes API keys or sign-in tokens (see BACKUP_PREFIXES in keywords.js).
import { BACKUP_PREFIXES, buildBackup, keyDomain, readBackup } from './keywords.js'
import { h, block, btn, num, download } from './ui.js'
import { RANK_KEYWORDS, RANK_POINTS, note } from './views-data.js'
import { BL_KEEP } from './links.js'
import { RUN_KEEP, TEXT_CAP } from './aivis.js'

const LIMITS = [
  ['Rank tracking', `${RANK_KEYWORDS} keywords per tracker; the last ${RANK_POINTS} daily checks per keyword`],
  ['Backlink summaries', `newest ${BL_KEEP} per domain (one per day)`],
  ['Loaded backlinks', 'the latest load per domain, up to 2,000 links'],
  ['AI visibility', `last ${RUN_KEEP} runs per prompt; answer text up to ${num(TEXT_CAP)} characters each`],
  ['Keyword comparisons and domain overviews', 'the latest per domain and market'],
  ['Saved keywords, competitors, prospects', 'kept until you remove them'],
]

/**
 * A button that needs a second click within 4 s. `ask()` returns [question, target] or null; the second click runs
 * `run(target)` with the target the question named, and `disarm()` cancels (call it when what was asked about changes).
 */
function confirmBtn(label, ask, run) {
  let armed = null, target = null
  const disarm = () => { clearTimeout(armed); armed = null; target = null; b.textContent = label }
  const b = btn(label, async () => {
    if (!armed) { const q = await ask(); if (!q) return; [b.textContent, target] = q; armed = setTimeout(disarm, 4000); return }
    const t = target
    disarm()
    await run(t)
  })
  return Object.assign(b, { disarm })
}

const researchKeys = async () => Object.keys(await chrome.storage.local.get(null)).filter((k) => BACKUP_PREFIXES.some((p) => k.startsWith(p)))

export function backupBlock() {
  const msg = h('div'), domains = h('select', { 'aria-label': 'Domain whose research data to delete' })
  let pending = null
  const listDomains = async () => {
    const ds = [...new Set((await researchKeys()).map(keyDomain).filter(Boolean))].sort()
    domains.replaceChildren(...ds.map((d) => h('option', { value: d }, d)))
    domains.disabled = !ds.length
  }
  const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async (e) => {
    const f = e.target.files[0]
    e.target.value = ''
    pending = null
    if (!f) return
    try {
      if (f.size > 20e6) throw new Error(`${f.name} is over 20 MB.`)
      pending = readBackup(JSON.parse(await f.text()))
      const ds = new Set(Object.keys(pending).map(keyDomain).filter(Boolean))
      msg.replaceChildren(note(`${f.name}: ${num(Object.keys(pending).length)} items for ${[...ds].slice(0, 5).join(', ')}${ds.size > 5 ? ` and ${ds.size - 5} more` : ''}. Press Restore to write them; items with the same name are replaced.`), restore)
    } catch (err) { msg.replaceChildren(note(`Could not read that file: ${err.message}`)) }
  } })
  const restore = btn('Restore', async (e) => {
    if (!pending) return
    await chrome.storage.local.set(pending)
    msg.replaceChildren(note(`Restored ${num(Object.keys(pending).length)} items.`))
    pending = null
    e.target.remove()
    listDomains()
  }, { class: 'btn primary' })
  const del = confirmBtn('Delete research data',
    async () => { const d = domains.value, keys = (await researchKeys()).filter((k) => keyDomain(k) === d); return keys.length ? [`Delete ${keys.length} items for ${d}? Click again`, d] : null },
    async (d) => { // the domain named in the question, whatever the menu shows now
      const keys = (await researchKeys()).filter((k) => keyDomain(k) === d)
      await chrome.storage.local.remove(keys)
      msg.replaceChildren(note(`Deleted ${keys.length} items for ${d}.`))
      listDomains()
    })
  domains.addEventListener('change', () => del.disarm())
  listDomains()
  const used = note('')
  chrome.storage.local.getBytesInUse?.(null).then((b) => { used.textContent = `Refract SEO uses ${(b / 1048576).toFixed(1)} MB on this computer (page history and crawls included).` }, () => {})
  return block('Research data',
    note('Saved keywords, rank trackers, competitors, comparisons, overviews and cached backlinks. Backups never include API keys or sign-in tokens.'),
    h('details', {}, h('summary', { class: 'small' }, 'How much is kept'), h('dl', { class: 'kv' }, LIMITS.map(([k, v]) => [h('dt', {}, k), h('dd', { class: 'small' }, v)])), used),
    h('div', { class: 'bar-line' },
      btn('Back up to a file', async () => { const b = buildBackup(await chrome.storage.local.get(null)); download(`refract-research-${b.exported.slice(0, 10)}.json`, JSON.stringify(b, null, 1), 'application/json'); msg.replaceChildren(note(`Backed up ${num(Object.keys(b.data).length)} items.`)) }),
      btn('Restore from a file', () => file.click()), file),
    h('div', { class: 'bar-line' }, domains, del),
    msg)
}
