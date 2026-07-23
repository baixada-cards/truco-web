/**
 * Tests for the pure-logic aspects of the animations module.
 *
 * The useLiveAnimations hook is a compatibility selector over the shared
 * engine-state reducer. The underlying celebration logic is covered by
 * live-score-celebration.test.ts.
 *
 * Here we verify the shape of the module — that it exports what LiveGame.tsx
 * expects — without spinning up a React environment.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import * as module from './use-live-animations.ts'

test('useLiveAnimations is exported as a function', () => {
  assert.equal(typeof module.useLiveAnimations, 'function')
})

test('module exports the expected type-level symbols', () => {
  const exportedNames = Object.keys(module)
  assert.ok(
    exportedNames.includes('useLiveAnimations'),
    `Expected useLiveAnimations to be exported; got: ${exportedNames.join(', ')}`,
  )
})
