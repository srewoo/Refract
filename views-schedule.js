// "Run automatically" control shared by Rank tracking and AI visibility, and the list of every schedule in Settings › Spend.
import { PROVIDERS, grantProvider, loadKeys } from './keys.js'
import { advance, blocker, describe, lastText, loadSchedules, providerOf, updateSchedules } from './schedules.js'
import { h, block, btn } from './ui.js'

const ONLY_OPEN = 'Runs only while Chrome is running. A run missed while Chrome was closed happens once when Chrome next opens, marked as late.'

/** spec() → { id, kind, domain, label, ranks? }, read when the schedule is turned on. */
export function scheduleBlock(spec, { go } = {}) {
  const msg = h('p', { class: 'muted small' }), fix = h('span')
  const pick = h('select', { 'aria-label': 'Run automatically', onchange: () => change() }, [['off', 'Off'], ['daily', 'Daily'], ['weekly', 'Weekly']].map(([v, t]) => h('option', { value: v }, t)))
  const draw = async () => {
    const s = (await loadSchedules())[spec().id]
    pick.value = s?.every ?? 'off'
    msg.textContent = s ? `${describe(s)}. ${lastText(s.last)}` : ONLY_OPEN
  }
  const change = async () => {
    const s = spec(), every = pick.value
    fix.replaceChildren()
    if (every === 'off') { await updateSchedules((all) => { delete all[s.id]; return all }); return draw() }
    const cfg = await loadKeys(), id = providerOf(s, cfg)
    let stop = await blocker(s, cfg, { access: false })
    // The select change is the user gesture Chrome needs to grant the API host the worker will call.
    if (!stop && !(await chrome.permissions.contains({ origins: PROVIDERS[id].origins }))) await grantProvider(id).catch(() => false)
    stop ??= await blocker(s, cfg)
    if (stop) { pick.value = 'off'; msg.textContent = stop; if (go) fix.replaceChildren(btn('Open Settings', () => go('Settings'))); return }
    const now = Date.now()
    await updateSchedules((all) => ({ ...all, [s.id]: { ...all[s.id], ...s, every, next: advance(new Date(now).toISOString(), every, now) } }))
    draw()
  }
  draw()
  return block('Run automatically', h('div', { class: 'bar-line' }, pick, fix), msg, h('p', { class: 'muted small' }, 'Uses your provider credits on each run, within the daily cap you set in Settings › Spend.'))
}

/** Every schedule across domains, so none keeps spending unnoticed. */
export function schedulesList() {
  const out = h('div')
  const draw = async () => {
    const all = Object.values(await loadSchedules())
    out.replaceChildren(!all.length ? h('p', { class: 'muted small' }, `None. Turn them on in Rank tracking or AI visibility. ${ONLY_OPEN}`) : h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, ['Schedule', 'When', 'Last run', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, all.map((s) => h('tr', {}, h('td', { class: 'small' }, s.label), h('td', { class: 'small nowrap' }, describe(s)), h('td', { class: 'small' }, lastText(s.last)),
        h('td', {}, btn('Turn off', async () => { await updateSchedules((x) => { delete x[s.id]; return x }); draw() }))))))))
  }
  draw()
  return block('Scheduled runs', out)
}
