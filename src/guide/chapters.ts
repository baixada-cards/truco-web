// The guide's chapters, in reading order. Routes, rail, landing TOC and
// prev/next footers all derive from this list (plan 77 A). The landing page
// additionally groups them into parts (plan 80): Part I is the theory and
// the solver's documentation, Part II the player's handbook, and the
// glossary is back-matter shared by both. URLs stay flat — parts are a
// contents-page grouping, never a route segment.

const THEORY = [
  'rules',
  'solving',
  'chart',
  'ranges',
  'views',
  'abstractions',
  'notation',
  'trust',
] as const

const HANDBOOK = ['eleven', 'leads', 'raising', 'leaks'] as const

const REFERENCE = ['numbers', 'glossary'] as const

export const GUIDE_PARTS = [
  { id: 'theory', chapters: THEORY },
  { id: 'handbook', chapters: HANDBOOK },
  { id: 'reference', chapters: REFERENCE },
] as const

export type GuidePart = (typeof GUIDE_PARTS)[number]['id']

/** which part a chapter belongs to — the running head and the margin index */
export function partForChapter(chapter: GuideChapter): GuidePart {
  const part = GUIDE_PARTS.find((p) => (p.chapters as readonly string[]).includes(chapter))
  return (part ?? GUIDE_PARTS[0]).id
}

export const GUIDE_CHAPTERS = [...THEORY, ...HANDBOOK, ...REFERENCE] as const

export type GuideChapter = (typeof GUIDE_CHAPTERS)[number]

export const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi'] as const

export function isGuideChapter(value: string): value is GuideChapter {
  return (GUIDE_CHAPTERS as readonly string[]).includes(value)
}

export function chapterRoman(chapter: GuideChapter): string {
  return ROMAN[GUIDE_CHAPTERS.indexOf(chapter)]
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
  if (raw === 'pinned') return { chapter: 'chart', anchor: '#walk' }
  if (raw.startsWith('g-')) return { chapter: 'glossary', anchor: `#${raw}` }
  if (isGuideChapter(raw)) return { chapter: raw, anchor: '' }
  return null
}

/** retired chapter routes → their new home, for old bookmarks and links */
export function chapterRedirect(slug: string): { chapter: GuideChapter; anchor: string } | null {
  if (slug === 'pinned') return { chapter: 'chart', anchor: '#walk' }
  return null
}
