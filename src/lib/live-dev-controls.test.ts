import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { SessionPayload } from './session-api.ts'
import {
  areLiveDevControlsEnabled,
  buildLiveDevDebugSnapshot,
  canStartNextHandFromDevControls,
  deriveLiveDevScoreEditState,
  resolveLiveDevEditedScore,
} from './live-dev-controls.ts'

function createSession(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    matchId: 'match-dev-1',
    humanPlayer: 0,
    botPlayer: 1,
    botKind: 'heuristic',
    botProfile: 'balanced',
    botModel: null,
    notice: null,
    state: {
      next_dealer: 1,
      score: { '0': 4, '1': 3 },
      winner: null,
      current_hand: {
        state: {
          dealer: 0,
          next_player: 0,
          score: { '0': 4, '1': 3 },
          hand_value: 3,
          turnup: { rank: 'K', suit: 'CLUBS' },
          completed_rounds: [],
          current_round: {
            leader: 0,
            plays: [],
          },
          pending_raise: null,
          pending_decision: null,
        },
        hand_winner: null,
        match_winner: null,
      },
    },
    publicView: {
      score: { '0': 4, '1': 3 },
      winner: null,
      next_dealer: 1,
      current_player: 0,
      hand_in_progress: true,
      hand: {
        next_player: 0,
        hand_value: 3,
        hand_winner: null,
        match_winner: null,
        score: { '0': 4, '1': 3 },
        completed_rounds: [],
        current_round: {
          leader: 0,
          plays: [],
        },
        pending_raise: null,
        pending_decision: null,
      },
    },
    playerView: {
      player: 0,
      score: { '0': 4, '1': 3 },
      winner: null,
      next_dealer: 1,
      current_player: 0,
      hand_in_progress: true,
      hand: {
        public_state: {
          next_player: 0,
          hand_value: 3,
          hand_winner: null,
          match_winner: null,
          score: { '0': 4, '1': 3 },
          completed_rounds: [],
          current_round: {
            leader: 0,
            plays: [],
          },
          pending_raise: null,
          pending_decision: null,
        },
        hand: [
          { id: 'hero-1', rank: '4', suit: 'HEARTS' },
          { id: 'hero-2', rank: '7', suit: 'SPADES' },
          { id: 'hero-3', rank: 'A', suit: 'DIAMONDS' },
        ],
      },
    },
    legalActions: [{ type: 'raise', to: 6 }],
    ...overrides,
  }
}

test('live dev controls default on outside production', () => {
  assert.equal(areLiveDevControlsEnabled({ NODE_ENV: 'development' }), true)
})

test('live dev controls default off in production', () => {
  assert.equal(areLiveDevControlsEnabled({ NODE_ENV: 'production' }), false)
})

test('live dev controls env override can disable development but not production', () => {
  assert.equal(
    areLiveDevControlsEnabled({ NODE_ENV: 'production', NEXT_PUBLIC_SHOW_DEV_CONTROLS: 'true' }),
    false,
  )
  assert.equal(
    areLiveDevControlsEnabled({ NODE_ENV: 'development', NEXT_PUBLIC_SHOW_DEV_CONTROLS: 'false' }),
    false,
  )
})

test('next-hand control only enables between hands when the match is still live', () => {
  const betweenHandsSession = createSession({
    publicView: {
      score: { '0': 4, '1': 3 },
      winner: null,
      next_dealer: 1,
      current_player: null,
      hand_in_progress: false,
      hand: null,
    },
    state: {
      next_dealer: 1,
      score: { '0': 4, '1': 3 },
      winner: null,
      current_hand: null,
    },
    playerView: {
      player: 0,
      score: { '0': 4, '1': 3 },
      winner: null,
      next_dealer: 1,
      current_player: null,
      hand_in_progress: false,
      hand: null,
    },
    legalActions: [],
  })

  assert.equal(
    canStartNextHandFromDevControls({
      session: betweenHandsSession,
      isPending: false,
      isAutoStartingHand: false,
      isDealingCards: false,
      isHandEndSequenceRunning: false,
    }),
    true,
  )
  assert.equal(
    canStartNextHandFromDevControls({
      session: createSession(),
      isPending: false,
      isAutoStartingHand: false,
      isDealingCards: false,
      isHandEndSequenceRunning: false,
    }),
    false,
  )
})

test('debug snapshot summarizes the live match state for the panel', () => {
  const snapshot = buildLiveDevDebugSnapshot(
    createSession({
      notice: 'The next hand was already in progress, so the board was refreshed.',
      publicView: {
        score: { '0': 4, '1': 3 },
        winner: null,
        next_dealer: 1,
        current_player: 1,
        hand_in_progress: true,
        hand: {
          next_player: 1,
          hand_value: 3,
          hand_winner: null,
          match_winner: null,
          score: { '0': 4, '1': 3 },
          completed_rounds: [{ leader: 0, winner: 0 }],
          current_round: {
            leader: 1,
            plays: [],
          },
          pending_raise: {
            raised_by: 1,
            to: 6,
            previous_value: 3,
          },
          pending_decision: null,
        },
      },
      legalActions: [
        { type: 'accept_raise' },
        { type: 'fold' },
      ],
    }),
  )

  assert.deepEqual(snapshot, {
    matchId: 'match-dev-1',
    score: 'You 4 · Them 3',
    handState: 'Hand live · 1 completed rounds',
    turn: 'Their turn',
    dealer: 'You deal this hand',
    stake: '3 → 6',
    pending: 'They raised to 6',
    legalActions: 'accept_raise, fold',
    bot: 'heuristic / balanced',
    notice: 'The next hand was already in progress, so the board was refreshed.',
  })
})

test('debug snapshot uses you/them labels in alternate-perspective sessions', () => {
  const snapshot = buildLiveDevDebugSnapshot(
    createSession({
      humanPlayer: 1,
      botPlayer: 0,
      state: {
        next_dealer: 1,
        score: { '0': 4, '1': 5 },
        winner: null,
        current_hand: {
          state: {
            dealer: 1,
            next_player: 1,
            score: { '0': 4, '1': 5 },
            hand_value: 6,
            turnup: { rank: 'Q', suit: 'HEARTS' },
            completed_rounds: [],
            current_round: {
              leader: 1,
              plays: [],
            },
            pending_raise: {
              raised_by: 1,
              to: 9,
              previous_value: 6,
            },
            pending_decision: null,
          },
          hand_winner: null,
          match_winner: null,
        },
      },
      publicView: {
        score: { '0': 4, '1': 5 },
        winner: null,
        next_dealer: 1,
        current_player: 1,
        hand_in_progress: true,
        hand: {
          next_player: 1,
          hand_value: 6,
          hand_winner: null,
          match_winner: null,
          score: { '0': 4, '1': 5 },
          completed_rounds: [],
          current_round: {
            leader: 1,
            plays: [],
          },
          pending_raise: {
            raised_by: 1,
            to: 9,
            previous_value: 6,
          },
          pending_decision: null,
        },
      },
      playerView: {
        player: 1,
        score: { '0': 4, '1': 5 },
        winner: null,
        next_dealer: 1,
        current_player: 1,
        hand_in_progress: true,
        hand: {
          public_state: {
            next_player: 1,
            hand_value: 6,
            hand_winner: null,
            match_winner: null,
            score: { '0': 4, '1': 5 },
            completed_rounds: [],
            current_round: {
              leader: 1,
              plays: [],
            },
            pending_raise: {
              raised_by: 1,
              to: 9,
              previous_value: 6,
            },
            pending_decision: null,
          },
          hand: [
            { id: 'villain-1', rank: '4', suit: 'HEARTS' },
            { id: 'villain-2', rank: '7', suit: 'SPADES' },
            { id: 'villain-3', rank: 'A', suit: 'DIAMONDS' },
          ],
        },
      },
      legalActions: [
        { type: 'accept_raise' },
        { type: 'fold' },
      ],
    }),
  )

  assert.deepEqual(snapshot, {
    matchId: 'match-dev-1',
    score: 'You 5 · Them 4',
    handState: 'Hand live · 0 completed rounds',
    turn: 'Your turn',
    dealer: 'You deal this hand',
    stake: '6 → 9',
    pending: 'You raised to 9',
    legalActions: 'accept_raise, fold',
    bot: 'heuristic / balanced',
    notice: 'None',
  })
})

test('score editing only locks the side that already reached eleven', () => {
  const session = createSession({
    state: {
      next_dealer: 1,
      score: { '0': 11, '1': 0 },
      winner: null,
      current_hand: {
        state: {
          dealer: 0,
          next_player: 0,
          score: { '0': 11, '1': 0 },
          hand_value: 1,
          turnup: { rank: 'K', suit: 'CLUBS' },
          completed_rounds: [],
          current_round: {
            leader: 0,
            plays: [],
          },
          pending_raise: null,
          pending_decision: { type: 'mao_de_onze', player: 0 },
        },
        hand_winner: null,
        match_winner: null,
      },
    },
    publicView: {
      score: { '0': 11, '1': 0 },
      winner: null,
      next_dealer: 1,
      current_player: 0,
      hand_in_progress: true,
      hand: {
        next_player: 0,
        hand_value: 1,
        hand_winner: null,
        match_winner: null,
        score: { '0': 11, '1': 0 },
        completed_rounds: [],
        current_round: {
          leader: 0,
          plays: [],
        },
        pending_raise: null,
        pending_decision: { type: 'mao_de_onze', player: 0 },
      },
    },
    playerView: {
      player: 0,
      score: { '0': 11, '1': 0 },
      winner: null,
      next_dealer: 1,
      current_player: 0,
      hand_in_progress: true,
      hand: {
        public_state: {
          next_player: 0,
          hand_value: 1,
          hand_winner: null,
          match_winner: null,
          score: { '0': 11, '1': 0 },
          completed_rounds: [],
          current_round: {
            leader: 0,
            plays: [],
          },
          pending_raise: null,
          pending_decision: { type: 'mao_de_onze', player: 0 },
        },
        hand: [
          { id: 'hero-1', rank: '4', suit: 'HEARTS' },
          { id: 'hero-2', rank: '7', suit: 'SPADES' },
          { id: 'hero-3', rank: 'A', suit: 'DIAMONDS' },
        ],
      },
    },
  })

  assert.deepEqual(deriveLiveDevScoreEditState(session), {
    heroLocked: true,
    villainLocked: false,
    canApply: true,
  })
  assert.deepEqual(resolveLiveDevEditedScore(session, { hero: 7, villain: 10 }), {
    hero: 11,
    villain: 10,
  })
})

test('score editing stays seat-based in villain-perspective sessions', () => {
  const session = createSession({
    humanPlayer: 1,
    botPlayer: 0,
    state: {
      next_dealer: 1,
      score: { '0': 3, '1': 11 },
      winner: null,
      current_hand: {
        state: {
          dealer: 1,
          next_player: 1,
          score: { '0': 3, '1': 11 },
          hand_value: 1,
          turnup: { rank: 'Q', suit: 'HEARTS' },
          completed_rounds: [],
          current_round: {
            leader: 1,
            plays: [],
          },
          pending_raise: null,
          pending_decision: { type: 'mao_de_onze', player: 1 },
        },
        hand_winner: null,
        match_winner: null,
      },
    },
    publicView: {
      score: { '0': 3, '1': 11 },
      winner: null,
      next_dealer: 1,
      current_player: 1,
      hand_in_progress: true,
      hand: {
        next_player: 1,
        hand_value: 1,
        hand_winner: null,
        match_winner: null,
        score: { '0': 3, '1': 11 },
        completed_rounds: [],
        current_round: {
          leader: 1,
          plays: [],
        },
        pending_raise: null,
        pending_decision: { type: 'mao_de_onze', player: 1 },
      },
    },
    playerView: {
      player: 1,
      score: { '0': 3, '1': 11 },
      winner: null,
      next_dealer: 1,
      current_player: 1,
      hand_in_progress: true,
      hand: {
        public_state: {
          next_player: 1,
          hand_value: 1,
          hand_winner: null,
          match_winner: null,
          score: { '0': 3, '1': 11 },
          completed_rounds: [],
          current_round: {
            leader: 1,
            plays: [],
          },
          pending_raise: null,
          pending_decision: { type: 'mao_de_onze', player: 1 },
        },
        hand: [
          { id: 'villain-1', rank: '4', suit: 'HEARTS' },
          { id: 'villain-2', rank: '7', suit: 'SPADES' },
          { id: 'villain-3', rank: 'A', suit: 'DIAMONDS' },
        ],
      },
    },
  })

  assert.deepEqual(deriveLiveDevScoreEditState(session), {
    heroLocked: true,
    villainLocked: false,
    canApply: true,
  })
  assert.deepEqual(resolveLiveDevEditedScore(session, { hero: 2, villain: 11 }), {
    hero: 11,
    villain: 10,
  })
})
