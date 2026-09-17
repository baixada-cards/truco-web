// The figures the prose counts in, written inline. `<pts>3</pts>` is points
// or stakes (a hand worth three, a fold conceding one), `<score>11 × 11</score>`
// a match score. Both are quieter than a card: brass figures in the line, no
// bed and no rule, because a number is not an object on the table.
//
// A score keeps its two halves on one line and takes one spelling however the
// catalog writes it (`11x11`, `11 x 11`, `11 × 11`): see normalizeScore, which
// the catalog matcher runs too, so the DOM text and the catalog text meet.

import styles from './guide.module.css'
import { normalizeScore, tokenText } from './token-text'

export function PointsToken({ children }: { children: React.ReactNode }) {
  return <span className={styles.ptsTok}>{children}</span>
}

export function ScoreToken({ children }: { children: React.ReactNode }) {
  const text = tokenText(children)
  return <span className={styles.scoreTok}>{text === null ? children : normalizeScore(text)}</span>
}
