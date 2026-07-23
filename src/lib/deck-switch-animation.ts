export const DECK_SWITCH_ANIMATION_STORAGE_KEY = 'farol-dev-deck-switch-animation'

export const DEFAULT_DECK_SWITCH_ANIMATION = 'dissolve'

export const DECK_SWITCH_ANIMATION_OPTIONS = [
  {
    id: 'dissolve',
    label: 'Dissolve',
    summary: 'All visible cards cross-dissolve with a quiet deck glow.',
  },
  {
    id: 'lamp',
    label: 'Lamp blink',
    summary: 'The table dims, swaps during the dark beat, then relights.',
  },
] as const

export type DeckSwitchAnimation = typeof DECK_SWITCH_ANIMATION_OPTIONS[number]['id']

export function isDeckSwitchAnimation(value: unknown): value is DeckSwitchAnimation {
  return DECK_SWITCH_ANIMATION_OPTIONS.some((option) => option.id === value)
}
