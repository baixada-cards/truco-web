import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildScoreCelebrationState,
  buildScoreboardRowPresentation,
  renderScoreboardRowHtml,
} from './live-score-celebration.ts'
import {
  DEFAULT_SCORE_DISPLAY_STYLE,
  SCORE_DISPLAY_STYLE_OPTIONS,
  type ScoreDisplayStyle,
} from './score-display.ts'
import { buildScoreMatchStickLines } from './score-match-sticks.ts'

function renderHeroScoreRow(
  markupState: Parameters<typeof buildScoreCelebrationState>[0],
  scoreDisplayStyle?: ScoreDisplayStyle,
) {
  const celebrationState = buildScoreCelebrationState(markupState)
  return renderScoreboardRowHtml(buildScoreboardRowPresentation({
    side: 'hero',
    label: 'Hero',
    score: 9,
    opponentScore: 4,
    celebrationState,
    isPulseActive: celebrationState.celebration === 'settle',
  }), { scoreDisplayStyle })
}

test('scoreboard row renders crisp +1 celebration hooks', () => {
  const markup = renderHeroScoreRow({
    side: 'hero',
    activeCelebration: { winner: 'hero', points: 1 },
    handEndPhase: 'charge',
    scorePulse: null,
  })

  assert.match(markup, /data-testid="score-row-hero"/)
  assert.match(markup, /data-score-celebration="charge"/)
  assert.match(markup, /data-score-intensity="crisp"/)
  assert.match(markup, /data-score-points="1"/)
  assert.doesNotMatch(markup, /score-gain-badge/)
})

test('scoreboard row renders exciting +3 celebration hooks during transfer', () => {
  const markup = renderHeroScoreRow({
    side: 'hero',
    activeCelebration: { winner: 'hero', points: 3 },
    handEndPhase: 'travel',
    scorePulse: null,
  })

  assert.match(markup, /data-score-celebration="travel"/)
  assert.match(markup, /data-score-intensity="exciting"/)
  assert.match(markup, /data-score-points="3"/)
  assert.doesNotMatch(markup, /score-gain-badge/)
})

test('scoreboard row renders bombastic +6 settle hooks and hides badges on the losing row', () => {
  const heroMarkup = renderHeroScoreRow({
    side: 'hero',
    activeCelebration: null,
    handEndPhase: null,
    scorePulse: { player: 'hero', points: 6 },
  })

  const villainCelebrationState = buildScoreCelebrationState({
    side: 'villain',
    activeCelebration: { winner: 'hero', points: 6 },
    handEndPhase: 'travel',
    scorePulse: null,
  })
  const villainMarkup = renderScoreboardRowHtml(buildScoreboardRowPresentation({
    side: 'villain',
    label: 'Villain',
    score: 4,
    opponentScore: 9,
    celebrationState: villainCelebrationState,
  }))

  assert.match(heroMarkup, /data-score-celebration="settle"/)
  assert.match(heroMarkup, /data-score-intensity="bombastic"/)
  assert.match(heroMarkup, /data-score-points="6"/)
  assert.doesNotMatch(heroMarkup, /score-gain-badge/)
  assert.match(villainMarkup, /data-score-celebration="idle"/)
  assert.match(villainMarkup, /data-score-intensity="none"/)
  assert.match(villainMarkup, /data-score-points=""/)
  assert.doesNotMatch(villainMarkup, /score-gain-badge/)
})

test('scoreboard row renders a two-digit digital score display', () => {
  const markup = renderHeroScoreRow({
    side: 'hero',
    activeCelebration: null,
    handEndPhase: null,
    scorePulse: null,
  }, 'digital')

  assert.match(markup, /data-score-display-style="digital"/)
  assert.match(markup, /score-digital-display/)
  assert.match(markup, /data-score-digits="09"/)
  assert.doesNotMatch(markup, /score-matchsticks/)
})

test('scoreboard row defaults to the brass score display', () => {
  const markup = renderHeroScoreRow({
    side: 'hero',
    activeCelebration: null,
    handEndPhase: null,
    scorePulse: null,
  })

  assert.equal(DEFAULT_SCORE_DISPLAY_STYLE, 'brass')
  assert.match(markup, /data-score-display-style="brass"/)
  assert.match(markup, /score-brass-inlay/)
  assert.match(markup, /data-score-value="9"/)
  assert.doesNotMatch(markup, /score-digital-display/)
})

test('scoreboard row can render every score display style', () => {
  const expectedClassByStyle: Record<ScoreDisplayStyle, RegExp> = {
    brass: /score-brass-inlay/,
    chips: /score-chip-stack/,
    track: /score-peg-track/,
    medallion: /score-medallion/,
    digital: /score-digital-display/,
    bars: /score-matchsticks/,
  }

  for (const option of SCORE_DISPLAY_STYLE_OPTIONS) {
    const markup = renderHeroScoreRow({
      side: 'hero',
      activeCelebration: null,
      handEndPhase: null,
      scorePulse: null,
    }, option.id)

    assert.match(markup, new RegExp(`data-score-display-style="${option.id}"`))
    assert.match(markup, expectedClassByStyle[option.id])
  }
})

test('score bars fill the bottom edge before the right edge', () => {
  const [left, top, bottom, right, diagonal] = buildScoreMatchStickLines(3)

  assert.equal(left?.filled, true)
  assert.equal(top?.filled, true)
  assert.equal(bottom?.filled, true)
  assert.equal(right?.filled, false)
  assert.equal(diagonal?.filled, false)
  assert.equal(bottom?.y1, bottom?.y2)
  assert.ok((bottom?.y1 ?? 0) > (top?.y1 ?? 0))
  assert.equal(right?.x1, right?.x2)
})
