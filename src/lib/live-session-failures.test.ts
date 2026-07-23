import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  shouldClearBrokenMatchQuery,
  toLiveSessionFailure,
} from './live-session-failures.ts'
import { SessionRequestError } from './session-api.ts'

test('broken resume links map to explicit recovery guidance', () => {
  const expired = toLiveSessionFailure(new SessionRequestError('gone', 'MATCH_EXPIRED', 410))
  const forbidden = toLiveSessionFailure(new SessionRequestError('locked', 'MATCH_FORBIDDEN', 403))

  assert.equal(shouldClearBrokenMatchQuery(expired.code), true)
  assert.match(expired.description, /Start a fresh match/i)
  assert.equal(shouldClearBrokenMatchQuery(forbidden.code), true)
  assert.equal(forbidden.title, 'Match unavailable')
  assert.match(forbidden.description, /could not be opened here/i)
})

test('engine outages do not look like broken resume links', () => {
  const timeout = toLiveSessionFailure(new SessionRequestError('slow', 'ENGINE_TIMEOUT', 504))

  assert.equal(shouldClearBrokenMatchQuery(timeout.code), false)
  assert.match(timeout.description, /Retry in a moment/i)
})

test('unprocessable engine requests get a deliberate recovery category', () => {
  const rejected = toLiveSessionFailure(
    new SessionRequestError('Engine request failed (422)', undefined, 422),
  )

  assert.equal(rejected.code, 'ENGINE_REJECTED_REQUEST')
  assert.equal(rejected.status, 422)
  assert.equal(shouldClearBrokenMatchQuery(rejected.code), false)
})

test('an exhausted shared key nudges toward bring-your-own-key', () => {
  const byCode = toLiveSessionFailure(
    new SessionRequestError('over cap', 'LLM_PROVIDER_EXHAUSTED', 402),
  )
  assert.equal(byCode.code, 'LLM_PROVIDER_EXHAUSTED')
  assert.match(byCode.description, /your own key/i)
  assert.equal(shouldClearBrokenMatchQuery(byCode.code), false)

  // even without the explicit code, a bare 402 falls back to the same category
  const byStatus = toLiveSessionFailure(new SessionRequestError('402', undefined, 402))
  assert.equal(byStatus.code, 'LLM_PROVIDER_EXHAUSTED')
})
