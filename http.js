// Shared HTTP and row-shape helpers for every provider adapter (providers.js, moz.js, apis.js). Pure apart from fetch.

export const fetchJson = async (url, init = {}) => {
  let r
  try { r = await fetch(url, { credentials: 'omit', ...init }) } catch (e) { throw new Error(`Network error: ${e.message ?? e}`) }
  if (![401, 402, 403, 429].includes(r.status)) return r
  // The provider's own reason ("verify your account", "IP not allowed"…) beats a generic guess.
  const why = await r.text().then((t) => { try { const j = JSON.parse(t); return j.status_message ?? j.error ?? j.message ?? null } catch { return t.trim().slice(0, 200) || null } }, () => null)
  const said = why ? ` The provider says: “${String(why).slice(0, 200)}”` : ''
  if (r.status === 402) throw new Error(`The provider says the account is out of credit (402).${said}`)
  if (r.status === 429) throw new Error(`Rate limited by the provider (429). Try again shortly.${said}`)
  throw new Error(`The provider refused the request (${r.status}).${said || ' Check the key in Settings.'}`)
}

/** Provider dates → YYYY-MM-DD: Unix seconds (Semrush), ISO or "YYYY-MM-DD hh:mm:ss +00:00" (DataForSEO, Ahrefs). */
export const day = (v) => (v == null || v === '' ? null : /^\d{9,}$/.test(String(v)) ? new Date(Number(v) * 1000).toISOString().slice(0, 10) : String(v).slice(0, 10))
export const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return null } }
export const bool = (v) => (v == null || v === '' ? null : v === true || v === 'true' || v === 1 || v === '1')
/** One backlink in the shared shape. `rating` is the provider's own authority score (see ratingName). */
export const linkRow = ({ from, to, anchor = '', follow = null, firstSeen = null, lastSeen = null, lost = null, rating = null, broken = null, spam = null }) => ({ from, fromDomain: hostOf(from), to, anchor: anchor ?? '', follow, firstSeen: day(firstSeen), lastSeen: day(lastSeen), lost, rating, broken, spam })
/** Semrush and Ahrefs document no server-side "lost only" filter, so those rows are filtered here. */
export const onlyLost = (rows, lost) => (lost ? rows.filter((r) => r.lost === true) : rows)

/** Numbers from CSV-ish provider text: '' / null / NaN → null. */
export const n = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))
export const today = () => new Date().toISOString().slice(0, 10)
