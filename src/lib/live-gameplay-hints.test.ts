import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildDefaultGameplayHints,
  dismissElevenHandHint,
  dismissRaiseHint,
  sanitizeGameplayHints,
  setHintsEnabled,
  shouldShowElevenHandHint,
  shouldShowRaiseHint,
} from './live-gameplay-hints.ts'

test('defaults: hints enabled, nothing seen', () => {
  const state = buildDefaultGameplayHints()
  assert.equal(state.hintsEnabled, true)
  assert.equal(state.raiseSeen, false)
  assert.equal(state.elevenHandSeen, false)
})

test('sanitize returns defaults for invalid input', () => {
  assert.deepEqual(sanitizeGameplayHints(null), buildDefaultGameplayHints())
  assert.deepEqual(sanitizeGameplayHints(undefined), buildDefaultGameplayHints())
  assert.deepEqual(sanitizeGameplayHints('string'), buildDefaultGameplayHints())
  assert.deepEqual(sanitizeGameplayHints([]), buildDefaultGameplayHints())
})

test('sanitize preserves valid state', () => {
  const state = { hintsEnabled: false, raiseSeen: true, elevenHandSeen: true }
  assert.deepEqual(sanitizeGameplayHints(state), state)
})

test('sanitize treats hintsEnabled absence as true', () => {
  const result = sanitizeGameplayHints({ raiseSeen: false, elevenHandSeen: false })
  assert.equal(result.hintsEnabled, true)
})

test('shouldShowRaiseHint: true when enabled and not seen', () => {
  assert.equal(shouldShowRaiseHint(buildDefaultGameplayHints()), true)
})

test('shouldShowRaiseHint: false after seen', () => {
  const state = dismissRaiseHint(buildDefaultGameplayHints())
  assert.equal(shouldShowRaiseHint(state), false)
})

test('shouldShowRaiseHint: false when hints disabled', () => {
  const state = setHintsEnabled(buildDefaultGameplayHints(), false)
  assert.equal(shouldShowRaiseHint(state), false)
})

test('shouldShowElevenHandHint: true when enabled and not seen', () => {
  assert.equal(shouldShowElevenHandHint(buildDefaultGameplayHints()), true)
})

test('shouldShowElevenHandHint: false after seen', () => {
  const state = dismissElevenHandHint(buildDefaultGameplayHints())
  assert.equal(shouldShowElevenHandHint(state), false)
})

test('dismissRaiseHint is idempotent', () => {
  const once = dismissRaiseHint(buildDefaultGameplayHints())
  const twice = dismissRaiseHint(once)
  assert.equal(once, twice)
})

test('dismissElevenHandHint is idempotent', () => {
  const once = dismissElevenHandHint(buildDefaultGameplayHints())
  const twice = dismissElevenHandHint(once)
  assert.equal(once, twice)
})

test('dismissing raise does not affect eleven hint', () => {
  const state = dismissRaiseHint(buildDefaultGameplayHints())
  assert.equal(shouldShowElevenHandHint(state), true)
})

test('setHintsEnabled false disables hints', () => {
  const state = setHintsEnabled(buildDefaultGameplayHints(), false)
  assert.equal(state.hintsEnabled, false)
  assert.equal(shouldShowRaiseHint(state), false)
  assert.equal(shouldShowElevenHandHint(state), false)
})

test('re-enabling resets seen flags', () => {
  const dismissed = dismissRaiseHint(dismissElevenHandHint(buildDefaultGameplayHints()))
  const disabled = setHintsEnabled(dismissed, false)
  const reEnabled = setHintsEnabled(disabled, true)
  assert.equal(reEnabled.hintsEnabled, true)
  assert.equal(reEnabled.raiseSeen, false)
  assert.equal(reEnabled.elevenHandSeen, false)
  assert.equal(shouldShowRaiseHint(reEnabled), true)
  assert.equal(shouldShowElevenHandHint(reEnabled), true)
})
