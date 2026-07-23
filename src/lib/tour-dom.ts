// Pure DOM-decoration bookkeeping for the study tour (plan 82). Kept free of
// React and of the live `document` type so teardown correctness is unit
// testable, and — the point — so an abrupt close (Esc) can NEVER strand a
// style: every decoration is an *attribute*, CSS does the pointer-events /
// z-index / position work, and `clearTourDom` removes them all by global
// query without depending on any per-element bookkeeping.

/** the minimal element surface the tour touches */
export interface TourEl {
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
}

/** the minimal document surface the tour touches (real `document` satisfies it) */
export interface TourDoc {
  querySelectorAll(sel: string): ArrayLike<TourEl> & Iterable<TourEl>
  body: TourEl
}

export const LIFT = 'data-tour-lift'
export const ALLOW = 'data-tour-allow'
export const GLOW = 'data-tour-glow'
export const OPEN = 'data-tour-open'

/** the per-element decoration attributes (everything except the body flag) */
export const DECORATIONS = [LIFT, ALLOW, GLOW] as const

export interface StepSelectors {
  /** section lifted above the blocker (click-dead; allow re-enables children) */
  lift?: string | null
  /** the step's live controls, re-enabled inside the lifted section */
  allow?: readonly string[]
  /** controls that pulse to mark the intended interaction */
  glow?: readonly string[]
}

/**
 * Add this step's decoration attributes. Add-only and idempotent, so the
 * caller can re-run it on an interval to catch controls that mount mid-step
 * (a rail plate's options appear only once it is focused) without disturbing
 * marks already placed.
 */
export function markStepDom(doc: TourDoc, sel: StepSelectors): void {
  doc.body.setAttribute(OPEN, '')
  if (sel.lift) for (const el of doc.querySelectorAll(sel.lift)) el.setAttribute(LIFT, '')
  for (const s of sel.allow ?? []) for (const el of doc.querySelectorAll(s)) el.setAttribute(ALLOW, '')
  for (const s of sel.glow ?? []) for (const el of doc.querySelectorAll(s)) el.setAttribute(GLOW, '')
}

/** remove every per-element decoration (leaves `body[data-tour-open]`) */
export function clearDecorations(doc: TourDoc): void {
  for (const attr of DECORATIONS) {
    for (const el of doc.querySelectorAll(`[${attr}]`)) el.removeAttribute(attr)
  }
}

/**
 * Full teardown: every decoration attribute plus the body flag, all by global
 * query. Idempotent and safe when nothing is decorated — this is what runs on
 * step change, on close, on unmount, and as a mount-time safety sweep, so no
 * combination of abrupt close or mid-tour remount can leave the page inert.
 */
export function clearTourDom(doc: TourDoc): void {
  clearDecorations(doc)
  doc.body.removeAttribute(OPEN)
}
