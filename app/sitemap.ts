// The canonical URL list for search engines. Every indexable surface appears
// once per locale, and each entry carries the full hreflang set so the three
// locales are read as translations of one page rather than as duplicates.
//
// Rendered per request rather than at build time: STUDY_LAB_MODE is a
// deploy-time variable the image build never sees, so a static sitemap would
// be baked with the lab switched off and would ship an empty study section.
import type { MetadataRoute } from 'next'

import { GUIDE_CHAPTERS } from '../src/guide/chapters'
import { GUIDE_LOCALES } from '../src/guide/guide-locales'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../src/i18n/locales'
import { siteOrigin } from '../src/server/site-url'
import { studyLabRouteEnabled } from '../src/server/study-lab-config'

export const dynamic = 'force-dynamic'

// Paths below the locale prefix, each with the locales it exists in. The
// guide is listed only in the locales that carry it (src/guide/guide-locales):
// its other locales redirect, and an hreflang alternate that redirects is
// what audits flag. `guide/print` is deliberately absent: it is a noindex
// duplicate of the routed chapters, and listing a noindexed URL here is
// precisely what makes Search Console complain.
function indexablePaths(): Array<{ path: string; locales: readonly string[] }> {
  const paths: Array<{ path: string; locales: readonly string[] }> = [
    { path: '', locales: SUPPORTED_LOCALES },
  ]
  if (studyLabRouteEnabled()) {
    paths.push(
      { path: '/lab/study', locales: SUPPORTED_LOCALES },
      { path: '/lab/study/guide', locales: GUIDE_LOCALES },
      ...GUIDE_CHAPTERS.map((chapter) => ({
        path: `/lab/study/guide/${chapter}`,
        locales: GUIDE_LOCALES,
      })),
    )
  }

  return paths
}

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin()

  return indexablePaths().flatMap(({ path, locales }) => {
    const localized = (locale: string) => `${origin}/${locale}${path}`
    const fallback = locales.includes(DEFAULT_LOCALE) ? DEFAULT_LOCALE : locales[0]
    const languages = {
      ...Object.fromEntries(locales.map((locale) => [locale, localized(locale)])),
      'x-default': localized(fallback),
    }

    return locales.map((locale) => ({
      url: localized(locale),
      alternates: { languages },
    }))
  })
}
