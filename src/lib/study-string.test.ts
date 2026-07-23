import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  cardToken,
  parseStudyString,
  resolveCard,
  resolveDraftSlots,
  resolveHistory,
  serializeStudyString,
  validateDraftWithLine,
  validateDraftsTogether,
  StudyStringError,
} from './study-string.ts'
import { viraChoices, viraRank, type BandContext } from './study-data.ts'

const ELEVEN_CTX: BandContext = { dealer: 0, score: [11, 9] } // pé holds the onze
const FERRO_CTX: BandContext = { dealer: 0, score: [11, 11] }
const RAISE_CTX: BandContext = { dealer: 0, score: [10, 10] }

test('parseStudyString: score, vira, draft, and history sections', () => {
  const ast = parseStudyString('10x10 v4 mao[3 2 .] : r a 2 6 / 3')
  assert.equal(ast.mao, 10)
  assert.equal(ast.pe, 10)
  assert.equal(ast.tc, 0) // vira 4 -> tc 0
  assert.equal(ast.viraRankLabel, '4')
  assert.deepEqual(ast.drafts, [{ role: 'mão', slots: ['3', '2', '?'], pinned: false }])
  assert.deepEqual(ast.history, ['r', 'a', '2', '6', '/', '3'])
})

test('parseStudyString: sections are optional and drafts tokenize densely', () => {
  assert.deepEqual(parseStudyString(''), {})
  const ast = parseStudyString('pe[5d3?]')
  assert.deepEqual(ast.drafts, [{ role: 'pé', slots: ['5d', '3', '?'], pinned: false }])
  assert.equal(ast.mao, undefined)
  const hist = parseStudyString(': a 3 j')
  assert.deepEqual(hist.history, ['a', '3', 'j'])
})

test('parseStudyString: errors read like sentences', () => {
  assert.throws(() => parseStudyString('mao[3 2]'), StudyStringError)
  assert.throws(() => parseStudyString('mao[1 2 3]'), StudyStringError)
  assert.throws(() => parseStudyString('mao[3 2 ?] mao[? ? 6]'), StudyStringError)
  assert.throws(() => parseStudyString('12x9'), StudyStringError)
  assert.throws(() => parseStudyString('vx'), StudyStringError)
  assert.throws(() => parseStudyString('banana'), StudyStringError)
})

test('resolveCard: plain ranks, manilha suits, and m-synonyms under vira 4', () => {
  assert.equal(resolveCard('3', 0), 8)
  assert.equal(resolveCard('a', 0), 6)
  assert.equal(resolveCard('5d', 0), 9)
  assert.equal(resolveCard('5c', 0), 12)
  assert.equal(resolveCard('mc', 0), 12)
  assert.equal(resolveCard('md', 0), 9)
  // the manilha rank without a suit is an error, not a guess
  assert.throws(() => resolveCard('5', 0), StudyStringError)
  // 5 is a plain card under other viras (vira K -> manilha A)
  assert.throws(() => resolveCard('4x', 0), StudyStringError)
})

test('resolveDraftSlots: strongest-first is enforced, unknowns pass', () => {
  assert.deepEqual(resolveDraftSlots(['3', '2', '?'], 0), [8, 7, null])
  assert.deepEqual(resolveDraftSlots(['?', '?', '6'], 0), [null, null, 1])
  assert.throws(() => resolveDraftSlots(['2', '3', '?'], 0), StudyStringError)
})

test('resolveHistory: "a" answers the onze or a raise, otherwise it is the ace', () => {
  // eleven band: explicit accept, then plays — and the ace mid-hand
  assert.deepEqual(resolveHistory(['a', '3', 'a'], ELEVEN_CTX, 0), [33, 8, 6])
  // the accept is auto-prepended when the string starts with a card
  assert.deepEqual(resolveHistory(['3', 'j'], ELEVEN_CTX, 0), [33, 8, 4])
  // ferro band: "a" at a card turn is the ace
  assert.deepEqual(resolveHistory(['a', '3'], FERRO_CTX, 0), [6, 8])
  // raises: r interrupts the card turn, a accepts it
  assert.deepEqual(resolveHistory(['r', 'a', '2', '6', '3'], RAISE_CTX, 0), [27, 31, 7, 1, 8])
  assert.deepEqual(resolveHistory(['2', 'r', 'f'], RAISE_CTX, 0), [7, 27, 32])
  // face-down plays keep their class with the * suffix
  assert.deepEqual(resolveHistory(['3', '2*'], FERRO_CTX, 0), [8, 20])
  // folding with nothing pending is an error
  assert.throws(() => resolveHistory(['f'], FERRO_CTX, 0), StudyStringError)
})

test('notation guide: the 11x8 worked line is a dealable history', () => {
  const ast = parseStudyString('11x8 v4 mao![5d 3 ?] : a 5d 7 / 3* j')
  const ctx: BandContext = { dealer: 0, score: [11, 8] }
  const line = resolveHistory(ast.history!, ctx, ast.tc!)
  const draft = ast.drafts![0]

  assert.deepEqual(line, [33, 9, 2, 21, 4])
  validateDraftWithLine(draft.role, resolveDraftSlots(draft.slots, ast.tc!), line, ctx, ast.tc!)
})

test('resolveHistory: "/" must land exactly on a completed round', () => {
  assert.deepEqual(resolveHistory(['3', '2', '/', '6'], FERRO_CTX, 0), [8, 7, 1])
  assert.throws(() => resolveHistory(['3', '/', '2'], FERRO_CTX, 0), StudyStringError)
  assert.throws(() => resolveHistory(['/'], FERRO_CTX, 0), StudyStringError)
})

test('resolveHistory: the stake ladder is enforced (audit F8)', () => {
  // a player at 11 fixes the stake — no raise token is legal anywhere
  assert.throws(() => resolveHistory(['r'], ELEVEN_CTX, 0), /mão de onze/)
  assert.throws(() => resolveHistory(['a', '3', 'r'], ELEVEN_CTX, 0), /mão de onze/)
  assert.throws(() => resolveHistory(['r'], FERRO_CTX, 0), /11 × 11/)
  // the opening raise is truco: to 3, nothing else
  assert.throws(() => resolveHistory(['r12'], RAISE_CTX, 0), /goes to 3, not 12/)
  assert.throws(() => resolveHistory(['r6'], RAISE_CTX, 0), /goes to 3, not 6/)
  assert.deepEqual(resolveHistory(['r3'], RAISE_CTX, 0), [27])
  // re-raises climb exactly one rung; bare r always means truco (3)
  assert.deepEqual(resolveHistory(['r', 'r6'], RAISE_CTX, 0), [27, 28])
  assert.throws(() => resolveHistory(['r', 'a', 'r'], RAISE_CTX, 0), /goes to 6, not 3/)
  assert.throws(() => resolveHistory(['r', 'r9'], RAISE_CTX, 0), /goes to 6, not 9/)
  assert.deepEqual(
    resolveHistory(['r', 'a', '2', 'r6', 'r9', 'r12', 'a'], RAISE_CTX, 0),
    [27, 31, 7, 28, 29, 30, 31],
  )
  // the ladder tops out at 12
  assert.throws(
    () => resolveHistory(['r', 'a', 'r6', 'a', 'r9', 'a', 'r12', 'a', '2', 'r'], RAISE_CTX, 0),
    /nothing left to raise/,
  )
})

test('serializeStudyString round-trips through the parser', () => {
  const state = {
    mao: 10,
    pe: 10,
    tc: 0,
    viraRankLabel: '4',
    ctx: RAISE_CTX,
    drafts: [{ role: 'mão' as const, slots: [8, 7, null], pinned: false }],
    line: [27, 31, 7, 1, 8],
  }
  const s = serializeStudyString(state)
  assert.equal(s, '10x10 v4 mao[3 2 ?] : r a 2 6 / 3')
  const ast = parseStudyString(s)
  assert.equal(ast.mao, 10)
  assert.deepEqual(resolveDraftSlots(ast.drafts![0].slots, 0), [8, 7, null])
  assert.deepEqual(resolveHistory(ast.history!, RAISE_CTX, 0), state.line)
})

test('every turnable vira rank parses and survives the serializer round trip', () => {
  for (const { rank, tc } of viraChoices()) {
    // the typed token resolves to the choice's solver class
    const typed = parseStudyString(`11x11 v${rank.toLowerCase()}`)
    assert.equal(typed.tc, tc, `v${rank} should resolve to tc ${tc}`)
    assert.equal(typed.viraRankLabel, rank)
    // and what the serializer writes for that class parses back to it
    const s = serializeStudyString({
      mao: 11,
      pe: 11,
      tc,
      viraRankLabel: viraRank(tc),
      ctx: FERRO_CTX,
      drafts: [],
      line: [],
    })
    const back = parseStudyString(s)
    assert.equal(back.tc, tc, `"${s}" should parse back to tc ${tc}`)
  }
  // no rank 10 exists in the truco deck
  assert.throws(() => parseStudyString('v10'), StudyStringError)
})

test('merged vira 3 keeps its concrete card language over the tc8 solve', () => {
  const ast = parseStudyString('11x11 v3 mao[4c 3 ?]')
  assert.equal(ast.tc, 8)
  assert.equal(ast.viraRankLabel, '3')
  assert.deepEqual(resolveDraftSlots(ast.drafts![0].slots, 8, ast.viraRankLabel), [12, 8, null])
  assert.equal(resolveCard('4c', 8, '3'), 12)
  assert.throws(() => resolveCard('4', 8, '3'), /manilha rank/)

  const serialized = serializeStudyString({
    mao: 11,
    pe: 11,
    tc: 8,
    viraRankLabel: '3',
    ctx: FERRO_CTX,
    drafts: [{ role: 'mão', slots: [12, 8, null], pinned: false }],
    line: [],
  })
  assert.equal(serialized, '11x11 v3 mao[4c 3 ?]')
})

test('parseStudyString: both hands may be drafted at once', () => {
  const ast = parseStudyString('mao[3 2 ?] pe![? ? 6]')
  assert.deepEqual(ast.drafts, [
    { role: 'mão', slots: ['3', '2', '?'], pinned: false },
    { role: 'pé', slots: ['?', '?', '6'], pinned: true },
  ])
})

test('serializeStudyString: manilhas, face-down plays, folds', () => {
  const s = serializeStudyString({
    mao: 9,
    pe: 11,
    tc: 0,
    viraRankLabel: '4',
    ctx: ELEVEN_CTX,
    drafts: [{ role: 'pé' as const, slots: [12, null, 1], pinned: true }],
    line: [33, 8, 14],
  })
  assert.equal(s, '9x11 v4 pe![5c ? 6] : a 3 6*')
  assert.equal(cardToken(9, 0), '5d')
})

test('resolveDraftSlots: slots must be reachable positions in a real hand', () => {
  // under vira 4 the 5♣ outranks everything — it can only be the highest card
  assert.throws(() => resolveDraftSlots(['?', '5c', '?'], 0), /middle/)
  assert.throws(() => resolveDraftSlots(['?', '?', '5c'], 0), StudyStringError)
  // the 5♥ can be highest or middle, never lowest
  assert.throws(() => resolveDraftSlots(['?', '?', '5h'], 0), /lowest/)
  assert.deepEqual(resolveDraftSlots(['?', '5h', '?'], 0), [null, 11, null])
  // manilhas are single cards; plain ranks tie while the copies last
  assert.throws(() => resolveDraftSlots(['5c', '5c', '?'], 0), /5♣/)
  assert.deepEqual(resolveDraftSlots(['5c', '5h', '5s'], 0), [12, 11, 10])
  assert.deepEqual(resolveDraftSlots(['4', '4', '4'], 0), [0, 0, 0])
})

test('resolveHistory: open plays cannot outrun the deck', () => {
  // four 3s exist — a fifth face-up 3 is impossible
  assert.throws(() => resolveHistory(['3', '3', '3', '3', '3'], FERRO_CTX, 0), /no copies of 3/)
  // the vira eats one 4, so only three can hit the table face up
  assert.throws(() => resolveHistory(['4', '4', '4', '4'], FERRO_CTX, 0), StudyStringError)
  assert.deepEqual(resolveHistory(['4', '4', '4'], FERRO_CTX, 0), [0, 0, 0])
  // a single manilha can only be played once face up
  assert.throws(() => resolveHistory(['5c', '5c'], FERRO_CTX, 0), StudyStringError)
  // a hidden card stays unattributed — the observer can't rule this out
  assert.deepEqual(resolveHistory(['5c*', '5c'], FERRO_CTX, 0), [25, 12])
})

test('validateDraftsTogether: the two drafted hands share one deck', () => {
  const both = (m: string, p: string, hist: string[] = []) => {
    const ast = parseStudyString(`mao[${m}] pe[${p}]`)
    const line = resolveHistory(hist, FERRO_CTX, 0)
    const drafts = ast.drafts!.map((d) => ({
      role: d.role,
      slots: resolveDraftSlots(d.slots, 0),
    }))
    for (const d of drafts) validateDraftWithLine(d.role, d.slots, line, FERRO_CTX, 0)
    validateDraftsTogether(drafts, line, FERRO_CTX, 0)
  }
  // distinct manilhas coexist; the same one cannot
  both('5c ? ?', '5h ? ?')
  assert.throws(() => both('5c ? ?', '5c ? ?'), /2 copies of 5♣/)
  // plain ranks share four copies across both hands
  both('3 3 3', '3 ? ?')
  assert.throws(() => both('3 3 3', '3 3 ?'), /copies of 3/)
  // the vira burns one copy of its own rank
  both('4 4 4', '? ? ?')
  assert.throws(() => both('4 4 4', '? ? 4'), /one is the vira/)
  // a card the other role openly played is its own — never charged twice
  both('? ? ?', '5c 3 ?', ['6', '5c'])
  // joint slot-order squeeze the per-class counts miss: mao's unknown top
  // slot can only be the 5♣, which pe holds — generic sentence
  assert.throws(() => both('? 5h 4', '5c 4 4'), /can't both be dealt/)
  // a single draft never throws here
  validateDraftsTogether(
    [{ role: 'mão', slots: [12, null, null] }],
    [],
    FERRO_CTX,
    0,
  )
})

test('validateDraftWithLine: the walked line and the draft share one deck', () => {
  // FERRO_CTX: dealer 0, so pé is seat 0 and mão leads trick 1.
  // mão: 6 · pé: 5♣ (wins) · pé: 5♥ — pé really played those manilhas
  const line = [1, 12, 11]
  validateDraftWithLine('pé', [12, 11, null], line, FERRO_CTX, 0)
  // mão can't claim the 5♠ as middle: both stronger manilhas are gone
  assert.throws(() => validateDraftWithLine('mão', [null, 10, null], line, FERRO_CTX, 0), /middle/)
  // mão can't hold the 5♣ pé showed face up
  assert.throws(() => validateDraftWithLine('mão', [12, null, null], line, FERRO_CTX, 0), /5♣/)
  // pé's own open play must come out of the drafted hand
  assert.throws(
    () => validateDraftWithLine('pé', [8, 8, 8], [1, 0], FERRO_CTX, 0),
    /can't have played/,
  )
  // a hidden play by the other seat is never charged against the draft
  validateDraftWithLine('pé', [12, null, null], [25, 2], FERRO_CTX, 0)
})
