export type ScorePadSide = 'hero' | 'villain'
export type ScorePadElevenFocusMode = ScorePadSide | 'duel'
export type ScorePadElevenMark = 'ring' | 'underline'

export type ScorePadScore = {
  hero: number
  villain: number
}

export type ScorePadRecentPayoff = {
  previousScore: ScorePadScore
  nextScore: ScorePadScore
}

const ELEVEN_SCORE = 11

function isEleven(score: number) {
  return score === ELEVEN_SCORE
}

function oppositeSide(side: ScorePadSide): ScorePadSide {
  return side === 'hero' ? 'villain' : 'hero'
}

function sameScore(left: ScorePadScore, right: ScorePadScore) {
  return left.hero === right.hero && left.villain === right.villain
}

export function resolveScorePadElevenRingSide(
  score: ScorePadScore,
  recentPayoff: ScorePadRecentPayoff | null = null,
): ScorePadSide | null {
  const heroAtEleven = isEleven(score.hero)
  const villainAtEleven = isEleven(score.villain)

  if (heroAtEleven && !villainAtEleven) return 'hero'
  if (villainAtEleven && !heroAtEleven) return 'villain'
  if (!heroAtEleven && !villainAtEleven) return null

  if (recentPayoff && sameScore(recentPayoff.nextScore, score)) {
    const heroWasAlreadyAtEleven = isEleven(recentPayoff.previousScore.hero)
    const villainWasAlreadyAtEleven = isEleven(recentPayoff.previousScore.villain)

    if (heroWasAlreadyAtEleven && !villainWasAlreadyAtEleven) return 'hero'
    if (villainWasAlreadyAtEleven && !heroWasAlreadyAtEleven) return 'villain'
  }

  return 'hero'
}

export function resolveScorePadElevenMarks(
  score: ScorePadScore,
  ringSide: ScorePadSide | null = resolveScorePadElevenRingSide(score),
): Record<ScorePadSide, ScorePadElevenMark | null> {
  const marks: Record<ScorePadSide, ScorePadElevenMark | null> = {
    hero: null,
    villain: null,
  }

  if (!ringSide || !isEleven(score[ringSide])) return marks

  marks[ringSide] = 'ring'

  const underlineSide = oppositeSide(ringSide)
  if (isEleven(score[underlineSide])) {
    marks[underlineSide] = 'underline'
  }

  return marks
}
