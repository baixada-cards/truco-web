import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { SessionPayload } from './session-api.ts'
import {
  buildDefaultLiveMatchLedger,
  buildLiveGameStatus,
  formatLiveBotSummary,
  recordCompletedLiveMatch,
  recordLiveMatchOutcome,
} from './live-game-status.ts'

function createSession(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    matchId: 'match-status-1',
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

test('status facts use you/them labels in alternate-perspective sessions', () => {
  const items = buildLiveGameStatus(
    createSession({
      humanPlayer: 1,
      botPlayer: 0,
      publicView: {
        score: { '0': 5, '1': 7 },
        winner: null,
        next_dealer: 1,
        current_player: 1,
        hand_in_progress: true,
        hand: {
          next_player: 1,
          hand_value: 6,
          hand_winner: null,
          match_winner: null,
          score: { '0': 5, '1': 7 },
          completed_rounds: [],
          current_round: {
            leader: 1,
            plays: [],
          },
          pending_raise: null,
          pending_decision: null,
        },
      },
      state: {
        next_dealer: 1,
        score: { '0': 5, '1': 7 },
        winner: null,
        current_hand: {
          state: {
            dealer: 1,
            next_player: 1,
            score: { '0': 5, '1': 7 },
            hand_value: 6,
            turnup: { rank: 'Q', suit: 'HEARTS' },
            completed_rounds: [],
            current_round: {
              leader: 1,
              plays: [],
            },
            pending_raise: null,
            pending_decision: null,
          },
          hand_winner: null,
          match_winner: null,
        },
      },
      playerView: {
        player: 1,
        score: { '0': 5, '1': 7 },
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
            score: { '0': 5, '1': 7 },
            completed_rounds: [],
            current_round: {
              leader: 1,
              plays: [],
            },
            pending_raise: null,
            pending_decision: null,
          },
          hand: [
            { id: 'villain-1', rank: '4', suit: 'HEARTS' },
            { id: 'villain-2', rank: '7', suit: 'SPADES' },
            { id: 'villain-3', rank: 'A', suit: 'DIAMONDS' },
          ],
        },
      },
    }),
  )

  assert.deepEqual(items, [
    { label: 'Perspective', value: 'You' },
    { label: 'Current Turn', value: 'You' },
    { label: 'Hand Value', value: '6' },
    { label: 'Next Dealer', value: 'You' },
    { label: 'Match Id', value: 'match-st…' },
    { label: 'Bot', value: 'Heuristic / Balanced' },
  ])
})

test('completed villain-perspective matches still record villain wins in the trainer ledger', () => {
  const nextLedger = recordCompletedLiveMatch(
    buildDefaultLiveMatchLedger(),
    createSession({
      humanPlayer: 1,
      botPlayer: 0,
      publicView: {
        score: { '0': 9, '1': 12 },
        winner: 1,
        next_dealer: 0,
        current_player: null,
        hand_in_progress: false,
        hand: null,
      },
      playerView: {
        player: 1,
        score: { '0': 9, '1': 12 },
        winner: 1,
        next_dealer: 0,
        current_player: null,
        hand_in_progress: false,
        hand: null,
      },
      state: {
        next_dealer: 0,
        score: { '0': 9, '1': 12 },
        winner: 1,
        current_hand: null,
      },
    }),
  )

  assert.deepEqual(nextLedger, {
    heroWins: 0,
    villainWins: 1,
    ties: 0,
    recordedMatchIds: ['match-status-1'],
  })
})

test('bot summary stays readable for LLM bots', () => {
  assert.equal(
    formatLiveBotSummary(createSession({ botKind: 'openai', botProfile: null, botModel: 'gpt-4.1-mini' })),
    'OpenAI / gpt-4.1-mini',
  )
})

test('ledger does not double-record the same completed match', () => {
  const initialLedger = recordLiveMatchOutcome(
    buildDefaultLiveMatchLedger(),
    'repeat-match',
    'villain',
  )

  const nextLedger = recordLiveMatchOutcome(initialLedger, 'repeat-match', 'hero')

  assert.deepEqual(nextLedger, initialLedger)
})
