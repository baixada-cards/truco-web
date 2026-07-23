import type { Suit } from './SpanishCard'

const RANK_CYCLE = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'] as const

export function nextManilhaRank(turnupRank: string): string | null {
  const idx = RANK_CYCLE.indexOf(turnupRank as typeof RANK_CYCLE[number])
  if (idx < 0) return null
  return RANK_CYCLE[(idx + 1) % RANK_CYCLE.length]
}

// Truco paulista manilha order, ascending: ouros < espadilha < copas < zap.
// Must match STRENGTH_SUIT_ORDER in src/lib/strength-guide.ts.
export const MANILHA_SUIT_STRENGTH: Record<string, 0 | 1 | 2 | 3> = {
  DIAMONDS: 0,
  SPADES: 1,
  HEARTS: 2,
  CLUBS: 3,
}

export function toFarolSuit(suit: string): Suit {
  switch (suit) {
    case 'SPADES': return 'espadas'
    case 'CLUBS':  return 'bastos'
    case 'HEARTS': return 'copas'
    default:       return 'oros'
  }
}

// Engine court order is Q < J < K (truco paulista), which maps onto the
// Spanish deck as sota (10) < caballo (11) < rey (12).
export function toFarolRank(rank: string): number {
  switch (rank) {
    case 'A': return 1
    case 'Q': return 10
    case 'J': return 11
    case 'K': return 12
    default:  return parseInt(rank, 10) || 1
  }
}
