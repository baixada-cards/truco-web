import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  LIVE_GAME_PREFERENCES_STORAGE_KEY,
  persistLiveGamePreferences,
  readLiveGamePreferences,
  resetDeckPickerPrompt,
  sanitizeLiveGamePreferences,
} from './live-game-preferences.ts'

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

test('preferences sanitize legacy prototype shortcut settings', () => {
  const preferences = sanitizeLiveGamePreferences({
    fastMode: true,
    shortcuts: {
      play_card_1: '1',
      play_card_2: '2',
      play_card_3: '3',
      hide_card_1: 'Shift+1',
      hide_card_2: 'Shift+2',
      hide_card_3: 'Shift+3',
      raise_stake: 'Q',
      accept_raise: 'W',
      decline_raise: 'E',
      toggle_strength_guide: 'Tab',
    },
  })

  assert.equal(preferences.fastMode, true)
  assert.equal(preferences.deckSystem, 'french')
  assert.equal(preferences.deckPickerCompleted, false)
  assert.equal(preferences.deckPickerDismissCount, 0)
  assert.equal(preferences.hideCardPlaysImmediately, true)
  assert.equal(preferences.shortcutsEnabled, true)
  assert.equal(preferences.shortcuts.hide_card_1, 'A')
  assert.equal(preferences.shortcuts.hide_card_2, 'S')
  assert.equal(preferences.shortcuts.hide_card_3, 'D')
  assert.equal(preferences.shortcuts.toggle_strength_guide, 'Tab')
})

test('preferences persist and reload shortcut settings', () => {
  const { storage, values } = createLocalStorageStub()

  withWindow(storage, () => {
    persistLiveGamePreferences({
      deckPickerCompleted: true,
      deckPickerDismissCount: 2,
      deckSystem: 'spanish',
      fastMode: true,
      hideCardPlaysImmediately: false,
      shortcutsEnabled: false,
      shortcuts: {
        play_card_1: 'Z',
        play_card_2: '2',
        play_card_3: '3',
        hide_card_1: 'A',
        hide_card_2: 'S',
        hide_card_3: 'D',
        raise_stake: 'Q',
        accept_raise: 'W',
        decline_raise: 'E',
        toggle_strength_guide: 'Tab',
      },
    })

    const stored = values.get(LIVE_GAME_PREFERENCES_STORAGE_KEY)
    assert.ok(stored)

    const reloaded = readLiveGamePreferences()
    assert.equal(reloaded.deckPickerCompleted, true)
    assert.equal(reloaded.deckPickerDismissCount, 2)
    assert.equal(reloaded.deckSystem, 'spanish')
    assert.equal(reloaded.fastMode, true)
    assert.equal(reloaded.hideCardPlaysImmediately, false)
    assert.equal(reloaded.shortcutsEnabled, false)
    assert.equal(reloaded.shortcuts.play_card_1, 'Z')
    assert.equal(reloaded.shortcuts.raise_stake, 'Q')
    assert.equal(reloaded.shortcuts.toggle_strength_guide, 'Tab')
  })
})

test('preferences sanitize invalid deck values back to the French default', () => {
  const preferences = sanitizeLiveGamePreferences({
    deckPickerCompleted: 'yes',
    deckPickerDismissCount: 99,
    deckSystem: 'tarot',
  })

  assert.equal(preferences.deckPickerCompleted, false)
  assert.equal(preferences.deckPickerDismissCount, 3)
  assert.equal(preferences.deckSystem, 'french')
})

test('deck picker reset preserves the rest of live game preferences', () => {
  const preferences = resetDeckPickerPrompt({
    deckPickerCompleted: true,
    deckPickerDismissCount: 3,
    deckSystem: 'spanish',
    fastMode: true,
    hideCardPlaysImmediately: false,
    shortcutsEnabled: false,
    shortcuts: {
      play_card_1: 'Z',
      play_card_2: '2',
      play_card_3: '3',
      hide_card_1: 'A',
      hide_card_2: 'S',
      hide_card_3: 'D',
      raise_stake: 'Q',
      accept_raise: 'W',
      decline_raise: 'E',
      toggle_strength_guide: 'Tab',
    },
  })

  assert.equal(preferences.deckPickerCompleted, false)
  assert.equal(preferences.deckPickerDismissCount, 0)
  assert.equal(preferences.deckSystem, 'spanish')
  assert.equal(preferences.fastMode, true)
  assert.equal(preferences.hideCardPlaysImmediately, false)
  assert.equal(preferences.shortcutsEnabled, false)
  assert.equal(preferences.shortcuts.play_card_1, 'Z')
})
