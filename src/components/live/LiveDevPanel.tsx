'use client'

import { useEffect, useState } from 'react'

import type {
  SessionAction,
  SessionBotOverride,
  SessionCard,
  SessionPayload,
} from '../../lib/session-api'
import type { GameplayHintsState } from '../../lib/live-gameplay-hints'
import { setHintsEnabled } from '../../lib/live-gameplay-hints'
import type { DealerChoice } from '../../lib/live-bot-selection'
import type { LiveDevControlsState } from '../../lib/use-live-dev-controls'
import type { LiveDevDebugSnapshot, LiveDevScoreEditState } from '../../lib/live-dev-controls'
import type { LiveDevControlsSectionId } from '../../lib/live-dev-controls-preferences'
import type { TableSoundTheme, SoundCue, SoundThemeId } from '../../lib/table-sound-fx'
import type { ScorePadElevenFocusMode } from '../../lib/score-pad-eleven-markers'
import { suitGlyph } from '../../lib/live-card-utils'

import './LiveDevPanel.css'

// ---------------------------------------------------------------------------
// Helpers (moved from LiveGame.tsx to avoid prop-threading)
// ---------------------------------------------------------------------------

function cardLabel(card: { rank: string; suit: string }) {
  return `${card.rank}${suitGlyph(card.suit)}`
}

function describeSessionAction(action: SessionBotOverride, knownCards?: SessionCard[] | null) {
  switch (action.type) {
    case 'next_legal_raise':
      return 'Next legal raise'
    case 'accept_raise':
      return 'Accept raise'
    case 'fold':
      return 'Fold'
    case 'accept_eleven':
      return 'Accept eleven'
    case 'concede_hand':
      return 'Fold hand'
    case 'fold_eleven':
      return 'Fold eleven'
    case 'raise':
      return `Raise to ${action.to}`
    case 'play_face_up':
    case 'play_face_down': {
      const card = knownCards?.find((candidate) => candidate.id === action.card_id)
      const visibility = action.type === 'play_face_up' ? 'face-up' : 'face-down'
      return card
        ? `Play ${cardLabel(card)} ${visibility}`
        : `Play ${action.card_id} ${visibility}`
    }
  }
}

// ---------------------------------------------------------------------------
// STAKE_LEVELS constant (mirrors LiveGame.tsx's local const)
// ---------------------------------------------------------------------------

const STAKE_LEVELS = [1, 3, 6, 9, 12] as const
const DEV_FOLIO_OFFSET_Y = 44
const DEV_FOLIO_OPEN_MS = 220
const DEV_FOLIO_CLOSE_MS = 180

type DevPanelPhase = 'closed' | 'opening' | 'open' | 'closing'

function DevSectionSummary({
  marker,
  title,
  summary,
}: {
  marker: string
  title: string
  summary: string
}) {
  return (
    <summary className="live-dev-controls__section-head">
      <span className="live-dev-controls__section-marker">{marker}</span>
      <span className="live-dev-controls__section-title">{title}</span>
      <span className="live-dev-controls__section-summary">{summary}</span>
      <span className="live-dev-controls__section-chevron" aria-hidden="true" />
    </summary>
  )
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LiveDevPanelProps {
  // Hook bag — covers all dev-panel state
  devControls: LiveDevControlsState

  // Session
  session: SessionPayload | null

  // Derived / computed values that belong to LiveGame.tsx
  matchStartDisabled: boolean
  isDealingCards: boolean
  settingsDrawerOpen: boolean
  compactViewportActive: boolean
  devControlsBusy: boolean
  devDebugSnapshot: LiveDevDebugSnapshot | null
  devScoreEditState: LiveDevScoreEditState
  heroScoreLocked: boolean
  villainScoreLocked: boolean
  selectedStakeResponse: SessionAction | null
  pendingStakeOverride: SessionBotOverride | null
  pendingVillainCardOverride: SessionBotOverride | null
  pendingForceRaiseOverride: SessionBotOverride | null
  canReplayGameStartAnimation: boolean
  canReplayLastPayoffFx: boolean

  // Sound
  currentSoundTheme: TableSoundTheme

  // Callbacks
  startNewGame: (dealerChoice?: DealerChoice) => void | Promise<void>
  reloadCurrentMatch: () => void
  copyCurrentMatchId: () => Promise<void>
  triggerDevCardsToDeck: () => void
  triggerDevDealAnimation: () => void
  replayGameStartAnimation: () => void
  replayLastPayoffFx: () => void
  triggerDevStakeFx: (action: 'raise' | 'reraise' | 'accept' | 'decline', actor?: 'hero' | 'villain') => void
  triggerDevElevenDecisionFx: (mode: ScorePadElevenFocusMode) => void
  triggerDevElevenStakeFx: (action: 'accept' | 'decline') => void
  triggerDevScoreFx: () => void
  triggerDevMatchCompletePreview: (tone: 'victory' | 'defeat') => void
  playCurrentThemeReel: () => void
  playAuditionThemeReel: () => void
  previewDevCue: (themeId: SoundThemeId, cue: SoundCue) => void
  applyDevScore: () => Promise<void>
  applyDevBotOverride: (action: SessionBotOverride | null) => Promise<void>
  refreshDevVillainCards: () => Promise<void>
  resetFirstRunDeckPicker: () => void
  gameplayHints: GameplayHintsState
  updateGameplayHints: (updater: (previous: GameplayHintsState) => GameplayHintsState) => void
  devPreviewHint: 'raise' | 'elevenHand' | null
  setDevPreviewHint: (hint: 'raise' | 'elevenHand' | null) => void
}

// ---------------------------------------------------------------------------
// Imports for constants
// ---------------------------------------------------------------------------

import { SOUND_CUES, TABLE_SOUND_THEMES } from '../../lib/table-sound-fx'

// ---------------------------------------------------------------------------
// LiveDevPanel component
// ---------------------------------------------------------------------------

export function LiveDevPanel({
  devControls,
  session,
  matchStartDisabled,
  isDealingCards,
  settingsDrawerOpen,
  compactViewportActive,
  devControlsBusy,
  devDebugSnapshot,
  devScoreEditState,
  heroScoreLocked,
  villainScoreLocked,
  selectedStakeResponse,
  pendingStakeOverride,
  pendingVillainCardOverride,
  pendingForceRaiseOverride,
  canReplayGameStartAnimation,
  canReplayLastPayoffFx,
  currentSoundTheme,
  startNewGame,
  reloadCurrentMatch,
  copyCurrentMatchId,
  triggerDevCardsToDeck,
  triggerDevDealAnimation,
  replayGameStartAnimation,
  replayLastPayoffFx,
  triggerDevStakeFx,
  triggerDevElevenDecisionFx,
  triggerDevElevenStakeFx,
  triggerDevScoreFx,
  triggerDevMatchCompletePreview,
  playCurrentThemeReel,
  playAuditionThemeReel,
  previewDevCue,
  applyDevScore,
  applyDevBotOverride,
  refreshDevVillainCards,
  resetFirstRunDeckPicker,
  gameplayHints,
  updateGameplayHints,
  devPreviewHint,
  setDevPreviewHint,
}: LiveDevPanelProps) {
  const {
    devPanelRef,
    devPanelOpen,
    setDevPanelOpen,
    devPanelPosition,
    resetDevPanelPosition,
    isDraggingDevPanel,
    handleDevPanelPointerDown,
    devSectionOpenState,
    setDevSectionOpenState,
    devClipboardMessage,
    devDealerChoice,
    devNextViraRank,
    setDevNextViraRank,
    setDevDealerChoice,
    devScoreHero,
    setDevScoreHero,
    devScoreVillain,
    setDevScoreVillain,
    devStakeResponseAction,
    setDevStakeResponseAction,
    devVillainCards,
    devVillainCardsStale,
    devAnimStakeFrom,
    setDevAnimStakeFrom,
    devLampSwingLeadMs,
    setDevLampSwingLeadMs,
    devAnimScorePoints,
    setDevAnimScorePoints,
    devAnimScoreWinner,
    setDevAnimScoreWinner,
    devStakeFxActor,
    setDevStakeFxActor,
    devAuditionThemeId,
    setDevAuditionThemeId,
    devAuditionCue,
    setDevAuditionCue,
    flashDevClipboardMessage,
  } = devControls

  const [hydrated, setHydrated] = useState(false)
  const [devPanelPhase, setDevPanelPhase] = useState<DevPanelPhase>(
    devPanelOpen ? 'open' : 'closed',
  )

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (devPanelOpen) {
      setDevPanelPhase('opening')
      const openTimer = window.setTimeout(() => {
        setDevPanelPhase('open')
      }, DEV_FOLIO_OPEN_MS)
      return () => { window.clearTimeout(openTimer) }
    }

    setDevPanelPhase((phase) => phase === 'closed' ? 'closed' : 'closing')
    const closeTimer = window.setTimeout(() => {
      setDevPanelPhase('closed')
    }, DEV_FOLIO_CLOSE_MS)
    return () => { window.clearTimeout(closeTimer) }
  }, [devPanelOpen])

  const devPanelExpanded = devPanelPhase !== 'closed'
  const devPanelStyle = !compactViewportActive && devPanelPosition
    ? {
        left: `${devPanelPosition.x}px`,
        top: `${devPanelPosition.y + (devPanelExpanded ? DEV_FOLIO_OFFSET_Y : 0)}px`,
        right: 'auto',
        bottom: 'auto',
      }
    : undefined
  const setDevSectionOpen = (section: LiveDevControlsSectionId, isOpen: boolean) => {
    setDevSectionOpenState((previousState) => (
      previousState[section] === isOpen
        ? previousState
        : {
            ...previousState,
            [section]: isOpen,
          }
    ))
  }

  if (!hydrated || (compactViewportActive && !devPanelExpanded)) {
    return null
  }

  return (
    <aside
      ref={devPanelRef}
      className={[
        'live-dev-controls',
        devPanelExpanded ? 'is-open' : 'is-collapsed',
        `is-${devPanelPhase}`,
        settingsDrawerOpen ? 'is-obscured' : '',
      ].filter(Boolean).join(' ')}
      data-testid="live-dev-controls"
      data-dragging={isDraggingDevPanel ? 'true' : 'false'}
      style={devPanelStyle}
    >
      {devPanelExpanded ? (
        <div
          className="live-dev-controls__folio-header"
          onPointerDown={compactViewportActive
            ? undefined
            : (event) => {
                handleDevPanelPointerDown(event, { displayOffsetY: DEV_FOLIO_OFFSET_Y })
              }}
          title={compactViewportActive ? undefined : 'Drag the title strip to move dev controls'}
        >
          <div className="live-dev-controls__title">
            <span className="live-dev-controls__eyebrow">scaffolding · not for players</span>
            <h3>Dev controls</h3>
          </div>
          <button
            type="button"
            className="live-dev-controls__close"
            onClick={() => { setDevPanelOpen(false) }}
            aria-expanded={devPanelExpanded}
            aria-label="Collapse dev controls"
          >
            <span className="live-dev-controls__close-x" aria-hidden="true">×</span>
            <span>close</span>
          </button>
        </div>
      ) : (
        <div className="live-dev-controls__plaque">
          <button
            type="button"
            className="live-dev-controls__plaque-grip"
            onPointerDown={(event) => {
              handleDevPanelPointerDown(event, { force: true })
            }}
            onDoubleClick={resetDevPanelPosition}
            aria-label="Move dev controls"
            title="Drag to move. Double-click to reset."
          >
            <span className="live-dev-controls__plaque-screw" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="live-dev-controls__plaque-label live-dev-controls__toggle"
            onClick={() => { setDevPanelOpen(true) }}
            aria-expanded={devPanelExpanded}
            aria-label="Expand dev controls"
          >
            <span className="live-dev-controls__toggle-label">DEV</span>
          </button>
          <button
            type="button"
            className="live-dev-controls__plaque-grip"
            onPointerDown={(event) => {
              handleDevPanelPointerDown(event, { force: true })
            }}
            onDoubleClick={resetDevPanelPosition}
            aria-label="Move dev controls"
            title="Drag to move. Double-click to reset."
          >
            <span className="live-dev-controls__plaque-screw" aria-hidden="true" />
          </button>
        </div>
      )}

      {devPanelExpanded && (
        <div className="live-dev-controls__body">
        <div className="live-dev-controls__session-bar" data-testid="live-dev-controls-match-id">
          <button
            type="button"
            className="live-dev-controls__match-id"
            disabled={!session}
            onClick={() => { void copyCurrentMatchId() }}
            title="Copy match ID"
          >
            {session?.matchId
              ? `#${session.matchId.slice(0, 8)}…`
              : 'No match'}
          </button>
          {devClipboardMessage && (
            <span className="live-dev-controls__copied" role="status">{devClipboardMessage}</span>
          )}
          <button
            type="button"
            className="live-dev-controls__icon-btn"
            disabled={!session || devControlsBusy}
            onClick={reloadCurrentMatch}
            title="Reload match"
            aria-label="Reload match"
          >
            {'↻'}
          </button>
        </div>

        <div className="live-dev-controls__new-match">
          <span className="live-dev-controls__segmented-label">Starts</span>
          <div className="live-dev-controls__segmented" role="radiogroup" aria-label="Dealer choice">
            {([['random', 'rand'], [0, 'you'], [1, 'them']] as const).map(([choice, label]) => (
              <button
                key={String(choice)}
                type="button"
                className={`live-dev-controls__seg-btn${devDealerChoice === choice ? ' is-active' : ''}`}
                onClick={() => setDevDealerChoice(choice)}
                aria-pressed={devDealerChoice === choice}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="live-dev-controls__primary-action"
            disabled={matchStartDisabled}
            onClick={() => { void startNewGame(devDealerChoice === 'random' ? undefined : devDealerChoice) }}
          >
            <span className="live-dev-controls__stamp-stars" aria-hidden="true">· · ·</span>
            new match
          </button>
        </div>

        <div className="live-dev-controls__new-match">
          <span className="live-dev-controls__segmented-label">Next vira</span>
          <select
            value={devNextViraRank}
            aria-label="Force the next hand's turnup rank"
            data-testid="live-dev-next-vira-select"
            onChange={(event) => { setDevNextViraRank(event.target.value) }}
          >
            {(['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3', 'random'] as const).map((rank) => (
              <option key={rank} value={rank}>{rank}</option>
            ))}
          </select>
        </div>

        <div className="live-dev-controls__result-preview">
          <div className="live-dev-controls__readout live-dev-controls__readout--compact">
            <span>Result screen</span>
            <strong>slow title reveal</strong>
          </div>
          <div className="live-dev-controls__sound-actions">
            <button
              type="button"
              data-testid="live-dev-trigger-match-hold-victory"
              disabled={!session || devControlsBusy}
              onClick={() => { triggerDevMatchCompletePreview('victory') }}
            >
              Win Screen
            </button>
            <button
              type="button"
              data-testid="live-dev-trigger-match-hold-defeat"
              disabled={!session || devControlsBusy}
              onClick={() => { triggerDevMatchCompletePreview('defeat') }}
            >
              Loss Screen
            </button>
          </div>
        </div>

        <details
          className="live-dev-controls__section"
          open={devSectionOpenState.animations}
          onToggle={(event) => { setDevSectionOpen('animations', event.currentTarget.open) }}
        >
          <DevSectionSummary marker="i." title="Animations" summary="deck · deal · stake · score" />
          <div className="live-dev-controls__section-body">
          <div className="live-dev-controls__anim-row">
            <button
              type="button"
              disabled={!session || isDealingCards}
              onClick={triggerDevCardsToDeck}
              title="Hide all cards (end-of-hand)"
            >
              Cards to Deck
            </button>
            <button
              type="button"
              disabled={!session || isDealingCards}
              onClick={triggerDevDealAnimation}
              title="Re-run deal animation"
            >
              Deal Cards
            </button>
            <button
              type="button"
              disabled={!canReplayGameStartAnimation}
              onClick={replayGameStartAnimation}
              title="Replay the Farol game-start tilt and deal"
            >
              Replay Start
            </button>
            <button
              type="button"
              disabled={!canReplayLastPayoffFx}
              onClick={replayLastPayoffFx}
              title="Replay last hand-end score animation"
            >
              Replay Score FX
            </button>
          </div>
          <div className="live-dev-controls__stack">
            <label className="live-dev-controls__field">
              <span>Stake from</span>
              <select
                value={devAnimStakeFrom}
                aria-label="Starting stake for animation"
                onChange={(event) => { setDevAnimStakeFrom(Number(event.target.value)) }}
              >
                {STAKE_LEVELS.slice(0, -1).map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </label>
            <label className="live-dev-controls__field">
              <span>Lamp lead {devLampSwingLeadMs}ms</span>
              <input
                type="range"
                min="0"
                max="1000"
                step="5"
                value={devLampSwingLeadMs}
                aria-label="Lamp swing visual lead"
                data-testid="live-dev-lamp-swing-lead"
                onChange={(event) => {
                  setDevLampSwingLeadMs(Number(event.target.value))
                }}
              />
            </label>
            <div className="live-dev-controls__segmented" role="radiogroup" aria-label="Stake FX actor">
              {(['villain', 'hero'] as const).map((actor) => (
                <button
                  key={actor}
                  type="button"
                  className={`live-dev-controls__seg-btn${devStakeFxActor === actor ? ' is-active' : ''}`}
                  onClick={() => { setDevStakeFxActor(actor) }}
                  aria-pressed={devStakeFxActor === actor}
                >
                  {actor === 'hero' ? 'You' : 'Them'}
                </button>
              ))}
            </div>
            <div className="live-dev-controls__sound-actions">
              <button type="button" onClick={() => { triggerDevStakeFx('raise', devStakeFxActor) }}>Raise</button>
              <button type="button" onClick={() => { triggerDevStakeFx('reraise', devStakeFxActor) }}>Reraise</button>
              <button type="button" onClick={() => { triggerDevStakeFx('accept', devStakeFxActor) }}>Accept</button>
              <button type="button" onClick={() => { triggerDevStakeFx('decline', devStakeFxActor) }}>Decline</button>
            </div>
            <div className="live-dev-controls__sound-actions">
              <button type="button" onClick={() => { triggerDevElevenDecisionFx('hero') }}>11 You</button>
              <button type="button" onClick={() => { triggerDevElevenDecisionFx('villain') }}>11 Them</button>
              <button type="button" onClick={() => { triggerDevElevenDecisionFx('duel') }}>11v11</button>
              <button type="button" onClick={() => { triggerDevElevenStakeFx('accept') }}>Accept 11</button>
              <button type="button" onClick={() => { triggerDevElevenStakeFx('decline') }}>Fold 11</button>
            </div>
          </div>
          <div className="live-dev-controls__stack">
            <div className="live-dev-controls__segmented" role="radiogroup" aria-label="Score winner">
              {(['hero', 'villain'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  className={`live-dev-controls__seg-btn${devAnimScoreWinner === side ? ' is-active' : ''}`}
                  onClick={() => { setDevAnimScoreWinner(side) }}
                  aria-pressed={devAnimScoreWinner === side}
                >
                  {side === 'hero' ? 'You' : 'Them'}
                </button>
              ))}
            </div>
            <label className="live-dev-controls__field">
              <span>Points</span>
              <select
                value={devAnimScorePoints}
                aria-label="Points for score animation"
                onChange={(event) => { setDevAnimScorePoints(Number(event.target.value)) }}
              >
                {STAKE_LEVELS.map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={triggerDevScoreFx}>Score</button>
          </div>
          </div>
        </details>

        <details
          className="live-dev-controls__section"
          open={devSectionOpenState.soundLab}
          onToggle={(event) => { setDevSectionOpen('soundLab', event.currentTarget.open) }}
        >
          <DevSectionSummary marker="ii." title="Sound Lab" summary="theme · cue" />
          <div className="live-dev-controls__section-body">
          <div className="live-dev-controls__readout" data-testid="live-dev-sound-theme-current">
            <span>Current</span>
            <strong>{currentSoundTheme.label}</strong>
            <span className="live-dev-controls__pill">live</span>
          </div>
          <div className="live-dev-controls__stack" data-testid="live-dev-sound-lab">
            <label className="live-dev-controls__field">
              <span>Audition</span>
              <select
                value={devAuditionThemeId}
                aria-label="Dev Audition Theme"
                onChange={(event) => {
                  setDevAuditionThemeId(event.target.value as SoundThemeId)
                }}
              >
                {TABLE_SOUND_THEMES.map((theme) => (
                  <option key={theme.id} value={theme.id}>{theme.label}</option>
                ))}
              </select>
            </label>
            <label className="live-dev-controls__field">
              <span>Cue</span>
              <select
                value={devAuditionCue}
                aria-label="Dev Sound Cue"
                onChange={(event) => {
                  setDevAuditionCue(event.target.value as SoundCue)
                }}
              >
                {SOUND_CUES.map((cue) => (
                  <option key={cue} value={cue}>{cue.replaceAll('_', ' ')}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="live-dev-controls__sound-actions">
            <button type="button" onClick={playCurrentThemeReel} title="Play current theme reel">
              Reel
            </button>
            <button type="button" onClick={playAuditionThemeReel} title="Play audition theme reel">
              Audition
            </button>
            <button
              type="button"
              onClick={() => { previewDevCue(devAuditionThemeId, devAuditionCue) }}
              title="Play selected cue"
            >
              Cue
            </button>
          </div>
          </div>
        </details>

        <details
          className="live-dev-controls__section"
          open={devSectionOpenState.debug}
          onToggle={(event) => { setDevSectionOpen('debug', event.currentTarget.open) }}
        >
          <DevSectionSummary marker="iii." title="Debug" summary={devDebugSnapshot ? 'state · pending' : 'no match'} />
          <div className="live-dev-controls__section-body">
          {devDebugSnapshot ? (
            <dl className="live-dev-controls__debug" data-testid="live-dev-controls-debug">
              <div>
                <dt>State</dt>
                <dd>{devDebugSnapshot.handState}</dd>
              </div>
              <div>
                <dt>Pending</dt>
                <dd>{devDebugSnapshot.pending}</dd>
              </div>
              <div>
                <dt>Actions</dt>
                <dd>{devDebugSnapshot.legalActions}</dd>
              </div>
              <div>
                <dt>Notice</dt>
                <dd>{devDebugSnapshot.notice}</dd>
              </div>
            </dl>
          ) : (
            <div className="live-dev-controls__empty">Start or load a match to inspect live state.</div>
          )}
          </div>
        </details>

        <details
          className="live-dev-controls__section"
          open={devSectionOpenState.gameState}
          onToggle={(event) => { setDevSectionOpen('gameState', event.currentTarget.open) }}
        >
          <DevSectionSummary marker="iv." title="Game State" summary="score · overrides" />
          <div className="live-dev-controls__section-body">
          {session ? (
            <>
              <div className="live-dev-controls__game-subsection" data-testid="live-dev-game-state-score">
                <div className="live-dev-controls__subheading">Score</div>
                <div className="live-dev-controls__score-grid">
                  <label className="live-dev-controls__score-field">
                    <span>You</span>
                    {heroScoreLocked ? (
                      <div className="live-dev-controls__score-static">11</div>
                    ) : (
                      <input
                        className="live-dev-controls__score-input"
                        type="number"
                        min="0"
                        max="10"
                        step="1"
                        value={devScoreHero}
                        onChange={(event) => {
                          const nextValue = Number(event.target.value)
                          setDevScoreHero(
                            Number.isFinite(nextValue)
                              ? Math.max(0, Math.min(10, Math.trunc(nextValue)))
                              : 0,
                          )
                        }}
                      />
                    )}
                  </label>
                  <label className="live-dev-controls__score-field">
                    <span>Them</span>
                    {villainScoreLocked ? (
                      <div className="live-dev-controls__score-static">11</div>
                    ) : (
                      <input
                        className="live-dev-controls__score-input"
                        type="number"
                        min="0"
                        max="10"
                        step="1"
                        value={devScoreVillain}
                        onChange={(event) => {
                          const nextValue = Number(event.target.value)
                          setDevScoreVillain(
                            Number.isFinite(nextValue)
                              ? Math.max(0, Math.min(10, Math.trunc(nextValue)))
                              : 0,
                          )
                        }}
                      />
                    )}
                  </label>
                </div>
                <button
                  type="button"
                  disabled={devControlsBusy || !devScoreEditState.canApply}
                  onClick={() => { void applyDevScore() }}
                >
                  Set Score
                </button>
                {(heroScoreLocked || villainScoreLocked) && (
                  <p className="live-dev-controls__hint">
                    Score editing locks once a side reaches eleven.
                  </p>
                )}
              </div>

              <div className="live-dev-controls__game-subsection" data-testid="live-dev-game-state-stake-response">
                <label className="live-dev-controls__field">
                  <span>Their raise response</span>
                  <select
                    value={devStakeResponseAction}
                    aria-label="Their response to your next raise"
                    onChange={(event) => {
                      setDevStakeResponseAction(event.target.value as 'accept_raise' | 'fold')
                    }}
                  >
                    <option value="accept_raise">Accept</option>
                    <option value="fold">Fold</option>
                  </select>
                </label>
                <button
                  type="button"
                  disabled={devControlsBusy || selectedStakeResponse == null}
                  onClick={() => { void applyDevBotOverride(selectedStakeResponse) }}
                >
                  Set
                </button>
                {pendingStakeOverride && (
                  <div className="live-dev-controls__override-status">
                    <div className="live-dev-controls__override-copy">
                      <strong>Pending override</strong>
                      <span>{describeSessionAction(pendingStakeOverride, devVillainCards)}</span>
                    </div>
                    <button
                      type="button"
                      className="live-dev-controls__override-clear"
                      disabled={devControlsBusy}
                      onClick={() => { void applyDevBotOverride(null) }}
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              <div className="live-dev-controls__game-subsection" data-testid="live-dev-game-state-force-raise">
                <div className="live-dev-controls__subheading">Force Raise</div>
                <button
                  type="button"
                  disabled={devControlsBusy || !session.publicView.hand_in_progress}
                  onClick={() => {
                    void applyDevBotOverride({ type: 'next_legal_raise' })
                  }}
                >
                  Force their next legal raise
                </button>
                <p className="live-dev-controls__hint">
                  Queues the next time raise is legal for them.
                </p>
                {pendingForceRaiseOverride && (
                  <div className="live-dev-controls__override-status">
                    <div className="live-dev-controls__override-copy">
                      <strong>Pending force raise</strong>
                      <span>{describeSessionAction(pendingForceRaiseOverride, devVillainCards)}</span>
                    </div>
                    <button
                      type="button"
                      className="live-dev-controls__override-clear"
                      disabled={devControlsBusy}
                      onClick={() => { void applyDevBotOverride(null) }}
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              <div className="live-dev-controls__game-subsection" data-testid="live-dev-game-state-villain-cards">
                <div className="live-dev-controls__subheading">Their Cards</div>
                <button
                  type="button"
                  disabled={devControlsBusy || !session.publicView.hand_in_progress}
                  onClick={() => { void refreshDevVillainCards() }}
                >
                  {devVillainCards ? 'Refresh cards' : 'Reveal cards'}
                </button>
                {devVillainCardsStale && (
                  <div className="live-dev-controls__flash">
                    Revealed cards are stale after a new hand. Refresh to target the current hand.
                  </div>
                )}
                {devVillainCards && devVillainCards.length > 0 ? (
                  <div className="live-dev-controls__card-list">
                    {devVillainCards.map((card) => (
                      <div
                        key={card.id}
                        className={`live-dev-controls__card-row${devVillainCardsStale ? ' is-stale' : ''}`}
                      >
                        <div className="live-dev-controls__card-meta">
                          <strong>{cardLabel(card)}</strong>
                          <span>{card.id}</span>
                        </div>
                        <div className="live-dev-controls__card-actions">
                          <button
                            type="button"
                            disabled={devControlsBusy || devVillainCardsStale}
                            onClick={() => { void applyDevBotOverride({ type: 'play_face_up', card_id: card.id }) }}
                          >
                            ↑ Face-up
                          </button>
                          <button
                            type="button"
                            disabled={devControlsBusy || devVillainCardsStale}
                            onClick={() => { void applyDevBotOverride({ type: 'play_face_down', card_id: card.id }) }}
                          >
                            ↓ Face-down
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="live-dev-controls__empty">
                    Reveal their hand to queue an exact card play.
                  </div>
                )}
                {pendingVillainCardOverride && (
                  <div className="live-dev-controls__override-status">
                    <div className="live-dev-controls__override-copy">
                      <strong>Pending override</strong>
                      <span>{describeSessionAction(pendingVillainCardOverride, devVillainCards)}</span>
                    </div>
                    <button
                      type="button"
                      className="live-dev-controls__override-clear"
                      disabled={devControlsBusy}
                      onClick={() => { void applyDevBotOverride(null) }}
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="live-dev-controls__empty">Start or load a match to edit the live game state.</div>
          )}
          </div>
        </details>

        <details
          className="live-dev-controls__section"
          open={devSectionOpenState.hints}
          onToggle={(event) => { setDevSectionOpen('hints', event.currentTarget.open) }}
        >
          <DevSectionSummary
            marker="v."
            title="Tutorial"
            summary={gameplayHints.hintsEnabled ? 'on' : 'off'}
          />
          <div className="live-dev-controls__section-body">
            <div className="live-dev-controls__stack">
              <div className="live-dev-controls__segmented" role="radiogroup" aria-label="Gameplay hints enabled">
                <button
                  type="button"
                  className={`live-dev-controls__seg-btn${gameplayHints.hintsEnabled ? ' is-active' : ''}`}
                  aria-pressed={gameplayHints.hintsEnabled}
                  onClick={() => { updateGameplayHints((s) => setHintsEnabled(s, true)) }}
                >
                  Hints on
                </button>
                <button
                  type="button"
                  className={`live-dev-controls__seg-btn${!gameplayHints.hintsEnabled ? ' is-active' : ''}`}
                  aria-pressed={!gameplayHints.hintsEnabled}
                  onClick={() => { updateGameplayHints((s) => setHintsEnabled(s, false)) }}
                >
                  Hints off
                </button>
              </div>
              <div className="live-dev-controls__readout live-dev-controls__readout--compact">
                Preview hint on the action rail:
              </div>
              <div className="live-dev-controls__sound-actions">
                <button
                  type="button"
                  aria-pressed={devPreviewHint === 'raise'}
                  onClick={() => { setDevPreviewHint(devPreviewHint === 'raise' ? null : 'raise') }}
                >
                  {devPreviewHint === 'raise' ? '✓ Raise' : 'Raise'}
                </button>
                <button
                  type="button"
                  aria-pressed={devPreviewHint === 'elevenHand'}
                  onClick={() => { setDevPreviewHint(devPreviewHint === 'elevenHand' ? null : 'elevenHand') }}
                >
                  {devPreviewHint === 'elevenHand' ? '✓ Eleven' : 'Eleven'}
                </button>
              </div>
              <div className="live-dev-controls__readout live-dev-controls__readout--compact">
                <span>Deck picker</span>
                <strong>Reset first-run prompt</strong>
                <p className="live-dev-controls__hint">
                  Shows the deck choice again for this match, or the next match if none is loaded.
                </p>
              </div>
              <div className="live-dev-controls__sound-actions live-dev-controls__sound-actions--single">
                <button
                  type="button"
                  data-testid="live-dev-reset-deck-picker"
                  onClick={() => {
                    resetFirstRunDeckPicker()
                    flashDevClipboardMessage('Deck picker reset')
                  }}
                >
                  Show Deck Picker
                </button>
              </div>
            </div>
          </div>
        </details>
      </div>
      )}
    </aside>
  )
}
