// Which elements the guide's dev-only tooling treats as a piece of copy, and
// how one is matched back to its catalog key. Only CopyEditor.tsx and
// ReviewComments.tsx import this, and production aliases both of them away,
// so none of it reaches a shipped bundle.

import { matchCatalogKey, type CatalogIndex } from './catalog-text'

export const EDITABLE =
  'p, li, dd, dt, h1, h2, h3, figcaption, blockquote, aside, span, b, i, em, td, th'

export function domText(el: Element) {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * The catalog string a point in the page belongs to: the nearest editable
 * ancestor whose rendered text names a key. Inline spans are tried first, so
 * the walk goes outward until something matches.
 */
export function keyForElement(
  index: CatalogIndex,
  start: Element | null,
  options: { prefix?: boolean } = {},
) {
  let node: Element | null = start?.closest(EDITABLE) ?? null
  for (let depth = 0; node && depth < 6; depth += 1) {
    const key = matchCatalogKey(index, domText(node), options)
    if (key) return { key, element: node as HTMLElement }
    node = node.parentElement?.closest(EDITABLE) ?? null
  }
  return null
}
