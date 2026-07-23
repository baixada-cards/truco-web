import type { DisplayScore } from './live-engine-events.ts'

export type ElevenTensionSoundCue = 'eleven_entry' | 'eleven_duel'

const ELEVEN_SCORE = 11

function elevenSideCount(score: DisplayScore) {
  return Number(score.hero === ELEVEN_SCORE) + Number(score.villain === ELEVEN_SCORE)
}

export function resolveElevenTensionSoundCue(
  previousScore: DisplayScore,
  nextScore: DisplayScore,
): ElevenTensionSoundCue | null {
  const previousElevenSides = elevenSideCount(previousScore)
  const nextElevenSides = elevenSideCount(nextScore)

  if (previousElevenSides === 1 && nextElevenSides === 2) {
    return 'eleven_duel'
  }

  if (
    previousElevenSides === 0 &&
    nextElevenSides === 1 &&
    Math.max(previousScore.hero, previousScore.villain) < ELEVEN_SCORE
  ) {
    return 'eleven_entry'
  }

  return null
}
