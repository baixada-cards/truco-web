import { createContext, useContext } from 'react'

import type { DeckSystem } from '../../lib/deck-system'

type DeckSwitchCardTransition = {
  runId: number
  previousSystem: DeckSystem
} | null

export type DeckSwitchAnimationContextValue = {
  cardTransition: DeckSwitchCardTransition
}

export const DeckSwitchAnimationContext = createContext<DeckSwitchAnimationContextValue>({
  cardTransition: null,
})

export function useDeckSwitchAnimation() {
  return useContext(DeckSwitchAnimationContext)
}
