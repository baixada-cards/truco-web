export const SUPPORTED_LOCALES = ['en', 'pt-BR', 'es'] as const
export type AppLocale = typeof SUPPORTED_LOCALES[number]

export const DEFAULT_LOCALE: AppLocale = 'en'

export const LOCALE_OPTIONS: Array<{
  locale: AppLocale
  label: string
  shortLabel: string
}> = [
  { locale: 'en', label: 'English', shortLabel: 'EN' },
  { locale: 'pt-BR', label: 'Português (Brasil)', shortLabel: 'PT-BR' },
  { locale: 'es', label: 'Español', shortLabel: 'ES' },
]

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && SUPPORTED_LOCALES.includes(value as AppLocale)
}

export function appLocaleLabel(locale: AppLocale) {
  return LOCALE_OPTIONS.find((option) => option.locale === locale)?.label ?? locale
}
