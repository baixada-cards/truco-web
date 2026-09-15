// The hand-of-eleven fixture: every solved 11×N root, snapshotted by
// scripts/build_eleven_handbook_fixture.mjs and checked in, never read from
// the lab's manifest. Server-only (node:fs). The eleven chapter digests all
// of it for its charts plate; the chart chapter borrows one spot as the
// worked example a reader learns the grid on, since accept-or-fold is the
// simplest decision the solve ever draws.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

import type { ChartNode, ChartRow } from '../lib/study-data'
import type { ElevenSpot } from './plates/ElevenChartsPlate'

export interface ElevenFixture {
  format: string
  source: string
  spots: Record<string, { score: [number, number]; dealer: number; tc: number; node: ChartNode }>
}

let fixtureCache: ElevenFixture | null = null

export function loadElevenFixture(): ElevenFixture {
  if (fixtureCache) return fixtureCache
  const compressed = readFileSync(
    path.join(process.cwd(), 'src', 'guide', 'fixtures', 'eleven-handbook-data.json.gz'),
  )
  const fixture = JSON.parse(gunzipSync(compressed).toString('utf8')) as ElevenFixture
  if (fixture.format !== 'eleven-handbook-fixture/v1') {
    throw new Error(`unexpected eleven fixture format: ${fixture.format}`)
  }
  fixtureCache = fixture
  return fixture
}

/** the spot the chart chapter reads: eleven against nine, the eleven side
 *  dealing — a real mix of accepts and folds across the grid */
export const CHART_CHAPTER_SPOT = '11x9-tc0-d0.json'

export const ACCEPT = 33
export const FOLD = 34

function actionP(row: ChartRow, code: number): number {
  return row.actions.find((a) => a.c === code)?.p ?? 0
}
function actionQ(row: ChartRow, code: number): number {
  return row.actions.find((a) => a.c === code)?.q ?? 0
}

/** one spot's node → the compact payload the client plate mounts with */
export function digestElevenSpot(key: string, spot: ElevenFixture['spots'][string]): ElevenSpot {
  const rows = spot.node.rows
  const totalW = rows.reduce((s, r) => s + r.w, 0)
  const acceptMass = rows.reduce((s, r) => s + r.w * actionP(r, ACCEPT), 0)
  const foldQ = actionQ(rows[0], FOLD)
  return {
    key,
    opp: spot.score[1],
    // in every solved d0 spot the eleven side is also the dealer; d1 is the
    // one solved spot where it leads instead (see plan 80 / data survey)
    ownerDeals: spot.dealer === 0,
    foldWin: 50 + foldQ * 50,
    acceptPct: (acceptMass / totalW) * 100,
    rows: rows.map((r) => [
      r.hand[0],
      r.hand[1],
      r.hand[2],
      Number(actionP(r, ACCEPT).toFixed(3)),
      Number(actionQ(r, ACCEPT).toFixed(4)),
      Number(r.w.toFixed(6)),
    ]),
  }
}
