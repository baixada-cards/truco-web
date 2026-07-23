'use client'

// The handbook's eleven charts (plan 80 step 3): every solved 11xN spot as
// the lab's own block grids, one score at a time. Blue accepts, vermillion
// folds; hover or tap a cell and the readout prices both answers. Rows
// arrive as compact tuples and are re-expanded into ChartRow shape so the
// lab's cell components and helpers render them unchanged.

import { useLocale, useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import {
  BlockCellContent,
  ClassMark,
  ROLE_COLORS,
  cellStyles as cells,
  strategyRowVisual,
} from '../../components/study/ChartCells'
import {
  classInfos,
  displayActionsForRow,
  N_CLASSES,
  viraRank,
  type ChartRow,
} from '../../lib/study-data'
import styles from '../guide.module.css'
import { LabSpotLink } from '../LabSpotLink'

/** [h0, h1, h2, acceptP, acceptQ, w] — fold q is per-spot, not per-row */
type ElevenRowTuple = [number, number, number, number, number, number]

export interface ElevenSpot {
  key: string
  /** the opponent's score in the 11×N spot */
  opp: number
  /** whether the side on eleven deals this hand (answers last) */
  ownerDeals: boolean
  /** match-win % if the eleven side folds (constant across hands) */
  foldWin: number
  /** deal-weighted share of hands the solve accepts, in % */
  acceptPct: number
  rows: ElevenRowTuple[]
}

const ACCEPT = 33
const FOLD = 34

function expandRow(tuple: ElevenRowTuple, foldWin: number): ChartRow {
  const [h0, h1, h2, p, qA, w] = tuple
  const foldQ = (foldWin - 50) / 50
  return {
    hand: [h0, h1, h2],
    w,
    actions: [
      { c: ACCEPT, p, q: qA },
      { c: FOLD, p: Number((1 - p).toFixed(3)), q: foldQ },
    ],
  }
}

export function ElevenChartsPlate({ spots, tc }: { spots: ElevenSpot[]; tc: number }) {
  const t = useTranslations('Study.guide')
  const tt = useTranslations('Study.terms')
  const locale = useLocale()
  /** one decimal, with the locale's own separator (63.4 vs 63,4) */
  const fmt1 = (v: number) =>
    v.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const defaultIdx = Math.max(
    0,
    spots.findIndex((s) => s.opp === 9),
  )
  const [idx, setIdx] = useState(defaultIdx)
  const [sel, setSel] = useState<string | null>(null)

  const infos = useMemo(() => classInfos(tc, 'cards'), [tc])
  const spot = spots[idx]

  const rows = useMemo(() => spot.rows.map((r) => expandRow(r, spot.foldWin)), [spot])

  /** blocks fix the lowest card, exactly like the lab's round-1 grids */
  const blocks = useMemo(() => {
    const byLow = new Map<number, Map<string, ChartRow>>()
    for (const row of rows) {
      const low = row.hand[2]
      if (!byLow.has(low)) byLow.set(low, new Map())
      byLow.get(low)!.set(`${row.hand[0]},${row.hand[1]}`, row)
    }
    return [...byLow.entries()].sort((a, b) => a[0] - b[0])
  }, [rows])

  const selRow = sel !== null ? rows.find((r) => r.hand.join(',') === sel) : undefined

  return (
    <figure className={styles.plate}>
      <div className={`${styles.figCanvas} ${styles.gcrCanvas}`}>
        <div className={styles.elvChips} role="tablist" aria-label={t('sec.eleven.plateScoresAria')}>
          {spots.map((s, i) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={i === idx}
              className={i === idx ? styles.elvChipOn : styles.elvChip}
              onClick={() => {
                setIdx(i)
                setSel(null)
              }}
            >
              11×{s.opp}
              {s.opp === 10 ? (
                <span className={styles.elvChipNote}>
                  {s.ownerDeals ? t('sec.eleven.plateDeals') : t('sec.eleven.plateLeads')}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <p className={styles.elvSummary}>
          {t('sec.eleven.plateSummary', {
            accept: spot.acceptPct.toFixed(0),
            fold: fmt1(spot.foldWin),
          })}
        </p>

        <div className={styles.gcrBody}>
          <div className={`${cells.gridWrap} ${styles.elvGridWrap}`}>
            {blocks.map(([low, byKey]) => {
              const columns = [
                ...new Set([...byKey.keys()].map((k) => Number(k.split(',')[1]))),
              ].sort((a, b) => b - a)
              return (
                <div key={low} className={cells.block}>
                  <span className={styles.elvBadge}>
                    L = <ClassMark info={infos[low]} />
                  </span>
                  <table className={`${cells.chart} ${cells.blockTable} ${styles.gcrTable}`}>
                    <thead>
                      <tr>
                        <th className={cells.axisLabel}>{'H \\ M'}</th>
                        {columns.map((c) => (
                          <th key={c}>
                            <ClassMark info={infos[c]} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...Array(N_CLASSES).keys()].reverse().map((h) => {
                        if (!columns.some((m) => byKey.has(`${h},${m}`))) return null
                        return (
                          <tr key={h}>
                            <th>
                              <ClassMark info={infos[h]} />
                            </th>
                            {columns.map((m) => {
                              const row = byKey.get(`${h},${m}`)
                              if (!row) return <td key={m} className={cells.void} />
                              const isOn = sel === row.hand.join(',')
                              const visual = strategyRowVisual(displayActionsForRow(row))
                              return (
                                <td
                                  key={m}
                                  tabIndex={0}
                                  className={`${cells.cell} ${cells.cellMini}${isOn ? ` ${styles.gcrCellOn}` : ''}`}
                                  aria-label={row.hand.map((c) => infos[c].label).join(' ')}
                                  onMouseEnter={() => setSel(row.hand.join(','))}
                                  onFocus={() => setSel(row.hand.join(','))}
                                  onClick={() => setSel(row.hand.join(','))}
                                >
                                  <BlockCellContent visual={visual} />
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>

          <div className={styles.gcrReadout} role="status" aria-live="polite">
            {!selRow ? (
              <p className={styles.gcrHint}>{t('sec.eleven.plateHint')}</p>
            ) : (
              (() => {
                const acceptP = selRow.actions[0].p
                const acceptWin = 50 + selRow.actions[0].q * 50
                const gapPP = acceptWin - spot.foldWin
                return (
                  <>
                    <div className={styles.gcrCards}>
                      {selRow.hand.map((c, i) => (
                        <span key={i} className={cells.handRowCard}>
                          <ClassMark info={infos[c]} />
                        </span>
                      ))}
                    </div>
                    <div className={styles.gcrBar} aria-hidden>
                      <span style={{ width: `${acceptP * 100}%`, background: ROLE_COLORS.accept }} />
                      <span
                        style={{ width: `${(1 - acceptP) * 100}%`, background: ROLE_COLORS.fold }}
                      />
                    </div>
                    <div className={styles.gcrMix}>
                      <div className={styles.gcrMixRow}>
                        <span>
                          <span
                            className={styles.figSwatch}
                            style={{ background: ROLE_COLORS.accept }}
                          />
                          {tt('accept')}
                        </span>
                        <b>
                          {(acceptP * 100).toFixed(0)}% · {t('sec.eleven.plateWin', { win: fmt1(acceptWin) })}
                        </b>
                      </div>
                      <div className={styles.gcrMixRow}>
                        <span>
                          <span
                            className={styles.figSwatch}
                            style={{ background: ROLE_COLORS.fold }}
                          />
                          {tt('fold')}
                        </span>
                        <b>
                          {((1 - acceptP) * 100).toFixed(0)}% · {t('sec.eleven.plateWin', { win: fmt1(spot.foldWin) })}
                        </b>
                      </div>
                      <p className={styles.elvVerdict}>
                        {Math.abs(gapPP) < 0.5
                          ? t('sec.eleven.plateClose')
                          : gapPP > 0
                            ? t('sec.eleven.plateFoldCosts', { pp: fmt1(gapPP) })
                            : t('sec.eleven.plateAcceptCosts', { pp: fmt1(-gapPP) })}
                      </p>
                    </div>
                  </>
                )
              })()
            )}
          </div>
        </div>
      </div>
      <LabSpotLink
        spot={`${spot.ownerDeals ? `${spot.opp}x11` : `11x${spot.opp}`} v${viraRank(tc).toLowerCase()}`}
      />
      <figcaption className={styles.plateCaption}>
        <span className={styles.plateNo}>{t('plate', { no: 'XI' })}</span>{' '}
        {t('sec.eleven.plateCaption')}
      </figcaption>
    </figure>
  )
}
