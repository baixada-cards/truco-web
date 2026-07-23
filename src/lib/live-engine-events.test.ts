import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createInitialLiveEngineState,
  liveEngineReducer,
  type ActionResult,
  type DisplayScore,
  type HandEndPayoff,
  type PendingAction,
  type SessionFailureState,
} from './live-engine-events.ts'
import type { SessionPayload } from './session-api.ts'

function session(matchId: string, score: { hero: number; villain: number } = { hero: 0, villain: 0 }) {
  return {
    matchId,
    humanPlayer: 0,
    botPlayer: 1,
    publicView: {
      score: { '0': score.hero, '1': score.villain },
    },
  } as SessionPayload
}

const failure: SessionFailureState = {
  code: 'ENGINE_TIMEOUT',
  title: 'Timed out',
  description: 'The engine was too slow.',
  detail: null,
  status: null,
  retryAction: 'refresh-match',
  retryMatchId: 'match-1',
}

const displayScore: DisplayScore = { hero: 2, villain: 1 }

test('session-loaded stores the snapshot, clears pending state, and updates score', () => {
  const pending = liveEngineReducer(
    createInitialLiveEngineState('boot-match'),
    { type: 'action-pending', action: { kind: 'load-match', matchId: 'match-1' } },
  )

  const next = liveEngineReducer(pending, {
    type: 'session-loaded',
    snapshot: session('match-1', displayScore),
    source: 'load',
    displayScore,
    lastHandReview: null,
  })

  assert.equal(next.session?.matchId, 'match-1')
  assert.deepEqual(next.displayScore, displayScore)
  assert.equal(next.lastHandReview, null)
  assert.equal(next.pendingAction, null)
  assert.equal(next.isPending, false)
  assert.equal(next.isAutoStartingHand, false)
  assert.equal(next.sessionFailure, null)
})

test('session-failed records the failure and clears pending state', () => {
  const pending = liveEngineReducer(
    createInitialLiveEngineState(null),
    { type: 'action-pending', action: { kind: 'refresh-match', matchId: 'match-1' } },
  )

  const next = liveEngineReducer(pending, { type: 'session-failed', failure })

  assert.deepEqual(next.sessionFailure, failure)
  assert.equal(next.pendingAction, null)
  assert.equal(next.isPending, false)
})

test('action-applied stores the action result and payoff display score together', () => {
  const action: PendingAction = {
    kind: 'player-action',
    matchId: 'match-1',
    action: { type: 'raise', to: 3 },
  }
  const pending = liveEngineReducer(
    createInitialLiveEngineState(null),
    { type: 'action-pending', action },
  )
  const payoff: HandEndPayoff = {
    winner: 'hero',
    points: 3,
    completedRoundCount: 3,
    previousScore: { hero: 2, villain: 1 },
    nextScore: { hero: 5, villain: 1 },
  }
  const result: ActionResult = {
    snapshot: session('match-1', payoff.nextScore),
    source: 'action',
    pendingAction: pending.pendingAction,
  }

  const next = liveEngineReducer(pending, {
    type: 'action-applied',
    result,
    payoff,
    displayScore: payoff.previousScore,
  })

  assert.equal(next.session?.matchId, 'match-1')
  assert.deepEqual(next.displayScore, payoff.previousScore)
  assert.deepEqual(next.lastAppliedAction, result)
  assert.equal(next.pendingAction, null)
  assert.equal(next.isPending, false)
})

test('action-pending distinguishes continuing a match from ordinary pending actions', () => {
  const pending = liveEngineReducer(createInitialLiveEngineState(null), {
    type: 'action-pending',
    action: { kind: 'continue-match', matchId: 'match-1' },
  })

  assert.equal(pending.pendingAction?.kind, 'continue-match')
  assert.equal(pending.isPending, false)
  assert.equal(pending.isAutoStartingHand, true)
  assert.equal(pending.sessionFailure, null)
})

test('reconnect-started marks the match as pending recovery', () => {
  const next = liveEngineReducer(createInitialLiveEngineState(null), {
    type: 'reconnect-started',
    matchId: 'match-1',
  })

  assert.deepEqual(next.pendingAction, { kind: 'reconnect-match', matchId: 'match-1' })
  assert.equal(next.isPending, true)
  assert.equal(next.sessionFailure, null)
})

test('reset clears engine state while preserving the boot match by default', () => {
  const loaded = liveEngineReducer(createInitialLiveEngineState('boot-match'), {
    type: 'session-loaded',
    snapshot: session('match-1', displayScore),
    source: 'load',
    displayScore,
  })
  const failed = liveEngineReducer(loaded, { type: 'session-failed', failure })

  const next = liveEngineReducer(failed, { type: 'reset' })

  assert.equal(next.session, null)
  assert.equal(next.sessionFailure, null)
  assert.equal(next.bootMatchId, 'boot-match')
  assert.deepEqual(next.displayScore, { hero: 0, villain: 0 })
})

test('between-hand gather advances to a dealer-side deck and clears explicitly', () => {
  const gathering = liveEngineReducer(createInitialLiveEngineState(null), {
    type: 'between-hands-gather-started',
    dealerSide: 'villain',
  })

  assert.deepEqual(gathering.betweenHandsGather, {
    phase: 'gathering',
    dealerSide: 'villain',
  })

  const deckVisible = liveEngineReducer(gathering, { type: 'between-hands-gather-completed' })
  assert.deepEqual(deckVisible.betweenHandsGather, {
    phase: 'deck-visible',
    dealerSide: 'villain',
  })

  const cleared = liveEngineReducer(deckVisible, { type: 'between-hands-gather-cleared' })
  assert.deepEqual(cleared.betweenHandsGather, {
    phase: 'idle',
    dealerSide: 'hero',
  })
})

test('next-hand snapshots preserve the between-hand deck until deal animation clears it', () => {
  const deckVisible = liveEngineReducer(createInitialLiveEngineState(null), {
    type: 'between-hands-gather-started',
    dealerSide: 'hero',
  })
  const settledDeck = liveEngineReducer(deckVisible, { type: 'between-hands-gather-completed' })

  const nextHand = liveEngineReducer(settledDeck, {
    type: 'session-loaded',
    snapshot: session('match-1', displayScore),
    source: 'next-hand',
    displayScore,
  })

  assert.deepEqual(nextHand.betweenHandsGather, {
    phase: 'deck-visible',
    dealerSide: 'hero',
  })

  const loaded = liveEngineReducer(nextHand, {
    type: 'session-loaded',
    snapshot: session('match-2', displayScore),
    source: 'load',
    displayScore,
  })

  assert.deepEqual(loaded.betweenHandsGather, {
    phase: 'idle',
    dealerSide: 'hero',
  })
})
