export const DECK_SYSTEMS = ['french', 'spanish'] as const

export type DeckSystem = typeof DECK_SYSTEMS[number]

export const DEFAULT_DECK_SYSTEM: DeckSystem = 'french'
export const MAX_DECK_PICKER_DISMISSALS = 3

export function isDeckSystem(value: unknown): value is DeckSystem {
  return value === 'french' || value === 'spanish'
}

export function nextDeckSystem(current: DeckSystem): DeckSystem {
  return current === 'french' ? 'spanish' : 'french'
}
