// Shared card display utilities used by LiveCard.tsx and LiveGame.tsx.

export type CardDisplay = {
  id: string
  rank: string
  suit: string
  hidden?: boolean
}

export function suitGlyph(suit: string) {
  switch (suit) {
    case 'SPADES': return '♠'
    case 'HEARTS': return '♥'
    case 'DIAMONDS': return '♦'
    case 'CLUBS': return '♣'
    default: return suit
  }
}
