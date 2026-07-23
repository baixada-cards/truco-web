'use client'

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'

import type { StoredLastHandReview } from './live-hand-review.ts'
import type { ScorePulseState, ScoreSide } from './live-score-celebration.ts'
import {
  createInitialLiveEngineState,
  liveEngineReducer,
  type DisplayScore,
  type GatherDealerSide,
  type HandEndFx,
  type HandEndPayoff,
  type LiveEngineEvent,
  type LiveEngineSetStateAction,
  type LiveEngineState,
  type SessionFailureState,
} from './live-engine-events.ts'
import type { SessionPayload } from './session-api.ts'

const TRACE_CARD_SIZE_PX = 60
const TRACE_ROW_GAP_PX = 10
const TRACE_FX_PADDING_PX = 4

export type LiveAnimationsTiming = {
  scorePulseMs: number
  handEndGlowMs: number
  handEndTransferMs: number
  handEndLandMs: number
  handEndScoreSettleMs: number
}

export type HandEndPayoffSequenceOptions = {
  onScoreLand?: (payoff: HandEndPayoff) => void
  scoreSettleMs?: (payoff: HandEndPayoff) => number
}

const defaultLiveAnimationsTiming: LiveAnimationsTiming = {
  scorePulseMs: 520,
  handEndGlowMs: 220,
  handEndTransferMs: 640,
  handEndLandMs: 180,
  handEndScoreSettleMs: 80,
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

function asSetStateAction<T>(value: SetStateAction<T>): LiveEngineSetStateAction<T> {
  return value
}

export type LiveEngineStateHook = LiveEngineState & {
  dispatchEngineEvent: Dispatch<LiveEngineEvent>

  setSession: Dispatch<SetStateAction<SessionPayload | null>>
  setBootMatchId: Dispatch<SetStateAction<string | null>>
  setLastHandReview: Dispatch<SetStateAction<StoredLastHandReview | null>>
  setIsPending: Dispatch<SetStateAction<boolean>>
  setIsAutoStartingHand: Dispatch<SetStateAction<boolean>>
  setSessionFailure: Dispatch<SetStateAction<SessionFailureState | null>>

  handEndFxRunIdRef: MutableRefObject<number>
  didBootRef: MutableRefObject<boolean>
  actionLockRef: MutableRefObject<boolean>
  previousSessionRef: MutableRefObject<SessionPayload | null>
  lastHandEndPayoffRef: MutableRefObject<HandEndPayoff | null>

  stakeCurrentRef: MutableRefObject<HTMLElement | null>
  scoreRowRefs: MutableRefObject<{ hero: HTMLDivElement | null; villain: HTMLDivElement | null }>
  scoreNumberRefs: MutableRefObject<{ hero: HTMLSpanElement | null; villain: HTMLSpanElement | null }>
  roundRefs: MutableRefObject<(HTMLDivElement | null)[]>

  setDisplayScore: Dispatch<SetStateAction<DisplayScore>>
  setScorePulseState: Dispatch<SetStateAction<ScorePulseState | null>>
  setHandEndFx: Dispatch<SetStateAction<HandEndFx | null>>
  setActiveHandEndPayoff: Dispatch<SetStateAction<HandEndPayoff | null>>
  setIsHandEndSequenceRunning: Dispatch<SetStateAction<boolean>>

  clearScorePulseTimeout: () => void
  pulseScore: (player: ScoreSide, points: number) => void
  resetHandEndPayoffState: (nextScore?: DisplayScore) => void
  startBetweenHandsGather: (dealerSide: GatherDealerSide, durationMs: number) => void
  clearBetweenHandsDeck: () => void
  runHandEndPayoffSequence: (
    payoff: HandEndPayoff,
    runId: number,
    options?: HandEndPayoffSequenceOptions,
  ) => Promise<void>
}

export function useLiveEngineState(
  initialBootMatchId: string | null,
  timing: LiveAnimationsTiming = defaultLiveAnimationsTiming,
): LiveEngineStateHook {
  const [state, dispatchEngineEvent] = useReducer(
    liveEngineReducer,
    initialBootMatchId,
    createInitialLiveEngineState,
  )

  const handEndFxRunIdRef = useRef(0)
  const scorePulseTimeoutRef = useRef<number | null>(null)
  const betweenHandsGatherTimeoutRef = useRef<number | null>(null)
  const didBootRef = useRef(false)
  const actionLockRef = useRef(false)
  const previousSessionRef = useRef<SessionPayload | null>(null)
  const lastHandEndPayoffRef = useRef<HandEndPayoff | null>(null)

  const stakeCurrentRef = useRef<HTMLElement | null>(null)
  const scoreRowRefs = useRef<{ hero: HTMLDivElement | null; villain: HTMLDivElement | null }>({
    hero: null,
    villain: null,
  })
  const scoreNumberRefs = useRef<{ hero: HTMLSpanElement | null; villain: HTMLSpanElement | null }>({
    hero: null,
    villain: null,
  })
  const roundRefs = useRef<(HTMLDivElement | null)[]>([])

  const timingRef = useRef(timing)
  timingRef.current = timing

  const setSession = useCallback<Dispatch<SetStateAction<SessionPayload | null>>>((value) => {
    dispatchEngineEvent({ type: 'session-updated', value: asSetStateAction(value) })
  }, [])

  const setBootMatchId = useCallback<Dispatch<SetStateAction<string | null>>>((value) => {
    dispatchEngineEvent({ type: 'boot-match-id-updated', value: asSetStateAction(value) })
  }, [])

  const setLastHandReview = useCallback<Dispatch<SetStateAction<StoredLastHandReview | null>>>((value) => {
    dispatchEngineEvent({ type: 'last-hand-review-updated', value: asSetStateAction(value) })
  }, [])

  const setIsPending = useCallback<Dispatch<SetStateAction<boolean>>>((value) => {
    dispatchEngineEvent({ type: 'pending-updated', value: asSetStateAction(value) })
  }, [])

  const setIsAutoStartingHand = useCallback<Dispatch<SetStateAction<boolean>>>((value) => {
    dispatchEngineEvent({ type: 'auto-starting-hand-updated', value: asSetStateAction(value) })
  }, [])

  const setSessionFailure = useCallback<Dispatch<SetStateAction<SessionFailureState | null>>>((value) => {
    dispatchEngineEvent({ type: 'session-failure-updated', value: asSetStateAction(value) })
  }, [])

  const setDisplayScore = useCallback<Dispatch<SetStateAction<DisplayScore>>>((value) => {
    dispatchEngineEvent({ type: 'display-score-updated', value: asSetStateAction(value) })
  }, [])

  const setScorePulseState = useCallback<Dispatch<SetStateAction<ScorePulseState | null>>>((value) => {
    dispatchEngineEvent({ type: 'score-pulse-updated', value: asSetStateAction(value) })
  }, [])

  const setHandEndFx = useCallback<Dispatch<SetStateAction<HandEndFx | null>>>((value) => {
    dispatchEngineEvent({ type: 'hand-end-fx-updated', value: asSetStateAction(value) })
  }, [])

  const setActiveHandEndPayoff = useCallback<Dispatch<SetStateAction<HandEndPayoff | null>>>((value) => {
    dispatchEngineEvent({ type: 'active-hand-end-payoff-updated', value: asSetStateAction(value) })
  }, [])

  const setIsHandEndSequenceRunning = useCallback<Dispatch<SetStateAction<boolean>>>((value) => {
    dispatchEngineEvent({ type: 'hand-end-sequence-running-updated', value: asSetStateAction(value) })
  }, [])

  const clearScorePulseTimeout = useCallback(() => {
    if (scorePulseTimeoutRef.current != null) {
      window.clearTimeout(scorePulseTimeoutRef.current)
      scorePulseTimeoutRef.current = null
    }
  }, [])

  const clearBetweenHandsGatherTimeout = useCallback(() => {
    if (betweenHandsGatherTimeoutRef.current != null) {
      window.clearTimeout(betweenHandsGatherTimeoutRef.current)
      betweenHandsGatherTimeoutRef.current = null
    }
  }, [])

  const clearBetweenHandsDeck = useCallback(() => {
    clearBetweenHandsGatherTimeout()
    dispatchEngineEvent({ type: 'between-hands-gather-cleared' })
  }, [clearBetweenHandsGatherTimeout])

  const pulseScore = useCallback((player: ScoreSide, points: number) => {
    clearScorePulseTimeout()
    dispatchEngineEvent({ type: 'score-pulse-started', pulse: { player, points } })
    scorePulseTimeoutRef.current = window.setTimeout(() => {
      dispatchEngineEvent({ type: 'score-pulse-cleared', player })
      scorePulseTimeoutRef.current = null
    }, timingRef.current.scorePulseMs)
  }, [clearScorePulseTimeout])

  const resetHandEndPayoffState = useCallback((nextScore?: DisplayScore) => {
    handEndFxRunIdRef.current += 1
    clearScorePulseTimeout()
    dispatchEngineEvent({ type: 'hand-end-reset', nextScore })
  }, [clearScorePulseTimeout])

  const startBetweenHandsGather = useCallback((dealerSide: GatherDealerSide, durationMs: number) => {
    clearBetweenHandsGatherTimeout()

    if (durationMs <= 0) {
      dispatchEngineEvent({ type: 'between-hands-gather-cleared' })
      return
    }

    dispatchEngineEvent({ type: 'between-hands-gather-started', dealerSide })
    betweenHandsGatherTimeoutRef.current = window.setTimeout(() => {
      betweenHandsGatherTimeoutRef.current = null
      dispatchEngineEvent({ type: 'between-hands-gather-completed' })
    }, durationMs)
  }, [clearBetweenHandsGatherTimeout])

  useEffect(() => () => {
    clearBetweenHandsGatherTimeout()
  }, [clearBetweenHandsGatherTimeout])

  const computeHandEndFx = useCallback((payoff: HandEndPayoff): HandEndFx | null => {
    const stakeRect = stakeCurrentRef.current?.getBoundingClientRect()
    const scoreRect = scoreRowRefs.current[payoff.winner]?.getBoundingClientRect()

    if (!stakeRect || !scoreRect) return null

    const scoreNumberRect = scoreNumberRefs.current[payoff.winner]?.getBoundingClientRect()
    const labelSource = {
      x: stakeRect.left + stakeRect.width / 2,
      y: stakeRect.top + stakeRect.height / 2,
    }
    const labelTarget = scoreNumberRect
      ? {
          x: scoreNumberRect.left + scoreNumberRect.width / 2,
          y: scoreNumberRect.top + scoreNumberRect.height / 2,
        }
      : {
          x: scoreRect.left + scoreRect.width / 2,
          y: scoreRect.top + scoreRect.height / 2,
        }
    const labelLift = {
      x: labelSource.x,
      y: labelTarget.y,
    }

    const roundRects = roundRefs.current
      .slice(0, payoff.completedRoundCount)
      .map((element) => element?.getBoundingClientRect())
      .filter((rect): rect is DOMRect => Boolean(rect))

    if (roundRects.length === 0) {
      return {
        winner: payoff.winner,
        points: payoff.points,
        phase: 'charge',
        showAura: false,
        sourceRect: {
          left: stakeRect.left,
          top: stakeRect.top,
          width: stakeRect.width,
          height: stakeRect.height,
        },
        labelSource,
        labelLift,
        labelTarget,
      }
    }

    const left = Math.min(...roundRects.map((rect) => rect.left))
    const right = Math.max(...roundRects.map((rect) => rect.right))
    const topBase = Math.min(...roundRects.map((rect) => rect.top))
    const rowTop = topBase + (payoff.winner === 'villain' ? 0 : TRACE_CARD_SIZE_PX + TRACE_ROW_GAP_PX)

    return {
      winner: payoff.winner,
      points: payoff.points,
      phase: 'charge',
      showAura: true,
      sourceRect: {
        left: left - TRACE_FX_PADDING_PX,
        top: rowTop - TRACE_FX_PADDING_PX,
        width: right - left + TRACE_FX_PADDING_PX * 2,
        height: TRACE_CARD_SIZE_PX + TRACE_FX_PADDING_PX * 2,
      },
      labelSource,
      labelLift,
      labelTarget,
    }
  }, [])

  const runHandEndPayoffSequence = useCallback(async (
    payoff: HandEndPayoff,
    runId: number,
    options: HandEndPayoffSequenceOptions = {},
  ) => {
    const t = timingRef.current
    dispatchEngineEvent({ type: 'payoff-sequence-started', payoff })

    await nextFrame()
    await nextFrame()
    if (handEndFxRunIdRef.current !== runId) return

    const fx = computeHandEndFx(payoff)
    if (!fx) {
      options.onScoreLand?.(payoff)
      dispatchEngineEvent({ type: 'payoff-score-landed', payoff, finishImmediately: true })
      pulseScore(payoff.winner, payoff.points)
      return
    }

    dispatchEngineEvent({ type: 'hand-end-fx-updated', value: fx })
    await sleep(t.handEndGlowMs)
    if (handEndFxRunIdRef.current !== runId) return

    dispatchEngineEvent({ type: 'hand-end-fx-updated', value: { ...fx, phase: 'travel' } })
    await sleep(t.handEndTransferMs)
    if (handEndFxRunIdRef.current !== runId) return

    dispatchEngineEvent({ type: 'hand-end-fx-updated', value: { ...fx, phase: 'land' } })
    await sleep(t.handEndLandMs)
    if (handEndFxRunIdRef.current !== runId) return

    options.onScoreLand?.(payoff)
    dispatchEngineEvent({ type: 'payoff-score-landed', payoff })
    pulseScore(payoff.winner, payoff.points)

    await sleep(Math.max(t.handEndScoreSettleMs, options.scoreSettleMs?.(payoff) ?? 0))
    if (handEndFxRunIdRef.current !== runId) return

    dispatchEngineEvent({ type: 'payoff-sequence-settled' })
  }, [computeHandEndFx, pulseScore])

  return {
    ...state,
    dispatchEngineEvent,

    setSession,
    setBootMatchId,
    setLastHandReview,
    setIsPending,
    setIsAutoStartingHand,
    setSessionFailure,

    handEndFxRunIdRef,
    didBootRef,
    actionLockRef,
    previousSessionRef,
    lastHandEndPayoffRef,

    stakeCurrentRef,
    scoreRowRefs,
    scoreNumberRefs,
    roundRefs,

    setDisplayScore,
    setScorePulseState,
    setHandEndFx,
    setActiveHandEndPayoff,
    setIsHandEndSequenceRunning,

    clearScorePulseTimeout,
    pulseScore,
    resetHandEndPayoffState,
    startBetweenHandsGather,
    clearBetweenHandsDeck,
    runHandEndPayoffSequence,
  }
}
