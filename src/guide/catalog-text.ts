// Guide catalogs support exactly the inline tags rendered by rich.tsx.
// This is display-text normalization for matching DOM text, not an HTML
// sanitizer: unsupported or malformed markup remains literal text.
const RICH_TEXT_TOKENS = [
  '<b>',
  '</b>',
  '<i>',
  '</i>',
  '<em>',
  '</em>',
  '<code>',
  '</code>',
] as const

export function renderedCatalogText(raw: string) {
  let text = raw
  for (const token of RICH_TEXT_TOKENS) {
    text = text.replaceAll(token, '')
  }
  return text.replace(/\s+/g, ' ').trim()
}
