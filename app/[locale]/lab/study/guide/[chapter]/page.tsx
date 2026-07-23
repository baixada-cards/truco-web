/* eslint-disable react-refresh/only-export-components */
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'

import { GUIDE_CHAPTERS, chapterRedirect, isGuideChapter } from '../../../../../../src/guide/chapters'
import { CHAPTER_BODIES, chapterSections } from '../../../../../../src/guide/chapters/registry'
import { GuideShell } from '../../../../../../src/guide/GuideShell'
import { studyLabRouteEnabled } from '../../../../../../src/server/study-lab-config'

export const dynamic = 'force-dynamic'

export function generateStaticParams() {
  return GUIDE_CHAPTERS.map((chapter) => ({ chapter }))
}

export default async function GuideChapterPage({
  params,
}: {
  params: Promise<{ locale: string; chapter: string }>
}) {
  if (!studyLabRouteEnabled()) {
    notFound()
  }

  const { locale, chapter } = await params
  if (!isGuideChapter(chapter)) {
    const moved = chapterRedirect(chapter)
    if (moved) {
      redirect(`/${locale}/lab/study/guide/${moved.chapter}${moved.anchor}`)
    }
    notFound()
  }
  setRequestLocale(locale)

  const t = await getTranslations({ locale })
  const Body = CHAPTER_BODIES[chapter]

  return (
    <GuideShell chapter={chapter} sections={chapterSections(chapter, (key) => t(key))}>
      <Body />
    </GuideShell>
  )
}
