import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildStudyPlaySeed } from './study-play.ts'

// 10x10, dealer 0: mão is seat 1 and leads trick 1.
const TEN_TEN = { score: [10, 10] as [number, number], dealer: 0 }

test('hero is the drafted role; seats and scores map from the spot', () => {
  const build = buildStudyPlaySeed({
    spot: TEN_TEN,
    viraRank: 'J',
    line: [],
    drafts: { 'mão': { slots: [12, 5, 2], locked: true } },
  })
  assert.ok(build.ok)
  assert.equal(build.seed.heroRole, 'mão')
  assert.equal(build.seed.humanPlayer, 1) // mão = 1 - dealer
  assert.equal(build.seed.dealer, 0)
  assert.deepEqual(build.seed.score, { '0': 10, '1': 10 })
  assert.deepEqual(build.seed.heroHand, [12, 5, 2])
  assert.equal(build.seed.villainHand, null)
  assert.equal(build.seed.viraRank, 'J')
})

test('a pinned villain hand travels; the pinned role stays the hero', () => {
  const build = buildStudyPlaySeed({
    spot: TEN_TEN,
    viraRank: '4',
    line: [],
    drafts: {
      'mão': { slots: [3, 2, 1], locked: false },
      'pé': { slots: [8, 7, 6], locked: true },
    },
  })
  assert.ok(build.ok)
  assert.equal(build.seed.heroRole, 'pé')
  assert.equal(build.seed.humanPlayer, 0) // pé = dealer
  assert.deepEqual(build.seed.heroHand, [8, 7, 6])
  assert.deepEqual(build.seed.villainHand, [3, 2, 1])
})

test('the walked line converts to seeded history with correct seats', () => {
  // mão (seat 1) opens class 3 face up; pé raises to 3; mão accepts; pé
  // answers face down with class 2 (code 13 + 2).
  const build = buildStudyPlaySeed({
    spot: TEN_TEN,
    viraRank: 'J',
    line: [3, 27, 31, 15],
    drafts: { 'pé': { slots: [2, 5, 12], locked: true } },
  })
  assert.ok(build.ok)
  assert.deepEqual(build.seed.history, [
    { seat: 1, kind: 'play_face_up', class: 3 },
    { seat: 0, kind: 'raise', to: 3 },
    { seat: 1, kind: 'accept_raise' },
    { seat: 0, kind: 'play_face_down', class: 2 },
  ])
})

test('the eleven decision maps with its owner seat', () => {
  // 11x10, dealer 0, seat 0 at 11: the accept belongs to seat 0.
  const build = buildStudyPlaySeed({
    spot: { score: [11, 10], dealer: 0 },
    viraRank: '4',
    line: [33, 3],
    drafts: { 'mão': { slots: [4, 5, 6], locked: true } },
  })
  assert.ok(build.ok)
  assert.deepEqual(build.seed.history[0], { seat: 0, kind: 'accept_eleven' })
  assert.deepEqual(build.seed.history[1], { seat: 1, kind: 'play_face_up', class: 3 })
})

test('no draft still builds: the seat to act plays, cards left unspecified', () => {
  // The reported case: "10x10 v4 : 3 q" with nothing drafted. Under a 4 vira
  // the codes are 8 ('3') and 4 ('q'); mão led and won, so mão acts next and
  // becomes the hero, with both hands left for the engine to deal.
  const build = buildStudyPlaySeed({
    spot: TEN_TEN,
    viraRank: '4',
    line: [8, 4],
    drafts: {},
  })
  assert.ok(build.ok)
  assert.equal(build.seed.heroRole, 'mão')
  assert.equal(build.seed.humanPlayer, 1)
  assert.equal(build.seed.heroHand, null)
  assert.equal(build.seed.villainHand, null)
  assert.equal(build.seed.history.length, 2)

  // A partial draft is not a full hand either; it builds the same way.
  const partial = buildStudyPlaySeed({
    spot: TEN_TEN,
    viraRank: 'J',
    line: [],
    drafts: { 'mão': { slots: [12, null, 2], locked: false } },
  })
  assert.ok(partial.ok)
  assert.equal(partial.seed.heroHand, null)
  assert.equal(partial.seed.heroRole, 'mão') // empty line: mão acts first
})

test('hand-ending lines refuse', () => {
  // A folded raise ends the hand: nothing left to play live.
  const folded = buildStudyPlaySeed({
    spot: TEN_TEN,
    viraRank: 'J',
    line: [3, 27, 32],
    drafts: { 'mão': { slots: [12, 5, 2], locked: true } },
  })
  assert.ok(!folded.ok && folded.reason === 'hand-over')
})
