import {
  DEFAULT_SCORE_DISPLAY_STYLE,
  renderScoreDisplayHtml,
  type ScoreDisplayStyle,
} from './score-display.ts'

export type ScoreSide = 'hero' | 'villain'

export type ScorePulseState = {
  player: ScoreSide
  points: number
}

export type ScoreCelebrationPhase = 'idle' | 'charge' | 'travel' | 'impact' | 'settle'
export type ScoreCelebrationIntensity = 'none' | 'crisp' | 'exciting' | 'bombastic'

export type ScoreCelebrationState = {
  celebration: ScoreCelebrationPhase
  intensity: ScoreCelebrationIntensity
  points: number | null
  showBadge: boolean
}

type BuildScoreCelebrationStateOptions = {
  side: ScoreSide
  activeCelebration: { winner: ScoreSide; points: number } | null
  handEndPhase: 'charge' | 'travel' | 'land' | null
  scorePulse: ScorePulseState | null
}

type ScoreboardRowPresentationOptions = {
  side: ScoreSide
  label: string
  score: number
  opponentScore: number
  celebrationState: ScoreCelebrationState
  isPulseActive?: boolean
}

export type ScoreboardRowPresentation = {
  className: string
  testId: string
  side: ScoreSide
  label: string
  score: number
  celebration: ScoreCelebrationPhase
  intensity: ScoreCelebrationIntensity
  points: string
  badgeText: string | null
  badgeTestId: string | null
  badgeAriaLabel: string | null
}

function pluralizePoint(points: number) {
  return points === 1 ? 'point' : 'points'
}

export function getScoreCelebrationIntensity(points: number | null | undefined): ScoreCelebrationIntensity {
  if (points == null || points <= 0) return 'none'
  if (points >= 6) return 'bombastic'
  if (points >= 3) return 'exciting'
  return 'crisp'
}

export function buildScoreCelebrationState({
  side,
  activeCelebration,
  handEndPhase,
  scorePulse,
}: BuildScoreCelebrationStateOptions): ScoreCelebrationState {
  const activePoints = activeCelebration?.winner === side ? activeCelebration.points : null
  const pulsePoints = scorePulse?.player === side ? scorePulse.points : null
  const points = activePoints ?? pulsePoints

  if (points == null) {
    return {
      celebration: 'idle',
      intensity: 'none',
      points: null,
      showBadge: false,
    }
  }

  if (activePoints != null) {
    return {
      celebration: handEndPhase === 'travel'
        ? 'travel'
        : handEndPhase === 'land'
          ? 'impact'
          : 'charge',
      intensity: getScoreCelebrationIntensity(points),
      points,
      showBadge: false,
    }
  }

  return {
    celebration: 'settle',
    intensity: getScoreCelebrationIntensity(points),
    points,
    showBadge: false,
  }
}

export function buildScoreboardRowPresentation({
  side,
  label,
  score,
  opponentScore,
  celebrationState,
  isPulseActive = false,
}: ScoreboardRowPresentationOptions): ScoreboardRowPresentation {
  return {
    className: [
      'score-row',
      score > opponentScore ? 'is-leading' : '',
      score < opponentScore ? 'is-trailing' : '',
      isPulseActive ? 'is-scoring' : '',
    ].filter(Boolean).join(' '),
    testId: `score-row-${side}`,
    side,
    label,
    score,
    celebration: celebrationState.celebration,
    intensity: celebrationState.intensity,
    points: celebrationState.points == null ? '' : String(celebrationState.points),
    badgeText: celebrationState.showBadge && celebrationState.points != null
      ? `+${celebrationState.points}`
      : null,
    badgeTestId: celebrationState.showBadge && celebrationState.points != null
      ? `score-gain-badge-${side}`
      : null,
    badgeAriaLabel: celebrationState.showBadge && celebrationState.points != null
      ? `${label} gains ${celebrationState.points} ${pluralizePoint(celebrationState.points)}`
      : null,
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export function renderScoreboardRowHtml(
  presentation: ScoreboardRowPresentation,
  options?: { scoreDisplayStyle?: ScoreDisplayStyle },
) {
  const badgeMarkup = presentation.badgeText && presentation.badgeTestId && presentation.badgeAriaLabel
    ? `<span class="score-gain-badge" data-testid="${escapeHtml(presentation.badgeTestId)}" aria-label="${escapeHtml(presentation.badgeAriaLabel)}">${escapeHtml(presentation.badgeText)}</span>`
    : ''

  const scoreAriaLabel = `${presentation.label} score ${presentation.score}`
  const scoreDisplayStyle = options?.scoreDisplayStyle ?? DEFAULT_SCORE_DISPLAY_STYLE
  const scoreDisplayMarkup = renderScoreDisplayHtml(presentation.score, scoreDisplayStyle)
  return `<div class="${escapeHtml(presentation.className)}" data-testid="${escapeHtml(presentation.testId)}" data-score-celebration="${escapeHtml(presentation.celebration)}" data-score-intensity="${escapeHtml(presentation.intensity)}" data-score-points="${escapeHtml(presentation.points)}"><div class="score-player"><span class="score-player-name">${escapeHtml(presentation.label)}</span></div><div class="score-value">${badgeMarkup}<span class="score-number" aria-label="${escapeHtml(scoreAriaLabel)}" data-score-display-style="${escapeHtml(scoreDisplayStyle)}">${scoreDisplayMarkup}</span></div></div>`
}
