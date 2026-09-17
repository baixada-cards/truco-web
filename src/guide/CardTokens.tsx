// A card, and a holding of cards, written inline in the prose. `<card>K</card>`
// sets one card as a small token; `<hand>5♣ Q 7</hand>` splits its text on
// whitespace and sets each card, which is also how a holding read from the
// solver export renders (`<hand>{strongestWorstHand}</hand>`): next-intl has
// already substituted the value by the time the tag is called.
//
// A card whose text is a bare suit, `<card>♣</card>`, or an m and a suit,
// `<card>m♣</card>`, is the manilha of that suit: the same card face, showing
// the suit large in the suit's own colour under a small m in the corner. The
// m is a real text node in both spellings, so the element's text is "m♣"
// either way — and renderedCatalogText writes the same m into a bare suit, so
// the copy editor still matches the paragraph to its key.
//
// The spaces between a hand's cards are real text nodes too, so a holding's
// text stays "5♣ Q 7".

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
      {manilha ? (
        <>
          <span className={styles.manilhaMark}>m</span>
          {manilha}
        </>
      ) : (
        (text ?? children)
      )}
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
