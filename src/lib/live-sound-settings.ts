import {
  DEFAULT_SOUND_THEME_ID,
  isSoundThemeId,
  type SoundThemeId,
} from './table-sound-fx.ts'

export type LiveSoundSettings = {
  soundEnabled: boolean
  soundVolume: number
  soundLastAudibleVolume: number
  soundTheme: SoundThemeId
}

export const LIVE_SOUND_SETTINGS_STORAGE_KEY = 'truco-live-sound-settings-v1'
const DEFAULT_SOUND_VOLUME = 0.78

function clampSoundVolume(volume: number) {
  return Math.min(1, Math.max(0, volume))
}

function sanitizeLastAudibleVolume(value: unknown, fallback: number) {
  if (typeof value !== 'number') {
    return fallback
  }

  const clamped = clampSoundVolume(value)
  return clamped > 0 ? clamped : fallback
}

export function buildDefaultLiveSoundSettings(): LiveSoundSettings {
  return {
    soundEnabled: true,
    soundVolume: DEFAULT_SOUND_VOLUME,
    soundLastAudibleVolume: DEFAULT_SOUND_VOLUME,
    soundTheme: DEFAULT_SOUND_THEME_ID,
  }
}

export function sanitizeLiveSoundSettings(value: unknown): LiveSoundSettings {
  const defaults = buildDefaultLiveSoundSettings()

  if (!value || typeof value !== 'object') {
    return defaults
  }

  const candidate = value as Partial<LiveSoundSettings>
  const rawSoundVolume =
    typeof candidate.soundVolume === 'number'
      ? clampSoundVolume(candidate.soundVolume)
      : defaults.soundVolume
  const soundLastAudibleVolume = sanitizeLastAudibleVolume(
    candidate.soundLastAudibleVolume,
    rawSoundVolume > 0 ? rawSoundVolume : defaults.soundLastAudibleVolume,
  )
  const soundEnabled = candidate.soundEnabled !== false && rawSoundVolume > 0

  return {
    soundEnabled,
    soundVolume: soundEnabled ? rawSoundVolume : 0,
    soundLastAudibleVolume,
    soundTheme: isSoundThemeId(candidate.soundTheme)
      ? candidate.soundTheme
      : defaults.soundTheme,
  }
}

export function readLiveSoundSettings(): LiveSoundSettings {
  if (typeof window === 'undefined') {
    return buildDefaultLiveSoundSettings()
  }

  try {
    const stored = window.localStorage.getItem(LIVE_SOUND_SETTINGS_STORAGE_KEY)
    return stored ? sanitizeLiveSoundSettings(JSON.parse(stored)) : buildDefaultLiveSoundSettings()
  } catch {
    return buildDefaultLiveSoundSettings()
  }
}

export function persistLiveSoundSettings(settings: LiveSoundSettings) {
  try {
    window.localStorage.setItem(
      LIVE_SOUND_SETTINGS_STORAGE_KEY,
      JSON.stringify(sanitizeLiveSoundSettings(settings)),
    )
  } catch {
    return
  }
}
