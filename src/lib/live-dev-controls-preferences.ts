import {
  DEFAULT_SOUND_THEME_ID,
  isSoundCue,
  isSoundThemeId,
  type SoundCue,
  type SoundThemeId,
} from './table-sound-fx.ts'
import { isDealerChoice, type DealerChoice } from './live-bot-selection.ts'
import type { ScoreSide } from './live-score-celebration.ts'

export type DevStakeResponseAction = 'accept_raise' | 'fold'

export const LIVE_DEV_PANEL_OPEN_STORAGE_KEY = 'farol-dev-panel-open'
export const LIVE_DEV_CONTROLS_SECTION_OPEN_STORAGE_KEY = 'farol-dev-section-open-state-v1'
export const LIVE_DEV_CONTROLS_SELECTED_VALUES_STORAGE_KEY = 'farol-dev-selected-values-v1'

export const LIVE_DEV_CONTROLS_SECTION_IDS = [
  'animations',
  'soundLab',
  'debug',
  'gameState',
  'hints',
] as const

export type LiveDevControlsSectionId = typeof LIVE_DEV_CONTROLS_SECTION_IDS[number]
export type LiveDevControlsSectionOpenState = Record<LiveDevControlsSectionId, boolean>

export type LiveDevControlsSelectedValues = {
  auditionThemeId: SoundThemeId
  auditionCue: SoundCue
  dealerChoice: DealerChoice
  stakeResponseAction: DevStakeResponseAction
  animStakeFrom: number
  animScorePoints: number
  animScoreWinner: ScoreSide
  stakeFxActor: ScoreSide
}

const DEV_STAKE_FROM_LEVELS = [1, 3, 6, 9] as const
const DEV_SCORE_POINT_LEVELS = [1, 3, 6, 9, 12] as const

export function buildDefaultLiveDevControlsSectionOpenState(): LiveDevControlsSectionOpenState {
  return {
    animations: false,
    soundLab: true,
    debug: false,
    gameState: false,
    hints: true,
  }
}

export function buildDefaultLiveDevControlsSelectedValues(): LiveDevControlsSelectedValues {
  return {
    auditionThemeId: DEFAULT_SOUND_THEME_ID,
    auditionCue: 'raise',
    dealerChoice: 'random',
    stakeResponseAction: 'accept_raise',
    animStakeFrom: 1,
    animScorePoints: 3,
    animScoreWinner: 'hero',
    stakeFxActor: 'villain',
  }
}

export function sanitizeLiveDevPanelOpen(value: unknown) {
  return value === true
}

export function sanitizeLiveDevControlsSectionOpenState(
  value: unknown,
): LiveDevControlsSectionOpenState {
  const defaults = buildDefaultLiveDevControlsSectionOpenState()
  if (!value || typeof value !== 'object') return defaults

  const candidate = value as Partial<Record<LiveDevControlsSectionId, unknown>>
  return Object.fromEntries(
    LIVE_DEV_CONTROLS_SECTION_IDS.map((section) => [
      section,
      typeof candidate[section] === 'boolean' ? candidate[section] : defaults[section],
    ]),
  ) as LiveDevControlsSectionOpenState
}

function isDevStakeResponseAction(value: unknown): value is DevStakeResponseAction {
  return value === 'accept_raise' || value === 'fold'
}

function isScoreSide(value: unknown): value is ScoreSide {
  return value === 'hero' || value === 'villain'
}

function sanitizeLevel(value: unknown, allowed: readonly number[], fallback: number) {
  return typeof value === 'number' && allowed.includes(value)
    ? value
    : fallback
}

export function sanitizeLiveDevControlsSelectedValues(value: unknown): LiveDevControlsSelectedValues {
  const defaults = buildDefaultLiveDevControlsSelectedValues()
  if (!value || typeof value !== 'object') return defaults

  const candidate = value as Partial<LiveDevControlsSelectedValues>
  return {
    auditionThemeId: isSoundThemeId(candidate.auditionThemeId)
      ? candidate.auditionThemeId
      : defaults.auditionThemeId,
    auditionCue: isSoundCue(candidate.auditionCue)
      ? candidate.auditionCue
      : defaults.auditionCue,
    dealerChoice: isDealerChoice(candidate.dealerChoice)
      ? candidate.dealerChoice
      : defaults.dealerChoice,
    stakeResponseAction: isDevStakeResponseAction(candidate.stakeResponseAction)
      ? candidate.stakeResponseAction
      : defaults.stakeResponseAction,
    animStakeFrom: sanitizeLevel(
      candidate.animStakeFrom,
      DEV_STAKE_FROM_LEVELS,
      defaults.animStakeFrom,
    ),
    animScorePoints: sanitizeLevel(
      candidate.animScorePoints,
      DEV_SCORE_POINT_LEVELS,
      defaults.animScorePoints,
    ),
    animScoreWinner: isScoreSide(candidate.animScoreWinner)
      ? candidate.animScoreWinner
      : defaults.animScoreWinner,
    stakeFxActor: isScoreSide(candidate.stakeFxActor)
      ? candidate.stakeFxActor
      : defaults.stakeFxActor,
  }
}

export function readLiveDevPanelOpen() {
  if (typeof window === 'undefined') return false

  try {
    return sanitizeLiveDevPanelOpen(
      JSON.parse(window.localStorage.getItem(LIVE_DEV_PANEL_OPEN_STORAGE_KEY) ?? 'false'),
    )
  } catch {
    return false
  }
}

export function persistLiveDevPanelOpen(open: boolean) {
  try {
    window.localStorage.setItem(LIVE_DEV_PANEL_OPEN_STORAGE_KEY, JSON.stringify(open))
  } catch {
    return
  }
}

export function readLiveDevControlsSectionOpenState(): LiveDevControlsSectionOpenState {
  if (typeof window === 'undefined') {
    return buildDefaultLiveDevControlsSectionOpenState()
  }

  try {
    const stored = window.localStorage.getItem(LIVE_DEV_CONTROLS_SECTION_OPEN_STORAGE_KEY)
    return stored
      ? sanitizeLiveDevControlsSectionOpenState(JSON.parse(stored))
      : buildDefaultLiveDevControlsSectionOpenState()
  } catch {
    return buildDefaultLiveDevControlsSectionOpenState()
  }
}

export function persistLiveDevControlsSectionOpenState(state: LiveDevControlsSectionOpenState) {
  try {
    window.localStorage.setItem(
      LIVE_DEV_CONTROLS_SECTION_OPEN_STORAGE_KEY,
      JSON.stringify(sanitizeLiveDevControlsSectionOpenState(state)),
    )
  } catch {
    return
  }
}

export function readLiveDevControlsSelectedValues(): LiveDevControlsSelectedValues {
  if (typeof window === 'undefined') {
    return buildDefaultLiveDevControlsSelectedValues()
  }

  try {
    const stored = window.localStorage.getItem(LIVE_DEV_CONTROLS_SELECTED_VALUES_STORAGE_KEY)
    return stored
      ? sanitizeLiveDevControlsSelectedValues(JSON.parse(stored))
      : buildDefaultLiveDevControlsSelectedValues()
  } catch {
    return buildDefaultLiveDevControlsSelectedValues()
  }
}

export function persistLiveDevControlsSelectedValues(values: LiveDevControlsSelectedValues) {
  try {
    window.localStorage.setItem(
      LIVE_DEV_CONTROLS_SELECTED_VALUES_STORAGE_KEY,
      JSON.stringify(sanitizeLiveDevControlsSelectedValues(values)),
    )
  } catch {
    return
  }
}

export function persistLiveDevControlsSelectedValuePatch(
  patch: Partial<LiveDevControlsSelectedValues>,
) {
  persistLiveDevControlsSelectedValues({
    ...readLiveDevControlsSelectedValues(),
    ...patch,
  })
}
