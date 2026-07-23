import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DEFAULT_SOUND_THEME_ID,
  SOUND_CUES,
  SOUND_THEME_REEL,
  TABLE_SOUND_THEMES,
  TABLE_SOUND_THEME_DEFINITION,
  getTableSoundTheme,
  isSoundThemeId,
  resolveConfiguredSampleCueSources,
  resolveTallyStrokePlan,
} from './table-sound-fx.ts'

test('table sound theme definition captures the core dimensions of a shared audio identity', () => {
  assert.match(TABLE_SOUND_THEME_DEFINITION.summary, /system-wide ruleset/i)
  assert.equal(TABLE_SOUND_THEME_DEFINITION.dimensions.length, 5)
})

test('table sound theme catalog keeps the selected Farol direction', () => {
  assert.equal(TABLE_SOUND_THEMES.length, 1)
  assert.deepEqual(TABLE_SOUND_THEMES.map((theme) => theme.id), ['farol-felt-a'])
  assert.deepEqual(TABLE_SOUND_THEMES.map((theme) => theme.renderStyle), ['sample-a'])
})

test('default sound theme id resolves to a known theme', () => {
  assert.equal(isSoundThemeId(DEFAULT_SOUND_THEME_ID), true)
  assert.equal(getTableSoundTheme(DEFAULT_SOUND_THEME_ID).label, 'Farol')
})

test('sound theme reel covers every cue at least once', () => {
  const reelCues = new Set(SOUND_THEME_REEL.map((item) => item.cue))
  assert.deepEqual(new Set(SOUND_CUES), reelCues)
})

test('sound theme reel previews the full raise and re-raise ladder', () => {
  assert.deepEqual(
    SOUND_THEME_REEL
      .filter((item) => item.cue === 'raise')
      .map((item) => item.stake),
    [3, 6, 9, 12],
  )
})

test('raise to nine does not include the metallic reraise creak layer', () => {
  const creakSource = '/audio/farol/reraise-lamp-creak-pse-gen-ys39g.m4a'

  assert.equal(resolveConfiguredSampleCueSources('raise', { stake: 9 }).includes(creakSource), false)
  assert.equal(resolveConfiguredSampleCueSources('raise', { stake: 12 }).includes(creakSource), true)
})

test('three-point tally stroke plan uses all three pencil cuts in the plus-three sequence', () => {
  const plan = resolveTallyStrokePlan(3, 95, [0, 1, 2])

  assert.deepEqual(plan.map((step) => step.segmentIndex), [0, 1, 2])
  assert.deepEqual(plan.map((step) => Number(step.delaySeconds.toFixed(3))), [0, 0.095, 0.19])
  assert.equal(plan[2]?.gain, 1.1)
})

test('default tally stroke plan spaces audible scratches at the visual reveal cadence', () => {
  const plan = resolveTallyStrokePlan(3)

  assert.deepEqual(plan.map((step) => Number(step.delaySeconds.toFixed(2))), [0, 0.15, 0.3])
})

test('tally stroke plan rotates the configured three-stroke sequence for larger scores', () => {
  const plan = resolveTallyStrokePlan(6, 110, [2, 0, 1])

  assert.deepEqual(plan.map((step) => step.segmentIndex), [2, 0, 1, 2, 0, 1])
  assert.deepEqual(plan.map((step) => Number(step.delaySeconds.toFixed(2))), [0, 0.11, 0.22, 0.33, 0.44, 0.55])
})
