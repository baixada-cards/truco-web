'use client'

import { useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'

import styles from './StudyTimeline.module.css'
import {
  type ActionOption,
  type ChartNode,
  type NodeStage,
} from './lib/study-data'

/** One decision along the pinned hand, resolved against the current export. */
export interface TimelineDecision {
  /** line prefix this decision sits at */
  k: number
  /** absolute seat to act */
  seat: number
  role: 'mão' | 'pé'
  stage: NodeStage
  /** the acting seat's chart, when the export reaches this branch */
  node: ChartNode | undefined
  /** deal-joint mass of the node — arrival % once divided by the root mass */
  mass?: number
  /** the pinned action, undefined for the frontier decision */
  chosen: number | undefined
  options: ActionOption[] | null
  /** options are the pinned hand's own mix, not the whole-range frequency */
  handConditioned?: boolean
}

export type TerminalInfo =
  | { kind: 'folded'; role: 'mão' | 'pé'; eleven: boolean }
  | { kind: 'round3' }
  | null

interface StudyTimelineProps {
  decisions: TimelineDecision[]
  terminal: TerminalInfo
  cursorK: number
  labels: string[]
  deepLoading: boolean
  /** the band root's mass, the denominator for arrival percentages */
  rootW: number
  /** hands pinned for the whole walk, shown above the rail */
  pins: Array<{ role: 'mão' | 'pé'; slots: (number | null)[] }>
  onUnpin: (role: 'mão' | 'pé') => void
  onView: (k: number) => void
  onPick: (k: number, code: number) => void
  onReset: () => void
  /** deck-legality gate for one decision's card action (plan 77 L-2); a
   *  card/hide code that fails this is greyed and blocked, matching the
   *  range picker's disabled treatment. Bids/accept/fold are never gated. */
  actionAvailable: (decision: TimelineDecision, code: number) => boolean
}

/** percent with one decimal only when it carries information */
function fmtPct(p: number): string {
  const s = (p * 100).toFixed(1)
  return s.endsWith('.0') ? s.slice(0, -2) : s
}

/** picker order: plays strongest-first, hides after, then bids */
function optionOrder(code: number): number {
  if (code <= 12) return 100 - code
  if (code <= 25) return 300 - code
  if (code >= 27 && code <= 30) return 400 + code
  if (code === 31 || code === 33) return 500
  return 510
}

function ActionChip({
  code,
  labels,
  empty = false,
}: {
  code: number | null
  labels: string[]
  empty?: boolean
}) {
  const t = useTranslations('Study.timeline')
  const tt = useTranslations('Study.terms')
  if (code === null || empty) {
    return (
      <span className={styles.chipEmpty} title={t('noActionPinned')}>
        ·
      </span>
    )
  }
  if (code <= 12) {
    return <span className={styles.chipCard}><CardText text={labels[code]} /></span>
  }
  if (code <= 25) {
    return <span className={styles.chipHidden}><CardText text={labels[code - 13]} /> ↓</span>
  }
  if (code === 26) {
    return <span className={styles.chipHidden}>?</span>
  }
  if (code >= 27 && code <= 30) {
    return <span className={styles.chipBid}>truco {[3, 6, 9, 12][code - 27]}</span>
  }
  if (code === 31 || code === 33) return <span className={styles.chipBid}>{tt('accept')}</span>
  return <span className={styles.chipFold}>{tt('fold')}</span>
}

/** card label with the manilha suit glyph tinted like the charts */
function CardText({ text }: { text: string }) {
  const suit = text.slice(-1)
  if (!'♦♠♥♣'.includes(suit)) return <>{text}</>
  const red = suit === '♥' || suit === '♦'
  return (
    <>
      {text.slice(0, -1)}
      <span className={red ? styles.suitRed : styles.suitBlack}>{suit}</span>
    </>
  )
}

/**
 * One pickable action, drawn as a single surface: card plays look like the
 * card itself (face down in bordeaux), bids are wide text pills.
 */
function OptionButton({
  option,
  labels,
  active,
  impossible = false,
  tourId,
  onPick,
}: {
  option: ActionOption
  labels: string[]
  active: boolean
  /** deck-impossible given the other hand + vira + plays so far (plan 77 L-2):
   *  greyed and blocked exactly like the range picker's disabled treatment */
  impossible?: boolean
  /** stable hook for the tour's fine-grained targeting (plan 81) */
  tourId?: string
  onPick: () => void
}) {
  const t = useTranslations('Study.timeline')
  const tt = useTranslations('Study.terms')
  const { code, p } = option
  const never = p < 0.0005
  const pct = never ? '—' : `${fmtPct(p)}%`
  const actionTitle = (c: number): string => {
    if (c === 33) return tt('acceptEleven')
    if (c === 34) return tt('foldEleven')
    if (c === 31) return tt('acceptRaise')
    if (c === 32) return tt('foldAction')
    if (c === 26) return tt('hiddenCard')
    if (c >= 27 && c <= 30) return tt('raiseTo', { n: [3, 6, 9, 12][c - 27] })
    if (c >= 13 && c <= 25) return tt('playFaceDown', { card: labels[c - 13] })
    return tt('playCard', { card: labels[c] })
  }
  const title = impossible
    ? `${actionTitle(code)} — ${t('optionImpossible')}`
    : `${actionTitle(code)} — ${t('optionTitleSuffix', { pct: fmtPct(p) })}`
  const mods = `${active ? ` ${styles.on}` : ''}${never ? ` ${styles.never}` : ''}${impossible ? ` ${styles.impossible}` : ''}`
  const handlePick = () => {
    if (impossible) return
    onPick()
  }
  if (code <= 25) {
    const hide = code >= 13
    return (
      <button
        type="button"
        className={`${hide ? styles.optionHide : styles.optionCard}${mods}`}
        title={title}
        disabled={impossible}
        data-tour-id={tourId}
        onClick={handlePick}
      >
        <span className={styles.optionRank}>
          <CardText text={labels[hide ? code - 13 : code]} />
          {hide ? ' ↓' : ''}
        </span>
        <span className={styles.optionPct}>{pct}</span>
      </button>
    )
  }
  return (
    <button
      type="button"
      className={`${styles.optionBid}${mods}`}
      title={title}
      disabled={impossible}
      data-tour-id={tourId}
      onClick={handlePick}
    >
      <span>
        {code >= 27 && code <= 30
          ? `truco ${[3, 6, 9, 12][code - 27]}`
          : code === 31 || code === 33
            ? tt('accept')
            : tt('fold')}
      </span>
      <span className={styles.optionPct}>{pct}</span>
    </button>
  )
}

export function StudyTimeline({
  decisions,
  terminal,
  cursorK,
  labels,
  deepLoading,
  rootW,
  pins,
  onUnpin,
  onView,
  onPick,
  onReset,
  actionAvailable,
}: StudyTimelineProps) {
  const t = useTranslations('Study.timeline')
  const tt = useTranslations('Study.terms')

  function groupTitle(stage: NodeStage): string {
    if (stage.kind === 'eleven') return t('eleven')
    return t('round', { n: stage.trick })
  }

  function decisionVerb(d: TimelineDecision): string {
    if (d.stage.kind === 'eleven') return t('verbAcceptFold')
    if (d.stage.kind === 'raise-answer') return t('verbAnswerTruco')
    return d.stage.role === 'lead' ? t('verbLeads') : t('verbAnswers')
  }

  function roleTitle(role: 'mão' | 'pé'): string {
    const w = role === 'pé' ? tt('pe') : tt('mao')
    return w.charAt(0).toUpperCase() + w.slice(1)
  }

  function actionTitle(code: number): string {
    if (code === 33) return tt('acceptEleven')
    if (code === 34) return tt('foldEleven')
    if (code === 31) return tt('acceptRaise')
    if (code === 32) return tt('foldAction')
    if (code === 26) return tt('hiddenCard')
    if (code >= 27 && code <= 30) return tt('raiseTo', { n: [3, 6, 9, 12][code - 27] })
    if (code >= 13 && code <= 25) return tt('playFaceDown', { card: labels[code - 13] })
    return tt('playCard', { card: labels[code] })
  }

  const pinnedRoles = new Set(pins.map((p) => p.role))
  const cursorIdx = Math.max(
    0,
    decisions.findIndex((d) => d.k === cursorK),
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      // the tour scripts navigation itself — keyboard shortcuts would jump the
      // cursor mid-step (and falsely auto-advance the nav steps)
      if (document.body.hasAttribute('data-tour-open')) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      if (e.key === 'ArrowLeft' && cursorIdx > 0) {
        onView(decisions[cursorIdx - 1].k)
        e.preventDefault()
      }
      if (e.key === 'ArrowRight' && cursorIdx < decisions.length - 1) {
        onView(decisions[cursorIdx + 1].k)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [decisions, cursorIdx, onView])

  const sortedOptions = useMemo(() => {
    const map = new Map<number, ActionOption[]>()
    for (const d of decisions) {
      if (!d.options) continue
      map.set(
        d.k,
        [...d.options].sort((a, b) => optionOrder(a.code) - optionOrder(b.code)),
      )
    }
    return map
  }, [decisions])

  const hasLine = decisions.some((d) => d.chosen !== undefined)

  return (
    <nav className={styles.navigator} aria-label={t('ariaTimeline')}>
      <div className={styles.head}>
        <span className={styles.kicker}>{t('theHand')}</span>
        <div className={styles.headBtns}>
          <button
            type="button"
            className={styles.navBtn}
            disabled={cursorIdx <= 0}
            aria-label={t('prevDecision')}
            title={t('prevDecisionTitle')}
            data-tour-id="rail-prev"
            onClick={() => onView(decisions[cursorIdx - 1].k)}
          >
            ◀
          </button>
          <span className={styles.headPos}>
            {decisions.length ? `${cursorIdx + 1} / ${decisions.length}` : '–'}
          </span>
          <button
            type="button"
            className={styles.navBtn}
            disabled={cursorIdx >= decisions.length - 1}
            aria-label={t('nextDecision')}
            title={t('nextDecisionTitle')}
            data-tour-id="rail-next"
            onClick={() => onView(decisions[cursorIdx + 1].k)}
          >
            ▶
          </button>
          <button
            type="button"
            className={styles.navBtn}
            disabled={!hasLine}
            aria-label={t('clearHand')}
            title={t('clearHandTitle')}
            onClick={onReset}
          >
            ↺
          </button>
        </div>
      </div>

      {pins.map((pin) => (
        <div key={pin.role} className={styles.pinStrip} data-tour-id="rail-pins">
          <span
            className={pin.role === 'pé' ? styles.seatDotPe : styles.seatDotMao}
            aria-hidden
          />
          <b>{pin.role === 'pé' ? 'Pé' : 'Mão'}</b>
          <span className={styles.pinCards}>
            {pin.slots.map((c, i) => (
              <ActionChip key={i} code={c} labels={labels} />
            ))}
          </span>
          <button
            type="button"
            className={styles.pinOff}
            title={t('unpinHand')}
            aria-label={t('unpinRoleHand', { role: pin.role === 'pé' ? tt('pe') : tt('mao') })}
            onClick={() => onUnpin(pin.role)}
          >
            ×
          </button>
        </div>
      ))}

      <ol className={styles.rail}>
        {decisions.map((d, i) => {
          const prev = decisions[i - 1]
          const showGroup = !prev || groupTitle(prev.stage) !== groupTitle(d.stage)
          const active = i === cursorIdx
          const options = sortedOptions.get(d.k)
          const overallReach = d.mass !== undefined && rootW > 0 ? d.mass / rootW : null
          const conditionalReach =
            overallReach !== null && prev?.mass !== undefined && prev.mass > 0
              ? d.mass! / prev.mass
              : null
          const reachTitle =
            conditionalReach !== null && prev?.chosen !== undefined
              ? t('reachTitleConditional', {
                  overall: fmtPct(overallReach!),
                  conditional: fmtPct(conditionalReach),
                  action: actionTitle(prev.chosen),
                })
              : overallReach !== null
                ? t('reachTitleOverall', { overall: fmtPct(overallReach) })
                : undefined
          return (
            <li key={d.k} className={styles.slot}>
              {showGroup ? <span className={styles.groupLabel}>{groupTitle(d.stage)}</span> : null}
              <div className={active ? styles.stepOn : styles.step}>
                <button
                  type="button"
                  className={styles.stepHead}
                  data-tour-id={`rail-plate-${d.k}`}
                  onClick={() => onView(d.k)}
                >
                  <span className={d.role === 'pé' ? styles.seatDotPe : styles.seatDotMao} aria-hidden />
                  <span className={styles.stepText}>
                    <b>
                      {roleTitle(d.role)}
                      {pinnedRoles.has(d.role) ? (
                        <span
                          className={styles.pinMark}
                          title={t('handPinnedTitle')}
                          aria-label={t('handPinnedTitle')}
                        >
                          {' '}
                          ⚑
                        </span>
                      ) : null}
                    </b>{' '}
                    {decisionVerb(d)}
                    {overallReach !== null ? (
                      <i className={styles.stepReach} title={reachTitle}>
                        {t('reachOverall', { pct: fmtPct(overallReach) })}
                        {conditionalReach !== null ? (
                          <>
                            <span aria-hidden> · </span>
                            {t('reachConditional', { pct: fmtPct(conditionalReach) })}
                          </>
                        ) : null}
                      </i>
                    ) : null}
                    {!d.node ? (
                      <small className={styles.stepWarn}>
                        {deepLoading ? t('loadingCharts') : t('notInExport')}
                      </small>
                    ) : null}
                  </span>
                  {d.chosen !== undefined || !active ? (
                    <ActionChip code={d.chosen ?? null} labels={labels} />
                  ) : null}
                </button>
                {active && options && options.length > 0 ? (
                  <div className={styles.picker} role="group" aria-label={t('pickAction')}>
                    {(() => {
                      const plays = options.filter((o) => o.code <= 12)
                      const hides = options.filter((o) => o.code >= 13 && o.code <= 25)
                      const bids = options.filter((o) => o.code >= 27)
                      const render = (o: ActionOption) => (
                        <OptionButton
                          key={o.code}
                          option={o}
                          labels={labels}
                          active={d.chosen === o.code}
                          impossible={!actionAvailable(d, o.code)}
                          tourId={`rail-opt-${d.k}-${o.code}`}
                          onPick={() => onPick(d.k, o.code)}
                        />
                      )
                      return (
                        <>
                          {plays.length > 0 ? (
                            <div className={styles.optionGrid}>{plays.map(render)}</div>
                          ) : null}
                          {hides.length > 0 ? (
                            <>
                              <span className={styles.sectionLabel}>{t('playedFaceDown')}</span>
                              <div className={styles.optionGrid}>{hides.map(render)}</div>
                            </>
                          ) : null}
                          {bids.length > 0 ? (
                            <div className={styles.bidRow}>{bids.map(render)}</div>
                          ) : null}
                        </>
                      )
                    })()}
                    <span className={styles.pickerHint}>
                      {d.handConditioned
                        ? t('hintHandConditioned')
                        : t('hintRangeFreq')}
                    </span>
                  </div>
                ) : null}
              </div>
            </li>
          )
        })}

        {terminal ? (
          <li className={styles.slot}>
            {terminal.kind === 'round3' ? (
              <>
                <span className={styles.groupLabel}>{t('round', { n: 3 })}</span>
                <div className={styles.terminal}>
                  {t.rich('round3Body', { b: (c) => <b>{c}</b> })}
                </div>
              </>
            ) : (
              <div className={styles.terminal}>
                <b>{t('handOver')}</b>{' '}
                {terminal.eleven
                  ? t('foldedEleven', { role: roleTitle(terminal.role) })
                  : t('foldedTruco', { role: roleTitle(terminal.role) })}
              </div>
            )}
          </li>
        ) : null}
      </ol>

      {!hasLine ? (
        <p className={styles.emptyHint}>
          {t('emptyHint')}
        </p>
      ) : null}
    </nav>
  )
}
