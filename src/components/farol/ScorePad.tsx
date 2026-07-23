import './ScorePad.css'

import type { MutableRefObject } from 'react'
import { useTranslations } from 'next-intl'

import {
  resolveScorePadElevenMarks,
  type ScorePadElevenFocusMode,
  type ScorePadSide,
} from '../../lib/score-pad-eleven-markers'
import { useAnimatedTallyCount } from '../../lib/use-animated-tally-count'
import { PaperDealerChip, type DealerSide } from './DealerMark'

interface ScorePadProps {
  hero: number
  villain: number
  to?: number
  dealerSide?: DealerSide | null
  dealerHandKey?: string | number | null
  elevenRingSide?: ScorePadSide | null
  maoDeOnze?: ScorePadSide | null
  elevenFocusMode?: ScorePadElevenFocusMode | null
  onRollClick?: () => void
  scoreDataActive?: boolean
  scoreRowRefs?: MutableRefObject<{ hero: HTMLDivElement | null; villain: HTMLDivElement | null }>
  scoreNumberRefs?: MutableRefObject<{ hero: HTMLSpanElement | null; villain: HTMLSpanElement | null }>
  scoreCelebration?: { hero?: string | null; villain?: string | null }
}

function InkRing() {
  return (
    <svg className="scorepad-ink-ring" viewBox="0 0 60 60" aria-hidden="true">
      <path
        d="M 12 31 C 11 19, 22 10, 32 10 C 43 10, 50 19, 49 31 C 49 42, 41 50, 30 50 C 18 50, 13 42, 12 31 Z"
        fill="none"
        stroke="var(--ink-0)"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M 14 30 C 13 20, 22 12, 33 11 C 42 11, 50 20, 50 30 C 51 43, 42 49, 29 49"
        fill="none"
        stroke="var(--ink-0)"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  )
}

function InkUnderline() {
  return (
    <svg className="scorepad-ink-underline" viewBox="0 0 60 18" aria-hidden="true">
      <path
        d="M 10 9 C 15.5 10.5, 22.5 9.9, 29 9.35"
        fill="none"
        stroke="var(--ink-0)"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.82"
      />
      <path
        d="M 24 12.45 C 32 10.4, 40.5 10.75, 49 12"
        fill="none"
        stroke="var(--ink-0)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  )
}

function scoreToTallyGroups(score: number) {
  const safeScore = Math.max(0, Math.floor(score))
  const groups: number[] = []
  for (let remaining = safeScore; remaining > 0; remaining -= 5) {
    groups.push(Math.min(remaining, 5))
  }
  return groups
}

function TallyScore({ score }: { score: number }) {
  const visibleScore = useAnimatedTallyCount(score)

  return (
    <div className="tally" aria-hidden="true">
      {scoreToTallyGroups(visibleScore).map((count, groupIndex) => (
        <span
          className={`tally-group${count === 5 ? ' tally-group-full' : ''}`}
          key={groupIndex}
        >
          {Array.from({ length: Math.min(count, 4) }, (_, strokeIndex) => (
            <span className="tally-stroke" key={strokeIndex} />
          ))}
          {count === 5 && <span className="tally-cross" />}
        </span>
      ))}
    </div>
  )
}

export function ScorePad({
  hero,
  villain,
  to = 12,
  dealerSide = null,
  dealerHandKey = null,
  elevenRingSide,
  maoDeOnze = null,
  elevenFocusMode = null,
  onRollClick,
  scoreDataActive = true,
  scoreRowRefs,
  scoreNumberRefs,
  scoreCelebration,
}: ScorePadProps) {
  const tCommon = useTranslations('Common')
  const tTable = useTranslations('Live.table')
  const marks = resolveScorePadElevenMarks(
    { hero, villain },
    elevenRingSide ?? maoDeOnze,
  )
  const focusMode = elevenFocusMode ?? maoDeOnze
  const heroElevenActive = focusMode === 'hero' || focusMode === 'duel'
  const villainElevenActive = focusMode === 'villain' || focusMode === 'duel'
  const heroElevenMuted = focusMode === 'villain'
  const villainElevenMuted = focusMode === 'hero'
  const heroMatchPoint = hero === 11
  const villainMatchPoint = villain === 11

  return (
    <div
      className="scorepad"
      data-testid="farol-scorepad"
      data-eleven-focus={focusMode ?? undefined}
    >
      {onRollClick ? (
        <button
          type="button"
          className="scorepad-pin-button"
          aria-label={tTable('rollUpScorepad')}
          onClick={onRollClick}
        >
          <span className="scorepad-pin-hint">{tTable('clickToRoll')}</span>
          <span className="scorepad-pin-dot" />
        </button>
      ) : (
        <div className="scorepad-pin" />
      )}
      <div className="scorepad-header">
        <span className="scorepad-header-left">{tCommon('you')}</span>
        <span className="scorepad-header-right">{tCommon('them')}</span>
      </div>
      <div className="scorepad-row">
        <div
          className="scorepad-cell"
          data-score-side="hero"
          data-testid={scoreDataActive ? 'score-row-hero' : undefined}
          data-score-points={hero}
          data-score-celebration={scoreCelebration?.hero ?? undefined}
          data-eleven-active={heroElevenActive ? 'true' : undefined}
          data-eleven-muted={heroElevenMuted ? 'true' : undefined}
          ref={(node) => {
            if (scoreDataActive && scoreRowRefs) scoreRowRefs.current.hero = node
          }}
        >
          <div
            className="scorepad-digit-wrap"
            data-eleven-mark={marks.hero ?? undefined}
            data-eleven-active={heroElevenActive ? 'true' : undefined}
          >
            {marks.hero === 'ring' && <InkRing />}
            {marks.hero === 'underline' && <InkUnderline />}
            <span
              className="scorepad-digit score-number"
              aria-label={tTable('youScoreAria', { score: hero })}
              data-score-display-style="farol"
              ref={(node) => {
                if (scoreDataActive && scoreNumberRefs) scoreNumberRefs.current.hero = node
              }}
            >
              {hero}
            </span>
          </div>
          {heroMatchPoint && (
            <span className="scorepad-match-point-chip">{tTable('matchPoint')}</span>
          )}
          <TallyScore score={hero} />
        </div>
        <div className="scorepad-divider" />
        <div
          className="scorepad-cell"
          data-score-side="villain"
          data-testid={scoreDataActive ? 'score-row-villain' : undefined}
          data-score-points={villain}
          data-score-celebration={scoreCelebration?.villain ?? undefined}
          data-eleven-active={villainElevenActive ? 'true' : undefined}
          data-eleven-muted={villainElevenMuted ? 'true' : undefined}
          ref={(node) => {
            if (scoreDataActive && scoreRowRefs) scoreRowRefs.current.villain = node
          }}
        >
          <div
            className="scorepad-digit-wrap"
            data-eleven-mark={marks.villain ?? undefined}
            data-eleven-active={villainElevenActive ? 'true' : undefined}
          >
            {marks.villain === 'ring' && <InkRing />}
            {marks.villain === 'underline' && <InkUnderline />}
            <span
              className="scorepad-digit score-number"
              aria-label={tTable('themScoreAria', { score: villain })}
              data-score-display-style="farol"
              ref={(node) => {
                if (scoreDataActive && scoreNumberRefs) scoreNumberRefs.current.villain = node
              }}
            >
              {villain}
            </span>
          </div>
          {villainMatchPoint && (
            <span className="scorepad-match-point-chip">{tTable('matchPoint')}</span>
          )}
          <TallyScore score={villain} />
        </div>
      </div>
      <div className="scorepad-goal">{tTable('to', { score: to })}</div>
      {dealerSide && dealerHandKey != null && (
        <PaperDealerChip
          handKey={dealerHandKey}
          dealer={dealerSide}
          padWidth={280}
          padHeight={240}
          size={28}
          glyph="blank"
        />
      )}
    </div>
  )
}
