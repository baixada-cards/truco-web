/**
 * Tests for the pure-logic aspects of the shortcuts module.
 *
 * The useLiveShortcuts hook itself is a thin React wrapper; the keyboard
 * shortcut resolution logic is already covered by live-keyboard-shortcuts.test.ts
 * and live-game-shortcut-intents.test.ts (via live-game-status.test.ts).
 *
 * Here we verify the shape of the module — that it exports what LiveGame.tsx
 * expects — without spinning up a React environment.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import * as module from './use-live-shortcuts.ts'

test('useLiveShortcuts is exported as a function', () => {
  assert.equal(typeof module.useLiveShortcuts, 'function')
})

test('module does not accidentally export non-hook symbols', () => {
  const exportedNames = Object.keys(module)
  assert.ok(
    exportedNames.includes('useLiveShortcuts'),
    `Expected useLiveShortcuts to be exported; got: ${exportedNames.join(', ')}`,
  )
})
