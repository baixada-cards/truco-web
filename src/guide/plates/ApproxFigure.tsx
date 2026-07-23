'use client'

// Plate II·b — a real chart corner wearing ≈ (plan 77 J-5): an exact
// two-card grid from the deep export where the solve rarely arrives, so
// many mixes were never really trained. Hover or tap a cell and the
// readout says exactly why it is (or isn't) flagged, with the real
// self-loss numbers against the certificate's tolerance.

import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import {
  ChartCellContent,
  ClassMark,
  ROLE_COLORS,
  cellStyles as cells,
  strategyRowVisual,
  untrainedRowVisual,
} from '../../components/study/ChartCells'
import {
  actionRole,
  classInfos,
  displayActionsForRow,
  remainingHand,
  roleOrder,
  rowSelfLossPP,
  N_CLASSES,
  type ActionRole,
  type ChartRow,
} from '../../lib/study-data'
import styles from '../guide.module.css'

export function ApproxFigure({
  tc,
  qgapPP,
  ownPlayed,
  rows,
  brGapPPByTable,
  plateNo = 'II·b',
  caption,
}: {
  tc: number
  /** the certificate's per-infoset tolerance (pp) */
  qgapPP: number
  /** classes the acting player already played on this line */
  ownPlayed: number[]
  rows: ChartRow[]
  /** Per-row adversarial BR loss in pp, when this plate has a measured slice. */
  brGapPPByTable?: Record<string, number>
  plateNo?: string
  caption?: string
}) {
  const t = useTranslations('Study.guide')
  const tl = useTranslations('Study.lab')
  const tt = useTranslations('Study.terms')
  const [sel, setSel] = useState<string | null>(null)

  const infos = useMemo(() => classInfos(tc, 'cards'), [tc])
  const labels = useMemo(() => infos.map((c) => c.label), [infos])

  const byRem = useMemo(() => {
    const map = new Map<string, { row: ChartRow; rem: number[] }>()
    for (const row of rows) {
      const rem = remainingHand(row.hand, ownPlayed)
      map.set(`${rem[0]},${rem[1]}`, { row, rem })
    }
    return map
  }, [rows, ownPlayed])

  const selected = sel ? byRem.get(sel) : undefined
  const selLoss = selected ? rowSelfLossPP(selected.row) : 0
  const selectedBrGap =
    selected?.row.table_idx === undefined ? undefined : brGapPPByTable?.[String(selected.row.table_idx)]

  const actionText = (role: ActionRole, rem: readonly number[]): string => {
    if (role === 'accept') return tt('accept')
    if (role === 'fold') return tt('fold')
    if (role === 'raise') return tt('raise')
    const verb = role.startsWith('hide') ? tt('hide') : tt('play')
    const slot = role.endsWith('high') ? 0 : role.endsWith('mid') ? 1 : rem.length - 1
    return `${verb} ${labels[rem[slot]]}`
  }

  return (
    <figure className={styles.plate}>
      <div className={styles.figCanvas}>
        <div className={styles.gcrBody}>
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
                      const key = `${h1},${h2}`
                      const entry = byRem.get(key)
                      if (!entry) return <td key={h2} className={cells.void} />
                      const brGap =
                        entry.row.table_idx === undefined
                          ? undefined
                          : brGapPPByTable?.[String(entry.row.table_idx)]
                      // The lab's new headline signal is adversarial BR loss.
                      // The old self-loss threshold remains only for exports
                      // that predate the compact BR table.
                      const untrained = brGap === undefined ? rowSelfLossPP(entry.row) > qgapPP : brGap > 5
                      const acts = displayActionsForRow(entry.row, ownPlayed)
                      const visual = untrained
                        ? untrainedRowVisual(acts)
                        : strategyRowVisual(acts)
                      return (
                        <td
                          key={h2}
                          tabIndex={0}
                          className={`${cells.cell}${sel === key ? ` ${styles.gcrCellOn}` : ''}`}
                          aria-label={entry.rem.map((c) => labels[c]).join(' ')}
                          onMouseEnter={() => setSel(key)}
                          onFocus={() => setSel(key)}
                          onClick={() => setSel(key)}
                        >
                          <ChartCellContent visual={visual} untrained={untrained} />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.gcrReadout} role="status" aria-live="polite">
            {!selected ? (
              <p className={styles.gcrHint}>{t('gax.hint')}</p>
            ) : (
              <>
                <div className={styles.gcrCards}>
                  {selected.rem.map((c, i) => (
                    <span key={i} className={cells.handRowCard}>
                      <ClassMark info={infos[c]} />
                    </span>
                  ))}
                </div>
                {selectedBrGap !== undefined && selectedBrGap > 5 ? (
                  <p className={styles.gaxFlagged}>{t('gax.flaggedBr', { pp: selectedBrGap.toFixed(1) })}</p>
                ) : selLoss > qgapPP && selectedBrGap === undefined ? (
                  <p className={styles.gaxFlagged}>
                    {t('gax.flagged', { pp: selLoss.toFixed(1), tol: qgapPP })}
                  </p>
                ) : (
                  <>
                    <p className={styles.gcrHint}>
                      {selectedBrGap === undefined
                        ? t('gax.trained', { pp: selLoss.toFixed(1), tol: qgapPP })
                        : t('gax.measuredBr', { pp: selectedBrGap.toFixed(1) })}
                    </p>
                    <div className={styles.gcrMix}>
                      {displayActionsForRow(selected.row, ownPlayed)
                        .filter(({ p }) => p > 0)
                        .sort((a, b) => roleOrder(a.role) - roleOrder(b.role))
                        .map(({ action, p }) => {
                          const role = actionRole(action.c, selected.rem)
                          return (
                            <div key={action.c} className={styles.gcrMixRow}>
                              <span>
                                <span
                                  className={styles.figSwatch}
                                  style={{ background: ROLE_COLORS[role] }}
                                />
                                {actionText(role, selected.rem)}
                              </span>
                              <b>
                                {(p * 100).toFixed(1)}% · {tl('win')}{' '}
                                {(50 + action.q * 50).toFixed(1)}%
                              </b>
                            </div>
                          )
                        })}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <figcaption className={styles.plateCaption}>
        <span className={styles.plateNo}>{t('plate', { no: plateNo })}</span>{' '}
        {caption ??
          t('gax.caption', {
            n: [...byRem.values()].filter(({ row }) => rowSelfLossPP(row) > qgapPP).length,
          })}
      </figcaption>
    </figure>
  )
}
