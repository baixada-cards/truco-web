import type { DeckSystem } from '../../lib/deck-system'
import { useDeckSwitchAnimation } from './DeckSwitchAnimationContext'
import { FrenchCard, type FrenchRank, type FrenchSuit } from './FrenchCard'
import { SpanishCard, type CardSize, type Suit } from './SpanishCard'

const SPANISH_TO_FRENCH_SUIT: Record<Suit, FrenchSuit> = {
  oros: 'ouros',
  copas: 'copas',
  espadas: 'espadas',
  bastos: 'paus',
}

// Inverse of toFarolRank: sota (10) is the engine's Q, caballo (11) its J.
const SPANISH_TO_FRENCH_RANK: Record<number, FrenchRank> = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  10: 'Q',
  11: 'J',
  12: 'K',
}

export function DeckCard({
  system,
  rank,
  suit,
  size = 'md',
  faceDown = false,
  lost = false,
  isManilha = false,
  manilhaSuitStrength,
  className,
  style,
}: {
  system: DeckSystem
  rank: number
  suit: Suit
  size?: CardSize
  faceDown?: boolean
  lost?: boolean
  isManilha?: boolean
  manilhaSuitStrength?: 0 | 1 | 2 | 3
  className?: string
  style?: React.CSSProperties
}) {
  const { cardTransition } = useDeckSwitchAnimation()
  const shouldCrossDissolve =
    cardTransition != null &&
    cardTransition.previousSystem !== system

  const renderCard = (
    cardSystem: DeckSystem,
    renderedClassName?: string,
    renderedStyle?: React.CSSProperties,
  ) => {
    if (cardSystem === 'spanish') {
      return (
        <SpanishCard
          rank={rank}
          suit={suit}
          size={size}
          faceDown={faceDown}
          lost={lost}
          isManilha={isManilha}
          manilhaSuitStrength={manilhaSuitStrength}
          className={renderedClassName}
          style={renderedStyle}
        />
      )
    }

    return (
      <FrenchCard
        rank={SPANISH_TO_FRENCH_RANK[rank] ?? 1}
        suit={SPANISH_TO_FRENCH_SUIT[suit]}
        size={size}
        faceDown={faceDown}
        lost={lost}
        isManilha={isManilha}
        manilhaSuitStrength={manilhaSuitStrength}
        className={renderedClassName}
        style={renderedStyle}
      />
    )
  }

  if (!shouldCrossDissolve) {
    return renderCard(system, className, style)
  }

  return (
    <span
      className={['deck-card-system-fade', className ?? ''].filter(Boolean).join(' ')}
      data-deck-switch-run={cardTransition.runId}
      style={style}
    >
      <span className="deck-card-system-fade__layer deck-card-system-fade__layer--old" aria-hidden="true">
        {renderCard(cardTransition.previousSystem)}
      </span>
      <span className="deck-card-system-fade__layer deck-card-system-fade__layer--new">
        {renderCard(system)}
      </span>
    </span>
  )
}
