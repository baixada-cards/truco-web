'use client'

// Plate II — the real chart reader (plan 77 C). One exact block of a real
// solved node, rendered with the lab's own cell components: pick both which
// hand slot and which card the block pins, hover or tap a cell, and the
// readout names the three cards and spells out the full mix with each action's
// win %.
//
// The brass badge is clickable here too (plan 77 L-3), sharing the lab's
// BlockBadge component with allowModeToggle={false}: the teaching figure is
// always one chart, but its split (H·M·L) and pinned card are both selectable.
// It starts at L = 7, avoiding the degenerate L = 4 view when the split moves.

import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import {
  BlockBadge,
  BlockCellContent,
  ClassMark,
  ROLE_COLORS,
  cellStyles as cells,
  strategyRowVisual,
  untrainedRowVisual,
} from '../../components/study/ChartCells'
import {
  classInfos,
  displayActionsForRow,
  roleOrder,
  rowSelfLossPP,
  N_CLASSES,
  type ActionRole,
  type ChartRow,
} from '../../lib/study-data'
import styles from '../guide.module.css'

const SLOT_NAMES = ['H', 'M', 'L'] as const
const DEFAULT_PINNED_RANK = '7'

export function GuideChartReader({
  tc,
  qgapPP,
  rows,
}: {
  tc: number
  /** the certificate's per-infoset tolerance, for the ≈ flag */
  qgapPP: number
  /** the real node's rows (hand, weight, exported actions) — every hand,
   *  not pre-filtered to one block, so the badge's split choice has real
   *  data to reslice */
  rows: ChartRow[]
}) {
  const t = useTranslations('Study.guide')
  const tl = useTranslations('Study.lab')
  const tt = useTranslations('Study.terms')
  const [sel, setSel] = useState<string | null>(null)
  const [split, setSplit] = useState<0 | 1 | 2>(2)
  const [badgeOpen, setBadgeOpen] = useState(false)

  const infos = useMemo(() => classInfos(tc, 'cards'), [tc])
  const labels = useMemo(() => infos.map((c) => c.label), [infos])
  /** All plain ranks have a unique class. Keep the default rank-based rather
   * than relying on a class index that would drift if the turn-up changes. */
  const defaultPinned = useMemo(
    () => infos.findIndex((info) => info.rank === DEFAULT_PINNED_RANK && info.suit === null),
    [infos],
  )
  const [pinned, setPinned] = useState(defaultPinned)

  const [ax0, ax1] = ([0, 1, 2] as const).filter((i) => i !== split)

  const byKey = useMemo(() => {
    const map = new Map<string, ChartRow>()
    for (const r of rows) {
      if (r.hand[split] === pinned) map.set(`${r.hand[ax0]},${r.hand[ax1]}`, r)
    }
    return map
  }, [rows, split, pinned, ax0, ax1])

  const order = useMemo(() => {
    const classes = [...Array(N_CLASSES).keys()]
    return split === 2 ? classes : classes.reverse()
  }, [split])
  const available = useMemo(
    () => order.filter((card) => rows.some((row) => row.hand[split] === card)),
    [order, rows, split],
  )

  const columns = useMemo(
    () =>
      [...new Set([...byKey.keys()].map((k) => Number(k.split(',')[1])))].sort((a, b) => b - a),
    [byKey],
  )

  const untrained = (row: ChartRow) => rowSelfLossPP(row) > qgapPP

  const selRow = sel !== null ? rows.find((r) => r.hand.join(',') === sel) : undefined

  /** name an action the way the lab's tooltip does for a fully known hand */
  const actionText = (role: ActionRole, hand: readonly number[]): string => {
    if (role === 'accept') return tt('accept')
    if (role === 'fold') return tt('fold')
    if (role === 'raise') return tt('raise')
    const verb = role.startsWith('hide') ? tt('hide') : tt('play')
    const slot = role.endsWith('high') ? 0 : role.endsWith('mid') ? 1 : 2
    return `${verb} ${labels[hand[slot]]}`
  }

  return (
    <figure className={styles.plate}>
      <div className={`${styles.figCanvas} ${styles.gcrCanvas}`}>
        <div className={styles.gcrBody}>
          <div className={`${cells.gridWrap} ${styles.gcrGridWrap}`}>
            <div className={cells.block}>
              <BlockBadge
                value={pinned}
                split={split}
                mode="single"
                singleValue={pinned}
                order={order}
                available={available}
                infos={infos}
                open={badgeOpen}
                onOpen={() => setBadgeOpen(true)}
                onClose={() => setBadgeOpen(false)}
                onSplit={(i) => {
                  setSplit(i)
                  setSel(null)
                }}
                onSingle={(card) => {
                  setPinned(card)
                  setSel(null)
                  setBadgeOpen(false)
                }}
                allowModeToggle={false}
                allowSinglePicker
                title={t('gcr.badgeTitle')}
              />
              <table className={`${cells.chart} ${cells.blockTable} ${styles.gcrTable}`}>
                <thead>
                  <tr>
                    <th className={cells.axisLabel}>{`${SLOT_NAMES[ax0]} \\ ${SLOT_NAMES[ax1]}`}</th>
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
                          const visual = untrained(row)
                            ? untrainedRowVisual(displayActionsForRow(row))
                            : strategyRowVisual(displayActionsForRow(row))
                          return (
                            <td
                              key={m}
                              tabIndex={0}
                              className={`${cells.cell} ${cells.cellMini}${isOn ? ` ${styles.gcrCellOn}` : ''}`}
                              aria-label={row.hand.map((c) => labels[c]).join(' ')}
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
          </div>

          <div className={styles.gcrReadout} role="status" aria-live="polite">
            {!selRow ? (
              <p className={styles.gcrHint}>{t('gcr.hint')}</p>
            ) : (
              <>
                <div className={styles.gcrCards}>
                  {selRow.hand.map((c, i) => (
                    <span key={i} className={cells.handRowCard}>
                      <ClassMark info={infos[c]} />
                    </span>
                  ))}
                </div>
                {untrained(selRow) ? (
                  <p className={styles.gcrHint}>≈ — {tl('cellUntrained')}</p>
                ) : (
                  (() => {
                    const acts = displayActionsForRow(selRow)
                      .filter(({ p }) => p > 0)
                      .sort((a, b) => roleOrder(a.role) - roleOrder(b.role))
                    return (
                      <>
                        <div className={styles.gcrBar} aria-hidden>
                          {acts.map(({ action, p, role }) => (
                            <span
                              key={action.c}
                              style={{ width: `${p * 100}%`, background: ROLE_COLORS[role] }}
                            />
                          ))}
                        </div>
                        <div className={styles.gcrMix}>
                          {acts.map(({ action, p, role }) => (
                            <div key={action.c} className={styles.gcrMixRow}>
                              <span>
                                <span
                                  className={styles.figSwatch}
                                  style={{ background: ROLE_COLORS[role] }}
                                />
                                {actionText(role, selRow.hand)}
                              </span>
                              <b>
                                {(p * 100).toFixed(1)}% · {tl('win')}{' '}
                                {(50 + action.q * 50).toFixed(1)}%
                              </b>
                            </div>
                          ))}
                        </div>
                      </>
                    )
                  })()
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <figcaption className={styles.plateCaption}>
        <span className={styles.plateNo}>{t('plate', { no: 'II' })}</span> {t('gcr.caption')}
      </figcaption>
    </figure>
  )
}
