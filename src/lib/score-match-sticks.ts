import { createElement } from 'react'
import type { ReactElement } from 'react'

export const SCORE_DISPLAY_CAP = 12

const SQUARE = 40
const PAD = 4
const SQUARE_GAP = 8
const EXTRA_GAP = 12
const EXTRA_BAR_SPACING = 9

const SQ1_X = PAD
const SQ2_X = SQ1_X + SQUARE + SQUARE_GAP
const EX1_X = SQ2_X + SQUARE + EXTRA_GAP
const EX2_X = EX1_X + EXTRA_BAR_SPACING
const VIEW_WIDTH = EX2_X + PAD
const VIEW_HEIGHT = SQUARE + PAD * 2
const TOP_Y = PAD
const BOT_Y = PAD + SQUARE
const STROKE_WIDTH = 5

type Line = { x1: number; y1: number; x2: number; y2: number; filled: boolean }

function squareSegments(originX: number, fillCount: number): Line[] {
  const x0 = originX
  const x1 = originX + SQUARE
  const all: Array<Omit<Line, 'filled'>> = [
    { x1: x0, y1: TOP_Y, x2: x0, y2: BOT_Y },
    { x1: x0, y1: TOP_Y, x2: x1, y2: TOP_Y },
    { x1: x0, y1: BOT_Y, x2: x1, y2: BOT_Y },
    { x1: x1, y1: TOP_Y, x2: x1, y2: BOT_Y },
    { x1: x0, y1: TOP_Y, x2: x1, y2: BOT_Y },
  ]
  return all.map((segment, index) => ({ ...segment, filled: index < fillCount }))
}

function extraSegment(originX: number, filled: boolean): Line {
  return { x1: originX, y1: TOP_Y, x2: originX, y2: BOT_Y, filled }
}

export function buildScoreMatchStickLines(score: number): Line[] {
  const capped = Math.max(0, Math.min(score, SCORE_DISPLAY_CAP))
  const square1Fill = Math.min(5, capped)
  const square2Fill = Math.min(5, Math.max(0, capped - 5))
  const extrasFill = Math.max(0, capped - 10)

  return [
    ...squareSegments(SQ1_X, square1Fill),
    ...squareSegments(SQ2_X, square2Fill),
    extraSegment(EX1_X, extrasFill >= 1),
    extraSegment(EX2_X, extrasFill >= 2),
  ]
}

type ScoreMatchSticksProps = {
  score: number
  className?: string
  ariaLabel?: string
}

export function ScoreMatchSticks({ score, className, ariaLabel }: ScoreMatchSticksProps): ReactElement {
  const lines = buildScoreMatchStickLines(score)
  const cappedLabel = Math.min(Math.max(score, 0), SCORE_DISPLAY_CAP)

  return createElement(
    'svg',
    {
      className: ['score-matchsticks', className].filter(Boolean).join(' ') || undefined,
      viewBox: `0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`,
      role: 'img',
      'aria-label': ariaLabel ?? `Score ${cappedLabel} of ${SCORE_DISPLAY_CAP}`,
      preserveAspectRatio: 'xMidYMid meet',
      focusable: false,
      xmlns: 'http://www.w3.org/2000/svg',
    },
    lines.map((line, index) =>
      createElement('line', {
        key: index,
        className: [
          'score-matchsticks__line',
          line.filled ? 'is-filled' : 'is-empty',
        ].join(' '),
        x1: line.x1,
        y1: line.y1,
        x2: line.x2,
        y2: line.y2,
        stroke: 'currentColor',
        strokeWidth: STROKE_WIDTH,
        strokeLinecap: 'round',
      }),
    ),
  )
}

function escapeAttr(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export function renderScoreMatchSticksSvg(score: number, options?: { className?: string; ariaLabel?: string }): string {
  const lines = buildScoreMatchStickLines(score)
  const cappedLabel = Math.min(Math.max(score, 0), SCORE_DISPLAY_CAP)
  const classAttr = options?.className
    ? ` class="${escapeAttr(`score-matchsticks ${options.className}`.trim())}"`
    : ' class="score-matchsticks"'
  const ariaLabel = options?.ariaLabel ?? `Score ${cappedLabel} of ${SCORE_DISPLAY_CAP}`
  const body = lines
    .map(
      (line) =>
        `<line class="score-matchsticks__line ${line.filled ? 'is-filled' : 'is-empty'}" x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" stroke="currentColor" stroke-width="${STROKE_WIDTH}" stroke-linecap="round"/>`,
    )
    .join('')
  return `<svg${classAttr} viewBox="0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}" role="img" aria-label="${escapeAttr(ariaLabel)}" preserveAspectRatio="xMidYMid meet" focusable="false" xmlns="http://www.w3.org/2000/svg">${body}</svg>`
}
