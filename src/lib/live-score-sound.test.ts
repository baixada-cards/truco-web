import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  resolveScoreSoundPoints,
  scoreSoundSettleMsForPayoff,
  scoreSoundPointsForPayoff,
} from './live-score-sound.ts'

test('score sound follows the visible score delta for a raised hand ending the match', () => {
  assert.equal(resolveScoreSoundPoints({
    scorePoints: 2,
    handValue: 3,
    previousScore: { hero: 10, villain: 6 },
    nextScore: { hero: 12, villain: 6 },
    winner: 'hero',
  }), 2)
})

test('score sound does not add extra strokes when the eleven ring appears', () => {
  assert.equal(resolveScoreSoundPoints({
    scorePoints: 1,
    previousScore: { hero: 10, villain: 8 },
    nextScore: { hero: 11, villain: 8 },
    winner: 'hero',
  }), 1)
})

test('payoff score sound preserves ordinary one-point scores', () => {
  assert.equal(scoreSoundPointsForPayoff({
    winner: 'villain',
    points: 1,
    completedRoundCount: 2,
    previousScore: { hero: 4, villain: 3 },
    nextScore: { hero: 4, villain: 4 },
  }), 1)
})

test('payoff score settle timing waits for a three-stroke score sound', () => {
  assert.equal(scoreSoundSettleMsForPayoff({
    winner: 'hero',
    points: 3,
    scoreSoundPoints: 3,
    completedRoundCount: 2,
    previousScore: { hero: 6, villain: 6 },
    nextScore: { hero: 9, villain: 6 },
  }), 570)
})
