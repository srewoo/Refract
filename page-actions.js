// Functions serialized into the inspected page by chrome.scripting.executeScript({ func, args }).
// They must be self-contained: no closures, no imports.

/** Toggle one overlay layer on the page: 'nofollow' | 'alt' | 'headings'. Returns whether it is now on. */
export function overlay(layer) {
  const id = `sss-overlay-${layer}`
  const old = document.getElementById(id)
  if (old) {
    old.remove()
    document.querySelectorAll(`[data-sss-${layer}]`).forEach((n) => n.remove())
    return false
  }
  const css = {
    nofollow: 'a[rel~="nofollow" i],a[rel~="sponsored" i],a[rel~="ugc" i]{outline:2px dashed #d03b3b!important;outline-offset:1px;background:#d03b3b22!important}',
    alt: 'img:not([alt]){outline:3px solid #d03b3b!important;outline-offset:-3px}img[alt=""]{outline:2px dashed #6b6862!important;outline-offset:-2px}',
    headings: 'h1,h2,h3,h4,h5,h6{outline:1px dashed #0f6e66!important;outline-offset:2px}',
  }[layer]
  const s = document.createElement('style')
  s.id = id
  s.textContent = `${css}[data-sss-${layer}]{all:initial;display:inline-block;margin:0 6px 0 0;padding:1px 5px;border-radius:3px;font:700 11px/1.4 ui-monospace,Menlo,monospace;color:#fff;background:#0f6e66;vertical-align:middle}`
  document.head.append(s)
  const badge = (text, bg) => { const b = document.createElement('span'); b.setAttribute(`data-sss-${layer}`, ''); b.textContent = text; if (bg) b.style.background = bg; return b }
  if (layer === 'headings') document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h) => h.prepend(badge(h.tagName)))
  if (layer === 'alt') document.querySelectorAll('img:not([alt])').forEach((img) => img.before(badge('NO ALT', '#d03b3b')))
  return true
}

/** Kept for the right-click menu. */
export function highlightNofollow() {
  const id = 'sss-overlay-nofollow'
  const old = document.getElementById(id)
  if (old) return old.remove()
  const s = document.createElement('style')
  s.id = id
  s.textContent = 'a[rel~="nofollow" i],a[rel~="sponsored" i],a[rel~="ugc" i]{outline:2px dashed #d03b3b!important;outline-offset:1px;background:#d03b3b22!important}'
  document.head.append(s)
}
