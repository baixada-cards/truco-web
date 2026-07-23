import type { SessionAction } from './session-api'
import type { LiveShortcutAction } from './live-keyboard-shortcuts.ts'

export type LiveShortcutHeroCardState = {
  cardId: string | null
  isStagedFaceDown: boolean
  canPlayFaceUp: boolean
  canPlayFaceDown: boolean
}

export type GroupedLiveShortcutActions = {
  raise?: Extract<SessionAction, { type: 'raise' }>
  acceptRaise?: Extract<SessionAction, { type: 'accept_raise' }>
  fold?: Extract<SessionAction, { type: 'fold' }>
  acceptEleven?: Extract<SessionAction, { type: 'accept_eleven' }>
  foldEleven?: Extract<SessionAction, { type: 'fold_eleven' }>
}

export type LiveShortcutIntent =
  | { kind: 'act'; action: SessionAction }
  | { kind: 'toggle_face_down'; cardId: string }

type ResolveLiveShortcutIntentOptions = {
  shortcutAction: LiveShortcutAction
  heroCardSlots: LiveShortcutHeroCardState[]
  groupedActions: GroupedLiveShortcutActions
  hideCardPlaysImmediately: boolean
  canAct: boolean
  heroIsResponder: boolean
  humanElevenDecisionPending: boolean
  isPending: boolean
  isAutoStartingHand: boolean
  isDealingCards: boolean
}

export function resolveLiveShortcutIntent({
  shortcutAction,
  heroCardSlots,
  groupedActions,
  hideCardPlaysImmediately,
  canAct,
  heroIsResponder,
  humanElevenDecisionPending,
  isPending,
  isAutoStartingHand,
  isDealingCards,
}: ResolveLiveShortcutIntentOptions): LiveShortcutIntent | null {
  const isInteractionBlocked = isPending || isAutoStartingHand || isDealingCards

  if (shortcutAction.startsWith('play_card_')) {
    const slotIndex = Number.parseInt(shortcutAction.slice(-1), 10) - 1
    const slot = heroCardSlots[slotIndex]

    if (!slot?.cardId) return null
    if (slot.isStagedFaceDown && slot.canPlayFaceDown) {
      return {
        kind: 'act',
        action: { type: 'play_face_down', card_id: slot.cardId },
      }
    }
    if (slot.canPlayFaceUp) {
      return {
        kind: 'act',
        action: { type: 'play_face_up', card_id: slot.cardId },
      }
    }
    return null
  }

  if (shortcutAction.startsWith('hide_card_')) {
    const slotIndex = Number.parseInt(shortcutAction.slice(-1), 10) - 1
    const slot = heroCardSlots[slotIndex]

    if (!slot?.cardId || !slot.canPlayFaceDown) return null
    if (hideCardPlaysImmediately) {
      return {
        kind: 'act',
        action: { type: 'play_face_down', card_id: slot.cardId },
      }
    }
    return {
      kind: 'toggle_face_down',
      cardId: slot.cardId,
    }
  }

  if (isInteractionBlocked) return null

  if (shortcutAction === 'raise_stake') {
    if (humanElevenDecisionPending || !groupedActions.raise) return null
    if (heroIsResponder || canAct) {
      return {
        kind: 'act',
        action: groupedActions.raise,
      }
    }
    return null
  }

  if (shortcutAction === 'accept_raise') {
    if (groupedActions.acceptRaise) {
      return {
        kind: 'act',
        action: groupedActions.acceptRaise,
      }
    }
    if (groupedActions.acceptEleven) {
      return {
        kind: 'act',
        action: groupedActions.acceptEleven,
      }
    }
    return null
  }

  if (shortcutAction === 'decline_raise') {
    if (groupedActions.fold) {
      return {
        kind: 'act',
        action: groupedActions.fold,
      }
    }
    if (groupedActions.foldEleven) {
      return {
        kind: 'act',
        action: groupedActions.foldEleven,
      }
    }
  }

  return null
}
