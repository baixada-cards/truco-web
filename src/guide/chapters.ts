// The guide's chapters, in reading order. Routes, rail, landing TOC and
// prev/next footers all derive from this list (plan 77 A). The landing page
// additionally groups them into parts (plan 80): Part I is the solve and how
// to read it, Part II the player's handbook, and the appendices hold the
// solver's own documentation (the lossless abstractions, the measured
// numbers) plus the glossary. URLs stay flat — parts are a contents-page
// grouping, never a route segment.

const THEORY = ['rules', 'solving', 'chart', 'ranges', 'views', 'notation', 'trust'] as const

const HANDBOOK = ['eleven', 'leads', 'raising', 'leaks'] as const

const APPENDICES = ['abstractions', 'numbers', 'glossary'] as const

export const GUIDE_PARTS = [
  { id: 'theory', chapters: THEORY },
  { id: 'handbook', chapters: HANDBOOK },
  { id: 'reference', chapters: APPENDICES },
] as const

export type GuidePart = (typeof GUIDE_PARTS)[number]['id']

/** which part a chapter belongs to — the running head and the margin index */
export function partForChapter(chapter: GuideChapter): GuidePart {
  const part = GUIDE_PARTS.find((p) => (p.chapters as readonly string[]).includes(chapter))
  return (part ?? GUIDE_PARTS[0]).id
}

export const GUIDE_CHAPTERS = [...THEORY, ...HANDBOOK, ...APPENDICES] as const

export type GuideChapter = (typeof GUIDE_CHAPTERS)[number]

/** the numbered chapters — everything before the appendices */
const NUMBERED = [...THEORY, ...HANDBOOK] as const

export const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi'] as const

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const

export function isGuideChapter(value: string): value is GuideChapter {
  return (GUIDE_CHAPTERS as readonly string[]).includes(value)
}

export function isAppendix(chapter: GuideChapter): boolean {
  return (APPENDICES as readonly string[]).includes(chapter)
}

/** the chapter's number as printed: a roman numeral, or a letter for an
 *  appendix. Contents leaves, the rail, and the book's headings all use it. */
export function chapterNumber(chapter: GuideChapter): string {
  if (isAppendix(chapter)) return LETTERS[(APPENDICES as readonly string[]).indexOf(chapter)]
  return ROMAN[(NUMBERED as readonly string[]).indexOf(chapter)]
}

/** the catalog key of the heading label: "Chapter {no}" or "Appendix {no}" */
export function chapterLabelKey(chapter: GuideChapter): 'nav.chapter' | 'nav.appendix' {
  return isAppendix(chapter) ? 'nav.appendix' : 'nav.chapter'
}

/** previous/next chapters for the footer pager; null off the ends */
export function chapterNeighbours(chapter: GuideChapter): {
  prev: GuideChapter | null
  next: GuideChapter | null
} {
  const at = GUIDE_CHAPTERS.indexOf(chapter)
  return {
    prev: at > 0 ? GUIDE_CHAPTERS[at - 1] : null,
    next: at < GUIDE_CHAPTERS.length - 1 ? GUIDE_CHAPTERS[at + 1] : null,
  }
}

/** one in-page section of a chapter, as the rail's sub-navigation sees it */
export interface ChapterSection {
  id: string
  label: string
}

/** the old single-page anchors (`/guide#views`, `#g-mao`, …) → chapter routes */
export function chapterForLegacyHash(hash: string): { chapter: GuideChapter; anchor: string } | null {
  const raw = hash.replace(/^#/, '')
  if (!raw) return null
  if (raw === 'layout') return { chapter: 'chart', anchor: '' }
  if (raw === 'pinned') return { chapter: 'notation', anchor: '#walk' }
  if (raw === 'diagnostics') return { chapter: 'numbers', anchor: '#diagnostics' }
  if (raw.startsWith('g-')) return { chapter: 'glossary', anchor: `#${raw}` }
  if (isGuideChapter(raw)) return { chapter: raw, anchor: '' }
  return null
}

/** retired chapter routes → their new home, for old bookmarks and links */
export function chapterRedirect(slug: string): { chapter: GuideChapter; anchor: string } | null {
  if (slug === 'pinned') return { chapter: 'notation', anchor: '#walk' }
  return null
}
