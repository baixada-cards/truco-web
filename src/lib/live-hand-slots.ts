import type { Seat } from './live-bot-selection.ts'
import type { SessionCard } from './session-api.ts'

const HAND_SLOT_COUNT = 3

export type StableHandSlotState = {
  handKey: string | null
  cardIdsBySlot: (string | null)[]
}

function emptyCardSlots() {
  return Array.from({ length: HAND_SLOT_COUNT }, () => null) as (string | null)[]
}

export function handSlotIndexFromCardId(cardId: string | null | undefined, player: Seat) {
  const match = /^p([01])c([0-2])$/.exec(cardId ?? '')
  if (!match || Number(match[1]) !== player) return null
  return Number(match[2])
}

export function firstVisibleHandSlots(visibleCount: number) {
  const clampedCount = Math.max(0, Math.min(HAND_SLOT_COUNT, visibleCount))
  return Array.from({ length: HAND_SLOT_COUNT }, (_, index) => index < clampedCount)
}

export function deriveStableHandCardSlots({
  cards,
  player,
  previous,
  handKey,
}: {
  cards: SessionCard[]
  player: Seat
  previous: StableHandSlotState | null
  handKey: string | null
}) {
  const cardsById = new Map(cards.map((card) => [card.id, card]))
  const hasPreviousHandState = previous?.handKey === handKey
  const nextCardIdsBySlot = hasPreviousHandState
    ? [...previous.cardIdsBySlot]
    : emptyCardSlots()

  for (const card of cards) {
    if (nextCardIdsBySlot.includes(card.id)) continue

    const slotIndex = handSlotIndexFromCardId(card.id, player)
    if (slotIndex !== null) {
      if (!hasPreviousHandState || nextCardIdsBySlot[slotIndex] === null) {
        nextCardIdsBySlot[slotIndex] = card.id
      }
    }
  }

  for (let index = 0; index < HAND_SLOT_COUNT; index += 1) {
    const cardId = nextCardIdsBySlot[index]
    if (cardId && !cardsById.has(cardId)) {
      nextCardIdsBySlot[index] = null
    }
  }

  for (const card of cards) {
    if (nextCardIdsBySlot.includes(card.id)) continue
    const openSlotIndex = nextCardIdsBySlot.findIndex((cardId) => cardId === null)
    if (openSlotIndex === -1) break
    nextCardIdsBySlot[openSlotIndex] = card.id
  }

  return {
    cardsBySlot: nextCardIdsBySlot.map((cardId) => (
      cardId ? cardsById.get(cardId) ?? null : null
    )),
    state: {
      handKey,
      cardIdsBySlot: nextCardIdsBySlot,
    },
  }
}

export function reorderStableHandCardSlots({
  state,
  handKey,
  cardId,
  toSlotIndex,
}: {
  state: StableHandSlotState | null
  handKey: string | null
  cardId: string
  toSlotIndex: number
}) {
  if (!state || state.handKey !== handKey) return state

  const fromSlotIndex = state.cardIdsBySlot.indexOf(cardId)
  const clampedToSlotIndex = Math.max(0, Math.min(HAND_SLOT_COUNT - 1, toSlotIndex))
  if (fromSlotIndex === -1 || fromSlotIndex === clampedToSlotIndex) return state

  const nextCardIdsBySlot = [...state.cardIdsBySlot]
  nextCardIdsBySlot[fromSlotIndex] = null

  if (nextCardIdsBySlot[clampedToSlotIndex] === null) {
    nextCardIdsBySlot[clampedToSlotIndex] = cardId
  } else if (fromSlotIndex < clampedToSlotIndex) {
    for (let index = fromSlotIndex; index < clampedToSlotIndex; index += 1) {
      nextCardIdsBySlot[index] = nextCardIdsBySlot[index + 1]
    }
    nextCardIdsBySlot[clampedToSlotIndex] = cardId
  } else {
    for (let index = fromSlotIndex; index > clampedToSlotIndex; index -= 1) {
      nextCardIdsBySlot[index] = nextCardIdsBySlot[index - 1]
    }
    nextCardIdsBySlot[clampedToSlotIndex] = cardId
  }

  return {
    handKey,
    cardIdsBySlot: nextCardIdsBySlot,
  }
}

export function deriveVisibleOpponentHandSlots({
  player,
  playedCardIds,
  pendingVisibleCardIds,
  fallbackVisibleCount,
}: {
  player: Seat
  playedCardIds: string[]
  pendingVisibleCardIds: string[]
  fallbackVisibleCount: number
}) {
  const fallbackSlots = firstVisibleHandSlots(fallbackVisibleCount)
  const hasPositionedCards = playedCardIds.length > 0 || pendingVisibleCardIds.length > 0
  if (!hasPositionedCards) return fallbackSlots

  const visibleSlots = Array.from({ length: HAND_SLOT_COUNT }, () => true)

  for (const cardId of playedCardIds) {
    const slotIndex = handSlotIndexFromCardId(cardId, player)
    if (slotIndex === null) return fallbackSlots
    visibleSlots[slotIndex] = false
  }

  for (const cardId of pendingVisibleCardIds) {
    const slotIndex = handSlotIndexFromCardId(cardId, player)
    if (slotIndex === null) return fallbackSlots
    visibleSlots[slotIndex] = true
  }

  return visibleSlots
}
