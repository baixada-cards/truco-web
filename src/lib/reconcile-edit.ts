// Editing an earlier action keeps the legal tail of the line (plan 76 H-2).
//
// The posture is conservative, by owner decision (2026-07-17): a later
// action survives only when it still means the same thing — the same seat
// acting in the same kind of step of the same trick — and stays legal on
// engine grounds alone (deck copies, the raise ladder, stage kinds). A
// trick-winner flip re-attributes everything downstream to the other seat,
// so the keep stops there; no seat-preserving resequencing, ever. Legality
// is never judged by chart presence: chart docs are async and
// depth-limited, and the verdict must not depend on which files happen to
// be loaded (the string bar's resolveHistory in study-string.ts enforces
// these same rules on typed histories — keep the two in step).

import {
  bandForbidsRaises,
  classCopies,
  nextLegalRaiseTarget,
  RAISE_TARGETS,
  viraClassOf,
  walkLine,
  type BandContext,
} from './study-data.ts'

/** why the kept region ended, when it did */
export type CutReason = 'actor' | 'deck' | 'illegal'

export interface EditReconcile {
  /** the new line: edited prefix plus every suffix action that survived */
  next: number[]
  kept: number
  dropped: number
  /** null when the whole suffix survived */
  reason: CutReason | null
}

/** engine-rule legality of `code` played after `prefix` — mirrors the
 *  checks resolveHistory applies to typed histories, plus a strict
 *  stage-kind gate for card plays */
function legality(
  prefix: readonly number[],
  code: number,
  ctx: BandContext,
  tc: number,
): 'ok' | CutReason {
  const walk = walkLine(prefix, ctx)
  if (walk.folded || walk.toAct === null) return 'illegal'
  const stage = walk.stage
  if (code === 33 || code === 34) return stage.kind === 'eleven' ? 'ok' : 'illegal'
  if (code === 31 || code === 32) return stage.kind === 'raise-answer' ? 'ok' : 'illegal'
  if (code >= 27 && code <= 30) {
    if (bandForbidsRaises(ctx.score)) return 'illegal'
    return nextLegalRaiseTarget(prefix, ctx) === RAISE_TARGETS[code - 27] ? 'ok' : 'illegal'
  }
  if (code >= 0 && code <= 25) {
    if (stage.kind !== 'play') return 'illegal'
    if (code <= 12) {
      // open plays draw on one visible deck alongside the vira; face-down
      // plays are unconstrained here, exactly as in resolveHistory
      const seen = prefix.filter((c) => c === code).length + (code === viraClassOf(tc) ? 1 : 0)
      if (seen >= classCopies(code)) return 'deck'
    }
    return 'ok'
  }
  return 'illegal'
}

/**
 * Replace the action at decision `k` with `code` and carry forward as much
 * of the old future as survives the conservative criterion. The caller
 * owns the base edit's legality (the rail only offers legal options) and
 * the unpick case (removing an action shifts every later position, so it
 * still truncates outright).
 */
export function reconcileEdit(
  line: readonly number[],
  k: number,
  code: number,
  ctx: BandContext,
  tc: number,
): EditReconcile {
  const suffix = line.slice(k + 1)
  const next = [...line.slice(0, k), code]
  if (suffix.length === 0) return { next, kept: 0, dropped: 0, reason: null }

  const oldSteps = walkLine(line, ctx).steps
  let kept = 0
  let reason: CutReason | null = null
  for (const c of suffix) {
    const leg = legality(next, c, ctx, tc)
    if (leg !== 'ok') {
      reason = leg
      break
    }
    const newSteps = walkLine([...next, c], ctx).steps
    const oldStep = oldSteps[k + 1 + kept]
    const newStep = newSteps[newSteps.length - 1]
    if (
      !oldStep ||
      !newStep ||
      oldStep.seat !== newStep.seat ||
      oldStep.kind !== newStep.kind ||
      oldStep.trick !== newStep.trick
    ) {
      reason = 'actor'
      break
    }
    next.push(c)
    kept += 1
  }
  return { next, kept, dropped: suffix.length - kept, reason: kept === suffix.length ? null : reason }
}
