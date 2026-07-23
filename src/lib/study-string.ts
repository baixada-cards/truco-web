// The study string: one editable line that names a spot, a drafted hand, and
// a walked history, round-tripping with the study lab state (and the URL).
//
//   11x9 v4 pe[5d 3 ?] : a 3 j
//   10x10 v4 mao[3 2 .] : r a 2 6 / 3
//
// Sections are optional; omitted ones keep the current state — the walked
// line and each role's draft survive a partial string, revalidated against
// the (possibly new) spot and dropped with a note only when they no longer
// fit. To clear explicitly: a bare `:` empties the history, and an
// all-unknown draft like `mao[? ? ?]` clears that hand. Card tokens follow
// the repo notation language (specs/notation): bare ranks for plain cards
// (suits don't matter off-manilha), rank+suit for manilhas (5d 5s 5h 5c
// under vira 4), and vira-independent synonyms md ms mh mc. `?` and `.`
// both mean an unknown draft slot. In the history, `a`/`f` answer a pending
// raise or the mão de onze — a bare `a` at a card turn is the ace. `*` after
// a card plays it face down; `/` separators are ignored.

import {
  bandForbidsRaises,
  classCopies,
  classInfos,
  classLabels,
  draftAfterPlays,
  draftCompletable,
  draftFitsLine,
  elevenOwner,
  linePlays,
  nextLegalRaiseTarget,
  N_CLASSES,
  RAISE_TARGETS,
  viraChoices,
  viraClassOf,
  walkLine,
  type BandContext,
  type HandDraft,
} from './study-data.ts'

export interface StudyStringAst {
  /** role scores, when the string names them */
  mao?: number
  pe?: number
  /** solver vira class, when the string names a vira rank */
  tc?: number
  /** concrete vira spelling, preserved when several ranks share one solver class */
  viraRankLabel?: string
  drafts?: Array<{ role: 'mão' | 'pé'; slots: string[]; pinned: boolean }>
  /** raw history tokens (round separators kept as "/") */
  history?: string[]
}

export class StudyStringError extends Error {}

const RANK_CHARS = new Set(['4', '5', '6', '7', 'q', 'j', 'k', 'a', '2', '3'])
const SUIT_CHARS: Record<string, string> = { d: '♦', s: '♠', h: '♥', c: '♣' }
const SUIT_LETTER: Record<string, string> = { '♦': 'd', '♠': 's', '♥': 'h', '♣': 'c' }

/** tokenize a run of card/unknown tokens; spaces and commas optional */
function tokenizeCards(src: string, what: string): string[] {
  const out: string[] = []
  let i = 0
  const s = src.toLowerCase()
  while (i < s.length) {
    const ch = s[i]
    if (ch === ' ' || ch === ',' || ch === '\t') {
      i += 1
      continue
    }
    if (ch === '?' || ch === '.') {
      out.push('?')
      i += 1
      continue
    }
    if (ch === 'm' && i + 1 < s.length && SUIT_CHARS[s[i + 1]]) {
      out.push(`m${s[i + 1]}`)
      i += 2
      continue
    }
    if (RANK_CHARS.has(ch)) {
      if (i + 1 < s.length && SUIT_CHARS[s[i + 1]]) {
        out.push(`${ch}${s[i + 1]}`)
        i += 2
      } else {
        out.push(ch)
        i += 1
      }
      continue
    }
    throw new StudyStringError(`can't read "${s[i]}" in ${what}`)
  }
  return out
}

export function parseStudyString(input: string): StudyStringAst {
  const ast: StudyStringAst = {}
  let head = input.trim()
  const colon = head.indexOf(':')
  let historyPart: string | null = null
  if (colon >= 0) {
    historyPart = head.slice(colon + 1)
    head = head.slice(0, colon)
  }

  // draft sections: mao[...] and/or pe[...]; a ! pins the hand for the walk
  const draftRe = /(mão|mao|pé|pe)(!?)\s*\[([^\]]*)\]/gi
  for (const match of head.matchAll(draftRe)) {
    const [, who, bang, body] = match
    const role: 'mão' | 'pé' = who.toLowerCase().startsWith('m') ? 'mão' : 'pé'
    if (ast.drafts?.some((d) => d.role === role)) {
      throw new StudyStringError(`${who}[...] appears twice`)
    }
    const slots = tokenizeCards(body, `${who}[...]`)
    if (slots.length !== 3) {
      throw new StudyStringError(`${who}[...] needs exactly 3 slots, got ${slots.length}`)
    }
    ast.drafts = [...(ast.drafts ?? []), { role, slots, pinned: bang === '!' }]
  }
  head = head.replace(draftRe, ' ')

  for (const raw of head.split(/\s+/).filter(Boolean)) {
    const tok = raw.toLowerCase()
    const score = tok.match(/^(\d{1,2})x(\d{1,2})$/)
    if (score) {
      ast.mao = Number(score[1])
      ast.pe = Number(score[2])
      if (ast.mao > 11 || ast.pe > 11) throw new StudyStringError(`scores go up to 11: ${tok}`)
      continue
    }
    const vira = tok.match(/^v([4-7qjka23])$/)
    if (vira) {
      const rank = vira[1].toUpperCase()
      const choice = viraChoices().find((c) => c.rank.toLowerCase() === vira[1])
      if (!choice) throw new StudyStringError(`no vira rank "${rank}"`)
      ast.tc = choice.tc
      ast.viraRankLabel = choice.rank
      continue
    }
    throw new StudyStringError(`can't read "${raw}" — expected a score (11x9), vira (v4), or mao[...] / pe[...]`)
  }

  if (historyPart !== null) {
    // keep "/" as a token: it asserts a completed round at that point
    const tokens = historyPart
      .toLowerCase()
      .replace(/\//g, ' / ')
      .split(/\s+/)
      .filter(Boolean)
    ast.history = tokens
  }
  return ast
}

/** card token → solver class under a vira, or throw */
export function resolveCard(token: string, tc: number, viraRankLabel?: string): number {
  const infos = classInfos(tc, 'cards', viraRankLabel)
  for (let i = 0; i < infos.length; i += 1) {
    const info = infos[i]
    if (info.suit) {
      if (token === `${info.rank.toLowerCase()}${SUIT_LETTER[info.suit]}`) return i
      if (token === `m${SUIT_LETTER[info.suit]}`) return i
    } else if (token === info.label.toLowerCase()) {
      return i
    }
  }
  const manilhaRank = infos[infos.length - 1].rank.toLowerCase()
  if (token === manilhaRank) {
    throw new StudyStringError(
      `${token.toUpperCase()} is the manilha rank here — name the suit: ${manilhaRank}d ${manilhaRank}s ${manilhaRank}h ${manilhaRank}c`,
    )
  }
  throw new StudyStringError(`no card "${token}" under this vira`)
}

const SLOT_WORDS = ['highest', 'middle', 'lowest'] as const

/**
 * Name the first impossibility in a draft under these copy counts, or null
 * when the per-slot counts allow it. Messaging only — `draftCompletable` is
 * the actual gate, so joint failures fall back to a generic sentence.
 */
function draftProblem(
  slots: HandDraft,
  avail: (cls: number) => number,
  tc: number,
  viraRankLabel?: string,
): string | null {
  const labels = classLabels(tc, viraRankLabel)
  const left = Array.from({ length: N_CLASSES }, (_, c) => avail(c))
  for (const c of slots) if (c !== null) left[c] -= 1
  for (const c of slots) {
    if (c !== null && left[c] < 0) {
      return `no copies of ${labels[c]} left for this hand — the vira, the plays, and the other slots use them all`
    }
  }
  for (let i = 0; i < slots.length; i += 1) {
    const c = slots[i]
    if (c === null) continue
    const above = slots.slice(0, i).filter((v) => v === null).length
    const below = slots.slice(i + 1).filter((v) => v === null).length
    let haveAbove = 0
    let haveBelow = 0
    for (let x = 0; x < N_CLASSES; x += 1) {
      if (left[x] <= 0) continue
      if (x >= c) haveAbove += left[x]
      if (x <= c) haveBelow += left[x]
    }
    if (above > haveAbove) {
      return `${labels[c]} can't be the ${SLOT_WORDS[i]} card — the deck can't fill the slots above it`
    }
    if (below > haveBelow) {
      return `${labels[c]} can't be the ${SLOT_WORDS[i]} card — the deck can't fill the slots below it`
    }
  }
  return null
}

/** draft slot tokens → full-hand slots, validated strongest-first and dealable */
export function resolveDraftSlots(tokens: string[], tc: number, viraRankLabel?: string): HandDraft {
  const slots = tokens.map((t) => (t === '?' ? null : resolveCard(t, tc, viraRankLabel)))
  const knowns = slots.filter((c): c is number => c !== null)
  const sorted = knowns.every((c, i) => i === 0 || knowns[i - 1] >= c)
  if (!sorted) {
    throw new StudyStringError('hand slots read strongest-first — reorder the cards')
  }
  const viraCls = viraClassOf(tc)
  const avail = (cls: number) => classCopies(cls) - (cls === viraCls ? 1 : 0)
  if (!draftCompletable(slots, avail)) {
    throw new StudyStringError(
      draftProblem(slots, avail, tc, viraRankLabel) ?? `these cards can't all come from one deck`,
    )
  }
  return slots
}

/**
 * Reject a draft the walked line contradicts: the role's own plays must come
 * out of these slots, and the vira plus the other seat's open plays must
 * leave deck copies for every slot. Mirrors the study lab's own accounting —
 * hidden plays by the other seat are never charged against the hand.
 */
export function validateDraftWithLine(
  role: 'mão' | 'pé',
  slots: HandDraft,
  line: readonly number[],
  ctx: BandContext,
  tc: number,
  viraRankLabel?: string,
): void {
  const seat = role === 'pé' ? ctx.dealer : 1 - ctx.dealer
  if (draftFitsLine(slots, seat, line, ctx, tc)) return
  const who = role === 'pé' ? 'pe' : 'mao'
  const labels = classLabels(tc, viraRankLabel)
  const plays = linePlays(line, ctx)
  const own = plays.filter((p) => p.seat === seat).map((p) => p.cls)
  let rem: HandDraft | null = [...slots]
  for (const cls of own) {
    rem = draftAfterPlays(rem, [cls])
    if (rem === null) {
      throw new StudyStringError(`${who}[...] can't have played the ${labels[cls]} this line shows`)
    }
  }
  const used = new Map<number, number>([[viraClassOf(tc), 1]])
  for (const p of plays) {
    if (p.seat !== seat && p.open) used.set(p.cls, (used.get(p.cls) ?? 0) + 1)
  }
  const avail = (cls: number) => classCopies(cls) - (used.get(cls) ?? 0)
  throw new StudyStringError(
    draftProblem(slots, avail, tc, viraRankLabel) ?? `${who}[...] can't be a real hand alongside this line`,
  )
}

/**
 * Reject a draft pair that cannot be dealt from one deck alongside the line.
 * Each draft must already pass `validateDraftWithLine` on its own; this adds
 * the cross-draft accounting — both hands, the vira, and every play share
 * the same physical cards. A card the other role played openly is already
 * inside that role's own slots, so it is never charged twice.
 */
export function validateDraftsTogether(
  drafts: ReadonlyArray<{ role: 'mão' | 'pé'; slots: HandDraft }>,
  line: readonly number[],
  ctx: BandContext,
  tc: number,
  viraRankLabel?: string,
): void {
  const mao = drafts.find((d) => d.role === 'mão')
  const pe = drafts.find((d) => d.role === 'pé')
  if (!mao || !pe) return
  const maoSeat = 1 - ctx.dealer
  if (draftFitsLine(mao.slots, maoSeat, line, ctx, tc, pe.slots)) return

  // name the first per-class overflow, or fall back to a generic sentence
  const labels = classLabels(tc, viraRankLabel)
  const plays = linePlays(line, ctx)
  const certain = (slots: HandDraft, seat: number, cls: number): number => {
    const known = slots.filter((c) => c === cls).length
    const played = plays.filter((p) => p.seat === seat && p.cls === cls).length
    return Math.max(known, played)
  }
  const viraCls = viraClassOf(tc)
  for (let cls = 0; cls < N_CLASSES; cls += 1) {
    const needed =
      certain(mao.slots, maoSeat, cls) +
      certain(pe.slots, ctx.dealer, cls) +
      (cls === viraCls ? 1 : 0)
    if (needed > classCopies(cls)) {
      throw new StudyStringError(
        `mao[...] and pe[...] together need ${needed} copies of ${labels[cls]}${cls === viraCls ? ' (one is the vira)' : ''} — the deck has only ${classCopies(cls)}`,
      )
    }
  }
  throw new StudyStringError(
    `mao[...] and pe[...] can't both be dealt from one deck alongside this line`,
  )
}

/**
 * History tokens → the actor-truth action line, walking the turn rules to
 * disambiguate (`a` answers a raise or the mão de onze, otherwise it is the
 * ace). Bands with a mão de onze get the accept prepended when omitted.
 */
export function resolveHistory(
  tokens: string[],
  ctx: BandContext,
  tc: number,
  viraRankLabel?: string,
): number[] {
  const line: number[] = []
  const eleven = elevenOwner(ctx.score) !== null
  const viraCls = viraClassOf(tc)
  for (const token of tokens) {
    if (token === '/') {
      // a round separator must land exactly where a trick just completed
      const walk = walkLine(line, ctx)
      const boundary =
        walk.stage.kind === 'play' &&
        walk.stage.role === 'lead' &&
        walk.plays.length > 0 &&
        walk.plays.length % 2 === 0
      if (!boundary) {
        throw new StudyStringError(
          `that / lands mid-round — it belongs right after a round's second card`,
        )
      }
      continue
    }
    const stage = walkLine(line, ctx).stage
    const answering =
      stage.kind === 'eleven' || stage.kind === 'raise-answer'
    if (token === 'a' && answering) {
      line.push(stage.kind === 'eleven' ? 33 : 31)
      continue
    }
    if (token === 'f') {
      if (!answering) throw new StudyStringError(`"f" with nothing to fold to`)
      line.push(stage.kind === 'eleven' ? 34 : 32)
      continue
    }
    const raise = token.match(/^r(3|6|9|12)?$/)
    if (raise) {
      // stake legality mirrors the engine: no raising with a player at 11,
      // and elsewhere the ladder climbs one rung at a time from truco (3)
      if (bandForbidsRaises(ctx.score)) {
        throw new StudyStringError(
          eleven
            ? `no raising in a mão de onze hand — accepting already plays it for 3`
            : `no raising at 11 × 11 — the hand already plays for the match`,
        )
      }
      const target = nextLegalRaiseTarget(line, ctx)
      if (target === null) {
        throw new StudyStringError(
          `nothing left to raise — the stake is already at the top of the ladder`,
        )
      }
      const requested = raise[1] ? Number(raise[1]) : RAISE_TARGETS[0]
      if (requested !== target) {
        throw new StudyStringError(
          `a raise here goes to ${target}, not ${requested} — the ladder climbs one rung at a time`,
        )
      }
      line.push(27 + RAISE_TARGETS.indexOf(target))
      continue
    }
    // a card play — auto-accept the mão de onze when the string skips it
    if (eleven && line.length === 0) line.push(33)
    const faceDown = token.endsWith('*')
    const cls = resolveCard(faceDown ? token.slice(0, -1) : token, tc, viraRankLabel)
    if (!faceDown) {
      // open plays all draw on one visible deck alongside the vira
      const seen = line.filter((c) => c === cls).length + (cls === viraCls ? 1 : 0)
      if (seen >= classCopies(cls)) {
        throw new StudyStringError(
          `no copies of ${classLabels(tc, viraRankLabel)[cls]} left for that play — the vira and earlier plays use them all`,
        )
      }
    }
    line.push(faceDown ? 13 + cls : cls)
  }
  return line
}

/** class → card token under a vira */
export function cardToken(cls: number, tc: number, viraRankLabel?: string): string {
  const info = classInfos(tc, 'cards', viraRankLabel)[cls]
  return info.suit
    ? `${info.rank.toLowerCase()}${SUIT_LETTER[info.suit]}`
    : info.label.toLowerCase()
}

export function serializeStudyString(state: {
  mao: number
  pe: number
  tc: number
  viraRankLabel: string
  ctx: BandContext
  drafts: Array<{ role: 'mão' | 'pé'; slots: HandDraft; pinned: boolean }>
  line: readonly number[]
}): string {
  const parts = [`${state.mao}x${state.pe}`, `v${state.viraRankLabel.toLowerCase()}`]
  for (const draft of state.drafts) {
    const who = draft.role === 'mão' ? 'mao' : 'pe'
    const slots = draft.slots
      .map((c) => (c === null ? '?' : cardToken(c, state.tc, state.viraRankLabel)))
      .join(' ')
    parts.push(`${who}${draft.pinned ? '!' : ''}[${slots}]`)
  }
  if (state.line.length > 0) {
    const steps = walkLine(state.line, state.ctx).steps
    const tokens: string[] = []
    for (let i = 0; i < state.line.length; i += 1) {
      // a completed round gets its / before the next round's first action
      if (
        i > 0 &&
        steps[i].trick !== null &&
        steps[i - 1].trick !== null &&
        steps[i].trick !== steps[i - 1].trick
      ) {
        tokens.push('/')
      }
      const code = state.line[i]
      if (code === 31 || code === 33) tokens.push('a')
      else if (code === 32 || code === 34) tokens.push('f')
      else if (code >= 27 && code <= 30)
        tokens.push(code === 27 ? 'r' : `r${[3, 6, 9, 12][code - 27]}`)
      else if (code >= 13 && code <= 25)
        tokens.push(`${cardToken(code - 13, state.tc, state.viraRankLabel)}*`)
      else tokens.push(cardToken(code, state.tc, state.viraRankLabel))
    }
    parts.push(`: ${tokens.join(' ')}`)
  }
  return parts.join(' ')
}
