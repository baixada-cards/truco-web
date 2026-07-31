// The whole guide on one page, without navigation chrome: the source both
// the PDF and the EPUB are built from (scripts/build_guide_book.mjs) and a
// usable "print this" view in its own right. Same catalog, same chapter
// components as the routed guide, so the book can never drift from the site.

import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { GUIDE_PARTS, chapterRoman } from '../../../../../../src/guide/chapters'
import { CHAPTER_BODIES } from '../../../../../../src/guide/chapters/registry'
import { GuideBookPage } from '../../../../../../src/guide/GuideBookPage'
import { studyLabRouteEnabled } from '../../../../../../src/server/study-lab-config'

export const dynamic = 'force-dynamic'

export default async function GuidePrintPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  if (!studyLabRouteEnabled()) {
    notFound()
  }

  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'Study.guide' })

  const parts = GUIDE_PARTS.map((part) => ({
    id: part.id,
    kicker: t(`parts.${part.id}.kicker`),
    head: t(`parts.${part.id}.head`),
    lede: t.has(`parts.${part.id}.lede`) ? t(`parts.${part.id}.lede`) : null,
    chapters: part.chapters.map((id) => ({
      id,
      roman: chapterRoman(id),
      title: t(`sec.${id}.title`),
      tocName: t(`toc.${id}`),
      Body: CHAPTER_BODIES[id],
    })),
  }))

  return (
    <GuideBookPage
      locale={locale}
      kicker={t('kicker')}
      title={t('title')}
      contents={t('contents')}
      chapterLabel={(roman) => t('nav.chapter', { no: roman })}
      parts={parts}
    />
  )
}
