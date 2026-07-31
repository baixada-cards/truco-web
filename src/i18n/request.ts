import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { hasLocale } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'
import { getRequestConfig } from 'next-intl/server'

import { routing } from './routing'

const messages = {
  en: () => import('../../messages/en.json').then((module) => module.default),
  'pt-BR': () => import('../../messages/pt-BR.json').then((module) => module.default),
  es: () => import('../../messages/es.json').then((module) => module.default),
} satisfies Record<(typeof routing.locales)[number], () => Promise<AbstractIntlMessages>>

/**
 * In development the catalogs are read from disk on every request, so copy
 * edited in place (the guide's dev-only editor writes messages/<locale>.json)
 * shows up on the next reload. The bundler caches the JSON module otherwise,
 * and a stale catalog renders as the message key. Production keeps the
 * bundled import.
 */
async function loadMessages(locale: (typeof routing.locales)[number]) {
  if (process.env.NODE_ENV === 'production') return messages[locale]()
  try {
    const file = path.join(process.cwd(), 'messages', `${locale}.json`)
    return JSON.parse(await readFile(file, 'utf8')) as AbstractIntlMessages
  } catch {
    return messages[locale]()
  }
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale

  return {
    locale,
    messages: await loadMessages(locale),
  }
})
