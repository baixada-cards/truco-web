import { useState } from 'react'
import type { DeckSystem } from '../../lib/deck-system'
import { DeckCard } from './DeckCard'
import { DeckLongPress } from './DeckLongPress'
import type { Suit } from './SpanishCard'
import './DeckWithVira.css'

interface DeckWithViraProps {
  deckSystem: DeckSystem
  vira: { rank: number; suit: Suit }
  onDeckSwitch?: (system: DeckSystem) => void
  onDeckClick?: () => void
  deckSwitchDurationMs?: number
  deckSwitching?: boolean
}

export function DeckWithVira({
  deckSystem,
  vira,
  onDeckSwitch,
  onDeckClick,
  deckSwitchDurationMs,
  deckSwitching = false,
}: DeckWithViraProps) {
  const [jitter] = useState(() => {
    const angle   = -90 + (Math.random() * 24 - 12)
    const offsetX = -26 + (Math.random() * 12 - 6)
    const offsetY =  24 + (Math.random() * 10 - 5)
    const flip    = Math.random() < 0.3 ? 180 : 0
    return { angle: angle + flip, offsetX, offsetY }
  })

  const deck = (
    <div className="deck-vira">
      <div
        className="deck-vira-card"
        style={{ left: jitter.offsetX, top: jitter.offsetY }}
      >
        <DeckCard
          system={deckSystem}
          rank={vira.rank}
          suit={vira.suit}
          size="md"
          style={{ transform: `rotate(${jitter.angle}deg)` }}
        />
      </div>
      <div className="deck-vira-stack">
        <DeckCard system={deckSystem} rank={1} suit="oros" size="md" faceDown style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-2deg)' }} />
        <DeckCard system={deckSystem} rank={1} suit="oros" size="md" faceDown style={{ position: 'absolute', top: 1, left: 2, transform: 'rotate(1deg)' }} />
        <DeckCard system={deckSystem} rank={1} suit="oros" size="md" faceDown style={{ position: 'absolute', top: 2, left: 4 }} />
      </div>
    </div>
  )

  return onDeckSwitch ? (
    <DeckLongPress
      currentSystem={deckSystem}
      onSwitch={onDeckSwitch}
      onClick={onDeckClick}
      switchDurationMs={deckSwitchDurationMs}
      isSwitching={deckSwitching}
    >
      {deck}
    </DeckLongPress>
  ) : deck
}
