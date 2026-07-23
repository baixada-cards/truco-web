import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { createElement, Fragment, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTranslator, type AbstractIntlMessages } from 'next-intl'

import {
  DEFAULT_LOCALE,
  LOCALE_OPTIONS,
  SUPPORTED_LOCALES,
  isAppLocale,
} from './locales.ts'

function readMessages(locale: string) {
  const url = new URL(`../../messages/${locale}.json`, import.meta.url)
  return JSON.parse(readFileSync(url, 'utf8')) as unknown
}

function collectMessageKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : []
  }

  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => collectMessageKeys(child, prefix ? `${prefix}.${key}` : key))
    .sort()
}

function collectMessageStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []

  return Object.values(value as Record<string, unknown>).flatMap(collectMessageStrings)
}

test('supported locale guards accept only configured locales', () => {
  assert.equal(DEFAULT_LOCALE, 'en')
  assert.deepEqual([...SUPPORTED_LOCALES], ['en', 'pt-BR', 'es'])
  assert.equal(isAppLocale('en'), true)
  assert.equal(isAppLocale('pt-BR'), true)
  assert.equal(isAppLocale('es'), true)
  assert.equal(isAppLocale('pt'), false)
  assert.equal(isAppLocale('fr'), false)
})

test('locale options expose stable maker stamp labels', () => {
  assert.deepEqual(
    LOCALE_OPTIONS.map((option) => [option.locale, option.shortLabel, option.label]),
    [
      ['en', 'EN', 'English'],
      ['pt-BR', 'PT-BR', 'Português (Brasil)'],
      ['es', 'ES', 'Español'],
    ],
  )
})

test('translated message catalogs keep the same key shape', () => {
  const defaultKeys = collectMessageKeys(readMessages(DEFAULT_LOCALE))

  for (const locale of SUPPORTED_LOCALES) {
    assert.deepEqual(collectMessageKeys(readMessages(locale)), defaultKeys, locale)
  }
})

test('Portuguese and Spanish player-facing copy stays singular for 1v1', () => {
  const forbiddenByLocale = {
    'pt-BR': [/\b[Nn]ós\b/, /\b[Ee]les\b/, /\bdeles\b/, /\b[Nn]oss[ao]s?\b/, /\bVencemos\b/, /\bPerdemos\b/],
    es: [/\b[Nn]osotros\b/, /\b[Ee]llos\b/, /\bde ellos\b/, /\b[Nn]uestr[ao]s?\b/, /\bGanamos\b/, /\bPerdimos\b/],
  } as const

  for (const [locale, forbiddenPatterns] of Object.entries(forbiddenByLocale)) {
    const text = collectMessageStrings(readMessages(locale)).join('\n')

    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(text, pattern, `${locale} ${pattern}`)
    }
  }
})

test('match-not-found explanations render the rich match link', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const t = createTranslator({
      locale,
      messages: readMessages(locale) as AbstractIntlMessages,
    })
    const rich = t.rich as (
      key: string,
      values: { link: () => ReactNode },
    ) => ReactNode

    for (const reason of ['expired', 'notfound'] as const) {
      const explanation = rich(`Live.notFound.${reason}.explanation`, {
        link: () => createElement('code', null, '/?match=abc123'),
      })
      const markup = renderToStaticMarkup(createElement(Fragment, null, explanation))

      assert.match(markup, /<code>\/\?match=abc123<\/code>/, `${locale} ${reason}`)
      assert.doesNotMatch(markup, /function|\{link\}/, `${locale} ${reason}`)
    }
  }
})
