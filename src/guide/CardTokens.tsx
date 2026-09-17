// A card, and a holding of cards, written inline in the prose. `<card>K</card>`
// sets one card as a small token; `<hand>5♣ Q 7</hand>` splits its text on
// whitespace and sets each card, which is also how a holding read from the
// solver export renders (`<hand>{strongestWorstHand}</hand>`): next-intl has
// already substituted the value by the time the tag is called.
//
// In this notation a plain card is a rank with no suit, and a manilha is
// identified by its suit alone: the same white card face, showing only the
// suit, in the suit's own colour and sized to the width of a rank card. A
// card whose text is a bare suit, `<card>♣</card>`; an m and a suit,
// `<card>m♣</card>` (the old spelling, kept as an alias since the formulas
// still write it); or a rank and a suit, `<card>5♣</card>` (a solver label,
// or a card inside a `<hand>`): all three are the manilha of that suit and
// render the same suit-only face. normalizeCard folds all three to the bare
// suit, so renderedCatalogText writes the same text into any of them and the
// copy editor still matches the paragraph to its key.
//
// The spaces between a hand's cards are real text nodes too, so a holding's
// text stays "5♣ Q 7" even where the manilha inside it renders as "♣".

import { Fragment } from 'react'

import styles from './guide.module.css'
import { manilhaSuit, tokenText } from './token-text'

const SUITS = new Set(['♣', '♦', '♥', '♠'])

export function CardToken({ children }: { children: React.ReactNode }) {
  const text = tokenText(children)
  const suit = text?.slice(-1)
  const manilha = text == null ? null : manilhaSuit(text)
  return (
    <span
      className={manilha ? `${styles.cardTok} ${styles.manilhaTok}` : styles.cardTok}
      data-suit={suit && SUITS.has(suit) ? suit : undefined}
    >
      {manilha ?? (text ?? children)}
    </span>
  )
}

export function HandToken({ children }: { children: React.ReactNode }) {
  const text = tokenText(children)
  const cards = text?.split(/\s+/).filter(Boolean)
  if (!cards) return <span className={styles.handTok}>{children}</span>
  return (
    <span className={styles.handTok}>
      {cards.map((card, index) => (
        // cards have no identity beyond their place in the holding
        <Fragment key={index}>
          {index > 0 ? ' ' : null}
          <CardToken>{card}</CardToken>
        </Fragment>
      ))}
    </span>
  )
}
