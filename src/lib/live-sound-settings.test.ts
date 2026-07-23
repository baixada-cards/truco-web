import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildDefaultLiveSoundSettings,
  sanitizeLiveSoundSettings,
} from './live-sound-settings.ts'
import { DEFAULT_SOUND_THEME_ID } from './table-sound-fx.ts'

test('default live sound settings include the default theme', () => {
  assert.deepEqual(buildDefaultLiveSoundSettings(), {
    soundEnabled: true,
    soundVolume: 0.78,
    soundLastAudibleVolume: 0.78,
    soundTheme: DEFAULT_SOUND_THEME_ID,
  })
})

test('sanitize live sound settings clamps volume and falls back on invalid theme ids', () => {
  assert.deepEqual(
    sanitizeLiveSoundSettings({
      soundEnabled: false,
      soundVolume: 2.4,
      soundTheme: 'not-a-theme',
    }),
    {
      soundEnabled: false,
      soundVolume: 0,
      soundLastAudibleVolume: 1,
      soundTheme: DEFAULT_SOUND_THEME_ID,
    },
  )
})

test('sanitize live sound settings keeps valid theme ids', () => {
  assert.deepEqual(
    sanitizeLiveSoundSettings({
      soundEnabled: true,
      soundVolume: 0.33,
      soundLastAudibleVolume: 0.45,
      soundTheme: 'farol-felt-a',
    }),
    {
      soundEnabled: true,
      soundVolume: 0.33,
      soundLastAudibleVolume: 0.45,
      soundTheme: 'farol-felt-a',
    },
  )
})

test('sanitize live sound settings migrates legacy muted values and removed themes', () => {
  assert.deepEqual(
    sanitizeLiveSoundSettings({
      soundEnabled: false,
      soundVolume: 0.33,
      soundTheme: 'ghost-glass',
    }),
    {
      soundEnabled: false,
      soundVolume: 0,
      soundLastAudibleVolume: 0.33,
      soundTheme: DEFAULT_SOUND_THEME_ID,
    },
  )
})
