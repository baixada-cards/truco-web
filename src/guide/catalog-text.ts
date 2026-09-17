// Guide catalogs support exactly the inline tags rendered by rich.tsx, which
// all render their text as text: dropping the tags leaves what the DOM shows.
// This is display-text normalization for matching DOM text, not an HTML
// sanitizer: unsupported or malformed markup remains literal text.

// explicit extension: the node test runner resolves this chain itself
import { RICH_TAG_NAMES } from './rich-tags.ts'
import { normalizeCard, normalizeScore } from './token-text.ts'

const RICH_TEXT_TOKEN = new RegExp(`</?(?:${RICH_TAG_NAMES.join('|')})>`, 'g')

/** a score renders in one spelling, so the catalog's spelling is read as that */
const SCORE_TAG = /<score>([^<]*)<\/score>/g

/** a card written as a bare suit is a manilha, and shows its m */
const CARD_TAG = /<card>([^<]*)<\/card>/g
const HAND_TAG = /<hand>([^<]*)<\/hand>/g

export function renderedCatalogText(raw: string) {
  return raw
    .replace(SCORE_TAG, (_, inner: string) => normalizeScore(inner))
    .replace(CARD_TAG, (_, inner: string) => normalizeCard(inner))
    .replace(HAND_TAG, (_, inner: string) => inner.replace(/\S+/g, (card) => normalizeCard(card)))
    .replace(RICH_TEXT_TOKEN, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** an ICU placeholder like {rank} or {pp}, which renders as unknown text */
const PLACEHOLDER = /\{[a-zA-Z]/

export function hasPlaceholder(raw: string) {
  return PLACEHOLDER.test(raw)
}

/**
 * A prefix shorter than this matches far too much of the page, so a string
 * whose first placeholder comes early stays unanchorable.
 */
const MIN_PREFIX = 14

export interface CatalogIndex {
  /** rendered text of a placeholder-free string, to its catalog key */
  byText: Map<string, string>
  /**
   * For strings that do carry a placeholder: the rendered text before the
   * first one, longest first, and only where it names exactly one key.
   */
  byPrefix: Array<{ prefix: string; key: string }>
}

/** rendered text to catalog key, for matching an element on the page back */
export function buildCatalogIndex(messages: Record<string, string>): CatalogIndex {
  const byText = new Map<string, string>()
  // a prefix two strings share anchors neither of them
  const prefixes = new Map<string, string | null>()

  for (const [key, raw] of Object.entries(messages)) {
    if (hasPlaceholder(raw)) {
      const prefix = renderedCatalogText(raw.slice(0, raw.search(PLACEHOLDER)))
      if (prefix.length < MIN_PREFIX) continue
      prefixes.set(prefix, prefixes.has(prefix) ? null : key)
      continue
    }
    const text = renderedCatalogText(raw)
    if (text.length < 2 || byText.has(text)) continue
    byText.set(text, key)
  }

  const byPrefix: CatalogIndex['byPrefix'] = []
  for (const [prefix, key] of prefixes) {
    if (key == null) continue
    // a prefix that also opens a whole string would steal that string's match
    let shadowed = false
    for (const text of byText.keys()) {
      if (text.startsWith(prefix)) {
        shadowed = true
        break
      }
    }
    if (!shadowed) byPrefix.push({ prefix, key })
  }
  byPrefix.sort((a, b) => b.prefix.length - a.prefix.length)

  return { byText, byPrefix }
}

/**
 * The catalog key an element's rendered text belongs to, or null. Prefix
 * matching is opt-in: it is what lets a string with a placeholder be
 * anchored, but it is a guess, so the copy editor leaves it off.
 */
export function matchCatalogKey(
  index: CatalogIndex,
  text: string,
  options: { prefix?: boolean } = {},
) {
  const exact = index.byText.get(text)
  if (exact != null) return exact
  if (!options.prefix) return null
  for (const entry of index.byPrefix) {
    if (text.startsWith(entry.prefix)) return entry.key
  }
  return null
}
