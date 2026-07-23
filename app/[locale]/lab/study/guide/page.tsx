import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'

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
  setRequestLocale(locale)

  return <GuideLanding />
}
