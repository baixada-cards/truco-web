import type { DisplayScore, HandEndPayoff } from './live-engine-events.ts'
import type { ScoreSide } from './live-score-celebration.ts'

export const SCORE_TALLY_STROKE_GAP_MS = 150
export const SCORE_TALLY_STROKE_TAIL_MS = 270

const MAX_SCORE_SOUND_SETTLE_MS = 2200

function safePositivePointCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0
}

export function resolveScoreSoundPoints({
  scorePoints,
}: {
  scorePoints: number
  handValue?: number
  previousScore: DisplayScore
  nextScore: DisplayScore
  winner: ScoreSide | null
}) {
  return safePositivePointCount(scorePoints)
}

export function scoreSoundPointsForPayoff(payoff: HandEndPayoff) {
  return resolveScoreSoundPoints({
    scorePoints: payoff.points,
    handValue: payoff.scoreSoundPoints,
    previousScore: payoff.previousScore,
    nextScore: payoff.nextScore,
    winner: payoff.winner,
  })
}

export function scoreSoundSettleMsForPayoff(payoff: HandEndPayoff) {
  const points = Math.max(1, scoreSoundPointsForPayoff(payoff))
  return Math.min(
    MAX_SCORE_SOUND_SETTLE_MS,
    (points - 1) * SCORE_TALLY_STROKE_GAP_MS + SCORE_TALLY_STROKE_TAIL_MS,
  )
}
