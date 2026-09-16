// The names of the inline tags a guide catalog string may carry. One list,
// read by everything that has to agree on it: rich.tsx renders them, the
// copy editor's write API refuses anything outside it, and catalog-text.ts
// strips them to recover the text the DOM shows. Plain TypeScript, so the
// node test runner can import it without JSX.

import { GUIDE_CHAPTERS } from './chapters.ts'

/** the typographic tags: emphasis and inline code */
export const TEXT_TAG_NAMES = ['b', 'i', 'em', 'code'] as const

/**
 * A cross-reference is tagged with the target chapter's own id, because
 * next-intl only accepts simple tag names: `<ranges>the ranges chapter</ranges>`
 * links to that chapter, so a new chapter in GUIDE_CHAPTERS gets its tag for
 * free.
 */
export const CHAPTER_TAG_NAMES = GUIDE_CHAPTERS

export const RICH_TAG_NAMES: readonly string[] = [...TEXT_TAG_NAMES, ...CHAPTER_TAG_NAMES]
