// The study-tour step definitions — pure data, no React/CSS, so the invariant
// test (node --test) can import them and so the component file only exports a
// component (react-refresh). The component (StudyWalkthrough) reads TOUR_STEPS
// and renders the spotlight/card; StudyLab supplies the TourApi and observe.

/** the lab state the tour watches to auto-advance */
export interface TourObserve {
  line: readonly number[]
  cursor: number
  drafts: Partial<Record<'mão' | 'pé', { slots: (number | null)[]; locked: boolean }>>
}

/** one spotlight hole: a selector, or a group of selectors merged into a
 *  single tight rectangle (the union of their rects) */
export type TargetGroup = string | string[]

export type Step = {
  key: string
  /** what to spotlight: one hole per entry (a nested array merges its
   *  selectors into ONE hole), or null for a centered card */
  target: TargetGroup | TargetGroup[] | null
  /** the section elevated above the blocker; click-dead (pointer-events none) so
   *  only the `allow` matches inside it are live. Required when `allow` is set. */
  lift?: string
  /** the step's only live controls, re-enabled inside the lifted section */
  allow?: string[]
  /** controls marked by a pulsing ring (the intended interaction) */
  glow?: string[]
  /** the glow becomes a beacon — ring plus expanding ripples — for the one
   *  small control the step revolves around */
  beacon?: boolean
  /** draw the axis hint over the chart's H rows and M columns (axes step) */
  axes?: boolean
  /** preferred card side, so it clears the rail history / the hand panel */
  cardSide?: 'left' | 'right'
  /** what the side-placed card sits beside — a whole section (the rail, the
   *  hand panel), so the card never covers any of it. Defaults to the glow /
   *  focus region. */
  cardAnchor?: string
  /** force the pinned-hand panel open on entry (its body holds the target) */
  hand?: boolean
  /** move the rail cursor to this decision on entry (open that plate) */
  cursorK?: number
  /** study string forced on entry — fixed teaching conditions. Every step that
   *  depends on lab state sets one so navigating BACK into it re-forces the
   *  state (a step must never rely on the previous step having set it up). */
  apply?: string
  layout?: 'grid' | 'list'
  /** guide paths for the body's <g>/<g2> links */
  guide?: string
  guide2?: string
  task?: boolean
  /** auto-advance once the user's action shows up in the lab state */
  advanceWhen?: (now: TourObserve, entry: TourObserve) => boolean
}

export const tid = (id: string) => `[data-tour-id="${id}"]`
/** normalize a step target to a list of hole groups (each group = selectors
 *  whose rects merge into one hole) */
export const asGroups = (t: Step['target']): string[][] =>
  t == null ? [] : (Array.isArray(t) ? t : [t]).map((g) => (Array.isArray(g) ? g : [g]))
/** every selector mentioned by a target, flat (for validation) */
export const asList = (t: Step['target']): string[] => asGroups(t).flat()

// The fixed teaching spot (plan 76 D): 11 × 11, vira 4, the 5s alone as
// manilhas. The teaching hand is the dealer's 5♥ 3 4 (classes 11 8 0) after the
// leader's 5♦ (class 9), whose action prices actually differ enough to read.
export const LEAD = 9
export const HAND = [11, 8, 0] as const

const S_BASE = '11x11 v4 mao[? ? ?] pe[? ? ?] :'
const S_LEAD = '11x11 v4 mao[? ? ?] pe[? ? ?] : 5d'
const S_RAIL2 = '11x11 v4 mao[? ? ?] pe[? ? ?] : 5d 4'
// step 7 seeds a NON-5♦ leader so "rewrite it to 5♦" is a real edit
const S_DECOY = '11x11 v4 mao[? ? ?] pe[? ? ?] : 3 4'
const S_HAND = '11x11 v4 mao[? ? ?] pe[5h 3 4] : 5d'
const S_RANGE = '11x11 v4 mao[? ? ?] pe[? 3 4] : 5d'
const S_PINNED = '11x11 v4 mao[? ? ?] pe![5h 3 4] : 5d'

const CONFIRM = '[data-tour="confirm"]'
const RAIL = '[data-tour="rail"]'
const CHART = '[data-tour="chart"]'
const PINNED = '[data-tour="pinned"]'
const LEGEND = '[data-tour="legend"]'
const HAND_HEAD = '[data-tour="hand-head"]'
const HAND_CARDS = '[data-tour="hand-cards"]'
const HAND_VARY = '[data-tour="hand-vary"]'
const HAND_WIN = '[data-tour="hand-win"]'
const HAND_OFTEN = '[data-tour="hand-often"]'
const BLOCK0 = tid('grid-block-0')
const BADGE0 = tid('grid-badge-0')
const PLATE0 = tid('rail-plate-0')
const LEAD_OPTS = '[data-tour-id^="rail-opt-0-"]'
const LEAD_5D = tid(`rail-opt-0-${LEAD}`)
const HAND_CELL = `[data-cell="${HAND.join('-')}"]`
const MIX_CELLS = ['[data-cell="12-11-0"]', '[data-cell="11-10-0"]']
/** the three card slots — their union hugs exactly the cards, unlike the
 *  full-width HAND_CARDS container */
const SLOTS = [tid('hand-slot-0'), tid('hand-slot-1'), tid('hand-slot-2')]

const handIs = (o: TourObserve, slots: readonly (number | null)[]) => {
  const s = o.drafts['pé']?.slots
  return !!s && s.length === 3 && slots.every((v, i) => s[i] === v)
}
const slot0IsRange = (o: TourObserve) => {
  const s = o.drafts['pé']?.slots
  return !!s && s[0] === null && s.some((v) => v !== null)
}

// Every step forces its own lab state via `apply` (and `hand`/`cursorK` where
// needed) so navigating BACKWARD into it re-establishes what it focuses — a
// step never depends on the previous one.
export const TOUR_STEPS: Step[] = [
  { key: 'intro', target: null, apply: S_BASE, layout: 'grid' },
  { key: 'spot', target: '[data-tour="score"]', lift: '[data-tour="score"]', allow: ['[data-tour="score"]'], apply: S_BASE, task: true },
  // free exploration — any leader card; the teaching spot (5♦) is re-forced later
  {
    key: 'pickLead',
    target: RAIL,
    lift: RAIL,
    allow: [LEAD_OPTS],
    apply: S_BASE,
    cardSide: 'right',
    cardAnchor: RAIL,
    task: true,
    advanceWhen: (now) => now.line.length >= 1,
  },
  {
    key: 'pickReply',
    target: RAIL,
    lift: RAIL,
    allow: ['[data-tour-id^="rail-opt-1-"]'],
    apply: S_LEAD,
    cardSide: 'right',
    cardAnchor: RAIL,
    task: true,
    advanceWhen: (now) => now.line.length >= 2,
  },
  {
    key: 'navArrows',
    target: [[tid('rail-prev'), tid('rail-next')]], // one hole hugging the arrows
    lift: RAIL,
    allow: [tid('rail-prev'), tid('rail-next')],
    apply: S_RAIL2,
    cardSide: 'right', // fully clear of THE HAND column
    cardAnchor: RAIL,
    task: true,
    advanceWhen: (now, entry) => now.cursor !== entry.cursor,
  },
  {
    key: 'navPlates',
    target: PLATE0, // lead the eye to the first plate specifically
    lift: RAIL,
    allow: [PLATE0],
    apply: S_RAIL2,
    cursorK: 1,
    cardSide: 'right', // keep the whole rail history visible
    cardAnchor: RAIL,
    task: true,
    advanceWhen: (now) => now.cursor === 0,
  },
  {
    // rewrite history: the leader played a 3 — change it to 5♦ (the line we study)
    key: 'editPast',
    target: PLATE0,
    lift: RAIL,
    allow: [LEAD_5D, CONFIRM], // only 5♦ is clickable, not every option
    glow: [LEAD_5D],
    beacon: true, // the 5♦ is the whole point of the step
    apply: S_DECOY,
    cursorK: 0,
    cardSide: 'right',
    cardAnchor: RAIL,
    task: true,
    advanceWhen: (now) => now.line[0] === LEAD,
  },
  // the whole chart panel — "this is the dealer's decision" — before its parts
  { key: 'dealerActs', target: CHART, apply: S_LEAD },
  {
    key: 'stats',
    target: '[data-tour="stats"]',
    apply: S_LEAD,
    guide: 'glossary#g-equity',
    guide2: 'views#header',
  },
  { key: 'badge', target: BADGE0, apply: S_LEAD, layout: 'grid', guide: 'chart#blocks' },
  { key: 'axes', target: BLOCK0, apply: S_LEAD, guide: 'chart#blocks' },
  {
    key: 'cellPick',
    target: BLOCK0, // the L = 4 block only (badge + table); dim the header/tabs
    lift: BLOCK0, // lift only the block, not the whole chart, so the rest stays dim
    allow: [HAND_CELL],
    glow: [HAND_CELL],
    beacon: true, // an arrow points at the teaching cell
    apply: S_LEAD,
    task: true,
    advanceWhen: (now) => handIs(now, HAND),
  },
  { key: 'handAll', target: PINNED, apply: S_HAND, hand: true },
  { key: 'handWin', target: HAND_WIN, apply: S_HAND, hand: true, guide: 'glossary#g-equity' },
  { key: 'handOften', target: HAND_OFTEN, apply: S_HAND, hand: true, guide: 'views#header' },
  { key: 'colors', target: LEGEND, apply: S_LEAD }, // focus only, no glow
  // one clean hole over both mixed cells (two rounded holes touching diagonally
  // left a lens/circle artifact between them)
  { key: 'mix', target: [MIX_CELLS], apply: S_LEAD, guide: 'solving#mixing' },
  {
    key: 'rangeMake',
    target: [SLOTS], // one hole hugging exactly the three cards
    lift: HAND_CARDS, // lift only the card row (not the whole panel) so the rest stays dim
    allow: [tid('hand-slot-0'), CONFIRM],
    glow: [tid('hand-slot-0')],
    beacon: true, // the card to click
    apply: S_HAND,
    hand: true,
    cardSide: 'left', // keep the DEALER'S HAND panel visible
    cardAnchor: PINNED,
    task: true,
    advanceWhen: slot0IsRange,
  },
  // dual focus: the three cards (one with a "?") AND the per-candidate rows
  {
    key: 'rangeVary',
    target: [SLOTS, HAND_VARY],
    apply: S_RANGE,
    hand: true,
    cardSide: 'left',
    cardAnchor: PINNED,
    guide: 'ranges#range-tool',
  },
  {
    key: 'pin',
    target: HAND_HEAD, // only the DEALER'S HAND header (holds the pin button)
    lift: HAND_HEAD, // lift only the header so the panel body stays dim
    allow: [tid('hand-pin')],
    glow: [tid('hand-pin')],
    beacon: true,
    apply: S_RANGE,
    hand: true,
    cardSide: 'left',
    cardAnchor: PINNED,
    task: true,
    advanceWhen: (now) => now.drafts['pé']?.locked === true,
  },
  { key: 'pinSee', target: tid('rail-pins'), apply: S_PINNED, cardSide: 'right', cardAnchor: RAIL },
  { key: 'done', target: '[data-tour="help"]', apply: S_LEAD, guide: 'glossary' },
]
