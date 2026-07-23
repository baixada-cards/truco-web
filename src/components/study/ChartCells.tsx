/* eslint-disable react-refresh/only-export-components -- one deliberate
   module: the cell visuals' pure builders and their tiny DOM shells belong
   together so the lab and the guide cannot drift apart. */
// Shared chart-cell rendering for the study lab and the study guide.
// The four views' cell visuals — mixed-strategy segment fills, the printed
// number (the biggest slice), the range shading, the cost heat, the compare
// deltas, the ≈ untrained treatment — and the LIST row bar all live here so
// the lab's charts and the guide's figures render from one implementation.
//
// Everything here is presentational and pure: callers do their own data
// plumbing (aggregation, masking, tooltips) and hand the numbers over.

import { useTranslations } from 'next-intl'

import { roleOrder, type ActionRole, type CellAgg, type ClassInfo, type DisplayAction } from '../../lib/study-data'

import styles from './ChartCells.module.css'

export { styles as cellStyles }

/** one color per hand-relative action role — the single legend everywhere */
export const ROLE_COLORS: Record<ActionRole, string> = {
  accept: 'var(--study-action-blue, #0072b2)',
  fold: 'var(--study-action-vermillion, #d55e00)',
  raise: 'var(--study-action-purple, #cc79a7)',
  'play-high': 'var(--study-action-blue, #0072b2)',
  'play-mid': 'var(--study-action-sky, #56b4e9)',
  'play-low': 'var(--study-action-vermillion, #d55e00)',
  'hide-high': 'var(--study-action-teal, #009e73)',
  // Hides cannot be legal in the 3-card first round, so this safely shares
  // sky blue with play-middle while preserving five distinct simultaneous actions.
  'hide-mid': 'var(--study-action-sky, #56b4e9)',
  'hide-low': 'var(--study-action-sky, #56b4e9)',
}

export const PAPER: [number, number, number] = [229, 217, 191]
const ROLE_RGB: Record<ActionRole, [number, number, number]> = {
  accept: [0, 114, 178],
  fold: [213, 94, 0],
  raise: [204, 121, 167],
  'play-high': [0, 114, 178],
  'play-mid': [86, 180, 233],
  'play-low': [213, 94, 0],
  'hide-high': [0, 158, 115],
  'hide-mid': [86, 180, 233],
  'hide-low': [86, 180, 233],
}

function roleTextIsDark(role: ActionRole): boolean {
  const [r, g, b] = ROLE_RGB[role]
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.54
}
export const RED: [number, number, number] = [162, 60, 44]
export const GREEN: [number, number, number] = [74, 90, 42]
/** the solid inks the single-value views shade toward */
export const RANGE_INK: [number, number, number] = [92, 76, 38]
export const COST_INK: [number, number, number] = [122, 40, 28]
export const DIFF_INK: [number, number, number] = [138, 106, 40]

export function mixColor(a: [number, number, number], b: [number, number, number], t: number) {
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`
}

/** rank + suit glyph for one of the 13 abstract classes */
export function ClassMark({ info }: { info: ClassInfo }) {
  if (!info.suit) return <>{info.rank}</>
  const red = info.suit === '♥' || info.suit === '♦'
  return (
    <>
      {info.rank}
      <span className={red ? styles.suitRed : styles.suitBlack}>{info.suit}</span>
    </>
  )
}

/** one small playing card, as the pinned-hand panel and table views draw it */
export function MiniCard({ info }: { info: ClassInfo }) {
  const t = useTranslations('Study.lab')
  return (
    <div className={info.suit ? styles.miniManilha : styles.miniCard}>
      <ClassMark info={info} />
      {!info.suit ? (
        <span className={styles.anyPips} title={t('anySuit')}>
          ♦♠♥♣
        </span>
      ) : null}
    </div>
  )
}

/** what one cell draws: the fill layer, the printed number, its contrast */
export interface CellVisual {
  fill: React.ReactNode
  text: string
  dark: boolean
  strip?: string
  untrained?: boolean
}

/** the mixed-strategy segment fill: one <div> per action, sized by σ */
export function mixFill(segments: Array<{ key: React.Key; p: number; color: string }>): React.ReactNode {
  return (
    <span className={styles.cellFill} aria-hidden>
      {segments.map((s) => (
        <div key={s.key} style={{ width: `${s.p * 100}%`, background: s.color }} />
      ))}
    </span>
  )
}

/** an empty fill layer (missing compare cells, the ≈ treatment) */
export function emptyFill(): React.ReactNode {
  return <span className={styles.cellFill} aria-hidden />
}

/** a solid single-color fill layer (range shading, cost heat) */
export function solidFill(background: string): React.ReactNode {
  return <span className={styles.cellFill} style={{ background }} aria-hidden />
}

/** STRATEGY over an aggregated cell: segments = the mix, number = max slice */
export function strategyCellVisual(cell: CellAgg, selectedRole: ActionRole | null = null): CellVisual {
  if (selectedRole) return roleShareVisual(selectedRole, cell.mix.get(selectedRole) ?? 0)
  const segments = [...cell.mix.entries()]
    .filter(([, p]) => p > 0)
    .sort((a, b) => roleOrder(a[0]) - roleOrder(b[0]))
  let best = -1
  let bestRole: ActionRole | null = null
  for (const [role, p] of segments) {
    if (p > best) {
      best = p
      bestRole = role
    }
  }
  return {
    fill: mixFill(segments.map(([r, v]) => ({ key: r, p: v, color: ROLE_COLORS[r] }))),
    text: `${Math.round(best * 100)}`,
    dark: bestRole ? roleTextIsDark(bestRole) : true,
  }
}

/** One selected role's exact probability, shaded in that role's color. */
export function roleShareVisual(role: ActionRole, p: number): CellVisual {
  const shade = Math.min(1, Math.max(0, p))
  const rgb = PAPER.map((v, i) => Math.round(v + (ROLE_RGB[role][i] - v) * shade)) as [
    number,
    number,
    number,
  ]
  const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255
  const pct = shade * 100
  return {
    fill: solidFill(`rgb(${rgb.join(',')})`),
    text: pct > 0 && pct < 1 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`,
    dark: luminance > 0.56,
  }
}

/** STRATEGY over one exact holding's display actions */
export function strategyRowVisual(
  acts: readonly DisplayAction[],
  selectedRole: ActionRole | null = null,
): CellVisual {
  if (selectedRole) {
    return roleShareVisual(
      selectedRole,
      acts.reduce((sum, { p, role }) => sum + (role === selectedRole ? p : 0), 0),
    )
  }
  const shown = acts
    .filter(({ p }) => p > 0)
    .sort((a, b) => roleOrder(a.role) - roleOrder(b.role))
  let best = -1
  let bestRole: ActionRole | null = null
  for (const action of shown) {
    if (action.p > best) {
      best = action.p
      bestRole = action.role
    }
  }
  return {
    fill: mixFill(shown.map(({ action, p, role }) => ({ key: action.c, p, color: ROLE_COLORS[role] }))),
    text: `${Math.round(best * 100)}`,
    dark: bestRole ? roleTextIsDark(bestRole) : true,
  }
}

/** RANGE: share = this cell's slice of the node's mass (the printed %),
 *  shade = its weight relative to the heaviest cell (the ink) */
export function rangeVisual(share: number, shade: number): CellVisual {
  const pct = share * 100
  return {
    fill: solidFill(mixColor(PAPER, RANGE_INK, shade)),
    text: pct < 0.05 ? '·' : pct < 0.95 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`,
    dark: shade < 0.55,
  }
}

/** COST: loss in the chosen currency, shaded against the view's span */
export function costVisual(loss: number, span: number): CellVisual {
  const shade = Math.min(loss, span) / span
  return {
    fill: solidFill(mixColor(PAPER, COST_INK, shade)),
    text: loss < 0.05 ? '·' : loss.toFixed(loss < 10 ? 1 : 0),
    dark: shade < 0.45,
  }
}

/** the hot bottom strip marking cells whose worst holding loses far more */
export function costStrip(mean: number, worst: number, span: number, threshold: number): string | undefined {
  return worst - mean > threshold ? mixColor(PAPER, COST_INK, Math.min(worst, span) / span) : undefined
}

/** COMPARE at bid nodes: Δaccept between the two spots, signed */
export function diffAcceptVisual(d: number): CellVisual {
  const shade = Math.min(Math.abs(d), 0.6) / 0.6
  return {
    fill: solidFill(d >= 0 ? mixColor(PAPER, GREEN, shade) : mixColor(PAPER, RED, shade)),
    text: Math.abs(d) < 0.005 ? '·' : `${d > 0 ? '+' : '−'}${Math.abs(Math.round(d * 100))}`,
    dark: shade < 0.45,
  }
}

/** COMPARE elsewhere: total-variation distance between the two mixes */
export function diffTvVisual(tv: number): CellVisual {
  const shade = Math.min(tv, 0.6) / 0.6
  return {
    fill: solidFill(mixColor(PAPER, DIFF_INK, shade)),
    text: tv < 0.005 ? '·' : `${Math.round(tv * 100)}`,
    dark: shade < 0.45,
  }
}

/** a cell with nothing to show (e.g. the compared spot lacks this holding) */
export function emptyVisual(): CellVisual {
  return { fill: emptyFill(), text: '', dark: true }
}

/** a holding the solve never really trained: the real mix washed out (blurred
 *  + desaturated by .untrainedFill), ≈ instead of a number — faded real data,
 *  not a blank cell */
export function untrainedRowVisual(acts: readonly DisplayAction[]): CellVisual {
  const shown = acts
    .filter(({ p }) => p > 0)
    .sort((a, b) => roleOrder(a.role) - roleOrder(b.role))
  return {
    fill: mixFill(shown.map(({ action, p, role }) => ({ key: action.c, p, color: ROLE_COLORS[role] }))),
    text: '≈',
    dark: true,
    untrained: true,
  }
}

/** the ◉ mark filling the currently selected cell */
export function CellSelectedMark() {
  return (
    <span className={styles.cellSelFill} aria-hidden>
      ◉
    </span>
  )
}

/** the inside of a full-size chart cell: fill layer, number, optional strip */
export function ChartCellContent({
  visual,
  untrained,
  stripTitle,
}: {
  visual: CellVisual
  untrained: boolean
  stripTitle?: string
}) {
  return (
    <>
      <span className={untrained ? styles.untrainedFill : undefined}>{visual.fill}</span>
      {untrained ? (
        <span className={styles.untrainedMark} aria-hidden>≈</span>
      ) : (
        <span className={visual.dark ? styles.cellTextDark : styles.cellText}>{visual.text}</span>
      )}
      {visual.strip ? (
        <span className={styles.riskStrip} style={{ background: visual.strip }} title={stripTitle} aria-hidden />
      ) : null}
    </>
  )
}

/** the inside of a mini block cell: just the fill layer and the number */
export function BlockCellContent({ visual }: { visual: CellVisual }) {
  return (
    <>
      <span className={visual.untrained ? styles.untrainedFill : undefined}>{visual.fill}</span>
      {visual.untrained ? (
        <span className={styles.untrainedMark} aria-hidden>≈</span>
      ) : (
        <span className={visual.dark ? styles.cellTextDark : styles.cellText}>{visual.text}</span>
      )}
    </>
  )
}

/** the LIST row's strategy bar: labeled in-bar segments, one per action */
export function ListRowMixBar({
  acts,
  roleOf,
  label,
}: {
  acts: readonly DisplayAction[]
  /** role of an action code relative to this row's remaining hand */
  roleOf: (code: number) => ActionRole
  /** short action label printed inside wide-enough segments */
  label: (code: number) => string
}) {
  return (
    <span className={styles.cellFill}>
      {acts.map(({ action, p }) => {
        const role = roleOf(action.c)
        return (
          <div
            key={action.c}
            className={`${styles.handRowSeg}${roleTextIsDark(role) ? ` ${styles.handRowSegDark}` : ''}`}
            style={{ width: `${p * 100}%`, background: ROLE_COLORS[role] }}
          >
            {p >= 0.14 ? `${label(action.c)} · ${Math.round(p * 100)}%` : ''}
          </div>
        )
      })}
    </span>
  )
}

/**
 * The brass block badge, as the lab's control (plan 77 K-1): click it to
 * pick which slot (H·M·L) the block pins, and — in the lab — to switch
 * between drawing every block or just one fixed card. The guide's teaching
 * figure passes `allowModeToggle={false}` and `allowSinglePicker`: its
 * all-blocks mode is unavailable, but its one fixed card remains selectable.
 */
export function BlockBadge({
  value,
  split,
  mode = 'single',
  singleValue = null,
  order = [],
  available = [],
  infos,
  draftLock = false,
  open,
  onOpen,
  onClose,
  onSplit,
  onMode = () => {},
  onSingle = () => {},
  allowModeToggle,
  allowSinglePicker = allowModeToggle,
  title,
}: {
  /** this block's fixed-card class — the badge names it */
  value: number
  split: 0 | 1 | 2
  mode?: 'all' | 'single'
  /** the fixed card the single chart currently shows */
  singleValue?: number | null
  /** every class in block display order (the card grid mirrors the stack) */
  order?: number[]
  /** classes some real hand can put in the split slot */
  available?: number[]
  infos: ClassInfo[]
  /** a drafted card owns the block choice while it is set */
  draftLock?: boolean
  open: boolean
  onOpen: () => void
  onClose: () => void
  onSplit: (i: 0 | 1 | 2) => void
  onMode?: (m: 'all' | 'single') => void
  onSingle?: (cls: number) => void
  /** the lab's full picker: split + all-vs-single mode + which-card grid.
   *  the guide passes false — its figure is always a single fixed block,
   *  so only the split row renders (plan 77 L-3). */
  allowModeToggle: boolean
  /** Show the fixed-card grid even when this caller has no all-vs-single
   * toggle. The guide uses this for its always-single teaching chart. */
  allowSinglePicker?: boolean
  /** overrides the button's default tooltip */
  title?: string
}) {
  const t = useTranslations('Study.lab')
  const slotWords = [t('slotHighest'), t('slotMiddle'), t('slotLowest')]
  return (
    <span className={styles.badgeAnchor}>
      <button
        type="button"
        className={styles.blockHeadBtn}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('blockBadgeAria', { slot: slotWords[split], card: infos[value].label })}
        title={title ?? t('blockBadgeTitle')}
        onClick={() => (open ? onClose() : onOpen())}
      >
        {'HML'[split]} = <ClassMark info={infos[value]} />
        <span className={styles.blockHeadCaret} aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <>
          <div className={styles.badgeBackdrop} onClick={onClose} />
          <div
            role="menu"
            aria-label={t('blockMenuAria')}
            className={styles.badgeMenu}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
            }}
          >
            <span className={styles.badgeMenuLabel}>{t('splitBy')}</span>
            <div className={styles.badgeMenuRow} role="group" aria-label={t('splitBy')}>
              {([0, 1, 2] as const).map((i) => (
                <button
                  key={i}
                  type="button"
                  role="menuitemradio"
                  aria-checked={split === i}
                  className={split === i ? styles.badgeOptOn : styles.badgeOpt}
                  title={t('splitTitle', { slot: slotWords[i] })}
                  onClick={() => onSplit(i)}
                >
                  <b>{'HML'[i]}</b>
                  <i>{slotWords[i]}</i>
                </button>
              ))}
            </div>
            {allowModeToggle ? (
              <>
                <span className={styles.badgeMenuLabel}>{t('blockShowLabel')}</span>
                <div className={styles.badgeMenuRow} role="group" aria-label={t('blockShowLabel')}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={mode === 'all'}
                    disabled={draftLock}
                    className={mode === 'all' ? styles.badgeOptOn : styles.badgeOpt}
                    title={t('blockShowAllTitle', { slot: slotWords[split] })}
                    onClick={() => onMode('all')}
                  >
                    {t('blockShowAll')}
                  </button>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={mode === 'single'}
                    disabled={draftLock}
                    className={mode === 'single' ? styles.badgeOptOn : styles.badgeOpt}
                    title={t('blockShowOneTitle')}
                    onClick={() => onMode('single')}
                  >
                    {t('blockShowOne')}
                  </button>
                </div>
              </>
            ) : null}
            {allowSinglePicker && mode === 'single' ? (
              draftLock ? (
                <span className={styles.badgeMenuNote}>{t('blockDraftNote', { slot: slotWords[split] })}</span>
              ) : (
                <>
                  <span className={styles.badgeMenuLabel}>{t('blockFixedCard')}</span>
                  <div className={styles.badgeCardGrid} role="group" aria-label={t('blockFixedCard')}>
                    {order.map((c) => (
                      <button
                        key={c}
                        type="button"
                        role="menuitemradio"
                        aria-checked={singleValue === c}
                        disabled={!available.includes(c)}
                        className={singleValue === c ? styles.badgeCardOptOn : styles.badgeCardOpt}
                        title={
                          available.includes(c)
                            ? undefined
                            : t('slotInfeasible', { card: infos[c].label, slot: slotWords[split] })
                        }
                        onClick={() => onSingle(c)}
                      >
                        <ClassMark info={infos[c]} />
                      </button>
                    ))}
                  </div>
                </>
              )
            ) : null}
          </div>
        </>
      ) : null}
    </span>
  )
}

/** the LIST row's compare bar: this spot's mix above, the other's below */
export function ListRowDuoBar({
  sides,
  tags,
  roleOf,
}: {
  /** exactly two sides: here first, there second */
  sides: ReadonlyArray<readonly DisplayAction[]>
  /** micro tag naming each bar, in the same order */
  tags: readonly string[]
  roleOf: (code: number) => ActionRole
}) {
  return (
    <span className={styles.handRowDuo}>
      {sides.map((side, si) => (
        <span key={si} className={styles.handRowDuoBar}>
          <i className={styles.duoTag}>{tags[si]}</i>
          {side.map(({ action, p }) => (
            <div key={action.c} style={{ width: `${p * 100}%`, background: ROLE_COLORS[roleOf(action.c)] }} />
          ))}
        </span>
      ))}
    </span>
  )
}
