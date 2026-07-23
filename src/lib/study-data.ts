// Study lab data model: parsing and aggregating `study-chart/v1` documents
// produced by `solve export-chart` (see plans/73-lab-strategy-charts.md).
//
// Action codes are the solver's stable AbstractAction u8 codec:
//   0..=12  play face-up, card class 0-12
//   13..=25 play face-down, card class code-13
//   26      opponent played hidden
//   27..=30 raise to 3/6/9/12
//   31      accept raise, 32 fold, 33 accept eleven, 34 fold eleven

const RAISE_LADDER = [1, 3, 6, 9, 12] as const

export interface ChartAction {
  c: number
  /** Exported chart probability. Certified Study exports already did any purification in Rust. */
  p: number
  /** Raw average-strategy probability, present on purified exports for diagnostics. */
  raw_p?: number
  /** Match equity in ±1 space if the action is taken and both follow the solve. */
  q: number
  /** Expected hand-point differential for the actor, same convention as q. */
  pts?: number
}

export interface ChartRow {
  /** Dense solver info-set key. Present on BR-gap-capable chart exports. */
  table_idx?: number
  hand: [number, number, number]
  /** Acting player's counterfactual reach, including the deal prior. */
  own_reach?: number
  /** Opponent's counterfactual reach, including the deal prior. */
  w: number
  actions: ChartAction[]
}

/** One compact, full-tree quality measurement from the solver's `.brgaps` artifact. */
export interface BrGapRecord {
  tableIdx: number
  brValue: number
  eqValue: number
  /** Adversarial best-response loss in ±1 match-value space. */
  gap: number
  weight: number
}

// "TRUCBRGA" as the two little-endian halves of the solver's u64 magic.
// Keep this u32-only: the frontend's ES2019 target deliberately has no bigint.
const BRGAP_MAGIC_LO = 0x4252_4741
const BRGAP_MAGIC_HI = 0x5452_5543
const BRGAP_HEADER_BYTES = 48
const BRGAP_RECORD_BYTES = 20

/**
 * Decode the solver's compact, columnar BR-gap artifact in the browser. It is
 * deliberately separate from the chart JSON: the artifact covers the full
 * tree, while shallow/deep chart windows only carry the rows presently shown.
 */
export function parseBrGapTable(
  buffer: ArrayBuffer,
  expected: { score: [number, number]; tc: number; dealer: number },
): Map<number, BrGapRecord> {
  if (buffer.byteLength < BRGAP_HEADER_BYTES) throw new Error('BR-gap table has a truncated header')
  const view = new DataView(buffer)
  if (view.getUint32(0, true) !== BRGAP_MAGIC_LO || view.getUint32(4, true) !== BRGAP_MAGIC_HI) {
    throw new Error('BR-gap table has an invalid magic')
  }
  if (view.getUint32(8, true) !== 1 || view.getUint32(12, true) !== 0) {
    throw new Error('BR-gap table has an unsupported version')
  }
  if (view.getUint32(28, true) !== 0) throw new Error('BR-gap table has too many records')
  const count = view.getUint32(24, true)
  const score = view.getUint32(32, true)
  const band = view.getUint32(40, true)
  if (
    view.getUint32(36, true) !== 0 ||
    view.getUint32(44, true) !== 0 ||
    score !== ((expected.score[0] << 8) | expected.score[1]) ||
    band !== ((expected.tc << 8) | expected.dealer)
  ) {
    throw new Error('BR-gap table belongs to a different Study spot')
  }
  if (!Number.isSafeInteger(count) || buffer.byteLength !== BRGAP_HEADER_BYTES + count * BRGAP_RECORD_BYTES) {
    throw new Error('BR-gap table has an invalid record length')
  }
  const records = new Map<number, BrGapRecord>()
  for (let offset = BRGAP_HEADER_BYTES; offset < buffer.byteLength; offset += BRGAP_RECORD_BYTES) {
    const tableIdx = view.getUint32(offset, true)
    records.set(tableIdx, {
      tableIdx,
      brValue: view.getFloat32(offset + 4, true),
      eqValue: view.getFloat32(offset + 8, true),
      gap: view.getFloat32(offset + 12, true),
      weight: view.getFloat32(offset + 16, true),
    })
  }
  return records
}

export interface ChartNode {
  history: number[]
  player: number
  is_dealer: boolean
  rows: ChartRow[]
}

/**
 * Deal priors indexed by a starting hand. At the root both counterfactual
 * reaches equal this prior, so either field is valid for legacy exports.
 */
export function rootDealWeights(root: ChartNode | undefined): Map<string, number> {
  const weights = new Map<string, number>()
  if (!root) return weights
  for (const row of root.rows) weights.set(row.hand.join(','), row.own_reach ?? row.w)
  return weights
}

/**
 * True probability mass of one row reaching its node under both players'
 * strategies. `w` alone is counterfactual opponent reach, so it deliberately
 * omits the actor's earlier decisions; that is useful for strategy averaging,
 * but wrong for a displayed "of deals get here" percentage.
 */
export function jointRowWeight(row: ChartRow, dealWeights: ReadonlyMap<string, number>): number {
  const dealWeight = dealWeights.get(row.hand.join(','))
  if (row.own_reach === undefined || dealWeight === undefined || dealWeight <= 0) return row.w
  return (row.own_reach * row.w) / dealWeight
}

/** Total true deal-joint mass reaching a node. */
export function nodeJointMass(node: ChartNode | undefined, dealWeights: ReadonlyMap<string, number>): number {
  if (!node) return 0
  return node.rows.reduce((sum, row) => sum + jointRowWeight(row, dealWeights), 0)
}

export interface ChartDoc {
  format: string
  score: [number, number]
  tc: number
  dealer: number
  min_depth?: number
  max_depth: number
  certificate?: {
    format: string
    certified: boolean
    raw_eps?: number | null
    purified_eps?: number | null
    mass_removed: number
    max_info_set_mass_removed: number
    max_qgap_touched_pp: number
    touched_info_sets: number
    actions_zeroed: number
    purify_max_prob: number
    purify_min_qgap_pp: number
    assert_qgap_pp: number
    assert_max_info_set_mass: number
    raw_max_info_set_mass_above_assert_qgap: number
    raw_touched_info_sets_above_assert_qgap: number
  }
  nodes: ChartNode[]
}

export const N_CLASSES = 13
export const DISPLAY_SUPPRESS_MAX_PROB = 0.03
export const DISPLAY_SUPPRESS_MIN_Q_GAP_PP = 1

/** raise targets the solver codec names: codes 27..=30 ↔ the rungs of the
 *  engine's RAISE_LADDER ([1, 3, 6, 9, 12]) above the base stake */
export const RAISE_TARGETS: readonly number[] = RAISE_LADDER.slice(1)

/** Codes 0..=12 face-up and 13..=25 own face-down; 26 is the opponent's hidden play. */
function isCardPlay(code: number): boolean {
  return code <= 26
}

/** Trick strength of an observed play code: hidden cards always lose. */
function playStrength(code: number): number {
  return code <= 12 ? code : -1
}

/** Winner of a completed trick given the two observed play codes, lead first. */
export function resolveTrick(lead: number, reply: number): 'lead' | 'reply' | 'tie' {
  const a = playStrength(lead)
  const b = playStrength(reply)
  if (a > b) return 'lead'
  if (b > a) return 'reply'
  return 'tie'
}

const RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'] as const
const MANILHA_SUITS = ['♦', '♠', '♥', '♣'] as const

export type ManilhaSuit = (typeof MANILHA_SUITS)[number]

/**
 * How the 13 abstract classes are written out: 'cards' names manilhas by
 * their real rank under the vira (e.g. `5♣`), 'classes' keeps the solver's
 * vira-independent manilha classes (`M♣`). Plain classes are the rank either
 * way — off-manilha, every suit of a rank is the same card to the solver.
 */
export type CardNotation = 'cards' | 'classes'

/** How card-play actions are written: by the card itself or by hand slot. */
export type ActionNotation = 'cards' | 'roles'

export interface ClassInfo {
  label: string
  rank: string
  /** manilha suit glyph; null for plain classes, where suit never matters */
  suit: ManilhaSuit | null
}

/** Concrete card labels for the 13 abstract classes under a vira class. */
export function classLabels(tc: number, viraRankLabel?: string): string[] {
  return classInfos(tc, 'cards', viraRankLabel).map((c) => c.label)
}

/** Per-class label parts for the 13 abstract classes under a vira class. */
export function classInfos(tc: number, notation: CardNotation, viraRankLabel?: string): ClassInfo[] {
  // vira rank r blocks plain level: idx(r) if idx(r) < idx(manilha) else idx(r)-1,
  // where manilha is the next rank (wrapping 3 -> 4).
  for (let i = 0; i < RANKS.length; i += 1) {
    const manilhaIdx = (i + 1) % RANKS.length
    const blocked = i < manilhaIdx ? i : i - 1
    if (blocked === tc && (viraRankLabel === undefined || RANKS[i] === viraRankLabel.toUpperCase())) {
      const manilhaRank = notation === 'cards' ? RANKS[manilhaIdx] : 'M'
      const plain = RANKS.filter((_, j) => j !== manilhaIdx).map((rank) => ({
        label: rank as string,
        rank: rank as string,
        suit: null,
      }))
      const manilhas = MANILHA_SUITS.map((suit) => ({
        label: `${manilhaRank}${suit}`,
        rank: manilhaRank as string,
        suit,
      }))
      return [...plain, ...manilhas]
    }
  }
  throw new Error(
    viraRankLabel === undefined
      ? `no vira produces blocked level ${tc}`
      : `vira ${viraRankLabel} does not produce blocked level ${tc}`,
  )
}

export function viraRank(tc: number): string {
  for (let i = 0; i < RANKS.length; i += 1) {
    const manilhaIdx = (i + 1) % RANKS.length
    const blocked = i < manilhaIdx ? i : i - 1
    if (blocked === tc) return RANKS[i]
  }
  throw new Error(`no vira produces blocked level ${tc}`)
}

/** Concrete vira labels whose deals collapse to one lossless solver class. */
export function viraRanks(tc: number): string[] {
  return viraChoices()
    .filter((choice) => choice.tc === tc)
    .map((choice) => choice.rank)
}

/** Every turnable rank with the solver class (`tc`) its game abstracts to. */
export function viraChoices(): Array<{ rank: string; tc: number }> {
  return RANKS.map((rank, i) => {
    const manilhaIdx = (i + 1) % RANKS.length
    return { rank: rank as string, tc: i < manilhaIdx ? i : i - 1 }
  })
}

// ── Observed-history interpretation ─────────────────────────────────────────
//
// A node's history is the flat list of actions its player has observed. Which
// seat took each one is not stored — it is re-derived from the turn rules the
// engine spec fixes (specs/engine/aspects/turn-structure.md): the mão (the
// dealer's opponent) leads trick 1, the winner of a trick leads the next one,
// a tied trick keeps the same leader, hidden cards always lose, and a raise
// belongs to the seat whose card turn it interrupts, with answers alternating
// until an accept hands the card turn back untouched.

/** Band facts the history interpreter needs (from the chart doc header). */
export interface BandContext {
  dealer: number
  score: [number, number]
}

/** The seat that owns the mão-de-onze decision in this band, if any. */
export function elevenOwner(score: [number, number]): number | null {
  if (score[0] === 11 && score[1] !== 11) return 0
  if (score[1] === 11 && score[0] !== 11) return 1
  return null
}

export interface HistoryStep {
  code: number
  /** absolute player seat that took this action */
  seat: number
  /** whether the node's own player took this action */
  own: boolean
  kind: 'eleven' | 'play' | 'raise' | 'raise-answer'
  /** 1-based trick number for card-turn actions, null for mão-de-onze */
  trick: number | null
}

export type NodeStage =
  | { kind: 'eleven' }
  | { kind: 'play'; trick: number; role: 'lead' | 'reply' }
  | { kind: 'raise-answer'; trick: number }

export interface NodeInterp {
  steps: HistoryStep[]
  stage: NodeStage
  /** classes (0-12) the node's player has already played or hidden */
  ownPlayed: number[]
  /** observed card-play codes in order (own plays keep their class) */
  plays: number[]
  /** seat that led trick 1, 2, … including the upcoming trick */
  trickLeaders: number[]
}

/** One step of an action line, its seat re-derived from the turn rules. */
export interface LineStep {
  code: number
  /** absolute seat that took this action */
  seat: number
  kind: 'eleven' | 'play' | 'raise' | 'raise-answer'
  /** 1-based trick number for card-turn actions, null for mão-de-onze */
  trick: number | null
}

export interface LineWalk {
  steps: LineStep[]
  /** the decision stage reached after the walked steps */
  stage: NodeStage
  /** seat that owns that decision; null once the hand has ended */
  toAct: number | null
  /** a fold (eleven or raise) ended the hand mid-line */
  folded: boolean
  /** seat that led trick 1, 2, … including the upcoming trick */
  trickLeaders: number[]
  /** card-play codes in table order (leads first), as each actor knows them */
  plays: number[]
}

/**
 * Walk an action line with the engine's turn rules. The line is in
 * actor-truth form: every card play keeps its class (face-down plays use
 * 13..=25), never the observer-side 26 — turn resolution treats both as
 * always-losing, so observed node histories walk identically.
 */
export function walkLine(line: readonly number[], ctx: BandContext): LineWalk {
  const steps: LineStep[] = []
  const plays: number[] = []
  const eleven = elevenOwner(ctx.score)
  let trick = 1
  let leader = 1 - ctx.dealer
  const trickLeaders = [leader]
  let cardTurn = leader
  let trickCodes: number[] = []
  let pendingRaiser: number | null = null
  let folded = false

  for (const code of line) {
    if (code === 33 || code === 34) {
      steps.push({ code, seat: eleven ?? cardTurn, kind: 'eleven', trick: null })
      if (code === 34) folded = true
      continue
    }
    if (code >= 27 && code <= 30) {
      // an opening raise is by the seat whose card turn it is; a re-raise
      // answers the pending raise, so it belongs to the other seat
      const by: number = pendingRaiser === null ? cardTurn : 1 - pendingRaiser
      steps.push({ code, seat: by, kind: pendingRaiser === null ? 'raise' : 'raise-answer', trick })
      pendingRaiser = by
      continue
    }
    if (code === 31 || code === 32) {
      const by = pendingRaiser === null ? 1 - cardTurn : 1 - pendingRaiser
      steps.push({ code, seat: by, kind: 'raise-answer', trick })
      if (code === 32) folded = true
      pendingRaiser = null
      continue
    }
    if (isCardPlay(code)) {
      steps.push({ code, seat: cardTurn, kind: 'play', trick })
      plays.push(code)
      trickCodes.push(code)
      if (trickCodes.length === 2) {
        const winner = resolveTrick(trickCodes[0], trickCodes[1])
        leader = winner === 'reply' ? 1 - leader : leader
        trickLeaders.push(leader)
        trick += 1
        trickCodes = []
        cardTurn = leader
      } else {
        cardTurn = 1 - cardTurn
      }
    }
  }

  let stage: NodeStage
  if (pendingRaiser !== null) {
    stage = { kind: 'raise-answer', trick }
  } else if (steps.length === 0 && eleven !== null) {
    stage = { kind: 'eleven' }
  } else {
    stage = { kind: 'play', trick, role: trickCodes.length === 0 ? 'lead' : 'reply' }
  }
  const toAct = folded
    ? null
    : stage.kind === 'eleven'
      ? eleven
      : stage.kind === 'raise-answer'
        ? 1 - (pendingRaiser as number)
        : cardTurn
  return { steps, stage, toAct, folded, trickLeaders, plays }
}

/**
 * The line as `viewer` observes it: the opponent's face-down plays collapse
 * to code 26, everything else (including the viewer's own face-down plays)
 * keeps its class — matching how node histories are keyed in the export.
 */
export function observedLine(steps: readonly LineStep[], viewer: number): number[] {
  return steps.map((s) =>
    s.seat !== viewer && s.code >= 13 && s.code <= 25 ? 26 : s.code,
  )
}

// ── Stake legality ───────────────────────────────────────────────────────────

/** whether this band's score forbids raising entirely: with a player at 11
 *  the engine fixes the stake (scoreTriggersElevenHand), so the truco ladder
 *  does not exist in mão-de-onze bands or at 11 × 11 */
export function bandForbidsRaises(score: [number, number]): boolean {
  return score[0] === 11 || score[1] === 11
}

/** step the (accepted stake, pending raise) pair over one action code;
 *  indices point into RAISE_TARGETS, -1 = the base stake */
function stepStake(state: { stakeIdx: number; pendingIdx: number | null }, code: number): void {
  if (code >= 27 && code <= 30) {
    state.pendingIdx = code - 27
  } else if (code === 31 && state.pendingIdx !== null) {
    state.stakeIdx = state.pendingIdx
    state.pendingIdx = null
  } else if (code === 32) {
    state.pendingIdx = null
  }
}

/**
 * The only stake-legal raise target after `line`, or null when raising is
 * impossible — the band forbids it (a player at 11) or the ladder is
 * exhausted. Mirrors the engine: an opening raise is truco (to 3), and every
 * raise climbs exactly one rung above the accepted or pending stake.
 */
export function nextLegalRaiseTarget(line: readonly number[], ctx: BandContext): number | null {
  if (bandForbidsRaises(ctx.score)) return null
  const state = { stakeIdx: -1, pendingIdx: null as number | null }
  for (const code of line) stepStake(state, code)
  const expected = (state.pendingIdx ?? state.stakeIdx) + 1
  return expected < RAISE_TARGETS.length ? RAISE_TARGETS[expected] : null
}

/**
 * Index of the first stake-illegal action in an actor-truth line, or
 * line.length when every action is legal. Used to truncate a kept line when
 * a band switch carries it somewhere its raises cannot exist.
 */
export function firstStakeIllegal(line: readonly number[], ctx: BandContext): number {
  const noRaises = bandForbidsRaises(ctx.score)
  const state = { stakeIdx: -1, pendingIdx: null as number | null }
  for (let i = 0; i < line.length; i += 1) {
    const code = line[i]
    if (code >= 27 && code <= 30) {
      if (noRaises) return i
      const expected = (state.pendingIdx ?? state.stakeIdx) + 1
      if (expected >= RAISE_TARGETS.length || code - 27 !== expected) return i
    }
    stepStake(state, code)
  }
  return line.length
}

/** bands with a mão-de-onze decision prefix their lines with the accept —
 *  translate a line's prefix so the card plays keep lining up across bands */
export function translateLineForBand(line: readonly number[], targetCtx: BandContext): number[] {
  const hasEleven = elevenOwner(targetCtx.score) !== null
  const startsEleven = line[0] === 33 || line[0] === 34
  if (hasEleven && !startsEleven && line.length > 0) return [33, ...line]
  if (!hasEleven && startsEleven) return line[0] === 34 ? [] : line.slice(1)
  return [...line]
}

export function interpretNode(node: ChartNode, ctx: BandContext): NodeInterp {
  const walk = walkLine(node.history, ctx)
  const steps: HistoryStep[] = walk.steps.map((s) => ({
    code: s.code,
    seat: s.kind === 'eleven' && elevenOwner(ctx.score) === null ? node.player : s.seat,
    own: (s.kind === 'eleven' && elevenOwner(ctx.score) === null ? node.player : s.seat) === node.player,
    kind: s.kind,
    trick: s.trick,
  }))
  const ownPlayed = steps
    .filter((s) => s.own && s.kind === 'play')
    .map((s) => (s.code >= 13 && s.code <= 25 ? s.code - 13 : s.code))
  return {
    steps,
    stage: walk.stage,
    ownPlayed,
    plays: walk.plays,
    trickLeaders: walk.trickLeaders,
  }
}

/** Hand after removing one instance of each played class, strongest first. */
export function remainingHand(hand: readonly number[], removed: readonly number[]): number[] {
  const rest = [...hand]
  for (const cls of removed) {
    const at = rest.indexOf(cls)
    if (at >= 0) rest.splice(at, 1)
  }
  return rest
}

// ── Chart axis pairs ─────────────────────────────────────────────────────────
//
// A three-card hand sorted strongest-first has slots H, M, L. A 2D chart can
// only show two of them; the pair picks which, and the third slot varies
// inside each cell.

export type ChartPair = 'HM' | 'HL' | 'ML'

export const PAIR_INDICES: Record<ChartPair, [number, number]> = {
  HM: [0, 1],
  HL: [0, 2],
  ML: [1, 2],
}

/** the hand slot that varies inside a cell under this pair */
export function pairHiddenSlot(pair: ChartPair): number {
  return pair === 'HM' ? 2 : pair === 'HL' ? 1 : 0
}

/** cell key of a remaining hand under a pair; 2-card hands have one pair */
export function pairKey(rem: readonly number[], pair: ChartPair): string {
  if (rem.length < 3) return `${rem[0]},${rem[1]}`
  const [i, j] = PAIR_INDICES[pair]
  return `${rem[i]},${rem[j]}`
}

// ── Hand drafts ──────────────────────────────────────────────────────────────
//
// A partially specified hand: slots strongest-first, null where the card is
// still unknown. Selecting a chart cell fills two slots, the varying-card
// list or a slot menu fills the rest, and walking the hand removes plays.

export type HandDraft = (number | null)[]

export function draftKnown(draft: HandDraft): number[] {
  return draft.filter((c): c is number => c !== null)
}

/**
 * Set one slot (null clears it) and re-sort the known cards so the display
 * stays strongest-first; null slots keep their positions.
 */
export function draftSetSlot(draft: HandDraft, idx: number, value: number | null): HandDraft {
  const next = [...draft]
  next[idx] = value
  const knownIdx = next.map((c, i) => (c !== null ? i : -1)).filter((i) => i >= 0)
  const values = knownIdx.map((i) => next[i] as number).sort((a, b) => b - a)
  knownIdx.forEach((slot, k) => {
    next[slot] = values[k]
  })
  return next
}

/**
 * Remove played cards from a draft. Known cards are removed by class; a play
 * with no matching known card consumes an order-compatible unknown slot.
 * Returns null when the plays cannot fit the draft.
 */
export function draftAfterPlays(draft: HandDraft, played: readonly number[]): HandDraft | null {
  let cur = [...draft]
  for (const c of played) {
    const at = cur.indexOf(c)
    if (at >= 0) {
      cur = [...cur.slice(0, at), ...cur.slice(at + 1)]
      continue
    }
    const nullAt = cur.findIndex((v, i) => {
      if (v !== null) return false
      const above = cur.slice(0, i).filter((x): x is number => x !== null)
      const below = cur.slice(i + 1).filter((x): x is number => x !== null)
      return (above.length === 0 || above[above.length - 1] >= c) && (below.length === 0 || below[0] <= c)
    })
    if (nullAt < 0) return null
    cur = [...cur.slice(0, nullAt), ...cur.slice(nullAt + 1)]
  }
  return cur
}

/** copies of a class in the deck: manilhas are suit-specific single cards */
export function classCopies(cls: number): number {
  return cls >= 9 ? 1 : 4
}

/** class of the vira's own rank — one copy of it sits face up on the table */
export function viraClassOf(tc: number): number {
  return classLabels(tc).indexOf(viraRank(tc))
}

/** subtract a draft's known slots from `left`; false when a copy runs out */
function chargeKnowns(draft: HandDraft, left: number[]): boolean {
  for (const c of draft) {
    if (c !== null && (left[c] -= 1) < 0) return false
  }
  return true
}

/** per-class play requirements not already covered by the draft's knowns */
function residualNeed(draft: HandDraft, mustContain: readonly number[]): number[] {
  const need: number[] = Array.from({ length: N_CLASSES }, () => 0)
  for (const c of mustContain) need[c] += 1
  for (const c of draft) if (c !== null && need[c] > 0) need[c] -= 1
  return need
}

/**
 * Exact search: can the draft's unknown slots be filled from `left`, keeping
 * the slots sorted strongest-first and covering `need`? `left` and `need`
 * are mutated during the search and restored on backtrack; when the fill
 * succeeds, `andThen` must also hold with the copies that remain (used to
 * chain a second hand over the same deck).
 */
function fillDraft(
  draft: HandDraft,
  left: number[],
  need: number[],
  andThen: () => boolean = () => true,
): boolean {
  let needLeft = need.reduce((a, b) => a + b, 0)
  const unknowns = draft.filter((c) => c === null).length
  if (needLeft > unknowns) return false
  for (let c = 0; c < N_CLASSES; c += 1) {
    if (need[c] > left[c]) return false
  }

  // lower bound of each slot: the nearest known slot below it
  const lows: number[] = Array.from({ length: draft.length }, () => 0)
  let lo = 0
  for (let i = draft.length - 1; i >= 0; i -= 1) {
    lows[i] = lo
    const c = draft[i]
    if (c !== null) lo = c
  }

  // the hand has at most three slots, so exact search stays tiny
  const fill = (i: number, hi: number): boolean => {
    if (i === draft.length) return needLeft === 0 && andThen()
    const c = draft[i]
    if (c !== null) return c <= hi && fill(i + 1, c)
    for (let v = Math.min(hi, N_CLASSES - 1); v >= lows[i]; v -= 1) {
      if (left[v] <= 0) continue
      left[v] -= 1
      const covers = need[v] > 0
      if (covers) {
        need[v] -= 1
        needLeft -= 1
      }
      if (fill(i + 1, v)) return true
      if (covers) {
        need[v] += 1
        needLeft += 1
      }
      left[v] += 1
    }
    return false
  }
  return fill(0, N_CLASSES - 1)
}

/**
 * Whether a draft can still be a real dealt hand: every known slot keeps a
 * deck copy, and every unknown slot finds a card that keeps the slots sorted
 * strongest-first (ties allowed). `avail` counts the copies of each class
 * still available to this hand — the deck minus the vira and any visible
 * plays — before the draft's own slots are subtracted. Classes listed in
 * `mustContain` (e.g. the owner's plays out of this hand) must fit inside
 * the completed hand as well.
 */
export function draftCompletable(
  draft: HandDraft,
  avail: (cls: number) => number,
  mustContain: readonly number[] = [],
): boolean {
  const left: number[] = []
  for (let c = 0; c < N_CLASSES; c += 1) left.push(avail(c))
  if (!chargeKnowns(draft, left)) return false
  return fillDraft(draft, left, residualNeed(draft, mustContain))
}

/**
 * Whether two drafts can be dealt simultaneously from one deck: both hands'
 * known slots and completions draw on the same `avail` copies, and each hand
 * must contain its own plays (`mustA`/`mustB`). The exact search runs over
 * at most six slots, so it stays tiny.
 */
export function draftsJointlyCompletable(
  a: HandDraft,
  b: HandDraft,
  avail: (cls: number) => number,
  mustA: readonly number[] = [],
  mustB: readonly number[] = [],
): boolean {
  const left: number[] = []
  for (let c = 0; c < N_CLASSES; c += 1) left.push(avail(c))
  if (!chargeKnowns(a, left) || !chargeKnowns(b, left)) return false
  const needB = residualNeed(b, mustB)
  return fillDraft(a, left, residualNeed(a, mustA), () => fillDraft(b, left, needB))
}

/** one card play of an actor-truth line, with the seat that made it */
export interface LinePlay {
  seat: number
  cls: number
  /** face-up: both seats can count it against the deck */
  open: boolean
}

/** the card plays of an actor-truth line, in table order */
export function linePlays(line: readonly number[], ctx: BandContext): LinePlay[] {
  const out: LinePlay[] = []
  for (const s of walkLine(line, ctx).steps) {
    if (s.kind !== 'play' || s.code === 26) continue
    out.push({ seat: s.seat, cls: s.code >= 13 ? s.code - 13 : s.code, open: s.code <= 12 })
  }
  return out
}

/**
 * Can `slots` really be `seat`'s dealt hand alongside this walked line?
 * The seat's own plays must come out of the slots in sorted order, and the
 * deck — minus the vira and the other seat's open plays — must still cover
 * the hand, played cards included. Hidden plays by the other seat stay
 * unattributed: this check only spends what the hand's owner can see.
 *
 * When the other seat's hand is drafted too, pass it as `otherSlots`: the
 * check then becomes joint — both hands share one deck with the vira, each
 * producing its own plays. The other seat's open plays come out of its own
 * slots there, so they are never charged twice. An `otherSlots` that itself
 * contradicts the line is ignored (its own check will drop it).
 */
export function draftFitsLine(
  slots: HandDraft,
  seat: number,
  line: readonly number[],
  ctx: BandContext,
  tc: number,
  otherSlots?: HandDraft,
): boolean {
  const plays = linePlays(line, ctx)
  const own = plays.filter((p) => p.seat === seat).map((p) => p.cls)
  if (draftAfterPlays(slots, own) === null) return false
  if (otherSlots) {
    const otherOwn = plays.filter((p) => p.seat !== seat).map((p) => p.cls)
    if (draftAfterPlays(otherSlots, otherOwn) !== null) {
      const avail = (cls: number) => classCopies(cls) - (cls === viraClassOf(tc) ? 1 : 0)
      return draftsJointlyCompletable(slots, otherSlots, avail, own, otherOwn)
    }
  }
  const used = new Map<number, number>([[viraClassOf(tc), 1]])
  for (const p of plays) {
    if (p.seat !== seat && p.open) used.set(p.cls, (used.get(p.cls) ?? 0) + 1)
  }
  return draftCompletable(slots, (cls) => classCopies(cls) - (used.get(cls) ?? 0), own)
}

/**
 * Copies of each class a drafted hand certainly holds beyond its owner's
 * open plays. Open plays come out of that hand, so a play and the known
 * slot it came from are one physical card: the certain per-class total is
 * max(known, openPlays), and this returns the surplus over the open plays —
 * the extra charge the OTHER seat's accounting must apply on top of them.
 */
export function draftChargeBeyondPlays(
  slots: HandDraft,
  openPlays: readonly number[],
): Map<number, number> {
  const known = new Map<number, number>()
  for (const c of slots) {
    if (c !== null) known.set(c, (known.get(c) ?? 0) + 1)
  }
  const out = new Map<number, number>()
  for (const [c, n] of known) {
    const open = openPlays.filter((x) => x === c).length
    if (n > open) out.set(c, n - open)
  }
  return out
}

/**
 * Deck copies of each class left for `seat` to hold, before spending their
 * own hand: the vira, every open play by the OTHER seat across `line`, and
 * the cards the other role's drafted hand certainly keeps beyond those
 * plays (`draftChargeBeyondPlays` — an open play already sits inside its
 * own drafted slots, so charging both would double count one physical
 * card). This is the pinned-hand panel's own copies-left accounting (F1),
 * generalized to an explicit seat/line so other callers — e.g. the
 * play-action list — can gate a specific card at a specific decision.
 */
export function copiesLeftForSeat(
  seat: number,
  line: readonly number[],
  ctx: BandContext,
  tc: number,
  otherDraft: HandDraft | undefined,
): (cls: number) => number {
  const used = new Map<number, number>()
  used.set(viraClassOf(tc), 1)
  const otherOpen: number[] = []
  for (const p of linePlays(line, ctx)) {
    if (p.seat !== seat && p.open) {
      used.set(p.cls, (used.get(p.cls) ?? 0) + 1)
      otherOpen.push(p.cls)
    }
  }
  if (otherDraft) {
    for (const [cls, n] of draftChargeBeyondPlays(otherDraft, otherOpen)) {
      used.set(cls, (used.get(cls) ?? 0) + n)
    }
  }
  return (cls: number) => classCopies(cls) - (used.get(cls) ?? 0)
}

/**
 * Whether `seat` could still legally hold and play a card of class `cls` at
 * this point in `line` — the deck-impossible-play gate for the play-action
 * list (plan 77 L-2): the range picker already greys a slot the deck can't
 * support (`draftFitsLine`/`draftCompletable`); this is the same accounting
 * applied to one action instead of one drafted slot.
 */
export function actionCardAvailable(
  cls: number,
  seat: number,
  line: readonly number[],
  ctx: BandContext,
  tc: number,
  otherDraft: HandDraft | undefined,
): boolean {
  return copiesLeftForSeat(seat, line, ctx, tc, otherDraft)(cls) > 0
}

/** whether a concrete remaining hand fits the draft's known slots */
export function draftMatchesHand(draft: HandDraft, rem: readonly number[]): boolean {
  if (draft.length !== rem.length) return false
  return draft.every((c, i) => c === null || c === rem[i])
}

/** insert already-played cards back into a remaining-hand draft, keeping sort */
export function draftWithPlays(draft: HandDraft, played: readonly number[]): HandDraft {
  let cur = [...draft]
  for (const c of [...played].sort((a, b) => b - a)) {
    // leftmost slot that keeps the known cards sorted strongest-first
    let at = 0
    for (let i = 0; i < cur.length; i += 1) {
      const v = cur[i]
      if (v !== null && v > c) at = i + 1
    }
    cur = [...cur.slice(0, at), c, ...cur.slice(at)]
  }
  return cur
}

/**
 * Reinsert played cards into a remaining-hand draft, choosing a placement the
 * walked line still accepts. `draftWithPlays` always slots a play in above
 * the unknown slots that follow it, which quietly caps those unknowns — e.g.
 * rem `[? 2]` after playing a 3 became `[3 ? 2]`, asserting the 3 was the
 * highest card even though the unknown could be a manilha played later. This
 * tries the plain placement first (stability), then every interleaving that
 * keeps the played cards and the rem slots in their own orders, and returns
 * the first full hand `draftFitsLine` accepts — or null when no placement
 * (hence no real hand) works.
 */
export function draftWithPlaysFitting(
  rem: HandDraft,
  played: readonly number[],
  seat: number,
  line: readonly number[],
  ctx: BandContext,
  tc: number,
  otherSlots?: HandDraft,
): HandDraft | null {
  const easy = draftWithPlays(rem, played)
  if (draftFitsLine(easy, seat, line, ctx, tc, otherSlots)) return easy
  const plays = [...played].sort((a, b) => b - a)
  const seen = new Set<string>()
  let found: HandDraft | null = null
  const merge = (i: number, j: number, acc: HandDraft): void => {
    if (found) return
    if (i === rem.length && j === plays.length) {
      const key = acc.join(',')
      if (seen.has(key)) return
      seen.add(key)
      const knowns = acc.filter((c): c is number => c !== null)
      const sorted = knowns.every((c, k) => k === 0 || knowns[k - 1] >= c)
      if (sorted && draftFitsLine(acc, seat, line, ctx, tc, otherSlots)) found = [...acc]
      return
    }
    if (i < rem.length) {
      acc.push(rem[i])
      merge(i + 1, j, acc)
      acc.pop()
    }
    if (j < plays.length) {
      acc.push(plays[j])
      merge(i, j + 1, acc)
      acc.pop()
    }
  }
  merge(0, 0, [])
  return found
}

/**
 * Hand-relative action roles so one color legend spans every cell of a
 * chart. Card plays are named by which slot of the sorted hand they use.
 */
export type ActionRole =
  | 'accept'
  | 'fold'
  | 'raise'
  | 'play-high'
  | 'play-mid'
  | 'play-low'
  | 'hide-high'
  | 'hide-mid'
  | 'hide-low'

/** Slot names by hand size: a two-card hand has no middle. */
function cardSlots(len: number): Array<'high' | 'mid' | 'low'> {
  if (len >= 3) return ['high', 'mid', 'low']
  if (len === 2) return ['high', 'low']
  return ['high']
}

export function actionRole(code: number, hand: readonly number[]): ActionRole {
  if (code === 33 || code === 31) return 'accept'
  if (code === 34 || code === 32) return 'fold'
  if (code >= 27 && code <= 30) return 'raise'
  const faceDown = code >= 13 && code <= 25
  const cls = faceDown ? code - 13 : code
  // hand is sorted strongest-first; duplicates take the first free slot,
  // which is safe because equal classes are strategically identical.
  const slot = cardSlots(hand.length)[hand.findIndex((h) => h === cls)] ?? 'low'
  return `${faceDown ? 'hide' : 'play'}-${slot}` as ActionRole
}

/**
 * Canonical display order: card plays strongest-first, then bids, accept
 * before fold — so mixes always read high → middle → low, green → gold → red.
 */
export const ROLE_ORDER: ActionRole[] = [
  'play-high',
  'hide-high',
  'play-mid',
  'hide-mid',
  'play-low',
  'hide-low',
  'accept',
  'raise',
  'fold',
]

export function roleOrder(role: ActionRole): number {
  return ROLE_ORDER.indexOf(role)
}

export const ROLE_TEXT: Record<ActionRole, string> = {
  accept: 'accept',
  fold: 'fold',
  raise: 'raise',
  'play-high': 'play highest',
  'play-mid': 'play middle',
  'play-low': 'play lowest',
  'hide-high': 'hide highest',
  'hide-mid': 'hide middle',
  'hide-low': 'hide lowest',
}

/**
 * Wording for a role inside one (row, col) cell. With 'cards' notation the
 * two charted slots name the actual card; the varying slot falls back to the
 * generic slot wording — unless the cell is exact (two remaining cards from
 * trick 2 on), where both slots are on the axes.
 */
export function roleActionText(
  role: ActionRole,
  notation: ActionNotation,
  labels: string[],
  rowCls: number,
  colCls: number,
  exact = false,
  pair: ChartPair = 'HM',
): string {
  if (notation === 'roles' || role === 'accept' || role === 'fold' || role === 'raise') {
    return ROLE_TEXT[role]
  }
  const verb = role.startsWith('hide') ? 'hide' : 'play'
  if (exact) {
    return role.endsWith('high') ? `${verb} ${labels[rowCls]}` : `${verb} ${labels[colCls]}`
  }
  const slot = role.endsWith('high') ? 0 : role.endsWith('mid') ? 1 : 2
  const [i, j] = PAIR_INDICES[pair]
  if (slot === i) return `${verb} ${labels[rowCls]}`
  if (slot === j) return `${verb} ${labels[colCls]}`
  return `${verb} the other card`
}

export function actionLabel(code: number, labels: string[]): string {
  if (code === 33) return 'Accept mão de onze'
  if (code === 34) return 'Fold mão de onze'
  if (code === 31) return 'Accept raise'
  if (code === 32) return 'Fold'
  if (code === 26) return 'Hidden card'
  if (code >= 27 && code <= 30) return `Raise to ${[3, 6, 9, 12][code - 27]}`
  if (code >= 13 && code <= 25) return `Play ${labels[code - 13]} face down`
  return `Play ${labels[code]}`
}

/** Short label for one observed history step (for breadcrumbs). */
export function historyStepLabel(code: number, labels: string[]): string {
  if (code === 33) return 'accept'
  if (code === 34) return 'fold'
  if (code === 26) return 'hidden'
  if (code >= 27 && code <= 30) return `truco ${[3, 6, 9, 12][code - 27]}`
  if (code >= 13 && code <= 25) return `${labels[code - 13]}↓`
  if (code === 31) return 'accept'
  if (code === 32) return 'fold'
  return labels[code]
}

export interface CellAgg {
  /** reach-weighted probability by role */
  mix: Map<ActionRole, number>
  /** reach-weighted Q (match ±1 space) by role */
  q: Map<ActionRole, number>
  /** reach-weighted expected hand points by role */
  pts: Map<ActionRole, number>
  weight: number
  nHands: number
  /** max over hands of total-variation distance to the cell-average mix */
  spread: number
}

export interface HandDetail {
  hand: [number, number, number]
  w: number
  mix: Map<ActionRole, number>
  q: Map<ActionRole, number>
}

export interface AggregateOptions {
  showRawResidue?: boolean
  /** which two hand slots the chart axes show (3-card nodes only) */
  pair?: ChartPair
}

export interface DisplayAction {
  action: ChartAction
  p: number
  role: ActionRole
}

function exportedOrRawProbability(action: ChartAction, showRawResidue: boolean): number {
  return showRawResidue ? (action.raw_p ?? action.p) : action.p
}

function displayRowProbabilities(row: ChartRow, showRawResidue: boolean): number[] {
  const source = row.actions.map((action) => exportedOrRawProbability(action, showRawResidue))
  // Raw residue is diagnostic: show raw_p directly and bypass the UI-only
  // readability suppression below.
  if (showRawResidue || row.actions.length === 0) return source

  const maxQ = Math.max(...row.actions.map((action) => action.q))
  const displayed = row.actions.map((action, idx) => {
    const p = source[idx]
    const qGapPP = Math.max(0, maxQ - action.q) * 50
    return p < DISPLAY_SUPPRESS_MAX_PROB && qGapPP > DISPLAY_SUPPRESS_MIN_Q_GAP_PP ? 0 : p
  })
  const total = displayed.reduce((sum, p) => sum + p, 0)
  if (total <= 0) return source
  return displayed.map((p) => p / total)
}

export function displayActionsForRow(
  row: ChartRow,
  removed: readonly number[] = [],
  options: AggregateOptions = {},
): DisplayAction[] {
  const rem = removed.length ? remainingHand(row.hand, removed) : row.hand
  const probs = displayRowProbabilities(row, options.showRawResidue ?? false)
  return row.actions.map((action, idx) => ({
    action,
    p: probs[idx],
    role: actionRole(action.c, rem),
  }))
}

/**
 * Aggregate a node's rows into (h1, h2) cells. From trick 2 on, pass the
 * classes the node's player already played (`removed`): cells are then keyed
 * by the two *remaining* cards and roles are relative to the remaining hand,
 * which makes the grid exact — one starting hand per cell.
 */
export function aggregateCells(
  node: ChartNode,
  removed: readonly number[] = [],
  options: AggregateOptions = {},
): Map<string, CellAgg> {
  const byCell = new Map<string, ChartRow[]>()
  const pair = options.pair ?? 'HM'
  for (const row of node.rows) {
    const rem = removed.length ? remainingHand(row.hand, removed) : row.hand
    const key = pairKey(rem, pair)
    const bucket = byCell.get(key)
    if (bucket) bucket.push(row)
    else byCell.set(key, [row])
  }

  const cells = new Map<string, CellAgg>()
  for (const [key, rows] of byCell) {
    cells.set(key, aggregateRows(rows, removed, options))
  }
  return cells
}

/** Reach-weighted aggregate of an arbitrary set of rows (one pseudo-cell). */
export function aggregateRows(
  rows: readonly ChartRow[],
  removed: readonly number[] = [],
  options: AggregateOptions = {},
): CellAgg {
  const mix = new Map<ActionRole, number>()
  const q = new Map<ActionRole, number>()
  const pts = new Map<ActionRole, number>()
  const qw = new Map<ActionRole, number>()
  let weight = 0
  for (const row of rows) {
    weight += row.w
    const displayActions = displayActionsForRow(row, removed, options)
    for (const { action, p, role } of displayActions) {
      if (p > 0) mix.set(role, (mix.get(role) ?? 0) + p * row.w)
      q.set(role, (q.get(role) ?? 0) + action.q * row.w)
      pts.set(role, (pts.get(role) ?? 0) + (action.pts ?? 0) * row.w)
      qw.set(role, (qw.get(role) ?? 0) + row.w)
    }
  }
  const total = weight || 1
  for (const [role, v] of mix) mix.set(role, v / total)
  for (const [role, v] of q) q.set(role, v / (qw.get(role) ?? 1))
  for (const [role, v] of pts) pts.set(role, v / (qw.get(role) ?? 1))

  let spread = 0
  for (const row of rows) {
    const rowMix = rowRoleMix(row, removed, options)
    let tv = 0
    for (const [role, p] of rowMix) tv += Math.abs(p - (mix.get(role) ?? 0))
    for (const [role, p] of mix) if (!rowMix.has(role)) tv += p
    spread = Math.max(spread, tv / 2)
  }
  return { mix, q, pts, weight, nHands: rows.length, spread }
}

export function rowRoleMix(
  row: ChartRow,
  removed: readonly number[] = [],
  options: AggregateOptions = {},
): Map<ActionRole, number> {
  const mix = new Map<ActionRole, number>()
  for (const { p, role } of displayActionsForRow(row, removed, options)) {
    if (p > 0) mix.set(role, (mix.get(role) ?? 0) + p)
  }
  return mix
}

/** Total-variation distance between two role mixes, in [0, 1]. */
export function tvDistance(
  a: Map<ActionRole, number>,
  b: Map<ActionRole, number>,
): number {
  const roles = new Set([...a.keys(), ...b.keys()])
  let sum = 0
  for (const role of roles) sum += Math.abs((a.get(role) ?? 0) - (b.get(role) ?? 0))
  return sum / 2
}

/**
 * How much the exported mix loses against its own best action, in match-win
 * pp. Trained infosets sit near zero by construction (certification bounds
 * this per infoset); a large value means CFR barely visited the node and the
 * mix is untrained noise — the study lab flags those rather than chart them.
 */
export function rowSelfLossPP(row: ChartRow): number {
  if (row.actions.length === 0) return 0
  const maxQ = Math.max(...row.actions.map((a) => a.q))
  let loss = 0
  for (const a of row.actions) loss += a.p * (maxQ - a.q)
  return loss * 50
}

/**
 * Match-equity percentage points between the best and the worst available
 * action — what a maximally wrong habit costs in this cell.
 */
export function evLossWorstPP(cell: CellAgg): number {
  let best = -Infinity
  let worst = Infinity
  for (const q of cell.q.values()) {
    best = Math.max(best, q)
    worst = Math.min(worst, q)
  }
  if (!Number.isFinite(best) || !Number.isFinite(worst)) return 0
  return Math.max(0, (best - worst) * 50)
}

/**
 * Match-equity percentage points lost by always playing the most-played
 * role instead of the best one — the trainer "EV left on the table" number.
 */
export function evLossPP(cell: CellAgg): number {
  let modal: ActionRole | null = null
  let modalP = -1
  for (const [role, p] of cell.mix) {
    if (p > modalP) {
      modal = role
      modalP = p
    }
  }
  if (modal === null) return 0
  let best = -Infinity
  for (const q of cell.q.values()) best = Math.max(best, q)
  return Math.max(0, (best - (cell.q.get(modal) ?? best)) * 50)
}

/** Role name of an absolute seat under this band's dealer assignment. */
export function seatRole(seat: number, ctx: BandContext): 'mão' | 'pé' {
  return seat === ctx.dealer ? 'pé' : 'mão'
}

export interface ActionOption {
  code: number
  /** reach-weighted equilibrium frequency of this action across all hands */
  p: number
}

/**
 * Every action the node's player has at this decision, with its population
 * frequency: the reach-weighted average of the displayed probability over
 * all hands. Zero-frequency actions are kept so the UI can show them dimmed.
 */
export function nodeActionOptions(
  node: ChartNode,
  options: AggregateOptions = {},
): ActionOption[] {
  const weights = new Map<number, number>()
  let total = 0
  for (const row of node.rows) {
    total += row.w
    for (const { action, p } of displayActionsForRow(row, [], options)) {
      weights.set(action.c, (weights.get(action.c) ?? 0) + Math.max(p, 0) * row.w)
    }
  }
  return [...weights.entries()].map(([code, w]) => ({ code, p: total ? w / total : 0 }))
}

export function nodeTitle(node: ChartNode, labels: string[]): string {
  if (node.history.length === 0) return 'Mão de onze — accept or fold'
  const steps = node.history.map((c) => historyStepLabel(c, labels))
  if (node.history.length === 1 && node.history[0] === 33) {
    return 'Opening lead — after the accept'
  }
  return `After ${steps.join(' · ')}`
}

/**
 * Stage-aware node title: names the decision by its place in the hand
 * (trick and lead/reply) instead of by raw history depth, which also fixes
 * bands without an eleven decision (11×11) where depth ≠ stage.
 */
export function stageTitle(node: ChartNode, labels: string[], ctx: BandContext): string {
  const interp = interpretNode(node, ctx)
  const { stage } = interp
  if (stage.kind === 'eleven') return 'Mão de onze — accept or fold'
  if (stage.kind === 'raise-answer') {
    return `Raise pending — trick ${stage.trick}`
  }
  const t1 = interp.plays.slice(0, 2).map((c) => historyStepLabel(c, labels))
  if (stage.trick === 1) {
    if (stage.role === 'lead') {
      return elevenOwner(ctx.score) !== null ? 'Opening lead — after the accept' : 'Opening lead'
    }
    return `Reply to a ${t1[0]} lead`
  }
  const recap = `${t1[0]} vs ${t1[1]}`
  const outcome = resolveTrick(interp.plays[0], interp.plays[1])
  const outcomeText = outcome === 'tie' ? 'tied' : outcome === 'lead' ? 'leader won' : 'replier won'
  if (stage.role === 'lead') {
    return `Trick-${stage.trick} lead — after ${recap} (${outcomeText})`
  }
  const t2 = interp.plays[2] !== undefined ? historyStepLabel(interp.plays[2], labels) : '?'
  return `Trick-${stage.trick} reply to ${t2} — after ${recap}`
}

export function friendlyStageTitle(node: ChartNode, labels: string[], ctx: BandContext): string {
  const interp = interpretNode(node, ctx)
  const { stage } = interp
  if (stage.kind === 'eleven') return 'Mão de onze: accept or fold'
  if (stage.kind === 'raise-answer') return `Answer the raise before round ${stage.trick}`

  const first = interp.plays[0] !== undefined ? historyStepLabel(interp.plays[0], labels) : '?'
  const second = interp.plays[1] !== undefined ? historyStepLabel(interp.plays[1], labels) : '?'
  if (stage.trick === 1) {
    if (stage.role === 'lead') {
      return elevenOwner(ctx.score) !== null
        ? 'Round 1: choose first card after accept'
        : 'Round 1: choose first card'
    }
    return `Round 1: answer ${first}`
  }

  const recap = `${first} / ${second}`
  if (stage.role === 'lead') return `Round ${stage.trick}: choose first card after ${recap}`
  const next = interp.plays[2] !== undefined ? historyStepLabel(interp.plays[2], labels) : '?'
  return `Round ${stage.trick}: answer ${next} after ${recap}`
}
