'use client'

import { useCallback } from 'react'

import type { SessionBotOverride } from './session-api'
import type { LiveDevActions, LiveDevActionsInput } from './use-live-dev-actions'

export function useLiveDevActions(_input: LiveDevActionsInput): LiveDevActions {
  void _input
  const applyDevScore = useCallback(async () => {}, [])
  const applyDevBotOverride = useCallback(async (_action: SessionBotOverride | null) => {
    void _action
  }, [])
  const refreshDevVillainCards = useCallback(async () => {}, [])

  return {
    applyDevScore,
    applyDevBotOverride,
    refreshDevVillainCards,
  }
}
