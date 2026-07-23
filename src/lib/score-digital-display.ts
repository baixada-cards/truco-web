import { createElement } from 'react'
import type { ReactElement } from 'react'

const DIGIT_WIDTH = 52
const DIGIT_HEIGHT = 88
const DIGIT_GAP = 10
const HORIZONTAL_INSET = 10
const SEGMENT_THICKNESS = 8
const SEGMENT_BEVEL = 5
const TOP_Y = 8
const MIDDLE_Y = 44
const BOTTOM_Y = 80
const UPPER_TOP_Y = 14
const UPPER_BOTTOM_Y = 40
const LOWER_TOP_Y = 48
const LOWER_BOTTOM_Y = 74
const LEFT_X = 8
const RIGHT_X = DIGIT_WIDTH - LEFT_X
const VIEW_WIDTH = DIGIT_WIDTH * 2 + DIGIT_GAP
const VIEW_HEIGHT = DIGIT_HEIGHT
const INACTIVE_SEGMENT_OPACITY = 0.12

type SegmentId = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g'

const DIGIT_SEGMENTS: Record<string, SegmentId[]> = {
  '0': ['a', 'b', 'c', 'd', 'e', 'f'],
  '1': ['b', 'c'],
  '2': ['a', 'b', 'd', 'e', 'g'],
  '3': ['a', 'b', 'c', 'd', 'g'],
  '4': ['b', 'c', 'f', 'g'],
  '5': ['a', 'c', 'd', 'f', 'g'],
  '6': ['a', 'c', 'd', 'e', 'f', 'g'],
  '7': ['a', 'b', 'c'],
  '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  '9': ['a', 'b', 'c', 'd', 'f', 'g'],
}

function horizontalSegmentPoints(y: number) {
  const left = HORIZONTAL_INSET
  const right = DIGIT_WIDTH - HORIZONTAL_INSET
  const halfThickness = SEGMENT_THICKNESS / 2
  return [
    `${left},${y}`,
    `${left + SEGMENT_BEVEL},${y - halfThickness}`,
    `${right - SEGMENT_BEVEL},${y - halfThickness}`,
    `${right},${y}`,
    `${right - SEGMENT_BEVEL},${y + halfThickness}`,
    `${left + SEGMENT_BEVEL},${y + halfThickness}`,
  ].join(' ')
}

function verticalSegmentPoints(x: number, startY: number, endY: number) {
  const halfThickness = SEGMENT_THICKNESS / 2
  return [
    `${x},${startY}`,
    `${x + halfThickness},${startY + SEGMENT_BEVEL}`,
    `${x + halfThickness},${endY - SEGMENT_BEVEL}`,
    `${x},${endY}`,
    `${x - halfThickness},${endY - SEGMENT_BEVEL}`,
    `${x - halfThickness},${startY + SEGMENT_BEVEL}`,
  ].join(' ')
}

const SEGMENT_POINTS: Record<SegmentId, string> = {
  a: horizontalSegmentPoints(TOP_Y),
  b: verticalSegmentPoints(RIGHT_X, UPPER_TOP_Y, UPPER_BOTTOM_Y),
  c: verticalSegmentPoints(RIGHT_X, LOWER_TOP_Y, LOWER_BOTTOM_Y),
  d: horizontalSegmentPoints(BOTTOM_Y),
  e: verticalSegmentPoints(LEFT_X, LOWER_TOP_Y, LOWER_BOTTOM_Y),
  f: verticalSegmentPoints(LEFT_X, UPPER_TOP_Y, UPPER_BOTTOM_Y),
  g: horizontalSegmentPoints(MIDDLE_Y),
}

type ScoreDigitalDisplayProps = {
  score: number
  className?: string
}

function clampDisplayScore(score: number) {
  return Math.min(99, Math.max(0, Math.round(score)))
}

export function formatScoreDigitalDigits(score: number) {
  return String(clampDisplayScore(score)).padStart(2, '0')
}

function renderDigitGroup(digit: string, index: number): ReactElement {
  const activeSegments = new Set(DIGIT_SEGMENTS[digit] ?? DIGIT_SEGMENTS['0'])

  return createElement(
    'g',
    {
      key: `digit-${index}`,
      transform: `translate(${index * (DIGIT_WIDTH + DIGIT_GAP)} 0)`,
    },
    (Object.entries(SEGMENT_POINTS) as Array<[SegmentId, string]>).map(([segmentId, points]) =>
      createElement('polygon', {
        key: segmentId,
        points,
        fill: 'currentColor',
        opacity: activeSegments.has(segmentId) ? 1 : INACTIVE_SEGMENT_OPACITY,
      }),
    ),
  )
}

export function ScoreDigitalDisplay({ score, className }: ScoreDigitalDisplayProps): ReactElement {
  const digits = formatScoreDigitalDigits(score)

  return createElement(
    'span',
    {
      className: ['score-digital-display', className].filter(Boolean).join(' ') || undefined,
      'data-score-digits': digits,
      'aria-hidden': true,
    },
    createElement(
      'svg',
      {
        className: 'score-digital-display__svg',
        viewBox: `0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`,
        focusable: false,
        'aria-hidden': true,
        preserveAspectRatio: 'xMidYMid meet',
        xmlns: 'http://www.w3.org/2000/svg',
      },
      digits.split('').map((digit, index) => renderDigitGroup(digit, index)),
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

function renderDigitGroupHtml(digit: string, index: number) {
  const activeSegments = new Set(DIGIT_SEGMENTS[digit] ?? DIGIT_SEGMENTS['0'])
  const body = (Object.entries(SEGMENT_POINTS) as Array<[SegmentId, string]>)
    .map(([segmentId, points]) =>
      `<polygon points="${points}" fill="currentColor" opacity="${activeSegments.has(segmentId) ? 1 : INACTIVE_SEGMENT_OPACITY}"/>`,
    )
    .join('')
  return `<g transform="translate(${index * (DIGIT_WIDTH + DIGIT_GAP)} 0)">${body}</g>`
}

export function renderScoreDigitalDisplayHtml(score: number, options?: { className?: string }): string {
  const digits = formatScoreDigitalDigits(score)
  const classAttr = options?.className
    ? ` class="${escapeAttr(`score-digital-display ${options.className}`.trim())}"`
    : ' class="score-digital-display"'
  const body = digits
    .split('')
    .map((digit, index) => renderDigitGroupHtml(digit, index))
    .join('')

  return `<span${classAttr} data-score-digits="${escapeAttr(digits)}" aria-hidden="true"><svg class="score-digital-display__svg" viewBox="0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}" focusable="false" aria-hidden="true" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${body}</svg></span>`
}
