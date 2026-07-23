import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { SessionPayload } from './session-api.ts'
import {
  buildRecentLiveMatch,
  formatRecentLiveMatchDisplay,
  formatRecentOpponent,
  sanitizeRecentLiveMatch,
} from './live-recent-match.ts'

function createSession(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    matchId: 'recent-match-1',
    humanPlayer: 0,
    botPlayer: 1,
    botKind: 'heuristic',
    botProfile: 'balanced',
    botModel: null,
    notice: null,
    state: {
      next_dealer: 1,
      score: { '0': 12, '1': 9 },
      winner: null,
      current_hand: null,
    },
    publicView: {
      score: { '0': 12, '1': 9 },
      winner: null,
      next_dealer: 1,
      current_player: null,
      hand_in_progress: false,
      hand: null,
    },
    playerView: {
      player: 0,
      score: { '0': 12, '1': 9 },
      winner: null,
      next_dealer: 1,
      current_player: null,
      hand_in_progress: false,
      hand: null,
    },
    legalActions: [],
    ...overrides,
  }
}

test('recent match summaries preserve opponent and player-relative score', () => {
  const recent = buildRecentLiveMatch(createSession(), 1_000_000)

  assert.deepEqual(recent, {
    matchId: 'recent-match-1',
    opponent: 'Heuristic · balanced',
    youScore: 12,
    themScore: 9,
    updatedAt: 1_000_000,
    botKind: 'heuristic',
    botProfile: 'balanced',
    botModel: null,
  })
})

test('recent match summaries flip score from villain perspective', () => {
  const recent = buildRecentLiveMatch(
    createSession({
      humanPlayer: 1,
      botPlayer: 0,
      publicView: {
        score: { '0': 5, '1': 8 },
        winner: null,
        next_dealer: 0,
        current_player: 1,
        hand_in_progress: true,
        hand: null,
      },
    }),
    1_000_000,
  )

  assert.equal(recent?.youScore, 8)
  assert.equal(recent?.themScore, 5)
})

test('completed matches are not offered as recent matches to rejoin', () => {
  const recent = buildRecentLiveMatch(
    createSession({
      publicView: {
        score: { '0': 12, '1': 9 },
        winner: 0,
        next_dealer: 1,
        current_player: null,
        hand_in_progress: false,
        hand: null,
      },
    }),
  )

  assert.equal(recent, null)
})

test('recent match display formats elapsed time', () => {
  const recent = buildRecentLiveMatch(createSession(), 1_000_000)

  assert.deepEqual(
    recent && formatRecentLiveMatchDisplay(recent, 1_000_000 + 3 * 60_000),
    {
      opponent: 'Heuristic · balanced',
      youScore: 12,
      themScore: 9,
      when: '3 min ago',
      matchId: 'recent-match-1',
    },
  )
})

test('opponent labels prefer model names for model-backed bots', () => {
  assert.equal(
    formatRecentOpponent({
      botKind: 'openai',
      botProfile: null,
      botModel: 'gpt-test',
    }),
    'OpenAI · gpt-test',
  )
})

test('malformed recent match storage is ignored', () => {
  assert.equal(sanitizeRecentLiveMatch({ matchId: 'x' }), null)
  assert.equal(sanitizeRecentLiveMatch({
    matchId: 'x',
    opponent: 'Unknown',
    youScore: 1,
    themScore: 2,
    updatedAt: 1,
    botKind: 'bogus',
  }), null)
  assert.equal(sanitizeRecentLiveMatch(null), null)
})
