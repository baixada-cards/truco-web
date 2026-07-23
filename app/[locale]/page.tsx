import { Suspense } from 'react'
import { setRequestLocale } from 'next-intl/server'

import LiveGame from '../../src/LiveGame'

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <Suspense fallback={null}>
      <LiveGame />
    </Suspense>
  )
}
