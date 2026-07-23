import assert from 'node:assert/strict'
import { test } from 'node:test'

import { resolveLiveShortcutIntent } from './live-game-shortcut-intents.ts'

test('play shortcut follows the current staged face-down card behavior', () => {
  const intent = resolveLiveShortcutIntent({
    shortcutAction: 'play_card_2',
    heroCardSlots: [
      { cardId: 'hero-1', isStagedFaceDown: false, canPlayFaceUp: true, canPlayFaceDown: true },
      { cardId: 'hero-2', isStagedFaceDown: true, canPlayFaceUp: false, canPlayFaceDown: true },
      { cardId: 'hero-3', isStagedFaceDown: false, canPlayFaceUp: true, canPlayFaceDown: true },
    ],
    groupedActions: {},
    hideCardPlaysImmediately: false,
    canAct: true,
    heroIsResponder: false,
    humanElevenDecisionPending: false,
    isPending: false,
    isAutoStartingHand: false,
    isDealingCards: false,
  })

  assert.deepEqual(intent, {
    kind: 'act',
    action: { type: 'play_face_down', card_id: 'hero-2' },
  })
})

test('hide shortcut can submit the face-down play immediately when configured', () => {
  const intent = resolveLiveShortcutIntent({
    shortcutAction: 'hide_card_1',
    heroCardSlots: [
      { cardId: 'hero-1', isStagedFaceDown: false, canPlayFaceUp: true, canPlayFaceDown: true },
      { cardId: 'hero-2', isStagedFaceDown: false, canPlayFaceUp: true, canPlayFaceDown: true },
      { cardId: 'hero-3', isStagedFaceDown: false, canPlayFaceUp: true, canPlayFaceDown: true },
    ],
    groupedActions: {},
    hideCardPlaysImmediately: true,
    canAct: true,
    heroIsResponder: false,
    humanElevenDecisionPending: false,
    isPending: false,
    isAutoStartingHand: false,
    isDealingCards: false,
  })

  assert.deepEqual(intent, {
    kind: 'act',
    action: { type: 'play_face_down', card_id: 'hero-1' },
  })
})

test('raise shortcut no-ops when the action is currently illegal', () => {
  const intent = resolveLiveShortcutIntent({
    shortcutAction: 'raise_stake',
    heroCardSlots: [],
    groupedActions: { raise: { type: 'raise', to: 6 } },
    hideCardPlaysImmediately: false,
    canAct: true,
    heroIsResponder: false,
    humanElevenDecisionPending: true,
    isPending: false,
    isAutoStartingHand: false,
    isDealingCards: false,
  })

  assert.equal(intent, null)
})

test('decline shortcut falls back to eleven-hand fold decisions', () => {
  const intent = resolveLiveShortcutIntent({
    shortcutAction: 'decline_raise',
    heroCardSlots: [],
    groupedActions: { foldEleven: { type: 'fold_eleven' } },
    hideCardPlaysImmediately: false,
    canAct: true,
    heroIsResponder: false,
    humanElevenDecisionPending: true,
    isPending: false,
    isAutoStartingHand: false,
    isDealingCards: false,
  })

  assert.deepEqual(intent, {
    kind: 'act',
    action: { type: 'fold_eleven' },
  })
})
