import { hasLocale } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'
import { getRequestConfig } from 'next-intl/server'

import { routing } from './routing'

const messages = {
  en: () => import('../../messages/en.json').then((module) => module.default),
  'pt-BR': () => import('../../messages/pt-BR.json').then((module) => module.default),
  es: () => import('../../messages/es.json').then((module) => module.default),
} satisfies Record<(typeof routing.locales)[number], () => Promise<AbstractIntlMessages>>

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale

  return {
    locale,
    messages: await messages[locale](),
  }
})
