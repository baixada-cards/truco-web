export const GAMEPLAY_HINTS_STORAGE_KEY = 'truco.live.gameplayHints'

export type GameplayHintsState = {
  hintsEnabled: boolean
  raiseSeen: boolean
  elevenHandSeen: boolean
}

export function buildDefaultGameplayHints(): GameplayHintsState {
  return { hintsEnabled: true, raiseSeen: false, elevenHandSeen: false }
}

export function sanitizeGameplayHints(value: unknown): GameplayHintsState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return buildDefaultGameplayHints()
  }
  const candidate = value as Partial<GameplayHintsState>
  return {
    hintsEnabled: candidate.hintsEnabled !== false,
    raiseSeen: candidate.raiseSeen === true,
    elevenHandSeen: candidate.elevenHandSeen === true,
  }
}

export function readGameplayHints(): GameplayHintsState {
  if (typeof window === 'undefined') return buildDefaultGameplayHints()
  try {
    const raw = window.localStorage.getItem(GAMEPLAY_HINTS_STORAGE_KEY)
    return raw ? sanitizeGameplayHints(JSON.parse(raw)) : buildDefaultGameplayHints()
  } catch {
    return buildDefaultGameplayHints()
  }
}

export function persistGameplayHints(state: GameplayHintsState): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    GAMEPLAY_HINTS_STORAGE_KEY,
    JSON.stringify(sanitizeGameplayHints(state)),
  )
}

export function shouldShowRaiseHint(state: GameplayHintsState): boolean {
  return state.hintsEnabled && !state.raiseSeen
}

export function shouldShowElevenHandHint(state: GameplayHintsState): boolean {
  return state.hintsEnabled && !state.elevenHandSeen
}

export function dismissRaiseHint(state: GameplayHintsState): GameplayHintsState {
  if (state.raiseSeen) return state
  return { ...state, raiseSeen: true }
}

export function dismissElevenHandHint(state: GameplayHintsState): GameplayHintsState {
  if (state.elevenHandSeen) return state
  return { ...state, elevenHandSeen: true }
}

export function setHintsEnabled(
  state: GameplayHintsState,
  enabled: boolean,
): GameplayHintsState {
  if (enabled) {
    return { hintsEnabled: true, raiseSeen: false, elevenHandSeen: false }
  }
  return { ...state, hintsEnabled: false }
}
