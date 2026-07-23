'use client'

// Interactive rule plates for chapter I. The cards, walnut and scorekeeping
// deliberately come from the same Farol vocabulary as live play.

import { AnimatePresence, motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { Fragment, useEffect, useState } from 'react'

import { DeckCard } from '../../components/farol/DeckCard'
import { Peg } from '../../components/farol/Peg'
import { DEFAULT_DECK_SYSTEM } from '../../lib/deck-system'
import type { Suit } from '../../components/farol/SpanishCard'
import styles from '../guide.module.css'

const RANKS = [4, 5, 6, 7, 10, 11, 12, 1, 2, 3]
const RANK_LABELS: Record<number, string> = { 1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 10: 'Q', 11: 'J', 12: 'K' }
const STAKES = [1, 3, 6, 9, 12]
const MANILHA_SUITS: Suit[] = ['oros', 'espadas', 'copas', 'bastos']
const SUIT_SYMBOLS: Record<Suit, string> = { oros: '♦', espadas: '♠', copas: '♥', bastos: '♣' }
const FAN_POSITIONS = [
  { x: 0, y: 12, rotate: -15 },
  { x: 27, y: 3, rotate: -5 },
  { x: 54, y: 3, rotate: 5 },
  { x: 81, y: 12, rotate: 15 },
]

type Seat = 'mao' | 'pe'
type Trick = Seat | 'tie'
type HandResult = { winner: Seat; endRound: number } | null
type DealPhase = 'idle' | 'gather' | 'deal'

function PlateCaption({ no, children }: { no: string; children: React.ReactNode }) {
  const t = useTranslations('Study.guide')
  return (
    <figcaption className={styles.plateCaption}>
      <span className={styles.plateNo}>{t('plate', { no })}</span> {children}
    </figcaption>
  )
}

function useRulesTranslations() {
  const t = useTranslations('Study.guide')
  return (key: string, values?: Record<string, string | number>) => t(`sec.rules.${key}`, values)
}

function otherSeat(seat: Seat): Seat {
  return seat === 'mao' ? 'pe' : 'mao'
}

function resolveRounds(rounds: Array<Trick | null>): HandResult {
  const filled = rounds.filter((round): round is Trick => round !== null)
  if (filled.length < 2) return null
  const wins = (seat: Seat) => filled.filter((round) => round === seat).length
  if (wins('mao') === 2) return { winner: 'mao', endRound: filled.length }
  if (wins('pe') === 2) return { winner: 'pe', endRound: filled.length }
  if (filled.length === 2) {
    if (wins('mao') === 1 && filled.includes('tie')) return { winner: 'mao', endRound: 2 }
    if (wins('pe') === 1 && filled.includes('tie')) return { winner: 'pe', endRound: 2 }
    return null
  }
  if (wins('mao') === 1 && wins('pe') === 1 && filled[2] === 'tie') return { winner: filled.find((round) => round !== 'tie') as Seat, endRound: 3 }
  if (wins('mao') === 1 && wins('pe') === 0) return { winner: 'mao', endRound: 3 }
  if (wins('pe') === 1 && wins('mao') === 0) return { winner: 'pe', endRound: 3 }
  return { winner: 'mao', endRound: 3 }
}

function resolvePlayedRounds(rounds: Array<Trick | null>): HandResult {
  for (let endRound = 2; endRound <= rounds.length; endRound += 1) {
    const result = resolveRounds(rounds.slice(0, endRound))
    if (result) return result
  }
  return null
}

export function ManilhaPlate() {
  const t = useRulesTranslations()
  const [viraIndex, setViraIndex] = useState(0)
  const vira = RANKS[viraIndex]
  const manilha = RANKS[(viraIndex + 1) % RANKS.length]
  const manilhaIndex = RANKS.indexOf(manilha)

  return (
    <figure className={styles.plate}>
      <div className={`${styles.strengthPlate} walnut`} role="group" aria-label={t('rulesVisual.manilha.aria')}>
        <div className={styles.strengthHead}>
          <span>{t('rulesVisual.manilha.order')}</span>
          <span>{t('rulesVisual.manilha.low')}</span>
          <span className={styles.strengthRule} aria-hidden />
          <span>{t('rulesVisual.manilha.high')}</span>
        </div>
        <div className={styles.strengthLayout}>
          <div className={styles.strengthRail}>
            {RANKS.map((rank) => {
              const isManilha = rank === manilha
              const isVira = rank === vira
              const rankIndex = RANKS.indexOf(rank)
              return isVira ? (
                <motion.div key={rank} layout className={styles.strengthViraDock} role="img" aria-label={t('rulesVisual.manilha.viraCard', { rank: RANK_LABELS[vira] })} transition={{ type: 'spring', stiffness: 420, damping: 28 }}>
                  <span className={styles.strengthViraLabel}>{t('rulesVisual.manilha.vira')}</span>
                  <span key={vira} className={styles.strengthViraSource} aria-hidden>
                    <span className={styles.strengthViraCard}>
                      <DeckCard system={DEFAULT_DECK_SYSTEM} rank={vira} suit="oros" size="md" />
                    </span>
                    <span className={styles.strengthViraStack}>
                      <DeckCard system={DEFAULT_DECK_SYSTEM} rank={1} suit="oros" size="md" faceDown />
                      <DeckCard system={DEFAULT_DECK_SYSTEM} rank={1} suit="oros" size="md" faceDown />
                      <DeckCard system={DEFAULT_DECK_SYSTEM} rank={1} suit="oros" size="md" faceDown />
                    </span>
                  </span>
                </motion.div>
              ) : isManilha ? (
                <div key={rank} className={styles.strengthMark} aria-label={t('rulesVisual.manilha.manilhaCard', { rank: RANK_LABELS[rank] })}>
                  <span>{RANK_LABELS[rank]}</span>
                </div>
              ) : (
                <motion.div
                  layoutId={`rank-${rank}`}
                  layout
                  key={rank}
                  className={styles.strengthCard}
                  transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                >
                  <motion.button
                    type="button"
                    aria-pressed={false}
                    aria-label={t('rulesVisual.manilha.viraCard', { rank: RANK_LABELS[rank] })}
                    onMouseDown={(event) => event.currentTarget.blur()}
                    onClick={() => setViraIndex(rankIndex)}
                    whileHover={{ y: -7, rotate: rankIndex % 2 === 0 ? -2 : 2 }}
                    whileTap={{ y: -2, scale: 0.97 }}
                  >
                    <span className={styles.strengthCardLabel}>{RANK_LABELS[rank]}</span>
                    <DeckCard system={DEFAULT_DECK_SYSTEM} rank={rank} suit="oros" size="sm" />
                  </motion.button>
                </motion.div>
              )
            })}
          </div>
          <div className={styles.manilhaDock} aria-label={t('rulesVisual.manilha.manilhaCard', { rank: RANK_LABELS[manilha] })}>
            <div className={styles.manilhaDockHead}>{t('rulesVisual.manilha.manilhas')}</div>
            <div className={styles.manilhaFan}>
              <AnimatePresence initial={false}>
                {MANILHA_SUITS.map((suit, index) => {
                  const position = FAN_POSITIONS[index]
                  return (
                    <motion.button
                      key={`${manilha}-${suit}`}
                      layoutId={suit === 'oros' ? `rank-${manilha}` : undefined}
                      type="button"
                      className={styles.manilhaDockCard}
                      aria-label={t('rulesVisual.manilha.viraCard', { rank: RANK_LABELS[manilha] })}
                      onMouseDown={(event) => event.currentTarget.blur()}
                      onClick={() => setViraIndex(manilhaIndex)}
                      initial={suit === 'oros' ? false : { opacity: 0, x: -42, y: 8, rotate: 0 }}
                      animate={{ opacity: 1, ...position }}
                      exit={{ opacity: 0, x: -42, y: 8, rotate: 0 }}
                      style={{ zIndex: index }}
                      transition={{ type: 'spring', stiffness: 360, damping: 27, delay: index * 0.07 }}
                    >
                      <span className={styles.manilhaCardLabel}>{RANK_LABELS[manilha]}{SUIT_SYMBOLS[suit]}</span>
                      <DeckCard system={DEFAULT_DECK_SYSTEM} rank={manilha} suit={suit} size="sm" isManilha manilhaSuitStrength={index as 0 | 1 | 2 | 3} />
                    </motion.button>
                  )
                })}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
      <PlateCaption no="I">{t('rulesVisual.manilha.caption')}</PlateCaption>
    </figure>
  )
}

export function TiePlate() {
  const t = useRulesTranslations()
  const [rounds, setRounds] = useState<Array<Trick | null>>(['mao', 'pe', 'mao'])
  const [blockedRound, setBlockedRound] = useState<number | null>(null)
  const result = resolvePlayedRounds(rounds)

  function choose(roundIndex: number, outcome: Trick) {
    const settledBeforeThisRound = resolvePlayedRounds(rounds.slice(0, roundIndex))
    if (settledBeforeThisRound) {
      setBlockedRound(roundIndex + 1)
      return
    }
    setBlockedRound(null)
    setRounds((current) => {
      const next = current.map((round, index) => (index === roundIndex ? outcome : round))
      const settled = resolvePlayedRounds(next)
      return settled ? next.map((round, index) => (index >= settled.endRound ? null : round)) : next
    })
  }

  return (
    <figure className={styles.plate}>
      <div className={styles.tiePlate}>
        <div className={styles.roundEditor} aria-label={t('rulesVisual.tie.aria')}>
          {rounds.map((round, index) => {
            return (
              <fieldset key={index} className={styles.roundPicker}>
                <legend>{t('rulesVisual.tie.round', { no: index + 1 })}</legend>
                {(['mao', 'tie', 'pe'] as const).map((outcome) => (
                  <button
                    key={outcome}
                    type="button"
                    className={`${styles.roundChoice}${round === outcome ? ` ${styles.roundChoiceOn}` : ''}`}
                    aria-pressed={round === outcome}
                    onMouseDown={(event) => event.currentTarget.blur()}
                    onClick={() => choose(index, outcome)}
                  >
                    {t(`rulesVisual.tie.${outcome}`)}
                  </button>
                ))}
                {index === 2 ? (
                  <AnimatePresence>
                    {blockedRound !== null && result ? (
                      <motion.div
                        className={styles.tieHint}
                        role="status"
                        initial={{ opacity: 0, y: -5, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.98 }}
                        transition={{ duration: 0.18 }}
                      >
                        <span>{t('rulesVisual.tie.notPlayed', { no: blockedRound, winner: t(`rulesVisual.tie.${result.winner}`), endRound: result.endRound })}</span>
                        <button type="button" onClick={() => setBlockedRound(null)} aria-label={t('rulesVisual.tie.dismiss')}>×</button>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                ) : null}
              </fieldset>
            )
          })}
        </div>
        <div className={styles.tieResult} role="status" aria-live="polite">
          {result ? (
            <>
              <span>{t('rulesVisual.tie.handWinner')}</span>
              <strong>{t(`rulesVisual.tie.${result.winner}`)}</strong>
              <p>{t('rulesVisual.tie.resolved', { no: result.endRound })}</p>
            </>
          ) : (
            <p>{t('rulesVisual.tie.chooseResult')}</p>
          )}
        </div>
      </div>
      <PlateCaption no="II">{t('rulesVisual.tie.caption')}</PlateCaption>
    </figure>
  )
}

export function FaceDownPlate() {
  const t = useRulesTranslations()
  const [faceDown, setFaceDown] = useState(true)
  const faceDownWinner: Seat = faceDown ? 'mao' : 'pe'

  useEffect(() => {
    const firstFlip = window.setTimeout(() => setFaceDown(false), 850)
    const interval = window.setInterval(() => setFaceDown((current) => !current), 2200)
    return () => {
      window.clearTimeout(firstFlip)
      window.clearInterval(interval)
    }
  }, [])

  return (
    <figure className={styles.plate}>
      <div className={`${styles.hidePlate} walnut`} role="status" aria-live="polite">
        <div className={`${styles.hideSeat}${faceDownWinner === 'pe' ? ` ${styles.hideWinner}` : ` ${styles.hideLoser}`}`}>
          <span>{t('rulesVisual.tie.pe')}</span>
          <div className={`${styles.hideFlip}${faceDown ? '' : ` ${styles.hideFlipUp}`}`}>
            <span className={styles.hideBack}><DeckCard system={DEFAULT_DECK_SYSTEM} rank={3} suit="oros" size="sm" faceDown /></span>
            <span className={styles.hideFace}><DeckCard system={DEFAULT_DECK_SYSTEM} rank={3} suit="oros" size="sm" /></span>
          </div>
        </div>
        <div className={styles.hideAgainst}>×</div>
        <div className={`${styles.hideSeat}${faceDownWinner === 'mao' ? ` ${styles.hideWinner}` : ` ${styles.hideLoser}`}`}>
          <span>{t('rulesVisual.tie.mao')}</span>
          <DeckCard system={DEFAULT_DECK_SYSTEM} rank={4} suit="espadas" size="sm" />
        </div>
        <p>{t('rulesVisual.faceDown.stable')}</p>
      </div>
      <PlateCaption no="III">{t('rulesVisual.faceDown.caption')}</PlateCaption>
    </figure>
  )
}

export function StakesPlate() {
  const t = useRulesTranslations()
  const [accepted, setAccepted] = useState(0)
  const [pending, setPending] = useState<number | null>(null)
  const [lastRaiser, setLastRaiser] = useState<Seat>('pe')
  const [scores, setScores] = useState<Record<Seat, number>>({ mao: 0, pe: 0 })
  const [dealPhase, setDealPhase] = useState<DealPhase>('idle')
  const responder = otherSeat(lastRaiser)
  const currentStake = pending === null ? STAKES[accepted] : STAKES[pending]
  const foldStake = pending === null ? STAKES[accepted] : STAKES[pending - 1]

  function raise(player: Seat, step: number) {
    setLastRaiser(player)
    setPending(step)
  }

  function accept() {
    if (pending === null) return
    setAccepted(pending)
    setPending(null)
  }

  function settle(winner: Seat, stake: number) {
    if (dealPhase !== 'idle') return
    setScores((current) => ({ ...current, [winner]: Math.min(12, current[winner] + stake) }))
    setPending(null)
    setAccepted(0)
    setLastRaiser('pe')
    setDealPhase('gather')
  }

  useEffect(() => {
    if (dealPhase === 'idle') return
    const timer = window.setTimeout(() => setDealPhase(dealPhase === 'gather' ? 'deal' : 'idle'), dealPhase === 'gather' ? 320 : 980)
    return () => window.clearTimeout(timer)
  }, [dealPhase])

  function SeatMenu({ seat, className }: { seat: Seat; className?: string }) {
    const player = t(`rulesVisual.tie.${seat}`)
    const canRaise = pending === null && accepted < STAKES.length - 1 && (accepted === 0 ? seat === 'mao' : seat === responder)

    if (dealPhase !== 'idle' || (pending !== null && seat !== responder)) return null

    return (
      <div className={[styles.tableMenu, className].filter(Boolean).join(' ')} role="menu" aria-label={t('rulesVisual.stakes.actionsAria', { player })}>
        {pending !== null && seat === responder ? (
          <>
            {pending < STAKES.length - 1 ? <button type="button" role="menuitem" onClick={() => raise(seat, pending + 1)}>{t('rulesVisual.stakes.reraise', { stake: STAKES[pending + 1] })}</button> : null}
            <button type="button" role="menuitem" onClick={() => settle(lastRaiser, foldStake)}>{t('rulesVisual.stakes.fold', { stake: foldStake })}</button>
            <button type="button" role="menuitem" onClick={accept}>{t('rulesVisual.stakes.accept', { stake: STAKES[pending] })}</button>
          </>
        ) : pending === null ? (
          <>
            {canRaise ? <button type="button" role="menuitem" onClick={() => raise(seat, accepted + 1)}>{t('rulesVisual.stakes.raiseShort', { from: currentStake, to: STAKES[accepted + 1] })}</button> : null}
            <button type="button" role="menuitem" onClick={() => settle(seat, currentStake)}>{t('rulesVisual.stakes.winHandShort')}</button>
          </>
        ) : null}
      </div>
    )
  }

  return (
    <figure className={styles.plate}>
      <div className={`${styles.raiseTable} walnut${dealPhase === 'gather' ? ` ${styles.tableGathering}` : dealPhase === 'deal' ? ` ${styles.tableDistributing}` : ''}`}>
        <div className={styles.tableScores} aria-label={t('rulesVisual.stakes.scoreAria')}>
          {(['mao', 'pe'] as const).map((seat, index) => (
            <Fragment key={seat}>
              <div className={`${styles.tableScoreSide} ${seat === 'mao' ? styles.tableScoreMao : styles.tableScorePe}`}>
                <span>{t(`rulesVisual.tie.${seat}`)}</span>
                <strong>{scores[seat]}</strong>
                <i aria-hidden>{Array.from({ length: scores[seat] }).map((_, scoreIndex) => <em key={scoreIndex} />)}</i>
              </div>
              {index === 0 ? <span className={styles.tableScoreVs} aria-hidden>·</span> : null}
            </Fragment>
          ))}
          <span className={styles.tableScoreGoal}>{t('rulesVisual.stakes.to', { score: 12 })}</span>
        </div>
        <div className={styles.tableSeatPe}>
          <div className={styles.tableBubbleSlot}>{pending !== null && lastRaiser === 'pe' ? <div className={styles.tableBubble}>{t('rulesVisual.stakes.raiseShort', { from: STAKES[pending - 1], to: currentStake })}</div> : null}</div>
          <div className={styles.tablePlayer}>
            <div className={styles.tableSeatHit}>
              <span>{t('rulesVisual.tie.pe')}</span><div className={styles.tableHand} aria-hidden>{[0, 1, 2].map((card) => <DeckCard key={card} system={DEFAULT_DECK_SYSTEM} rank={1} suit="oros" size="sm" faceDown />)}</div>
            </div>
            <SeatMenu seat="pe" className={styles.tableMenuSeat} />
          </div>
        </div>
        <div className={styles.tableCentre}>
          {dealPhase === 'idle' ? (
            <div className={styles.tableStakeValue} aria-label={t('rulesVisual.stakes.currentStake', { stake: currentStake })}><Peg value={currentStake} state={pending === null ? 'idle' : 'pending'} size={50} /></div>
          ) : (
            <div className={styles.tableDealDeck} aria-hidden>{[0, 1, 2].map((card) => <span key={card}><DeckCard system={DEFAULT_DECK_SYSTEM} rank={1} suit="oros" size="sm" faceDown /></span>)}</div>
          )}
        </div>
        <div className={styles.tableSeatMao}>
          <div className={styles.tablePlayer}>
            <div className={styles.tableSeatHit}>
              <span>{t('rulesVisual.tie.mao')}</span><div className={styles.tableHand} aria-hidden>{[0, 1, 2].map((card) => <DeckCard key={card} system={DEFAULT_DECK_SYSTEM} rank={1} suit="oros" size="sm" faceDown />)}</div>
            </div>
            <SeatMenu seat="mao" className={styles.tableMenuSeat} />
          </div>
          <div className={styles.tableBubbleSlot}>{pending !== null && lastRaiser === 'mao' ? <div className={styles.tableBubble}>{t('rulesVisual.stakes.raiseShort', { from: STAKES[pending - 1], to: currentStake })}</div> : null}</div>
        </div>
        <div className={styles.tableControls}>
          <SeatMenu seat="pe" className={styles.tableMenuCompact} />
          <SeatMenu seat="mao" className={styles.tableMenuCompact} />
        </div>
      </div>
      <PlateCaption no="IV">{t('rulesVisual.stakes.caption')}</PlateCaption>
    </figure>
  )
}


const ELEVEN_CHOICE_HAND: Array<{ rank: number; suit: Suit }> = [
  { rank: 2, suit: 'copas' },
  { rank: 11, suit: 'oros' },
  { rank: 4, suit: 'bastos' },
]
const ELEVEN_AUTO_HAND: Array<{ rank: number; suit: Suit }> = [
  { rank: 3, suit: 'espadas' },
  { rank: 7, suit: 'copas' },
  { rank: 5, suit: 'oros' },
]

function ElevenMiniHand({ cards }: { cards: Array<{ rank: number; suit: Suit }> }) {
  return (
    <div className={styles.elevenHand} aria-hidden>
      {cards.map((card) => (
        <DeckCard key={`${card.rank}-${card.suit}`} system={DEFAULT_DECK_SYSTEM} rank={card.rank} suit={card.suit} size="sm" />
      ))}
    </div>
  )
}

export function ElevenPlate() {
  const t = useRulesTranslations()
  return (
    <figure className={styles.plate}>
      <div className={`${styles.elevenPlate} walnut`} role="img" aria-label={t('rulesVisual.eleven.aria')}>
        <div className={styles.elevenSplit}>
          <div className={styles.elevenPanel}>
            <div className={styles.elevenScoreHead}>11 <i>×</i> 7</div>
            <div className={styles.elevenPanelSub}>{t('rulesVisual.eleven.chooseSub')}</div>
            <ElevenMiniHand cards={ELEVEN_CHOICE_HAND} />
            <div className={styles.elevenNotes}>
              <p><i aria-hidden>→</i> {t('rulesVisual.eleven.acceptNote')}</p>
              <p><i aria-hidden>→</i> {t('rulesVisual.eleven.foldNote')}</p>
            </div>
          </div>
          <div className={styles.elevenPanel}>
            <div className={styles.elevenScoreHead}>11 <i>×</i> 11</div>
            <div className={styles.elevenPanelSub}>{t('rulesVisual.eleven.autoSub')}</div>
            <ElevenMiniHand cards={ELEVEN_AUTO_HAND} />
            <div className={styles.elevenNotes}>
              <p><i aria-hidden>→</i> {t('rulesVisual.eleven.autoNote')}</p>
              <p><i aria-hidden>→</i> {t('rulesVisual.eleven.ironHand')}</p>
            </div>
          </div>
        </div>
        <div className={styles.elevenLadderStrip}>
          <div className={styles.elevenPegs} aria-hidden>
            {STAKES.map((stake) => (
              <span key={stake} className={stake === 3 ? styles.elevenLivePeg : styles.elevenLockedPeg}>
                <Peg value={stake} state={stake === 3 ? 'pending' : 'past'} size={34} />
              </span>
            ))}
          </div>
          <span className={styles.elevenLockLabel}>{t('rulesVisual.eleven.lockedNote')}</span>
        </div>
      </div>
      <PlateCaption no="V">{t('rulesVisual.eleven.caption')}</PlateCaption>
    </figure>
  )
}

const MATCH_SCORES: Record<Seat, number> = { pe: 11, mao: 9 }

// All 12 positions of the match are carved as a faint skeleton (two
// five-bar gates plus a pair); earned points cut bright strokes over it,
// so "out of 12" is the shape of the tally itself. Within a gate the four
// bars earn first, the diagonal closes it as the fifth.
function CarvedTally({ score }: { score: number }) {
  const groups = [5, 5, 2]
  let start = 0
  return (
    <span className={styles.matchStrokes}>
      {groups.map((size, group) => {
        const groupStart = start
        start += size
        const bars = size === 5 ? 4 : size
        return (
          <span key={group} className={styles.matchGate}>
            {Array.from({ length: bars }).map((_, bar) => (
              <i key={bar} className={score > groupStart + bar ? styles.matchCut : styles.matchFaint} />
            ))}
            {size === 5 ? (
              <em className={`${styles.matchDiag} ${score >= groupStart + 5 ? styles.matchCut : styles.matchFaint}`} />
            ) : null}
          </span>
        )
      })}
    </span>
  )
}

export function MatchPlate() {
  const t = useRulesTranslations()
  return (
    <figure className={styles.plate}>
      <div className={`${styles.matchPlate} walnut`} role="img" aria-label={t('rulesVisual.match.aria')}>
        {(['pe', 'mao'] as const).map((seat) => (
          <div key={seat} className={styles.matchRow}>
            <span className={styles.matchName}>{t(`rulesVisual.tie.${seat}`)}</span>
            <strong className={styles.matchScore}>
              {MATCH_SCORES[seat]}
              <span>/12</span>
            </strong>
            <div className={styles.matchTally} aria-hidden>
              <CarvedTally score={MATCH_SCORES[seat]} />
            </div>
          </div>
        ))}
      </div>
      <PlateCaption no="VI">{t('rulesVisual.match.caption')}</PlateCaption>
    </figure>
  )
}
