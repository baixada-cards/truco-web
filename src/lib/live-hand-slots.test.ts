import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  deriveStableHandCardSlots,
  deriveVisibleOpponentHandSlots,
  handSlotIndexFromCardId,
  reorderStableHandCardSlots,
  type StableHandSlotState,
} from './live-hand-slots.ts'
import type { SessionCard } from './session-api.ts'

const cards: SessionCard[] = [
  { id: 'p0c0', rank: '7', suit: 'DIAMONDS' },
  { id: 'p0c1', rank: '6', suit: 'CLUBS' },
  { id: 'p0c2', rank: '4', suit: 'HEARTS' },
]

test('handSlotIndexFromCardId reads generated player slot ids', () => {
  assert.equal(handSlotIndexFromCardId('p0c2', 0), 2)
  assert.equal(handSlotIndexFromCardId('p1c1', 1), 1)
  assert.equal(handSlotIndexFromCardId('p1c1', 0), null)
  assert.equal(handSlotIndexFromCardId('custom-card', 0), null)
})

test('deriveStableHandCardSlots leaves an empty slot where a generated card was played', () => {
  const initial = deriveStableHandCardSlots({
    cards,
    player: 0,
    previous: null,
    handKey: 'match:hand-1',
  })

  const afterLeftCardPlayed = deriveStableHandCardSlots({
    cards: cards.slice(1),
    player: 0,
    previous: initial.state,
    handKey: 'match:hand-1',
  })

  assert.deepEqual(
    afterLeftCardPlayed.cardsBySlot.map((card) => card?.id ?? null),
    [null, 'p0c1', 'p0c2'],
  )
})

test('deriveStableHandCardSlots preserves remembered slots for custom card ids', () => {
  const customCards: SessionCard[] = [
    { id: 'left', rank: '7', suit: 'DIAMONDS' },
    { id: 'middle', rank: '6', suit: 'CLUBS' },
    { id: 'right', rank: '4', suit: 'HEARTS' },
  ]
  const initial = deriveStableHandCardSlots({
    cards: customCards,
    player: 0,
    previous: null,
    handKey: 'match:hand-1',
  })

  const afterMiddleCardPlayed = deriveStableHandCardSlots({
    cards: [customCards[0], customCards[2]],
    player: 0,
    previous: initial.state,
    handKey: 'match:hand-1',
  })

  assert.deepEqual(
    afterMiddleCardPlayed.cardsBySlot.map((card) => card?.id ?? null),
    ['left', null, 'right'],
  )
})

test('deriveStableHandCardSlots resets remembered custom slots for a new hand', () => {
  const previous: StableHandSlotState = {
    handKey: 'match:hand-1',
    cardIdsBySlot: ['left', null, 'right'],
  }

  const next = deriveStableHandCardSlots({
    cards: [
      { id: 'new-left', rank: 'A', suit: 'SPADES' },
      { id: 'new-middle', rank: 'K', suit: 'CLUBS' },
    ],
    player: 0,
    previous,
    handKey: 'match:hand-2',
  })

  assert.deepEqual(
    next.cardsBySlot.map((card) => card?.id ?? null),
    ['new-left', 'new-middle', null],
  )
})

test('deriveStableHandCardSlots preserves a player reorder of generated card ids', () => {
  const previous: StableHandSlotState = {
    handKey: 'match:hand-1',
    cardIdsBySlot: ['p0c2', 'p0c0', 'p0c1'],
  }

  const next = deriveStableHandCardSlots({
    cards,
    player: 0,
    previous,
    handKey: 'match:hand-1',
  })

  assert.deepEqual(
    next.cardsBySlot.map((card) => card?.id ?? null),
    ['p0c2', 'p0c0', 'p0c1'],
  )
})

test('reorderStableHandCardSlots inserts onto an occupied slot and shifts neighbors', () => {
  const previous: StableHandSlotState = {
    handKey: 'match:hand-1',
    cardIdsBySlot: ['p0c0', 'p0c1', 'p0c2'],
  }

  assert.deepEqual(
    reorderStableHandCardSlots({
      state: previous,
      handKey: 'match:hand-1',
      cardId: 'p0c0',
      toSlotIndex: 2,
    })?.cardIdsBySlot,
    ['p0c1', 'p0c2', 'p0c0'],
  )

  assert.deepEqual(
    reorderStableHandCardSlots({
      state: previous,
      handKey: 'match:hand-1',
      cardId: 'p0c2',
      toSlotIndex: 0,
    })?.cardIdsBySlot,
    ['p0c2', 'p0c0', 'p0c1'],
  )
})

test('reorderStableHandCardSlots can place a card into an empty hand slot', () => {
  const previous: StableHandSlotState = {
    handKey: 'match:hand-1',
    cardIdsBySlot: ['p0c0', null, 'p0c2'],
  }

  assert.deepEqual(
    reorderStableHandCardSlots({
      state: previous,
      handKey: 'match:hand-1',
      cardId: 'p0c2',
      toSlotIndex: 1,
    })?.cardIdsBySlot,
    ['p0c0', 'p0c2', null],
  )
})

test('deriveVisibleOpponentHandSlots leaves generated opponent gaps visible by slot', () => {
  assert.deepEqual(
    deriveVisibleOpponentHandSlots({
      player: 1,
      playedCardIds: ['p1c0'],
      pendingVisibleCardIds: [],
      fallbackVisibleCount: 2,
    }),
    [false, true, true],
  )

  assert.deepEqual(
    deriveVisibleOpponentHandSlots({
      player: 1,
      playedCardIds: ['p1c0', 'p1c2'],
      pendingVisibleCardIds: ['p1c2'],
      fallbackVisibleCount: 2,
    }),
    [false, true, true],
  )
})
