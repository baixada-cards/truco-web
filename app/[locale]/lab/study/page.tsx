import { Suspense } from 'react'
import { notFound } from 'next/navigation'

import StudyLab from '../../../../src/StudyLab'
import {
  studyLabRouteEnabled,
  studyManifestUrl,
} from '../../../../src/server/study-lab-config'

export const dynamic = 'force-dynamic'

export default function StudyPage() {
  if (!studyLabRouteEnabled()) {
    notFound()
  }

  return (
    <Suspense fallback={null}>
      <StudyLab manifestUrl={studyManifestUrl()} />
    </Suspense>
  )
}
