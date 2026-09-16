// A cross-reference from the prose to another chapter of the guide. The
// locale is read here rather than passed in, so `rich` can stay one plain
// constant that every chapter spreads; it is the same context LabSpotLink
// reads, and works in server chapters and client plates alike.

import Link from 'next/link'
import { useLocale } from 'next-intl'

import type { GuideChapter } from './chapters'
import styles from './guide.module.css'

export function ChapterLink({
  chapter,
  children,
}: {
  chapter: GuideChapter
  children: React.ReactNode
}) {
  const locale = useLocale()
  return (
    <Link className={styles.chapterLink} href={`/${locale}/lab/study/guide/${chapter}`}>
      {children}
    </Link>
  )
}
