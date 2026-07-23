'use client'

// A real deal, not an abstract four-card baseline. The probability is always
// conditioned on the cards visible at this table: the vira and Mão's pinned
// H ≥ M ≥ L draft. Pé's three cards remain hidden.

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { DeckCard } from '../../components/farol/DeckCard'
import { DEFAULT_DECK_SYSTEM } from '../../lib/deck-system'
import type { Suit } from '../../components/farol/SpanishCard'
import styles from '../guide.module.css'

const RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'] as const
const TARGET = '3'
const SUITS: Suit[] = ['oros', 'espadas', 'copas']
const MANILHA_SUITS: Suit[] = ['oros', 'espadas', 'copas', 'bastos']
const RANK_VALUES: Record<(typeof RANKS)[number], number> = {
  '4': 4, '5': 5, '6': 6, '7': 7, Q: 10, J: 11, K: 12, A: 1, '2': 2, '3': 3,
}
type Rank = (typeof RANKS)[number]
type Card = { rank: Rank; suit?: Suit }
type Draft = [Card | null, Card | null, Card | null]

function manilhaRank(vira: Rank) {
  return RANKS[(RANKS.indexOf(vira) + 1) % RANKS.length]
}

function strength(card: Card, vira: Rank) {
  const manilha = RANKS[(RANKS.indexOf(vira) + 1) % RANKS.length]
  if (card.rank !== manilha) return RANKS.indexOf(card.rank)
  return RANKS.length + MANILHA_SUITS.indexOf(card.suit ?? 'oros')
}

function sortedDraft(draft: Draft, vira: Rank): Draft {
  const result = [...draft] as Draft
  const knownIndexes = result.map((card, index) => card === null ? -1 : index).filter((index) => index >= 0)
  const known = knownIndexes.map((index) => result[index]!).sort((a, b) => strength(b, vira) - strength(a, vira))
  knownIndexes.forEach((index, position) => { result[index] = known[position] })
  return result
}

function normalizeDraft(draft: Draft, vira: Rank): Draft {
  const manilha = manilhaRank(vira)
  const usedSuits = new Set<Suit>()
  return draft.map((card) => {
    if (card === null || card.rank !== manilha) return card === null ? null : { rank: card.rank }
    const suit = card.suit && !usedSuits.has(card.suit) ? card.suit : MANILHA_SUITS.find((candidate) => !usedSuits.has(candidate))!
    usedSuits.add(suit)
    return { rank: card.rank, suit }
  }) as Draft
}

function cardLabel(card: Card) {
  const glyph: Record<Suit, string> = { oros: '♦', espadas: '♠', copas: '♥', bastos: '♣' }
  return `${card.rank}${card.suit ? glyph[card.suit] : ''}`
}

function pickerChoices(vira: Rank): Card[] {
  return [...RANKS]
    .flatMap((rank) => rank === manilhaRank(vira)
      ? MANILHA_SUITS.map((suit) => ({ rank, suit }))
      : [{ rank }])
    .sort((a, b) => strength(b, vira) - strength(a, vira))
}

function chanceOpponentHasThree(hand: Draft, vira: Rank) {
  const known = hand.filter((card): card is Card => card !== null)
  const visibleThrees = known.filter((card) => card.rank === TARGET).length + (vira === TARGET ? 1 : 0)
  const remainingCards = 40 - 1 - known.length
  const remainingThrees = 4 - visibleThrees
  if (remainingThrees <= 0) return 0
  let noThree = 1
  for (let draw = 0; draw < 3; draw += 1) {
    noThree *= (remainingCards - remainingThrees - draw) / (remainingCards - draw)
  }
  return 1 - noThree
}

export function BlockerFigure() {
  const t = useTranslations('Study.guide.sec.ranges.blockerWidget')
  const [hand, setHand] = useState<Draft>([{ rank: '3' }, { rank: '3' }, null])
  const [vira, setVira] = useState<Rank>('3')
  const [menuSlot, setMenuSlot] = useState<number | null>(null)
  const [viraOpen, setViraOpen] = useState(false)
  const probability = chanceOpponentHasThree(hand, vira)

  function isAvailable(candidate: Card, except: number) {
    if (candidate.rank === manilhaRank(vira)) {
      return !hand.some((card, index) => index !== except && card?.rank === candidate.rank && card.suit === candidate.suit)
    }
    const visible = hand.filter((card, index) => index !== except && card?.rank === candidate.rank).length + (vira === candidate.rank ? 1 : 0)
    return visible < 4
  }

  function setSlot(slot: number, card: Card | null) {
    const next = [...hand] as Draft
    next[slot] = card
    setHand(sortedDraft(normalizeDraft(next, vira), vira))
    setMenuSlot(null)
  }

  function setTurnUp(rank: Rank) {
    setVira(rank)
    setHand((current) => sortedDraft(normalizeDraft(current, rank), rank))
    setViraOpen(false)
  }

  function moveSlot(from: number, to: number) {
    if (from === to || hand[from] === null) return
    const next = [...hand] as Draft
    ;[next[from], next[to]] = [next[to], next[from]]
    setHand(sortedDraft(normalizeDraft(next, vira), vira))
  }

  return (
    <figure className={styles.plate}>
      <div className={`${styles.figCanvas} ${styles.blockerFigure}`}>
        <div className={styles.blockerHead}>
          <span>{t('eyebrow')}</span>
          <strong>{t('question')}</strong>
        </div>
        <div className={styles.blockerTable}>
          <div className={styles.blockerSeatMao}>
            <span>{t('yourHand')}</span>
            <span className={styles.blockerOrder}>H ≥ M ≥ L</span>
            <div className={styles.blockerHand} aria-label={t('yourHand')}>
              {hand.map((rank, slot) => (
                <div
                  key={slot}
                  className={styles.blockerSlotAnchor}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    const raw = event.dataTransfer.getData('text/blocker-slot')
                    if (!raw) return
                    const from = Number(raw)
                    if (Number.isInteger(from)) moveSlot(from, slot)
                  }}
                >
                  <button
                    type="button"
                    className={styles.blockerSlot}
                    draggable={rank !== null}
                    aria-haspopup="menu"
                    aria-expanded={menuSlot === slot}
                    onDragStart={(event) => event.dataTransfer.setData('text/blocker-slot', String(slot))}
                    onClick={() => setMenuSlot((open) => open === slot ? null : slot)}
                  >
                    {rank === null ? <span>?</span> : <DeckCard system={DEFAULT_DECK_SYSTEM} rank={RANK_VALUES[rank.rank]} suit={rank.suit ?? SUITS[slot]} size="sm" />}
                  </button>
                  {menuSlot === slot ? (
                    <div role="menu" className={styles.blockerPicker} aria-label={t('chooseSlot', { slot: ['H', 'M', 'L'][slot] })}>
                      <button type="button" aria-pressed={rank === null} onClick={() => setSlot(slot, null)}>?</button>
                      {pickerChoices(vira).map((candidate) => (
                        <button key={cardLabel(candidate)} type="button" disabled={!isAvailable(candidate, slot)} aria-pressed={rank !== null && cardLabel(rank) === cardLabel(candidate)} onClick={() => setSlot(slot, candidate)}>{cardLabel(candidate)}</button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          <div className={styles.blockerCentre}>
            <span>{t('turnUp')}</span>
            <div className={styles.blockerViraAnchor}>
              <button type="button" className={styles.blockerVira} aria-haspopup="menu" aria-expanded={viraOpen} onClick={() => setViraOpen((open) => !open)}>
                <DeckCard system={DEFAULT_DECK_SYSTEM} rank={RANK_VALUES[vira]} suit="bastos" size="sm" />
              </button>
              {viraOpen ? (
                <div role="menu" className={styles.blockerPicker} aria-label={t('chooseTurnUp')}>
                  {RANKS.map((rank) => (
                    <button key={rank} type="button" disabled={rank === '2'} aria-pressed={rank === vira} onClick={() => setTurnUp(rank)}>{rank}</button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div className={styles.blockerSeatPe}>
            <span>{t('opponent')}</span>
            <div className={styles.blockerHand} aria-label={t('opponentHidden')}>
              {SUITS.map((suit) => <DeckCard key={suit} system={DEFAULT_DECK_SYSTEM} rank={1} suit={suit} size="sm" faceDown />)}
            </div>
          </div>
        </div>
        {(menuSlot !== null || viraOpen) ? <div className={styles.blockerBackdrop} onClick={() => { setMenuSlot(null); setViraOpen(false) }} /> : null}
        <div className={styles.blockerChance} role="status" aria-live="polite">
          <b>{(probability * 100).toFixed(1)}%</b>
          <span>{t('chance')}</span>
          <i style={{ width: `${probability * 100}%` }} aria-hidden />
        </div>
        <p className={styles.blockerTakeaway}>{t('takeaway')}</p>
      </div>
      <figcaption className={styles.plateCaption}><span className={styles.plateNo}>VII</span>{t('caption')}</figcaption>
    </figure>
  )
}
