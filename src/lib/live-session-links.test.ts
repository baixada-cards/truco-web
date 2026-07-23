import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  abbreviateLiveMatchId,
  buildLiveSessionPath,
  buildLiveSessionUrl,
  describeLiveSessionStatus,
  extractLiveMatchId,
  formatLivePerspective,
} from './live-session-links.ts'

test('resume links preserve the match id without exposing player perspective', () => {
  const path = buildLiveSessionPath('match-live-42')
  const url = new URL(path, 'https://truco.example')

  assert.equal(url.pathname, '/')
  assert.equal(url.searchParams.get('match'), 'match-live-42')
  assert.equal(url.searchParams.has('player'), false)
  assert.equal(buildLiveSessionUrl('https://truco.example/play', 'match-live-42'), 'https://truco.example/?match=match-live-42')
})

test('session summaries stay human readable', () => {
  assert.equal(formatLivePerspective(0), 'You')
  assert.equal(formatLivePerspective(1), 'You')
  assert.equal(abbreviateLiveMatchId('abcdef123456', 6), 'abcdef…')
  assert.equal(
    describeLiveSessionStatus({
      humanPlayer: 0,
      publicView: {
        winner: null,
        hand_in_progress: false,
      },
    }),
    'Awaiting next hand',
  )
  assert.equal(
    describeLiveSessionStatus({
      humanPlayer: 1,
      publicView: {
        winner: 1,
        hand_in_progress: false,
      },
    }),
    'Match won',
  )
})

test('match link parsing accepts current links, handoff links, and raw ids', () => {
  assert.equal(extractLiveMatchId('match-live-42'), 'match-live-42')
  assert.equal(extractLiveMatchId('/?match=match-live-42'), 'match-live-42')
  assert.equal(
    extractLiveMatchId('https://farol.example/?match=match-live-42'),
    'match-live-42',
  )
  assert.equal(extractLiveMatchId('/m/match-live-42'), 'match-live-42')
  assert.equal(extractLiveMatchId('https://farol.example/m/match-live-42'), 'match-live-42')
  assert.equal(extractLiveMatchId('not a link'), null)
})
