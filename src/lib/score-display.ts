import { createElement } from 'react'
import type { ReactElement } from 'react'

import { ScoreDigitalDisplay, renderScoreDigitalDisplayHtml } from './score-digital-display.ts'
import { ScoreMatchSticks, renderScoreMatchSticksSvg } from './score-match-sticks.ts'

export const SCORE_DISPLAY_STYLE_OPTIONS = [
  { id: 'brass', label: 'Brass' },
  { id: 'chips', label: 'Chips' },
  { id: 'track', label: 'Track' },
  { id: 'medallion', label: 'Medallion' },
  { id: 'digital', label: 'Digital' },
  { id: 'bars', label: 'Bars' },
] as const

export type ScoreDisplayStyle = typeof SCORE_DISPLAY_STYLE_OPTIONS[number]['id']

export const DEFAULT_SCORE_DISPLAY_STYLE: ScoreDisplayStyle = 'brass'
export const SCORE_DISPLAY_STYLE_STORAGE_KEY = 'truco.live.scoreDisplayStyle'
export const SCORE_DISPLAY_TARGET = 12

const SCORE_DISPLAY_STYLE_IDS = new Set<string>(SCORE_DISPLAY_STYLE_OPTIONS.map((option) => option.id))

type ScoreDisplayProps = {
  score: number
  style: ScoreDisplayStyle
}

export function isScoreDisplayStyle(value: string | null | undefined): value is ScoreDisplayStyle {
  return value != null && SCORE_DISPLAY_STYLE_IDS.has(value)
}

function clampScore(score: number) {
  if (!Number.isFinite(score)) return 0
  return Math.max(0, Math.min(SCORE_DISPLAY_TARGET, Math.trunc(score)))
}

function displayScore(score: number) {
  return String(Math.max(0, Math.trunc(Number.isFinite(score) ? score : 0)))
}

function renderMarkers(score: number, className: string): ReactElement[] {
  const cappedScore = clampScore(score)

  return Array.from({ length: SCORE_DISPLAY_TARGET }, (_, index) =>
    createElement('span', {
      key: index,
      className: [
        className,
        index < cappedScore ? 'is-filled' : '',
      ].filter(Boolean).join(' '),
      'aria-hidden': true,
    }),
  )
}

function ScoreChipStack({ score }: { score: number }): ReactElement {
  return createElement(
    'span',
    {
      className: 'score-chip-stack',
      'data-score-value': displayScore(score),
      'aria-hidden': true,
    },
    createElement(
      'span',
      { className: 'score-chip-stack__chips' },
      renderMarkers(score, 'score-chip-stack__chip'),
    ),
    createElement('span', { className: 'score-chip-stack__value' }, displayScore(score)),
  )
}

function ScoreBrassInlay({ score }: { score: number }): ReactElement {
  return createElement(
    'span',
    {
      className: 'score-brass-inlay',
      'data-score-value': displayScore(score),
      'aria-hidden': true,
    },
    createElement('span', { className: 'score-brass-inlay__value' }, displayScore(score)),
    createElement(
      'span',
      { className: 'score-brass-inlay__pips' },
      renderMarkers(score, 'score-brass-inlay__pip'),
    ),
  )
}

function ScorePegTrack({ score }: { score: number }): ReactElement {
  return createElement(
    'span',
    {
      className: 'score-peg-track',
      'data-score-value': displayScore(score),
      'aria-hidden': true,
    },
    createElement('span', { className: 'score-peg-track__value' }, displayScore(score)),
    createElement(
      'span',
      { className: 'score-peg-track__rail' },
      renderMarkers(score, 'score-peg-track__peg'),
    ),
  )
}

function ScoreMedallion({ score }: { score: number }): ReactElement {
  return createElement(
    'span',
    {
      className: 'score-medallion',
      'data-score-value': displayScore(score),
      'aria-hidden': true,
    },
    createElement('span', { className: 'score-medallion__ring', 'aria-hidden': true }),
    createElement('span', { className: 'score-medallion__value' }, displayScore(score)),
  )
}

export function ScoreDisplay({ score, style }: ScoreDisplayProps): ReactElement {
  switch (style) {
    case 'digital':
      return createElement(ScoreDigitalDisplay, { score })
    case 'bars':
      return createElement(ScoreMatchSticks, { score })
    case 'chips':
      return createElement(ScoreChipStack, { score })
    case 'track':
      return createElement(ScorePegTrack, { score })
    case 'medallion':
      return createElement(ScoreMedallion, { score })
    case 'brass':
    default:
      return createElement(ScoreBrassInlay, { score })
  }
}

function escapeAttr(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function renderMarkersHtml(score: number, className: string) {
  const cappedScore = clampScore(score)

  return Array.from({ length: SCORE_DISPLAY_TARGET }, (_, index) => {
    const classes = [
      className,
      index < cappedScore ? 'is-filled' : '',
    ].filter(Boolean).join(' ')
    return `<span class="${escapeAttr(classes)}" aria-hidden="true"></span>`
  }).join('')
}

export function renderScoreDisplayHtml(score: number, style: ScoreDisplayStyle): string {
  switch (style) {
    case 'digital':
      return renderScoreDigitalDisplayHtml(score)
    case 'bars':
      return renderScoreMatchSticksSvg(score)
    case 'chips':
      return `<span class="score-chip-stack" data-score-value="${escapeAttr(displayScore(score))}" aria-hidden="true"><span class="score-chip-stack__chips">${renderMarkersHtml(score, 'score-chip-stack__chip')}</span><span class="score-chip-stack__value">${escapeAttr(displayScore(score))}</span></span>`
    case 'track':
      return `<span class="score-peg-track" data-score-value="${escapeAttr(displayScore(score))}" aria-hidden="true"><span class="score-peg-track__value">${escapeAttr(displayScore(score))}</span><span class="score-peg-track__rail">${renderMarkersHtml(score, 'score-peg-track__peg')}</span></span>`
    case 'medallion':
      return `<span class="score-medallion" data-score-value="${escapeAttr(displayScore(score))}" aria-hidden="true"><span class="score-medallion__ring" aria-hidden="true"></span><span class="score-medallion__value">${escapeAttr(displayScore(score))}</span></span>`
    case 'brass':
    default:
      return `<span class="score-brass-inlay" data-score-value="${escapeAttr(displayScore(score))}" aria-hidden="true"><span class="score-brass-inlay__value">${escapeAttr(displayScore(score))}</span><span class="score-brass-inlay__pips">${renderMarkersHtml(score, 'score-brass-inlay__pip')}</span></span>`
  }
}
