import assert from 'node:assert/strict'
import { test } from 'node:test'

import { lampRaiseFxForStakeAction, minimumRaiseResponseReadMs } from './live-lamp-fx.ts'

test('lamp raise FX escalates by target stake instead of raise wording', () => {
  assert.equal(lampRaiseFxForStakeAction('raise', 3), null)

  assert.deepEqual(lampRaiseFxForStakeAction('raise', 6), {
    className: 'ft-root--lamp-pulse-6',
    durationMs: 820,
    kind: 'pulse',
    stake: 6,
  })
  assert.deepEqual(lampRaiseFxForStakeAction('reraise', 6), {
    className: 'ft-root--lamp-pulse-6',
    durationMs: 820,
    kind: 'pulse',
    stake: 6,
  })

  assert.deepEqual(lampRaiseFxForStakeAction('raise', 9), {
    className: 'ft-root--lamp-swing-9',
    durationMs: 1650,
    kind: 'swing',
    stake: 9,
  })
  assert.deepEqual(lampRaiseFxForStakeAction('reraise', 12), {
    className: 'ft-root--lamp-swing-12',
    durationMs: 1900,
    kind: 'swing',
    stake: 12,
  })
})

test('lamp raise FX is disabled for non-raise actions and fast mode', () => {
  assert.equal(lampRaiseFxForStakeAction('accept', 9), null)
  assert.equal(lampRaiseFxForStakeAction('decline', 12), null)
  assert.equal(lampRaiseFxForStakeAction('raise', 12, true), null)
})

test('raise responses wait for the longest active raise visual', () => {
  const baseTiming = {
    baseVisibleMs: 880,
    gapMs: 160,
    followDelayMs: 600,
  }

  assert.equal(minimumRaiseResponseReadMs({
    ...baseTiming,
    action: 'raise',
    stake: 3,
  }), 1040)
  assert.equal(minimumRaiseResponseReadMs({
    ...baseTiming,
    action: 'raise',
    stake: 9,
  }), 1810)
  assert.equal(minimumRaiseResponseReadMs({
    ...baseTiming,
    action: 'reraise',
    stake: 12,
  }), 2060)
  assert.equal(minimumRaiseResponseReadMs({
    ...baseTiming,
    action: 'raise',
    stake: 12,
    fastModeEnabled: true,
  }), 0)
})
