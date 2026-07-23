'use client'

// Plate VI — a small, real range editor. It intentionally uses the same
// HandDraft representation and feasibility predicate as the Study lab: a
// guide example must never teach a hand the lab itself would reject.

import { useMemo, useState } from 'react'

import {
  BlockBadge,
  BlockCellContent,
  ClassMark,
  MiniCard,
  cellStyles as cells,
  rangeVisual,
} from '../../components/study/ChartCells'
import {
  classCopies,
  classInfos,
  draftCompletable,
  draftMatchesHand,
  draftSetSlot,
  viraClassOf,
  N_CLASSES,
  type ChartRow,
  type HandDraft,
} from '../../lib/study-data'
import styles from '../guide.module.css'

type Mode = 'grid' | 'list'

function notation(slots: HandDraft, labels: readonly string[]) {
  return `[${slots.map((card) => (card === null ? '?' : labels[card])).join(' ')}]`
}

function parseNotation(raw: string, labels: readonly string[]): HandDraft | null {
  const match = raw.trim().match(/^\[\s*(.*?)\s*\]$/)
  if (!match) return null
  const tokens = match[1].trim() ? match[1].trim().split(/\s+/) : []
  if (tokens.length !== 3) return null
  const slots = tokens.map((token) => {
    if (token === '?') return null
    const index = labels.findIndex((label) => label.toLowerCase() === token.toLowerCase())
    return index < 0 ? Number.NaN : index
  })
  return slots.some((slot) => Number.isNaN(slot)) ? null : slots
}

export function RangeTool({ tc, rows }: { tc: number; rows: ChartRow[] }) {
  const infos = useMemo(() => classInfos(tc, 'cards'), [tc])
  const labels = useMemo(() => infos.map((info) => info.label), [infos])
  const available = (cls: number) => classCopies(cls) - (cls === viraClassOf(tc) ? 1 : 0)
  const [slots, setSlots] = useState<HandDraft>([null, null, null])
  const [menuSlot, setMenuSlot] = useState<number | null>(null)
  const [typed, setTyped] = useState(() => notation([null, null, null], labels))
  const [error, setError] = useState(false)
  const [mode, setMode] = useState<Mode>('grid')
  const [split, setSplit] = useState<0 | 1 | 2>(2)
  const [badgeOpen, setBadgeOpen] = useState<number | null>(null)

  const matching = useMemo(
    () => rows.filter((row) => draftMatchesHand(slots, row.hand)),
    [rows, slots],
  )
  const mass = matching.reduce((sum, row) => sum + row.w, 0) || 1
  const blocks = useMemo(() => {
    const [ax0, ax1] = ([0, 1, 2] as const).filter((i) => i !== split)
    const bySplit = new Map<number, Map<string, ChartRow>>()
    for (const row of matching) {
      const fixed = row.hand[split]
      if (!bySplit.has(fixed)) bySplit.set(fixed, new Map())
      bySplit.get(fixed)!.set(`${row.hand[ax0]},${row.hand[ax1]}`, row)
    }
    const order = [...Array(N_CLASSES).keys()]
    if (split !== 2) order.reverse()
    return { ax0, ax1, bySplit, order, available: order.filter((card) => bySplit.has(card)) }
  }, [matching, split])
  const maxWeight = Math.max(...matching.map((row) => row.w), 1e-12)

  function update(next: HandDraft) {
    if (!draftCompletable(next, available)) return
    setSlots(next)
    setTyped(notation(next, labels))
    setError(false)
  }

  function choose(slot: number, card: number | null) {
    update(draftSetSlot(slots, slot, card))
    setMenuSlot(null)
  }

  function moveSlot(from: number, to: number) {
    if (from === to || slots[from] === null) return
    const next = [...slots]
    ;[next[from], next[to]] = [next[to], next[from]]
    update(draftSetSlot(next, to, next[to]))
  }

  function applyTyped() {
    const parsed = parseNotation(typed, labels)
    if (!parsed || !draftCompletable(parsed, available)) {
      setError(true)
      return
    }
    update(parsed)
  }

  function selectHand(hand: readonly number[]) {
    update([...hand])
  }

  return (
    <figure className={styles.plate}>
      <div className={`${styles.figCanvas} ${styles.rangeTool}`}>
        <div className={styles.rangeToolTop}>
          <div>
            <span className={styles.rangeEyebrow}>YOUR RANGE</span>
            <p className={styles.rangeToolHint}>
              Type a hand, click a slot to choose a card, or drag one onto a slot. <b>?</b> keeps that card unknown.
            </p>
          </div>
          <div className={styles.rangeModes} aria-label="Range chart view">
            <button type="button" className={mode === 'grid' ? styles.rangeModeOn : styles.rangeMode} onClick={() => setMode('grid')}>
              GRID
            </button>
            <button type="button" className={mode === 'list' ? styles.rangeModeOn : styles.rangeMode} onClick={() => setMode('list')}>
              LIST
            </button>
          </div>
        </div>

        <div className={styles.rangeControls}>
          <label className={styles.rangeNotation}>
            <span>HAND</span>
            <input
              value={typed}
              aria-invalid={error}
              onChange={(event) => {
                setTyped(event.target.value)
                setError(false)
              }}
              onBlur={applyTyped}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  applyTyped()
                }
              }}
            />
          </label>

          <div className={styles.rangeEditor}>
            <div className={styles.rangeSlots} aria-label="Three-card range draft">
            {slots.map((card, slot) => (
              <div
                key={slot}
                className={styles.rangeSlotAnchor}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  const slotRaw = event.dataTransfer.getData('text/range-slot')
                  if (slotRaw) {
                    const from = Number(slotRaw)
                    if (Number.isInteger(from)) moveSlot(from, slot)
                    return
                  }
                  const raw = event.dataTransfer.getData('text/range-class')
                  if (!raw) return
                  const cardClass = Number(raw)
                  if (Number.isInteger(cardClass)) choose(slot, cardClass)
                }}
              >
                <button
                  type="button"
                  className={menuSlot === slot ? styles.rangeSlotOn : styles.rangeSlot}
                  draggable={card !== null}
                  aria-expanded={menuSlot === slot}
                  aria-haspopup="menu"
                  title={card === null ? `Choose card ${slot + 1}` : `${labels[card]} — choose another card`}
                  onDragStart={(event) => event.dataTransfer.setData('text/range-slot', String(slot))}
                  onClick={() => setMenuSlot((current) => (current === slot ? null : slot))}
                >
                  {card === null ? <span className={styles.rangeUnknown}>?</span> : <MiniCard info={infos[card]} />}
                </button>
                {menuSlot === slot ? (
                  <div role="menu" className={styles.rangeCardMenu} aria-label={`Choose card ${slot + 1}`}>
                    <button
                      type="button"
                      className={card === null ? styles.rangeCardMenuOn : styles.rangeCardMenuOption}
                      onClick={() => choose(slot, null)}
                      title="Leave this card unknown"
                    >
                      ?
                    </button>
                    {[...Array(N_CLASSES).keys()].reverse().map((candidate) => {
                      const next = draftSetSlot(slots, slot, candidate)
                      const disabled = !draftCompletable(next, available)
                      return (
                        <button
                          key={infos[candidate].label}
                          type="button"
                          draggable={!disabled}
                          disabled={disabled}
                          className={candidate === card ? styles.rangeCardMenuOn : styles.rangeCardMenuOption}
                          onDragStart={(event) => event.dataTransfer.setData('text/range-class', String(candidate))}
                          onClick={() => choose(slot, candidate)}
                          title={disabled ? `${labels[candidate]} — no compatible hand` : labels[candidate]}
                        >
                          <ClassMark info={infos[candidate]} />
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            ))}
              <button type="button" className={styles.rangeClear} onClick={() => update([null, null, null])}>
                clear
              </button>
            </div>
          </div>
        </div>
        {error ? <p className={styles.rangeError}>Use three known cards or ? slots that can still be dealt.</p> : null}
        {menuSlot !== null ? <div className={styles.rangeMenuBackdrop} onClick={() => setMenuSlot(null)} /> : null}

        <div className={styles.rangeResultHead}>
          <span>{matching.length} matching hands</span>
          <span>share of the arriving range</span>
        </div>
        {mode === 'grid' ? (
          <p className={styles.rangeShareNote}>
            Every shaded cell is a dealable holding. <b>&lt;0.1%</b> means a tiny share, not a blocked hand.
          </p>
        ) : null}
        {mode === 'grid' ? (
          <div className={`${cells.blocksWrap} ${styles.rangeGrid}`}>
            {blocks.available.map((fixed) => {
              const block = blocks.bySplit.get(fixed)!
              const columns = [...new Set([...block.keys()].map((key) => Number(key.split(',')[1])))].sort(
                (a, b) => b - a,
              )
              return (
                <div key={fixed} className={cells.block}>
                  <BlockBadge
                    value={fixed}
                    split={split}
                    mode="all"
                    order={blocks.order}
                    available={blocks.available}
                    infos={infos}
                    open={badgeOpen === fixed}
                    onOpen={() => setBadgeOpen(fixed)}
                    onClose={() => setBadgeOpen(null)}
                    onSplit={(nextSplit) => {
                      setSplit(nextSplit)
                      setBadgeOpen(null)
                    }}
                    allowModeToggle={false}
                    allowSinglePicker={false}
                    title="All matching blocks — choose H, M, or L to change the split"
                  />
                  <table className={`${cells.chart} ${cells.blockTable}`}>
                    <thead>
                      <tr>
                        <th className={cells.axisLabel}>{`${'HML'[blocks.ax0]} \\ ${'HML'[blocks.ax1]}`}</th>
                        {columns.map((card) => (
                          <th key={card}>
                            <ClassMark info={infos[card]} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...Array(N_CLASSES).keys()].reverse().map((rowCard) => {
                        if (!columns.some((column) => block.has(`${rowCard},${column}`))) return null
                        return (
                          <tr key={rowCard}>
                            <th>
                              <ClassMark info={infos[rowCard]} />
                            </th>
                            {columns.map((column) => {
                              const row = block.get(`${rowCard},${column}`)
                              if (!row) return <td key={column} className={cells.void} />
                              const share = row.w / mass
                              const visual = rangeVisual(share, row.w / maxWeight)
                              // A dot is too easily read as an unavailable holding.  The
                              // matching rows only contain dealable hands, so show the
                              // same explicit tiny-share label as the list view instead.
                              if (share > 0 && share < 0.0005) visual.text = '<0.1%'
                              return (
                                <td
                                  key={column}
                                  tabIndex={0}
                                  className={`${cells.cell} ${cells.cellMini}`}
                                  aria-label={row.hand.map((card) => labels[card]).join(' ')}
                                  title={`Fix ${row.hand.map((card) => labels[card]).join(' ')}`}
                                  onClick={() => selectHand(row.hand)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') selectHand(row.hand)
                                  }}
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
        ) : (
          <div className={styles.rangeList}>
            {matching.map((row) => {
              const share = (row.w / mass) * 100
              return (
                <button
                  key={row.hand.join(',')}
                  type="button"
                  className={styles.rangeHolding}
                  onClick={() => selectHand(row.hand)}
                  title={`Fix ${row.hand.map((card) => labels[card]).join(' ')}`}
                >
                  <span className={styles.rangeHoldingCards}>
                    {row.hand.map((card, index) => (
                      <span key={index} className={styles.rangeHoldingCard}>
                        <MiniCard info={infos[card]} />
                      </span>
                    ))}
                  </span>
                  <span className={styles.rangeHoldingBar} aria-hidden>
                    <span style={{ width: `${Math.max(1, share)}%` }} />
                  </span>
                  <b>{share < 0.1 ? '<0.1' : share.toFixed(1)}%</b>
                </button>
              )
            })}
          </div>
        )}
      </div>
      <figcaption className={styles.plateCaption}>
        <span className={styles.plateNo}>VI</span> A range is every hand still compatible with what you know; its bars add to 100%.
      </figcaption>
    </figure>
  )
}
