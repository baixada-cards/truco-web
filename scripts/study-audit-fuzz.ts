// Study-lab invariant probes from the plan-78 constraint audit that are too
// heavy for unit tests. Run from truco-frontend with:
//
//   pnpm node --experimental-strip-types scripts/study-audit-fuzz.ts
//
// A. URL round-trip fuzz: serialize ∘ parse ∘ serialize must be a fixed
//    point (and the resolved line identical) over ~10k random UI-reachable
//    states — lines with raises, re-raises, hides and folds across bands,
//    plus single and double drafts that fit the line jointly.
// B. Export scan: every row of every chart doc, clicked at its own node,
//    must pass draftFitsLine (frontier row/cell clicks are never rejected),
//    and no row may out-run the deck copies.

import { readdirSync, readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  classCopies,
  draftFitsLine,
  draftWithPlays,
  interpretNode,
  nextLegalRaiseTarget,
  RAISE_TARGETS,
  remainingHand,
  viraClassOf,
  walkLine,
  type BandContext,
  type ChartNode,
  type HandDraft,
} from '../src/lib/study-data.ts'
import {
  parseStudyString,
  resolveDraftSlots,
  resolveHistory,
  serializeStudyString,
  validateDraftWithLine,
  validateDraftsTogether,
} from '../src/lib/study-string.ts'

const here = path.dirname(fileURLToPath(import.meta.url))

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(20260713)
const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]

// ── A. URL round-trip fuzz ───────────────────────────────────────────────────

const CTXS: Array<{ ctx: BandContext; mao: number; pe: number }> = [
  { ctx: { dealer: 0, score: [11, 11] }, mao: 11, pe: 11 },
  { ctx: { dealer: 1, score: [11, 11] }, mao: 11, pe: 11 },
  { ctx: { dealer: 0, score: [11, 9] }, mao: 9, pe: 11 },
  { ctx: { dealer: 0, score: [10, 10] }, mao: 10, pe: 10 },
  { ctx: { dealer: 1, score: [11, 10] }, mao: 11, pe: 10 },
]

/** legal-ish next actions, mirroring UI reachability (stop before trick 3);
 *  raises follow the stake ladder the parser now enforces (audit F8) */
function legalNext(line: number[], ctx: BandContext): number[] {
  const walk = walkLine(line, ctx)
  if (walk.folded || walk.toAct === null) return []
  if (walk.stage.kind === 'play' && walk.stage.trick >= 3) return []
  if (walk.stage.kind === 'eleven') return [33, 34]
  const raiseTo = nextLegalRaiseTarget(line, ctx)
  const raiseCode = raiseTo === null ? null : 27 + RAISE_TARGETS.indexOf(raiseTo)
  if (walk.stage.kind === 'raise-answer') {
    return raiseCode === null ? [31, 31, 32] : [31, 31, 32, raiseCode]
  }
  const viraCls = viraClassOf(0)
  const opts: number[] = raiseCode === null ? [] : [raiseCode]
  for (let c = 0; c < 13; c += 1) {
    const seen = line.filter((x) => x === c).length + (c === viraCls ? 1 : 0)
    if (seen < classCopies(c)) opts.push(c)
    opts.push(13 + c)
  }
  return opts
}

let fuzzFails = 0
const N_FUZZ = 10000
for (let it = 0; it < N_FUZZ; it += 1) {
  const { ctx, mao, pe } = pick(CTXS)
  const line: number[] = []
  for (let i = 0, n = Math.floor(rnd() * 8); i < n; i += 1) {
    const opts = legalNext(line, ctx)
    if (opts.length === 0) break
    line.push(pick(opts))
  }
  const drafts: Array<{ role: 'mão' | 'pé'; slots: HandDraft; pinned: boolean }> = []
  for (const role of ['mão', 'pé'] as const) {
    if (rnd() < 0.5) continue
    const seat = role === 'pé' ? ctx.dealer : 1 - ctx.dealer
    const other = drafts[0]?.slots
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const raw: HandDraft = [0, 1, 2].map(() => (rnd() < 0.35 ? null : Math.floor(rnd() * 13)))
      const known = raw.filter((x): x is number => x !== null).sort((a, b) => b - a)
      let ki = 0
      const slots: HandDraft = raw.map((x) => (x === null ? null : known[ki++]))
      if (slots.every((x) => x === null)) continue
      if (draftFitsLine(slots, seat, line, ctx, 0, other)) {
        drafts.push({ role, slots, pinned: rnd() < 0.4 })
        break
      }
    }
  }
  const state = { mao, pe, tc: 0, viraRankLabel: '4', ctx, drafts, line }
  try {
    const s1 = serializeStudyString(state)
    const ast = parseStudyString(s1)
    const line2 = ast.history ? resolveHistory(ast.history, ctx, 0) : []
    const drafts2 = (ast.drafts ?? []).map((d) => {
      const slots = resolveDraftSlots(d.slots, 0)
      validateDraftWithLine(d.role, slots, line2, ctx, 0)
      return { role: d.role, slots, pinned: d.pinned }
    })
    validateDraftsTogether(drafts2, line2, ctx, 0)
    const s2 = serializeStudyString({ ...state, drafts: drafts2, line: line2 })
    if (s2 !== s1 || JSON.stringify(line2) !== JSON.stringify(line)) {
      fuzzFails += 1
      if (fuzzFails <= 8) console.log(`RT BREAK:\n  s1=${s1}\n  s2=${s2}`)
    }
  } catch (e) {
    fuzzFails += 1
    if (fuzzFails <= 8) {
      console.log(
        `PIPELINE THROWS: line=${JSON.stringify(line)} drafts=${JSON.stringify(drafts)} ctx=${JSON.stringify(ctx)}: ${(e as Error).message}`,
      )
    }
  }
}
console.log(`A. round-trip fuzz: ${N_FUZZ} states, failures=${fuzzFails}`)

// ── B. export scan ───────────────────────────────────────────────────────────

function actorTruthLines(history: number[]): number[][] {
  // 26 (opponent hidden) is unknowable — probe both extremes so the scan
  // catches any accidental charging of hidden plays
  const a = history.map((c) => (c === 26 ? 13 + 0 : c))
  const b = history.map((c) => (c === 26 ? 13 + 12 : c))
  return history.includes(26) ? [a, b] : [a]
}

const studyDir = path.join(here, '..', 'public', 'study')
let checkedRows = 0
let rowRejects = 0
let deckBad = 0
const files = readdirSync(studyDir).filter((f) => f.endsWith('.json') && f !== 'manifest.json')
for (const file of files) {
  const doc = JSON.parse(readFileSync(path.join(studyDir, file), 'utf8'))
  const deepFile = file.replace('.json', '-deep.json.gz')
  let nodes: ChartNode[] = doc.nodes
  try {
    const deep = JSON.parse(gunzipSync(readFileSync(path.join(studyDir, deepFile))).toString())
    nodes = [...doc.nodes, ...deep.nodes]
  } catch {
    /* shallow-only spot */
  }
  const ctx: BandContext = { dealer: doc.dealer, score: doc.score }
  for (const node of nodes) {
    for (const line of actorTruthLines(node.history)) {
      const interp = interpretNode({ ...node, history: line } as ChartNode, ctx)
      for (const row of node.rows) {
        checkedRows += 1
        for (const c of new Set(row.hand)) {
          const copies = classCopies(c) - (c === viraClassOf(doc.tc) ? 1 : 0)
          if (row.hand.filter((x: number) => x === c).length > copies) deckBad += 1
        }
        const rem = remainingHand(row.hand, interp.ownPlayed)
        const slots = draftWithPlays(rem as HandDraft, interp.ownPlayed)
        if (!draftFitsLine(slots, node.player, line, ctx, doc.tc)) {
          rowRejects += 1
          if (rowRejects <= 5) {
            console.log(`ROW REJECT ${file} hist=${node.history.join('.')} hand=${row.hand}`)
          }
        }
      }
    }
  }
}
console.log(
  `B. export scan: ${files.length} spots, ${checkedRows} row-checks, frontier rejects=${rowRejects}, deck-impossible=${deckBad}`,
)

if (fuzzFails > 0 || rowRejects > 0 || deckBad > 0) process.exit(1)
console.log('all probes green')
