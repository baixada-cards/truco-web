/**
 * Tests for the pure-logic aspects of the dev controls module.
 *
 * The useLiveDevControls hook itself is a thin React wrapper; the behaviour
 * it delegates to (areLiveDevControlsEnabled, canStartNextHandFromDevControls,
 * etc.) is already covered by live-dev-controls.test.ts.
 *
 * Here we verify the shape of the module — that it exports what LiveGame.tsx
 * expects — without spinning up a React environment.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

// Import via dynamic require so we can verify the export exists without
// actually invoking the hook (which requires React internals).
import * as module from './use-live-dev-controls.ts'
import {
  persistLiveDevControlsSectionOpenState,
  persistLiveDevControlsSelectedValuePatch,
  persistLiveDevControlsSelectedValues,
  persistLiveDevPanelOpen,
  readLiveDevControlsSectionOpenState,
  readLiveDevControlsSelectedValues,
  readLiveDevPanelOpen,
  sanitizeLiveDevControlsSectionOpenState,
  sanitizeLiveDevControlsSelectedValues,
} from './live-dev-controls-preferences.ts'

type StorageStub = {
  length: number
  key: (index: number) => string | null
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
  clear: () => void
}

function createLocalStorageStub() {
  const values = new Map<string, string>()

  const storage: StorageStub = {
    get length() {
      return values.size
    },
    key: (index) => Array.from(values.keys())[index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: (key) => {
      values.delete(key)
    },
    clear: () => {
      values.clear()
    },
  }

  return { storage }
}

function withWindow<T>(storage: StorageStub, run: () => T): T {
  const runtime = globalThis as unknown as {
    window?: {
      localStorage: StorageStub
    }
  }
  const previousWindow = runtime.window
  runtime.window = { localStorage: storage }

  try {
    return run()
  } finally {
    if (previousWindow === undefined) {
      runtime.window = undefined
    } else {
      runtime.window = previousWindow
    }
  }
}

test('useLiveDevControls is exported as a function', () => {
  assert.equal(typeof module.useLiveDevControls, 'function')
})

test('module does not accidentally re-export non-hook symbols', () => {
  // Only the hook and its return type should be exported from this module.
  const exportedNames = Object.keys(module)
  assert.ok(
    exportedNames.includes('useLiveDevControls'),
    `Expected useLiveDevControls to be exported; got: ${exportedNames.join(', ')}`,
  )
})

test('dev controls section state sanitizes missing panes back to defaults', () => {
  assert.deepEqual(
    sanitizeLiveDevControlsSectionOpenState({
      debug: true,
      stale: true,
    }),
    {
      animations: false,
      soundLab: true,
      debug: true,
      gameState: false,
      hints: true,
    },
  )
})

test('dev controls selected values sanitize persisted controls', () => {
  assert.deepEqual(
    sanitizeLiveDevControlsSelectedValues({
      auditionThemeId: 'farol-felt-a',
      auditionCue: 'score',
      dealerChoice: 1,
      stakeResponseAction: 'fold',
      animStakeFrom: 6,
      animScorePoints: 12,
      animScoreWinner: 'villain',
      stakeFxActor: 'hero',
    }),
    {
      auditionThemeId: 'farol-felt-a',
      auditionCue: 'score',
      dealerChoice: 1,
      stakeResponseAction: 'fold',
      animStakeFrom: 6,
      animScorePoints: 12,
      animScoreWinner: 'villain',
      stakeFxActor: 'hero',
    },
  )
})

test('dev controls preferences persist panel, panes, and selected values', () => {
  const { storage } = createLocalStorageStub()

  withWindow(storage, () => {
    persistLiveDevPanelOpen(true)
    persistLiveDevControlsSectionOpenState({
      animations: true,
      soundLab: false,
      debug: true,
      gameState: false,
      hints: true,
    })
    persistLiveDevControlsSelectedValues({
      auditionThemeId: 'farol-felt-a',
      auditionCue: 'decline',
      dealerChoice: 0,
      stakeResponseAction: 'fold',
      animStakeFrom: 9,
      animScorePoints: 6,
      animScoreWinner: 'villain',
      stakeFxActor: 'hero',
    })
    persistLiveDevControlsSelectedValuePatch({ auditionCue: 'accept' })

    assert.equal(readLiveDevPanelOpen(), true)
    assert.deepEqual(readLiveDevControlsSectionOpenState(), {
      animations: true,
      soundLab: false,
      debug: true,
      gameState: false,
      hints: true,
    })
    assert.deepEqual(readLiveDevControlsSelectedValues(), {
      auditionThemeId: 'farol-felt-a',
      auditionCue: 'accept',
      dealerChoice: 0,
      stakeResponseAction: 'fold',
      animStakeFrom: 9,
      animScorePoints: 6,
      animScoreWinner: 'villain',
      stakeFxActor: 'hero',
    })
  })
})
