// The canonical URL list for search engines. Every indexable surface appears
// once per locale, and each entry carries the full hreflang set so the three
// locales are read as translations of one page rather than as duplicates.
//
// Rendered per request rather than at build time: STUDY_LAB_MODE is a
// deploy-time variable the image build never sees, so a static sitemap would
// be baked with the lab switched off and would ship an empty study section.
import type { MetadataRoute } from 'next'

import { GUIDE_CHAPTERS } from '../src/guide/chapters'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../src/i18n/locales'
import { siteOrigin } from '../src/server/site-url'
import { studyLabRouteEnabled } from '../src/server/study-lab-config'

export const dynamic = 'force-dynamic'

// Paths below the locale prefix. `guide/print` is deliberately absent: it is a
// noindex duplicate of the routed chapters, and listing a noindexed URL here
// is precisely what makes Search Console complain.
function indexablePaths() {
  const paths = ['']
  if (studyLabRouteEnabled()) {
    paths.push(
      '/lab/study',
      '/lab/study/guide',
      ...GUIDE_CHAPTERS.map((chapter) => `/lab/study/guide/${chapter}`),
    )
  }

  return paths
}

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin()

  return indexablePaths().flatMap((path) => {
    const localized = (locale: string) => `${origin}/${locale}${path}`
    const languages = {
      ...Object.fromEntries(
        SUPPORTED_LOCALES.map((locale) => [locale, localized(locale)]),
      ),
      'x-default': localized(DEFAULT_LOCALE),
    }

    return SUPPORTED_LOCALES.map((locale) => ({
      url: localized(locale),
      alternates: { languages },
    }))
  })
}
