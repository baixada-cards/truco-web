'use client'

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

import type { LiveEngineEvent } from './live-engine-events'
import type { SessionFailureState } from './use-live-game-session'
import type { SessionSnapshotSource } from './live-stake-fx'
import {
  fetchSession,
  type SessionBotOverride,
  type SessionCard,
  type SessionPayload,
} from './session-api'
import {
  fetchPlayerView,
  replaceSessionState,
  setBotOverride,
} from './session-dev-api'
import {
  resolveLiveDevEditedScore,
  type LiveDevScoreEditState,
} from './live-dev-controls'

type Seat = 0 | 1

type ClientTimeout = <T>(promise: Promise<T>, ms: number, message: string) => Promise<T>

type PresentSessionFailure = (
  error: unknown,
  options: {
    retryAction: SessionFailureState['retryAction']
    retryMatchId?: string | null
    resetSession?: boolean
    clearUrl?: boolean
  },
) => unknown

export type LiveDevActionsInput = {
  session: SessionPayload | null
  actionLockRef: MutableRefObject<boolean>
  dispatchEngineEvent: Dispatch<LiveEngineEvent>
  clearResolvedRoundPreview: () => void
  devScoreHero: number
  devScoreVillain: number
  devScoreEditState: LiveDevScoreEditState
  setDevVillainCards: Dispatch<SetStateAction<SessionCard[] | null>>
  setDevVillainCardsStale: Dispatch<SetStateAction<boolean>>
  applySessionSnapshot: (nextSession: SessionPayload, source: SessionSnapshotSource) => void
  presentSessionFailure: PresentSessionFailure
  recoverTimedOutMatch: (matchId: string) => Promise<boolean>
  withClientTimeout: ClientTimeout
  isEngineTimeoutError: (error: unknown) => boolean
  matchActionTimeoutMs: number
  matchLoadTimeoutMs: number
}

export type LiveDevActions = {
  applyDevScore: () => Promise<void>
  applyDevBotOverride: (action: SessionBotOverride | null) => Promise<void>
  refreshDevVillainCards: () => Promise<void>
}

function heroVillainScoreKeys(humanPlayer: Seat) {
  return humanPlayer === 0
    ? { hero: '0' as const, villain: '1' as const }
    : { hero: '1' as const, villain: '0' as const }
}

export function useLiveDevActions({
  session,
  actionLockRef,
  dispatchEngineEvent,
  clearResolvedRoundPreview,
  devScoreHero,
  devScoreVillain,
  devScoreEditState,
  setDevVillainCards,
  setDevVillainCardsStale,
  applySessionSnapshot,
  presentSessionFailure,
  recoverTimedOutMatch,
  withClientTimeout,
  isEngineTimeoutError,
  matchActionTimeoutMs,
  matchLoadTimeoutMs,
}: LiveDevActionsInput): LiveDevActions {
  const applyDevScore = useCallback(async () => {
    if (!session || actionLockRef.current) return

    const resolvedScore = resolveLiveDevEditedScore(session, {
      hero: devScoreHero,
      villain: devScoreVillain,
    })
    if (!resolvedScore || !devScoreEditState.canApply) return

    const nextState = structuredClone(session.state)
    const nextScoreKeys = heroVillainScoreKeys(session.humanPlayer)
    nextState.score[nextScoreKeys.hero] = resolvedScore.hero
    nextState.score[nextScoreKeys.villain] = resolvedScore.villain

    if (nextState.current_hand) {
      nextState.current_hand.state.score[nextScoreKeys.hero] = resolvedScore.hero
      nextState.current_hand.state.score[nextScoreKeys.villain] = resolvedScore.villain
    }

    actionLockRef.current = true
    dispatchEngineEvent({
      type: 'action-pending',
      action: { kind: 'refresh-match', matchId: session.matchId },
    })
    clearResolvedRoundPreview()

    try {
      const nextSession = await withClientTimeout(
        replaceSessionState(session.matchId, nextState),
        matchActionTimeoutMs,
        'Replacing the live score took too long.',
      )
      applySessionSnapshot(nextSession, 'load')
    } catch (nextError) {
      if (isEngineTimeoutError(nextError) && await recoverTimedOutMatch(session.matchId)) {
        return
      }
      presentSessionFailure(nextError, {
        retryAction: 'refresh-match',
        retryMatchId: session.matchId,
      })
    } finally {
      actionLockRef.current = false
      dispatchEngineEvent({ type: 'action-settled', actionKind: 'refresh-match' })
    }
  }, [
    actionLockRef,
    applySessionSnapshot,
    clearResolvedRoundPreview,
    devScoreEditState.canApply,
    devScoreHero,
    devScoreVillain,
    dispatchEngineEvent,
    isEngineTimeoutError,
    matchActionTimeoutMs,
    presentSessionFailure,
    recoverTimedOutMatch,
    session,
    withClientTimeout,
  ])

  const applyDevBotOverride = useCallback(async (action: SessionBotOverride | null) => {
    if (!session || actionLockRef.current) return

    actionLockRef.current = true
    dispatchEngineEvent({
      type: 'action-pending',
      action: { kind: 'refresh-match', matchId: session.matchId },
    })
    clearResolvedRoundPreview()

    try {
      await withClientTimeout(
        setBotOverride(session.matchId, action),
        matchActionTimeoutMs,
        'Updating the villain override took too long.',
      )
      const nextSession = await withClientTimeout(
        fetchSession(session.matchId),
        matchLoadTimeoutMs,
        'Refreshing the live session took too long.',
      )
      applySessionSnapshot(nextSession, 'load')
    } catch (nextError) {
      if (isEngineTimeoutError(nextError) && await recoverTimedOutMatch(session.matchId)) {
        return
      }
      presentSessionFailure(nextError, {
        retryAction: 'refresh-match',
        retryMatchId: session.matchId,
      })
    } finally {
      actionLockRef.current = false
      dispatchEngineEvent({ type: 'action-settled', actionKind: 'refresh-match' })
    }
  }, [
    actionLockRef,
    applySessionSnapshot,
    clearResolvedRoundPreview,
    dispatchEngineEvent,
    isEngineTimeoutError,
    matchActionTimeoutMs,
    matchLoadTimeoutMs,
    presentSessionFailure,
    recoverTimedOutMatch,
    session,
    withClientTimeout,
  ])

  const refreshDevVillainCards = useCallback(async () => {
    if (!session || actionLockRef.current) return

    actionLockRef.current = true
    dispatchEngineEvent({
      type: 'action-pending',
      action: { kind: 'refresh-match', matchId: session.matchId },
    })

    try {
      const view = await withClientTimeout(
        fetchPlayerView(session.matchId, session.botPlayer),
        matchLoadTimeoutMs,
        'Revealing the villain cards took too long.',
      )
      setDevVillainCards(view.hand?.hand ?? null)
      setDevVillainCardsStale(false)
    } catch (nextError) {
      presentSessionFailure(nextError, {
        retryAction: 'refresh-match',
        retryMatchId: session.matchId,
      })
    } finally {
      actionLockRef.current = false
      dispatchEngineEvent({ type: 'action-settled', actionKind: 'refresh-match' })
    }
  }, [
    actionLockRef,
    dispatchEngineEvent,
    matchLoadTimeoutMs,
    presentSessionFailure,
    session,
    setDevVillainCards,
    setDevVillainCardsStale,
    withClientTimeout,
  ])

  return {
    applyDevScore,
    applyDevBotOverride,
    refreshDevVillainCards,
  }
}
