'use client'

// Anchor compatibility: the lab's legend `?` and HAND `?` (and any old
// bookmarks) deep-link to the v2 single-page anchors — `/guide#views`,
// `/guide#notation`, `/guide#g-<term>` … — which now live on chapter pages.
// On the landing, map a known hash to its chapter route.

import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { chapterForLegacyHash } from './chapters'

export function HashRedirect() {
  const router = useRouter()
  const locale = useLocale()
  useEffect(() => {
    const target = chapterForLegacyHash(window.location.hash)
    if (!target) return
    router.replace(`/${locale}/lab/study/guide/${target.chapter}${target.anchor}`)
  }, [router, locale])
  return null
}
