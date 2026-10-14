// Google "People also ask" deep extraction. Expanding a question makes Google append related
// questions; those become the next level. Breadth-first up to the chosen depth.
// PAA items carry the question in a data-q attribute and an [aria-expanded] toggle.
(async () => {
  const cfg = (await globalThis.chrome?.storage?.sync.get({ paaButton: true })) ?? { paaButton: true }
  if (!cfg.paaButton) return
  const MAX_QUESTIONS = 100 // ponytail: hard cap so a runaway PAA box can't click forever
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const waitFor = async (fn, ms = 3000) => {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) { const v = fn(); if (v) return v }
    return null
  }
  const items = () => [...document.querySelectorAll('[data-q]')].filter((el) => el.querySelector('[aria-expanded]'))
  const q = (el) => el.getAttribute('data-q').replace(/\s+/g, ' ').trim()

  async function extract(depth, onProgress) {
    const rows = new Map() // question → row
    const add = (el, level, parent) => { if (!rows.has(q(el)) && rows.size < MAX_QUESTIONS) rows.set(q(el), { level, parent, question: q(el), answerTitle: '', answerUrl: '' }) }
    items().forEach((el) => add(el, 1, ''))
    for (let i = 0; i < rows.size; i++) {
      const row = [...rows.values()][i]
      onProgress(`Expanding ${i + 1} / ${rows.size} (level ${row.level})…`)
      const node = items().find((x) => q(x) === row.question) // Google may re-render nodes; re-find by text
      const toggle = node?.querySelector('[aria-expanded]')
      if (!toggle) continue
      const before = new Set(items().map(q))
      if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click()
      const link = await waitFor(() => node.querySelector('a[href^="http"] h3')?.closest('a'))
      row.answerUrl = link?.href ?? ''
      row.answerTitle = link?.querySelector('h3')?.textContent.trim() ?? ''
      await sleep(400) // let Google append the follow-up questions
      if (row.level < depth) items().filter((x) => !before.has(q(x))).forEach((x) => add(x, row.level + 1, row.question))
    }
    return [...rows.values()]
  }

  // --- UI ---------------------------------------------------------------------------------
  const style = document.createElement('style')
  style.textContent = `#sss-paa-btn{position:fixed;right:16px;bottom:60px;z-index:2147483647;padding:8px 14px;border:0;border-radius:18px;background:#18794e;color:#fff;font:600 13px system-ui;box-shadow:0 2px 8px #0003;cursor:pointer}
  #sss-paa{position:fixed;right:16px;bottom:104px;z-index:2147483647;width:min(560px,calc(100vw - 32px));max-height:70vh;overflow:auto;background:#fff;color:#1d2330;border:1px solid #d0d4da;border-radius:10px;box-shadow:0 6px 24px #0003;padding:12px;font:13px/1.4 system-ui}
  #sss-paa table{width:100%;border-collapse:collapse;margin-top:8px}#sss-paa td,#sss-paa th{text-align:left;padding:4px 6px 4px 0;border-bottom:1px solid #e3e6eb;vertical-align:top}
  #sss-paa button,#sss-paa select{font:inherit;padding:3px 9px;margin-right:6px;border:1px solid #d0d4da;border-radius:6px;background:#f2f4f7;color:#1d2330;cursor:pointer}`
  document.head.append(style)

  const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n }
  const btn = el('button', { id: 'sss-paa-btn', textContent: 'Extract People Also Ask' })
  document.body.append(btn)

  btn.addEventListener('click', () => {
    document.getElementById('sss-paa')?.remove()
    if (!items().length) { btn.textContent = 'No People Also Ask box here'; setTimeout(() => { btn.textContent = 'Extract People Also Ask' }, 2000); return }
    const depth = el('select', { ariaLabel: 'Extraction depth' }, ...[1, 2, 3].map((n) => el('option', { value: n, textContent: `${['First', 'Second', 'Third'][n - 1]} level` })))
    const status = el('span')
    const out = el('div')
    const start = el('button', { textContent: 'Start' })
    const close = el('button', { textContent: 'Close', onclick: () => panel.remove() })
    const panel = el('div', { id: 'sss-paa', role: 'dialog', ariaLabel: 'People Also Ask extraction' }, depth, start, close, status, out)
    document.body.append(panel)
    start.onclick = async () => {
      start.disabled = true
      const rows = await extract(Number(depth.value), (t) => { status.textContent = t })
      const csv = globalThis.sssCsv([['level', 'parent', 'question', 'answer_title', 'answer_url'], ...rows.map((r) => [r.level, r.parent, r.question, r.answerTitle, r.answerUrl])])
      status.textContent = `${rows.length} questions. `
      const copy = el('button', { textContent: 'Copy CSV', onclick: async () => { await navigator.clipboard.writeText(csv); copy.textContent = 'Copied' } })
      const dl = el('button', { textContent: 'Download CSV', onclick: () => { const a = el('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: 'people-also-ask.csv' }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000) } })
      out.replaceChildren(copy, dl, el('table', {}, el('tr', {}, ...['Lvl', 'Question', 'Answer source'].map((t) => el('th', { textContent: t }))),
        ...rows.map((r) => el('tr', {}, el('td', { textContent: r.level }), el('td', { textContent: r.question }),
          el('td', {}, r.answerUrl ? el('a', { href: r.answerUrl, target: '_blank', rel: 'noopener', textContent: r.answerTitle || r.answerUrl }) : '')))))
      start.disabled = false
    }
  })
})()
