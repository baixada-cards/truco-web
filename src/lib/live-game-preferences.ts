import {
  buildDefaultLiveShortcutMap,
  sanitizeLiveShortcutMap,
  type LiveShortcutMap,
} from './live-keyboard-shortcuts.ts'
import {
  DEFAULT_DECK_SYSTEM,
  MAX_DECK_PICKER_DISMISSALS,
  isDeckSystem,
  type DeckSystem,
} from './deck-system.ts'

export type LiveGamePreferences = {
  deckPickerCompleted: boolean
  deckPickerDismissCount: number
  deckSystem: DeckSystem
  fastMode: boolean
  hideCardPlaysImmediately: boolean
  shortcutsEnabled: boolean
  shortcuts: LiveShortcutMap
}

export const LIVE_GAME_PREFERENCES_STORAGE_KEY = 'truco-live-game-preferences-v1'

const LEGACY_UI_SETTINGS_STORAGE_KEY = 'truco-ui-settings-v1'

export function buildDefaultLiveGamePreferences(): LiveGamePreferences {
  return {
    deckPickerCompleted: false,
    deckPickerDismissCount: 0,
    deckSystem: DEFAULT_DECK_SYSTEM,
    fastMode: false,
    hideCardPlaysImmediately: true,
    shortcutsEnabled: true,
    shortcuts: buildDefaultLiveShortcutMap(),
  }
}

function sanitizeDeckPickerDismissCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(MAX_DECK_PICKER_DISMISSALS, Math.max(0, Math.floor(value)))
    : 0
}

export function sanitizeLiveGamePreferences(value: unknown): LiveGamePreferences {
  const defaults = buildDefaultLiveGamePreferences()

  if (!value || typeof value !== 'object') {
    return defaults
  }

  const candidate = value as Partial<LiveGamePreferences>

  return {
    deckPickerCompleted: candidate.deckPickerCompleted === true,
    deckPickerDismissCount: sanitizeDeckPickerDismissCount(candidate.deckPickerDismissCount),
    deckSystem: isDeckSystem(candidate.deckSystem) ? candidate.deckSystem : defaults.deckSystem,
    fastMode: candidate.fastMode === true,
    hideCardPlaysImmediately: candidate.hideCardPlaysImmediately !== false,
    shortcutsEnabled: candidate.shortcutsEnabled !== false,
    shortcuts: sanitizeLiveShortcutMap(
      candidate.shortcuts && typeof candidate.shortcuts === 'object'
        ? candidate.shortcuts
        : candidate,
    ),
  }
}

export function readLiveGamePreferences(): LiveGamePreferences {
  if (typeof window === 'undefined') {
    return buildDefaultLiveGamePreferences()
  }

  try {
    const stored = window.localStorage.getItem(LIVE_GAME_PREFERENCES_STORAGE_KEY)
    if (stored) {
      return sanitizeLiveGamePreferences(JSON.parse(stored))
    }

    const legacyStored = window.localStorage.getItem(LEGACY_UI_SETTINGS_STORAGE_KEY)
    return legacyStored
      ? sanitizeLiveGamePreferences(JSON.parse(legacyStored))
      : buildDefaultLiveGamePreferences()
  } catch {
    return buildDefaultLiveGamePreferences()
  }
}

export function persistLiveGamePreferences(preferences: LiveGamePreferences) {
  try {
    window.localStorage.setItem(
      LIVE_GAME_PREFERENCES_STORAGE_KEY,
      JSON.stringify(sanitizeLiveGamePreferences(preferences)),
    )
  } catch {
    return
  }
}

export function resetDeckPickerPrompt(preferences: LiveGamePreferences): LiveGamePreferences {
  return sanitizeLiveGamePreferences({
    ...preferences,
    deckPickerCompleted: false,
    deckPickerDismissCount: 0,
    deckSystem: preferences.deckSystem ?? DEFAULT_DECK_SYSTEM,
  })
}
