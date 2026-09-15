// Which locales the guide is published in. The English text is being
// rewritten chapter by chapter; pt-BR and es follow once it settles, so until
// then every guide link and route lands on the English edition. Re-enabling a
// locale is one entry here: the routes, the lab's links, the sitemap, the
// landing's language picker, and the book builder all read this list.

import { DEFAULT_LOCALE } from '../i18n/locales'

export const GUIDE_LOCALES: readonly string[] = ['en']

export function isGuideLocale(locale: string): boolean {
  return GUIDE_LOCALES.includes(locale)
}

/** the locale a reader of `locale` actually gets the guide in */
export function guideLocale(locale: string): string {
  return isGuideLocale(locale) ? locale : DEFAULT_LOCALE
}

/** `/{locale}/lab/study/guide{path}`, in a published guide locale */
export function guideHref(locale: string, path = ''): string {
  return `/${guideLocale(locale)}/lab/study/guide${path}`
}
