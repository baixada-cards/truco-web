import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  STAKE_REFUSE_DRAG_MAX_OFFSET_PX,
  STAKE_REFUSE_DRAG_THRESHOLD_PX,
  resolveStakePegRefuseDrag,
} from './stake-peg-refuse-gesture.ts'

test('stake refuse drag arms only after a downward threshold', () => {
  assert.deepEqual(resolveStakePegRefuseDrag(0, STAKE_REFUSE_DRAG_THRESHOLD_PX - 1), {
    offsetY: STAKE_REFUSE_DRAG_THRESHOLD_PX - 1,
    isDragging: true,
    isArmed: false,
  })

  assert.deepEqual(resolveStakePegRefuseDrag(0, STAKE_REFUSE_DRAG_THRESHOLD_PX), {
    offsetY: STAKE_REFUSE_DRAG_THRESHOLD_PX,
    isDragging: true,
    isArmed: true,
  })
})

test('stake refuse drag ignores upward offset and clamps long pulls', () => {
  assert.deepEqual(resolveStakePegRefuseDrag(0, -24), {
    offsetY: 0,
    isDragging: true,
    isArmed: false,
  })

  assert.deepEqual(resolveStakePegRefuseDrag(0, STAKE_REFUSE_DRAG_MAX_OFFSET_PX + 40), {
    offsetY: STAKE_REFUSE_DRAG_MAX_OFFSET_PX,
    isDragging: true,
    isArmed: true,
  })
})

test('stake refuse drag preserves taps as clicks', () => {
  assert.deepEqual(resolveStakePegRefuseDrag(2, 3), {
    offsetY: 3,
    isDragging: false,
    isArmed: false,
  })
})
