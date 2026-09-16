// The method chapter's worked example, read at render time from the same
// certified export the lab draws: the leader's opening lead at 11×11 with a
// 4 turned up (the tour's spot). The chapter names a habit ("lead your
// strongest card"), prices it over every holding, and reads a rule off the
// chart; every number it prints comes from here, never from the copy.
// Server-only (node:fs through the guide fixture loader).

import { classInfos, type ChartRow } from '../lib/study-data'
import { loadStudyDoc } from './GuideFigures'

export const METHOD_SPOT_FILE = '11x11-tc0-d0.json'
/** the study-notation spot the chapter deep-links */
export const METHOD_SPOT = '11x11 v4'

const TC = 0
/** classes at or above this index are manilhas (four suits, weakest first) */
const FIRST_MANILHA = 9

export interface HabitPrice {
  /** reach-weighted average cost per deal, match-win percentage points */
  avgPp: string
  /** holdings where the habit costs nothing */
  free: number
  worstHand: string
  worstPp: string
  /** what the solve plays at the worst holding */
  worstBest: string
}

export interface MethodFacts {
  holdings: number
  /** holdings with more than one action above the lab's 3% display floor */
  mixing: number
  /** the leader's match-win chance when both sides follow the solve */
  equityPct: string
  oneManilha: number
  oneManilhaPct: string
  oneManilhaLeadsManilha: number
  oneManilhaLeadsWeakest: number
  noManilha: number
  noManilhaStrongest: number
  noManilhaWeakest: number
  strongest: HabitPrice
  weakest: HabitPrice
  /** the dearest cell for the lab's own most-played baseline */
  mostPlayedMaxPp: string
}

function bestQ(row: ChartRow): number {
  return Math.max(...row.actions.map((a) => a.q))
}

function actionQ(row: ChartRow, code: number): number | undefined {
  return row.actions.find((a) => a.c === code)?.q
}

/** cost of always playing `code` at this holding, in match-win pp */
function pricePp(row: ChartRow, code: number): number | undefined {
  const q = actionQ(row, code)
  return q === undefined ? undefined : 50 * (bestQ(row) - q)
}

let cache: MethodFacts | null = null

export function methodFacts(): MethodFacts {
  if (cache) return cache
  const doc = loadStudyDoc(METHOD_SPOT_FILE)
  const root = doc.nodes.find((n) => n.history.length === 0)
  if (!root) throw new Error(`${METHOD_SPOT_FILE}: no root node`)
  const rows = root.rows
  const labels = classInfos(TC, 'cards').map((c) => c.label)
  const handLabel = (hand: readonly number[]) =>
    [...hand].sort((a, b) => b - a).map((c) => labels[c]).join(' ')
  const playLabel = (code: number) => labels[code % 13]
  const totalW = rows.reduce((s, r) => s + r.w, 0)

  const priceHabit = (pick: (hand: readonly number[]) => number): HabitPrice => {
    let weighted = 0
    let free = 0
    let worst: { pp: number; row: ChartRow } | null = null
    for (const row of rows) {
      const pp = pricePp(row, pick(row.hand))
      if (pp === undefined) continue
      weighted += pp * row.w
      if (pp < 0.05) free += 1
      if (!worst || pp > worst.pp) worst = { pp, row }
    }
    if (!worst) throw new Error('habit never legal')
    const best = worst.row.actions.reduce((a, b) => (b.q > a.q ? b : a))
    return {
      avgPp: (weighted / totalW).toFixed(1),
      free,
      worstHand: handLabel(worst.row.hand),
      worstPp: worst.pp.toFixed(0),
      worstBest: playLabel(best.c),
    }
  }

  const mostPlayed = (row: ChartRow) => row.actions.reduce((a, b) => (b.p > a.p ? b : a))
  const manilhas = (hand: readonly number[]) => hand.filter((c) => c >= FIRST_MANILHA).length

  const one = rows.filter((r) => manilhas(r.hand) === 1)
  const none = rows.filter((r) => manilhas(r.hand) === 0)
  const oneW = one.reduce((s, r) => s + r.w, 0)
  const leads = (row: ChartRow) => mostPlayed(row).c % 13

  const equity = rows.reduce((s, r) => s + r.w * bestQ(r), 0) / totalW

  cache = {
    holdings: rows.length,
    mixing: rows.filter((r) => r.actions.filter((a) => a.p > 0.03).length > 1).length,
    equityPct: (50 + 50 * equity).toFixed(1),
    oneManilha: one.length,
    oneManilhaPct: ((100 * oneW) / totalW).toFixed(0),
    oneManilhaLeadsManilha: one.filter((r) => leads(r) >= FIRST_MANILHA).length,
    oneManilhaLeadsWeakest: one.filter((r) => leads(r) === Math.min(...r.hand)).length,
    noManilha: none.length,
    noManilhaStrongest: none.filter((r) => leads(r) === Math.max(...r.hand)).length,
    noManilhaWeakest: none.filter((r) => leads(r) === Math.min(...r.hand)).length,
    strongest: priceHabit((hand) => Math.max(...hand)),
    weakest: priceHabit((hand) => Math.min(...hand)),
    mostPlayedMaxPp: Math.max(...rows.map((r) => 50 * (bestQ(r) - mostPlayed(r).q))).toFixed(1),
  }
  return cache
}
