import assert from 'node:assert/strict'
import { test } from 'node:test'

import { resolveElevenTensionSoundCue } from './eleven-tension-fx.ts'

test('eleven tension cue fires when the first player reaches exactly eleven', () => {
  assert.equal(
    resolveElevenTensionSoundCue(
      { hero: 10, villain: 7 },
      { hero: 11, villain: 7 },
    ),
    'eleven_entry',
  )
})

test('eleven tension cue fires when the second player creates an eleven duel', () => {
  assert.equal(
    resolveElevenTensionSoundCue(
      { hero: 11, villain: 9 },
      { hero: 11, villain: 11 },
    ),
    'eleven_duel',
  )
})

test('eleven tension cue stays silent for match-winning jumps past eleven', () => {
  assert.equal(
    resolveElevenTensionSoundCue(
      { hero: 10, villain: 7 },
      { hero: 12, villain: 7 },
    ),
    null,
  )
})
