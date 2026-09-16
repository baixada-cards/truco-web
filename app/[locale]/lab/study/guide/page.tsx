import { setRequestLocale } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'

import { guideHref, isGuideLocale } from '../../../../../src/guide/guide-locales'
import { GuideLanding } from '../../../../../src/guide/GuideLanding'
import { studyLabRouteEnabled } from '../../../../../src/server/study-lab-config'

export const dynamic = 'force-dynamic'

export default async function StudyGuidePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  if (!studyLabRouteEnabled()) {
    notFound()
  }

  const { locale } = await params
  if (!isGuideLocale(locale)) {
    redirect(guideHref(locale))
  }
  setRequestLocale(locale)

  return <GuideLanding />
}
