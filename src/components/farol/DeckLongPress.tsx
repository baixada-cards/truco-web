'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'

import { nextDeckSystem, type DeckSystem } from '../../lib/deck-system'
import { StrengthGuidePressRing } from '../live/StrengthGuide'

import './DeckLongPress.css'

const DECK_SWITCH_HOLD_MS = 520

type DeckSwitchPhase = 'rest' | 'pressing' | 'switching'

export function DeckLongPress({
  currentSystem,
  onSwitch,
  onClick,
  switchDurationMs = 450,
  isSwitching = false,
  children,
}: {
  currentSystem: DeckSystem
  onSwitch: (system: DeckSystem) => void
  onClick?: () => void
  switchDurationMs?: number
  isSwitching?: boolean
  children: ReactNode
}) {
  const tDeck = useTranslations('Live.deck')
  const tSwitch = useTranslations('Live.deckSwitch')
  const [phase, setPhase] = useState<DeckSwitchPhase>('rest')
  const [pressProgress, setPressProgress] = useState(0)
  const [toast, setToast] = useState<{ next: DeckSystem; previous: DeckSystem } | null>(null)
  const holdTimerRef = useRef<number | null>(null)
  const frameRef = useRef<number | null>(null)
  const switchTimerRef = useRef<number | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const pressStartedAtRef = useRef(0)
  const systemAtPressRef = useRef<DeckSystem>(currentSystem)
  const suppressNextClickRef = useRef(false)

  const clearHoldTimer = () => {
    if (holdTimerRef.current === null) return
    window.clearTimeout(holdTimerRef.current)
    holdTimerRef.current = null
  }

  const clearFrame = () => {
    if (frameRef.current === null) return
    window.cancelAnimationFrame(frameRef.current)
    frameRef.current = null
  }

  const clearSwitchTimer = () => {
    if (switchTimerRef.current === null) return
    window.clearTimeout(switchTimerRef.current)
    switchTimerRef.current = null
  }

  const clearToastTimer = () => {
    if (toastTimerRef.current === null) return
    window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = null
  }

  const clearPress = () => {
    clearHoldTimer()
    clearFrame()
    setPressProgress(0)
    setPhase((current) => current === 'pressing' ? 'rest' : current)
  }

  const switchDeck = (previous = currentSystem) => {
    if (phase !== 'rest' || switchTimerRef.current !== null) return

    const next = nextDeckSystem(previous)
    setPhase('switching')
    onSwitch(next)
    setToast({ next, previous })
    clearToastTimer()
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null)
      toastTimerRef.current = null
    }, 6000)

    clearSwitchTimer()
    switchTimerRef.current = window.setTimeout(() => {
      setPhase('rest')
      switchTimerRef.current = null
    }, switchDurationMs)
  }

  const startPress = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || phase !== 'rest' || switchTimerRef.current !== null) return

    event.currentTarget.setPointerCapture(event.pointerId)
    clearPress()
    systemAtPressRef.current = currentSystem
    suppressNextClickRef.current = false
    pressStartedAtRef.current = window.performance.now()
    setPhase('pressing')
    setPressProgress(0)

    const tick = () => {
      const elapsed = window.performance.now() - pressStartedAtRef.current
      setPressProgress(Math.min(1, elapsed / DECK_SWITCH_HOLD_MS))
      frameRef.current = window.requestAnimationFrame(tick)
    }

    frameRef.current = window.requestAnimationFrame(tick)
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null
      clearFrame()
      setPressProgress(1)
      suppressNextClickRef.current = true
      switchDeck(systemAtPressRef.current)
    }, DECK_SWITCH_HOLD_MS)
  }

  const cancelPress = () => {
    clearPress()
  }

  const handleClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      event.preventDefault()
      event.stopPropagation()
      return
    }

    if (!onClick) return
    event.preventDefault()
    event.stopPropagation()
    onClick()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    onClick()
  }

  const undo = () => {
    if (!toast) return
    onSwitch(toast.previous)
    setToast(null)
    clearToastTimer()
  }

  useEffect(() => () => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current)
    }
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
    }
    if (switchTimerRef.current !== null) {
      window.clearTimeout(switchTimerRef.current)
    }
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current)
    }
  }, [])

  return (
    <div
      className={[
        'dlp-root',
        phase === 'pressing' ? 'is-pressing' : '',
        phase === 'switching' ? 'is-switching' : '',
        isSwitching ? 'is-visual-switching' : '',
      ].filter(Boolean).join(' ')}
      role="button"
      tabIndex={0}
      aria-label={tSwitch('aria')}
      data-testid="deck-longpress"
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onPointerLeave={cancelPress}
      onClickCapture={handleClickCapture}
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => { event.preventDefault() }}
    >
      <div className="dlp-stack">
        {children}
      </div>
      {phase === 'pressing' && <StrengthGuidePressRing progress={pressProgress} />}

      {toast && typeof document !== 'undefined' && createPortal((
        <div
          className="dlp-toast"
          role="status"
          data-next-system={toast.next}
          data-previous-system={toast.previous}
          data-testid="deck-switch-toast"
        >
          <span className="dlp-toast-dot" aria-hidden="true" />
          <span>{tSwitch('switchedTo', { deck: tDeck(`${toast.next}.name`) })}</span>
          <button
            type="button"
            className="dlp-toast-undo"
            onPointerDown={(event) => {
              event.stopPropagation()
              undo()
            }}
            onClick={undo}
          >
            {tSwitch('undo')}
          </button>
        </div>
      ), document.body)}
    </div>
  )
}
