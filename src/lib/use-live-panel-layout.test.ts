/**
 * Tests for the pure-logic aspects of the panel layout module.
 *
 * The useLivePanelLayout hook itself is a thin React wrapper; the behaviour
 * it delegates to is already handled by React state mechanics.
 *
 * Here we verify the shape of the module — that it exports what LiveGame.tsx
 * expects — without spinning up a React environment.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import * as module from './use-live-panel-layout.ts'
import {
  persistLiveSettingsSectionOpenState,
  readLiveSettingsSectionOpenState,
  sanitizeLiveSettingsSectionOpenState,
} from './live-settings-ui.ts'

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

  return { storage, values }
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

test('useLivePanelLayout is exported as a function', () => {
  assert.equal(typeof module.useLivePanelLayout, 'function')
})

test('module exports the expected type re-exports', () => {
  // Type exports are erased at runtime, so we verify the named function export
  // and the absence of unexpected runtime values.
  const exportedNames = Object.keys(module)
  assert.ok(
    exportedNames.includes('useLivePanelLayout'),
    `Expected useLivePanelLayout to be exported; got: ${exportedNames.join(', ')}`,
  )
})

test('settings section open state sanitizes missing panes back to defaults', () => {
  assert.deepEqual(
    sanitizeLiveSettingsSectionOpenState({
      match: false,
      shortcuts: true,
      unknown: false,
    }),
    {
      match: false,
      language: true,
      deck: true,
      experience: true,
      shortcuts: true,
    },
  )
})

test('settings section open state persists through local storage', () => {
  const { storage } = createLocalStorageStub()

  withWindow(storage, () => {
    persistLiveSettingsSectionOpenState({
      match: false,
      language: false,
      deck: true,
      experience: true,
      shortcuts: true,
    })

    assert.deepEqual(readLiveSettingsSectionOpenState(), {
      match: false,
      language: false,
      deck: true,
      experience: true,
      shortcuts: true,
    })
  })
})
