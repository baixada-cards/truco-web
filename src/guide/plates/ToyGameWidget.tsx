'use client'

// Plate I — the toy game that solving is taught on (plan 77 J-1, M).
//
// Final round, real stakes: mão leads a plain 3; pé holds the top manilha
// (m♣ = 5♣ under v4) or a dead 4, and either raises truco (1 → 3) or just
// plays (mão's 3 beats the 4 for the base point). On a raise mão calls or
// folds. Fold concedes the base stake (1); calling plays for 3.
//
// ONE STEP = ONE NODE, AND YOU STAND *AT* IT.
//
// That is the whole discipline. At a node, everything that led there has
// happened and the node's own move has NOT: park on the DEAL and the deck is
// shuffled but nothing is dealt, because the deal is the chance node's EDGE,
// not the node. Press on and that edge is taken — cards fly out, the vira
// turns up, mão leads his fixed 3 — and you land on pé, holding, deciding.
// Press on again and pé's choice is revealed as you leave him.
//
//   deal  → the deck is shuffled; nothing dealt yet
//   pé    → dealt, vira up, mão has led; pé holds his card, about to speak
//   mão   → pé has raised; mão holds the answer          (raise lines only)
//   leaf  → the answer is given, cards are shown, the hand is scored
//
// Everything that is not a branch — gathering, riffling, dealing, leading,
// laying a card down at the showdown — autoplays inside the step it belongs
// to. Cards are held face DOWN and turn over only as they are played.
// Stepping back off the leaf un-scores the hand; stepping back to the DEAL
// re-shuffles it, because that is where the chance move lives.

import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'

import { DeckCard } from '../../components/farol/DeckCard'
import { DeckWithVira } from '../../components/farol/DeckWithVira'
import { DEFAULT_DECK_SYSTEM } from '../../lib/deck-system'
import styles from '../guide.module.css'

function MiniCardChip({
  x,
  y,
  rank,
  suit,
  manilha = false,
  lit = false,
}: {
  x: number
  y: number
  rank: string
  suit: '♣' | '♠' | '♥' | '♦'
  manilha?: boolean
  lit?: boolean
}) {
  const red = suit === '♥' || suit === '♦'
  const suitColor = red
    ? 'var(--suit-red, #a23c2c)'
    : suit === '♣'
      ? 'var(--suit-green, #3f6b2e)'
      : 'var(--suit-black, #1e1a14)'
  const bodyCls = [styles.toyChip, manilha ? styles.toyChipManilha : '', lit ? styles.toyChipOn : '']
    .filter(Boolean)
    .join(' ')
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect width={24} height={32} rx={3} className={bodyCls} />
      <text x={4} y={12} className={styles.toyChipRank} style={{ fill: suitColor }}>
        {rank}
      </text>
      <text x={12} y={25} textAnchor="middle" className={styles.toyChipSuit} style={{ fill: suitColor }}>
        {suit}
      </text>
    </g>
  )
}

function Edge({
  x1,
  y1,
  x2,
  y2,
  actor,
  on,
}: {
  x1: number
  y1: number
  x2: number
  y2: number
  actor: 'chance' | 'pe' | 'mao'
  on: boolean
}) {
  const colour =
    actor === 'pe' ? styles.toyEdgePe : actor === 'mao' ? styles.toyEdgeMao : styles.toyEdgeChance
  return (
    <>
      <line x1={x1} y1={y1} x2={x2} y2={y2} className={styles.toyEdgeBase} />
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        pathLength={1}
        className={`${styles.toyEdgeDraw} ${colour}${on ? ` ${styles.toyEdgeOn}` : ''}`}
      />
    </>
  )
}

const BLUFF_FREQ = 0.5
const CALL_FREQ = 0.5
const TARGET_SHARE = 2 / 3

/** the nodes of this tree — and nothing else earns an arrow press */
type Node = 'deal' | 'pe' | 'mao' | 'leaf'
/** beats that autoplay inside a step: animation, never a branch */
type Sub = 'gather' | 'shuffled' | 'dealing' | 'led' | 'playing' | 'scored'
type Spot = 'deck' | 'hand' | 'table'

interface ToyPath {
  hand: 'm' | '4'
  peAction: 'raise' | 'give'
  maoAction: 'call' | 'fold' | null
}

function samplePath(): ToyPath {
  const hand = Math.random() < 0.5 ? 'm' : '4'
  const peAction = hand === 'm' ? 'raise' : Math.random() < BLUFF_FREQ ? 'raise' : 'give'
  const maoAction = peAction === 'raise' ? (Math.random() < CALL_FREQ ? 'call' : 'fold') : null
  return { hand, peAction, maoAction }
}

function handResult(p: ToyPath): { winner: 'mao' | 'pe'; stake: number } {
  if (p.peAction === 'give') return { winner: 'mao', stake: 1 }
  if (p.maoAction === 'fold') return { winner: 'pe', stake: 1 }
  if (p.hand === 'm') return { winner: 'pe', stake: 3 }
  return { winner: 'mao', stake: 3 }
}

function nodesOf(p: ToyPath): Node[] {
  return p.peAction === 'give' ? ['deal', 'pe', 'leaf'] : ['deal', 'pe', 'mao', 'leaf']
}

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function tallyOf(hands: ToyPath[]) {
  let raises = 0
  let manilhaRaises = 0
  let mao = 0
  let pe = 0
  for (const h of hands) {
    if (h.peAction === 'raise') {
      raises += 1
      if (h.hand === 'm') manilhaRaises += 1
    }
    const r = handResult(h)
    if (r.winner === 'mao') mao += r.stake
    else pe += r.stake
  }
  return { hands: hands.length, raises, manilhaRaises, mao, pe }
}

export function ToyGameWidget() {
  const t = useTranslations('Study.guide')
  const tt = useTranslations('Study.terms')
  const [done, setDone] = useState<ToyPath[]>([])
  const [path, setPath] = useState<ToyPath | null>(null)
  const [idx, setIdx] = useState(0)
  const [sub, setSub] = useState<Sub | null>(null)
  const timers = useRef<number[]>([])
  const [deckMounted, setDeckMounted] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => setDeckMounted(true), [])
  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), [])

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
  }

  /** each node's own autoplay: what settles once you arrive there */
  const arrive = useCallback((p: ToyPath, i: number) => {
    clearTimers()
    const node = nodesOf(p)[i]
    const quick = reducedMotion()
    if (node === 'deal') {
      // parked ON the chance node: gather, riffle — and stop. Nothing dealt.
      if (quick) return setSub('shuffled')
      setSub('gather')
      timers.current.push(window.setTimeout(() => setSub('shuffled'), 430))
      return
    }
    if (node === 'pe') {
      // the chance edge is taken on the way in: deal, turn the vira up, lead
      if (quick) return setSub('led')
      setSub('dealing')
      timers.current.push(window.setTimeout(() => setSub('led'), 560))
      return
    }
    if (node === 'mao') return setSub('led')
    // the leaf: whoever still holds a card lays it down, then it scores
    const peLaysDown = p.peAction === 'give' || p.maoAction === 'call'
    if (quick || !peLaysDown) return setSub('scored')
    setSub('playing')
    timers.current.push(window.setTimeout(() => setSub('scored'), 560))
  }, [])

  function deal() {
    const seen = path !== null && idx === nodesOf(path).length - 1
    if (seen && path) setDone((d) => [...d, path])
    const next = samplePath()
    setPath(next)
    setIdx(0)
    arrive(next, 0)
  }

  function newMatch() {
    clearTimers()
    setDone([])
    setPath(null)
    setIdx(0)
    setSub(null)
  }

  /** deal a pile of hands at once — the walk is for understanding the tree,
   *  but the tally only converges on p* = 2/3 over a great many hands */
  function playMany(n: number) {
    const more: ToyPath[] = []
    for (let i = 0; i < n; i += 1) more.push(samplePath())
    setDone((d) => [...d, ...more])
    setMenuOpen(false)
  }

  const seq = path ? nodesOf(path) : []
  const cur: Node | null = path ? seq[idx] : null
  const isLeaf = seq.length > 0 && idx === seq.length - 1

  function goNext() {
    if (!path || idx >= seq.length - 1) return
    const n = idx + 1
    setIdx(n)
    arrive(path, n)
  }

  function goPrev() {
    if (!path || idx === 0) return
    const n = idx - 1
    if (nodesOf(path)[n] === 'deal') {
      // back to the chance node is back to the shuffle: this hand is re-dealt
      const next = samplePath()
      setPath(next)
      setIdx(0)
      arrive(next, 0)
      return
    }
    setIdx(n)
    arrive(path, n)
  }

  /* ---- what has happened, by how far the walk has gone ----
     you stand AT a node: everything before it is done, its own move is not */
  const dealt = idx >= 1 // the chance edge was taken on the way to pé
  const peSpoke = idx >= 2 // pé's choice is revealed as you leave him
  const maoSpoke = idx >= 3 // likewise mão's (raise lines only)
  const scored = isLeaf && sub === 'scored'

  /* ---- where each card is, and which way up ---- */
  const maoSpot: Spot = !dealt ? 'deck' : sub === 'dealing' ? 'hand' : 'table'
  const peLaysDown = path !== null && (path.peAction === 'give' || path.maoAction === 'call')
  const pePlayed = isLeaf && peLaysDown && (sub === 'playing' || sub === 'scored')
  const peSpot: Spot = !dealt ? 'deck' : pePlayed ? 'table' : 'hand'
  const maoUp = maoSpot === 'table'
  const peUp = peSpot === 'table'
  const shuffling = cur === 'deal' && sub === 'gather'

  /* ---- the tree ---- */
  const lit = new Set<string>()
  if (path && dealt) lit.add(path.hand === 'm' ? 'deal-m' : 'deal-4')
  if (path && peSpoke) {
    if (path.hand === 'm') lit.add('raise-m')
    else lit.add(path.peAction === 'raise' ? 'bluff' : 'give')
  }
  if (path && maoSpoke && path.maoAction) lit.add(`${path.maoAction}-${path.hand}`)
  const winLeaf =
    path && scored
      ? path.peAction === 'give'
        ? 'give'
        : `${path.maoAction}-${path.hand}`
      : null

  // the node you are standing on breathes
  const active: 'chance' | 'pe' | 'mao' | null =
    cur === 'deal' ? 'chance' : cur === 'pe' ? 'pe' : cur === 'mao' ? 'mao' : null
  const left = path?.hand === 'm'
  const nodeCls = (kind: 'chance' | 'pe' | 'mao', mine: boolean) => {
    const base =
      kind === 'chance' ? styles.toyChance : kind === 'pe' ? styles.toyPeNode : styles.toyMaoNode
    return `${base}${active === kind && mine ? ` ${styles.toyNodeLive}` : ''}`
  }

  const leafCls = (id: string) =>
    `${lit.has(id) ? styles.toyLeafOn : styles.toyLeaf}${winLeaf === id ? ` ${styles.toyLeafWin}` : ''}`
  const labelCls = (id: string) => (lit.has(id) ? styles.toyEdgeLabelOn : styles.toyEdgeLabel)

  const agg = tallyOf(scored && path ? [...done, path] : done)
  const share = agg.raises > 0 ? agg.manilhaRaises / agg.raises : null
  const res = path ? handResult(path) : null

  const beatKey = cur === 'leaf' ? 'showdown' : cur
  const resultKey =
    path && scored
      ? path.peAction === 'give'
        ? 'toy.resGive'
        : path.maoAction === 'fold'
          ? 'toy.resFold'
          : path.hand === 'm'
            ? 'toy.resCallManilha'
            : 'toy.resCallBluff'
      : null

  const spotCls = (spot: Spot, seat: 'mao' | 'pe') =>
    `${styles.toyCard} ${seat === 'pe' ? styles.toyCardPe : styles.toyCardMao} ${
      spot === 'deck' ? styles.toyAtDeck : spot === 'hand' ? styles.toyInHand : styles.toyOnTable
    }`

  const faces = (seat: 'mao' | 'pe') => (
    <div className={styles.toyFlipInner}>
      <div className={styles.toyFaceBack}>
        <DeckCard system={DEFAULT_DECK_SYSTEM} rank={5} suit="bastos" size="sm" faceDown />
      </div>
      <div className={styles.toyFaceFront}>
        {seat === 'mao' ? (
          <DeckCard system={DEFAULT_DECK_SYSTEM} rank={3} suit="copas" size="sm" />
        ) : path?.hand === '4' ? (
          <DeckCard system={DEFAULT_DECK_SYSTEM} rank={4} suit="espadas" size="sm" />
        ) : (
          <DeckCard
            system={DEFAULT_DECK_SYSTEM}
            rank={5}
            suit="bastos"
            size="sm"
            isManilha
            manilhaSuitStrength={3}
          />
        )}
      </div>
    </div>
  )

  const atEnd = seq.length > 0 && idx >= seq.length - 1
  /** the last arrow is not a dead end: it deals the next hand */
  const onArrowNext = atEnd ? deal : goNext

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowLeft' && idx > 0) {
      e.preventDefault()
      goPrev()
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      // before the first hand there is nothing to step through, so the right
      // arrow does what the button does: it deals one
      if (seq.length === 0) deal()
      else onArrowNext()
    }
  }

  return (
    <figure className={styles.plate}>
      {/* clicking anywhere on the plate focuses it, so the arrow keys walk the
          hand from wherever you happen to have clicked. The plate is capped to
          hug the tree and the table rather than running the column's full width */}
      <div
        className={`${styles.figCanvas} ${styles.toyCanvas}`}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="group"
      >
        <div className={styles.toyControls}>
          {/* hover (or tap the caret) to deal a pile of hands at once: the walk
              teaches the tree, but only a great many hands converge the tally */}
          <div
            className={styles.toyDealWrap}
            onMouseEnter={() => setMenuOpen(true)}
            onMouseLeave={() => setMenuOpen(false)}
          >
            <button type="button" className={styles.toyDeal} onClick={deal}>
              {t('toy.press')}
            </button>
            <button
              type="button"
              className={styles.toyDealMore}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={t('toy.playMany', { n: 20 })}
              onClick={() => setMenuOpen((v) => !v)}
            >
              ▾
            </button>
            {menuOpen ? (
              <div className={styles.toyDealMenu} role="menu">
                {[20, 100].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="menuitem"
                    className={styles.toyDealMenuItem}
                    onClick={() => playMany(n)}
                  >
                    {t('toy.playMany', { n })}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {seq.length > 0 ? (
            <div className={styles.toySteps}>
              <button
                type="button"
                className={styles.toyArrow}
                onClick={goPrev}
                disabled={idx === 0}
                aria-label={t('toy.prevStep')}
                title={t('toy.prevStep')}
              >
                ←
              </button>
              <span className={styles.toyBeat}>
                <span className={styles.toyBeatNo}>
                  {t('toy.stepLabel')} {idx + 1}/{seq.length}
                </span>
                <span className={styles.toyBeatName}>{beatKey ? t(`toy.beats.${beatKey}`) : ''}</span>
              </span>
              <button
                type="button"
                className={`${styles.toyArrow}${atEnd ? ` ${styles.toyArrowDeal}` : ''}`}
                onClick={onArrowNext}
                aria-label={atEnd ? t('toy.press') : t('toy.nextStep')}
                title={atEnd ? t('toy.press') : t('toy.nextStep')}
              >
                →
              </button>
            </div>
          ) : null}

          <button
            type="button"
            className={styles.toyNewMatch}
            onClick={newMatch}
            disabled={agg.hands === 0 && !path}
          >
            {t('toy.reset')}
          </button>
        </div>

        <div className={styles.toyBody}>
          <svg className={styles.toyTree} viewBox="0 0 460 268" role="img" aria-label={t('toy.treeAria')}>
            <Edge x1={230} y1={30} x2={120} y2={88} actor="chance" on={lit.has('deal-m')} />
            <Edge x1={230} y1={30} x2={340} y2={88} actor="chance" on={lit.has('deal-4')} />
            <Edge x1={120} y1={100} x2={120} y2={156} actor="pe" on={lit.has('raise-m')} />
            <Edge x1={340} y1={100} x2={280} y2={156} actor="pe" on={lit.has('bluff')} />
            <Edge x1={340} y1={100} x2={412} y2={156} actor="pe" on={lit.has('give')} />
            <Edge x1={120} y1={168} x2={70} y2={222} actor="mao" on={lit.has('call-m')} />
            <Edge x1={120} y1={168} x2={170} y2={222} actor="mao" on={lit.has('fold-m')} />
            <Edge x1={280} y1={168} x2={230} y2={222} actor="mao" on={lit.has('call-4')} />
            <Edge x1={280} y1={168} x2={330} y2={222} actor="mao" on={lit.has('fold-4')} />

            <line x1={132} y1={162} x2={268} y2={162} className={styles.toyInfoset} />
            <text x={200} y={154} className={styles.toyInfosetLabel} textAnchor="middle">
              {t('toy.cantTell')}
            </text>

            <MiniCardChip x={124} y={18} rank="5" suit="♣" manilha lit={lit.has('deal-m')} />
            <text x={154} y={40} textAnchor="start" className={labelCls('deal-m')}>
              · ½
            </text>
            <MiniCardChip x={304} y={18} rank="4" suit="♠" lit={lit.has('deal-4')} />
            <text x={334} y={40} textAnchor="start" className={labelCls('deal-4')}>
              · ½
            </text>
            <text x={128} y={132} textAnchor="start" className={labelCls('raise-m')}>
              {t('toy.raise')}
            </text>
            <text x={300} y={124} textAnchor="end" className={labelCls('bluff')}>
              {t('toy.raise')} ½
            </text>
            <text x={388} y={124} textAnchor="start" className={labelCls('give')}>
              {t('toy.give')} ½
            </text>
            <text x={86} y={198} textAnchor="end" className={labelCls('call-m')}>
              {tt('accept')} ½
            </text>
            <text x={156} y={198} textAnchor="start" className={labelCls('fold-m')}>
              {tt('fold')} ½
            </text>
            <text x={246} y={198} textAnchor="end" className={labelCls('call-4')}>
              {tt('accept')} ½
            </text>
            <text x={316} y={198} textAnchor="start" className={labelCls('fold-4')}>
              {tt('fold')} ½
            </text>

            <circle cx={230} cy={24} r={8} className={nodeCls('chance', true)} />
            <text x={230} y={12} textAnchor="middle" className={styles.toyNodeLabel}>
              {t('toy.deal')}
            </text>
            <circle cx={120} cy={94} r={8} className={nodeCls('pe', left === true)} />
            <text x={104} y={98} textAnchor="end" className={styles.toyNodeLabel}>
              {tt('pe')}
            </text>
            <circle cx={340} cy={94} r={8} className={nodeCls('pe', left === false)} />
            <text x={356} y={98} textAnchor="start" className={styles.toyNodeLabel}>
              {tt('pe')}
            </text>
            <circle cx={120} cy={162} r={8} className={nodeCls('mao', left === true)} />
            <text x={104} y={166} textAnchor="end" className={styles.toyNodeLabel}>
              {tt('mao')}
            </text>
            <circle cx={280} cy={162} r={8} className={nodeCls('mao', left === false)} />

            <g className={leafCls('call-m')}>
              <rect x={48} y={224} width={46} height={25} rx={5} />
              <text x={71} y={241} textAnchor="middle">−3</text>
            </g>
            <g className={leafCls('fold-m')}>
              <rect x={147} y={224} width={46} height={25} rx={5} />
              <text x={170} y={241} textAnchor="middle">−1</text>
            </g>
            <g className={leafCls('call-4')}>
              <rect x={207} y={224} width={46} height={25} rx={5} />
              <text x={230} y={241} textAnchor="middle">+3</text>
            </g>
            <g className={leafCls('fold-4')}>
              <rect x={307} y={224} width={46} height={25} rx={5} />
              <text x={330} y={241} textAnchor="middle">−1</text>
            </g>
            <g className={leafCls('give')}>
              <rect x={389} y={158} width={46} height={25} rx={5} />
              <text x={412} y={175} textAnchor="middle">+1</text>
            </g>
          </svg>

          {/* the scoreboard sits over the table, the two seats side by side, so
              nothing stands beside the wood and the plate can hug the tree */}
          <div className={styles.toyScore} aria-live="polite">
            <span
              className={`${styles.toyScoreSeat} ${styles.toyScoreMao}${winLeaf && res?.winner === 'mao' ? ` ${styles.toyScoreWin}` : ''}`}
            >
              <span className={styles.toyScoreName}>{tt('mao')}</span>
              <b>{agg.mao}</b>
            </span>
            <span
              className={`${styles.toyScoreSeat} ${styles.toyScorePe}${winLeaf && res?.winner === 'pe' ? ` ${styles.toyScoreWin}` : ''}`}
            >
              <span className={styles.toyScoreName}>{tt('pe')}</span>
              <b>{agg.pe}</b>
            </span>
          </div>

          <div className={`walnut ${styles.farolPane}`}>
            <div className={styles.farolTable}>
              <div className={styles.farolSeatRow}>
                <span className={styles.farolSeatName}>{tt('pe')}</span>
                <div className={styles.farolTrack}>
                  <div
                    className={`${spotCls(peSpot, 'pe')}${peUp ? ` ${styles.toyFaceUp}` : ''}${winLeaf && res?.winner === 'pe' ? ` ${styles.toyCardWin}` : ''}`}
                  >
                    {faces('pe')}
                  </div>
                  {/* the balloon parks in the GAP between the played slot and
                      the held one, so it clears the card either way — and its
                      tail points at the player's CARDS, which are his body:
                      right while he still holds them, left once they are down
                      on the wood. */}
                  <span className={styles.farolSay}>
                    <span
                      className={`${peSpot === 'hand' ? styles.tailRight : styles.tailLeft} ${
                        peSpoke
                          ? path?.peAction === 'raise'
                            ? styles.farolBubble
                            : styles.farolBubbleGhost
                          : styles.farolBubbleHidden
                      }`}
                    >
                      {path?.peAction === 'give' ? t('toy.giveBubble') : t('toy.raiseBubble')}
                    </span>
                  </span>
                </div>
              </div>

              <div className={styles.farolSeatRow}>
                <span className={styles.farolSeatName}>{tt('mao')}</span>
                <div className={styles.farolTrack}>
                  <div
                    className={`${spotCls(maoSpot, 'mao')}${maoUp ? ` ${styles.toyFaceUp}` : ''}${winLeaf && res?.winner === 'mao' ? ` ${styles.toyCardWin}` : ''}`}
                  >
                    {faces('mao')}
                  </div>
                  <span className={styles.farolSay}>
                    <span
                      className={`${maoSpot === 'hand' ? styles.tailRight : styles.tailLeft} ${
                        maoSpoke && path?.maoAction
                          ? path.maoAction === 'call'
                            ? styles.farolBubble
                            : styles.farolBubbleGhost
                          : styles.farolBubbleHidden
                      }`}
                    >
                      {path?.maoAction === 'fold' ? t('toy.foldBubble') : t('toy.callBubble')}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <div
              className={`${styles.farolDeckWrap}${shuffling ? ` ${styles.farolShuffling}` : ''}${dealt ? ` ${styles.farolViraDealt}` : ''}`}
              aria-hidden
            >
              {deckMounted ? (
                <>
                  <div className={styles.farolDeckScale}>
                    <DeckWithVira deckSystem={DEFAULT_DECK_SYSTEM} vira={{ rank: 4, suit: 'oros' }} />
                  </div>
                  {shuffling ? (
                    <div className={styles.farolRiffle}>
                      <span>
                        <DeckCard system={DEFAULT_DECK_SYSTEM} rank={1} suit="oros" size="sm" faceDown />
                      </span>
                      <span>
                        <DeckCard system={DEFAULT_DECK_SYSTEM} rank={1} suit="oros" size="sm" faceDown />
                      </span>
                      <span>
                        <DeckCard system={DEFAULT_DECK_SYSTEM} rank={1} suit="oros" size="sm" faceDown />
                      </span>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>

            <p className={styles.farolResult} role="status" aria-live="polite">
              {resultKey ? t(resultKey) : ''}
            </p>
          </div>
        </div>

        {/* the tally is on show from the first look too — empty, with its
            target already marked, so you can see what is about to fill up */}
        <div className={styles.msTally}>
          <div className={styles.msBar} aria-hidden>
            <span className={styles.msBarRaise} style={{ width: `${(share ?? 0) * 100}%` }} />
            <span className={styles.msBarFold} style={{ width: `${(share === null ? 0 : 1 - share) * 100}%` }} />
            <span className={styles.msTarget} style={{ left: `${TARGET_SHARE * 100}%` }} title={t('toy.targetTitle')} />
          </div>
          <div className={styles.msStats}>
            <span>{t('toy.tallyHands', { hands: agg.hands, raises: agg.raises })}</span>
            <span>
              {share === null
                ? t('toy.tallyNoRaises')
                : t.rich('toy.tallyShare', {
                    b: (c) => <b>{c}</b>,
                    dim: (c) => <span className={styles.msDim}>{c}</span>,
                    pct: Math.round(share * 100),
                  })}
            </span>
          </div>
        </div>
      </div>
      <figcaption className={styles.plateCaption}>
        <span className={styles.plateNo}>{t('plate', { no: 'I' })}</span> {t('toy.caption')}
      </figcaption>
    </figure>
  )
}
