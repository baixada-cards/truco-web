'use client'

import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'

import type { DeckSystem } from '../../lib/deck-system'
import type { StateCompletedRound, StatePlay } from '../../lib/session-api'
import type { Seat } from '../../lib/live-bot-selection'
import type { CardDisplay } from '../../lib/live-card-utils'
import type { GatherState } from '../../lib/live-engine-events'
import { lampRaiseFxForStakeAction } from '../../lib/live-lamp-fx'
import type { StakeFx } from '../../lib/live-stake-fx'
import type { ScorePadElevenFocusMode, ScorePadSide } from '../../lib/score-pad-eleven-markers'
import { resolveScorePadElevenRingSide } from '../../lib/score-pad-eleven-markers'
import type { StakeCalloutStyle } from '../../lib/stake-callout-style'
import type { DeckSwitchAnimation } from '../../lib/deck-switch-animation'
import { idleStakePegRefuseDrag, resolveStakePegRefuseDrag } from '../../lib/stake-peg-refuse-gesture'
import { useAnimatedTallyCount } from '../../lib/use-animated-tally-count'
import { Card } from '../live/LiveCard'
import { ScorePad } from './ScorePad'
import { DockDealerInset, type DealerSide } from './DealerMark'
import { DeckWithVira } from './DeckWithVira'
import { DeckSwitchAnimationContext } from './DeckSwitchAnimationContext'
import { FarolSettingsButton } from './FarolSettingsButton'
import { FarolStudyButton, type FarolStudyButtonState } from './FarolStudyButton'
import { Peg } from './Peg'
import { toFarolSuit, toFarolRank, nextManilhaRank } from './farol-card-utils'

import './FarolTable.css'

type FarolIntroPhase = 'tilted' | 'settling' | null

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function completedRoundForSeat(round: StateCompletedRound, player: Seat): StatePlay | null {
  return round.plays.find((play) => play.player === player) ?? null
}

function getCardLayoutId(cardId: string) {
  return `card-${cardId}`
}

function traceCardFromPlay(play: StatePlay | null): (CardDisplay & { hidden: boolean }) | null {
  if (!play) return null
  return {
    id: play.card.id,
    rank: play.card.rank,
    suit: play.card.suit,
    hidden: play.visibility === 'down',
  }
}

const ROUND_NUMERALS = ['I', 'II', 'III'] as const
const DECK_SWITCH_DISSOLVE_MS = 450
const DECK_SWITCH_LAMP_SWAP_MS = 150
const DECK_SWITCH_LAMP_TOTAL_MS = 400
const DEFAULT_LAMP_SWING_LEAD_MS = 330
const STAKE_CAPTIONS: Record<number, string> = {
  3: 'truco',
  6: 'six',
  9: 'nine',
  12: 'twelve',
}

type FarolDockButton = {
  isOpen: boolean
  onClick: () => void
}

type DeckSwitchFx = {
  runId: number
  animation: DeckSwitchAnimation
  phase: 'dissolve' | 'lamp-dimming' | 'lamp-relighting'
  previousSystem: DeckSystem
}

function prefersReducedDeckSwitchMotion() {
  return typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function playedRotationClass(index: number, side: 'hero' | 'villain') {
  if (index === 0 && side === 'villain') return 'ft-played-rotate-villain-1'
  if (index === 0 && side === 'hero') return 'ft-played-rotate-hero-1'
  if (index === 1 && side === 'villain') return 'ft-played-rotate-villain-2'
  if (index === 1 && side === 'hero') return 'ft-played-rotate-hero-2'
  if (index === 2 && side === 'villain') return 'ft-played-rotate-villain-3'
  if (index === 2 && side === 'hero') return 'ft-played-rotate-hero-3'
  return ''
}

function splitStakeCalloutText(
  stakeFx: StakeFx | null,
  fallback: string,
  labels: {
    yourRaise: string
    theirRaise: string
    yourReraise: string
    theirReraise: string
    locked: string
    youFold: string
    theyFold: string
  },
) {
  if (!stakeFx) return fallback

  switch (stakeFx.action) {
    case 'raise':
      return stakeFx.actor === 'hero' ? labels.yourRaise : labels.theirRaise
    case 'reraise':
      return stakeFx.actor === 'hero' ? labels.yourReraise : labels.theirReraise
    case 'accept':
      return labels.locked
    case 'decline':
      return stakeFx.actor === 'hero' ? labels.youFold : labels.theyFold
  }
}

function railTallyCount(score: number) {
  return Math.min(12, Math.max(0, Math.floor(score)))
}

function ScoreRailTally({ score }: { score: number }) {
  const visibleScore = useAnimatedTallyCount(score)

  return (
    <span className="ft-score-rail-tally" aria-hidden="true">
      {Array.from({ length: railTallyCount(visibleScore) }, (_, index) => (
        <span className="ft-score-rail-tally-stroke" key={index} />
      ))}
    </span>
  )
}

function ScoreRail({
  active,
  heroScore,
  villainScore,
  to,
  dealerSide,
  canUnroll,
  onUnroll,
  onSettingsClick,
  settingsOpen,
  settingsAlert,
  devControlsButton,
  studyButton,
  scoreRowRefs,
  scoreNumberRefs,
  scoreCelebration,
}: {
  active: boolean
  heroScore: number
  villainScore: number
  to: number
  dealerSide: DealerSide | null
  canUnroll: boolean
  onUnroll: () => void
  onSettingsClick: () => void
  settingsOpen: boolean
  settingsAlert: boolean
  devControlsButton?: FarolDockButton | null
  studyButton?: FarolStudyButtonState | null
  scoreRowRefs: MutableRefObject<{ hero: HTMLDivElement | null; villain: HTMLDivElement | null }>
  scoreNumberRefs: MutableRefObject<{ hero: HTMLSpanElement | null; villain: HTMLSpanElement | null }>
  scoreCelebration: { hero?: string | null; villain?: string | null }
}) {
  const tCommon = useTranslations('Common')
  const tTable = useTranslations('Live.table')

  return (
    <div
      className={['ft-score-rail', active ? 'is-visible' : ''].filter(Boolean).join(' ')}
      data-testid={active ? 'farol-score-rail' : undefined}
      aria-hidden={!active}
    >
      <div className="ft-score-rail-left">
        {canUnroll && (
          <button
            type="button"
            className="ft-score-rail-unroll"
            aria-label={tTable('unrollScorepad')}
            onClick={onUnroll}
            tabIndex={active ? 0 : -1}
            disabled={!active}
          >
            <span className="ft-score-rail-unroll-icon" aria-hidden="true" />
            <span>{tTable('unroll')}</span>
          </button>
        )}
      </div>

      <div className="ft-score-rail-score" aria-label={tTable('scoreAria', { heroScore, villainScore, to })}>
        <div
          className="ft-score-rail-side ft-score-rail-side-hero"
          data-testid={active ? 'score-row-hero' : undefined}
          data-score-points={heroScore}
          data-score-celebration={scoreCelebration.hero ?? undefined}
          ref={(node) => {
            if (active) scoreRowRefs.current.hero = node
          }}
        >
          <span className="ft-score-rail-name">{tCommon('you')}</span>
          <span
            className="ft-score-rail-num score-number"
            aria-label={tTable('youScoreAria', { score: heroScore })}
            data-score-display-style="farol"
            ref={(node) => {
              if (active) scoreNumberRefs.current.hero = node
            }}
          >
            {heroScore}
          </span>
          <DockDealerInset active={dealerSide === 'hero'} size={18} />
          <ScoreRailTally score={heroScore} />
        </div>

        <span className="ft-score-rail-vs" aria-hidden="true">·</span>

        <div
          className="ft-score-rail-side ft-score-rail-side-villain"
          data-testid={active ? 'score-row-villain' : undefined}
          data-score-points={villainScore}
          data-score-celebration={scoreCelebration.villain ?? undefined}
          ref={(node) => {
            if (active) scoreRowRefs.current.villain = node
          }}
        >
          <ScoreRailTally score={villainScore} />
          <DockDealerInset active={dealerSide === 'villain'} size={18} />
          <span
            className="ft-score-rail-num score-number"
            aria-label={tTable('themScoreAria', { score: villainScore })}
            data-score-display-style="farol"
            ref={(node) => {
              if (active) scoreNumberRefs.current.villain = node
            }}
          >
            {villainScore}
          </span>
          <span className="ft-score-rail-name">{tCommon('them')}</span>
        </div>

        <span className="ft-score-rail-goal">{tTable('to', { score: to })}</span>
      </div>

      <div className="ft-score-rail-actions">
        {active && devControlsButton && (
          <button
            type="button"
            className={[
              'ft-score-rail-dev',
              devControlsButton.isOpen ? 'is-active' : '',
            ].filter(Boolean).join(' ')}
            data-testid="live-dev-controls-dock-button"
            aria-label={devControlsButton.isOpen ? 'Close dev controls' : 'Open dev controls'}
            aria-expanded={devControlsButton.isOpen}
            onClick={devControlsButton.onClick}
            tabIndex={active ? 0 : -1}
          >
            <span>DEV</span>
          </button>
        )}
        {active && studyButton && (
          <FarolStudyButton
            className="ft-score-rail-study"
            variant="outline"
            label={studyButton.label}
            href={studyButton.href}
            disabledReason={studyButton.disabledReason}
          />
        )}
        {active && (
          <FarolSettingsButton
            className="ft-score-rail-settings"
            variant="outline"
            isOpen={settingsOpen}
            hasAlert={settingsAlert}
            onClick={onSettingsClick}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// FarolTable
// ---------------------------------------------------------------------------

export function FarolTable({
  heroScore,
  villainScore,
  dealerSide,
  dealerHandKey,
  elevenRingSide,
  maoDeOnzeSide,
  elevenFocusMode,
  displayedStake,
  stakeFx,
  stakeFxCallout,
  stakeFxLiveBadge,
  stakeCalloutStyle,
  deckSwitchAnimation,
  deckSystem,
  betweenHandsGather,
  stakeActionLabel,
  stakeRefuseActionLabel,
  heroIsResponder,
  humanElevenDecisionPending,
  humanPlayer,
  botPlayer,
  turnupCard,
  turnupFaceDown,
  turnupRef,
  displayedCompletedRounds,
  roundRefs,
  displayedVillainTableCard,
  displayedHeroTableCard,
  shouldHideVillainTableCardForOverlay,
  shouldHideHeroTableCardForOverlay,
  currentOpponentCardRef,
  currentPlayerCardRef,
  stakeCurrentRef,
  scoreRowRefs,
  scoreNumberRefs,
  scoreCelebration,
  onSettingsClick,
  settingsOpen,
  settingsAlert,
  devControlsButton,
  studyButton,
  scorepadCanUsePaper,
  scorepadRailVisible,
  scorepadRolled,
  onRollScorepad,
  onUnrollScorepad,
  isHeroDragActive,
  isHeroDragOverDropTarget,
  heroPlayMotionActive,
  fastModeEnabled,
  lampSwingLeadMs = DEFAULT_LAMP_SWING_LEAD_MS,
  introPhase,
  layoutMoveDurationS,
  onStakeAction,
  onStakeRefuse,
  onDeckSwitch,
  onDeckClick,
  onHeroTableCardLayoutStart,
  onHeroTableCardLayoutComplete,
  villainHandSlot,
  heroHandSlot,
  decisionRailSlot,
}: {
  heroScore: number
  villainScore: number
  dealerSide: DealerSide | null
  dealerHandKey: string | number | null
  elevenRingSide?: ScorePadSide | null
  maoDeOnzeSide?: ScorePadSide | null
  elevenFocusMode?: ScorePadElevenFocusMode | null
  displayedStake: number
  stakeFx: StakeFx | null
  stakeFxCallout: string | null
  stakeFxLiveBadge: string | null
  stakeCalloutStyle: StakeCalloutStyle
  deckSwitchAnimation: DeckSwitchAnimation
  deckSystem: DeckSystem
  betweenHandsGather: GatherState
  stakeActionLabel: string | null
  stakeRefuseActionLabel: string | null
  heroIsResponder: boolean
  humanElevenDecisionPending: boolean
  humanPlayer: Seat
  botPlayer: Seat
  turnupCard: CardDisplay | null
  turnupFaceDown: boolean
  turnupRef: MutableRefObject<HTMLDivElement | null>
  displayedCompletedRounds: StateCompletedRound[]
  roundRefs: MutableRefObject<(HTMLDivElement | null)[]>
  displayedVillainTableCard: CardDisplay | null
  displayedHeroTableCard: CardDisplay | null
  shouldHideVillainTableCardForOverlay: boolean
  shouldHideHeroTableCardForOverlay: boolean
  currentOpponentCardRef: MutableRefObject<HTMLDivElement | null>
  currentPlayerCardRef: MutableRefObject<HTMLDivElement | null>
  stakeCurrentRef: MutableRefObject<HTMLElement | null>
  scoreRowRefs: MutableRefObject<{ hero: HTMLDivElement | null; villain: HTMLDivElement | null }>
  scoreNumberRefs: MutableRefObject<{ hero: HTMLSpanElement | null; villain: HTMLSpanElement | null }>
  scoreCelebration: { hero?: string | null; villain?: string | null }
  onSettingsClick: () => void
  settingsOpen: boolean
  settingsAlert: boolean
  devControlsButton?: FarolDockButton | null
  studyButton?: FarolStudyButtonState | null
  scorepadCanUsePaper: boolean
  scorepadRailVisible: boolean
  scorepadRolled: boolean
  onRollScorepad: () => void
  onUnrollScorepad: () => void
  isHeroDragActive: boolean
  isHeroDragOverDropTarget: boolean
  heroPlayMotionActive: boolean
  fastModeEnabled: boolean
  lampSwingLeadMs?: number
  introPhase: FarolIntroPhase
  layoutMoveDurationS: number
  onStakeAction: (() => void) | null
  onStakeRefuse: (() => void) | null
  onDeckSwitch: (system: DeckSystem) => void
  onDeckClick?: () => void
  onHeroTableCardLayoutStart: () => void
  onHeroTableCardLayoutComplete: () => void
  villainHandSlot: ReactNode
  heroHandSlot: ReactNode
  decisionRailSlot: ReactNode
}) {
  const tActions = useTranslations('Live.actions')
  const tTable = useTranslations('Live.table')
  const [stakeBurst, setStakeBurst] = useState<{ runId: number; style: CSSProperties } | null>(null)
  const [stakeRefuseDrag, setStakeRefuseDrag] = useState(idleStakePegRefuseDrag)
  const [lampRaiseFxClass, setLampRaiseFxClass] = useState('')
  const [deckSwitchFx, setDeckSwitchFx] = useState<DeckSwitchFx | null>(null)
  const stakeRefusePointerRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null)
  const suppressStakeClickRef = useRef(false)
  const deckSwitchRunIdRef = useRef(0)
  const deckSwitchTimeoutsRef = useRef<number[]>([])
  const scorepadElevenRingSide = elevenRingSide ?? resolveScorePadElevenRingSide({
    hero: heroScore,
    villain: villainScore,
  })
  const resolvedElevenFocusMode: ScorePadElevenFocusMode | null =
    elevenFocusMode ?? maoDeOnzeSide ?? (heroScore === 11 && villainScore === 11 ? 'duel' : null)
  const elevenDecisionFocus = resolvedElevenFocusMode === 'hero' || resolvedElevenFocusMode === 'villain'
  const elevenDuelFocus = resolvedElevenFocusMode === 'duel'
  const showHeroElevenEdge = resolvedElevenFocusMode === 'hero' || resolvedElevenFocusMode === 'duel'
  const showVillainElevenEdge = resolvedElevenFocusMode === 'villain' || resolvedElevenFocusMode === 'duel'
  const activeRoundIndex = displayedCompletedRounds.length
  const leadingScore = Math.max(heroScore, villainScore)
  const lampTension = leadingScore >= 11
    ? 'eleven'
    : leadingScore >= 9
      ? 'nine'
      : 'idle'
  const manilhaRank = turnupCard && !turnupFaceDown ? nextManilhaRank(turnupCard.rank) : null
  const scorepadDataActive = scorepadCanUsePaper && !scorepadRailVisible
  const shouldShowHeroTableCard = Boolean(displayedHeroTableCard && !shouldHideHeroTableCardForOverlay)
  const shouldShowVillainTableCard = Boolean(displayedVillainTableCard && !shouldHideVillainTableCardForOverlay)
  const hasActiveTableCard = shouldShowHeroTableCard || shouldShowVillainTableCard
  const stakeCaption = humanElevenDecisionPending
    ? tTable('elevenHand')
    : heroIsResponder && displayedStake > 1
      ? tActions((STAKE_CAPTIONS[displayedStake] ?? String(displayedStake)) as 'truco' | 'six' | 'nine' | 'twelve')
      : null
  const stakeSubcaption = humanElevenDecisionPending
    ? tTable('worthNoRaises')
    : heroIsResponder
      ? tTable('theyCalled')
      : null
  const stakeActionable = Boolean(onStakeAction && stakeActionLabel)
  const stakeRefuseActionable = Boolean(onStakeRefuse && stakeRefuseActionLabel)
  const stakeCalloutText = stakeFxCallout && stakeCalloutStyle === 'split'
    ? splitStakeCalloutText(stakeFx, stakeFxCallout, {
        yourRaise: tTable('yourRaise'),
        theirRaise: tTable('theirRaise'),
        yourReraise: tTable('yourReraise'),
        theirReraise: tTable('theirReraise'),
        locked: tTable('locked'),
        youFold: tTable('youFold'),
        theyFold: tTable('theyFold'),
      })
    : stakeFxCallout
  const resolvedLampSwingLeadMs = Math.max(0, Math.min(1000, Math.round(lampSwingLeadMs)))
  const rootStyle = {
    '--ft-lamp-swing-lead': `-${resolvedLampSwingLeadMs}ms`,
  } as CSSProperties
  const stakeClassName = [
    'ft-stake',
    stakeFx ? `is-${stakeFx.action}` : '',
    stakeFx ? `is-by-${stakeFx.actor}` : '',
    `is-callout-${stakeCalloutStyle}`,
    stakeActionable ? 'is-actionable' : '',
    stakeRefuseActionable ? 'is-refusable' : '',
    stakeRefuseDrag.isDragging ? 'is-refuse-dragging' : '',
    stakeRefuseDrag.isArmed ? 'is-refuse-armed' : '',
  ].filter(Boolean).join(' ')
  const stakeDragStyle = stakeRefuseActionable
    ? ({
        '--ft-stake-refuse-drag-y': `${stakeRefuseDrag.offsetY}px`,
      } as CSSProperties)
    : undefined
  const stakeContent = (
    <>
      <Peg
        value={displayedStake}
        state={displayedStake > 1 ? (stakeActionable ? 'pending' : 'accept') : 'idle'}
        size={60}
      />
      {stakeCaption && <div className="ft-stake-caption">{stakeCaption}</div>}
      {stakeSubcaption && <div className="ft-stake-whose">{stakeSubcaption}</div>}
      {stakeCalloutText && (
        <div
          key={`stake-callout-${stakeFx?.runId ?? stakeCalloutText}`}
          className={`ft-stake-fx-callout is-${stakeFx?.action ?? 'active'}`}
          data-testid="live-stake-fx-callout"
        >
          {stakeCalloutText}
        </div>
      )}
      {stakeFxLiveBadge && (
        <div
          className="ft-stake-fx-live-badge"
          data-testid="live-stake-fx-live-badge"
        >
          {stakeFxLiveBadge}
        </div>
      )}
      {stakeRefuseActionable && (
        <span className="ft-stake-refuse-zone" aria-hidden="true">
          {stakeRefuseActionLabel}
        </span>
      )}
    </>
  )
  const clearStakeRefuseDrag = useCallback(() => {
    stakeRefusePointerRef.current = null
    setStakeRefuseDrag(idleStakePegRefuseDrag)
  }, [])

  const suppressNextStakeClick = useCallback(() => {
    suppressStakeClickRef.current = true
    window.setTimeout(() => {
      suppressStakeClickRef.current = false
    }, 0)
  }, [])

  const handleStakePointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!stakeRefuseActionable || event.button !== 0) return

    stakeRefusePointerRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setStakeRefuseDrag(idleStakePegRefuseDrag)
  }, [stakeRefuseActionable])

  const handleStakePointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const pointer = stakeRefusePointerRef.current
    if (!pointer || pointer.pointerId !== event.pointerId) return

    const drag = resolveStakePegRefuseDrag(event.clientX - pointer.startX, event.clientY - pointer.startY)
    if (drag.isDragging) event.preventDefault()
    setStakeRefuseDrag(drag)
  }, [])

  const handleStakePointerEnd = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const pointer = stakeRefusePointerRef.current
    if (!pointer || pointer.pointerId !== event.pointerId) return

    const drag = resolveStakePegRefuseDrag(event.clientX - pointer.startX, event.clientY - pointer.startY)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    clearStakeRefuseDrag()

    if (drag.isDragging) {
      suppressNextStakeClick()
    }
    if (drag.isArmed) {
      onStakeRefuse?.()
    }
  }, [clearStakeRefuseDrag, onStakeRefuse, suppressNextStakeClick])

  const handleStakePointerCancel = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const pointer = stakeRefusePointerRef.current
    if (!pointer || pointer.pointerId !== event.pointerId) return

    suppressNextStakeClick()
    clearStakeRefuseDrag()
  }, [clearStakeRefuseDrag, suppressNextStakeClick])

  const handleStakeClick = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (suppressStakeClickRef.current) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    onStakeAction?.()
  }, [onStakeAction])

  const handleStakeContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (!stakeRefuseActionable) return

    event.preventDefault()
    const pointerType = (event.nativeEvent as MouseEvent & { pointerType?: string }).pointerType
    if (pointerType && pointerType !== 'mouse') return

    onStakeRefuse?.()
  }, [onStakeRefuse, stakeRefuseActionable])
  const stakeNode = stakeActionable ? (
    <button
      type="button"
      className={stakeClassName}
      data-testid="live-stake-indicator"
      data-stake-fx-action={stakeFx?.action ?? ''}
      data-stake-fx-actor={stakeFx?.actor ?? ''}
      data-stake-tooltip={stakeActionLabel ?? undefined}
      data-stake-refuse-tooltip={stakeRefuseActionLabel ?? undefined}
      aria-label={stakeActionLabel ?? undefined}
      onClick={handleStakeClick}
      onContextMenu={stakeRefuseActionable ? handleStakeContextMenu : undefined}
      onPointerDown={stakeRefuseActionable ? handleStakePointerDown : undefined}
      onPointerMove={stakeRefuseActionable ? handleStakePointerMove : undefined}
      onPointerUp={stakeRefuseActionable ? handleStakePointerEnd : undefined}
      onPointerCancel={stakeRefuseActionable ? handleStakePointerCancel : undefined}
      style={stakeDragStyle}
      ref={(node) => {
        stakeCurrentRef.current = node
      }}
    >
      {stakeContent}
    </button>
  ) : (
    <div
      className={stakeClassName}
      data-testid="live-stake-indicator"
      data-stake-fx-action={stakeFx?.action ?? ''}
      data-stake-fx-actor={stakeFx?.actor ?? ''}
      ref={(node) => {
        stakeCurrentRef.current = node
      }}
    >
      {stakeContent}
    </div>
  )
  const clearDeckSwitchTimers = useCallback(() => {
    deckSwitchTimeoutsRef.current.forEach((timer) => {
      window.clearTimeout(timer)
    })
    deckSwitchTimeoutsRef.current = []
  }, [])

  const scheduleDeckSwitchTimer = useCallback((callback: () => void, delayMs: number) => {
    const timer = window.setTimeout(() => {
      deckSwitchTimeoutsRef.current = deckSwitchTimeoutsRef.current.filter((entry) => entry !== timer)
      callback()
    }, delayMs)
    deckSwitchTimeoutsRef.current.push(timer)
  }, [])

  const handleDeckSwitch = useCallback((nextSystem: DeckSystem) => {
    if (nextSystem === deckSystem) return

    const previousSystem = deckSystem
    const runId = deckSwitchRunIdRef.current + 1
    deckSwitchRunIdRef.current = runId
    clearDeckSwitchTimers()

    const effectiveAnimation = deckSwitchAnimation === 'lamp' && !prefersReducedDeckSwitchMotion()
      ? 'lamp'
      : 'dissolve'

    if (effectiveAnimation === 'lamp') {
      setDeckSwitchFx({
        runId,
        animation: 'lamp',
        phase: 'lamp-dimming',
        previousSystem,
      })
      scheduleDeckSwitchTimer(() => {
        onDeckSwitch(nextSystem)
        setDeckSwitchFx({
          runId,
          animation: 'lamp',
          phase: 'lamp-relighting',
          previousSystem,
        })
      }, DECK_SWITCH_LAMP_SWAP_MS)
      scheduleDeckSwitchTimer(() => {
        setDeckSwitchFx((current) => current?.runId === runId ? null : current)
      }, DECK_SWITCH_LAMP_TOTAL_MS)
      return
    }

    setDeckSwitchFx({
      runId,
      animation: 'dissolve',
      phase: 'dissolve',
      previousSystem,
    })
    onDeckSwitch(nextSystem)
    scheduleDeckSwitchTimer(() => {
      setDeckSwitchFx((current) => current?.runId === runId ? null : current)
    }, DECK_SWITCH_DISSOLVE_MS)
  }, [
    clearDeckSwitchTimers,
    deckSwitchAnimation,
    deckSystem,
    onDeckSwitch,
    scheduleDeckSwitchTimer,
  ])

  useEffect(() => () => {
    clearDeckSwitchTimers()
  }, [clearDeckSwitchTimers])

  const deckSwitchCardTransition = useMemo(() => (
    deckSwitchFx?.animation === 'dissolve'
      ? {
          runId: deckSwitchFx.runId,
          previousSystem: deckSwitchFx.previousSystem,
        }
      : null
  ), [deckSwitchFx])
  const deckSwitchAnimationContextValue = useMemo(() => ({
    cardTransition: deckSwitchCardTransition,
  }), [deckSwitchCardTransition])

  const deckSwitchDurationMs = deckSwitchAnimation === 'lamp'
    ? DECK_SWITCH_LAMP_TOTAL_MS
    : DECK_SWITCH_DISSOLVE_MS
  const whisperText = humanElevenDecisionPending
    ? tTable('elevenWhisper')
    : heroIsResponder
      ? tTable('raisedWhisper')
      : null
  const stakeFxAction = stakeFx?.action
  const stakeFxRunId = stakeFx?.runId
  const stakeFxStake = stakeFx?.stake

  useEffect(() => {
    const lampRaiseFx = lampRaiseFxForStakeAction(stakeFxAction, stakeFxStake, fastModeEnabled)
    if (!lampRaiseFx) {
      setLampRaiseFxClass('')
      return
    }

    setLampRaiseFxClass(lampRaiseFx.className)
    const timeoutId = window.setTimeout(() => {
      setLampRaiseFxClass('')
    }, lampRaiseFx.durationMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [fastModeEnabled, stakeFxAction, stakeFxRunId, stakeFxStake])

  useEffect(() => {
    if (!stakeFx) {
      setStakeBurst(null)
      return
    }

    const updateStakeBurstPosition = () => {
      const stake = stakeCurrentRef.current
      const peg = stake?.querySelector<HTMLElement>('.peg')
      if (!stake || !peg) return

      const stakeRect = stake.getBoundingClientRect()
      const pegSize = Math.max(peg.offsetWidth, peg.offsetHeight)
      setStakeBurst({
        runId: stakeFx.runId,
        style: {
          '--ft-stake-burst-x': `${stakeRect.left + stakeRect.width / 2}px`,
          '--ft-stake-burst-y': `${stakeRect.top + pegSize / 2}px`,
          '--ft-stake-burst-size': `${pegSize}px`,
        } as CSSProperties,
      })
    }

    updateStakeBurstPosition()
    const rafId = window.requestAnimationFrame(updateStakeBurstPosition)
    window.addEventListener('resize', updateStakeBurstPosition)
    return () => {
      window.cancelAnimationFrame(rafId)
      window.removeEventListener('resize', updateStakeBurstPosition)
    }
  }, [stakeCurrentRef, stakeFx])

  const stakeBurstOverlay = stakeFx && stakeBurst?.runId === stakeFx.runId && typeof document !== 'undefined'
    ? createPortal(
        <div
          key={`stake-burst-${stakeFx.runId}`}
          className={`ft-stake-burst is-${stakeFx.action} is-by-${stakeFx.actor}`}
          style={stakeBurst.style}
          aria-hidden="true"
        />,
        document.body,
      )
    : null

  return (
    <DeckSwitchAnimationContext.Provider value={deckSwitchAnimationContextValue}>
      <div
        className={[
          'ft-root',
          introPhase === 'tilted' ? 'ft-root-intro-tilted' : '',
          introPhase === 'settling' ? 'ft-root-intro-settling' : '',
          scorepadRailVisible ? 'ft-root-score-rail-visible' : '',
          !scorepadCanUsePaper ? 'ft-root-score-rail-forced' : '',
          lampTension !== 'idle' ? `ft-root-lamp-${lampTension}` : '',
          lampRaiseFxClass,
          resolvedElevenFocusMode ? 'ft-root-eleven-focus' : '',
          elevenDecisionFocus ? 'ft-root-eleven-decision' : '',
          elevenDuelFocus ? 'ft-root-eleven-duel' : '',
          dealerSide ? `ft-root-dealer-${dealerSide}` : '',
          hasActiveTableCard ? 'ft-root-has-active-table-card' : '',
          betweenHandsGather.phase !== 'idle' ? `ft-root-between-hands-${betweenHandsGather.phase}` : '',
          betweenHandsGather.phase !== 'idle' ? `ft-root-between-hands-dealer-${betweenHandsGather.dealerSide}` : '',
          stakeCalloutText ? 'ft-root-has-stake-callout' : '',
          `ft-root-callout-${stakeCalloutStyle}`,
          deckSwitchFx ? `ft-root-deck-switch-${deckSwitchFx.phase}` : '',
        ].filter(Boolean).join(' ')}
        data-lamp-tension={lampTension}
        data-deck-switch-animation={deckSwitchAnimation}
        data-scorepad-mode={scorepadRailVisible ? 'rail' : 'paper'}
        data-eleven-focus={resolvedElevenFocusMode ?? undefined}
        data-stake-callout-style={stakeCalloutStyle}
        data-lamp-swing-lead-ms={resolvedLampSwingLeadMs}
        style={rootStyle}
      >
      <ScoreRail
        active={scorepadRailVisible}
        heroScore={heroScore}
        villainScore={villainScore}
        to={12}
        dealerSide={dealerSide}
        canUnroll={scorepadCanUsePaper && scorepadRolled}
        onUnroll={onUnrollScorepad}
        onSettingsClick={onSettingsClick}
        settingsOpen={settingsOpen}
        settingsAlert={settingsAlert}
        devControlsButton={devControlsButton}
        studyButton={studyButton}
        scoreRowRefs={scoreRowRefs}
        scoreNumberRefs={scoreNumberRefs}
        scoreCelebration={scoreCelebration}
      />

      {/* ScorePad */}
      {scorepadCanUsePaper && (
        <div
          className={[
            'ft-scorepad-slot',
            scorepadRailVisible ? 'is-rolled' : 'is-unrolled',
          ].filter(Boolean).join(' ')}
          aria-hidden={scorepadRailVisible}
        >
          <ScorePad
            hero={heroScore}
            villain={villainScore}
            dealerSide={dealerSide}
            dealerHandKey={dealerHandKey}
            elevenRingSide={scorepadElevenRingSide}
            maoDeOnze={maoDeOnzeSide}
            elevenFocusMode={resolvedElevenFocusMode}
            scoreRowRefs={scorepadDataActive ? scoreRowRefs : undefined}
            scoreNumberRefs={scorepadDataActive ? scoreNumberRefs : undefined}
            scoreCelebration={scoreCelebration}
            scoreDataActive={scorepadDataActive}
            onRollClick={onRollScorepad}
          />
        </div>
      )}

      {/* Villain hand */}
      <div className="ft-villain-hand">
        {villainHandSlot}
      </div>

      <div className="ft-table-plane">
        <div className="ft-table-surface walnut" aria-hidden="true">
          <div className="ft-lamp" />
          <div className="ft-vignette" />
        </div>
        {resolvedElevenFocusMode && (
          <div className="ft-eleven-edge-bars" aria-hidden="true">
            {showVillainElevenEdge && <span className="ft-eleven-edge-bar ft-eleven-edge-bar-villain" />}
            {showHeroElevenEdge && <span className="ft-eleven-edge-bar ft-eleven-edge-bar-hero" />}
          </div>
        )}
        <div className="ft-deck-switch-scrim" aria-hidden="true" />

        <div className="ft-intro-plane">
          {/* Deck + vira */}
          <div className="ft-deck-slot" ref={turnupRef}>
            {turnupCard && !turnupFaceDown && (
              <DeckWithVira
                deckSystem={deckSystem}
                vira={{ rank: toFarolRank(turnupCard.rank), suit: toFarolSuit(turnupCard.suit) }}
                onDeckSwitch={handleDeckSwitch}
                onDeckClick={onDeckClick}
                deckSwitchDurationMs={deckSwitchDurationMs}
                deckSwitching={deckSwitchFx?.animation === 'dissolve'}
              />
            )}
          </div>

          {/* Played area — 3 round columns */}
          <div className="ft-played">
            {([0, 1, 2] as const).map((index) => {
              const round = displayedCompletedRounds[index]
              const isActive = index === activeRoundIndex
              const isGatheringCards = betweenHandsGather.phase === 'gathering'

              const villainTraceCard = round
                ? traceCardFromPlay(completedRoundForSeat(round, botPlayer))
                : null
              const heroTraceCard = round
                ? traceCardFromPlay(completedRoundForSeat(round, humanPlayer))
                : null
              const shouldGatherVillainSlot = isGatheringCards && (
                isActive
                  ? Boolean(displayedVillainTableCard && !shouldHideVillainTableCardForOverlay)
                  : Boolean(villainTraceCard)
              )
              const shouldGatherHeroSlot = isGatheringCards && (
                isActive
                  ? Boolean(displayedHeroTableCard && !shouldHideHeroTableCardForOverlay)
                  : Boolean(heroTraceCard)
              )

              const markerClass = round
                ? (round.winner === humanPlayer
                    ? 'ft-played-marker ft-played-marker-won'
                    : round.winner === botPlayer
                      ? 'ft-played-marker ft-played-marker-lost'
                      : 'ft-played-marker ft-played-marker-pending')
                : 'ft-played-marker'

              return (
                <div
                  key={index}
                  className={['ft-played-round', isActive ? 'ft-played-round-active' : ''].filter(Boolean).join(' ')}
                  ref={(el) => { roundRefs.current[index] = el }}
                >
                  <div
                    className={[
                      'round-reference',
                      'ft-played-pair',
                    ].join(' ')}
                  >
                    {/* Villain slot */}
                    <div
                      className={[
                        'ft-played-slot',
                        isActive ? 'current-opponent-card' : 'ft-opponent-trace-card',
                        playedRotationClass(index, 'villain'),
                        shouldGatherVillainSlot ? 'is-gathering' : '',
                      ].filter(Boolean).join(' ')}
                      ref={isActive ? currentOpponentCardRef : undefined}
                    >
                      {isActive && displayedVillainTableCard && !shouldHideVillainTableCardForOverlay ? (
                        <Card
                          card={displayedVillainTableCard}
                          faceDown={displayedVillainTableCard.hidden ?? false}
                          cardSize="md"
                          deckSystem={deckSystem}
                          layoutId={getCardLayoutId(displayedVillainTableCard.id)}
                          motionDurationS={layoutMoveDurationS}
                          manilhaRank={manilhaRank}
                        />
                      ) : isActive ? (
                        <div className="ft-played-empty" aria-label={tTable('opponentCardSlot')} />
                      ) : villainTraceCard ? (
                        <Card
                          card={villainTraceCard}
                          faceDown={villainTraceCard.hidden}
                          cardSize="md"
                          deckSystem={deckSystem}
                          glow={round?.winner === botPlayer}
                          dim={round?.winner === humanPlayer}
                          layoutId={getCardLayoutId(villainTraceCard.id)}
                          motionDurationS={layoutMoveDurationS}
                          manilhaRank={manilhaRank}
                        />
                      ) : (
                        <div className="ft-played-empty" />
                      )}
                    </div>

                    {/* Hero slot */}
                    <div
                      className={[
                        'ft-played-slot',
                        isActive ? 'current-player-card' : 'ft-hero-trace-card',
                        playedRotationClass(index, 'hero'),
                        shouldGatherHeroSlot ? 'is-gathering' : '',
                        isActive && !shouldShowHeroTableCard ? 'is-empty-slot' : '',
                        isActive && !shouldShowHeroTableCard && isHeroDragActive ? 'is-target-slot' : '',
                        isActive && !shouldShowHeroTableCard && isHeroDragOverDropTarget ? 'is-drop-target' : '',
                      ].filter(Boolean).join(' ')}
                      ref={isActive ? currentPlayerCardRef : undefined}
                      data-testid={isActive ? 'hero-table-slot' : undefined}
                      data-motion-state={heroPlayMotionActive && isActive ? 'animating' : 'idle'}
                    >
                      {isActive ? (
                        displayedHeroTableCard && !shouldHideHeroTableCardForOverlay ? (
                          <Card
                            card={displayedHeroTableCard}
                            faceDown={displayedHeroTableCard.hidden ?? false}
                            isHeroCard={true}
                            cardSize="md"
                            deckSystem={deckSystem}
                            layoutId={getCardLayoutId(displayedHeroTableCard.id)}
                            motionDurationS={layoutMoveDurationS}
                            manilhaRank={manilhaRank}
                            onLayoutAnimationStart={onHeroTableCardLayoutStart}
                            onLayoutAnimationComplete={onHeroTableCardLayoutComplete}
                          />
                        ) : (
                          <div className="ft-played-empty hero-slot-placeholder" aria-label={tTable('yourPlaySlot')} />
                        )
                      ) : heroTraceCard ? (
                        <Card
                          card={heroTraceCard}
                          faceDown={heroTraceCard.hidden}
                          isHeroCard={true}
                          cardSize="md"
                          deckSystem={deckSystem}
                          glow={round?.winner === humanPlayer}
                          dim={round?.winner === botPlayer}
                          layoutId={getCardLayoutId(heroTraceCard.id)}
                          motionDurationS={layoutMoveDurationS}
                          manilhaRank={manilhaRank}
                        />
                      ) : (
                        <div className="ft-played-empty" />
                      )}
                    </div>
                  </div>

                  <div className={markerClass}>{ROUND_NUMERALS[index]}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Stake peg */}
      {stakeNode}

      {/* Hero hand */}
      <div className="ft-hero-hand">
        {heroHandSlot}
      </div>

      {/* Decision rail */}
      <div className="ft-rail-slot">
        {decisionRailSlot}
      </div>

      {whisperText && (
        <div className="ft-whisper">
          <span className="ft-whisper-dot" />
          {whisperText}
        </div>
      )}
      </div>
      {stakeBurstOverlay}
    </DeckSwitchAnimationContext.Provider>
  )
}
