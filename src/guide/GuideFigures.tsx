/* eslint-disable react-refresh/only-export-components -- server-only module:
   the doc loader and the figures that consume it live together. */
// The views chapter's figures: REAL solved data rendered through the lab's
// REAL cell components (components/study/ChartCells). Server-only — the chart
// docs are read from a compact, checked-in guide fixture at render time, so
// nothing here ships to the client but plain HTML. The full Study artifacts
// live in GCS and are not part of the application repository.
//
// Sources (all tc 0 = vira rank 4, the certified shallow exports):
//   Strategy / Cost — 11x11-tc0-d0.json, node [] (mão's opening lead), L=4 block
//   Range           — 11x11-tc0-d0.json, node [0,1] (pé leads round 2 after 4 vs 6)
//   Compare         — 11x10 vs 11x2, node [33] (opening lead after the accept), L=4 block

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

import { useTranslations } from 'next-intl'

import {
  BlockCellContent,
  ChartCellContent,
  ClassMark,
  ROLE_COLORS,
  cellStyles as cells,
  costVisual,
  diffTvVisual,
  emptyVisual,
  rangeVisual,
  strategyRowVisual,
  untrainedRowVisual,
  type CellVisual,
} from '../components/study/ChartCells'
import {
  aggregateCells,
  aggregateRows,
  classInfos,
  displayActionsForRow,
  interpretNode,
  roleOrder,
  rowSelfLossPP,
  tvDistance,
  N_CLASSES,
  type ActionRole,
  type BandContext,
  type ChartDoc,
  type ChartNode,
  type ChartRow,
  type ClassInfo,
} from '../lib/study-data'
import { ApproxFigure } from './plates/ApproxFigure'

import styles from './guide.module.css'

interface GuideFixture {
  format: 'study-guide-fixture/v1'
  docs: Record<string, ChartDoc>
  br_gap_pp: Record<string, Record<string, number>>
}

let fixtureCache: GuideFixture | null = null

function loadGuideFixture(): GuideFixture {
  if (fixtureCache) return fixtureCache
  const compressed = readFileSync(
    path.join(process.cwd(), 'src', 'guide', 'fixtures', 'study-guide-data.json.gz'),
  )
  const fixture = JSON.parse(gunzipSync(compressed).toString('utf8')) as GuideFixture
  if (fixture.format !== 'study-guide-fixture/v1') {
    throw new Error(`unsupported guide fixture: ${String(fixture.format)}`)
  }
  fixtureCache = fixture
  return fixture
}

/**
 * The full BR table is deliberately not a browser payload for a guide plate.
 * Read just the rows the plate needs at render time instead.  The binary
 * layout is the same compact v1 format decoded by study-data.ts in the lab.
 */
function brGapPPForRows(file: string, rows: readonly ChartRow[]): Record<string, number> {
  const wanted = new Set(rows.flatMap((row) => (row.table_idx === undefined ? [] : [row.table_idx])))
  if (wanted.size === 0) return {}
  const source = loadGuideFixture().br_gap_pp[file] ?? {}
  return Object.fromEntries(
    [...wanted].flatMap((tableIdx) => {
      const gap = source[String(tableIdx)]
      return gap === undefined ? [] : [[String(tableIdx), gap]]
    }),
  )
}

function loadStudyDoc(file: string): ChartDoc {
  const doc = loadGuideFixture().docs[file]
  if (!doc) throw new Error(`guide fixture: ${file} missing`)
  return doc
}

function findNode(doc: ChartDoc, history: number[]): ChartNode {
  const key = history.join('.')
  const node = doc.nodes.find((n) => n.history.join('.') === key)
  if (!node) throw new Error(`guide figure: node [${key}] missing from export`)
  return node
}

/** the lab's untrained flag for a root-reach row: certificate q-gap only */
function rowUntrained(doc: ChartDoc, row: ChartRow): boolean {
  return rowSelfLossPP(row) > (doc.certificate?.assert_qgap_pp ?? 1)
}

/** the lab's Cost row pricing at its defaults: WORST · win pp · IGNORE HIDES */
function rowCostWorstWinPP(row: ChartRow): number {
  if (row.actions.length === 0) return 0
  let pool = row.actions
  const open = pool.filter((a) => a.c < 13 || a.c > 25)
  if (open.length > 0) pool = open
  const qs = pool.map((a) => a.q)
  return Math.max(0, (Math.max(...qs) - Math.min(...qs)) * 50)
}

// ── mini renderers (same classes and cell DOM as the lab) ────────────────────

interface BlockCellSpec {
  key: number
  visual: CellVisual | null
}

function MiniBlock({
  infos,
  axis,
  blockLabel,
  columns,
  rows,
}: {
  infos: ClassInfo[]
  axis: string
  blockLabel: React.ReactNode
  columns: number[]
  rows: Array<{ h: number; cells: BlockCellSpec[] }>
}) {
  return (
    <div className={cells.block}>
      <span className={cells.blockHead}>{blockLabel}</span>
      <table className={`${cells.chart} ${cells.blockTable}`}>
        <thead>
          <tr>
            <th className={cells.axisLabel}>{axis}</th>
            {columns.map((c) => (
              <th key={c}>
                <ClassMark info={infos[c]} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ h, cells: rowCells }) => (
            <tr key={h}>
              <th>
                <ClassMark info={infos[h]} />
              </th>
              {rowCells.map(({ key, visual }) =>
                visual === null ? (
                  <td key={key} className={cells.void} />
                ) : (
                  <td key={key} className={`${cells.cell} ${cells.cellMini}`}>
                    <BlockCellContent visual={visual} />
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** one L=4-style block (fixed lowest card) of a 3-card node, per view */
function buildBlock(
  infos: ClassInfo[],
  rowsIn: ChartRow[],
  splitValue: number,
  visualOf: (row: ChartRow) => CellVisual,
): { columns: number[]; rows: Array<{ h: number; cells: BlockCellSpec[] }> } {
  const byKey = new Map<string, ChartRow>()
  for (const row of rowsIn) {
    if (row.hand[2] !== splitValue) continue
    byKey.set(`${row.hand[0]},${row.hand[1]}`, row)
  }
  const columns = [...new Set([...byKey.keys()].map((k) => Number(k.split(',')[1])))].sort(
    (a, b) => b - a,
  )
  const rows: Array<{ h: number; cells: BlockCellSpec[] }> = []
  for (let h = N_CLASSES - 1; h >= 0; h -= 1) {
    if (!columns.some((m) => byKey.has(`${h},${m}`))) continue
    rows.push({
      h,
      cells: columns.map((m) => {
        const row = byKey.get(`${h},${m}`)
        return { key: m, visual: row ? visualOf(row) : null }
      }),
    })
  }
  return { columns, rows }
}

function FigurePlate({
  no,
  caption,
  legendRoles,
  children,
}: {
  no: string
  caption: string
  legendRoles?: ActionRole[]
  children: React.ReactNode
}) {
  const t = useTranslations('Study.guide')
  const tt = useTranslations('Study.terms')
  const roleLabel = (role: ActionRole): string => {
    switch (role) {
      case 'accept':
        return tt('accept')
      case 'fold':
        return tt('fold')
      case 'raise':
        return tt('raise')
      case 'play-high':
        return tt('playHighest')
      case 'play-mid':
        return tt('playMiddle')
      case 'play-low':
        return tt('playLowest')
      case 'hide-high':
        return tt('hideHighest')
      case 'hide-mid':
        return tt('hideMiddle')
      case 'hide-low':
        return tt('hideLowest')
    }
  }
  return (
    <figure className={styles.plate}>
      <div className={styles.figCanvas}>
        {children}
        {legendRoles && legendRoles.length > 0 ? (
          <div className={styles.figLegend}>
            {legendRoles.map((role) => (
              <span key={role}>
                <span className={styles.figSwatch} style={{ background: ROLE_COLORS[role] }} />
                {roleLabel(role)}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <figcaption className={styles.plateCaption}>
        <span className={styles.plateNo}>{t('plate', { no })}</span> {caption}
      </figcaption>
    </figure>
  )
}

// ── the four figures ─────────────────────────────────────────────────────────

const STRATEGY_DOC = '11x11-tc0-d0.json'

export function StrategyBlockFigure() {
  const t = useTranslations('Study.guide')
  const doc = loadStudyDoc(STRATEGY_DOC)
  const node = findNode(doc, [])
  const infos = classInfos(doc.tc, 'cards')
  const block = buildBlock(infos, node.rows, 0, (row) =>
    rowUntrained(doc, row) ? untrainedRowVisual(displayActionsForRow(row)) : strategyRowVisual(displayActionsForRow(row)),
  )
  const roles = new Set<ActionRole>()
  for (const row of node.rows) {
    if (row.hand[2] !== 0 || rowUntrained(doc, row)) continue
    for (const { role, p } of displayActionsForRow(row)) {
      if (p > 0) roles.add(role)
    }
  }
  return (
    <FigurePlate
      no="IV"
      caption={t('sec.views.strategy.figCaption')}
      legendRoles={[...roles].sort((a, b) => roleOrder(a) - roleOrder(b))}
    >
      <MiniBlock
        infos={infos}
        axis="H \ M"
        blockLabel={
          <>
            L = <ClassMark info={infos[0]} />
          </>
        }
        columns={block.columns}
        rows={block.rows}
      />
    </FigurePlate>
  )
}

export function CostBlockFigure() {
  const t = useTranslations('Study.guide')
  const doc = loadStudyDoc(STRATEGY_DOC)
  const node = findNode(doc, [])
  const infos = classInfos(doc.tc, 'cards')
  const block = buildBlock(infos, node.rows, 0, (row) =>
    rowUntrained(doc, row) ? untrainedRowVisual(displayActionsForRow(row)) : costVisual(rowCostWorstWinPP(row), 25),
  )
  return (
    <FigurePlate no="VI" caption={t('sec.views.cost.figCaption')}>
      <MiniBlock
        infos={infos}
        axis="H \ M"
        blockLabel={
          <>
            L = <ClassMark info={infos[0]} />
          </>
        }
        columns={block.columns}
        rows={block.rows}
      />
    </FigurePlate>
  )
}

export function RangeGridFigure() {
  const t = useTranslations('Study.guide')
  const tl = useTranslations('Study.lab')
  const doc = loadStudyDoc(STRATEGY_DOC)
  // pé leads round 2 after answering mão's 4 with a 6 — pé's own reply
  // decision is what reach-weights this range
  const node = findNode(doc, [0, 1])
  const ctx: BandContext = { dealer: doc.dealer, score: doc.score }
  const own = interpretNode(node, ctx).ownPlayed
  const infos = classInfos(doc.tc, 'cards')
  const agg = aggregateCells(node, own, { pair: 'HM' })
  let total = 0
  let max = 0
  for (const cell of agg.values()) {
    total += cell.weight
    max = Math.max(max, cell.weight)
  }
  return (
    <FigurePlate no="V" caption={t('sec.views.range.figCaption')}>
      <div className={cells.gridWrap}>
        <table className={cells.chart}>
          <thead>
            <tr>
              <th className={cells.axisLabel}>{tl('axisHiLo')}</th>
              {[...Array(N_CLASSES).keys()].reverse().map((i) => (
                <th key={i}>
                  <ClassMark info={infos[i]} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...Array(N_CLASSES).keys()].reverse().map((h1) => (
              <tr key={h1}>
                <th>
                  <ClassMark info={infos[h1]} />
                </th>
                {[...Array(N_CLASSES).keys()].reverse().map((h2) => {
                  if (h2 > h1) return <td key={h2} className={cells.void} />
                  const cell = agg.get(`${h1},${h2}`)
                  if (!cell) return <td key={h2} className={cells.void} />
                  const visual = rangeVisual(
                    total > 0 ? cell.weight / total : 0,
                    max > 0 ? cell.weight / max : 0,
                  )
                  return (
                    <td
                      key={h2}
                      className={cells.cell}
                      aria-label={`${infos[h1].label} ${infos[h2].label}`}
                    >
                      <ChartCellContent visual={visual} untrained={false} />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </FigurePlate>
  )
}

export function CompareBlockFigure() {
  const t = useTranslations('Study.guide')
  const here = loadStudyDoc('11x10-tc0-d0.json')
  const there = loadStudyDoc('11x2-tc0-d0.json')
  const hereNode = findNode(here, [33])
  const thereNode = findNode(there, [33])
  const infos = classInfos(here.tc, 'cards')
  const thereByHand = new Map(thereNode.rows.map((r) => [r.hand.join(','), r]))
  const block = buildBlock(infos, hereNode.rows, 0, (row) => {
    if (rowUntrained(here, row)) return untrainedRowVisual(displayActionsForRow(row))
    const other = thereByHand.get(row.hand.join(','))
    if (!other) return emptyVisual()
    const a = aggregateRows([row])
    const b = aggregateRows([other])
    return diffTvVisual(tvDistance(a.mix, b.mix))
  })
  return (
    <FigurePlate no="VII" caption={t('sec.views.compare.figCaption')}>
      <MiniBlock
        infos={infos}
        axis="H \ M"
        blockLabel={
          <>
            L = <ClassMark info={infos[0]} />
          </>
        }
        columns={block.columns}
        rows={block.rows}
      />
    </FigurePlate>
  )
}

/**
 * A real weak corner from the only currently shipped per-node BR pilot.  The
 * chart's rows and the quality measurements come from the same 11x10 v4
 * export; only this 87-row slice crosses the server/client boundary.
 */
export function TrustWarningFigure() {
  const t = useTranslations('Study.guide')
  const doc = loadStudyDoc('11x10-tc0-d1-deep.json.gz')
  // mão accepted the hand of eleven, led the 5♥, and is now replying to the 4.
  const node = findNode(doc, [33, 1, 0])
  const brGapPPByTable = brGapPPForRows('11x10-tc0-d1.brgaps.gz', node.rows)
  const weak = Object.values(brGapPPByTable).filter((gapPP) => gapPP > 5).length
  return (
    <ApproxFigure
      tc={doc.tc}
      qgapPP={doc.certificate?.assert_qgap_pp ?? 1}
      ownPlayed={[1]}
      rows={node.rows}
      brGapPPByTable={brGapPPByTable}
      plateNo="VI"
      caption={t('sec.trust.warningCaption', { n: weak })}
    />
  )
}

// exported for the chart chapter's real-data reader, which shares the cache
export { loadStudyDoc, findNode }
