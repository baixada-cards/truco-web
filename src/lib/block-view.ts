// The block-view URL codec: how the lab's block layout — which hand slot the
// blocks split by, and whether one fixed-card chart or all of them show —
// serializes into the `b` query parameter, next to (not inside) the study
// string. The study string stays a pure hand/history language; `.truco`
// files and the hand bar never carry layout.
//
//   b=l        blocks split by the lowest card, all blocks stacked (only
//              written when something else differs from the default)
//   b=h        split by the highest card, all blocks
//   b=m:k      split by the middle card, single chart fixed on M = K
//   b=l:5s     single chart fixed on a manilha (card tokens follow the
//              study-string notation under the current vira)

import { cardToken, resolveCard, StudyStringError } from './study-string.ts'

export type BlockSplit = 0 | 1 | 2

export interface BlockView {
  /** which hand slot the blocks split by (H = 0, M = 1, L = 2) */
  split: BlockSplit
  /** all blocks stacked, or a single fixed-card chart */
  mode: 'all' | 'single'
  /** the fixed card's class in single mode (null means "first available") */
  single: number | null
}

export const DEFAULT_BLOCK_VIEW: BlockView = { split: 2, mode: 'all', single: null }

const SPLIT_LETTERS = ['h', 'm', 'l'] as const

/**
 * Serialize a block view for the URL, or null when it carries no information
 * beyond the default (so the parameter can be omitted). A single-mode view
 * without a chosen card degrades to its split alone.
 */
export function formatBlockView(view: BlockView, tc: number, viraRankLabel?: string): string | null {
  const letter = SPLIT_LETTERS[view.split]
  if (view.mode === 'single' && view.single !== null) {
    return `${letter}:${cardToken(view.single, tc, viraRankLabel)}`
  }
  return view.split === DEFAULT_BLOCK_VIEW.split ? null : letter
}

/** Parse a `b` parameter under a vira; garbage reads as null, never throws. */
export function parseBlockView(raw: string, tc: number, viraRankLabel?: string): BlockView | null {
  const [head, ...rest] = raw.trim().toLowerCase().split(':')
  if (rest.length > 1) return null
  const split = SPLIT_LETTERS.indexOf(head as (typeof SPLIT_LETTERS)[number]) as BlockSplit | -1
  if (split === -1) return null
  if (rest.length === 0 || rest[0] === '') {
    return { split, mode: 'all', single: null }
  }
  try {
    return { split, mode: 'single', single: resolveCard(rest[0], tc, viraRankLabel) }
  } catch (e) {
    if (e instanceof StudyStringError) return null
    throw e
  }
}
