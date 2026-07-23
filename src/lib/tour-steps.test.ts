import assert from 'node:assert/strict'
import { test } from 'node:test'

import { TOUR_STEPS, asList, type Step, type TourObserve } from './tour-steps.ts'

const asStrings = (s: Step) => [
  ...asList(s.target),
  ...(s.lift ? [s.lift] : []),
  ...(s.allow ?? []),
  ...(s.glow ?? []),
  ...(s.cardAnchor ? [s.cardAnchor] : []),
]

test('step keys are unique', () => {
  const keys = TOUR_STEPS.map((s) => s.key)
  assert.equal(new Set(keys).size, keys.length, `duplicate key in [${keys.join(', ')}]`)
})

// THE back-navigation guarantee: a step must re-force the lab state it focuses,
// so arriving from either direction shows the right thing. The 15→14 focus bug
// was exactly a step (handOften) with no `apply` relying on the previous step.
test('every step forces its own lab state (has an `apply`)', () => {
  for (const s of TOUR_STEPS) {
    assert.ok(typeof s.apply === 'string' && s.apply.length > 0, `step "${s.key}" is missing apply`)
  }
})

// a step whose focus/lift/whitelist lives inside the pinned-hand panel must open
// it (it collapses on narrow viewports) — else its target isn't in the DOM
test('every step targeting the hand panel opens it (`hand: true`)', () => {
  for (const s of TOUR_STEPS) {
    const touchesHand = asStrings(s).some((sel) => sel.includes('hand-') || sel.includes('data-tour="pinned"'))
    if (touchesHand) assert.ok(s.hand === true, `step "${s.key}" targets the hand panel but does not set hand:true`)
  }
})

test('only interactive steps auto-advance (advanceWhen ⇒ task)', () => {
  for (const s of TOUR_STEPS) {
    if (s.advanceWhen) assert.ok(s.task === true, `step "${s.key}" has advanceWhen but is not marked task`)
  }
})

test('a whitelisted control (`allow`) always has a lifted section (`lift`)', () => {
  for (const s of TOUR_STEPS) {
    if (s.allow?.length) assert.ok(s.lift, `step "${s.key}" allows a control but sets no lift`)
  }
})

test('a beacon step always has a glowed control to put the beacon on', () => {
  for (const s of TOUR_STEPS) {
    if (s.beacon) assert.ok(s.glow?.length, `step "${s.key}" sets beacon without glow`)
  }
})

test('a card side preference names the section to clear (cardAnchor)', () => {
  for (const s of TOUR_STEPS) {
    if (s.cardSide) assert.ok(s.cardAnchor, `step "${s.key}" sets cardSide without cardAnchor`)
  }
})

test('every target/lift/allow/glow selector is a non-empty string', () => {
  for (const s of TOUR_STEPS) {
    for (const sel of asStrings(s)) {
      assert.ok(typeof sel === 'string' && sel.trim().length > 0, `step "${s.key}" has an empty selector`)
    }
  }
})

// spot-check a couple of advanceWhen predicates so a refactor can't silently
// invert them
test('advanceWhen predicates fire on the intended action', () => {
  const base: TourObserve = { line: [], cursor: 0, drafts: {} }
  const editPast = TOUR_STEPS.find((s) => s.key === 'editPast')!
  assert.equal(editPast.advanceWhen!({ ...base, line: [3, 0] }, base), false, 'not yet 5♦ lead')
  assert.equal(editPast.advanceWhen!({ ...base, line: [9, 0] }, base), true, '5♦ (class 9) lead')

  const pin = TOUR_STEPS.find((s) => s.key === 'pin')!
  assert.equal(pin.advanceWhen!({ ...base, drafts: { pé: { slots: [null, 8, 0], locked: false } } }, base), false)
  assert.equal(pin.advanceWhen!({ ...base, drafts: { pé: { slots: [null, 8, 0], locked: true } } }, base), true)

  const rangeMake = TOUR_STEPS.find((s) => s.key === 'rangeMake')!
  assert.equal(rangeMake.advanceWhen!({ ...base, drafts: { pé: { slots: [11, 8, 0], locked: false } } }, base), false)
  assert.equal(rangeMake.advanceWhen!({ ...base, drafts: { pé: { slots: [null, 8, 0], locked: false } } }, base), true)
})
