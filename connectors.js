// Settings › Connectors (Refract's connector card design): off until connected; each card lists exactly
// what leaves this machine, where it goes and when.
import { bingTest } from './bing.js'
import { cruxTest } from './crux.js'
import { GSC_PERMS, TEST_USER_MSG, isConnected, oauthConfigured, oauthProblem, signIn, signOut } from './gsc.js'
import { CAPABILITIES, MARKETS, PROVIDERS, grantProvider, hasCreds, loadKeys, saveKeys } from './keys.js'
import { API } from './providers.js'
import { GA4_PERMS, ga4Connected, ga4SignIn, ga4SignOut, nlpTest, oprTest, psiTest, validIndexNowKey } from './apis.js'
import { h, btn } from './ui.js'

const TEST = { bing: (c) => bingTest(c.key), crux: (c) => cruxTest(c.key), ...Object.fromEntries(Object.entries(API).map(([id, a]) => [id, a.test])),
  pagespeed: (c) => psiTest(c.key), openpagerank: (c) => oprTest(c.key), naturallanguage: (c) => nlpTest(c.key),
  indexnow: async (c) => { if (!validIndexNowKey(c.key)) throw new Error('A key is 8–128 letters, digits or dashes.'); return 'Key format OK. IndexNow checks the key file on each site when you submit.' } }
// Google sign-in connectors: same card, each with its own scope and APIs.
const GOOGLE = {
  gsc: { perms: GSC_PERMS, connected: () => isConnected(), signIn, signOut, problem: () => oauthProblem() },
  ga4: { perms: GA4_PERMS, connected: () => ga4Connected(), signIn: ga4SignIn, signOut: ga4SignOut, problem: () => oauthProblem() },
}
const pill = (state, text) => h('span', { class: `pill-status ${state}`, role: 'status' }, h('i', { 'aria-hidden': 'true' }), text)

function card(id, cfg, save) {
  const p = PROVIDERS[id]
  const status = h('span')
  const actions = h('div', { class: 'conn-actions' })
  const form = h('div', { class: 'conn-form', hidden: true })
  const msg = h('p', { class: 'conn-msg', hidden: true })
  const say = (text) => { msg.textContent = text; msg.hidden = !text }

  const render = async () => {
    if (p.auth === 'google') {
      const g = GOOGLE[id]
      const on = oauthConfigured() && (await g.connected())
      const problem = await g.problem()
      status.replaceChildren(pill(on ? 'on' : problem ? 'warn' : 'off', on ? 'Connected' : problem ? 'Reload needed' : 'Not connected'))
      if (problem) say(problem)
      actions.replaceChildren(on
        ? btn('Disconnect', async () => { await g.signOut(); say(''); render() })
        : btn('Connect', async (e) => {
          // permissions.request first, inside the click: an earlier await would drop the user gesture.
          // Never silently disabled: if sign-in can't work in this loaded build, say exactly why.
          if (problem) { say(problem); return }
          if (!(await chrome.permissions.request(g.perms))) { say('Chrome needs the identity permission and access to Google’s APIs to connect.'); return }
          e.target.disabled = true; say('Waiting for Google sign-in…')
          try { await g.signIn(); say(''); render() } catch (err) { say(err.message) } finally { e.target.disabled = false }
        }))
      return
    }
    const saved = hasCreds(cfg, id)
    const st = cfg.status[id]
    status.replaceChildren(!saved ? pill('off', 'Not connected') : st?.ok === false ? pill('warn', 'Check key') : pill('on', 'Connected'))
    actions.replaceChildren(saved
      ? h('span', { class: 'conn-btns' }, btn('Edit', () => { form.hidden = !form.hidden }), btn('Disconnect', async () => { delete cfg.creds[id]; delete cfg.status[id]; await save(); form.hidden = true; say(''); render() }))
      : btn('Connect', () => { form.hidden = !form.hidden; form.querySelector('input')?.focus() }))
  }

  if (p.auth === 'key') {
    const inputs = p.fields.map(([f, label]) => h('label', { class: 'field' }, h('span', {}, label), h('input', { type: f === 'login' ? 'text' : 'password', autocomplete: 'off', value: cfg.creds[id]?.[f] ?? '', 'data-f': f })))
    form.append(...inputs, h('div', { class: 'bar-line' },
      btn('Save & test', async (e) => {
        if (!(await grantProvider(id))) { say(`Chrome needs access to ${p.hosts.join(', ')} to call ${p.name}.`); return }
        cfg.creds[id] = Object.fromEntries(inputs.map((l) => { const i = l.querySelector('input'); return [i.dataset.f, i.value.trim()] }))
        if (!hasCreds(cfg, id)) { say('Fill in every field.'); return }
        e.target.disabled = true; say('Testing…')
        try { const r = await TEST[id](cfg.creds[id]); cfg.status[id] = { ok: true, msg: r, at: new Date().toISOString() }; say(`✓ ${r}`); form.hidden = true } catch (err) { cfg.status[id] = { ok: false, msg: err.message, at: new Date().toISOString() }; say(`✗ ${err.message}`) }
        await save(); e.target.disabled = false; render()
      }, { class: 'btn primary' }),
      btn('Cancel', () => { form.hidden = true })))
  }
  render()
  if (cfg.status[id]?.msg) say(`${cfg.status[id].ok ? '✓' : '✗'} ${cfg.status[id].msg}`)
  return h('div', { class: 'conn' },
    h('div', { class: 'conn-head' }, h('div', {}, h('div', { class: 'conn-name' }, p.name), h('div', { class: 'conn-meta' }, `${p.price} · ${p.hosts.join(', ')}`)), h('div', { class: 'conn-side' }, status, actions)),
    h('ul', { class: 'conn-flows' }, p.flows.map(([what, to, when]) => h('li', {}, `${what} → ${to}. ${when}`))),
    p.auth === 'google' ? h('p', { class: 'conn-note' }, h('b', {}, 'Test user required. '), TEST_USER_MSG) : '',
    p.note ? h('p', { class: 'conn-note' }, p.note) : '',
    form, msg)
}

export function connectorsPanel() {
  const body = h('div', { class: 'conn-list' }, h('p', { class: 'muted small' }, 'Loading…'))
  loadKeys().then((cfg) => {
    const save = () => saveKeys(cfg)
    const route = (cap) => h('label', { class: 'field' }, h('span', {}, CAPABILITIES[cap]), h('select', { onchange: (e) => { cfg.route[cap] = e.target.value || null; save() } },
      h('option', { value: '' }, 'Automatic (first connected provider)'), Object.entries(PROVIDERS).filter(([, p]) => p.can.includes(cap)).map(([id, p]) => h('option', { value: id, selected: cfg.route[cap] === id }, p.name))))
    body.replaceChildren(
      ...['gsc', 'ga4', 'bing', 'crux', 'pagespeed', 'dataforseo', 'semrush', 'ahrefs', 'moz', 'openpagerank', 'naturallanguage', 'indexnow'].map((id) => card(id, cfg, save)),
      h('div', { class: 'conn' }, h('div', { class: 'conn-name' }, 'Routing'), h('p', { class: 'conn-meta' }, 'Which connected provider answers each question, and for which market.'),
        ...Object.keys(CAPABILITIES).map(route),
        h('label', { class: 'field' }, h('span', {}, 'Market'), h('select', { onchange: (e) => { cfg.market = e.target.value; save() } }, Object.entries(MARKETS).map(([k, m]) => h('option', { value: k, selected: k === cfg.market }, m.label)))),
        h('label', { class: 'setting' }, h('input', { type: 'checkbox', checked: cfg.dfsBacklinksOptIn, onchange: (e) => { cfg.dfsBacklinksOptIn = e.target.checked; save() } }), h('span', {}, h('b', {}, 'I have a DataForSEO Backlinks subscription'), h('span', { class: 'muted small' }, 'Its Backlinks API is billed as a separate monthly plan; calls fail without it.')))))
  })
  return h('section', { class: 'connectors' }, h('h2', { class: 'conn-title' }, 'Connectors'), h('p', { class: 'conn-intro' }, 'Off until you connect them. Each one lists exactly what leaves this machine, where it goes and when.'), body)
}
