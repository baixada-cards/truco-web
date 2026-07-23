'use client'

// The table view (plan 76 H-3, redesigned again): a read-only picture of the
// walked line in the live game's visual language (walnut under the lamp,
// FrenchCard faces, roman trick numerals, the brass stake peg). It is a
// mini-map, not a work surface: it docks compact in the rail, directly above
// the timeline whose cursor it mirrors, so the charts stay visible while it
// is open. An expand control opens the full-size cinematic stage as a
// lightbox. It never accepts input: the rail stays the only writable surface
// over the line, so the two can never disagree.
//
// One deliberate departure from the live table: a face-down play still shows
// its face (with the ↓ badge). The study lab's job is to show the line, not
// to hide information the walker already chose.

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { FrenchCard, type FrenchRank, type FrenchSuit } from './components/farol/FrenchCard'
import { Peg } from './components/farol/Peg'
import {
  RAISE_TARGETS,
  bandForbidsRaises,
  draftAfterPlays,
  linePlays,
  resolveTrick,
  seatRole,
  walkLine,
  type BandContext,
  type ClassInfo,
  type HandDraft,
} from './lib/study-data'
import styles from './StudyTableView.module.css'

interface TableDraft {
  slots: HandDraft
  locked: boolean
}

const ROUND_NUMERALS = ['I', 'II', 'III'] as const

/** manilha suit glyph → FrenchCard suit, truco paulista order ♦<♠<♥<♣ */
const SUIT_TO_FRENCH: Record<string, FrenchSuit> = {
  '♦': 'ouros',
  '♥': 'copas',
  '♠': 'espadas',
  '♣': 'paus',
}
const SUIT_STRENGTH: Record<string, 0 | 1 | 2 | 3> = { '♦': 0, '♠': 1, '♥': 2, '♣': 3 }

function toFrenchRank(rank: string): FrenchRank | null {
  if (rank === 'A') return 1
  if (rank === 'J' || rank === 'Q' || rank === 'K') return rank
  const n = Number(rank)
  return n >= 2 && n <= 7 ? (n as FrenchRank) : null
}

/** played-card rotations, same values as the live table's ft-played-rotate-* */
const TOP_ROTATIONS = [184, 174, 182] as const
const BOTTOM_ROTATIONS = [-3, 5, -2] as const

/**
 * One study card in the live deck's stock: manilhas render as the real
 * FrenchCard (with the manilha glow); plain classes are suitless in the
 * abstraction, so they keep the FrenchCard frame but print all four muted
 * suit pips under the rank.
 */
function StudyCard({ info, size }: { info: ClassInfo; size: 'sm' | 'md' }) {
  const rank = toFrenchRank(info.rank)
  if (info.suit && rank !== null) {
    return (
      <FrenchCard
        rank={rank}
        suit={SUIT_TO_FRENCH[info.suit]}
        size={size}
        isManilha
        manilhaSuitStrength={SUIT_STRENGTH[info.suit]}
      />
    )
  }
  const dims = size === 'sm' ? { w: 52, h: 78, rank: 13 } : { w: 84, h: 128, rank: 23 }
  return (
    <div className="fcard" style={{ width: dims.w, height: dims.h }}>
      <div className="fcard-inner">
        <div className="fcard-corner fcard-corner-tl" style={{ color: 'var(--ink-0)' }}>
          <div className="fcard-corner-rank" style={{ fontSize: dims.rank * 0.85 }}>
            {info.rank}
          </div>
        </div>
        <div className="fcard-center">
          <div className={styles.anyCenter}>
            <div
              className={`${styles.anyRank}${info.rank === '6' ? ` ${styles.anyRankSix}` : ''}`}
              style={{ fontSize: dims.rank * 1.8 }}
            >
              {info.rank}
            </div>
            <div className={styles.anyPips} style={{ fontSize: Math.round(dims.rank * 0.62) }}>
              <span style={{ color: 'var(--suit-ochre)' }}>♦</span>
              <span style={{ color: 'var(--suit-black)' }}>♠</span>
              <span style={{ color: 'var(--suit-red)' }}>♥</span>
              <span style={{ color: 'var(--suit-green)' }}>♣</span>
            </div>
          </div>
        </div>
        <div className="fcard-corner fcard-corner-br" style={{ color: 'var(--ink-0)' }}>
          <div className="fcard-corner-rank" style={{ fontSize: dims.rank * 0.85 }}>
            {info.rank}
          </div>
        </div>
      </div>
    </div>
  )
}

export interface TableNav {
  pos: string
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
}

export function StudyTableView({
  ctx,
  line,
  k,
  infos,
  drafts,
  viraRankLabel,
  open,
  onToggle,
  nav,
}: {
  ctx: BandContext
  line: readonly number[]
  /** the rail's cursor: how many actions of the line are on the table */
  k: number
  infos: ClassInfo[]
  drafts: Partial<Record<'mão' | 'pé', TableDraft>>
  /** the concrete turn-up rank the lab currently displays */
  viraRankLabel: string
  open: boolean
  onToggle: () => void
  /** the rail's own prev/next, mirrored inside the lightbox */
  nav: TableNav
}) {
  const t = useTranslations('Study.lab')
  const tt = useTranslations('Study.terms')
  const tl = useTranslations('Study.timeline')

  const [expanded, setExpanded] = useState(false)
  /** the live table's mobile lessons: match the stage's aspect to the
   *  screen (portrait composition with full-size cards on phones, the
   *  cinematic landscape elsewhere), and scale the felt to the viewport,
   *  never scroll it. Stages lay out at intrinsic size and get zoomed to
   *  fit; controls stay unscaled and touch-sized. */
  const [lightboxFit, setLightboxFit] = useState({ narrow: false, scale: 1 })

  const prefix = useMemo(() => line.slice(0, k), [line, k])
  const walk = useMemo(() => walkLine(prefix, ctx), [prefix, ctx])
  const plays = useMemo(() => linePlays(prefix, ctx), [prefix, ctx])

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [expanded])

  useEffect(() => {
    if (!expanded) return
    const fit = () => {
      // width 0 = hidden/detached tab, not a phone (same lesson as the
      // dock's collapse effect)
      const narrow = window.innerWidth > 0 && window.matchMedia('(max-width: 719px)').matches
      const baseW = narrow ? 372 : 672
      const baseH = narrow ? 566 : 484
      setLightboxFit({
        narrow,
        scale: Math.min(
          1,
          (window.innerWidth - 24) / baseW,
          (window.innerHeight - 96) / baseH,
        ),
      })
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [expanded])

  /** tricks as the table saw them: pairs of plays in table order */
  const tricks = useMemo(() => {
    const out: Array<{
      cards: Array<{ seat: number; cls: number; open: boolean }>
      winner: number | null
    }> = []
    for (let i = 0; i < plays.length; i += 2) {
      const pair = plays.slice(i, i + 2)
      let winner: number | null = null
      if (pair.length === 2) {
        const raw = pair.map((p) => (p.open ? p.cls : p.cls + 13)) as [number, number]
        const res = resolveTrick(raw[0], raw[1])
        winner = res === 'lead' ? pair[0].seat : res === 'reply' ? pair[1].seat : null
      }
      out.push({ cards: pair, winner })
    }
    return out
  }, [plays])

  /** the current stake: the last accepted raise, or the band's fixed value.
   *  Same five-line machine as study-data's private stepStake — a fold (32)
   *  only clears the pending offer, it never rewinds an accepted stake. */
  const stake = useMemo(() => {
    if (bandForbidsRaises(ctx.score)) {
      const folded = prefix.includes(34)
      return { value: folded ? 1 : 3, pending: null as number | null }
    }
    let stakeIdx = -1
    let pendingIdx: number | null = null
    for (const code of prefix) {
      if (code >= 27 && code <= 30) pendingIdx = code - 27
      else if (code === 31 && pendingIdx !== null) {
        stakeIdx = pendingIdx
        pendingIdx = null
      } else if (code === 32) pendingIdx = null
    }
    return {
      value: stakeIdx >= 0 ? RAISE_TARGETS[stakeIdx] : 1,
      pending: pendingIdx !== null ? RAISE_TARGETS[pendingIdx] : null,
    }
  }, [prefix, ctx])

  const foldedSeat = useMemo(() => {
    if (!walk.folded) return null
    const last = walk.steps[walk.steps.length - 1]
    return last ? last.seat : null
  }, [walk])

  /** one seat's unplayed slots: the pinned hand minus its plays, or unknowns */
  const remaining = (seat: number): Array<number | null> => {
    const role = seatRole(seat, ctx)
    const own = plays.filter((p) => p.seat === seat).map((p) => p.cls)
    const draft = drafts[role]
    if (draft?.locked) {
      const rem = draftAfterPlays(draft.slots, own)
      if (rem) return rem
    }
    return Array(Math.max(0, 3 - own.length)).fill(null)
  }

  const topSeat = 1 - ctx.dealer
  const bottomSeat = ctx.dealer
  const activeIdx = walk.folded || plays.length >= 6 ? -1 : Math.floor(plays.length / 2)

  const seatPlate = (seat: number) => {
    const role = seatRole(seat, ctx)
    return (
      <div className={styles.seatPlate}>
        <span className={styles.seatName}>{role === 'pé' ? tt('pe') : tt('mao')}</span>
        {foldedSeat === seat ? <em className={styles.foldedTag}>{t('tableFolded')}</em> : null}
      </div>
    )
  }

  const handFan = (seat: number, side: 'top' | 'bottom', size: 'sm' | 'md' = 'sm') => {
    const cards = remaining(seat)
    const mid = (cards.length - 1) / 2
    const dir = side === 'top' ? -1 : 1
    return (
      <div
        className={`${styles.hand}${foldedSeat === seat ? ` ${styles.handFolded}` : ''}`}
      >
        {cards.map((c, i) => (
          <div
            key={i}
            className={styles.handCard}
            style={
              {
                transform: `rotate(${(i - mid) * 5 * dir}deg) translateY(${Math.abs(i - mid) * 5 * dir}px)`,
                zIndex: i,
              } as CSSProperties
            }
          >
            {c === null ? (
              <span title={t('tableUnknownCard')}>
                <FrenchCard rank={1} suit="ouros" size={size} faceDown />
              </span>
            ) : (
              <StudyCard info={infos[c]} size={size} />
            )}
          </div>
        ))}
      </div>
    )
  }

  const playedCard = (
    trick: (typeof tricks)[number],
    seat: number,
    roundIdx: number,
    side: 'top' | 'bottom',
    size: 'sm' | 'md',
  ) => {
    const play = trick?.cards.find((p) => p.seat === seat)
    const rotation = side === 'top' ? TOP_ROTATIONS[roundIdx] : BOTTOM_ROTATIONS[roundIdx]
    if (!play) {
      // an unplayed slot is empty felt — it only holds the column's geometry
      return <div className={styles.slotGhost} aria-hidden />
    }
    const won = trick.winner === seat
    const lost = trick.winner !== null && trick.winner !== seat
    return (
      <div
        className={[
          styles.playWrap,
          won ? styles.playWon : '',
          lost ? styles.playLost : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        <StudyCard info={infos[play.cls]} size={size} />
        {!play.open ? (
          <span
            className={`${styles.faceDownTag}${side === 'top' ? ` ${styles.faceDownTagFlip}` : ''}`}
            title={t('tableFaceDown')}
            aria-label={t('tableFaceDown')}
          >
            ↓
          </span>
        ) : null}
      </div>
    )
  }

  const viraCard = (
    <StudyCard info={{ label: viraRankLabel, rank: viraRankLabel, suit: null }} size="sm" />
  )

  /** deck + turn-up; the caption is gone — the vira face says what it is */
  const deckStack = (
    <div
      className={styles.deckStack}
      role="img"
      aria-label={`${t('viraWord')} ${viraRankLabel}`}
    >
      <div className={styles.deckVira}>{viraCard}</div>
      <FrenchCard rank={1} suit="ouros" size="sm" faceDown className={styles.deckBack1} />
      <FrenchCard rank={1} suit="ouros" size="sm" faceDown className={styles.deckBack2} />
      <FrenchCard rank={1} suit="ouros" size="sm" faceDown className={styles.deckBack3} />
    </div>
  )

  /** the portrait corner keeps just one back with the vira lying across it —
   *  the full three-back stack would read as a fourth hand card here. The
   *  vira peeks out from UNDER the back, as on the live table and in
   *  deckStack above, so it renders first. */
  const viraCorner = (size: 'sm' | 'md') => (
    <div
      className={`${styles.deckCorner}${size === 'md' ? ` ${styles.deckCornerMd}` : ''}`}
      role="img"
      aria-label={`${t('viraWord')} ${viraRankLabel}`}
    >
      <div className={styles.deckCornerVira}>{viraCard}</div>
      <FrenchCard rank={1} suit="ouros" size="sm" faceDown className={styles.deckCornerBack} />
    </div>
  )

  const stakePeg = (size: number) => (
    <div className={styles.stakeArea}>
      <Peg
        value={stake.pending ?? stake.value}
        state={stake.pending !== null ? 'pending' : stake.value > 1 ? 'accept' : 'idle'}
        size={size}
        title={t('tableWorth', { n: stake.value })}
      />
      {stake.pending !== null ? (
        <span className={styles.stakePending}>
          {t('tablePendingRaise', { n: stake.pending })}
        </span>
      ) : null}
    </div>
  )

  const trickColumns = (size: 'sm' | 'md') => (
    <div className={styles.played}>
      {([0, 1, 2] as const).map((i) => {
        const trick = tricks[i]
        const done = Boolean(trick && trick.cards.length === 2)
        const markerClass = !done
          ? i === activeIdx
            ? styles.markerPending
            : ''
          : trick.winner === bottomSeat
            ? styles.markerWon
            : trick.winner === topSeat
              ? styles.markerLost
              : styles.markerPending
        return (
          <div
            key={i}
            className={`${styles.round}${i === activeIdx ? ` ${styles.roundActive}` : ''}`}
          >
            <div className={size === 'sm' ? styles.pairSm : styles.pair}>
              {/* near side sits on top by default; a decided trick restacks
                  so the winning card overlaps the losing one */}
              <div
                className={size === 'sm' ? styles.slotSm : styles.slot}
                style={trick?.winner === topSeat ? { zIndex: 2 } : undefined}
              >
                {playedCard(trick, topSeat, i, 'top', size)}
              </div>
              <div className={size === 'sm' ? styles.slotSm : styles.slot}>
                {playedCard(trick, bottomSeat, i, 'bottom', size)}
              </div>
            </div>
            <div className={`${styles.marker}${markerClass ? ` ${markerClass}` : ''}`}>
              {ROUND_NUMERALS[i]}
            </div>
          </div>
        )
      })}
    </div>
  )

  const felt = (children: ReactNode) => (
    <>
      <div className={`walnut ${styles.surface}`} aria-hidden />
      <div className={styles.lamp} aria-hidden />
      <div className={styles.vignette} aria-hidden />
      {children}
      {prefix.length === 0 ? (
        <div className={styles.emptyNote}>{t('tableEmpty')}</div>
      ) : null}
    </>
  )

  /** the portrait composition: fans top and bottom, tricks in the middle,
   *  deck and peg in the free corners. sm cards for the docked rail stage,
   *  md for the phone lightbox. */
  const portraitScene = (size: 'sm' | 'md') => (
    <div
      className={`${styles.sceneCompact}${size === 'md' ? ` ${styles.scenePortraitMd}` : ''}`}
    >
      <div className={styles.seatRowCompact}>
        {seatPlate(topSeat)}
        {handFan(topSeat, 'top', size)}
        {viraCorner(size)}
      </div>
      {trickColumns(size)}
      <div className={styles.seatRowCompact}>
        {seatPlate(bottomSeat)}
        {handFan(bottomSeat, 'bottom', size)}
        <div className={styles.pegCorner}>{stakePeg(size === 'md' ? 48 : 38)}</div>
      </div>
    </div>
  )

  /** the compact docked stage. The whole felt is one big expand target —
   *  the header's collapsed ⤢ only advertises that the lightbox exists. */
  const compactStage = (
    <button
      type="button"
      className={styles.stageCompact}
      aria-label={t('tableExpandAria')}
      title={t('tableExpandAria')}
      onClick={() => setExpanded(true)}
    >
      {felt(portraitScene('sm'))}
    </button>
  )

  /** the phone lightbox: same portrait composition at full card size */
  const portraitStage = (
    <div className={styles.stagePortrait}>{felt(portraitScene('md'))}</div>
  )

  /** the full cinematic stage, now lightbox-only: stake left, tricks
   *  center, deck at the right like the live table's */
  const fullStage = (
    <div className={styles.stageFull}>
      {felt(
        <div className={styles.sceneFull}>
          <div className={styles.seatRowFull}>
            {seatPlate(topSeat)}
            {handFan(topSeat, 'top')}
          </div>
          <div className={styles.mid}>
            {stakePeg(56)}
            {trickColumns('md')}
            <div className={styles.deckArea}>{deckStack}</div>
          </div>
          <div className={styles.seatRowFull}>
            {seatPlate(bottomSeat)}
            {handFan(bottomSeat, 'bottom')}
          </div>
        </div>,
      )}
    </div>
  )

  return (
    <section className={styles.dock} data-tour="table" aria-label={t('tableAria')}>
      <div className={styles.dockHead}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          onClick={onToggle}
        >
          <span className={styles.kicker}>{t('tableTitle')}</span>
          <span className={styles.chevron} aria-hidden>
            {open ? '▾' : '▸'}
          </span>
        </button>
        {/* one brass button goes straight to the lightbox, collapsed or not —
            the open felt is also a big expand target, but the button stays as
            the visible advertisement that the lightbox exists */}
        <button
          type="button"
          className={styles.expandBtn}
          aria-label={t('tableExpandAria')}
          title={t('tableExpandAria')}
          onClick={() => setExpanded(true)}
        >
          ⤢
        </button>
      </div>
      {open ? compactStage : null}
      {expanded ? (
        <div
          className={styles.lightbox}
          role="dialog"
          aria-modal="true"
          aria-label={t('tableAria')}
          onClick={() => setExpanded(false)}
        >
          <div className={styles.lightboxInner} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.lightboxClose}
              aria-label={t('tableCloseAria')}
              title={t('tableCloseAria')}
              autoFocus
              onClick={() => setExpanded(false)}
            >
              ×
            </button>
            <div
              style={
                lightboxFit.scale < 1
                  ? ({ zoom: lightboxFit.scale } as CSSProperties)
                  : undefined
              }
            >
              {lightboxFit.narrow ? portraitStage : fullStage}
            </div>
            <div className={styles.lightboxNav}>
              <button
                type="button"
                className={styles.lightboxNavBtn}
                disabled={!nav.canPrev}
                aria-label={tl('prevDecision')}
                title={tl('prevDecision')}
                onClick={nav.onPrev}
              >
                ◀
              </button>
              <span className={styles.lightboxPos}>{nav.pos}</span>
              <button
                type="button"
                className={styles.lightboxNavBtn}
                disabled={!nav.canNext}
                aria-label={tl('nextDecision')}
                title={tl('nextDecision')}
                onClick={nav.onNext}
              >
                ▶
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
