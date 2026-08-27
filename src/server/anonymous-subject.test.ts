import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveLiveSubjectSecret } from './anonymous-subject.ts'

const generatedSecret = 'a'.repeat(32)

test('uses the preferred configured cookie secret', () => {
  assert.equal(
    resolveLiveSubjectSecret(
      {
        TRUCO_ANON_COOKIE_SECRET: generatedSecret,
        TRUCO_LIVE_COOKIE_SECRET: 'b'.repeat(32),
      },
      'fallback',
    ),
    generatedSecret,
  )
})

test('keeps the legacy cookie-secret alias compatible', () => {
  assert.equal(
    resolveLiveSubjectSecret(
      { TRUCO_LIVE_COOKIE_SECRET: generatedSecret },
      'fallback',
    ),
    generatedSecret,
  )
})

test('uses the process-local fallback outside production', () => {
  assert.equal(
    resolveLiveSubjectSecret({ NODE_ENV: 'development' }, 'fallback'),
    'fallback',
  )
})

test('requires an explicit secret in production', () => {
  assert.throws(
    () => resolveLiveSubjectSecret({ NODE_ENV: 'production' }, 'fallback'),
    /required in production/u,
  )
})

test('rejects the former documented placeholder', () => {
  assert.throws(
    () =>
      resolveLiveSubjectSecret(
        {
          NODE_ENV: 'production',
          TRUCO_ANON_COOKIE_SECRET: 'replace-me-with-a-long-random-secret',
        },
        'fallback',
      ),
    /generated secret/u,
  )
})

test('rejects configured secrets shorter than 32 characters', () => {
  assert.throws(
    () =>
      resolveLiveSubjectSecret(
        {
          NODE_ENV: 'production',
          TRUCO_ANON_COOKIE_SECRET: 'too-short',
        },
        'fallback',
      ),
    /at least 32 characters/u,
  )
})
