import { defineRouting } from 'next-intl/routing'

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from './locales'

export const routing = defineRouting({
  locales: SUPPORTED_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always',
  localeCookie: {
    maxAge: 60 * 60 * 24 * 365,
  },
  pathnames: {
    '/': '/',
  },
})
