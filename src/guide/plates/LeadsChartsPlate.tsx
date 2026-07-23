'use client'

// The handbook's opening-lead charts: the root decision of the solved spots
// where the leader picks the first card (or calls truco straight away),
// rendered as the lab's own block grids. Hover or tap a cell and the readout
// prices every available first action for that exact hand. Rows arrive as
// compact tuples and are re-expanded into ChartRow shape so the lab's cell
// components and helpers render them unchanged.

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
  roleOrder,
  viraRank,
  N_CLASSES,
  type ChartRow,
} from '../../lib/study-data'
import styles from '../guide.module.css'
import { LabSpotLink } from '../LabSpotLink'

/** [h0, h1, h2, w, ...perAction: code, p, q] — actions flattened in export order */
export type LeadsRowTuple = number[]

export interface LeadsSpot {
  key: string
  /** localized via `sec.leads.spot{Key}` message ids */
  labelKey: string
  /** deal-weighted digest, precomputed by the fixture script */
  digest: { top: number; mid: number; low: number; raise: number; manilhaHands: number; manilhaLeads: number }
  rows: LeadsRowTuple[]
}

function expandRow(tuple: LeadsRowTuple): ChartRow {
  const [h0, h1, h2, w, ...rest] = tuple
  const actions = []
  for (let i = 0; i + 3 <= rest.length; i += 3) {
    actions.push({ c: rest[i], p: rest[i + 1], q: rest[i + 2] })
  }
  return { hand: [h0, h1, h2], w, actions }
}

export function LeadsChartsPlate({ spots, tc }: { spots: LeadsSpot[]; tc: number }) {
  const t = useTranslations('Study.guide')
  const locale = useLocale()
  const fmt1 = (v: number) =>
    v.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const [idx, setIdx] = useState(0)
  const [sel, setSel] = useState<string | null>(null)

  const infos = useMemo(() => classInfos(tc, 'cards'), [tc])
  const spot = spots[idx]

  const rows = useMemo(() => spot.rows.map(expandRow), [spot])

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
        <div className={styles.elvChips} role="tablist" aria-label={t('sec.leads.plateSpotsAria')}>
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
              {t(`sec.leads.${s.labelKey}`)}
            </button>
          ))}
        </div>

        <p className={styles.elvSummary}>
          {t('sec.leads.plateSummary', {
            top: fmt1(spot.digest.top),
            mid: fmt1(spot.digest.mid),
            low: fmt1(spot.digest.low),
            raise: fmt1(spot.digest.raise),
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
              <p className={styles.gcrHint}>{t('sec.leads.plateHint')}</p>
            ) : (
              (() => {
                const shown = displayActionsForRow(selRow)
                  .filter((a) => a.p > 0.0005 || a.action.c >= 27)
                  .sort((a, b) => roleOrder(a.role) - roleOrder(b.role))
                const bestQ = Math.max(...selRow.actions.map((a) => a.q))
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
                      {shown.map((a) => (
                        <span
                          key={a.action.c}
                          style={{ width: `${a.p * 100}%`, background: ROLE_COLORS[a.role] }}
                        />
                      ))}
                    </div>
                    <div className={styles.gcrMix}>
                      {shown.map((a) => {
                        const win = 50 + a.action.q * 50
                        const gapPP = (bestQ - a.action.q) * 50
                        const label =
                          a.action.c >= 27 && a.action.c <= 30
                            ? t('sec.leads.roleTruco')
                            : infos[a.action.c]?.label ?? String(a.action.c)
                        return (
                          <div key={a.action.c} className={styles.gcrMixRow}>
                            <span>
                              <span
                                className={styles.figSwatch}
                                style={{ background: ROLE_COLORS[a.role] }}
                              />
                              {label}
                            </span>
                            <b>
                              {(a.p * 100).toFixed(0)}% ·{' '}
                              {t('sec.leads.plateWin', { win: fmt1(win) })}
                              {gapPP > 0.5 ? ` · −${fmt1(gapPP)} pp` : ''}
                            </b>
                          </div>
                        )
                      })}
                      <p className={styles.elvVerdict}>{t('sec.leads.plateVerdict')}</p>
                    </div>
                  </>
                )
              })()
            )}
          </div>
        </div>
      </div>
      <LabSpotLink spot={`${spot.key.split('-')[0]} v${viraRank(tc).toLowerCase()}`} />
      <figcaption className={styles.plateCaption}>
        <span className={styles.plateNo}>{t('plate', { no: 'XII' })}</span>{' '}
        {t('sec.leads.plateCaption')}
      </figcaption>
    </figure>
  )
}
