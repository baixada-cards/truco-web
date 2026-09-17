// A card, and a holding of cards, written inline in the prose. `<card>K</card>`
// sets one card as a small token; `<hand>5♣ Q 7</hand>` splits its text on
// whitespace and sets each card, which is also how a holding read from the
// solver export renders (`<hand>{strongestWorstHand}</hand>`): next-intl has
// already substituted the value by the time the tag is called.
//
// The spaces between a hand's cards are real text nodes, so the element's
// text stays "5♣ Q 7" and the copy editor still matches it to its key.

import { Fragment } from 'react'

import styles from './guide.module.css'
import { tokenText } from './token-text'

const SUITS = new Set(['♣', '♦', '♥', '♠'])

export function CardToken({ children }: { children: React.ReactNode }) {
  const text = tokenText(children)
  const suit = text?.slice(-1)
  return (
    <span className={styles.cardTok} data-suit={suit && SUITS.has(suit) ? suit : undefined}>
      {text ?? children}
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
