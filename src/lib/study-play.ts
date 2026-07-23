// Build a seeded live-match request from the study lab's viewed position:
// "play this hand live". The hero is the drafted role (pinned preferred), or
// the seat to act at the viewed node when nothing is drafted. Any cards not
// drafted (either seat's) are dealt by the engine from the line-conditioned
// range. The walked line becomes the replayed history, so the live match
// resumes at the exact analyzed node.

import { walkLine } from './study-data.ts'
import type { SeededHistoryEntry } from './session-api.ts'

export type StudyPlayRole = 'mão' | 'pé'

export type StudyPlaySeed = {
  humanPlayer: 0 | 1
  score: { '0': number; '1': number }
  dealer: 0 | 1
  viraRank: string
  heroHand: number[] | null
  villainHand: number[] | null
  history: SeededHistoryEntry[]
  /** which lab role the human plays, for messaging */
  heroRole: StudyPlayRole
}

export type StudyPlayBuild =
  | { ok: true; seed: StudyPlaySeed }
  | { ok: false; reason: 'hand-over' | 'line-error' }

const RAISE_TARGETS = [3, 6, 9, 12] as const

function historyEntry(code: number, seat: 0 | 1): SeededHistoryEntry | null {
  if (code >= 0 && code <= 12) return { seat, kind: 'play_face_up', class: code }
  if (code >= 13 && code <= 25) return { seat, kind: 'play_face_down', class: code - 13 }
  if (code >= 27 && code <= 30) return { seat, kind: 'raise', to: RAISE_TARGETS[code - 27] }
  if (code === 31) return { seat, kind: 'accept_raise' }
  if (code === 32) return { seat, kind: 'fold' }
  if (code === 33) return { seat, kind: 'accept_eleven' }
  if (code === 34) return { seat, kind: 'fold_eleven' }
  return null
}

type DraftLike = { slots: (number | null)[]; locked: boolean }

function fullHand(draft: DraftLike | undefined): number[] | null {
  if (!draft) return null
  const known = draft.slots.filter((slot): slot is number => slot != null)
  return known.length === 3 ? known : null
}

/**
 * Convert the lab's viewed position into the seeded-session payload.
 * `line` is the walked prefix (up to the cursor), in lab action codes.
 */
export function buildStudyPlaySeed(input: {
  spot: { score: [number, number]; dealer: number }
  viraRank: string
  line: readonly number[]
  drafts: Partial<Record<StudyPlayRole, DraftLike>>
}): StudyPlayBuild {
  const { spot, viraRank, line, drafts } = input
  const maoHand = fullHand(drafts['mão'])
  const peHand = fullHand(drafts['pé'])
  const dealer = spot.dealer as 0 | 1

  const walk = walkLine(line, { dealer, score: spot.score })
  if (walk.folded || (line.length > 0 && walk.toAct == null)) {
    return { ok: false, reason: 'hand-over' }
  }

  // The human plays the drafted role (the pinned one when both are drafted).
  // With no full draft, they play the seat to act at the viewed node; the
  // engine deals their unspecified cards from the line-conditioned range.
  let heroRole: StudyPlayRole
  if (maoHand && peHand) {
    const maoLocked = drafts['mão']?.locked ?? false
    const peLocked = drafts['pé']?.locked ?? false
    heroRole = maoLocked === peLocked ? 'mão' : maoLocked ? 'mão' : 'pé'
  } else if (maoHand) {
    heroRole = 'mão'
  } else if (peHand) {
    heroRole = 'pé'
  } else {
    const toActSeat = walk.toAct ?? 1 - dealer
    heroRole = toActSeat === dealer ? 'pé' : 'mão'
  }

  const heroSeat = (heroRole === 'pé' ? dealer : 1 - dealer) as 0 | 1
  const heroHand = heroRole === 'mão' ? maoHand : peHand
  const villainHand = heroRole === 'mão' ? peHand : maoHand
  const history: SeededHistoryEntry[] = []
  for (const step of walk.steps) {
    const entry = historyEntry(step.code, step.seat as 0 | 1)
    if (!entry) return { ok: false, reason: 'line-error' }
    history.push(entry)
  }

  return {
    ok: true,
    seed: {
      humanPlayer: heroSeat,
      score: { '0': spot.score[0], '1': spot.score[1] },
      dealer,
      viraRank,
      heroHand,
      villainHand,
      history,
      heroRole,
    },
  }
}
