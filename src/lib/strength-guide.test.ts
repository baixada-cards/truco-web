import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildDefaultStrengthGuideDiscovery,
  isStrengthGuideAvailable,
  isStrengthGuidePeekStowed,
  manilhaRankOf,
  markStrengthGuideHandSeen,
  markStrengthGuideOpened,
  rankingForTurnup,
  rankLabel,
  shouldPulseStrengthGuide,
} from './strength-guide.ts'

test('rankingForTurnup promotes the next rank and orders manilhas by suit strength', () => {
  const ranking = rankingForTurnup({ rank: 'A', suit: 'SPADES' }, 'french')

  assert.ok(ranking)
  assert.equal(ranking.manilhaRank, '2')
  assert.deepEqual(
    ranking.manilhas.map((manilha) => manilha.id),
    ['DIAMONDS', 'SPADES', 'HEARTS', 'CLUBS'],
  )
  assert.deepEqual(
    ranking.others.map((card) => card.rank),
    ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '3'],
  )
})

test('manilhaRankOf wraps around the circular Truco rank order', () => {
  assert.equal(manilhaRankOf('3'), '4')
  assert.equal(manilhaRankOf('K'), 'A')
  assert.equal(manilhaRankOf('bad-rank'), null)
})

test('rankLabel matches the selected deck surface', () => {
  assert.equal(rankLabel('A', 'french'), 'A')
  assert.equal(rankLabel('A', 'spanish'), '1')
  assert.equal(rankLabel('J', 'spanish'), '11')
})

test('strength guide access stows during hand-end transitions', () => {
  const turnup = { rank: 'A', suit: 'SPADES' }

  const idleState = {
    turnup,
    turnupFaceDown: false,
    handEndSequenceRunning: false,
    betweenHandsPhase: 'idle',
  } as const
  const payoffState = {
    turnup,
    turnupFaceDown: false,
    handEndSequenceRunning: true,
  } as const
  const gatheringState = {
    turnup,
    turnupFaceDown: false,
    betweenHandsPhase: 'gathering',
  } as const
  const deckVisibleState = {
    turnup,
    turnupFaceDown: false,
    betweenHandsPhase: 'deck-visible',
  } as const

  assert.equal(isStrengthGuideAvailable(idleState), true)
  assert.equal(isStrengthGuidePeekStowed(idleState), false)
  assert.equal(isStrengthGuideAvailable({ turnup: null, turnupFaceDown: false }), false)
  assert.equal(isStrengthGuidePeekStowed({ turnup: null, turnupFaceDown: false }), false)
  assert.equal(isStrengthGuideAvailable({ turnup, turnupFaceDown: true }), false)
  assert.equal(isStrengthGuidePeekStowed({ turnup, turnupFaceDown: true }), false)
  assert.equal(isStrengthGuideAvailable(payoffState), false)
  assert.equal(isStrengthGuidePeekStowed(payoffState), true)
  assert.equal(isStrengthGuideAvailable(gatheringState), false)
  assert.equal(isStrengthGuidePeekStowed(gatheringState), true)
  assert.equal(isStrengthGuideAvailable(deckVisibleState), false)
  assert.equal(isStrengthGuidePeekStowed(deckVisibleState), true)
})

test('strength guide discovery pulses for the first three hands of the first match until opened', () => {
  let discovery = buildDefaultStrengthGuideDiscovery()

  discovery = markStrengthGuideHandSeen(discovery, 'match-1', 'hand-1')
  discovery = markStrengthGuideHandSeen(discovery, 'match-1', 'hand-2')
  discovery = markStrengthGuideHandSeen(discovery, 'match-1', 'hand-3')

  assert.equal(shouldPulseStrengthGuide(discovery, 'match-1'), true)

  discovery = markStrengthGuideHandSeen(discovery, 'match-1', 'hand-4')
  assert.equal(shouldPulseStrengthGuide(discovery, 'match-1'), false)
  assert.equal(shouldPulseStrengthGuide(discovery, 'match-2'), false)

  discovery = markStrengthGuideOpened(discovery)
  assert.equal(shouldPulseStrengthGuide(discovery, 'match-1'), false)
})
