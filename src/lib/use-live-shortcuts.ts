'use client'

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'

import {
  getLiveShortcutAction,
  getLiveShortcutFromKeyboardEvent,
  type LiveShortcutAction,
  type LiveShortcutMap,
} from './live-keyboard-shortcuts.ts'
import { resolveLiveShortcutIntent } from './live-game-shortcut-intents.ts'
import type { GroupedLiveShortcutActions, LiveShortcutHeroCardState } from './live-game-shortcut-intents.ts'
import type { SessionAction } from './session-api.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * All runtime context the keydown handler needs. Passed by reference so the
 * effect never needs to re-register when these values change.
 */
export type LiveShortcutsContext = {
  shortcutsEnabled: boolean
  shortcuts: LiveShortcutMap
  hideCardPlaysImmediately: boolean
  canAct: boolean
  heroIsResponder: boolean
  humanElevenDecisionPending: boolean
  isPending: boolean
  isAutoStartingHand: boolean
  isDealingCards: boolean
  heroCardSlots: LiveShortcutHeroCardState[]
  groupedActions: GroupedLiveShortcutActions | null
  settingsDrawerOpen: boolean
  strengthGuideAvailable: boolean
  /**
   * True while a dialog/overlay (new-match confirm, match-complete screen,
   * settings drawer, first-run deck picker) covers the table. Game-action
   * shortcuts must not fire into the game behind it.
   */
  gameShortcutsBlocked: boolean

  // Action callbacks
  act: (action: SessionAction) => void
  assignShortcut: (action: LiveShortcutAction, key: string | null) => void
  handleHideCardChoice: (cardId: string) => void
  submitHeroCardAction: (cardId: string, type: 'play_face_up' | 'play_face_down') => void
  toggleStrengthGuide: () => void
}

// ---------------------------------------------------------------------------
// Exported return type
// ---------------------------------------------------------------------------

export type LiveShortcutsState = {
  shortcutCaptureAction: LiveShortcutAction | null
  setShortcutCaptureAction: Dispatch<SetStateAction<LiveShortcutAction | null>>
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Owns keyboard-shortcut capture state and installs the global keydown handler.
 *
 * Uses a latest-value ref so the keydown listener is registered exactly once
 * and does not need to be torn down / re-added when game state changes.
 *
 * @param ctx - Live context bag. Pass a stable-structured object; the hook
 *   reads the latest values via a ref on every keydown event.
 */
export function useLiveShortcuts(ctx: LiveShortcutsContext): LiveShortcutsState {
  const [shortcutCaptureAction, setShortcutCaptureAction] = useState<LiveShortcutAction | null>(null)

  // Keep a ref so the keydown handler always sees current values without
  // needing to be re-registered every render.
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx

  // Also keep a ref to shortcutCaptureAction so the handler can read it
  // without being in its own dep array.
  const captureActionRef = useRef(shortcutCaptureAction)
  captureActionRef.current = shortcutCaptureAction

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  // Clear capture mode when the settings drawer is closed.
  useEffect(() => {
    if (!ctx.settingsDrawerOpen && shortcutCaptureAction) {
      setShortcutCaptureAction(null)
    }
  }, [ctx.settingsDrawerOpen, shortcutCaptureAction])

  // Global keydown handler — registered once.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const c = ctxRef.current
      const captureAction = captureActionRef.current

      const activeElement = document.activeElement as HTMLElement | null
      const tagName = activeElement?.tagName
      const isTextEntry =
        activeElement?.isContentEditable ||
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        tagName === 'SELECT'

      if (captureAction) {
        event.preventDefault()

        if (event.key === 'Escape') {
          setShortcutCaptureAction(null)
          return
        }

        if (event.key === 'Backspace' || event.key === 'Delete') {
          c.assignShortcut(captureAction, null)
          setShortcutCaptureAction(null)
          return
        }

        const shortcutKey = getLiveShortcutFromKeyboardEvent(event)
        if (!shortcutKey) return

        c.assignShortcut(captureAction, shortcutKey)
        setShortcutCaptureAction(null)
        return
      }

      if (isTextEntry || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return

      const shortcutKey = getLiveShortcutFromKeyboardEvent(event)
      if (!shortcutKey) return

      if (c.shortcutsEnabled && !c.gameShortcutsBlocked) {
        const shortcutAction = getLiveShortcutAction(c.shortcuts, shortcutKey)
        if (shortcutAction) {
          if (shortcutAction === 'toggle_strength_guide') {
            if (c.strengthGuideAvailable) {
              event.preventDefault()
              c.toggleStrengthGuide()
            }
            return
          }

          const intent = resolveLiveShortcutIntent({
            shortcutAction,
            heroCardSlots: c.heroCardSlots,
            groupedActions: c.groupedActions ?? {},
            hideCardPlaysImmediately: c.hideCardPlaysImmediately,
            canAct: c.canAct,
            heroIsResponder: c.heroIsResponder,
            humanElevenDecisionPending: c.humanElevenDecisionPending,
            isPending: c.isPending,
            isAutoStartingHand: c.isAutoStartingHand,
            isDealingCards: c.isDealingCards,
          })

          if (intent) {
            event.preventDefault()

            if (intent.kind === 'toggle_face_down') {
              c.handleHideCardChoice(intent.cardId)
              return
            }

            if (intent.action.type === 'play_face_up' || intent.action.type === 'play_face_down') {
              c.submitHeroCardAction(intent.action.card_id, intent.action.type)
              return
            }

            void c.act(intent.action)
            return
          }
        }
      }

    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, []) // registered once — all live state accessed via ctxRef / captureActionRef

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return {
    shortcutCaptureAction,
    setShortcutCaptureAction,
  }
}
