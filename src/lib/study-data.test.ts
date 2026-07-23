import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  actionCardAvailable,
  actionLabel,
  actionRole,
  aggregateCells,
  aggregateRows,
  bandForbidsRaises,
  classCopies,
  firstStakeIllegal,
  nextLegalRaiseTarget,
  translateLineForBand,
  classInfos,
  draftAfterPlays,
  draftChargeBeyondPlays,
  draftCompletable,
  draftFitsLine,
  draftsJointlyCompletable,
  draftMatchesHand,
  draftSetSlot,
  draftWithPlays,
  draftWithPlaysFitting,
  classLabels,
  linePlays,
  viraClassOf,
  displayActionsForRow,
  elevenOwner,
  evLossPP,
  evLossWorstPP,
  rowSelfLossPP,
  friendlyStageTitle,
  historyStepLabel,
  interpretNode,
  jointRowWeight,
  nodeJointMass,
  nodeActionOptions,
  nodeTitle,
  observedLine,
  parseBrGapTable,
  pairHiddenSlot,
  pairKey,
  remainingHand,
  resolveTrick,
  roleActionText,
  rootDealWeights,
  seatRole,
  stageTitle,
  tvDistance,
  viraRank,
  viraRanks,
  walkLine,
  type BandContext,
  type ChartNode,
  type ChartRow,
} from './study-data.ts'

/** shorthand: a rowless node for history-machine tests */
function bareNode(history: number[], player: number, is_dealer: boolean): ChartNode {
  return { history, player, is_dealer, rows: [] }
}

const ELEVEN_CTX: BandContext = { dealer: 0, score: [11, 9] }
const BOTH_ELEVEN_CTX: BandContext = { dealer: 0, score: [11, 11] }

test('parseBrGapTable: reads the compact solver artifact and rejects the wrong spot', () => {
  const bytes = new ArrayBuffer(48 + 20)
  const view = new DataView(bytes)
  view.setUint32(0, 0x4252_4741, true)
  view.setUint32(4, 0x5452_5543, true)
  view.setUint32(8, 1, true)
  view.setUint32(16, 123, true) // band signature is validated by Rust; browser checks the spot
  view.setUint32(24, 1, true)
  view.setUint32(32, (11 << 8) | 10, true)
  view.setUint32(40, 1, true) // tc0, dealer1
  view.setUint32(48, 42, true)
  view.setFloat32(52, 0.4, true)
  view.setFloat32(56, 0.3, true)
  view.setFloat32(60, 0.1, true)
  view.setFloat32(64, 0.2, true)

  const records = parseBrGapTable(bytes, { score: [11, 10], tc: 0, dealer: 1 })
  assert.ok(Math.abs((records.get(42)?.gap ?? 0) - 0.1) < 1e-6)
  assert.throws(() => parseBrGapTable(bytes, { score: [11, 10], tc: 0, dealer: 0 }), /different Study spot/)
})

test('classLabels: vira 4 (tc0) removes the 5s from the plain ladder', () => {
  const labels = classLabels(0)
  assert.deepEqual(labels.slice(0, 9), ['4', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'])
  assert.deepEqual(labels.slice(9), ['5♦', '5♠', '5♥', '5♣'])
  assert.equal(viraRank(0), '4')
})

test('classLabels: every tc yields 13 labels and a coherent manilha rank', () => {
  for (let tc = 0; tc <= 8; tc += 1) {
    const labels = classLabels(tc)
    assert.equal(labels.length, 13)
    // the four manilha labels share one rank and carry suit glyphs
    const manilhaRanks = new Set(labels.slice(9).map((l) => l.slice(0, -1)))
    assert.equal(manilhaRanks.size, 1)
  }
  // tc8: vira 2 -> manilha 3 (wraps nothing, blocks level 8)
  assert.equal(viraRank(8), '2')
})

test('tc8 renders losslessly as either vira 2 or vira 3', () => {
  assert.deepEqual(viraRanks(8), ['2', '3'])
  assert.deepEqual(classLabels(8, '2'), [
    '4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2',
    '3♦', '3♠', '3♥', '3♣',
  ])
  assert.deepEqual(classLabels(8, '3'), [
    '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3',
    '4♦', '4♠', '4♥', '4♣',
  ])
  assert.throws(() => classLabels(8, '4'), /does not produce/)
})

test('classInfos: cards notation names manilhas by real rank, classes by M', () => {
  const cards = classInfos(0, 'cards')
  assert.deepEqual(cards[12], { label: '5♣', rank: '5', suit: '♣' })
  assert.deepEqual(cards[9], { label: '5♦', rank: '5', suit: '♦' })
  assert.deepEqual(cards[8], { label: '3', rank: '3', suit: null })
  const classes = classInfos(0, 'classes')
  assert.deepEqual(classes[12], { label: 'M♣', rank: 'M', suit: '♣' })
  assert.deepEqual(classes[8], { label: '3', rank: '3', suit: null })
  // labels stay in sync with the string helper
  assert.deepEqual(classLabels(0), cards.map((c) => c.label))
})

test('roleActionText: cards notation names the charted cards per axis pair', () => {
  const labels = classLabels(0)
  // cell (row=12, col=8) under vira 4: 5♣ and a plain 3, default H·M axes
  assert.equal(roleActionText('play-high', 'cards', labels, 12, 8), 'play 5♣')
  assert.equal(roleActionText('hide-mid', 'cards', labels, 12, 8), 'hide 3')
  assert.equal(roleActionText('play-low', 'cards', labels, 12, 8), 'play the other card')
  assert.equal(roleActionText('accept', 'cards', labels, 12, 8), 'accept')
  assert.equal(roleActionText('raise', 'cards', labels, 12, 8), 'raise')
  assert.equal(roleActionText('play-high', 'roles', labels, 12, 8), 'play highest')
  assert.equal(roleActionText('hide-low', 'roles', labels, 12, 8), 'hide lowest')
  // H·L axes: the middle card is the varying one
  assert.equal(roleActionText('play-high', 'cards', labels, 12, 8, false, 'HL'), 'play 5♣')
  assert.equal(roleActionText('play-low', 'cards', labels, 12, 8, false, 'HL'), 'play 3')
  assert.equal(roleActionText('play-mid', 'cards', labels, 12, 8, false, 'HL'), 'play the other card')
  // M·L axes: the highest card is the varying one
  assert.equal(roleActionText('play-mid', 'cards', labels, 8, 3, false, 'ML'), 'play 3')
  assert.equal(roleActionText('play-low', 'cards', labels, 8, 3, false, 'ML'), 'play Q')
  assert.equal(roleActionText('play-high', 'cards', labels, 8, 3, false, 'ML'), 'play the other card')
})

test('pairKey and pairHiddenSlot: axis pairs address hand slots', () => {
  assert.equal(pairKey([8, 5, 2], 'HM'), '8,5')
  assert.equal(pairKey([8, 5, 2], 'HL'), '8,2')
  assert.equal(pairKey([8, 5, 2], 'ML'), '5,2')
  // 2-card hands only have one pair
  assert.equal(pairKey([8, 2], 'ML'), '8,2')
  assert.equal(pairHiddenSlot('HM'), 2)
  assert.equal(pairHiddenSlot('HL'), 1)
  assert.equal(pairHiddenSlot('ML'), 0)
})

test('aggregateCells: pair option keys cells by the chosen slots', () => {
  const rows: ChartRow[] = [
    { hand: [8, 5, 2], w: 1, actions: [{ c: 8, p: 1, q: 0.2 }] },
    { hand: [8, 4, 2], w: 1, actions: [{ c: 8, p: 1, q: 0.2 }] },
  ]
  const node: ChartNode = { history: [33], player: 1, is_dealer: false, rows }
  // H·L: both hands share highest 8 and lowest 2 — one cell of two hands
  const hl = aggregateCells(node, [], { pair: 'HL' })
  assert.equal(hl.get('8,2')?.nHands, 2)
  // H·M: they split into two cells
  const hm = aggregateCells(node, [], { pair: 'HM' })
  assert.equal(hm.get('8,5')?.nHands, 1)
  assert.equal(hm.get('8,4')?.nHands, 1)
})

test('actionRole: card plays resolve to sorted-hand slots', () => {
  const hand: [number, number, number] = [8, 3, 0]
  assert.equal(actionRole(8, hand), 'play-high')
  assert.equal(actionRole(3, hand), 'play-mid')
  assert.equal(actionRole(0, hand), 'play-low')
  assert.equal(actionRole(13 + 3, hand), 'hide-mid')
  assert.equal(actionRole(33, hand), 'accept')
  assert.equal(actionRole(34, hand), 'fold')
  assert.equal(actionRole(28, hand), 'raise')
})

test('actionRole: duplicate classes fall to the first matching slot', () => {
  const hand: [number, number, number] = [5, 5, 1]
  assert.equal(actionRole(5, hand), 'play-high')
  assert.equal(actionRole(1, hand), 'play-low')
})

test('aggregateCells: reach-weighted mix and third-card spread', () => {
  const rows: ChartRow[] = [
    // same (h1,h2), different h3: one pure accept, one pure fold, equal reach
    { hand: [8, 4, 2], w: 1, actions: [{ c: 33, p: 1, q: 0.5 }, { c: 34, p: 0, q: 0.1 }] },
    { hand: [8, 4, 0], w: 1, actions: [{ c: 33, p: 0, q: -0.5 }, { c: 34, p: 1, q: 0.1 }] },
  ]
  const node: ChartNode = { history: [], player: 0, is_dealer: true, rows }
  const cells = aggregateCells(node)
  const cell = cells.get('8,4')
  assert.ok(cell)
  assert.ok(Math.abs((cell.mix.get('accept') ?? 0) - 0.5) < 1e-12)
  assert.ok(Math.abs((cell.mix.get('fold') ?? 0) - 0.5) < 1e-12)
  // each hand is TV distance 0.5 from the 50/50 average
  assert.ok(Math.abs(cell.spread - 0.5) < 1e-12)
  assert.equal(cell.nHands, 2)
})

test('aggregateCells: display suppression hides tiny dominated residue and renormalizes', () => {
  const rows: ChartRow[] = [
    {
      hand: [8, 4, 2],
      w: 1,
      actions: [
        { c: 33, p: 0.998, raw_p: 0.998, q: 0.4 },
        { c: 34, p: 0.002, raw_p: 0.002, q: 0.0 },
      ],
    },
  ]
  const node: ChartNode = { history: [], player: 0, is_dealer: true, rows }
  const displayed = aggregateCells(node).get('8,4')
  assert.ok(displayed)
  assert.equal(displayed.mix.get('accept'), 1)
  assert.equal(displayed.mix.has('fold'), false)

  const raw = aggregateCells(node, [], { showRawResidue: true }).get('8,4')
  assert.ok(raw)
  assert.ok(Math.abs((raw.mix.get('accept') ?? 0) - 0.998) < 1e-12)
  assert.ok(Math.abs((raw.mix.get('fold') ?? 0) - 0.002) < 1e-12)
})

test('aggregateCells: display suppression leaves tiny near-indifferent mixes untouched', () => {
  const rows: ChartRow[] = [
    {
      hand: [8, 4, 2],
      w: 1,
      actions: [
        { c: 33, p: 0.998, q: 0.4 },
        { c: 34, p: 0.002, q: 0.385 },
      ],
    },
  ]
  const node: ChartNode = { history: [], player: 0, is_dealer: true, rows }
  const cell = aggregateCells(node).get('8,4')
  assert.ok(cell)
  assert.ok(Math.abs((cell.mix.get('accept') ?? 0) - 0.998) < 1e-12)
  assert.ok(Math.abs((cell.mix.get('fold') ?? 0) - 0.002) < 1e-12)
})

test('displayActionsForRow: default display reads exported p instead of raw_p', () => {
  const row: ChartRow = {
    hand: [8, 4, 2],
    w: 1,
    actions: [
      { c: 33, p: 0.6, raw_p: 0.99, q: 0.4 },
      { c: 34, p: 0.4, raw_p: 0.01, q: 0.39 },
    ],
  }
  const shown = displayActionsForRow(row)
  assert.deepEqual(shown.map((a) => a.p), [0.6, 0.4])
})

test('displayActionsForRow: raw residue reads raw_p and bypasses display suppression', () => {
  const row: ChartRow = {
    hand: [8, 4, 2],
    w: 1,
    actions: [
      { c: 33, p: 1, raw_p: 0.998, q: 0.4 },
      { c: 34, p: 0, raw_p: 0.002, q: 0.0 },
    ],
  }
  const shown = displayActionsForRow(row)
  assert.deepEqual(shown.map((a) => a.p), [1, 0])
  const raw = displayActionsForRow(row, [], { showRawResidue: true })
  assert.deepEqual(raw.map((a) => a.p), [0.998, 0.002])
})

test('rowSelfLossPP: a mix that plays dominated actions indicts itself', () => {
  const trained: ChartRow = {
    hand: [8, 4, 2],
    w: 1,
    actions: [{ c: 8, p: 1, q: 0.5 }, { c: 4, p: 0, q: -0.5 }],
  }
  assert.ok(rowSelfLossPP(trained) < 1e-9)
  const garbage: ChartRow = {
    hand: [11, 10, 0],
    w: 1e-6,
    actions: [
      { c: 10, p: 0.29, q: 0.815 },
      { c: 23, p: 0.21, q: -1 },
      { c: 11, p: 0.29, q: 0.815 },
      { c: 24, p: 0.21, q: -1 },
    ],
  }
  assert.ok(rowSelfLossPP(garbage) > 30)
})

test('evLossWorstPP: spread between best and worst available action', () => {
  const rows: ChartRow[] = [
    { hand: [8, 4, 2], w: 1, actions: [{ c: 33, p: 0.5, q: 0.2 }, { c: 34, p: 0.5, q: -0.2 }] },
  ]
  const cell = aggregateCells({ history: [], player: 0, is_dealer: true, rows }).get('8,4')
  assert.ok(cell)
  assert.ok(Math.abs(evLossWorstPP(cell) - 20) < 1e-9)
})

test('evLossPP: cost of the modal action vs the best action', () => {
  const rows: ChartRow[] = [
    // folds 100% but accepting is worth +0.2 vs +0.0 -> 10pp loss
    { hand: [8, 4, 2], w: 1, actions: [{ c: 33, p: 0, q: 0.2 }, { c: 34, p: 1, q: 0 }] },
  ]
  const cells = aggregateCells({ history: [], player: 0, is_dealer: true, rows })
  const cell = cells.get('8,4')
  assert.ok(cell)
  assert.ok(Math.abs(evLossPP(cell) - 10) < 1e-9)
})

test('tvDistance: disjoint mixes are distance 1, equal mixes 0', () => {
  const a = new Map([['accept' as const, 1]])
  const b = new Map([['fold' as const, 1]])
  assert.equal(tvDistance(a, b), 1)
  assert.equal(tvDistance(a, a), 0)
})

test('resolveTrick: strength decides, hidden always loses, equals tie', () => {
  assert.equal(resolveTrick(5, 8), 'reply')
  assert.equal(resolveTrick(8, 5), 'lead')
  assert.equal(resolveTrick(5, 5), 'tie')
  assert.equal(resolveTrick(0, 26), 'lead') // hidden reply loses to anything
  assert.equal(resolveTrick(25, 26), 'tie') // hidden vs hidden ties
})

test('elevenOwner: exactly-one-side-at-11 owns the decision', () => {
  assert.equal(elevenOwner([11, 9]), 0)
  assert.equal(elevenOwner([4, 11]), 1)
  assert.equal(elevenOwner([11, 11]), null)
  assert.equal(elevenOwner([8, 4]), null)
})

test('interpretNode: eleven-band trick-1 nodes classify as before', () => {
  // the eleven decision at the empty history
  const decision = interpretNode(bareNode([], 0, true), ELEVEN_CTX)
  assert.deepEqual(decision.stage, { kind: 'eleven' })
  // mão's opening lead after the accept
  const lead = interpretNode(bareNode([33], 1, false), ELEVEN_CTX)
  assert.deepEqual(lead.stage, { kind: 'play', trick: 1, role: 'lead' })
  assert.equal(lead.steps[0].own, false) // the accept was the pé's
  // pé replying to a lead of class 5
  const reply = interpretNode(bareNode([33, 5], 0, true), ELEVEN_CTX)
  assert.deepEqual(reply.stage, { kind: 'play', trick: 1, role: 'reply' })
  assert.deepEqual(reply.plays, [5])
  assert.deepEqual(reply.ownPlayed, [])
  assert.equal(reply.steps[1].own, false)
})

test('interpretNode: trick-2 lead goes to the winner, ties keep the leader', () => {
  // replier (pé, seat 0) won trick 1 with 8 over 5 and leads trick 2
  const won = interpretNode(bareNode([33, 5, 8], 0, true), ELEVEN_CTX)
  assert.deepEqual(won.stage, { kind: 'play', trick: 2, role: 'lead' })
  assert.deepEqual(won.trickLeaders, [1, 0])
  assert.deepEqual(won.ownPlayed, [8]) // pé's own reply
  assert.deepEqual(won.steps.map((s) => s.own), [true, false, true])
  // tied trick: mão led 5, pé replied 5 — mão leads again
  const tie = interpretNode(bareNode([33, 5, 5], 1, false), ELEVEN_CTX)
  assert.deepEqual(tie.stage, { kind: 'play', trick: 2, role: 'lead' })
  assert.deepEqual(tie.trickLeaders, [1, 1])
  assert.deepEqual(tie.ownPlayed, [5]) // mão's own lead
  // hidden reply loses: mão keeps the lead and knows only "hidden"
  const hid = interpretNode(bareNode([33, 5, 26], 1, false), ELEVEN_CTX)
  assert.deepEqual(hid.stage, { kind: 'play', trick: 2, role: 'lead' })
  assert.deepEqual(hid.trickLeaders, [1, 1])
})

test('interpretNode: trick-2 reply sees the winner lead, possibly hidden', () => {
  // pé won trick 1, led trick 2 face down; mão observes 26 and replies
  const n = interpretNode(bareNode([33, 5, 8, 26], 1, false), ELEVEN_CTX)
  assert.deepEqual(n.stage, { kind: 'play', trick: 2, role: 'reply' })
  assert.deepEqual(n.plays, [5, 8, 26])
  assert.deepEqual(n.ownPlayed, [5])
  assert.equal(n.steps[3].own, false)
})

test('interpretNode: 11x11 band has no eleven step and stages shift', () => {
  const lead = interpretNode(bareNode([], 1, false), BOTH_ELEVEN_CTX)
  assert.deepEqual(lead.stage, { kind: 'play', trick: 1, role: 'lead' })
  const reply = interpretNode(bareNode([0], 0, true), BOTH_ELEVEN_CTX)
  assert.deepEqual(reply.stage, { kind: 'play', trick: 1, role: 'reply' })
  const t2 = interpretNode(bareNode([0, 1], 0, true), BOTH_ELEVEN_CTX)
  assert.deepEqual(t2.stage, { kind: 'play', trick: 2, role: 'lead' })
  assert.deepEqual(t2.trickLeaders, [1, 0])
})

test('interpretNode: raises interrupt the card turn and hand it back', () => {
  const ctx: BandContext = { dealer: 0, score: [8, 4] }
  // mão led 0; pé raised instead of replying; mão accepted; pé replied 5 and won
  const n = interpretNode(bareNode([0, 27, 31, 5], 0, true), ctx)
  assert.deepEqual(n.stage, { kind: 'play', trick: 2, role: 'lead' })
  assert.deepEqual(n.steps.map((s) => s.kind), ['play', 'raise', 'raise-answer', 'play'])
  assert.deepEqual(n.steps.map((s) => s.own), [false, true, false, true])
  assert.deepEqual(n.steps.map((s) => s.seat), [1, 0, 1, 0])
  assert.deepEqual(n.steps.map((s) => s.trick), [1, 1, 1, 1])
  assert.deepEqual(n.ownPlayed, [5])
  // re-raise chain: pé raises, mão re-raises, pé accepts — pé still owes a card
  const rr = interpretNode(bareNode([0, 27, 28, 31], 0, true), ctx)
  assert.deepEqual(rr.stage, { kind: 'play', trick: 1, role: 'reply' })
  assert.deepEqual(rr.steps.map((s) => s.own), [false, true, false, true])
  assert.deepEqual(rr.steps.map((s) => s.seat), [1, 0, 1, 0])
  assert.deepEqual(rr.steps.map((s) => s.trick), [1, 1, 1, 1])
  // pending raise: mão must answer pé's raise
  const pending = interpretNode(bareNode([0, 27], 1, false), ctx)
  assert.deepEqual(pending.stage, { kind: 'raise-answer', trick: 1 })
})

test('remainingHand: removes one instance per played class', () => {
  assert.deepEqual(remainingHand([5, 5, 3], [5]), [5, 3])
  assert.deepEqual(remainingHand([8, 5, 2], [2]), [8, 5])
  assert.deepEqual(remainingHand([8, 5, 2], []), [8, 5, 2])
})

test('actionRole: two-card hands have no middle slot', () => {
  assert.equal(actionRole(8, [8, 2]), 'play-high')
  assert.equal(actionRole(2, [8, 2]), 'play-low')
  assert.equal(actionRole(13 + 2, [8, 2]), 'hide-low')
})

test('aggregateCells with removal: exact cells keyed by the remaining pair', () => {
  const rows: ChartRow[] = [
    {
      hand: [8, 5, 2],
      w: 1,
      actions: [
        { c: 8, p: 0.75, q: 0.4 },
        { c: 13 + 2, p: 0.25, q: 0.2 },
      ],
    },
  ]
  const node: ChartNode = { history: [33, 3, 5], player: 0, is_dealer: true, rows }
  const cells = aggregateCells(node, [5])
  const cell = cells.get('8,2')
  assert.ok(cell)
  assert.ok(Math.abs((cell.mix.get('play-high') ?? 0) - 0.75) < 1e-12)
  assert.ok(Math.abs((cell.mix.get('hide-low') ?? 0) - 0.25) < 1e-12)
  assert.equal(cell.nHands, 1)
  assert.equal(cell.spread, 0)
})

test('stageTitle: names the stage, not the depth', () => {
  const labels = classLabels(0)
  assert.equal(
    stageTitle(bareNode([], 0, true), labels, ELEVEN_CTX),
    'Mão de onze — accept or fold',
  )
  assert.equal(
    stageTitle(bareNode([33], 1, false), labels, ELEVEN_CTX),
    'Opening lead — after the accept',
  )
  assert.equal(stageTitle(bareNode([33, 5], 0, true), labels, ELEVEN_CTX), 'Reply to a K lead')
  assert.equal(
    stageTitle(bareNode([33, 5, 8], 0, true), labels, ELEVEN_CTX),
    'Trick-2 lead — after K vs 3 (replier won)',
  )
  assert.equal(
    stageTitle(bareNode([33, 5, 8, 26], 1, false), labels, ELEVEN_CTX),
    'Trick-2 reply to hidden — after K vs 3',
  )
  // 11x11: the empty history is the opening lead, not a decision
  assert.equal(stageTitle(bareNode([], 1, false), labels, BOTH_ELEVEN_CTX), 'Opening lead')
})

test('friendlyStageTitle: avoids solver lead/reply wording for chart navigation', () => {
  const labels = classLabels(0)
  assert.equal(
    friendlyStageTitle(bareNode([], 0, true), labels, ELEVEN_CTX),
    'Mão de onze: accept or fold',
  )
  assert.equal(
    friendlyStageTitle(bareNode([33], 1, false), labels, ELEVEN_CTX),
    'Round 1: choose first card after accept',
  )
  assert.equal(
    friendlyStageTitle(bareNode([33, 5], 0, true), labels, ELEVEN_CTX),
    'Round 1: answer K',
  )
  assert.equal(
    friendlyStageTitle(bareNode([33, 5, 8], 0, true), labels, ELEVEN_CTX),
    'Round 2: choose first card after K / 3',
  )
  assert.equal(
    friendlyStageTitle(bareNode([33, 5, 8, 26], 1, false), labels, ELEVEN_CTX),
    'Round 2: answer hidden after K / 3',
  )
})

test('walkLine: seats, stages, and the seat to act along a full line', () => {
  // eleven band: pé (seat 0) owns the accept, mão (seat 1) then leads
  const empty = walkLine([], ELEVEN_CTX)
  assert.deepEqual(empty.stage, { kind: 'eleven' })
  assert.equal(empty.toAct, 0)
  const accepted = walkLine([33], ELEVEN_CTX)
  assert.deepEqual(accepted.stage, { kind: 'play', trick: 1, role: 'lead' })
  assert.equal(accepted.toAct, 1)
  // mão leads 5, pé to reply
  const led = walkLine([33, 5], ELEVEN_CTX)
  assert.equal(led.toAct, 0)
  assert.deepEqual(led.steps.map((s) => s.seat), [0, 1])
  // pé replies 8 and wins: pé leads trick 2
  const t2 = walkLine([33, 5, 8], ELEVEN_CTX)
  assert.deepEqual(t2.stage, { kind: 'play', trick: 2, role: 'lead' })
  assert.equal(t2.toAct, 0)
  // pé leads trick 2 face down (code 13+2): mão observes and replies
  const t2r = walkLine([33, 5, 8, 13 + 2], ELEVEN_CTX)
  assert.deepEqual(t2r.stage, { kind: 'play', trick: 2, role: 'reply' })
  assert.equal(t2r.toAct, 1)
  assert.equal(t2r.folded, false)
})

test('walkLine: folds end the hand', () => {
  const foldedEleven = walkLine([34], ELEVEN_CTX)
  assert.equal(foldedEleven.folded, true)
  assert.equal(foldedEleven.toAct, null)
  const ctx: BandContext = { dealer: 0, score: [8, 4] }
  const foldedRaise = walkLine([0, 27, 32], ctx)
  assert.equal(foldedRaise.folded, true)
  assert.equal(foldedRaise.toAct, null)
  // a pending raise puts the other seat on the spot
  const pending = walkLine([0, 27], ctx)
  assert.deepEqual(pending.stage, { kind: 'raise-answer', trick: 1 })
  assert.equal(pending.toAct, 1)
})

test('observedLine: opponent face-down plays collapse to 26, own keep class', () => {
  const walk = walkLine([33, 5, 8, 13 + 2], ELEVEN_CTX)
  // seat 0 (pé) played the face-down card, so it keeps its class for seat 0
  assert.deepEqual(observedLine(walk.steps, 0), [33, 5, 8, 15])
  // seat 1 (mão) only sees a hidden card
  assert.deepEqual(observedLine(walk.steps, 1), [33, 5, 8, 26])
})

test('seatRole: names seats by the band dealer assignment', () => {
  assert.equal(seatRole(0, { dealer: 0, score: [11, 9] }), 'pé')
  assert.equal(seatRole(1, { dealer: 0, score: [11, 9] }), 'mão')
  assert.equal(seatRole(0, { dealer: 1, score: [11, 9] }), 'mão')
})

test('nodeActionOptions: reach-weighted population frequency per action code', () => {
  const rows: ChartRow[] = [
    { hand: [8, 4, 2], w: 3, actions: [{ c: 8, p: 1, q: 0.4 }, { c: 4, p: 0, q: 0.1 }] },
    { hand: [5, 4, 2], w: 1, actions: [{ c: 5, p: 0.5, q: 0.2 }, { c: 4, p: 0.5, q: 0.2 }] },
  ]
  const node: ChartNode = { history: [33], player: 1, is_dealer: false, rows }
  const opts = new Map(nodeActionOptions(node).map((o) => [o.code, o.p]))
  assert.ok(Math.abs((opts.get(8) ?? 0) - 0.75) < 1e-12)
  assert.ok(Math.abs((opts.get(5) ?? 0) - 0.125) < 1e-12)
  assert.ok(Math.abs((opts.get(4) ?? 0) - 0.125) < 1e-12)
})

test('joint reach includes both players’ earlier actions, not only counterfactual opponent reach', () => {
  const root: ChartNode = {
    history: [],
    player: 1,
    is_dealer: false,
    rows: [
      { hand: [8, 4, 2], own_reach: 0.6, w: 0.6, actions: [] },
      { hand: [7, 4, 2], own_reach: 0.4, w: 0.4, actions: [] },
    ],
  }
  // The leader raised 1% with the first hand and 2% with the second; the
  // dealer then accepted 30% and 60% respectively. Counterfactual `w`
  // alone says 42%, while the actual line reaches only 0.66% of deals.
  const afterRaiseAccepted: ChartNode = {
    history: [27, 31],
    player: 1,
    is_dealer: false,
    rows: [
      { hand: [8, 4, 2], own_reach: 0.006, w: 0.18, actions: [] },
      { hand: [7, 4, 2], own_reach: 0.008, w: 0.24, actions: [] },
    ],
  }
  const weights = rootDealWeights(root)
  assert.equal(nodeJointMass(root, weights), 1)
  assert.ok(Math.abs(nodeJointMass(afterRaiseAccepted, weights) - 0.0066) < 1e-12)
  assert.ok(Math.abs(jointRowWeight(afterRaiseAccepted.rows[0], weights) - 0.0018) < 1e-12)
})

test('draftSetSlot: fills a slot and keeps knowns sorted, nulls in place', () => {
  assert.deepEqual(draftSetSlot([null, null, null], 1, 7), [null, 7, null])
  // out-of-order pick re-sorts the knowns across the known positions
  assert.deepEqual(draftSetSlot([null, 7, 2], 2, 9), [null, 9, 7])
  assert.deepEqual(draftSetSlot([9, 7, null], 2, 12), [12, 9, 7])
  // clearing a slot
  assert.deepEqual(draftSetSlot([9, 7, 2], 1, null), [9, null, 2])
})

test('draftAfterPlays: removes knowns by class, plays consume compatible unknowns', () => {
  assert.deepEqual(draftAfterPlays([9, 7, 2], [7]), [9, 2])
  // an unmatched play consumes an order-compatible unknown
  assert.deepEqual(draftAfterPlays([9, null, 2], [5]), [9, 2])
  assert.deepEqual(draftAfterPlays([null, 7, 2], [12]), [7, 2])
  // no compatible unknown -> the draft cannot fit the walked line
  assert.equal(draftAfterPlays([9, 7, 2], [5]), null)
  assert.equal(draftAfterPlays([null, 7, 2], [5]), null)
})

test('draftWithPlays: reinserts played cards keeping the sort', () => {
  assert.deepEqual(draftWithPlays([9, 2], [7]), [9, 7, 2])
  assert.deepEqual(draftWithPlays([null, 2], [12]), [12, null, 2])
  // round-trips with draftAfterPlays when the plays were knowns
  const full = draftWithPlays([null, 7], [4])
  assert.deepEqual(draftAfterPlays(full, [4]), [null, 7])
})

test('draftMatchesHand: known slots must match positionally', () => {
  assert.equal(draftMatchesHand([9, null, 2], [9, 5, 2]), true)
  assert.equal(draftMatchesHand([9, null, 2], [9, 5, 1]), false)
  assert.equal(draftMatchesHand([null, null], [9, 5]), true)
  assert.equal(draftMatchesHand([9, null, 2], [9, 5]), false)
})

test('aggregateRows: aggregates an arbitrary subset like a cell', () => {
  const rows: ChartRow[] = [
    { hand: [8, 4, 2], w: 1, actions: [{ c: 33, p: 1, q: 0.5 }, { c: 34, p: 0, q: 0.1 }] },
    { hand: [8, 4, 0], w: 1, actions: [{ c: 33, p: 0, q: -0.5 }, { c: 34, p: 1, q: 0.1 }] },
  ]
  const agg = aggregateRows(rows)
  assert.ok(Math.abs((agg.mix.get('accept') ?? 0) - 0.5) < 1e-12)
  assert.equal(agg.nHands, 2)
})

test('labels and titles read like the game', () => {
  const labels = classLabels(0)
  assert.equal(actionLabel(33, labels), 'Accept mão de onze')
  assert.equal(actionLabel(6, labels), 'Play A')
  assert.equal(actionLabel(19, labels), 'Play A face down')
  assert.equal(historyStepLabel(33, labels), 'accept')
  const root: ChartNode = { history: [], player: 0, is_dealer: true, rows: [] }
  assert.equal(nodeTitle(root, labels), 'Mão de onze — accept or fold')
  const lead: ChartNode = { history: [33], player: 1, is_dealer: false, rows: [] }
  assert.equal(nodeTitle(lead, labels), 'Opening lead — after the accept')
})

// ── Slot-order feasibility ───────────────────────────────────────────────────
//
// tc 0 is vira 4: the manilhas are the four 5s (9=5♦ 10=5♠ 11=5♥ 12=5♣, one
// copy each) and the vira eats one of the four 4s (class 0).

/** copies each class still offers a hand under vira 4, nothing else played */
const AVAIL_V4 = (cls: number) => classCopies(cls) - (cls === viraClassOf(0) ? 1 : 0)

test('draftCompletable: a slot needs enough deck above and below it', () => {
  // 5♣ outranks everything — it can only ever be the strongest card
  assert.equal(draftCompletable([12, null, null], AVAIL_V4), true)
  assert.equal(draftCompletable([null, 12, null], AVAIL_V4), false)
  assert.equal(draftCompletable([null, null, 12], AVAIL_V4), false)
  // 5♥ can be highest or middle (only 5♣ sits above it), never lowest
  assert.equal(draftCompletable([null, 11, null], AVAIL_V4), true)
  assert.equal(draftCompletable([null, null, 11], AVAIL_V4), false)
  // 5♠ as lowest works: 5♥ and 5♣ fill the two slots above
  assert.equal(draftCompletable([null, null, 10], AVAIL_V4), true)
})

test('draftCompletable: ties are legal while the copies last', () => {
  assert.equal(draftCompletable([8, 8, 8], AVAIL_V4), true)
  // three 4s survive the vira taking one copy…
  assert.equal(draftCompletable([0, 0, 0], AVAIL_V4), true)
  // …but not another 4 leaving the deck
  const oneFourGone = (cls: number) => AVAIL_V4(cls) - (cls === 0 ? 1 : 0)
  assert.equal(draftCompletable([0, 0, 0], oneFourGone), false)
  assert.equal(draftCompletable([12, 12, null], AVAIL_V4), false)
})

test('draftCompletable: mustContain plays must fit inside the hand', () => {
  assert.equal(draftCompletable([null, null, null], AVAIL_V4, [12]), true)
  // only one 5♣ exists — a hand cannot have played it twice
  assert.equal(draftCompletable([null, null, null], AVAIL_V4, [12, 12]), false)
  // a hand whose highest card is a 3 cannot have played the 5♣
  assert.equal(draftCompletable([8, null, null], AVAIL_V4, [12]), false)
})

const LINE_CTX: BandContext = { dealer: 0, score: [11, 11] } // pé = seat 0, mão leads

test('linePlays: seats and openness follow the walked line', () => {
  // mão (seat 1) leads a 6, pé replies 5♣ and wins, pé leads 5♥ face down
  assert.deepEqual(linePlays([1, 12, 24], LINE_CTX), [
    { seat: 1, cls: 1, open: true },
    { seat: 0, cls: 12, open: true },
    { seat: 0, cls: 11, open: false },
  ])
})

test('draftFitsLine: open plays spend copies, own plays come from the hand', () => {
  const line = [1, 12, 11] // mão: 6 · pé: 5♣ (wins) · pé: 5♥
  // pé really played those manilhas out of this hand
  assert.equal(draftFitsLine([12, 11, null], 0, line, LINE_CTX, 0), true)
  // mão cannot also hold the 5♣ pé showed face up
  assert.equal(draftFitsLine([12, null, null], 1, line, LINE_CTX, 0), false)
  // pé's own open play must come out of the drafted slots
  assert.equal(draftFitsLine([8, 8, 8], 0, [1, 0], LINE_CTX, 0), false)
  // …and a hand that fits its own plays passes
  assert.equal(draftFitsLine([8, 8, null], 0, [1, 0], LINE_CTX, 0), true)
})

test('draftFitsLine: hidden plays by the other seat are never charged', () => {
  // mão hides its 5♣ — pé cannot see that, so pé may still draft it
  assert.equal(draftFitsLine([12, null, null], 0, [25, 2], LINE_CTX, 0), true)
  // but mão's own hidden 5♣ does come out of mão's hand
  assert.equal(draftFitsLine([12, null, null], 1, [25, 2], LINE_CTX, 0), true)
  assert.equal(draftFitsLine([8, 8, 8], 1, [25, 2], LINE_CTX, 0), false)
})

test('stake legality: the ladder climbs one rung, never at a score of 11', () => {
  const RAISE: BandContext = { dealer: 0, score: [10, 10] }
  const ELEVEN: BandContext = { dealer: 0, score: [11, 9] }
  const FERRO: BandContext = { dealer: 0, score: [11, 11] }
  assert.equal(bandForbidsRaises([10, 10]), false)
  assert.equal(bandForbidsRaises([11, 9]), true)
  assert.equal(bandForbidsRaises([11, 11]), true)

  assert.equal(nextLegalRaiseTarget([], RAISE), 3)
  assert.equal(nextLegalRaiseTarget([27], RAISE), 6) // pending truco -> re-raise to 6
  assert.equal(nextLegalRaiseTarget([27, 31], RAISE), 6) // accepted truco -> next is 6
  assert.equal(nextLegalRaiseTarget([27, 28, 29, 30], RAISE), null) // ladder topped
  assert.equal(nextLegalRaiseTarget([], ELEVEN), null)

  assert.equal(firstStakeIllegal([27, 31, 8], RAISE), 3)
  assert.equal(firstStakeIllegal([30], RAISE), 0) // opening r12
  assert.equal(firstStakeIllegal([27, 31, 27], RAISE), 2) // equal re-raise
  assert.equal(firstStakeIllegal([27, 29], RAISE), 1) // skipped rung
  assert.equal(firstStakeIllegal([27, 28, 29, 30, 31], RAISE), 5) // full chain
  assert.equal(firstStakeIllegal([27], FERRO), 0)

  // the audit's F11 case: a 10x10 truco line switched into 11x9 gets the
  // accept prefix from the band translation, then cuts at the raise
  const translated = translateLineForBand([27, 31, 8], ELEVEN)
  assert.deepEqual(translated, [33, 27, 31, 8])
  assert.equal(firstStakeIllegal(translated, ELEVEN), 1)
  // and translating back strips the accept again
  assert.deepEqual(translateLineForBand([33, 8, 0], RAISE), [8, 0])
  assert.deepEqual(translateLineForBand([34], RAISE), [])
})

test('draftsJointlyCompletable: both hands share one deck', () => {
  // a single 5♣ cannot sit in both hands
  assert.equal(draftsJointlyCompletable([12, null, null], [12, null, null], AVAIL_V4), false)
  assert.equal(draftsJointlyCompletable([12, null, null], [11, null, null], AVAIL_V4), true)
  // four 3s across both hands are fine, five are not
  assert.equal(draftsJointlyCompletable([8, 8, 8], [8, null, null], AVAIL_V4), true)
  assert.equal(draftsJointlyCompletable([8, 8, 8], [8, 8, null], AVAIL_V4), false)
  // slot-order interaction: [? 5♥ 4] forces its unknown to be the 5♣, so the
  // other hand's known 5♣ kills it even though no known class collides
  assert.equal(draftsJointlyCompletable([null, 11, 0], [10, 0, 0], AVAIL_V4), true)
  assert.equal(draftsJointlyCompletable([null, 11, 0], [12, 0, 0], AVAIL_V4), false)
  // each hand must cover its own plays out of the shared copies
  assert.equal(
    draftsJointlyCompletable([null, null, null], [null, null, null], AVAIL_V4, [12], [11]),
    true,
  )
  assert.equal(
    draftsJointlyCompletable([null, null, null], [null, null, null], AVAIL_V4, [12], [12]),
    false,
  )
})

test('draftFitsLine: a drafted other hand joins the deck accounting', () => {
  // both hands claiming the single 5♣ is no longer a real deal
  assert.equal(draftFitsLine([12, null, null], 1, [], LINE_CTX, 0, [12, null, null]), false)
  assert.equal(draftFitsLine([12, null, null], 1, [], LINE_CTX, 0, [11, null, null]), true)
  // no double count: pé openly played the 5♣ out of its own drafted hand —
  // mão's accounting must charge that card once, not twice
  const line = [1, 12] // mão: 6 · pé: 5♣
  assert.equal(draftFitsLine([11, null, null], 1, line, LINE_CTX, 0, [12, null, null]), true)
  // an other draft that contradicts the line on its own is ignored here
  assert.equal(draftFitsLine([11, null, null], 1, line, LINE_CTX, 0, [8, 8, 8]), true)
})

test('actionCardAvailable: gates a play by deck copies left (plan 77 L-2)', () => {
  // 11x11 v4: mão (seat 1) is pinned to three 4s and led one; with the
  // vira's own 4, all four copies of the class are spoken for, so pé (the
  // dealer, seat 0) cannot also hold a 4 to play here
  const line = [0] // mão leads the 4
  const maoAllFours = [0, 0, 0]
  assert.equal(actionCardAvailable(0, 0, line, BOTH_ELEVEN_CTX, 0, maoAllFours), false)
  // not pinned to all the 4s — two known and one still open leaves a copy
  const maoTwoFours = [0, 0, null]
  assert.equal(actionCardAvailable(0, 0, line, BOTH_ELEVEN_CTX, 0, maoTwoFours), true)
  // no pin at all: only the vira and mão's own open lead are spent
  assert.equal(actionCardAvailable(0, 0, line, BOTH_ELEVEN_CTX, 0, undefined), true)
  // a class the pin never touches is unaffected
  assert.equal(actionCardAvailable(8, 0, line, BOTH_ELEVEN_CTX, 0, maoAllFours), true)
})

test('draftChargeBeyondPlays: knowns beyond the open plays are the surplus', () => {
  // a known 5♣ that was openly played is one physical card — no surplus
  assert.deepEqual([...draftChargeBeyondPlays([12, null, null], [12])], [])
  // an unplayed known charges; extra copies beyond one play charge partially
  assert.deepEqual([...draftChargeBeyondPlays([12, null, null], [])], [[12, 1]])
  assert.deepEqual([...draftChargeBeyondPlays([8, 8, null], [8])], [[8, 1]])
})

test('draftWithPlaysFitting: placement bends so the line still fits', () => {
  // mão (seat 1) led a 3, pé replied a 4, mão now leads the 5♣. At the
  // trick-2 node mão's rem draft is [? 2]: the unknown IS the 5♣ about to be
  // played, so the played 3 must sit below it — not above, where the naive
  // placement puts it.
  const line = [8, 0, 12]
  assert.deepEqual(draftWithPlays([null, 7], [8]), [8, null, 7])
  assert.equal(draftFitsLine([8, null, 7], 1, line, LINE_CTX, 0), false)
  assert.deepEqual(draftWithPlaysFitting([null, 7], [8], 1, line, LINE_CTX, 0), [null, 8, 7])
  // when the naive placement already fits, it is kept unchanged
  assert.deepEqual(draftWithPlaysFitting([null, 7], [8], 1, [8], LINE_CTX, 0), [8, null, 7])
  // rem [3 ?] pins the unknown below the 3 — later leading the 5♣ from that
  // hand really is impossible, so no placement rescues it
  assert.equal(draftWithPlaysFitting([8, null], [0], 1, [0, 13, 12], LINE_CTX, 0), null)
  // the F6 drag-swap shape: no hand can hold the 5♣ as its middle card
  assert.equal(draftWithPlaysFitting([null, 12, null], [], 1, [], LINE_CTX, 0), null)
})
