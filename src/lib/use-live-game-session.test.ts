/**
 * Tests for the pure-logic aspects of the game-session module.
 *
 * useLiveGameSession is a compatibility selector over the shared engine-state
 * reducer. The orchestration logic (applySessionSnapshot, loadExistingGame,
 * etc.) stays in LiveGame.tsx and is exercised by Playwright e2e tests.
 *
 * Here we verify the shape of the module — that it exports what LiveGame.tsx
 * expects — without spinning up a React environment.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import * as module from './use-live-game-session.ts'

test('useLiveGameSession is exported as a function', () => {
  assert.equal(typeof module.useLiveGameSession, 'function')
})

test('module exports the expected symbols', () => {
  const exportedNames = Object.keys(module)
  assert.ok(
    exportedNames.includes('useLiveGameSession'),
    `Expected useLiveGameSession to be exported; got: ${exportedNames.join(', ')}`,
  )
})
