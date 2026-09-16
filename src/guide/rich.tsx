// Shared inline rich-text tag renderers for next-intl `t.rich`, usable from
// server and client components alike. The tag names live in rich-tags.ts,
// which the copy editor's write API and the DOM matcher read too.

import { CardToken, HandToken } from './CardTokens'
import { ChapterLink } from './ChapterLink'
import type { GuideChapter } from './chapters'
import { CHAPTER_TAG_NAMES } from './rich-tags'

type TagRenderer = (chunks: React.ReactNode) => React.ReactNode

/** one cross-reference tag per chapter, named after the chapter's own id */
const chapterTags = Object.fromEntries(
  CHAPTER_TAG_NAMES.map((chapter) => [
    chapter,
    (chunks: React.ReactNode) => <ChapterLink chapter={chapter}>{chunks}</ChapterLink>,
  ]),
) as Record<GuideChapter, TagRenderer>

export const rich = {
  b: (chunks: React.ReactNode) => <b>{chunks}</b>,
  i: (chunks: React.ReactNode) => <i>{chunks}</i>,
  em: (chunks: React.ReactNode) => <em>{chunks}</em>,
  code: (chunks: React.ReactNode) => <code>{chunks}</code>,
  card: (chunks: React.ReactNode) => <CardToken>{chunks}</CardToken>,
  hand: (chunks: React.ReactNode) => <HandToken>{chunks}</HandToken>,
  ...chapterTags,
}
