'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, type PanInfo, useDragControls } from 'framer-motion'

import { DEFAULT_DECK_SYSTEM, type DeckSystem } from '../../lib/deck-system.ts'
import { suitGlyph, type CardDisplay } from '../../lib/live-card-utils.ts'
import { DeckCard } from '../farol/DeckCard'
import type { CardSize } from '../farol/SpanishCard'
import { toFarolSuit, toFarolRank, MANILHA_SUIT_STRENGTH } from '../farol/farol-card-utils'

export type { CardDisplay }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LAYOUT_MOVE_DURATION_S = 0.15
const DOG_EAR_ROLL_MS = 245
const CARD_LAYOUT_TRANSITION = {
  duration: LAYOUT_MOVE_DURATION_S,
  ease: [0.2, 0.8, 0.2, 1] as const,
}

type DogEarPhase = 'idle' | 'hiding' | 'hidden' | 'revealing'

function dogEarRollMs() {
  if (typeof window === 'undefined') return DOG_EAR_ROLL_MS
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : DOG_EAR_ROLL_MS
}

// ---------------------------------------------------------------------------
// Card component
// ---------------------------------------------------------------------------

export function Card({
  card,
  faceDown,
  isHeroCard,
  handAffordance,
  enableHoverLift,
  variant,
  cardSize,
  deckSystem = DEFAULT_DECK_SYSTEM,
  glow,
  dim,
  className: extraClassName,
  layoutId,
  onClick,
  onHide,
  onHideStart,
  onUnhide,
  onUnhideStart,
  animateHide = true,
  draggable,
  onDragStart,
  onDrag,
  onDragEnd,
  onDragReleaseFallback,
  onPrimaryPointerDown,
  motionDurationS = LAYOUT_MOVE_DURATION_S,
  manilhaRank,
  onLayoutAnimationStart,
  onLayoutAnimationComplete,
}: {
  card: CardDisplay | null
  faceDown: boolean
  isHeroCard?: boolean
  handAffordance?: 'playable' | 'inactive'
  enableHoverLift?: boolean
  variant?: 'reference'
  cardSize?: CardSize
  deckSystem?: DeckSystem
  glow?: boolean
  dim?: boolean
  className?: string
  layoutId?: string
  onClick?: () => void
  onHide?: () => void
  onHideStart?: () => void
  onUnhide?: () => void
  onUnhideStart?: () => void
  animateHide?: boolean
  draggable?: boolean
  onDragStart?: () => void
  onDrag?: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void
  onDragEnd?: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void
  onDragReleaseFallback?: (point: { x: number; y: number }) => void
  onPrimaryPointerDown?: () => void
  motionDurationS?: number
  manilhaRank?: string | null
  onLayoutAnimationStart?: () => void
  onLayoutAnimationComplete?: () => void
}) {
  const isRef = variant === 'reference'
  const isHidden = faceDown || (card?.hidden ?? false)
  const showTraceHiddenHeroReveal = isRef && isHeroCard && Boolean(card?.hidden)
  // manilhaRank is the actual manilha rank (next after the vira), pre-computed by callers
  const isManilha = !isRef && !isHidden && card != null && manilhaRank != null && card.rank === manilhaRank
  const manilhaSuitStrength: 0 | 1 | 2 | 3 | null = isManilha ? (MANILHA_SUIT_STRENGTH[card!.suit] ?? null) : null
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const pressSourceRef = useRef<'pointer' | 'mouse' | null>(null)
  const clearWindowReleaseListenersRef = useRef<(() => void) | null>(null)
  const dogEarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didDragRef = useRef(false)
  const secondaryHideHandledUntilRef = useRef(0)
  const dragControls = useDragControls()
  const baseClass = isRef ? 'card-ref' : 'card'
  const isRed = card ? (card.suit === 'HEARTS' || card.suit === 'DIAMONDS' || card.suit === '♥' || card.suit === '♦') : false
  const farolSuit = card ? toFarolSuit(card.suit) : 'oros'
  const farolRank = card ? toFarolRank(card.rank) : 1
  const dogEarEnabled = Boolean(card && isHeroCard && onHide && !isRef)
  const [dogEarPhase, setDogEarPhase] = useState<DogEarPhase>(isHidden ? 'hidden' : 'idle')
  const dogEarPhaseClass =
    dogEarPhase === 'hiding' ? ' dge-hiding'
    : dogEarPhase === 'hidden' ? ' dge-hidden'
    : dogEarPhase === 'revealing' ? ' dge-revealing'
    : ''
  const isDogEarAnimating = dogEarPhase === 'hiding' || dogEarPhase === 'revealing'
  const hoverLiftEnabled = enableHoverLift && !isDogEarAnimating

  const classes = [
    baseClass,
    isHidden ? 'is-face-down' : 'is-face-up',
    isHeroCard && card?.hidden ? 'hero-hidden' : '',
    handAffordance === 'playable' ? 'is-playable' : '',
    handAffordance === 'inactive' ? 'is-inactive' : '',
    draggable ? 'is-draggable' : '',
    onHide ? 'is-foldable' : '',
    cardSize === 'sm' ? 'card-size-sm' : '',
    cardSize === 'md' ? 'card-size-md' : '',
    glow ? 'winner-glow' : '',
    dim ? 'loser-dim' : '',
    extraClassName ?? '',
  ].filter(Boolean).join(' ').trim()

  const stopPointerEvent = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.nativeEvent.stopImmediatePropagation()
  }

  const stopMouseEvent = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.nativeEvent.stopImmediatePropagation()
  }

  const isDogEarTarget = (target: EventTarget | null) => (
    target instanceof Element &&
    Boolean(target.closest('.dge-fold-button, .dge-unfold-button'))
  )

  const resetPrimaryPress = useCallback(() => {
    pointerStartRef.current = null
    pressSourceRef.current = null
    clearWindowReleaseListenersRef.current?.()
    clearWindowReleaseListenersRef.current = null
  }, [])

  const handleDogEarPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    stopPointerEvent(e)
    resetPrimaryPress()
  }

  const handleDogEarMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    stopMouseEvent(e)
    resetPrimaryPress()
  }

  const clearDogEarTimer = useCallback(() => {
    if (dogEarTimerRef.current == null) return
    clearTimeout(dogEarTimerRef.current)
    dogEarTimerRef.current = null
  }, [])

  const beginHide = useCallback(() => {
    if (!dogEarEnabled || !onHide || isHidden || dogEarPhase !== 'idle') return

    clearDogEarTimer()
    if (!animateHide) {
      onHide()
      return
    }

    onHideStart?.()
    setDogEarPhase('hiding')
    dogEarTimerRef.current = setTimeout(() => {
      dogEarTimerRef.current = null
      setDogEarPhase('hidden')
      onHide()
    }, dogEarRollMs())
  }, [animateHide, clearDogEarTimer, dogEarEnabled, dogEarPhase, isHidden, onHide, onHideStart])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    beginSecondaryHide(e.timeStamp)
  }

  const handleAuxClick = (e: React.MouseEvent) => {
    if (e.button !== 2) return

    e.preventDefault()
    beginSecondaryHide(e.timeStamp)
  }

  const beginSecondaryHide = (timeStamp: number) => {
    if (timeStamp < secondaryHideHandledUntilRef.current) return

    secondaryHideHandledUntilRef.current = timeStamp + 250
    beginHide()
  }

  useEffect(() => {
    clearDogEarTimer()
    setDogEarPhase(dogEarEnabled && isHidden ? 'hidden' : 'idle')

    return () => {
      clearDogEarTimer()
    }
  }, [card?.id, clearDogEarTimer, dogEarEnabled, isHidden])

  const handleDogEarHide = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    beginHide()
  }

  const handleDogEarUnhide = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!dogEarEnabled || !onUnhide || dogEarPhase !== 'hidden') return

    clearDogEarTimer()
    setDogEarPhase('revealing')
    onUnhideStart?.()
    dogEarTimerRef.current = setTimeout(() => {
      dogEarTimerRef.current = null
      onUnhide()
      setDogEarPhase('idle')
    }, dogEarRollMs())
  }

  const clearWindowReleaseListeners = () => {
    clearWindowReleaseListenersRef.current?.()
    clearWindowReleaseListenersRef.current = null
  }

  const beginPrimaryPress = (source: 'pointer' | 'mouse', clientX: number, clientY: number) => {
    if (source === 'mouse' && pressSourceRef.current === 'pointer') {
      return
    }

    clearWindowReleaseListeners()
    pressSourceRef.current = source
    pointerStartRef.current = { x: clientX, y: clientY }
    didDragRef.current = false
    if (draggable) {
      onPrimaryPointerDown?.()
    }

    const handleWindowPointerUp = (event: PointerEvent) => {
      handlePrimaryRelease('pointer', event.clientX, event.clientY)
    }

    const handleWindowMouseUp = (event: MouseEvent) => {
      handlePrimaryRelease('mouse', event.clientX, event.clientY)
    }

    window.addEventListener('pointerup', handleWindowPointerUp)
    window.addEventListener('mouseup', handleWindowMouseUp)
    clearWindowReleaseListenersRef.current = () => {
      window.removeEventListener('pointerup', handleWindowPointerUp)
      window.removeEventListener('mouseup', handleWindowMouseUp)
    }
  }

  const handlePrimaryRelease = (source: 'pointer' | 'mouse', clientX: number, clientY: number) => {
    if (pressSourceRef.current && pressSourceRef.current !== source) {
      return
    }

    const start = pointerStartRef.current
    pointerStartRef.current = null
    pressSourceRef.current = null
    clearWindowReleaseListeners()

    if (!start || didDragRef.current) return

    const moved = Math.hypot(clientX - start.x, clientY - start.y)
    const tapTolerancePx = draggable ? 6 : 12
    if (moved <= tapTolerancePx) {
      onClick?.()
      return
    }

    if (draggable) {
      onDragReleaseFallback?.({ x: clientX, y: clientY })
    }
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) {
      e.preventDefault()
      beginSecondaryHide(e.timeStamp)
      return
    }
    if (e.button !== 0) return
    if (isDogEarTarget(e.target)) return
    beginPrimaryPress('pointer', e.clientX, e.clientY)
    if (draggable) {
      dragControls.start(e, { snapToCursor: true })
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDogEarTarget(e.target)) return
    handlePrimaryRelease('pointer', e.clientX, e.clientY)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) {
      e.preventDefault()
      beginSecondaryHide(e.timeStamp)
      return
    }
    if (e.button !== 0) return
    if (isDogEarTarget(e.target)) return
    beginPrimaryPress('mouse', e.clientX, e.clientY)
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isDogEarTarget(e.target)) return
    handlePrimaryRelease('mouse', e.clientX, e.clientY)
  }

  return (
    <div
      className={`card-shell${dogEarEnabled ? ` dge-host${dogEarPhaseClass}` : ''}`}
      data-can-hide={dogEarEnabled ? 'true' : undefined}
    >
      <motion.div
        layoutId={layoutId}
        transition={{
          duration: motionDurationS,
          ease: CARD_LAYOUT_TRANSITION.ease,
        }}
        whileHover={hoverLiftEnabled ? { y: -7, scale: 1.02 } : undefined}
        whileDrag={draggable ? { scale: 1.04, rotate: -2, zIndex: 40 } : undefined}
        className={classes}
        onLayoutAnimationStart={onLayoutAnimationStart}
        onLayoutAnimationComplete={onLayoutAnimationComplete}
        onContextMenu={handleContextMenu}
        onAuxClick={handleAuxClick}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onPointerCancel={() => {
          pointerStartRef.current = null
          pressSourceRef.current = null
          clearWindowReleaseListeners()
        }}
        drag={draggable}
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        dragElastic={0.12}
        dragSnapToOrigin={true}
        onDragStart={
          draggable
            ? () => {
                didDragRef.current = true
                onDragStart?.()
              }
            : undefined
        }
        onDrag={draggable ? (event, info) => onDrag?.(event, info) : undefined}
        onDragEnd={draggable ? (event, info) => onDragEnd?.(event, info) : undefined}
        data-card-id={card?.id}
        style={{ touchAction: draggable || onClick ? 'none' : undefined }}
      >
        {card && (
          <div className="card-inner">
            {isRef ? (
              <>
                <div className="card-face" style={{ color: isRed ? 'red' : 'black' }}>
                  <div className="card-rank">{card.rank}</div>
                  <div className="card-suit">{suitGlyph(card.suit)}</div>
                </div>
                <div className="card-back">
                  {showTraceHiddenHeroReveal && (
                    <div className="card-back-peek" aria-hidden="true">
                      <div className="card-back-peek-rank">{card.rank}</div>
                      <div className="card-back-peek-suit">{suitGlyph(card.suit)}</div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="card-flip">
                <div className="card-flip__face card-flip__face--front" aria-hidden={isHidden}>
                  <DeckCard
                    system={deckSystem}
                    rank={farolRank}
                    suit={farolSuit}
                    size={cardSize ?? 'lg'}
                    lost={dim}
                    isManilha={isManilha}
                    manilhaSuitStrength={manilhaSuitStrength ?? undefined}
                  />
                </div>
                <div className="card-flip__face card-flip__face--back" aria-hidden={!isHidden}>
                  <DeckCard
                    system={deckSystem}
                    rank={farolRank}
                    suit={farolSuit}
                    size={cardSize ?? 'lg'}
                    faceDown={true}
                  />
                </div>
              </div>
            )}
          </div>
        )}
        {card && dogEarEnabled && (
          <button
            type="button"
            className="dge-fold-button"
            aria-label="Hide card (play face-down)"
            disabled={isHidden || dogEarPhase !== 'idle'}
            onPointerDown={handleDogEarPointerDown}
            onPointerUp={stopPointerEvent}
            onMouseDown={handleDogEarMouseDown}
            onMouseUp={stopMouseEvent}
            onClick={handleDogEarHide}
          />
        )}
        {card && dogEarEnabled && (
          <span className="dge-fold" aria-hidden="true">
            <span className="dge-fold-pattern" aria-hidden="true" />
          </span>
        )}
        {card && dogEarEnabled && onUnhide && (
          <button
            type="button"
            className="dge-unfold-button"
            aria-label="Show card again"
            disabled={dogEarPhase !== 'hidden'}
            tabIndex={dogEarPhase === 'hidden' ? 0 : -1}
            onPointerDown={handleDogEarPointerDown}
            onPointerUp={stopPointerEvent}
            onMouseDown={handleDogEarMouseDown}
            onMouseUp={stopMouseEvent}
            onClick={handleDogEarUnhide}
          />
        )}
        {card && dogEarEnabled && onUnhide && (
          <span className="dge-unfold" aria-hidden="true">
            <span className="dge-unfold-pattern" aria-hidden="true" />
          </span>
        )}
      </motion.div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DealerMarker component
// ---------------------------------------------------------------------------

export function DealerMarker({ label, testId }: { label: string; testId: string }) {
  return (
    <div
      className="dealer-marker"
      role="img"
      aria-label={label}
      title={label}
      data-testid={testId}
    >
      <svg
        className="dealer-marker__glyph"
        viewBox="0 0 24 32"
        aria-hidden="true"
        focusable="false"
      >
        <circle className="dealer-marker__toe dealer-marker__toe--1" cx="7.05" cy="7.45" r="2.12" />
        <circle className="dealer-marker__toe dealer-marker__toe--2" cx="10.85" cy="5.4" r="1.86" />
        <circle className="dealer-marker__toe dealer-marker__toe--3" cx="14.75" cy="5.55" r="1.58" />
        <circle className="dealer-marker__toe dealer-marker__toe--4" cx="17.85" cy="8.15" r="1.28" />
        <path
          className="dealer-marker__sole"
          d="M11.2 9.25c2.55-.55 5.38.84 6.76 3.18 1.2 2.04 1.03 4.48.31 6.6-.54 1.67-.71 3.38-.28 5.05.55 1.95-.18 4.18-1.84 5.56-1.96 1.61-4.93 1.88-7.2.6-2.24-1.29-3.32-4.15-2.58-6.67.45-1.57.55-3.28 0-4.9-.75-2.24-.57-4.76.73-6.73 1.18-1.78 3.08-2.88 5.1-2.69Z"
        />
      </svg>
    </div>
  )
}
