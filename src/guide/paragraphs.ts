// A catalog string is one paragraph by default. A blank line inside it splits
// it into two — the same convention as Markdown, and what the copy editor's
// `o o` gets you. Single newlines are just whitespace, as in HTML.
//
// The split runs over the *rendered* children (next-intl has already turned
// <b>…</b> into elements), so it only ever cuts between top-level pieces: a
// blank line inside a bold run would be pathological and is left alone.

import { Children, isValidElement, type ReactNode } from 'react'

const BLANK_LINE = /\n[ \t]*\n\s*/

/** one entry per paragraph; never empty unless the string was */
export function splitParagraphs(node: ReactNode): ReactNode[][] {
  const out: ReactNode[][] = [[]]

  for (const child of Children.toArray(node)) {
    if (typeof child !== 'string') {
      out[out.length - 1].push(child)
      continue
    }
    const pieces = child.split(BLANK_LINE)
    pieces.forEach((piece, index) => {
      if (index > 0) out.push([])
      if (piece !== '') out[out.length - 1].push(piece)
    })
  }

  return out
    .map((paragraph) => trimEnds(paragraph))
    .filter((paragraph) => paragraph.some((piece) => (typeof piece === 'string' ? piece.trim() !== '' : isValidElement(piece) || piece != null)))
}

/** drop the leading/trailing whitespace a hand-edited string tends to carry */
function trimEnds(paragraph: ReactNode[]): ReactNode[] {
  const trimmed = [...paragraph]
  if (typeof trimmed[0] === 'string') trimmed[0] = trimmed[0].replace(/^\s+/, '')
  const last = trimmed.length - 1
  if (typeof trimmed[last] === 'string') trimmed[last] = (trimmed[last] as string).replace(/\s+$/, '')
  return trimmed.filter((piece) => piece !== '')
}
