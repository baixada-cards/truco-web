'use client'

import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

import type { StoredLastHandReview } from './live-hand-review.ts'
import type {
  HandEndPayoff,
  SessionFailureState,
} from './live-engine-events.ts'
import type { SessionPayload } from './session-api.ts'
import { useLiveEngineState } from './use-live-engine-state.ts'

export type { SessionFailureState } from './live-engine-events.ts'

// ---------------------------------------------------------------------------
// Exported return type
// ---------------------------------------------------------------------------

export type LiveGameSessionState = {
  // Session data
  session: SessionPayload | null
  setSession: Dispatch<SetStateAction<SessionPayload | null>>
  bootMatchId: string | null
  setBootMatchId: Dispatch<SetStateAction<string | null>>
  lastHandReview: StoredLastHandReview | null
  setLastHandReview: Dispatch<SetStateAction<StoredLastHandReview | null>>
  isPending: boolean
  setIsPending: Dispatch<SetStateAction<boolean>>
  isAutoStartingHand: boolean
  setIsAutoStartingHand: Dispatch<SetStateAction<boolean>>
  sessionFailure: SessionFailureState | null
  setSessionFailure: Dispatch<SetStateAction<SessionFailureState | null>>

  // Refs
  didBootRef: MutableRefObject<boolean>
  actionLockRef: MutableRefObject<boolean>
  previousSessionRef: MutableRefObject<SessionPayload | null>
  lastHandEndPayoffRef: MutableRefObject<HandEndPayoff | null>
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Compatibility selector for the session slice of the LiveGame engine reducer.
 *
 * @param initialBootMatchId - The `?match=` query param value at mount time.
 */
export function useLiveGameSession(initialBootMatchId: string | null): LiveGameSessionState {
  const engine = useLiveEngineState(initialBootMatchId)

  return {
    session: engine.session,
    setSession: engine.setSession,
    bootMatchId: engine.bootMatchId,
    setBootMatchId: engine.setBootMatchId,
    lastHandReview: engine.lastHandReview,
    setLastHandReview: engine.setLastHandReview,
    isPending: engine.isPending,
    setIsPending: engine.setIsPending,
    isAutoStartingHand: engine.isAutoStartingHand,
    setIsAutoStartingHand: engine.setIsAutoStartingHand,
    sessionFailure: engine.sessionFailure,
    setSessionFailure: engine.setSessionFailure,

    didBootRef: engine.didBootRef,
    actionLockRef: engine.actionLockRef,
    previousSessionRef: engine.previousSessionRef,
    lastHandEndPayoffRef: engine.lastHandEndPayoffRef,
  }
}
