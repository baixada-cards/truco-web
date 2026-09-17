// What an inline token carries, in plain TypeScript so the node test runner
// and the catalog matcher can import it without JSX: the text of a tag's
// chunks, and the one spelling a match score is set in.

/** the plain text of a tag's chunks, or null when it is not plain text */
export function tokenText(node: React.ReactNode): string | null {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) {
    const parts = node.map(tokenText)
    return parts.every((part) => part !== null) ? parts.join('') : null
  }
  return null
}

/**
 * A manilha is identified by its suit alone. The suit is written bare,
 * `♣`; with its old m, `m♣` (kept as an alias, since the formulas still
 * write it); or with a rank in front, `5♣` (a solver label, or a card inside
 * a `<hand>`). All three name the same manilha and give its suit; a rank
 * with no suit (`K`) is an ordinary card and gives null.
 */
const MANILHA = /^[^♣♦♥♠\s]*([♣♦♥♠])$/

export function manilhaSuit(text: string) {
  return MANILHA.exec(text.trim())?.[1] ?? null
}

/** the text a card shows: a manilha, in any spelling, shows only its suit */
export function normalizeCard(text: string) {
  return manilhaSuit(text) ?? text
}

/**
 * A score may be written `11x11`, `11 x 11` or `11 x 11` with the sign in the
 * catalog, and is always set as one spelling: a multiplication sign between
 * thin spaces. Both the rendered token and renderedCatalogText run this, so
 * the DOM text and the catalog text still meet (whitespace collapses on both
 * sides, so a thin space matches the ordinary one it collapses to).
 */
const SCORE = /^\s*(\d{1,2})\s*[x×]\s*(\d{1,2})\s*$/i

/** U+2009 and U+00D7, built rather than typed: both are easy to mistype */
const THIN_SPACE = String.fromCharCode(0x2009)
const TIMES = String.fromCharCode(0x00d7)

export function normalizeScore(text: string) {
  const match = SCORE.exec(text)
  return match ? `${match[1]}${THIN_SPACE}${TIMES}${THIN_SPACE}${match[2]}` : text
}
