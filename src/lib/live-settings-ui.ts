export const LIVE_SETTINGS_SECTION_OPEN_STORAGE_KEY = 'truco-live-settings-sections-v1'

export const LIVE_SETTINGS_SECTION_IDS = [
  'match',
  'language',
  'deck',
  'experience',
  'shortcuts',
] as const

export type LiveSettingsSectionId = typeof LIVE_SETTINGS_SECTION_IDS[number]
export type LiveSettingsSectionOpenState = Record<LiveSettingsSectionId, boolean>

export function buildDefaultLiveSettingsSectionOpenState(): LiveSettingsSectionOpenState {
  return {
    match: true,
    language: true,
    deck: true,
    experience: true,
    shortcuts: false,
  }
}

export function sanitizeLiveSettingsSectionOpenState(value: unknown): LiveSettingsSectionOpenState {
  const defaults = buildDefaultLiveSettingsSectionOpenState()
  if (!value || typeof value !== 'object') return defaults

  const candidate = value as Partial<Record<LiveSettingsSectionId, unknown>>
  return Object.fromEntries(
    LIVE_SETTINGS_SECTION_IDS.map((section) => [
      section,
      typeof candidate[section] === 'boolean' ? candidate[section] : defaults[section],
    ]),
  ) as LiveSettingsSectionOpenState
}

export function readLiveSettingsSectionOpenState(): LiveSettingsSectionOpenState {
  if (typeof window === 'undefined') {
    return buildDefaultLiveSettingsSectionOpenState()
  }

  try {
    const stored = window.localStorage.getItem(LIVE_SETTINGS_SECTION_OPEN_STORAGE_KEY)
    return stored
      ? sanitizeLiveSettingsSectionOpenState(JSON.parse(stored))
      : buildDefaultLiveSettingsSectionOpenState()
  } catch {
    return buildDefaultLiveSettingsSectionOpenState()
  }
}

export function persistLiveSettingsSectionOpenState(state: LiveSettingsSectionOpenState) {
  try {
    window.localStorage.setItem(
      LIVE_SETTINGS_SECTION_OPEN_STORAGE_KEY,
      JSON.stringify(sanitizeLiveSettingsSectionOpenState(state)),
    )
  } catch {
    return
  }
}
