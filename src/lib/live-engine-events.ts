import type { SetStateAction } from 'react'

import type { StoredLastHandReview } from './live-hand-review.ts'
import type { LiveSessionFailure } from './live-session-failures.ts'
import type { ScorePulseState, ScoreSide } from './live-score-celebration.ts'
import type { SessionAction, SessionPayload } from './session-api.ts'
import type { SessionSnapshotSource } from './live-stake-fx.ts'

export type DisplayScore = {
  hero: number
  villain: number
}

export type FixedMotionPoint = {
  x: number
  y: number
}

export type FixedMotionRect = {
  left: number
  top: number
  width: number
  height: number
}

export type HandEndPayoff = {
  winner: ScoreSide
  points: number
  scoreSoundPoints?: number
  completedRoundCount: number
  previousScore: DisplayScore
  nextScore: DisplayScore
}

export type HandEndFx = {
  winner: ScoreSide
  points: number
  phase: 'charge' | 'travel' | 'land'
  showAura: boolean
  sourceRect: FixedMotionRect
  labelSource: FixedMotionPoint
  labelLift: FixedMotionPoint
  labelTarget: FixedMotionPoint
}

export type GatherPhase = 'idle' | 'gathering' | 'deck-visible'
export type GatherDealerSide = 'hero' | 'villain'

export type GatherState = {
  phase: GatherPhase
  dealerSide: GatherDealerSide
}

export type SessionFailureState = LiveSessionFailure & {
  retryAction: 'start-match' | 'load-match' | 'refresh-match' | 'continue-match' | null
  retryMatchId: string | null
}

export type PendingAction =
  | { kind: 'start-match' }
  | { kind: 'load-match'; matchId: string }
  | { kind: 'refresh-match'; matchId: string }
  | { kind: 'continue-match'; matchId: string }
  | { kind: 'player-action'; matchId: string; action: SessionAction }
  | { kind: 'reconnect-match'; matchId: string }

export type ActionResult = {
  snapshot: SessionPayload
  source: SessionSnapshotSource
  pendingAction: PendingAction | null
}

export type LiveEngineState = {
  session: SessionPayload | null
  bootMatchId: string | null
  lastHandReview: StoredLastHandReview | null
  isPending: boolean
  isAutoStartingHand: boolean
  pendingAction: PendingAction | null
  lastAppliedAction: ActionResult | null
  sessionFailure: SessionFailureState | null
  displayScore: DisplayScore
  scorePulseState: ScorePulseState | null
  handEndFx: HandEndFx | null
  activeHandEndPayoff: HandEndPayoff | null
  isHandEndSequenceRunning: boolean
  betweenHandsGather: GatherState
}

export type LiveEngineSetStateAction<T> = SetStateAction<T>

export type LiveEngineEvent =
  | {
      type: 'session-loaded'
      snapshot: SessionPayload
      source: Exclude<SessionSnapshotSource, 'action'>
      displayScore: DisplayScore
      payoff?: HandEndPayoff | null
      lastHandReview?: StoredLastHandReview | null
    }
  | {
      type: 'session-failed'
      failure: SessionFailureState
    }
  | {
      type: 'action-applied'
      result: ActionResult
      displayScore: DisplayScore
      payoff?: HandEndPayoff | null
      lastHandReview?: StoredLastHandReview | null
    }
  | {
      type: 'action-pending'
      action: PendingAction
    }
  | {
      type: 'action-settled'
      actionKind?: PendingAction['kind']
    }
  | {
      type: 'reconnect-started'
      matchId: string
    }
  | {
      type: 'reset'
      bootMatchId?: string | null
      displayScore?: DisplayScore
    }
  | {
      type: 'session-updated'
      value: LiveEngineSetStateAction<SessionPayload | null>
    }
  | {
      type: 'boot-match-id-updated'
      value: LiveEngineSetStateAction<string | null>
    }
  | {
      type: 'last-hand-review-updated'
      value: LiveEngineSetStateAction<StoredLastHandReview | null>
    }
  | {
      type: 'pending-updated'
      value: LiveEngineSetStateAction<boolean>
    }
  | {
      type: 'auto-starting-hand-updated'
      value: LiveEngineSetStateAction<boolean>
    }
  | {
      type: 'session-failure-updated'
      value: LiveEngineSetStateAction<SessionFailureState | null>
    }
  | {
      type: 'display-score-updated'
      value: LiveEngineSetStateAction<DisplayScore>
    }
  | {
      type: 'score-pulse-updated'
      value: LiveEngineSetStateAction<ScorePulseState | null>
    }
  | {
      type: 'score-pulse-started'
      pulse: ScorePulseState
    }
  | {
      type: 'score-pulse-cleared'
      player?: ScoreSide
    }
  | {
      type: 'hand-end-fx-updated'
      value: LiveEngineSetStateAction<HandEndFx | null>
    }
  | {
      type: 'active-hand-end-payoff-updated'
      value: LiveEngineSetStateAction<HandEndPayoff | null>
    }
  | {
      type: 'hand-end-sequence-running-updated'
      value: LiveEngineSetStateAction<boolean>
    }
  | {
      type: 'hand-end-reset'
      nextScore?: DisplayScore
    }
  | {
      type: 'payoff-sequence-started'
      payoff: HandEndPayoff
    }
  | {
      type: 'payoff-score-landed'
      payoff: HandEndPayoff
      finishImmediately?: boolean
    }
  | {
      type: 'payoff-sequence-settled'
    }
  | {
      type: 'between-hands-gather-started'
      dealerSide: GatherDealerSide
    }
  | {
      type: 'between-hands-gather-completed'
    }
  | {
      type: 'between-hands-gather-cleared'
    }

const emptyDisplayScore: DisplayScore = { hero: 0, villain: 0 }
const emptyGatherState: GatherState = { phase: 'idle', dealerSide: 'hero' }

function resolveSetState<T>(current: T, value: LiveEngineSetStateAction<T>): T {
  return typeof value === 'function'
    ? (value as (previous: T) => T)(current)
    : value
}

function clearPending(state: LiveEngineState): LiveEngineState {
  if (!state.isPending && !state.isAutoStartingHand && state.pendingAction == null) {
    return state
  }

  return {
    ...state,
    isPending: false,
    isAutoStartingHand: false,
    pendingAction: null,
  }
}

function applySnapshot(
  state: LiveEngineState,
  snapshot: SessionPayload,
  displayScore: DisplayScore,
  lastHandReview: StoredLastHandReview | null | undefined,
): LiveEngineState {
  return clearPending({
    ...state,
    session: snapshot,
    sessionFailure: null,
    displayScore,
    lastHandReview: lastHandReview === undefined ? state.lastHandReview : lastHandReview,
  })
}

export function createInitialLiveEngineState(bootMatchId: string | null): LiveEngineState {
  return {
    session: null,
    bootMatchId,
    lastHandReview: null,
    isPending: false,
    isAutoStartingHand: false,
    pendingAction: null,
    lastAppliedAction: null,
    sessionFailure: null,
    displayScore: emptyDisplayScore,
    scorePulseState: null,
    handEndFx: null,
    activeHandEndPayoff: null,
    isHandEndSequenceRunning: false,
    betweenHandsGather: emptyGatherState,
  }
}

export function liveEngineReducer(
  state: LiveEngineState,
  event: LiveEngineEvent,
): LiveEngineState {
  switch (event.type) {
    case 'session-loaded':
      return {
        ...applySnapshot(state, event.snapshot, event.displayScore, event.lastHandReview),
        betweenHandsGather: event.source === 'next-hand' ? state.betweenHandsGather : emptyGatherState,
      }
    case 'session-failed':
      return clearPending({
        ...state,
        sessionFailure: event.failure,
      })
    case 'action-applied':
      return {
        ...applySnapshot(state, event.result.snapshot, event.displayScore, event.lastHandReview),
        lastAppliedAction: event.result,
      }
    case 'action-pending':
      return {
        ...state,
        pendingAction: event.action,
        isPending: event.action.kind !== 'continue-match',
        isAutoStartingHand: event.action.kind === 'continue-match',
        sessionFailure: null,
      }
    case 'action-settled':
      if (event.actionKind && state.pendingAction?.kind !== event.actionKind) {
        return state
      }
      return clearPending(state)
    case 'reconnect-started':
      return {
        ...state,
        pendingAction: { kind: 'reconnect-match', matchId: event.matchId },
        isPending: true,
        isAutoStartingHand: false,
        sessionFailure: null,
      }
    case 'reset': {
      const nextState = createInitialLiveEngineState(
        Object.hasOwn(event, 'bootMatchId') ? event.bootMatchId ?? null : state.bootMatchId,
      )
      return {
        ...nextState,
        displayScore: event.displayScore ?? emptyDisplayScore,
      }
    }
    case 'session-updated':
      return {
        ...state,
        session: resolveSetState(state.session, event.value),
      }
    case 'boot-match-id-updated':
      return {
        ...state,
        bootMatchId: resolveSetState(state.bootMatchId, event.value),
      }
    case 'last-hand-review-updated':
      return {
        ...state,
        lastHandReview: resolveSetState(state.lastHandReview, event.value),
      }
    case 'pending-updated': {
      const isPending = resolveSetState(state.isPending, event.value)
      return {
        ...state,
        isPending,
        pendingAction: isPending ? state.pendingAction : null,
      }
    }
    case 'auto-starting-hand-updated': {
      const isAutoStartingHand = resolveSetState(state.isAutoStartingHand, event.value)
      return {
        ...state,
        isAutoStartingHand,
        pendingAction: isAutoStartingHand ? state.pendingAction : null,
      }
    }
    case 'session-failure-updated':
      return {
        ...state,
        sessionFailure: resolveSetState(state.sessionFailure, event.value),
      }
    case 'display-score-updated':
      return {
        ...state,
        displayScore: resolveSetState(state.displayScore, event.value),
      }
    case 'score-pulse-updated':
      return {
        ...state,
        scorePulseState: resolveSetState(state.scorePulseState, event.value),
      }
    case 'score-pulse-started':
      return {
        ...state,
        scorePulseState: event.pulse,
      }
    case 'score-pulse-cleared':
      if (event.player && state.scorePulseState?.player !== event.player) {
        return state
      }
      return {
        ...state,
        scorePulseState: null,
      }
    case 'hand-end-fx-updated':
      return {
        ...state,
        handEndFx: resolveSetState(state.handEndFx, event.value),
      }
    case 'active-hand-end-payoff-updated':
      return {
        ...state,
        activeHandEndPayoff: resolveSetState(state.activeHandEndPayoff, event.value),
      }
    case 'hand-end-sequence-running-updated':
      return {
        ...state,
        isHandEndSequenceRunning: resolveSetState(state.isHandEndSequenceRunning, event.value),
      }
    case 'hand-end-reset':
      return {
        ...state,
        handEndFx: null,
        activeHandEndPayoff: null,
        scorePulseState: null,
        isHandEndSequenceRunning: false,
        displayScore: event.nextScore ?? state.displayScore,
      }
    case 'payoff-sequence-started':
      return {
        ...state,
        activeHandEndPayoff: event.payoff,
        isHandEndSequenceRunning: true,
      }
    case 'payoff-score-landed':
      return {
        ...state,
        displayScore: event.payoff.nextScore,
        scorePulseState: {
          player: event.payoff.winner,
          points: event.payoff.points,
        },
        handEndFx: null,
        activeHandEndPayoff: null,
        isHandEndSequenceRunning: event.finishImmediately ? false : state.isHandEndSequenceRunning,
      }
    case 'payoff-sequence-settled':
      return {
        ...state,
        isHandEndSequenceRunning: false,
      }
    case 'between-hands-gather-started':
      return {
        ...state,
        betweenHandsGather: {
          phase: 'gathering',
          dealerSide: event.dealerSide,
        },
      }
    case 'between-hands-gather-completed':
      if (state.betweenHandsGather.phase !== 'gathering') {
        return state
      }
      return {
        ...state,
        betweenHandsGather: {
          ...state.betweenHandsGather,
          phase: 'deck-visible',
        },
      }
    case 'between-hands-gather-cleared':
      if (state.betweenHandsGather.phase === 'idle') {
        return state
      }
      return {
        ...state,
        betweenHandsGather: emptyGatherState,
      }
  }
}
