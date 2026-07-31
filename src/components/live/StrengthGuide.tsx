import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocale, useTranslations } from 'next-intl'

import type { DeckSystem } from '../../lib/deck-system'
import {
  rankLabel,
  rankingForTurnup,
  STRENGTH_RANK_ORDER,
  type StrengthGuideCard,
  type StrengthGuideManilha,
  type StrengthGuideRanking,
  type StrengthRank,
} from '../../lib/strength-guide'
import { DEFAULT_LOCALE, isAppLocale } from '../../i18n/locales'

import './StrengthGuide.css'

type StrengthGuideCorner = 'tr' | 'tl' | 'br' | 'bl'
type RankCardState = '' | 'strike' | 'turnup'

const SG3_DISPLAY_ROWS = [
  STRENGTH_RANK_ORDER.slice(5),
  STRENGTH_RANK_ORDER.slice(0, 5),
]

function strengthGuideLocale(locale: string) {
  return isAppLocale(locale) ? locale : DEFAULT_LOCALE
}

function sg3SuitStyle(colorVar?: string): CSSProperties {
  return { '--sg3-suit-color': colorVar ?? 'var(--ink-0)' } as CSSProperties
}

function SG3RankCard({
  rank,
  deckSystem,
  state = '',
  style,
}: {
  rank: StrengthRank
  deckSystem: DeckSystem
  state?: RankCardState
  style?: CSSProperties
}) {
  const display = rankLabel(rank, deckSystem)
  const className = [
    'sg3-rcard',
    state === 'strike' ? 'is-strike' : '',
    state === 'turnup' ? 'is-turnup' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={className} style={style} aria-label={display}>
      <span className="sg3-rcard-ink" aria-hidden="true" />
      <span className="sg3-rcard-corner tl" aria-hidden="true">{display}</span>
      <span className="sg3-rcard-rank">{display}</span>
      <span className="sg3-rcard-corner br" aria-hidden="true">{display}</span>
      {state === 'turnup' && (
        <span className="sg3-rcard-circle" aria-hidden="true">
          <svg viewBox="0 0 60 84" preserveAspectRatio="none" focusable="false">
            <path d="M 8 42 Q 4 18, 30 8 Q 56 4, 56 38 Q 58 76, 30 78 Q 4 78, 8 42 Z" />
          </svg>
        </span>
      )}
      {state === 'strike' && (
        <span className="sg3-rcard-strike" aria-hidden="true">
          <svg viewBox="0 0 56 60" preserveAspectRatio="none" focusable="false">
            <path d="M 4 38 Q 16 26, 28 32 T 52 22" />
          </svg>
        </span>
      )}
    </div>
  )
}

function SG3ManilhaCard({
  manilha,
  deckSystem,
}: {
  manilha: StrengthGuideManilha
  deckSystem: DeckSystem
}) {
  const display = rankLabel(manilha.rank, deckSystem)

  return (
    <div
      className="sg3-mcard"
      style={sg3SuitStyle(manilha.colorVar)}
      aria-label={`${display} ${manilha.name}`}
    >
      <span className="sg3-mcard-ink" aria-hidden="true" />
      <span className="sg3-mcard-corner tl" aria-hidden="true">{display}</span>
      <span className="sg3-mcard-rank">{display}</span>
      <span className="sg3-mcard-suit" aria-hidden="true">{manilha.glyph}</span>
      <span className="sg3-mcard-corner br" aria-hidden="true">{display}</span>
    </div>
  )
}

function SG3RankRow({
  ranking,
  deckSystem,
}: {
  ranking: StrengthGuideRanking
  deckSystem: DeckSystem
}) {
  const t = useTranslations('Live.strengthGuide')

  return (
    <div className="sg3-rank-section" aria-label={t('cardStrengthAria')}>
      <div className="sg3-rank-row">
        {SG3_DISPLAY_ROWS.flatMap((row, rowIndex) => (
          row.map((rank, columnIndex) => {
            const state: RankCardState = rank === ranking.manilhaRank
              ? 'strike'
              : rank === ranking.turnup.rank
                ? 'turnup'
                : ''
            const gridStyle = {
              gridColumn: columnIndex + 1,
              gridRow: rowIndex + 1,
            } as CSSProperties

            return (
              <SG3RankCard
                key={rank}
                rank={rank}
                deckSystem={deckSystem}
                state={state}
                style={gridStyle}
              />
            )
          })
        ))}
      </div>
      <div className="sg3-rank-direction">
        <span>{t('weakest')}</span>
        <span className="sg3-rank-direction-line" aria-hidden="true" />
        <span>{t('strongest')}</span>
      </div>
    </div>
  )
}

function SG3ManilhaCluster({
  ranking,
  deckSystem,
}: {
  ranking: StrengthGuideRanking
  deckSystem: DeckSystem
}) {
  return (
    <div className="sg3-manilhas">
      {ranking.manilhas.map((manilha) => (
        <SG3ManilhaCard
          key={manilha.id}
          manilha={manilha}
          deckSystem={deckSystem}
        />
      ))}
    </div>
  )
}

function SG3Paper({
  ranking,
  deckSystem,
  withClose = false,
  onClose,
}: {
  ranking: StrengthGuideRanking
  deckSystem: DeckSystem
  withClose?: boolean
  onClose?: () => void
}) {
  const locale = strengthGuideLocale(useLocale())
  const t = useTranslations('Live.strengthGuide')
  const turnupLabel = rankLabel(ranking.turnup.rank, deckSystem)
  const manilhaLabel = rankLabel(ranking.manilhaRank, deckSystem)

  return (
    <aside
      id="strength-guide-panel"
      className="strength-guide sg3-paper layout-pocket"
      data-testid="strength-guide-panel"
      aria-label={t('panelAria')}
      data-locale={locale}
    >
      {withClose && (
        <button
          type="button"
          className="sg3-close"
          aria-label={t('closeAria')}
          onClick={onClose}
        >
          ×
        </button>
      )}
      <div className="sg3-content">
        <div className="sg3-head">
          <div>
            <div className="sg3-head-title">{t('title')}</div>
            <div className="sg3-head-sub">
              {t('sub', { turnup: turnupLabel, manilha: manilhaLabel })}
            </div>
          </div>
        </div>

        <div className="sg3-manilha-block sg3-manilha-block-top">
          <SG3ManilhaCluster ranking={ranking} deckSystem={deckSystem} />
        </div>

        <SG3RankRow ranking={ranking} deckSystem={deckSystem} />
      </div>
    </aside>
  )
}

function SG3Peek({
  expanded,
  pulse,
  placement = 'host',
  disabled = false,
  onOpen,
}: {
  expanded: boolean
  pulse: boolean
  placement?: 'host' | 'deck'
  disabled?: boolean
  onOpen: () => void
}) {
  const t = useTranslations('Live.strengthGuide')
  const className = [
    'sg3-peek',
    `sg3-peek-${placement}`,
    pulse ? 'is-pulsing' : '',
  ].filter(Boolean).join(' ')

  return (
    <button
      type="button"
      className={className}
      aria-label={t('peekAria')}
      aria-controls="strength-guide-panel"
      aria-expanded={expanded}
      disabled={disabled}
      data-testid="strength-guide-peek"
      onClick={onOpen}
    >
      <span className="sg3-peek-paper" aria-hidden="true" />
      <span className="sg3-peek-fold" aria-hidden="true" />
    </button>
  )
}

export function StrengthGuidePressRing({ progress = 0 }: { progress?: number }) {
  const radius = 48
  const circumference = 2 * Math.PI * radius
  const safeProgress = Math.min(1, Math.max(0, progress))

  return (
    <div className="sg2-press-ring" aria-hidden="true">
      <svg viewBox="-60 -60 120 120" focusable="false">
        <circle className="track" r={radius} />
        <circle
          className="fill"
          r={radius}
          transform="rotate(-90)"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - safeProgress)}
        />
      </svg>
    </div>
  )
}

export function StrengthGuidePanel({
  open,
  turnup,
  deckSystem,
  pulse = false,
  corner = 'tr',
  breakpoint = 720,
  paperWidth = 336,
  peekPortalRef,
  peekDisabled = false,
  onOpen,
  onClose,
}: {
  open: boolean
  turnup: StrengthGuideCard | null
  deckSystem: DeckSystem
  pulse?: boolean
  corner?: StrengthGuideCorner
  breakpoint?: number
  paperWidth?: number
  peekPortalRef?: { current: HTMLElement | null }
  peekDisabled?: boolean
  onOpen: () => void
  onClose: () => void
}) {
  const ranking = rankingForTurnup(turnup, deckSystem)
  const rankingKey = ranking ? `${ranking.turnup.rank}:${ranking.turnup.suit}:${deckSystem}` : null
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [peekPortalElement, setPeekPortalElement] = useState<HTMLElement | null>(null)
  const [hasRoom, setHasRoom] = useState(false)
  const [overlayOpen, setOverlayOpen] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined

    const updateRoom = (width: number, height: number) => {
      setHasRoom(width >= breakpoint && height >= 400)
    }

    const bounds = host.getBoundingClientRect()
    updateRoom(bounds.width, bounds.height)

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      updateRoom(width, height)
    })
    observer.observe(host)

    return () => { observer.disconnect() }
  }, [breakpoint, rankingKey])

  useEffect(() => {
    const nextElement = peekPortalRef?.current ?? null
    setPeekPortalElement((previous) => (
      previous === nextElement ? previous : nextElement
    ))
  }, [peekPortalRef])

  useEffect(() => {
    if (hasRoom || !open) {
      setOverlayOpen(false)
      return
    }

    setOverlayOpen(true)
  }, [hasRoom, open])

  if (!ranking) return null

  const showAnchored = hasRoom && open
  const showOverlay = !hasRoom && overlayOpen
  const showPeek = !showAnchored && !showOverlay
  const currentPeekPortalElement = peekPortalRef?.current ?? peekPortalElement
  const paperStyle = { '--sg3-paper-width': `${paperWidth}px` } as CSSProperties

  const handlePeekOpen = () => {
    if (peekDisabled) return
    onOpen()
    if (!hasRoom) setOverlayOpen(true)
  }

  const handleClose = () => {
    setOverlayOpen(false)
    onClose()
  }

  const peekButton = (
    <SG3Peek
      expanded={showOverlay || showAnchored}
      pulse={pulse}
      placement={currentPeekPortalElement ? 'deck' : 'host'}
      disabled={peekDisabled}
      onOpen={handlePeekOpen}
    />
  )

  return (
    <div
      ref={hostRef}
      className={`sg3-table-host ${showAnchored ? 'is-dismiss-layer' : ''}`}
      data-testid="strength-guide-host"
      style={paperStyle}
      onClick={showAnchored ? handleClose : undefined}
    >
      {showAnchored && (
        <div
          className={`sg3-anchor sg3-anchor-${corner}`}
          onClick={(event) => { event.stopPropagation() }}
        >
          <SG3Paper
            ranking={ranking}
            deckSystem={deckSystem}
            withClose
            onClose={handleClose}
          />
        </div>
      )}

      {showPeek && (
        currentPeekPortalElement
          ? createPortal(peekButton, currentPeekPortalElement)
          : (!peekPortalRef ? peekButton : null)
      )}

      {showOverlay && (
        <div
          className="sg3-overlay"
          data-testid="strength-guide-overlay"
          onClick={handleClose}
        >
          <span
            className="sg3-overlay-paper"
            onClick={(event) => { event.stopPropagation() }}
          >
            <SG3Paper
              ranking={ranking}
              deckSystem={deckSystem}
              withClose
              onClose={handleClose}
            />
          </span>
        </div>
      )}
    </div>
  )
}
