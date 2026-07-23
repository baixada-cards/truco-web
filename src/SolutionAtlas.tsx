'use client'

import { useEffect, useMemo, useState } from 'react'

import styles from './SolutionAtlas.module.css'

// ---------------------------------------------------------------------------
// Data schema (matches truco-frontend/public/solutions/11x11/tc{N}.json).
// The shipped files are SYNTHETIC placeholder data; real solver exports will
// replace them later with the exact same shape.
//
// The solved 11-11 decision is the OPENING LEAD (which card the leader plays
// first), not an accept/fold. Each (hand, player) is one entry. `player` is the
// leader (mão); both 0 and 1 appear because each deal is solved under both
// dealer arrangements and the strategies can differ.
// ---------------------------------------------------------------------------
type LeadAction = {
  a: string // "FU:i" (face-up card i) or "FD:i" (face-down card i)
  p: number // average-strategy probability
}

type HandEntry = {
  cards: [number, number, number]
  player: number
  actions: LeadAction[]
}

type SolutionFile = {
  score: [number, number]
  turnup_class: number
  iterations: number
  num_info_sets: number
  decisions: {
    opening: {
      hands: HandEntry[]
    }
  }
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: SolutionFile }
  | { status: 'error'; message: string }

// ---------------------------------------------------------------------------
// Card abstraction. 0..8 = plain levels (8 strongest plain); 9..12 = manilhas.
// ---------------------------------------------------------------------------
const TURN_UP_CLASSES = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const
const MANILHA_MIN = 9

const MANILHA_NAMES: Record<number, { name: string; glyph: string }> = {
  9: { name: 'ouros', glyph: '♦' },
  10: { name: 'espadilha', glyph: '♠' },
  11: { name: 'copas', glyph: '♥' },
  12: { name: 'zap', glyph: '♣' },
}

function isManilha(idx: number): boolean {
  return idx >= MANILHA_MIN
}

function cardShort(idx: number): string {
  const m = MANILHA_NAMES[idx]
  return m ? m.glyph : String(idx)
}

function cardLong(idx: number): string {
  const m = MANILHA_NAMES[idx]
  return m ? `${m.name} ${m.glyph}` : `plain ${idx}`
}

// Parse an action code "FU:10" -> { mode: 'FU', card: 10 }.
function parseAction(a: string): { mode: string; card: number } | null {
  const [mode, raw] = a.split(':')
  const card = Number(raw)
  if (!mode || Number.isNaN(card)) return null
  return { mode, card }
}

// ---------------------------------------------------------------------------
// Diverging color scale for P(lead the strongest card):
//   low  = sandbag / slow-play (teal-blue)
//   ~0.5 = mixed (warm gray)
//   high = leads strong (coral-red)
// Returns a CSS color. p in [0,1].
// ---------------------------------------------------------------------------
function strongLeadColor(p: number): string {
  const clamped = Math.min(1, Math.max(0, p))
  const slow = { r: 46, g: 110, b: 120 } // muted teal — traps / slow-plays
  const mixed = { r: 168, g: 158, b: 132 } // warm gray
  const strong = { r: 178, g: 70, b: 54 } // coral-red — leads strong
  let from: typeof slow
  let to: typeof slow
  let t: number
  if (clamped < 0.5) {
    from = slow
    to = mixed
    t = clamped / 0.5
  } else {
    from = mixed
    to = strong
    t = (clamped - 0.5) / 0.5
  }
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t)
  return `rgb(${lerp(from.r, to.r)}, ${lerp(from.g, to.g)}, ${lerp(from.b, to.b)})`
}

function textColorFor(p: number): string {
  // Mid band (gray) reads better with dark ink; saturated ends with cream.
  return p > 0.32 && p < 0.68 ? 'var(--ink-0)' : 'var(--paper-0)'
}

function pct(p: number): string {
  return `${Math.round(p * 100)}%`
}

// ---------------------------------------------------------------------------
// Per-entry: probability of leading the strongest card in the hand.
// Sum p over actions whose card index equals the hand's max card index.
// ---------------------------------------------------------------------------
function strongLeadProb(entry: HandEntry): number {
  const top = Math.max(...entry.cards)
  let sum = 0
  for (const act of entry.actions) {
    const parsed = parseAction(act.a)
    if (parsed && parsed.card === top) sum += act.p
  }
  return sum
}

// ---------------------------------------------------------------------------
// Aggregation. For each (best, second) pair we average P(lead strongest)
// across all entries whose top two cards are exactly (best, second), for the
// selected player, optionally restricted to a specific kicker (3rd card).
// We also accumulate the aggregate lead distribution for the tooltip.
// ---------------------------------------------------------------------------
type CellStat = {
  mean: number // mean P(lead strongest card)
  count: number // number of (hand) entries averaged
  // aggregated lead distribution by card index (mean over matching entries)
  dist: { card: number; p: number }[]
}

function buildPairMatrix(
  hands: HandEntry[],
  player: number,
  kicker: number | null,
): Map<string, CellStat> {
  type Acc = { sum: number; count: number; dist: Map<number, number> }
  const acc = new Map<string, Acc>()
  for (const h of hands) {
    if (h.player !== player) continue
    const sorted = [...h.cards].sort((a, b) => a - b)
    const best = sorted[2]
    const second = sorted[1]
    const third = sorted[0]
    if (kicker !== null && third !== kicker) continue
    const key = `${best}:${second}`
    const cur = acc.get(key) ?? { sum: 0, count: 0, dist: new Map() }
    cur.sum += strongLeadProb(h)
    cur.count += 1
    for (const act of h.actions) {
      const parsed = parseAction(act.a)
      if (!parsed) continue
      cur.dist.set(parsed.card, (cur.dist.get(parsed.card) ?? 0) + act.p)
    }
    acc.set(key, cur)
  }
  const out = new Map<string, CellStat>()
  for (const [key, v] of acc) {
    const dist = [...v.dist.entries()]
      .map(([card, p]) => ({ card, p: p / v.count }))
      .sort((a, b) => b.card - a.card)
    out.set(key, { mean: v.sum / v.count, count: v.count, dist })
  }
  return out
}

// Which kicker values actually occur for the selected player.
function availableKickers(hands: HandEntry[], player: number): number[] {
  const set = new Set<number>()
  for (const h of hands) {
    if (h.player !== player) continue
    set.add(Math.min(...h.cards))
  }
  return [...set].sort((a, b) => a - b)
}

// ---------------------------------------------------------------------------
type TooltipState = {
  best: number
  second: number
  stat: CellStat
  x: number
  y: number
} | null

const SCORE_ROWS = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0] // your score, top -> bottom
const SCORE_COLS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] // opp score, left -> right
// Hand-grid axis: strongest first (12 .. 0).
const CARD_DESC = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]

export default function SolutionAtlas() {
  const [tc, setTc] = useState<number>(0)
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [player, setPlayer] = useState<number>(1) // leader; default player 1
  const [kicker, setKicker] = useState<number | null>(null) // null = all (avg)
  const [tooltip, setTooltip] = useState<TooltipState>(null)

  useEffect(() => {
    let cancelled = false
    setLoad({ status: 'loading' })
    // Generic loading path — real exports drop straight into this directory.
    fetch(`/solutions/11x11/tc${tc}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data: SolutionFile) => {
        if (cancelled) return
        if (!data?.decisions?.opening?.hands) {
          throw new Error('malformed solution file')
        }
        setLoad({ status: 'ready', data })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'unknown error'
        setLoad({ status: 'error', message })
      })
    return () => {
      cancelled = true
    }
  }, [tc])

  // Reset kicker facet whenever the dataset or player changes.
  useEffect(() => {
    setKicker(null)
  }, [tc, player])

  const hands = useMemo(
    () => (load.status === 'ready' ? load.data.decisions.opening.hands : []),
    [load],
  )
  const kickers = useMemo(
    () => availableKickers(hands, player),
    [hands, player],
  )
  const matrix = useMemo(
    () => buildPairMatrix(hands, player, kicker),
    [hands, player, kicker],
  )

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        {/* ---- Header + context controls ---- */}
        <header className={styles.header}>
          <span className={styles.eyebrow}>Strategy viewer · slice 1</span>
          <h1 className={styles.title}>Solution Atlas</h1>
          <p className={styles.contextLine}>
            score 11–11<span className={styles.dot}>·</span>mão de onze
            <span className={styles.dot}>·</span>decision: opening lead
            <span className={styles.dot}>·</span>leader: player {player}
          </p>

          <div className={styles.controls}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Turn-up class</span>
              <select
                className={styles.select}
                value={tc}
                onChange={(e) => setTc(Number(e.target.value))}
              >
                {TURN_UP_CLASSES.map((c) => (
                  <option key={c} value={c}>
                    tc {c}
                  </option>
                ))}
              </select>
            </label>

            <div className={styles.field}>
              <span className={styles.fieldLabel}>Leader (mão)</span>
              <div className={styles.kickerOptions}>
                {[1, 0].map((pl) => (
                  <button
                    key={pl}
                    type="button"
                    className={`${styles.kickerChip} ${player === pl ? styles.active : ''}`}
                    onClick={() => setPlayer(pl)}
                  >
                    player {pl}
                  </button>
                ))}
              </div>
            </div>

            {load.status === 'ready' && (
              <div className={styles.meta}>
                <div className={styles.metaItem}>
                  <span className={styles.metaValue}>
                    {load.data.iterations.toLocaleString()}
                  </span>
                  <span className={styles.metaLabel}>iterations</span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaValue}>
                    {load.data.num_info_sets.toLocaleString()}
                  </span>
                  <span className={styles.metaLabel}>info sets</span>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* ---- Score lattice navigator ---- */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Score lattice</h2>
            <p className={styles.sectionNote}>
              Which subgame. Only 11–11 (the mão de onze opening) is solved so far.
            </p>
          </div>
          <div className={styles.latticeWrap}>
            <div>
              <div className={styles.lattice} aria-hidden>
                <span className={styles.latticeCorner} />
                {SCORE_COLS.map((c) => (
                  <span key={`ch-${c}`} className={styles.latticeColHead}>
                    {c}
                  </span>
                ))}
                {SCORE_ROWS.map((r) => (
                  <Row key={`r-${r}`} r={r} selectedTc={tc} />
                ))}
              </div>
              <div className={styles.latticeAxisLabel} style={{ marginTop: 8 }}>
                cols: opponent score 0→11 · rows: your score 11→0
              </div>
            </div>

            <div className={styles.legend}>
              <div className={styles.legendRow}>
                <span className={`${styles.legendSwatch} ${styles.solved}`} />
                solved (11–11)
              </div>
              <div className={styles.legendRow}>
                <span className={`${styles.legendSwatch} ${styles.edge}`} />
                mão de onze edge (a score is 11)
              </div>
              <div className={styles.legendRow}>
                <span className={`${styles.legendSwatch} ${styles.pending}`} />
                pending (not yet solved)
              </div>
            </div>
          </div>
        </section>

        {/* ---- Hand grid ---- */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Opening lead by hand</h2>
            <p className={styles.sectionNote}>
              Upper-triangular grid: row = best card, column = 2nd-best. Each cell
              shows <strong>P(lead strongest card)</strong>, averaged over the
              kicker (3rd card) for the selected leader. Red = leads strong, gray ≈
              mixed (~50%), teal = sandbag / slow-play.
            </p>
          </div>

          {/* Kicker facet control */}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Kicker (3rd card)</span>
            <div className={styles.kickerOptions}>
              <button
                type="button"
                className={`${styles.kickerChip} ${kicker === null ? styles.active : ''}`}
                onClick={() => setKicker(null)}
              >
                all (avg)
              </button>
              {kickers.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`${styles.kickerChip} ${kicker === k ? styles.active : ''}`}
                  onClick={() => setKicker(k)}
                >
                  {cardShort(k)}
                </button>
              ))}
            </div>
          </div>

          {load.status === 'error' && (
            <div className={styles.empty}>
              Could not load tc{tc} solution ({load.message}). The strategy files
              live under <code>public/solutions/11x11/</code>. Try another turn-up
              class.
            </div>
          )}

          {load.status === 'loading' && (
            <div className={styles.empty}>Loading solution…</div>
          )}

          {load.status === 'ready' && matrix.size === 0 && (
            <div className={styles.empty}>
              No hands match this leader / kicker selection.
            </div>
          )}

          {load.status === 'ready' && matrix.size > 0 && (
            <div className={styles.gridScroll}>
              <div className={styles.handGrid}>
                <span className={styles.gridCorner}>b\2</span>
                {CARD_DESC.map((c) => (
                  <span key={`gc-${c}`} className={styles.gridColHead}>
                    <span className={isManilha(c) ? styles.manilha : undefined}>
                      {cardShort(c)}
                    </span>
                  </span>
                ))}
                {CARD_DESC.map((best) => (
                  <GridRow
                    key={`gr-${best}`}
                    best={best}
                    matrix={matrix}
                    setTooltip={setTooltip}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Color scale legend */}
          <div className={styles.scaleBar}>
            <span>sandbag 0%</span>
            <div
              className={styles.scaleGradient}
              style={{
                background: `linear-gradient(90deg, ${strongLeadColor(
                  0,
                )} 0%, ${strongLeadColor(0.5)} 50%, ${strongLeadColor(1)} 100%)`,
              }}
            />
            <span>P(lead strongest card) 100%</span>
            <span style={{ marginLeft: 16 }}>
              dashed outline = manilha corner (both cards are manilhas)
            </span>
          </div>
        </section>
      </div>

      {tooltip && (
        <div
          className={styles.tooltip}
          style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}
        >
          <div className={styles.ttHead}>
            best {cardLong(tooltip.best)} · 2nd {cardLong(tooltip.second)}
          </div>
          <div>
            <span className={styles.ttPct}>{pct(tooltip.stat.mean)}</span> lead
            strongest
          </div>
          <div className={styles.ttDist}>
            {tooltip.stat.dist.map((d) => (
              <div key={d.card} className={styles.ttDistRow}>
                <span className={isManilha(d.card) ? styles.manilha : undefined}>
                  lead {cardShort(d.card)}
                </span>
                <span>{pct(d.p)}</span>
              </div>
            ))}
          </div>
          <div style={{ opacity: 0.7, marginTop: 4 }}>
            avg over {tooltip.stat.count} hand
            {tooltip.stat.count === 1 ? '' : 's'}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
function Row({ r, selectedTc }: { r: number; selectedTc: number }) {
  return (
    <>
      <span className={styles.latticeRowHead}>{r}</span>
      {SCORE_COLS.map((c) => {
        const solved = r === 11 && c === 11
        const edge = !solved && (r === 11 || c === 11)
        const className = [
          styles.latticeCell,
          solved ? styles.latticeSolved : '',
          solved ? styles.latticeSelected : '',
          edge ? styles.latticeEdge : '',
          !solved && !edge ? styles.latticePending : '',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <button
            key={`cell-${r}-${c}`}
            type="button"
            className={className}
            disabled={!solved}
            aria-label={`your ${r}, opp ${c}${solved ? ' (solved, tc ' + selectedTc + ')' : ''}`}
            title={`your ${r} · opp ${c}`}
          />
        )
      })}
    </>
  )
}

function GridRow({
  best,
  matrix,
  setTooltip,
}: {
  best: number
  matrix: Map<string, CellStat>
  setTooltip: (t: TooltipState) => void
}) {
  return (
    <>
      <span className={styles.gridRowHead}>
        <span className={isManilha(best) ? styles.manilha : undefined}>
          {cardShort(best)}
        </span>
      </span>
      {CARD_DESC.map((second) => {
        // Upper-triangular: render a cell only where best >= second.
        if (best < second) {
          return <span key={`e-${best}-${second}`} className={styles.cellEmpty} />
        }
        const stat = matrix.get(`${best}:${second}`)
        const bothManilha = isManilha(best) && isManilha(second)
        if (!stat) {
          // Valid pair but no entry for this leader / kicker filter.
          return (
            <div
              key={`n-${best}-${second}`}
              className={`${styles.cell} ${bothManilha ? styles.manilhaFence : ''}`}
              style={{ background: 'var(--paper-1)', color: 'var(--ink-2)' }}
            >
              –
            </div>
          )
        }
        return (
          <div
            key={`c-${best}-${second}`}
            className={`${styles.cell} ${bothManilha ? styles.manilhaFence : ''}`}
            style={{
              background: strongLeadColor(stat.mean),
              color: textColorFor(stat.mean),
            }}
            onMouseEnter={(e) =>
              setTooltip({ best, second, stat, x: e.clientX, y: e.clientY })
            }
            onMouseMove={(e) =>
              setTooltip({ best, second, stat, x: e.clientX, y: e.clientY })
            }
            onMouseLeave={() => setTooltip(null)}
          >
            <span className={styles.cellLabel}>{pct(stat.mean)}</span>
          </div>
        )
      })}
    </>
  )
}
