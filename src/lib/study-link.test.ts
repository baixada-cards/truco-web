import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildStudySpotString,
  cardTokenFor,
  classOf,
  manilhaRankFor,
  studySpotAvailability,
  studySpotSolved,
} from './study-link.ts'
import type { SessionPayload } from './session-api.ts'

function card(rank: string, suit = 'CLUBS') {
  return { id: `${rank}-${suit}`, rank, suit }
}

/** minimal live session: seat 1 deals (pé), human sits at seat 0 (mão) */
function session(over: {
  dealer?: 0 | 1
  humanPlayer?: 0 | 1
  score?: { '0': number; '1': number }
  turnupRank?: string
  handValue?: number
  completed?: Array<Array<{ player: 0 | 1; visibility: 'up' | 'down'; card: ReturnType<typeof card> }>>
  current?: Array<{ player: 0 | 1; visibility: 'up' | 'down'; card: ReturnType<typeof card> }>
  remaining?: Array<ReturnType<typeof card>>
  pendingRaise?: unknown
}): SessionPayload {
  const dealer = over.dealer ?? 1
  return {
    matchId: 'm',
    humanPlayer: over.humanPlayer ?? 0,
    botPlayer: over.humanPlayer === 1 ? 0 : 1,
    botKind: null,
    botProfile: null,
    botModel: null,
    state: {
      next_dealer: dealer,
      score: over.score ?? { '0': 11, '1': 10 },
      winner: null,
      current_hand: {
        state: {
          dealer,
          next_player: 0,
          score: over.score ?? { '0': 11, '1': 10 },
          hand_value: over.handValue ?? 3,
          turnup: { rank: over.turnupRank ?? '4', suit: 'HEARTS' },
          completed_rounds: (over.completed ?? []).map((plays) => ({
            leader: plays[0]?.player ?? 0,
            winner: null,
            plays,
          })),
          current_round: { leader: 0, plays: over.current ?? [] },
          pending_raise: (over.pendingRaise ?? null) as never,
          pending_decision: null as never,
        },
        hand_winner: null,
        match_winner: null,
      },
    },
    publicView: {
      score: over.score ?? { '0': 11, '1': 10 },
      winner: null,
      next_dealer: dealer,
      current_player: 0,
      hand_in_progress: true,
      hand: null,
    },
    playerView: {
      player: over.humanPlayer ?? 0,
      score: over.score ?? { '0': 11, '1': 10 },
      winner: null,
      next_dealer: dealer,
      current_player: 0,
      hand: { hand: over.remaining ?? [] },
    } as never,
    legalActions: [],
  } as SessionPayload
}

test('card mapping: manilhas by suit, plain ranks by ladder, vira wrap', () => {
  assert.equal(manilhaRankFor('4'), '5')
  assert.equal(manilhaRankFor('3'), '4')
  assert.equal(cardTokenFor({ rank: '5', suit: 'CLUBS' }, '4'), '5c')
  assert.equal(cardTokenFor({ rank: 'K', suit: 'CLUBS' }, '4'), 'k')
  assert.equal(classOf({ rank: '5', suit: 'CLUBS' }, '4'), 12)
  assert.equal(classOf({ rank: '3', suit: 'HEARTS' }, '4'), 8)
  assert.equal(classOf({ rank: '4', suit: 'HEARTS' }, '4'), 0)
})

test('buildStudySpotString: full hand, plays in table order, role scores', () => {
  // human is mão (seat 0), dealer seat 1; mão led the 4, pé answered the 4
  const s = session({
    completed: [],
    current: [
      { player: 0, visibility: 'up', card: card('4', 'SPADES') },
      { player: 1, visibility: 'up', card: card('4', 'DIAMONDS') },
    ],
    remaining: [card('5', 'DIAMONDS'), card('6', 'HEARTS')],
  })
  const spot = buildStudySpotString(s)
  assert.ok(spot.ok)
  assert.equal(spot.text, '11x10 v4 mao![5d 6 4] : 4 4')
})

test('buildStudySpotString: face-down plays keep the * marker', () => {
  const s = session({
    current: [{ player: 0, visibility: 'down', card: card('6', 'HEARTS') }],
    remaining: [card('3', 'CLUBS'), card('2', 'CLUBS')],
  })
  const spot = buildStudySpotString(s)
  assert.ok(spot.ok)
  assert.equal(spot.text, '11x10 v4 mao![3 2 6] : 6*')
})

test('buildStudySpotString: resolved raises refuse honestly', () => {
  const s = session({ score: { '0': 10, '1': 10 }, handValue: 3 })
  const spot = buildStudySpotString(s)
  assert.ok(!spot.ok)
  assert.match((spot as { reason: string }).reason, /raised/)
})

test('buildStudySpotString: a pending first raise serializes as r', () => {
  const s = session({
    score: { '0': 10, '1': 10 },
    handValue: 1,
    current: [{ player: 0, visibility: 'up', card: card('4', 'SPADES') }],
    remaining: [card('3', 'CLUBS'), card('2', 'CLUBS')],
    pendingRaise: { raised_by: 1, to: 3, previous_value: 1 },
  })
  const spot = buildStudySpotString(s)
  assert.ok(spot.ok)
  assert.equal(spot.text, '10x10 v4 mao![3 2 4] : 4 r')
  // a pending re-raise over an already-resolved raise still refuses
  const reraise = session({
    score: { '0': 10, '1': 10 },
    handValue: 3,
    pendingRaise: { raised_by: 1, to: 6, previous_value: 3 },
  })
  assert.ok(!buildStudySpotString(reraise).ok)
})

test('studySpotSolved: role scores + vira against the manifest', () => {
  const manifest = {
    spots: [
      { score: [11, 10] as [number, number], tc: 0, dealer: 1 }, // mão 11 × pé 10
    ],
  }
  const solved = buildStudySpotString(
    session({ dealer: 1, score: { '0': 11, '1': 10 }, remaining: [] }),
  )
  assert.ok(solved.ok)
  assert.equal(studySpotSolved(manifest, solved), true)
  const other = buildStudySpotString(
    session({ dealer: 1, score: { '0': 9, '1': 10 }, handValue: 1, remaining: [] }),
  )
  assert.ok(other.ok)
  assert.equal(studySpotSolved(manifest, other), false)
})

test('studySpotAvailability distinguishes vira gaps from unsolved scores', () => {
  // Manifest ships only turn-up class 0 (vira = 4) at 11 × 10, mirroring the
  // local build where a Jack vira (class 5) is a data gap, not an unsolved score.
  const manifest = {
    spots: [{ score: [11, 10] as [number, number], tc: 0, dealer: 1 }],
  }
  const base = { dealer: 1 as const, score: { '0': 11, '1': 10 }, remaining: [] }

  const tc0 = buildStudySpotString(session({ ...base, turnupRank: '4' }))
  assert.ok(tc0.ok)
  assert.equal(studySpotAvailability(manifest, tc0), 'available')

  // Jack vira: same 11 × 10 score, but the class isn't shipped here.
  const jack = buildStudySpotString(session({ ...base, turnupRank: 'J' }))
  assert.ok(jack.ok)
  assert.equal(studySpotAvailability(manifest, jack), 'vira-unavailable')
  assert.equal(studySpotSolved(manifest, jack), false)

  // A score with no chart at all.
  const unsolved = buildStudySpotString(
    session({ dealer: 1, score: { '0': 9, '1': 10 }, handValue: 1, remaining: [] }),
  )
  assert.ok(unsolved.ok)
  assert.equal(studySpotAvailability(manifest, unsolved), 'score-unsolved')
})
