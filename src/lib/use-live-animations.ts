'use client'

import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from 'react'

import type { ScorePulseState, ScoreSide } from './live-score-celebration.ts'
import type {
  DisplayScore,
  HandEndFx,
  HandEndPayoff,
} from './live-engine-events.ts'
import {
  useLiveEngineState,
  type HandEndPayoffSequenceOptions,
  type LiveAnimationsTiming,
} from './use-live-engine-state.ts'

export type {
  DisplayScore,
  HandEndFx,
  HandEndPayoff,
} from './live-engine-events.ts'
export type { LiveAnimationsTiming } from './use-live-engine-state.ts'

// ---------------------------------------------------------------------------
// Exported return type
// ---------------------------------------------------------------------------

export type LiveAnimationsState = {
  // Score / hand-end animation state
  displayScore: DisplayScore
  setDisplayScore: Dispatch<SetStateAction<DisplayScore>>
  scorePulseState: ScorePulseState | null
  setScorePulseState: Dispatch<SetStateAction<ScorePulseState | null>>
  handEndFx: HandEndFx | null
  setHandEndFx: Dispatch<SetStateAction<HandEndFx | null>>
  activeHandEndPayoff: HandEndPayoff | null
  setActiveHandEndPayoff: Dispatch<SetStateAction<HandEndPayoff | null>>
  isHandEndSequenceRunning: boolean
  setIsHandEndSequenceRunning: Dispatch<SetStateAction<boolean>>

  // Run-ID ref (lets callers cancel in-flight sequences)
  handEndFxRunIdRef: MutableRefObject<number>

  // DOM element refs — assign these to JSX elements
  stakeCurrentRef: MutableRefObject<HTMLElement | null>
  scoreRowRefs: MutableRefObject<{ hero: HTMLDivElement | null; villain: HTMLDivElement | null }>
  scoreNumberRefs: MutableRefObject<{ hero: HTMLSpanElement | null; villain: HTMLSpanElement | null }>
  roundRefs: MutableRefObject<(HTMLDivElement | null)[]>

  // Callbacks
  clearScorePulseTimeout: () => void
  pulseScore: (player: ScoreSide, points: number) => void
  resetHandEndPayoffState: (nextScore?: DisplayScore) => void
  runHandEndPayoffSequence: (
    payoff: HandEndPayoff,
    runId: number,
    options?: HandEndPayoffSequenceOptions,
  ) => Promise<void>
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Compatibility selector for the animation slice of the LiveGame engine reducer.
 *
 * @param timing - Fast-mode-aware timing values computed by the caller.
 */
export function useLiveAnimations(timing: LiveAnimationsTiming): LiveAnimationsState {
  const engine = useLiveEngineState(null, timing)

  return {
    displayScore: engine.displayScore,
    setDisplayScore: engine.setDisplayScore,
    scorePulseState: engine.scorePulseState,
    setScorePulseState: engine.setScorePulseState,
    handEndFx: engine.handEndFx,
    setHandEndFx: engine.setHandEndFx,
    activeHandEndPayoff: engine.activeHandEndPayoff,
    setActiveHandEndPayoff: engine.setActiveHandEndPayoff,
    isHandEndSequenceRunning: engine.isHandEndSequenceRunning,
    setIsHandEndSequenceRunning: engine.setIsHandEndSequenceRunning,

    handEndFxRunIdRef: engine.handEndFxRunIdRef,
    stakeCurrentRef: engine.stakeCurrentRef,
    scoreRowRefs: engine.scoreRowRefs,
    scoreNumberRefs: engine.scoreNumberRefs,
    roundRefs: engine.roundRefs,

    clearScorePulseTimeout: engine.clearScorePulseTimeout,
    pulseScore: engine.pulseScore,
    resetHandEndPayoffState: engine.resetHandEndPayoffState,
    runHandEndPayoffSequence: engine.runHandEndPayoffSequence,
  }
}
