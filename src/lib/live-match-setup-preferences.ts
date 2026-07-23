import type { BotKind, BotProfile } from './session-api.ts'
import {
  isBotKind,
  isBotProfile,
  isDealerChoice,
  type DealerChoice,
} from './live-bot-selection.ts'

export const LIVE_MATCH_SETUP_PREFERENCES_STORAGE_KEY = 'truco-live-match-setup-v1'

export type LiveMatchSetupPreferences = {
  selectedBotKind: BotKind
  selectedBotProfile: BotProfile
  selectedBotModel: string
  newMatchDealerChoice: DealerChoice
}

export function buildDefaultLiveMatchSetupPreferences(): LiveMatchSetupPreferences {
  return {
    selectedBotKind: 'heuristic',
    selectedBotProfile: 'balanced',
    selectedBotModel: '',
    newMatchDealerChoice: 'random',
  }
}

export function sanitizeLiveMatchSetupPreferences(value: unknown): LiveMatchSetupPreferences {
  const defaults = buildDefaultLiveMatchSetupPreferences()
  if (!value || typeof value !== 'object') return defaults

  const candidate = value as Partial<LiveMatchSetupPreferences>
  return {
    selectedBotKind: isBotKind(candidate.selectedBotKind)
      ? candidate.selectedBotKind
      : defaults.selectedBotKind,
    selectedBotProfile: isBotProfile(candidate.selectedBotProfile)
      ? candidate.selectedBotProfile
      : defaults.selectedBotProfile,
    selectedBotModel: typeof candidate.selectedBotModel === 'string'
      ? candidate.selectedBotModel
      : defaults.selectedBotModel,
    newMatchDealerChoice: isDealerChoice(candidate.newMatchDealerChoice)
      ? candidate.newMatchDealerChoice
      : defaults.newMatchDealerChoice,
  }
}

export function readLiveMatchSetupPreferences(): LiveMatchSetupPreferences {
  if (typeof window === 'undefined') {
    return buildDefaultLiveMatchSetupPreferences()
  }

  try {
    const stored = window.localStorage.getItem(LIVE_MATCH_SETUP_PREFERENCES_STORAGE_KEY)
    return stored
      ? sanitizeLiveMatchSetupPreferences(JSON.parse(stored))
      : buildDefaultLiveMatchSetupPreferences()
  } catch {
    return buildDefaultLiveMatchSetupPreferences()
  }
}

export function persistLiveMatchSetupPreferences(preferences: LiveMatchSetupPreferences) {
  try {
    window.localStorage.setItem(
      LIVE_MATCH_SETUP_PREFERENCES_STORAGE_KEY,
      JSON.stringify(sanitizeLiveMatchSetupPreferences(preferences)),
    )
  } catch {
    return
  }
}
