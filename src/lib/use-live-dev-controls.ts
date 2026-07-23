'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react'

import { DEFAULT_SOUND_THEME_ID } from './table-sound-fx.ts'
import type { SoundCue, SoundThemeId } from './table-sound-fx.ts'
import type { SessionCard } from './session-api.ts'
import type { ScoreSide } from './live-score-celebration.ts'
import {
  buildDefaultLiveDevControlsSectionOpenState,
  persistLiveDevControlsSectionOpenState,
  persistLiveDevControlsSelectedValuePatch,
  persistLiveDevPanelOpen,
  readLiveDevControlsSectionOpenState,
  readLiveDevControlsSelectedValues,
  readLiveDevPanelOpen,
  sanitizeLiveDevControlsSectionOpenState,
  type DevStakeResponseAction,
  type LiveDevControlsSectionOpenState,
} from './live-dev-controls-preferences.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Seat = 0 | 1
type DealerChoice = Seat | 'random'

type MatchCompletePreviewState = {
  tone: 'victory' | 'defeat'
  winnerSide: ScoreSide
  showScreen?: boolean
}

type FixedMotionPoint = {
  x: number
  y: number
}

type DevPanelDragOptions = {
  force?: boolean
  displayOffsetY?: number
}

const DEV_PANEL_POSITION_STORAGE_KEY = 'farol-dev-plaque-pos'
const DEFAULT_DEV_PANEL_POSITION: FixedMotionPoint = { x: 36, y: 220 }
const DEV_PANEL_EDGE_PADDING = 4
const DEV_PANEL_EDGE_SNAP_DISTANCE = 16
const DEV_PANEL_DRAG_THRESHOLD = 3
const LAMP_SWING_LEAD_STORAGE_KEY = 'farol-lamp-swing-lead-ms'
const DEFAULT_LAMP_SWING_LEAD_MS = 330
const MIN_LAMP_SWING_LEAD_MS = 0
const MAX_LAMP_SWING_LEAD_MS = 1000

function loadStoredDevPanelPosition() {
  if (typeof window === 'undefined') return null

  try {
    const rawPosition = window.localStorage.getItem(DEV_PANEL_POSITION_STORAGE_KEY)
    if (!rawPosition) return null

    const parsedPosition = JSON.parse(rawPosition) as Partial<FixedMotionPoint> & {
      left?: number
      top?: number
    } | null
    const storedX = typeof parsedPosition?.left === 'number' ? parsedPosition.left : parsedPosition?.x
    const storedY = typeof parsedPosition?.top === 'number' ? parsedPosition.top : parsedPosition?.y
    if (
      typeof storedX === 'number' &&
      typeof storedY === 'number' &&
      Number.isFinite(storedX) &&
      Number.isFinite(storedY)
    ) {
      return { x: storedX, y: storedY }
    }
  } catch {
    // Dev-only preference; blocked or malformed storage should keep the default.
  }

  return null
}

function saveDevPanelPosition(position: FixedMotionPoint | null) {
  if (typeof window === 'undefined' || position == null) return

  try {
    window.localStorage.setItem(DEV_PANEL_POSITION_STORAGE_KEY, JSON.stringify({
      left: position.x,
      top: position.y,
    }))
  } catch {
    // Dev-only preference; blocked storage should not break the live table.
  }
}

function clampLampSwingLeadMs(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_LAMP_SWING_LEAD_MS
  return Math.min(
    MAX_LAMP_SWING_LEAD_MS,
    Math.max(MIN_LAMP_SWING_LEAD_MS, Math.round(value)),
  )
}

function snapPanelDisplayPosition(left: number, top: number, width: number, height: number) {
  const maxX = Math.max(DEV_PANEL_EDGE_PADDING, window.innerWidth - width - DEV_PANEL_EDGE_PADDING)
  const maxY = Math.max(DEV_PANEL_EDGE_PADDING, window.innerHeight - height - DEV_PANEL_EDGE_PADDING)
  let nextX = Math.min(Math.max(DEV_PANEL_EDGE_PADDING, left), maxX)
  let nextY = Math.min(Math.max(DEV_PANEL_EDGE_PADDING, top), maxY)

  if (nextX <= DEV_PANEL_EDGE_PADDING + DEV_PANEL_EDGE_SNAP_DISTANCE) {
    nextX = DEV_PANEL_EDGE_PADDING
  } else if (maxX - nextX <= DEV_PANEL_EDGE_SNAP_DISTANCE) {
    nextX = maxX
  }

  if (nextY <= DEV_PANEL_EDGE_PADDING + DEV_PANEL_EDGE_SNAP_DISTANCE) {
    nextY = DEV_PANEL_EDGE_PADDING
  } else if (maxY - nextY <= DEV_PANEL_EDGE_SNAP_DISTANCE) {
    nextY = maxY
  }

  return { x: nextX, y: nextY }
}

// ---------------------------------------------------------------------------
// Exported return type
// ---------------------------------------------------------------------------

export type LiveDevControlsState = {
  // Panel visibility / drag
  devPanelOpen: boolean
  setDevPanelOpen: Dispatch<SetStateAction<boolean>>
  devPanelPosition: FixedMotionPoint | null
  setDevPanelPosition: Dispatch<SetStateAction<FixedMotionPoint | null>>
  resetDevPanelPosition: () => void
  isDraggingDevPanel: boolean
  devPanelRef: MutableRefObject<HTMLElement | null>
  devSectionOpenState: LiveDevControlsSectionOpenState
  setDevSectionOpenState: Dispatch<SetStateAction<LiveDevControlsSectionOpenState>>

  // Sound audition
  devAuditionThemeId: SoundThemeId
  setDevAuditionThemeId: Dispatch<SetStateAction<SoundThemeId>>
  devAuditionCue: SoundCue
  setDevAuditionCue: Dispatch<SetStateAction<SoundCue>>

  // Clipboard toast
  devClipboardMessage: string | null

  // Scenario controls
  devDealerChoice: DealerChoice
  setDevDealerChoice: Dispatch<SetStateAction<DealerChoice>>
  /** forced turnup rank for the next dealt hand; 'random' disables forcing.
   *  Defaults to '4' (turn-up class 0, the locally shipped study charts) so
   *  the game-to-lab lens is exercisable without redealing for the vira. */
  devNextViraRank: string
  setDevNextViraRank: Dispatch<SetStateAction<string>>
  devScoreHero: number
  setDevScoreHero: Dispatch<SetStateAction<number>>
  devScoreVillain: number
  setDevScoreVillain: Dispatch<SetStateAction<number>>
  devStakeResponseAction: DevStakeResponseAction
  setDevStakeResponseAction: Dispatch<SetStateAction<DevStakeResponseAction>>
  devVillainCards: SessionCard[] | null
  setDevVillainCards: Dispatch<SetStateAction<SessionCard[] | null>>
  devVillainCardsStale: boolean
  setDevVillainCardsStale: Dispatch<SetStateAction<boolean>>

  // Animation controls
  devAnimStakeFrom: number
  setDevAnimStakeFrom: Dispatch<SetStateAction<number>>
  devLampSwingLeadMs: number
  setDevLampSwingLeadMs: Dispatch<SetStateAction<number>>
  devAnimScorePoints: number
  setDevAnimScorePoints: Dispatch<SetStateAction<number>>
  devAnimScoreWinner: ScoreSide
  setDevAnimScoreWinner: Dispatch<SetStateAction<ScoreSide>>
  devStakeFxActor: ScoreSide
  setDevStakeFxActor: Dispatch<SetStateAction<ScoreSide>>

  // Match-complete preview overlay
  devMatchCompletePreview: MatchCompletePreviewState | null
  setDevMatchCompletePreview: Dispatch<SetStateAction<MatchCompletePreviewState | null>>
  devMatchCompletePreviewTimeoutRef: MutableRefObject<number | null>
  devMatchCompletePreviewRunIdRef: MutableRefObject<number>

  // Callbacks
  clearDevPanelDrag: () => void
  handleDevPanelPointerDown: (event: ReactPointerEvent<HTMLElement>, options?: DevPanelDragOptions) => void
  clearDevClipboardTimeout: () => void
  flashDevClipboardMessage: (message: string) => void
  clearDevMatchCompletePreviewTimeout: () => void
  clearDevMatchCompletePreview: () => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Owns all dev-panel state, refs, and callbacks for LiveGame.tsx.
 *
 * @param activeMatchId - The currently active match ID. When this changes the
 *   in-flight match-complete preview is automatically cancelled.
 */
export function useLiveDevControls(activeMatchId: string | null): LiveDevControlsState {
  // Panel
  const [devPanelOpen, setDevPanelOpenState] = useState(false)
  const [devPanelPosition, setDevPanelPositionState] = useState<FixedMotionPoint | null>(null)
  const [devSectionOpenState, setDevSectionOpenStateState] =
    useState<LiveDevControlsSectionOpenState>(() => buildDefaultLiveDevControlsSectionOpenState())
  const [isDraggingDevPanel, setIsDraggingDevPanel] = useState(false)
  const devPanelRef = useRef<HTMLElement | null>(null)
  const devPanelDragStateRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    moved: boolean
    offsetX: number
    offsetY: number
    width: number
    height: number
    displayOffsetY: number
  } | null>(null)

  // Sound audition
  const [devAuditionThemeId, setDevAuditionThemeIdState] = useState<SoundThemeId>(DEFAULT_SOUND_THEME_ID)
  const [devAuditionCue, setDevAuditionCueState] = useState<SoundCue>('raise')

  // Clipboard toast
  const [devClipboardMessage, setDevClipboardMessage] = useState<string | null>(null)
  const devClipboardTimeoutRef = useRef<number | null>(null)

  // Scenario controls
  const [devDealerChoice, setDevDealerChoiceState] = useState<DealerChoice>('random')
  const [devNextViraRank, setDevNextViraRank] = useState<string>('4')
  const [devScoreHero, setDevScoreHero] = useState<number>(0)
  const [devScoreVillain, setDevScoreVillain] = useState<number>(0)
  const [devStakeResponseAction, setDevStakeResponseActionState] = useState<DevStakeResponseAction>('accept_raise')
  const [devVillainCards, setDevVillainCards] = useState<SessionCard[] | null>(null)
  const [devVillainCardsStale, setDevVillainCardsStale] = useState(false)

  // Animation controls
  const [devAnimStakeFrom, setDevAnimStakeFromState] = useState<number>(1)
  const [devLampSwingLeadMs, setDevLampSwingLeadMsState] = useState<number>(DEFAULT_LAMP_SWING_LEAD_MS)
  const [devAnimScorePoints, setDevAnimScorePointsState] = useState<number>(3)
  const [devAnimScoreWinner, setDevAnimScoreWinnerState] = useState<ScoreSide>('hero')
  const [devStakeFxActor, setDevStakeFxActorState] = useState<ScoreSide>('villain')

  // Match-complete preview
  const [devMatchCompletePreview, setDevMatchCompletePreview] = useState<MatchCompletePreviewState | null>(null)
  const devMatchCompletePreviewTimeoutRef = useRef<number | null>(null)
  const devMatchCompletePreviewRunIdRef = useRef(0)

  // -------------------------------------------------------------------------
  // Callbacks
  // -------------------------------------------------------------------------

  const clearDevPanelDrag = useCallback(() => {
    devPanelDragStateRef.current = null
    setIsDraggingDevPanel(false)
  }, [])

  const setDevPanelOpen = useCallback<Dispatch<SetStateAction<boolean>>>((value) => {
    setDevPanelOpenState((previousOpen) => {
      const nextOpen = typeof value === 'function' ? value(previousOpen) : value
      persistLiveDevPanelOpen(nextOpen)
      return nextOpen
    })
  }, [])

  const setDevSectionOpenState = useCallback<Dispatch<SetStateAction<LiveDevControlsSectionOpenState>>>((value) => {
    setDevSectionOpenStateState((previousState) => {
      const nextState = sanitizeLiveDevControlsSectionOpenState(
        typeof value === 'function' ? value(previousState) : value,
      )
      persistLiveDevControlsSectionOpenState(nextState)
      return nextState
    })
  }, [])

  const setDevPanelPosition = useCallback<Dispatch<SetStateAction<FixedMotionPoint | null>>>((value) => {
    setDevPanelPositionState((previousPosition) => {
      const nextPosition = typeof value === 'function' ? value(previousPosition) : value
      saveDevPanelPosition(nextPosition)
      return nextPosition
    })
  }, [])

  const resetDevPanelPosition = useCallback(() => {
    setDevPanelPosition(DEFAULT_DEV_PANEL_POSITION)
  }, [setDevPanelPosition])

  const handleDevPanelPointerDown = useCallback((
    event: ReactPointerEvent<HTMLElement>,
    options?: DevPanelDragOptions,
  ) => {
    const target = event.target as HTMLElement | null
    if (!options?.force && target?.closest('button, summary, input, select, textarea, a, label')) {
      return
    }

    const panel = devPanelRef.current
    if (!panel) return

    event.preventDefault()
    event.stopPropagation()

    const rect = panel.getBoundingClientRect()
    const displayOffsetY = options?.displayOffsetY ?? 0
    devPanelDragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      displayOffsetY,
    }
    setDevPanelPosition({ x: rect.left, y: rect.top - displayOffsetY })
  }, [setDevPanelPosition])

  const clearDevClipboardTimeout = useCallback(() => {
    if (devClipboardTimeoutRef.current != null) {
      window.clearTimeout(devClipboardTimeoutRef.current)
      devClipboardTimeoutRef.current = null
    }
  }, [])

  const flashDevClipboardMessage = useCallback((message: string) => {
    clearDevClipboardTimeout()
    setDevClipboardMessage(message)
    devClipboardTimeoutRef.current = window.setTimeout(() => {
      setDevClipboardMessage(null)
      devClipboardTimeoutRef.current = null
    }, 2200)
  }, [clearDevClipboardTimeout])

  const clearDevMatchCompletePreviewTimeout = useCallback(() => {
    if (devMatchCompletePreviewTimeoutRef.current != null) {
      window.clearTimeout(devMatchCompletePreviewTimeoutRef.current)
      devMatchCompletePreviewTimeoutRef.current = null
    }
  }, [])

  const clearDevMatchCompletePreview = useCallback(() => {
    devMatchCompletePreviewRunIdRef.current += 1
    clearDevMatchCompletePreviewTimeout()
    setDevMatchCompletePreview(null)
  }, [clearDevMatchCompletePreviewTimeout])

  const setDevAuditionThemeId = useCallback<Dispatch<SetStateAction<SoundThemeId>>>((value) => {
    setDevAuditionThemeIdState((previousThemeId) => {
      const nextThemeId = typeof value === 'function' ? value(previousThemeId) : value
      persistLiveDevControlsSelectedValuePatch({ auditionThemeId: nextThemeId })
      return nextThemeId
    })
  }, [])

  const setDevAuditionCue = useCallback<Dispatch<SetStateAction<SoundCue>>>((value) => {
    setDevAuditionCueState((previousCue) => {
      const nextCue = typeof value === 'function' ? value(previousCue) : value
      persistLiveDevControlsSelectedValuePatch({ auditionCue: nextCue })
      return nextCue
    })
  }, [])

  const setDevDealerChoice = useCallback<Dispatch<SetStateAction<DealerChoice>>>((value) => {
    setDevDealerChoiceState((previousChoice) => {
      const nextChoice = typeof value === 'function' ? value(previousChoice) : value
      persistLiveDevControlsSelectedValuePatch({ dealerChoice: nextChoice })
      return nextChoice
    })
  }, [])

  const setDevStakeResponseAction = useCallback<Dispatch<SetStateAction<DevStakeResponseAction>>>((value) => {
    setDevStakeResponseActionState((previousAction) => {
      const nextAction = typeof value === 'function' ? value(previousAction) : value
      persistLiveDevControlsSelectedValuePatch({ stakeResponseAction: nextAction })
      return nextAction
    })
  }, [])

  const setDevAnimStakeFrom = useCallback<Dispatch<SetStateAction<number>>>((value) => {
    setDevAnimStakeFromState((previousStake) => {
      const nextStake = typeof value === 'function' ? value(previousStake) : value
      persistLiveDevControlsSelectedValuePatch({ animStakeFrom: nextStake })
      return nextStake
    })
  }, [])

  const setDevAnimScorePoints = useCallback<Dispatch<SetStateAction<number>>>((value) => {
    setDevAnimScorePointsState((previousPoints) => {
      const nextPoints = typeof value === 'function' ? value(previousPoints) : value
      persistLiveDevControlsSelectedValuePatch({ animScorePoints: nextPoints })
      return nextPoints
    })
  }, [])

  const setDevAnimScoreWinner = useCallback<Dispatch<SetStateAction<ScoreSide>>>((value) => {
    setDevAnimScoreWinnerState((previousWinner) => {
      const nextWinner = typeof value === 'function' ? value(previousWinner) : value
      persistLiveDevControlsSelectedValuePatch({ animScoreWinner: nextWinner })
      return nextWinner
    })
  }, [])

  const setDevStakeFxActor = useCallback<Dispatch<SetStateAction<ScoreSide>>>((value) => {
    setDevStakeFxActorState((previousActor) => {
      const nextActor = typeof value === 'function' ? value(previousActor) : value
      persistLiveDevControlsSelectedValuePatch({ stakeFxActor: nextActor })
      return nextActor
    })
  }, [])

  const setDevLampSwingLeadMs = useCallback<Dispatch<SetStateAction<number>>>((value) => {
    setDevLampSwingLeadMsState((previousLeadMs) => {
      const nextLeadMs = clampLampSwingLeadMs(
        typeof value === 'function' ? value(previousLeadMs) : value,
      )
      try {
        window.localStorage.setItem(LAMP_SWING_LEAD_STORAGE_KEY, String(nextLeadMs))
      } catch {
        // Dev-only preference; blocked storage should not break the live table.
      }
      return nextLeadMs
    })
  }, [])

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  // Cancel the dev match-complete preview whenever we switch to a new match.
  useEffect(() => {
    clearDevMatchCompletePreview()
  }, [clearDevMatchCompletePreview, activeMatchId])

  useEffect(() => {
    try {
      const storedLampSwingLead = window.localStorage.getItem(LAMP_SWING_LEAD_STORAGE_KEY)
      if (storedLampSwingLead != null) {
        setDevLampSwingLeadMsState(clampLampSwingLeadMs(Number(storedLampSwingLead)))
      }
    } catch {
      // Ignore unavailable storage and keep the default visual treatment.
    }
  }, [])

  useEffect(() => {
    setDevPanelOpenState(readLiveDevPanelOpen())
    setDevSectionOpenStateState(readLiveDevControlsSectionOpenState())

    const storedSelections = readLiveDevControlsSelectedValues()
    setDevAuditionThemeIdState(storedSelections.auditionThemeId)
    setDevAuditionCueState(storedSelections.auditionCue)
    setDevDealerChoiceState(storedSelections.dealerChoice)
    setDevStakeResponseActionState(storedSelections.stakeResponseAction)
    setDevAnimStakeFromState(storedSelections.animStakeFrom)
    setDevAnimScorePointsState(storedSelections.animScorePoints)
    setDevAnimScoreWinnerState(storedSelections.animScoreWinner)
    setDevStakeFxActorState(storedSelections.stakeFxActor)
  }, [])

  useEffect(() => {
    setDevPanelPositionState(loadStoredDevPanelPosition())
  }, [])

  // Track pointer move / up so the dev panel can be dragged anywhere.
  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = devPanelDragStateRef.current
      if (!dragState) return

      const dx = event.clientX - dragState.startClientX
      const dy = event.clientY - dragState.startClientY
      if (!dragState.moved && Math.abs(dx) + Math.abs(dy) <= DEV_PANEL_DRAG_THRESHOLD) {
        return
      }

      dragState.moved = true
      setIsDraggingDevPanel(true)

      const displayPosition = snapPanelDisplayPosition(
        event.clientX - dragState.offsetX,
        event.clientY - dragState.offsetY,
        dragState.width,
        dragState.height,
      )
      setDevPanelPosition({
        x: displayPosition.x,
        y: displayPosition.y - dragState.displayOffsetY,
      })
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (devPanelDragStateRef.current?.pointerId !== event.pointerId) return
      clearDevPanelDrag()
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [clearDevPanelDrag, setDevPanelPosition])

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return {
    devPanelOpen,
    setDevPanelOpen,
    devPanelPosition,
    setDevPanelPosition,
    resetDevPanelPosition,
    isDraggingDevPanel,
    devPanelRef,
    devSectionOpenState,
    setDevSectionOpenState,

    devAuditionThemeId,
    setDevAuditionThemeId,
    devAuditionCue,
    setDevAuditionCue,

    devClipboardMessage,

    devDealerChoice,
    setDevDealerChoice,
    devNextViraRank,
    setDevNextViraRank,
    devScoreHero,
    setDevScoreHero,
    devScoreVillain,
    setDevScoreVillain,
    devStakeResponseAction,
    setDevStakeResponseAction,
    devVillainCards,
    setDevVillainCards,
    devVillainCardsStale,
    setDevVillainCardsStale,

    devAnimStakeFrom,
    setDevAnimStakeFrom,
    devLampSwingLeadMs,
    setDevLampSwingLeadMs,
    devAnimScorePoints,
    setDevAnimScorePoints,
    devAnimScoreWinner,
    setDevAnimScoreWinner,
    devStakeFxActor,
    setDevStakeFxActor,

    devMatchCompletePreview,
    setDevMatchCompletePreview,
    devMatchCompletePreviewTimeoutRef,
    devMatchCompletePreviewRunIdRef,

    clearDevPanelDrag,
    handleDevPanelPointerDown,
    clearDevClipboardTimeout,
    flashDevClipboardMessage,
    clearDevMatchCompletePreviewTimeout,
    clearDevMatchCompletePreview,
  }
}
