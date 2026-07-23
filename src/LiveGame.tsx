'use client'

import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, LayoutGroup, type PanInfo } from 'framer-motion'

import {
  advanceBotTurns,
  applySessionAction,
  createBotSession,
  fetchLlmProviderCatalogs,
  fetchSolverBotStatus,
  fetchSession,
  startNextHand,
  SessionRequestError,
  type BotKind,
  type BotProfile,
  type LlmProviderCatalog,
  type PlayerSessionView,
  type PublicPlay,
  type SessionAction,
  type SessionCard,
  type StateCompletedRound,
  type StatePlay,
  type SessionPayload,
} from './lib/session-api'
import { debugLog } from './lib/debug-log-client.ts'
import { buildStudySpotString, studySpotAvailability, studySpotSolved } from './lib/study-link.ts'
import {
  findLlmProviderCatalog,
  getLlmSelectionIssue,
  isLlmBotKind,
  resolvePreferredLlmModel,
  type DealerChoice,
  type Seat,
} from './lib/live-bot-selection'
import {
  buildDefaultLiveSoundSettings,
  persistLiveSoundSettings,
  readLiveSoundSettings,
  sanitizeLiveSoundSettings,
  type LiveSoundSettings,
} from './lib/live-sound-settings'
import {
  buildDefaultLiveGamePreferences,
  persistLiveGamePreferences,
  readLiveGamePreferences,
  resetDeckPickerPrompt,
  sanitizeLiveGamePreferences,
  type LiveGamePreferences,
} from './lib/live-game-preferences'
import {
  persistLiveMatchSetupPreferences,
  readLiveMatchSetupPreferences,
} from './lib/live-match-setup-preferences'
import {
  DEFAULT_DECK_SYSTEM,
  MAX_DECK_PICKER_DISMISSALS,
  type DeckSystem,
} from './lib/deck-system'
import {
  assignLiveShortcut,
  type LiveShortcutAction,
} from './lib/live-keyboard-shortcuts'
import {
  areLiveDevControlsEnabled,
  buildLiveDevDebugSnapshot,
  deriveLiveDevScoreEditState,
} from './lib/live-dev-controls'
import { useLiveDevActions } from './lib/use-live-dev-actions'
import { useLiveDevControls } from './lib/use-live-dev-controls'
import { useLivePanelLayout } from './lib/use-live-panel-layout'
import { useLiveShortcuts } from './lib/use-live-shortcuts'
import { type HandEndPayoff, type DisplayScore } from './lib/use-live-animations'
import type { GatherDealerSide } from './lib/live-engine-events'
import { type SessionFailureState } from './lib/use-live-game-session'
import { useLiveEngineState } from './lib/use-live-engine-state'
import { suitGlyph, type CardDisplay } from './lib/live-card-utils'
import {
  resolveScorePadElevenRingSide,
  type ScorePadElevenFocusMode,
  type ScorePadSide,
} from './lib/score-pad-eleven-markers'
import {
  deriveStableHandCardSlots,
  deriveVisibleOpponentHandSlots,
  handSlotIndexFromCardId,
  reorderStableHandCardSlots,
  type StableHandSlotState,
} from './lib/live-hand-slots'
import { FarolActionRail } from './components/farol/FarolActionRail'
import { LiveDevPanel } from './components/live/LiveDevPanel'
import {
  LiveLauncherOverlay,
  LiveMatchCompleteOverlay,
  LiveNewMatchConfirmDialog,
} from './components/live/LiveMatchOverlays'
import type { MatchHistoryResult } from './components/live/LiveMatchOverlays'
import { FirstRunDeckPicker } from './components/live/FirstRunDeckPicker'
import { LiveSettingsDrawer } from './components/live/LiveSettingsDrawer'
import { FarolTable } from './components/farol/FarolTable'
import { DeckCard } from './components/farol/DeckCard'
import { LiveHeroHand, LiveVillainHand } from './components/live/LiveHand'
import { StrengthGuidePanel } from './components/live/StrengthGuide'
import { nextManilhaRank } from './components/farol/farol-card-utils'
import { LiveMatchNotFound, type MatchNotFoundReason } from './components/live/LiveMatchNotFound'
import { LiveSessionFailureNote } from './components/live/LiveSessionFailureNote'
import { useRouter } from './i18n/navigation'

import './components/live/LiveArena.css'
import {
  buildLiveSessionPath,
  extractLiveMatchId,
} from './lib/live-session-links'
import {
  normalizeLiveSessionErrorCode,
  shouldClearBrokenMatchQuery,
  toLiveSessionFailure,
} from './lib/live-session-failures'
import {
  buildRecentLiveMatch,
  clearRecentLiveMatch,
  persistRecentLiveMatch,
  readRecentLiveMatch,
  type RecentLiveMatch,
} from './lib/live-recent-match'
import {
  deriveOptimisticStakeFx,
  deriveStakeFxFromSessionDiff,
  isSameStakeFx,
  shouldDelayStakeFxUntilAfterNewHandDeal,
  shouldDelayStakeFxUntilAfterRoundPreview,
  soundCueForDelayedOpeningStakeFx,
  soundCueForStakeFx,
  type SessionSnapshotSource,
  type StakeFx,
} from './lib/live-stake-fx'
import {
  type ScoreSide,
} from './lib/live-score-celebration'
import {
  resolveScoreSoundPoints,
  scoreSoundSettleMsForPayoff,
  scoreSoundPointsForPayoff,
} from './lib/live-score-sound'
import { resolveElevenTensionSoundCue } from './lib/eleven-tension-fx'
import {
  buildStoredReviewRounds,
  normalizeStoredLastHandReview,
  type StoredLastHandReview,
  type StoredReviewSummary,
} from './lib/live-hand-review'
import { minimumRaiseResponseReadMs } from './lib/live-lamp-fx'
import {
  DEFAULT_SOUND_THEME_ID,
  getTableSoundTheme,
  useTableSoundFx,
  type SoundCue,
  type SoundThemeId,
} from './lib/table-sound-fx'
import {
  buildDefaultStrengthGuideDiscovery,
  isStrengthGuideAvailable,
  isStrengthGuidePeekStowed,
  markStrengthGuideHandSeen,
  markStrengthGuideOpened,
  persistStrengthGuideDiscovery,
  readStrengthGuideDiscovery,
  shouldPulseStrengthGuide,
  type StrengthGuideDiscovery,
} from './lib/strength-guide'
import {
  buildDefaultGameplayHints,
  dismissElevenHandHint,
  dismissRaiseHint,
  persistGameplayHints,
  readGameplayHints,
  setHintsEnabled,
  shouldShowElevenHandHint,
  shouldShowRaiseHint,
  type GameplayHintsState,
} from './lib/live-gameplay-hints'

type PendingNewMatchRequest = {
  dealerChoice: DealerChoice
}
// Route availability is runtime/server-side. Product links are a separate
// build-time choice so stealth can be reachable without advertising itself.
const STUDY_LAB_LINKS_ENABLED = process.env.NEXT_PUBLIC_STUDY_LAB_LINKS !== undefined
  ? process.env.NEXT_PUBLIC_STUDY_LAB_LINKS === 'true'
  : process.env.NODE_ENV !== 'production'
const STUDY_MANIFEST_URL = process.env.NEXT_PUBLIC_STUDY_MANIFEST_URL || '/study/manifest.json'
const RAISE_LADDER = [1, 3, 6, 9, 12] as const
const STAKE_LEVELS = RAISE_LADDER
const LAYOUT_MOVE_DURATION_S = 0.15
const DEAL_ANIM_DURATION_MS = 260
const DEAL_STEP_PAUSE_MS = 30
const HERO_DEAL_FLIP_DELAY_MS = 80
const OPPONENT_PLAY_OVERLAY_MS = 300
const OPENING_VILLAIN_ACTION_DELAY_MS = 650
const BOT_ELEVEN_DECISION_AFTER_DEAL_MS = 300
const HERO_RESPONSE_FOLLOW_DELAY_MS = 90
const STAKE_RESPONSE_FOLLOW_DELAY_MS = 600
const STAKE_RESPONSE_REVEAL_GAP_MS = 160
const STAKE_RESPONSE_PAYOFF_GAP_MS = 300
const ACCEPT_RESPONSE_FOLLOW_DELAY_MS = 600
const OPTIMISTIC_STAKE_RESPONSE_MAX_AGE_MS = 2400
const DEV_ELEVEN_FOCUS_MS = 1600
const POST_ROUND_STAKE_REVEAL_GAP_MS = 140
const BETWEEN_HAND_GATHER_MS = 1040
// The shuffle sample is about 0.66s; leave a short tail before dealing.
const HAND_TRANSITION_DEAL_DELAY_MS = 760
const FAST_MODE_HAND_TRANSITION_DEAL_DELAY_MS = 0
const MATCH_RESULT_SOUND_DELAY_MS = 180
const MATCH_COMPLETE_OVERLAY_DELAY_MS = 2000
const DEV_MATCH_COMPLETE_SCREEN_HOLD_MS = 7200
const NEXT_HAND_DELAY_MS = 1200
const STAKE_FX_MS = 420
const STAKE_FX_BADGE_MS = 880
const ACCEPT_STAKE_FX_MS = 560
const ACCEPT_STAKE_FX_BADGE_MS = 1040
const VILLAIN_DECLINE_STAKE_FX_MS = 760
const VILLAIN_DECLINE_STAKE_FX_BADGE_MS = 1800
const START_MATCH_TIMEOUT_MS = 10000
const MATCH_LOAD_TIMEOUT_MS = 11000
const MATCH_ACTION_TIMEOUT_MS = 11000
const NEXT_HAND_TIMEOUT_MS = 12000
const SESSION_RECOVERY_TIMEOUT_MS = 12000
const PROVIDER_CATALOG_TIMEOUT_MS = 8000
const SESSION_TIMEOUT_RECOVERY_RETRY_DELAY_MS = 900
const SESSION_TIMEOUT_RECOVERY_ATTEMPTS = 3
const FAST_MODE_NEXT_HAND_DELAY_MS = 120
const ROUND_RESULT_PREVIEW_MS = 900
const FAST_MODE_ROUND_RESULT_PREVIEW_MS = 140
const HAND_END_GLOW_MS = 220
const FAST_MODE_HAND_END_GLOW_MS = 90
const HAND_END_TRANSFER_MS = 640
const FAST_MODE_HAND_END_TRANSFER_MS = 180
const HAND_END_LAND_MS = 180
const FAST_MODE_HAND_END_LAND_MS = 70
const HAND_END_SCORE_SETTLE_MS = 80
const FAST_MODE_HAND_END_SCORE_SETTLE_MS = 30
const SCORE_PULSE_MS = 520
const FAST_MODE_SCORE_PULSE_MS = 180
const NEXT_HAND_AFTER_PAYOFF_DELAY_MS = 140
const FAST_MODE_NEXT_HAND_AFTER_PAYOFF_DELAY_MS = 40
const FAROL_INTRO_PLAYABLE_HOLD_MS = 2000
const FAROL_INTRO_SETTLE_MS = 1600
const lastHandReviewStoragePrefix = 'truco-live-last-hand-review:'
type FarolIntroPhase = 'tilted' | 'settling' | null
type DealTarget = 'player' | 'opponent'

type QueuedSoundCue = {
  cue: Exclude<SoundCue, 'ui_click'>
  actor?: 'hero' | 'villain'
  scorePoints?: number
  stake?: number
  delayMs?: number
}
type OpponentPlaySoundCue = Extract<SoundCue, 'card_play' | 'card_hide'>
type OptimisticStakeSound = {
  action: 'raise' | 'reraise'
  stake: number
  fromStake: number
  playedAtMs: number
}
type HeroFaceDownPlaySoundOverride = 'card_play' | 'suppress'
type ActiveHeroDrag = {
  cardId: string
  index: number
  canDropOnTable: boolean
  canPlayFaceDown: boolean
}

function MotionCardBackGraphic({ deckSystem }: { deckSystem: DeckSystem }) {
  return (
    <DeckCard
      system={deckSystem}
      rank={1}
      suit="oros"
      size="lg"
      faceDown={true}
      style={{ width: '100%', height: '100%' }}
    />
  )
}

const EMPTY_HERO_HAND_REORDER_OFFSETS = [0, 0, 0]
const EMPTY_SESSION_CARDS: SessionCard[] = []

type StakeFxTimingTarget = Pick<StakeFx, 'action'> & Partial<Pick<StakeFx, 'actor'>>

function removeStagedFaceDownCardId(cardIds: Set<string>, cardId: string) {
  if (!cardIds.has(cardId)) return cardIds

  const nextCardIds = new Set(cardIds)
  nextCardIds.delete(cardId)
  return nextCardIds
}

function toggleStagedFaceDownCardId(cardIds: Set<string>, cardId: string) {
  const nextCardIds = new Set(cardIds)
  if (nextCardIds.has(cardId)) {
    nextCardIds.delete(cardId)
  } else {
    nextCardIds.add(cardId)
  }
  return nextCardIds
}

function filterStagedFaceDownCardIds(cardIds: Set<string>, hand: readonly SessionCard[] | null | undefined) {
  if (cardIds.size === 0) return cardIds
  if (!hand?.length) return new Set<string>()

  const handCardIds = new Set(hand.map((card) => card.id))
  const nextCardIds = new Set<string>()
  let changed = false

  cardIds.forEach((cardId) => {
    if (handCardIds.has(cardId)) {
      nextCardIds.add(cardId)
    } else {
      changed = true
    }
  })

  return changed ? nextCardIds : cardIds
}

function isVillainDeclineStakeFx(stakeFx: StakeFxTimingTarget | null) {
  return stakeFx?.actor === 'villain' && stakeFx.action === 'decline'
}

function stakeFxOverlayDurationMs(stakeFx: StakeFxTimingTarget | null) {
  if (isVillainDeclineStakeFx(stakeFx)) return VILLAIN_DECLINE_STAKE_FX_MS
  return stakeFx?.action === 'accept' ? ACCEPT_STAKE_FX_MS : STAKE_FX_MS
}

function stakeFxBadgeDurationMs(stakeFx: StakeFxTimingTarget | null) {
  if (isVillainDeclineStakeFx(stakeFx)) return VILLAIN_DECLINE_STAKE_FX_BADGE_MS
  return stakeFx?.action === 'accept' ? ACCEPT_STAKE_FX_BADGE_MS : STAKE_FX_BADGE_MS
}

function stakeFxVisibleDurationMs(stakeFx: StakeFxTimingTarget | null) {
  return Math.max(stakeFxOverlayDurationMs(stakeFx), stakeFxBadgeDurationMs(stakeFx))
}

type FixedMotionPoint = {
  x: number
  y: number
}

type DealAnimation = {
  step: number
  from: FixedMotionPoint
  to: FixedMotionPoint
  width: number
  height: number
  borderRadius: number
  rotateFrom: number
  rotateTo: number
}

type OverlayAnimation = {
  cardId: string
  from: FixedMotionPoint
  to: FixedMotionPoint
  width: number
  height: number
  borderRadius: number
  rotateFrom: number
  rotateTo: number
  toWidth?: number
  toHeight?: number
  toBorderRadius?: number
}

type ResolvedRoundPreview = {
  heroCard: CardDisplay | null
  villainCard: CardDisplay | null
  winner: Seat | null
}

const DEAL_ORDER: Array<{ target: DealTarget; index: number }> = [
  { target: 'player', index: 0 },
  { target: 'opponent', index: 0 },
  { target: 'player', index: 1 },
  { target: 'opponent', index: 1 },
  { target: 'player', index: 2 },
  { target: 'opponent', index: 2 },
]

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function getMotionElementRect(element: Element | null): DOMRect | null {
  if (!element) return null
  const cardElement = element.querySelector?.('.card, .card-ref') as HTMLElement | null
  return (cardElement ?? element).getBoundingClientRect()
}

function getMotionElementBorderRadius(element: Element | null) {
  if (!element) return 8
  const cardElement = (element.querySelector?.('.card, .card-ref') as HTMLElement | null) ?? (
    element instanceof HTMLElement ? element : null
  )
  if (!cardElement) return 8
  const resolved = Number.parseFloat(window.getComputedStyle(cardElement).borderTopLeftRadius)
  return Number.isFinite(resolved) ? resolved : 8
}

function getMotionElementSize(element: Element | null) {
  if (!element) return null
  const cardElement = (element.querySelector?.('.card, .card-ref') as HTMLElement | null) ?? (
    element instanceof HTMLElement ? element : null
  )
  if (!cardElement) return null

  const style = window.getComputedStyle(cardElement)
  const width = Number.parseFloat(style.width)
  const height = Number.parseFloat(style.height)
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { width, height }
  }

  const rect = cardElement.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  return { width: rect.width, height: rect.height }
}

function getMotionElementRotationDeg(element: Element | null) {
  if (!(element instanceof HTMLElement)) return 0
  const transform = window.getComputedStyle(element).transform
  if (!transform || transform === 'none') return 0

  const matrix = new DOMMatrixReadOnly(transform)
  const resolved = Math.atan2(matrix.b, matrix.a) * (180 / Math.PI)
  return Number.isFinite(resolved) ? resolved : 0
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

function nowMs() {
  return typeof window !== 'undefined' && 'performance' in window
    ? window.performance.now()
    : Date.now()
}

function isRaiseStakeAction(action: Pick<StakeFx, 'action'>['action']): action is OptimisticStakeSound['action'] {
  return action === 'raise' || action === 'reraise'
}

function resolveOptimisticStakeResponseDelayMs(
  optimisticStakeSound: OptimisticStakeSound | null,
  nextStakeFx: Pick<StakeFx, 'actor' | 'action' | 'stake'> | null,
  source: SessionSnapshotSource,
  fastModeEnabled = false,
) {
  if (source !== 'action' || fastModeEnabled || !optimisticStakeSound || nextStakeFx?.actor !== 'villain') {
    return 0
  }

  const ageMs = nowMs() - optimisticStakeSound.playedAtMs
  if (ageMs < 0 || ageMs > OPTIMISTIC_STAKE_RESPONSE_MAX_AGE_MS) {
    return 0
  }

  const minimumRaiseReadMs = minimumRaiseResponseReadMs({
    action: optimisticStakeSound.action,
    stake: optimisticStakeSound.stake,
    baseVisibleMs: stakeFxVisibleDurationMs(optimisticStakeSound),
    gapMs: STAKE_RESPONSE_REVEAL_GAP_MS,
    followDelayMs: STAKE_RESPONSE_FOLLOW_DELAY_MS,
    fastModeEnabled,
  })

  return Math.max(0, minimumRaiseReadMs - ageMs)
}

function scoreDeltaForSeat(
  previousSession: SessionPayload | null,
  nextSession: SessionPayload,
  seat: Seat,
) {
  if (!previousSession) return 0
  const key = `${seat}` as keyof SessionPayload['publicView']['score']
  return nextSession.publicView.score[key] - previousSession.publicView.score[key]
}

function deriveSkippedOptimisticRaiseResponseFx(
  optimisticStakeSound: OptimisticStakeSound | null,
  previousSession: SessionPayload | null,
  nextSession: SessionPayload,
  confirmedStakeFx: Omit<StakeFx, 'runId'> | null,
  source: SessionSnapshotSource,
): Omit<StakeFx, 'runId'> | null {
  if (
    source !== 'action' ||
    !optimisticStakeSound ||
    confirmedStakeFx ||
    !previousSession ||
    scoreDeltaForSeat(previousSession, nextSession, nextSession.humanPlayer) <= 0
  ) {
    return null
  }

  return {
    actor: 'villain',
    action: 'decline',
    stake: optimisticStakeSound.stake,
    fromStake: optimisticStakeSound.fromStake,
  }
}

function optimisticStakeSoundFromActiveFx(stakeFx: StakeFx | null): OptimisticStakeSound | null {
  if (!stakeFx || stakeFx.actor !== 'hero' || !isRaiseStakeAction(stakeFx.action)) {
    return null
  }

  return {
    action: stakeFx.action,
    stake: stakeFx.stake,
    fromStake: stakeFx.fromStake,
    playedAtMs: nowMs(),
  }
}

function optimisticStakeSoundFromAction(
  previousSession: SessionPayload | null,
  action: SessionAction | null,
): OptimisticStakeSound | null {
  if (!previousSession || !action) return null

  const stakeFx = deriveOptimisticStakeFx(previousSession, action)
  if (!stakeFx || stakeFx.actor !== 'hero' || !isRaiseStakeAction(stakeFx.action)) {
    return null
  }

  return {
    action: stakeFx.action,
    stake: stakeFx.stake,
    fromStake: stakeFx.fromStake,
    playedAtMs: nowMs(),
  }
}

function isFreshHandSnapshot(session: SessionPayload | null) {
  if (!session?.publicView.hand_in_progress || !session.state.current_hand || !session.playerView.hand) {
    return false
  }

  const handState = session.state.current_hand.state
  return handState.completed_rounds.length === 0 && handState.current_round.plays.length === 0
}

function didStartNewHand(
  previousSession: SessionPayload | null,
  nextSession: SessionPayload,
  source: SessionSnapshotSource,
) {
  if (source === 'load') return false
  if (!nextSession.publicView.hand_in_progress || !nextSession.state.current_hand || !nextSession.playerView.hand) {
    return false
  }
  if (source === 'create' || source === 'next-hand') return true
  if (!isFreshHandSnapshot(nextSession)) return false
  const nextCurrentHand = nextSession.state.current_hand
  const nextPlayerHand = nextSession.playerView.hand
  if (!nextCurrentHand || !nextPlayerHand) return false
  if (!previousSession) return true
  if (!previousSession.publicView.hand_in_progress || !previousSession.state.current_hand || !previousSession.playerView.hand) {
    return true
  }

  const previousHand = previousSession.state.current_hand.state
  const nextHand = nextCurrentHand.state

  if (previousHand.completed_rounds.length > 0 || previousHand.current_round.plays.length > 0) {
    return true
  }

  if (previousSession.playerView.hand.hand.length !== nextPlayerHand.hand.length) {
    return true
  }

  if (previousHand.dealer !== nextHand.dealer) return true
  if (previousHand.turnup.rank !== nextHand.turnup.rank || previousHand.turnup.suit !== nextHand.turnup.suit) {
    return true
  }

  return previousSession.playerView.hand.hand.some(
    (card, index) => card.id !== nextPlayerHand.hand[index]?.id,
  )
}

function hasPendingBotElevenDecision(session: SessionPayload | null) {
  const pendingDecision = session?.playerView.hand?.public_state.pending_decision ?? null
  return pendingDecision?.type === 'mao_de_onze' && pendingDecision.player === session?.botPlayer
}

function flattenHandPlays(session: SessionPayload | null) {
  const handState = session?.state.current_hand?.state
  if (!handState) return []

  return [
    ...handState.completed_rounds.flatMap((round) => round.plays),
    ...handState.current_round.plays,
  ]
}

function didScoreChange(previousSession: SessionPayload | null, nextSession: SessionPayload) {
  if (!previousSession) return false

  return (
    previousSession.publicView.score['0'] !== nextSession.publicView.score['0'] ||
    previousSession.publicView.score['1'] !== nextSession.publicView.score['1']
  )
}

function scoreChangePoints(previousSession: SessionPayload | null, nextSession: SessionPayload) {
  if (!previousSession) return 0

  return Math.max(
    0,
    nextSession.publicView.score['0'] - previousSession.publicView.score['0'],
    nextSession.publicView.score['1'] - previousSession.publicView.score['1'],
  )
}

function scoreChangeWinner(previousSession: SessionPayload | null, nextSession: SessionPayload): ScoreSide | null {
  if (!previousSession) return null

  const keys = heroVillainScoreKeys(nextSession.humanPlayer)
  const heroDelta = nextSession.publicView.score[keys.hero] - previousSession.publicView.score[keys.hero]
  const villainDelta = nextSession.publicView.score[keys.villain] - previousSession.publicView.score[keys.villain]
  if (heroDelta > 0) return 'hero'
  if (villainDelta > 0) return 'villain'
  return null
}

function safePositivePointCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0
}

function handValueForScoreSound(
  previousSession: SessionPayload | null,
  nextSession: SessionPayload,
) {
  return [
    previousSession?.state.current_hand?.state.hand_value,
    previousSession?.publicView.hand?.hand_value,
    previousSession?.playerView.hand?.public_state.hand_value,
    nextSession.state.current_hand?.state.hand_value,
    nextSession.publicView.hand?.hand_value,
    nextSession.playerView.hand?.public_state.hand_value,
  ].reduce<number>((best, candidate) => Math.max(best, safePositivePointCount(candidate)), 0)
}

function scoreSoundPointsForSessionChange(
  previousSession: SessionPayload | null,
  nextSession: SessionPayload,
  scorePoints: number = scoreChangePoints(previousSession, nextSession),
) {
  if (scorePoints <= 0) return 0

  const winner = scoreChangeWinner(previousSession, nextSession)
  const displayPreviousScore = sessionDisplayScore(previousSession)
  const displayNextScore = sessionDisplayScore(nextSession)
  const handValue = handValueForScoreSound(previousSession, nextSession)

  return resolveScoreSoundPoints({
    scorePoints,
    handValue,
    previousScore: displayPreviousScore,
    nextScore: displayNextScore,
    winner,
  })
}


function sessionDisplayScore(session: SessionPayload | null): DisplayScore {
  if (!session) return { hero: 0, villain: 0 }

  const keys = heroVillainScoreKeys(session.humanPlayer)
  return {
    hero: session.publicView.score[keys.hero],
    villain: session.publicView.score[keys.villain],
  }
}

function heroVillainScoreKeys(humanPlayer: Seat) {
  return humanPlayer === 0
    ? { hero: '0' as const, villain: '1' as const }
    : { hero: '1' as const, villain: '0' as const }
}

function stakeActionLabel(
  action: SessionAction | null,
  labels: {
    acceptRaise: string
    playFor3: string
    raiseTo: (stake: number) => string
  },
) {
  if (!action) return null
  if (action.type === 'accept_raise') return labels.acceptRaise
  if (action.type === 'accept_eleven') return labels.playFor3
  if (action.type === 'raise') return labels.raiseTo(action.to)
  return null
}

function scoreSideForSeat(seat: Seat | null | undefined, humanPlayer: Seat): ScoreSide | null {
  if (seat == null) return null
  return seat === humanPlayer ? 'hero' : 'villain'
}

function dealerSideForSession(session: SessionPayload | null): GatherDealerSide {
  if (!session) return 'hero'
  const dealer = session.publicView.next_dealer ?? session.state.next_dealer
  return dealer === session.humanPlayer ? 'hero' : 'villain'
}

function dealerMarkSideForSession(session: SessionPayload | null): 'hero' | 'villain' | null {
  const dealer = session?.state.current_hand?.state.dealer
  if (!session || dealer == null) return null
  return dealer === session.humanPlayer ? 'hero' : 'villain'
}

function deriveHandEndPayoff(
  previousSession: SessionPayload | null,
  nextSession: SessionPayload,
): HandEndPayoff | null {
  if (!previousSession || !didScoreChange(previousSession, nextSession)) return null

  const keys = heroVillainScoreKeys(nextSession.humanPlayer)
  const heroDelta = nextSession.publicView.score[keys.hero] - previousSession.publicView.score[keys.hero]
  const villainDelta = nextSession.publicView.score[keys.villain] - previousSession.publicView.score[keys.villain]
  const winner = heroDelta > 0
    ? 'hero'
    : villainDelta > 0
      ? 'villain'
      : scoreSideForSeat(
          nextSession.state.current_hand?.hand_winner
          ?? nextSession.playerView.hand?.public_state.hand_winner
          ?? null,
          nextSession.humanPlayer,
        )
  const points = winner === 'hero'
    ? heroDelta
    : winner === 'villain'
      ? villainDelta
      : Math.max(heroDelta, villainDelta)

  if (!winner || points <= 0) return null

  const previousScore = sessionDisplayScore(previousSession)
  const nextScore = sessionDisplayScore(nextSession)

  return {
    winner,
    points,
    scoreSoundPoints: scoreSoundPointsForSessionChange(previousSession, nextSession, points),
    completedRoundCount: nextSession.state.current_hand?.state.completed_rounds.length
      ?? previousSession.state.current_hand?.state.completed_rounds.length
      ?? 0,
    previousScore,
    nextScore,
  }
}

function cardDisplayFromStatePlay(play: StatePlay | null): CardDisplay | null {
  if (!play) return null
  if (play.visibility === 'down') {
    return { id: play.card.id, rank: '?', suit: '?', hidden: true }
  }
  return { id: play.card.id, rank: play.card.rank, suit: play.card.suit }
}

function cardSoundCueForDisplay(card: CardDisplay | null): OpponentPlaySoundCue {
  return card?.hidden ? 'card_hide' : 'card_play'
}

function cardDisplayFromPublicPlay(play: PublicPlay | null): CardDisplay | null {
  if (!play) return null
  if (play.visibility === 'down') {
    return { id: `play-${play.player}-down`, rank: '?', suit: '?', hidden: true }
  }
  if (!play.card) return null
  return { id: `play-${play.player}-up`, rank: play.card.rank, suit: play.card.suit }
}

function currentRoundCardForSeat(
  session: SessionPayload | null,
  player: Seat | null | undefined,
): CardDisplay | null {
  if (!session || player == null) return null

  const statePlay = session.state.current_hand?.state.current_round.plays
    ? statePlayForSeat(session.state.current_hand.state.current_round.plays, player)
    : null
  if (statePlay) {
    return cardDisplayFromStatePlay(statePlay)
  }

  return cardDisplayFromPublicPlay(playForSeat(session.playerView, player))
}

function deriveResolvedRoundPreview(
  previousSession: SessionPayload | null,
  nextSession: SessionPayload,
): ResolvedRoundPreview | null {
  const previousRounds = previousSession?.state.current_hand?.state.completed_rounds.length ?? 0
  const nextRounds = nextSession.state.current_hand?.state.completed_rounds.length ?? 0
  if (!previousSession || nextRounds <= previousRounds) return null

  const latestRound = nextSession.state.current_hand?.state.completed_rounds.at(-1)
  if (!latestRound) return null

  return {
    heroCard: cardDisplayFromStatePlay(completedRoundForSeat(latestRound, nextSession.humanPlayer)),
    villainCard: cardDisplayFromStatePlay(completedRoundForSeat(latestRound, nextSession.botPlayer)),
    winner: latestRound.winner ?? null,
  }
}

function deriveSessionSoundCues(
  previousSession: SessionPayload | null,
  nextSession: SessionPayload,
  source: SessionSnapshotSource,
): QueuedSoundCue[] {
  if (didStartNewHand(previousSession, nextSession, source)) {
    return []
  }

  const cues: QueuedSoundCue[] = []
  const nextHandState = nextSession.state.current_hand?.state ?? null

  if (!nextHandState) {
    const scorePoints = scoreChangePoints(previousSession, nextSession)
    const scoreSoundPoints = scoreSoundPointsForSessionChange(previousSession, nextSession, scorePoints)
    if (scoreSoundPoints > 0) {
      cues.push({ cue: 'score', scorePoints: scoreSoundPoints })
    }

    return cues
  }

  const previousPlays = flattenHandPlays(previousSession)
  const nextPlays = flattenHandPlays(nextSession)
  if (nextPlays.length > previousPlays.length) {
    for (const play of nextPlays.slice(previousPlays.length)) {
      cues.push({
        cue: play.visibility === 'down' ? 'card_hide' : 'card_play',
        actor: play.player === nextSession.humanPlayer
          ? 'hero'
          : play.player === nextSession.botPlayer
            ? 'villain'
            : undefined,
      })
    }
  }

  const nextStakeFx = deriveStakeFxFromSessionDiff(previousSession, nextSession, source)
  if (nextStakeFx) {
    cues.push({
      cue: soundCueForStakeFx(nextStakeFx),
      stake: nextStakeFx.stake,
    })
  }

  const scorePoints = scoreChangePoints(previousSession, nextSession)
  const scoreSoundPoints = scoreSoundPointsForSessionChange(previousSession, nextSession, scorePoints)
  if (scoreSoundPoints > 0) {
    cues.push({ cue: 'score', scorePoints: scoreSoundPoints })
  }

  return cues
}

function cardLabel(card: { rank: string; suit: string }) {
  return `${card.rank}${suitGlyph(card.suit)}`
}

function playerSubjectLabel(player: number | null | undefined, humanPlayer: Seat) {
  if (player == null) return 'Tie'
  return player === humanPlayer ? 'You' : 'They'
}

function lastHandReviewStorageKey(matchId: string) {
  return `${lastHandReviewStoragePrefix}${matchId}`
}

function readStoredLastHandReview(matchId: string) {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(lastHandReviewStorageKey(matchId))
    if (!raw) return null
    return normalizeStoredLastHandReview(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

function writeStoredLastHandReview(matchId: string, review: StoredLastHandReview) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(lastHandReviewStorageKey(matchId), JSON.stringify(review))
}

function clearStoredLastHandReview(matchId: string) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(lastHandReviewStorageKey(matchId))
  } catch {
    return
  }
}

function isCompactLiveViewport(width: number, height: number) {
  return width <= 420 || (width <= 540 && height <= 760)
}

function readCompactLiveViewport() {
  if (typeof window === 'undefined') return false
  return isCompactLiveViewport(window.innerWidth, window.innerHeight)
}

function readScorepadCanUsePaper() {
  if (typeof window === 'undefined') return true
  return window.innerWidth >= 960
}

function buildHandSummary(previous: SessionPayload, next: SessionPayload): StoredReviewSummary | null {
  const keys = heroVillainScoreKeys(next.humanPlayer)
  const seat0Delta = next.publicView.score['0'] - previous.publicView.score['0']
  const seat1Delta = next.publicView.score['1'] - previous.publicView.score['1']
  const points = Math.max(seat0Delta, seat1Delta)

  if (points <= 0) return null

  const winner = seat0Delta > 0 ? 0 : seat1Delta > 0 ? 1 : null
  const previousRounds = buildStoredReviewRounds(
    previous.state.current_hand?.state.completed_rounds,
    {
      currentRound: previous.state.current_hand?.state.current_round,
      turnup: previous.state.current_hand?.state.turnup ?? null,
      humanPlayer: next.humanPlayer,
    },
  )
  const nextRounds = buildStoredReviewRounds(
    next.state.current_hand?.state.completed_rounds,
    {
      currentRound: next.state.current_hand?.state.current_round,
      turnup: next.state.current_hand?.state.turnup ?? null,
      humanPlayer: next.humanPlayer,
    },
  )
  const rounds = nextRounds.length > previousRounds.length
    ? nextRounds
    : previousRounds
  const pendingRaise = previous.playerView.hand?.public_state.pending_raise
  const pendingDecision = previous.playerView.hand?.public_state.pending_decision

  let reason = 'Hand played to completion.'
  if (pendingRaise) {
    reason = pendingRaise.raised_by === winner
      ? `${playerSubjectLabel(winner, next.humanPlayer)} took the pot when the raise was declined.`
      : 'The hand stayed live after a raise and then resolved on the table.'
  } else if (pendingDecision) {
    reason = winner == null
      ? 'The hand ended on the eleven-hand decision.'
      : `${playerSubjectLabel(winner, next.humanPlayer)} collected the hand on the eleven-hand decision.`
  } else if (winner != null) {
    reason = `${playerSubjectLabel(winner, next.humanPlayer)} won the rounds needed to secure the hand.`
  }

  return {
    winner,
    points,
    scoreBefore: {
      hero: previous.publicView.score[keys.hero],
      villain: previous.publicView.score[keys.villain],
    },
    score: {
      hero: next.publicView.score[keys.hero],
      villain: next.publicView.score[keys.villain],
    },
    rounds,
    handValue: previous.playerView.hand?.public_state.hand_value ?? previous.publicView.hand?.hand_value ?? 1,
    turnup: previous.state.current_hand?.state.turnup
      ? cardLabel(previous.state.current_hand.state.turnup)
      : null,
    dealer: previous.state.current_hand?.state.dealer ?? null,
    reason,
  }
}

function countRemainingCards(view: PlayerSessionView, player: Seat) {
  if (!view.hand) return 0
  if (player === view.player) return view.hand.hand.length
  const playedThisRound = view.hand.public_state.current_round.plays.filter(
    (play) => play.player === player,
  ).length
  return Math.max(0, 3 - view.hand.public_state.completed_rounds.length - playedThisRound)
}

function currentHandSlotKey(session: SessionPayload | null) {
  const hand = session?.state.current_hand?.state
  if (!session || !hand) return null

  // Deliberately excludes hand.score: the engine mutates it inside the current
  // hand state when the hand ends, and a key change mid-display would reset the
  // player's drag-reorder (and double-count strength-guide discovery hands).
  // The dealer alternates every hand, so consecutive hands always differ.
  return [
    session.matchId,
    hand.dealer,
    hand.turnup.rank,
    hand.turnup.suit,
  ].join(':')
}

function playedCardIdsForSeat(session: SessionPayload | null, player: Seat | null | undefined) {
  if (player == null) return []
  return flattenHandPlays(session)
    .filter((play) => play.player === player)
    .map((play) => play.card.id)
}

function playForSeat(view: PlayerSessionView, player: Seat): PublicPlay | null {
  return (
    view.hand?.public_state.current_round.plays.find((play) => play.player === player) ?? null
  )
}

function statePlayForSeat(plays: StatePlay[], player: Seat) {
  return plays.find((play) => play.player === player) ?? null
}

function completedRoundForSeat(round: StateCompletedRound, player: Seat) {
  return round.plays.find((play) => play.player === player) ?? null
}

function legalActionForCard(
  actions: SessionAction[],
  cardId: string,
  type: 'play_face_up' | 'play_face_down',
) {
  return actions.find(
    (action) =>
      action.type === type && 'card_id' in action && action.card_id === cardId,
  )
}

function groupedActions(actions: SessionAction[]) {
  return {
    raise: actions.find((a) => a.type === 'raise') as
      | Extract<SessionAction, { type: 'raise' }>
      | undefined,
    acceptRaise: actions.find((a) => a.type === 'accept_raise'),
    fold: actions.find((a) => a.type === 'fold'),
    acceptEleven: actions.find((a) => a.type === 'accept_eleven'),
    concedeHand: actions.find((a) => a.type === 'concede_hand'),
    foldEleven: actions.find((a) => a.type === 'fold_eleven'),
  }
}

function withClientTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
  abortController?: AbortController,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      // Abort the underlying request so a slow server can't commit the action
      // after we've already reported a timeout and recovered from a snapshot.
      abortController?.abort()
      reject(new SessionRequestError(message, 'CLIENT_TIMEOUT', 504))
    }, ms)
    promise.then(
      (value) => { window.clearTimeout(timeoutId); resolve(value) },
      (error) => { window.clearTimeout(timeoutId); reject(error) },
    )
  })
}

function isEngineTimeoutError(error: unknown) {
  if (!(error instanceof SessionRequestError)) return false
  return normalizeLiveSessionErrorCode(error.code, error.status) === 'ENGINE_TIMEOUT'
}

function getInitialBrowserOnline() {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine
}

function matchNotFoundReasonForFailure(
  failure: SessionFailureState | null,
  isBrowserOnline: boolean,
): MatchNotFoundReason | null {
  if (!failure) return null
  if (!isBrowserOnline && failure.retryMatchId && failure.code === 'ENGINE_UNAVAILABLE') return 'offline'
  if (failure.code === 'MATCH_EXPIRED') return 'expired'
  if (failure.code === 'MATCH_NOT_FOUND' || failure.code === 'MATCH_FORBIDDEN') return 'notfound'
  return null
}

export default function LiveGame() {
  const tCommon = useTranslations('Common')
  const tBot = useTranslations('Bot')
  const tHints = useTranslations('Live.hints')
  const tStatus = useTranslations('Live.status')
  const tActions = useTranslations('Live.actions')
  const tStakeFx = useTranslations('Live.stakeFx')
  const tNewMatch = useTranslations('Live.newMatch')
  const tRecent = useTranslations('Live.recent')
  const tStudy = useTranslations('Live.study')
  const locale = useLocale()
  const router = useRouter()
  const searchParams = useSearchParams()
  const showDevControls = areLiveDevControlsEnabled()
  const [selectedBotKind, setSelectedBotKind] = useState<BotKind>('heuristic')
  const [selectedBotProfile, setSelectedBotProfile] = useState<BotProfile>('balanced')
  const [selectedBotModel, setSelectedBotModel] = useState('')
  // Bring-your-own-key: deliberately in-memory only — never persisted to
  // localStorage (unlike the other match-setup prefs) and sent only on match
  // creation.
  const [selectedApiKey, setSelectedApiKey] = useState('')
  const [recentLiveMatch, setRecentLiveMatch] = useState<RecentLiveMatch | null>(null)
  const [isBrowserOnline, setIsBrowserOnline] = useState(getInitialBrowserOnline)
  const {
    overlayMenuOpen,
    setOverlayMenuOpen,
    setOverlayMenuRef,
    closeOverlayMenus,
    activeUtilitySurface,
    setActiveUtilitySurface,
    openSettingsDrawer,
    toggleSettingsDrawer,
    expandedSettingsSection,
    toggleSettingsSection,
    launcherTransitioningOut,
    setLauncherTransitioningOut,
    compactViewport,
  } = useLivePanelLayout()
  const closeUtilitySurface = useCallback(() => {
    closeOverlayMenus()
    setActiveUtilitySurface(null)
  }, [closeOverlayMenus, setActiveUtilitySurface])
  const [newMatchDealerChoice, setNewMatchDealerChoice] = useState<DealerChoice>('random')
  const [pendingNewMatchRequest, setPendingNewMatchRequest] = useState<PendingNewMatchRequest | null>(null)
  const [llmProviders, setLlmProviders] = useState<LlmProviderCatalog[]>([])
  const [solverAvailable, setSolverAvailable] = useState(false)
  const [gamePreferences, setGamePreferences] = useState<LiveGamePreferences>(() => buildDefaultLiveGamePreferences())
  const [soundSettings, setSoundSettings] = useState<LiveSoundSettings>(() => buildDefaultLiveSoundSettings())
  const [strengthGuideDiscovery, setStrengthGuideDiscovery] = useState<StrengthGuideDiscovery>(() => buildDefaultStrengthGuideDiscovery())
  const [gameplayHints, setGameplayHints] = useState<GameplayHintsState>(() => buildDefaultGameplayHints())
  const [devPreviewHint, setDevPreviewHint] = useState<'raise' | 'elevenHand' | null>(null)
  const [strengthGuideOpen, setStrengthGuideOpen] = useState(false)
  const [strengthGuideShimmerActive, setStrengthGuideShimmerActive] = useState(false)
  const [deckPickerSkippedMatchId, setDeckPickerSkippedMatchId] = useState<string | null>(null)
  const openStrengthGuide = useCallback(() => {
    setStrengthGuideOpen(true)
    setStrengthGuideDiscovery((current) => markStrengthGuideOpened(current))
  }, [])
  const closeStrengthGuide = useCallback(() => {
    setStrengthGuideOpen(false)
  }, [])
  const toggleStrengthGuide = useCallback(() => {
    setStrengthGuideOpen((current) => {
      if (current) return false
      setStrengthGuideDiscovery((discovery) => markStrengthGuideOpened(discovery))
      return true
    })
  }, [])
  const deckSystem = gamePreferences.deckSystem
  const fastModeEnabled = gamePreferences.fastMode
  const withFastMode = useCallback(
    (normalMs: number, fastMs = 0) => (fastModeEnabled ? fastMs : normalMs),
    [fastModeEnabled],
  )
  const layoutMoveDurationS = fastModeEnabled ? 0 : LAYOUT_MOVE_DURATION_S
  const dealAnimDurationMs = withFastMode(DEAL_ANIM_DURATION_MS)
  const dealAnimDurationS = dealAnimDurationMs / 1000
  const dealStepPauseMs = withFastMode(DEAL_STEP_PAUSE_MS)
  const heroDealFlipDelayMs = withFastMode(HERO_DEAL_FLIP_DELAY_MS)
  const opponentPlayOverlayMs = withFastMode(OPPONENT_PLAY_OVERLAY_MS)
  const openingVillainActionDelayMs = withFastMode(OPENING_VILLAIN_ACTION_DELAY_MS)
  const botElevenDecisionAfterDealMs = withFastMode(BOT_ELEVEN_DECISION_AFTER_DEAL_MS)
  const matchResultSoundDelayMs = withFastMode(MATCH_RESULT_SOUND_DELAY_MS)
  const nextHandDelayMs = withFastMode(NEXT_HAND_DELAY_MS, FAST_MODE_NEXT_HAND_DELAY_MS)
  const roundResultPreviewMs = withFastMode(
    ROUND_RESULT_PREVIEW_MS,
    FAST_MODE_ROUND_RESULT_PREVIEW_MS,
  )
  const heroPlayMotionSettleMs = Math.max(480, layoutMoveDurationS * 1000 + 220)
  const handEndGlowMs = withFastMode(HAND_END_GLOW_MS, FAST_MODE_HAND_END_GLOW_MS)
  const handEndTransferMs = withFastMode(HAND_END_TRANSFER_MS, FAST_MODE_HAND_END_TRANSFER_MS)
  const handEndLandMs = withFastMode(HAND_END_LAND_MS, FAST_MODE_HAND_END_LAND_MS)
  const handEndScoreSettleMs = withFastMode(HAND_END_SCORE_SETTLE_MS, FAST_MODE_HAND_END_SCORE_SETTLE_MS)
  const scorePulseMs = withFastMode(SCORE_PULSE_MS, FAST_MODE_SCORE_PULSE_MS)
  const handTransitionDealDelayMs = withFastMode(
    HAND_TRANSITION_DEAL_DELAY_MS,
    FAST_MODE_HAND_TRANSITION_DEAL_DELAY_MS,
  )
  const betweenHandGatherMs = withFastMode(BETWEEN_HAND_GATHER_MS)
  const nextHandAfterPayoffDelayMs = withFastMode(
    NEXT_HAND_AFTER_PAYOFF_DELAY_MS,
    FAST_MODE_NEXT_HAND_AFTER_PAYOFF_DELAY_MS,
  )
  const {
    session,
    bootMatchId,
    setBootMatchId,
    setLastHandReview,
    isPending,
    isAutoStartingHand,
    pendingAction,
    sessionFailure,
    setSessionFailure,
    dispatchEngineEvent,
    didBootRef,
    actionLockRef,
    previousSessionRef,
    lastHandEndPayoffRef,
    stakeCurrentRef,
    scoreRowRefs,
    scoreNumberRefs,
    displayScore,
    scorePulseState,
    handEndFx,
    activeHandEndPayoff,
    isHandEndSequenceRunning,
    betweenHandsGather,
    handEndFxRunIdRef,
    roundRefs,
    clearScorePulseTimeout,
    resetHandEndPayoffState,
    startBetweenHandsGather,
    clearBetweenHandsDeck,
    setIsHandEndSequenceRunning,
    runHandEndPayoffSequence,
  } = useLiveEngineState(searchParams.get('match'), {
    scorePulseMs,
    handEndGlowMs,
    handEndTransferMs,
    handEndLandMs,
    handEndScoreSettleMs,
  })
  const [studyManifest, setStudyManifest] = useState<{
    spots: Array<{ score: [number, number]; tc: number; dealer: number }>
  } | null>(null)
  useEffect(() => {
    if (!STUDY_LAB_LINKS_ENABLED) return
    let cancelled = false
    fetch(STUDY_MANIFEST_URL)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data?.spots) setStudyManifest(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  // Whether the engine service has solver policy artifacts mounted; gates the
  // solved-strategy opponent option in the launcher.
  useEffect(() => {
    let cancelled = false
    fetchSolverBotStatus()
      .then((status) => { if (!cancelled) setSolverAvailable(status.enabled) })
      .catch(() => { if (!cancelled) setSolverAvailable(false) })
    return () => { cancelled = true }
  }, [])
  // Deep link from the study lab: ?bot=solver preselects the solved-strategy
  // opponent once its artifacts are confirmed available. Applied once.
  const solverDeepLinkAppliedRef = useRef(false)
  useEffect(() => {
    if (solverDeepLinkAppliedRef.current) return
    if (searchParams.get('bot') !== 'solver' || !solverAvailable) return
    solverDeepLinkAppliedRef.current = true
    setSelectedBotKind('solver')
  }, [searchParams, solverAvailable])
  const studySpot = useMemo(() => {
    if (!STUDY_LAB_LINKS_ENABLED || !session) return null
    return buildStudySpotString(session)
  }, [session])
  const studySpotText = useMemo(() => {
    if (!studySpot?.ok) return null
    return studySpotSolved(studyManifest, studySpot) ? studySpot.text : null
  }, [studySpot, studyManifest])
  // The table's study lens: a live link when the exact spot is shipped,
  // otherwise a visible-but-inert lens whose tooltip explains precisely why —
  // an unreconstructable hand, a vira the loaded charts don't cover (a
  // data-availability gap, common locally where only turn-up class 0 ships),
  // or a score genuinely outside the solved region.
  const studyButton = useMemo(() => {
    if (!studySpot) return null
    const label = tStudy('button')
    if (studySpotText) {
      return { label, href: `/${locale}/lab/study?s=${encodeURIComponent(studySpotText)}` }
    }
    if (!studySpot.ok) {
      if (studySpot.code === 'no-hand') return null
      return { label, disabledReason: tStudy('notReconstructable') }
    }
    const availability = studySpotAvailability(studyManifest, studySpot)
    const reason = availability === 'vira-unavailable'
      ? tStudy('viraUnavailable')
      : tStudy('notSolved')
    return { label, disabledReason: reason }
  }, [studySpot, studySpotText, studyManifest, locale, tStudy])
  const [isLoadingProviders, setIsLoadingProviders] = useState(false)
  const [isDealingCards, setIsDealingCards] = useState(false)
  const [isHeroDragOverDropTarget, setIsHeroDragOverDropTarget] = useState(false)
  const [isHeroDragActive, setIsHeroDragActive] = useState(false)
  const [heroHandReorderTargetIndex, setHeroHandReorderTargetIndex] = useState<number | null>(null)
  const [heroHandReorderSourceIndex, setHeroHandReorderSourceIndex] = useState<number | null>(null)
  const [heroHandReorderPreviewOffsets, setHeroHandReorderPreviewOffsets] = useState<number[]>(EMPTY_HERO_HAND_REORDER_OFFSETS)
  const [, setHeroHandOrderRevision] = useState(0)
  const [heroDealSlotsVisible, setHeroDealSlotsVisible] = useState([true, true, true])
  const [heroDealSlotsFaceDown, setHeroDealSlotsFaceDown] = useState([false, false, false])
  const [opponentDealSlotsVisible, setOpponentDealSlotsVisible] = useState([true, true, true])
  const [dealAnim, setDealAnim] = useState<DealAnimation | null>(null)
  const [heroPlayOverlay, setHeroPlayOverlay] = useState<OverlayAnimation | null>(null)
  const [heroPlayOverlayReadyCardId, setHeroPlayOverlayReadyCardId] = useState<string | null>(null)
  const [opponentPlayOverlay, setOpponentPlayOverlay] = useState<OverlayAnimation | null>(null)
  const [pendingVillainRevealCardId, setPendingVillainRevealCardId] = useState<string | null>(null)
  const [pendingVillainRevealCount, setPendingVillainRevealCount] = useState(1)
  const [opponentRevealInFlight, setOpponentRevealInFlight] = useState(false)
  const [heroPlayMotionActive, setHeroPlayMotionActive] = useState(false)
  const [stakeFx, setStakeFx] = useState<StakeFx | null>(null)
  const [readyMatchCompleteResultKey, setReadyMatchCompleteResultKey] = useState<string | null>(null)
  const [visibleMatchWinner, setVisibleMatchWinner] = useState<Seat | null>(null)
  const [matchHandHistory, setMatchHandHistory] = useState<MatchHistoryResult[]>([])
  const [dismissedMatchResultKey, setDismissedMatchResultKey] = useState<string | null>(null)
  const [usePostPayoffNextHandDelay, setUsePostPayoffNextHandDelay] = useState(false)
  const [stagedFaceDownCardIds, setStagedFaceDownCardIds] = useState<Set<string>>(() => new Set<string>())
  const [resolvedRoundPreview, setResolvedRoundPreview] = useState<ResolvedRoundPreview | null>(null)
  const [latchedVillainTableCard, setLatchedVillainTableCard] = useState<CardDisplay | null>(null)
  const [turnupFaceDown, setTurnupFaceDown] = useState(false)
  const [providerLoadIssue, setProviderLoadIssue] = useState<string | null>(null)
  const [didHydrateStoredUiSettings, setDidHydrateStoredUiSettings] = useState(false)
  const [farolIntroPhase, setFarolIntroPhase] = useState<FarolIntroPhase>(null)
  const [scorepadCanUsePaper, setScorepadCanUsePaper] = useState(readScorepadCanUsePaper)
  const [scorepadRolled, setScorepadRolled] = useState(false)
  const [stakeResponseRevealBlocked, setStakeResponseRevealBlocked] = useState(false)
  const [openingVillainActionBlocked, setOpeningVillainActionBlocked] = useState(false)
  const [devElevenFocusMode, setDevElevenFocusMode] = useState<ScorePadElevenFocusMode | null>(null)
  const farolIntroMatchIdRef = useRef<string | null>(null)
  const farolIntroSawDealRef = useRef(false)
  const farolIntroHoldTimeoutRef = useRef<number | null>(null)
  const farolIntroSettleTimeoutRef = useRef<number | null>(null)
  const {
    devPanelOpen,
    setDevPanelOpen,
    devPanelPosition,
    setDevPanelPosition,
    resetDevPanelPosition,
    isDraggingDevPanel,
    devPanelRef,
    devSectionOpenState,
    setDevSectionOpenState,
    clearDevPanelDrag,
    devAuditionThemeId,
    setDevAuditionThemeId,
    devAuditionCue,
    setDevAuditionCue,
    devClipboardMessage,
    devDealerChoice,
    setDevDealerChoice,
    devNextViraRank,
    setDevNextViraRank,
    devScoreHero,
    setDevScoreHero,
    devScoreVillain,
    setDevScoreVillain,
    devStakeResponseAction,
    setDevStakeResponseAction,
    devVillainCards,
    setDevVillainCards,
    devVillainCardsStale,
    setDevVillainCardsStale,
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
    devMatchCompletePreview,
    setDevMatchCompletePreview,
    devMatchCompletePreviewTimeoutRef,
    devMatchCompletePreviewRunIdRef,
    handleDevPanelPointerDown,
    clearDevClipboardTimeout,
    flashDevClipboardMessage,
    clearDevMatchCompletePreviewTimeout,
    clearDevMatchCompletePreview,
  } = useLiveDevControls(session?.matchId ?? bootMatchId)
  const playerSlotRefs = useRef<(HTMLDivElement | null)[]>([])
  const opponentSlotRefs = useRef<(HTMLDivElement | null)[]>([])
  const heroHandSlotStateRef = useRef<StableHandSlotState | null>(null)
  const heroHandSlotIndexByCardIdRef = useRef<Map<string, number>>(new Map())
  const isHeroDragActiveRef = useRef(false)
  const activeHeroDragRef = useRef<ActiveHeroDrag | null>(null)
  const heroDragOverDropTargetRef = useRef(false)
  const heroHandReorderTargetIndexRef = useRef<number | null>(null)
  const lastHeroDragPointRef = useRef<FixedMotionPoint | null>(null)
  const dealRunIdRef = useRef(0)
  const heroPlayOverlayRunIdRef = useRef(0)
  const heroPlayOverlayTimeoutRef = useRef<number | null>(null)
  const opponentPlayRunIdRef = useRef(0)
  const pendingVillainRevealNextRef = useRef<{ cardId: string; count: number } | null>(null)
  const applySessionSnapshotRef = useRef<((nextSession: SessionPayload, source: SessionSnapshotSource) => void) | null>(null)
  const resumeDeferredBotElevenDecisionRef = useRef<((matchId: string) => void) | null>(null)
  const heroFlipTimeoutsRef = useRef<number[]>([])
  const queuedSoundTimeoutsRef = useRef<number[]>([])
  const botElevenDecisionTimeoutRef = useRef<number | null>(null)
  const openingVillainActionDelayTimeoutRef = useRef<number | null>(null)
  const matchResultOverlayTimeoutRef = useRef<number | null>(null)
  const roundResultPreviewTimeoutRef = useRef<number | null>(null)
  const heroPlayMotionTimeoutRef = useRef<number | null>(null)
  const heroPlayRevealReadyAtRef = useRef<number | null>(null)
  const queuedOpponentRevealAfterHeroPlayRef = useRef<{ sourceIndex: number; cardId: string; soundCue: OpponentPlaySoundCue } | null>(null)
  const queuedOpponentRevealTimeoutRef = useRef<number | null>(null)
  const turnupRef = useRef<HTMLDivElement | null>(null)
  const currentOpponentCardRef = useRef<HTMLDivElement | null>(null)
  const currentPlayerCardRef = useRef<HTMLDivElement | null>(null)
  const heroPlayMotionElementRef = useRef<HTMLElement | null>(null)
  const stakeFxRunIdRef = useRef(0)
  const stakeFxStartTimeoutRef = useRef<number | null>(null)
  const stakeFxClearTimeoutRef = useRef<number | null>(null)
  const stakeFxRef = useRef<StakeFx | null>(null)
  const optimisticStakeSoundRef = useRef<OptimisticStakeSound | null>(null)
  const pendingStakeResponseFxRef = useRef<Omit<StakeFx, 'runId'> | null>(null)
  const heroFaceDownPlaySoundOverrideRef = useRef<HeroFaceDownPlaySoundOverride | null>(null)
  const stakeResponseRevealTimeoutRef = useRef<number | null>(null)
  const devElevenFocusTimeoutRef = useRef<number | null>(null)
  const soundSliderStartVolumeRef = useRef<number | null>(null)
  const previousElevenTensionScoreRef = useRef<DisplayScore | null>(null)
  const elevenEntrySoundMatchIdRef = useRef<string | null>(null)
  const elevenDuelSoundMatchIdRef = useRef<string | null>(null)
  const previousElevenFocusSoundRef = useRef<string | null>(null)

  useEffect(() => {
    setRecentLiveMatch(readRecentLiveMatch())
  }, [])

  useEffect(() => {
    const updateScorepadPaperAvailability = () => {
      setScorepadCanUsePaper(readScorepadCanUsePaper())
    }

    updateScorepadPaperAvailability()
    window.addEventListener('resize', updateScorepadPaperAvailability)

    return () => {
      window.removeEventListener('resize', updateScorepadPaperAvailability)
    }
  }, [])

  useEffect(() => {
    const updateOnlineState = () => {
      setIsBrowserOnline(getInitialBrowserOnline())
    }

    updateOnlineState()
    window.addEventListener('online', updateOnlineState)
    window.addEventListener('offline', updateOnlineState)

    return () => {
      window.removeEventListener('online', updateOnlineState)
      window.removeEventListener('offline', updateOnlineState)
    }
  }, [])

  const activeMatchId = session?.matchId ?? bootMatchId
  const matchNotFoundReason = matchNotFoundReasonForFailure(sessionFailure, isBrowserOnline)
  const matchNotFoundLink = buildLiveSessionPath(sessionFailure?.retryMatchId ?? bootMatchId ?? 'unknown')
  const formatRecentWhen = (updatedAt: number, now = Date.now()) => {
    const elapsedMs = Math.max(0, now - updatedAt)
    const elapsedMinutes = Math.floor(elapsedMs / 60_000)

    if (elapsedMinutes < 1) return tRecent('justNow')
    if (elapsedMinutes < 60) return tRecent('minutesAgo', { count: elapsedMinutes })

    const elapsedHours = Math.floor(elapsedMinutes / 60)
    if (elapsedHours < 24) return tRecent('hoursAgo', { count: elapsedHours })

    const elapsedDays = Math.floor(elapsedHours / 24)
    return tRecent('daysAgo', { count: elapsedDays })
  }
  const recentOpponentLabel = (recent: RecentLiveMatch) => {
    const kindLabel = tBot(`kind.${recent.botKind}.label`)
    if (recent.botModel) return `${kindLabel} · ${recent.botModel}`
    if (recent.botKind === 'heuristic') {
      const profile = recent.botProfile ?? 'balanced'
      return `${kindLabel} · ${tBot(`profile.${profile}.label`)}`
    }
    if (recent.botProfile) {
      return `${kindLabel} · ${tBot(`profile.${recent.botProfile}.label`)}`
    }
    return kindLabel
  }
  const matchNotFoundRecent = recentLiveMatch && recentLiveMatch.matchId !== sessionFailure?.retryMatchId
    ? {
        opponent: recentOpponentLabel(recentLiveMatch),
        youScore: recentLiveMatch.youScore,
        themScore: recentLiveMatch.themScore,
        when: formatRecentWhen(recentLiveMatch.updatedAt),
        matchId: recentLiveMatch.matchId,
      }
    : null
  const matchWinner = session?.publicView.winner ?? null
  const matchResultKey = session && matchWinner != null ? `${session.matchId}:${matchWinner}` : null
  const isResolvedRoundPreviewActive = resolvedRoundPreview != null
  const isMatchCompletePresentationReady = matchResultKey != null && readyMatchCompleteResultKey === matchResultKey
  const sessionPendingMatchCompleteState = (() => {
    if (!session || matchResultKey == null || matchWinner == null) return null
    if (
      dismissedMatchResultKey === matchResultKey ||
      !isMatchCompletePresentationReady ||
      visibleMatchWinner != null
    ) {
      return null
    }

    const winnerSide = scoreSideForSeat(matchWinner, session.humanPlayer)
    if (!winnerSide) return null

    return {
      tone: matchWinner === session.humanPlayer ? 'victory' as const : 'defeat' as const,
      winnerSide,
    }
  })()
  const pendingMatchCompleteState = devMatchCompletePreview ?? sessionPendingMatchCompleteState
  const devMatchCompleteScreenWinner: Seat | null = (() => {
    if (!session || !devMatchCompletePreview?.showScreen) return null
    return devMatchCompletePreview.tone === 'victory'
      ? session.humanPlayer
      : session.humanPlayer === 0 ? 1 : 0
  })()
  const displayedMatchCompleteWinner = visibleMatchWinner ?? devMatchCompleteScreenWinner
  const isDevMatchCompleteScreen = visibleMatchWinner == null && devMatchCompleteScreenWinner != null
  const { playSound, previewSound, previewThemeReel, primeSound } = useTableSoundFx({
    enabled: soundSettings.soundEnabled,
    volume: soundSettings.soundVolume,
    themeId: soundSettings.soundTheme,
    fastMode: fastModeEnabled,
  })
  const playPayoffScoreSound = useCallback((payoff: HandEndPayoff) => {
    playSound('score', { scorePoints: scoreSoundPointsForPayoff(payoff) })
  }, [playSound])
  const playPayoffScoreSoundAndGather = useCallback((
    payoff: HandEndPayoff,
    dealerSession: SessionPayload | null,
  ) => {
    playPayoffScoreSound(payoff)
    startBetweenHandsGather(dealerSideForSession(dealerSession), betweenHandGatherMs)
  }, [betweenHandGatherMs, playPayoffScoreSound, startBetweenHandsGather])
  const scoreAndGatherSettleMsForPayoff = useCallback((payoff: HandEndPayoff) => (
    Math.max(scoreSoundSettleMsForPayoff(payoff), betweenHandGatherMs)
  ), [betweenHandGatherMs])
  const beginSoundSliderGesture = () => {
    soundSliderStartVolumeRef.current =
      soundSettings.soundVolume > 0
        ? soundSettings.soundVolume
        : soundSettings.soundLastAudibleVolume
  }
  const endSoundSliderGesture = () => {
    soundSliderStartVolumeRef.current = null
  }
  const selectedProvider = findLlmProviderCatalog(llmProviders, selectedBotKind)
  const llmSelectionIssue = getLlmSelectionIssue({
    selectedBotKind,
    selectedBotModel,
    providers: llmProviders,
    isLoadingProviders,
    providerLoadIssue,
  })
  const matchStartBlocked = Boolean(llmSelectionIssue)
  const matchStartDisabled = isPending || isAutoStartingHand || isDealingCards || matchStartBlocked
  const providerStatusCopy = isLlmBotKind(selectedBotKind)
    ? isLoadingProviders
      ? tBot('provider.loadingModels')
      : llmSelectionIssue ??
        selectedProvider?.note ??
        tBot('model.chooseConfigured')
    : null
  const showBotProviderStatus = isLlmBotKind(selectedBotKind) || Boolean(providerLoadIssue)

  const handleBotKindChange = useCallback((nextKind: BotKind) => {
    setSelectedBotKind(nextKind)
    if (!isLlmBotKind(nextKind)) {
      setSelectedBotModel('')
    }
  }, [])

  const selectNewMatchDealerChoice = useCallback((dealerChoice: DealerChoice) => {
    setNewMatchDealerChoice(dealerChoice)
    setPendingNewMatchRequest((current) => (
      current
        ? {
            ...current,
            dealerChoice,
          }
        : current
    ))
  }, [])

  const updateGamePreferences = useCallback((updater: (previous: LiveGamePreferences) => LiveGamePreferences) => {
    setGamePreferences((previous) => sanitizeLiveGamePreferences(updater(previous)))
  }, [])

  const updateGameplayHints = useCallback((updater: (previous: GameplayHintsState) => GameplayHintsState) => {
    setGameplayHints((previous) => {
      const next = updater(previous)
      persistGameplayHints(next)
      return next
    })
  }, [])

  const setPreferredDeckSystem = useCallback((nextDeckSystem: DeckSystem) => {
    updateGamePreferences((previous) => ({
      ...previous,
      deckPickerCompleted: true,
      deckSystem: nextDeckSystem,
    }))
  }, [updateGamePreferences])

  const handleFirstRunDeckPick = useCallback((nextDeckSystem: DeckSystem) => {
    setDeckPickerSkippedMatchId(null)
    setPreferredDeckSystem(nextDeckSystem)
  }, [setPreferredDeckSystem])

  const handleFirstRunDeckSkip = useCallback(() => {
    const matchId = session?.matchId ?? activeMatchId ?? null
    if (matchId) {
      setDeckPickerSkippedMatchId(matchId)
    }

    updateGamePreferences((previous) => ({
      ...previous,
      deckPickerDismissCount: Math.min(
        MAX_DECK_PICKER_DISMISSALS,
        previous.deckPickerDismissCount + 1,
      ),
      deckSystem: previous.deckSystem ?? DEFAULT_DECK_SYSTEM,
    }))
  }, [activeMatchId, session?.matchId, updateGamePreferences])

  const resetFirstRunDeckPicker = useCallback(() => {
    setDeckPickerSkippedMatchId(null)
    updateGamePreferences(resetDeckPickerPrompt)
  }, [updateGamePreferences])

  const assignShortcut = useCallback((action: LiveShortcutAction, key: string | null) => {
    updateGamePreferences((previous) => ({
      ...previous,
      shortcuts: assignLiveShortcut(previous.shortcuts, action, key),
    }))
  }, [updateGamePreferences])

  const updateSoundSettings = useCallback((updater: (previous: LiveSoundSettings) => LiveSoundSettings) => {
    setSoundSettings((previous) => sanitizeLiveSoundSettings(updater(previous)))
  }, [])

  const switchBackToHeuristic = useCallback(() => {
    setSelectedBotKind('heuristic')
    setSelectedBotProfile('balanced')
    setSelectedBotModel('')
  }, [])

  const refreshProviderCatalogs = useCallback(async () => {
    setIsLoadingProviders(true)
    try {
      const providerAbort = new AbortController()
      const providers = await withClientTimeout(
        fetchLlmProviderCatalogs({ signal: providerAbort.signal }),
        PROVIDER_CATALOG_TIMEOUT_MS,
        tBot('provider.catalogTimeout'),
        providerAbort,
      )
      setLlmProviders(providers)
      setProviderLoadIssue(null)
    } catch (nextError) {
      setLlmProviders([])
      setProviderLoadIssue(
        nextError instanceof Error
          ? nextError.message
          : tBot('provider.catalogLoadFailed'),
      )
    } finally {
      setIsLoadingProviders(false)
    }
  }, [tBot])

  const clearHeroFlipTimeouts = useCallback(() => {
    for (const timeoutId of heroFlipTimeoutsRef.current) {
      window.clearTimeout(timeoutId)
    }
    heroFlipTimeoutsRef.current = []
  }, [])

  const clearQueuedSoundTimeouts = useCallback(() => {
    for (const timeoutId of queuedSoundTimeoutsRef.current) {
      window.clearTimeout(timeoutId)
    }
    queuedSoundTimeoutsRef.current = []
  }, [])

  const clearBotElevenDecisionTimeout = useCallback(() => {
    if (botElevenDecisionTimeoutRef.current != null) {
      window.clearTimeout(botElevenDecisionTimeoutRef.current)
      botElevenDecisionTimeoutRef.current = null
    }
  }, [])

  const clearStakeFxTimeout = useCallback(() => {
    if (stakeFxStartTimeoutRef.current != null) {
      window.clearTimeout(stakeFxStartTimeoutRef.current)
      stakeFxStartTimeoutRef.current = null
    }
    if (stakeFxClearTimeoutRef.current != null) {
      window.clearTimeout(stakeFxClearTimeoutRef.current)
      stakeFxClearTimeoutRef.current = null
    }
  }, [])

  const clearStakeResponseRevealTimeout = useCallback(() => {
    if (stakeResponseRevealTimeoutRef.current != null) {
      window.clearTimeout(stakeResponseRevealTimeoutRef.current)
      stakeResponseRevealTimeoutRef.current = null
    }
  }, [])

  const clearOpeningVillainActionDelayTimeout = useCallback(() => {
    if (openingVillainActionDelayTimeoutRef.current != null) {
      window.clearTimeout(openingVillainActionDelayTimeoutRef.current)
      openingVillainActionDelayTimeoutRef.current = null
    }
    setOpeningVillainActionBlocked(false)
  }, [])

  const clearDevElevenFocusTimeout = useCallback(() => {
    if (devElevenFocusTimeoutRef.current != null) {
      window.clearTimeout(devElevenFocusTimeoutRef.current)
      devElevenFocusTimeoutRef.current = null
    }
  }, [])

  const clearDevElevenFocus = useCallback(() => {
    clearDevElevenFocusTimeout()
    setDevElevenFocusMode(null)
  }, [clearDevElevenFocusTimeout])

  const scheduleStakeResponseReveal = useCallback((delayMs: number) => {
    clearStakeResponseRevealTimeout()

    if (delayMs <= 0) {
      setStakeResponseRevealBlocked(false)
      return
    }

    setStakeResponseRevealBlocked(true)
    stakeResponseRevealTimeoutRef.current = window.setTimeout(() => {
      stakeResponseRevealTimeoutRef.current = null
      setStakeResponseRevealBlocked(false)
    }, delayMs)
  }, [clearStakeResponseRevealTimeout])

  const clearRoundResultPreviewTimeout = useCallback(() => {
    if (roundResultPreviewTimeoutRef.current != null) {
      window.clearTimeout(roundResultPreviewTimeoutRef.current)
      roundResultPreviewTimeoutRef.current = null
    }
  }, [])


  const clearHeroPlayMotionTimeout = useCallback(() => {
    if (heroPlayMotionTimeoutRef.current != null) {
      window.clearTimeout(heroPlayMotionTimeoutRef.current)
      heroPlayMotionTimeoutRef.current = null
    }
  }, [])

  const clearHeroPlayOverlay = useCallback(() => {
    heroPlayOverlayRunIdRef.current += 1
    if (heroPlayOverlayTimeoutRef.current != null) {
      window.clearTimeout(heroPlayOverlayTimeoutRef.current)
      heroPlayOverlayTimeoutRef.current = null
    }
    setHeroPlayOverlay(null)
    setHeroPlayOverlayReadyCardId(null)
  }, [])

  const clearQueuedOpponentRevealTimeout = useCallback(() => {
    if (queuedOpponentRevealTimeoutRef.current != null) {
      window.clearTimeout(queuedOpponentRevealTimeoutRef.current)
      queuedOpponentRevealTimeoutRef.current = null
    }
  }, [])

  const clearMatchResultOverlayTimeout = useCallback(() => {
    if (matchResultOverlayTimeoutRef.current != null) {
      window.clearTimeout(matchResultOverlayTimeoutRef.current)
      matchResultOverlayTimeoutRef.current = null
    }
  }, [])

  const scheduleOpeningVillainActionAfterDeal = useCallback((callback: () => void) => {
    if (openingVillainActionDelayTimeoutRef.current != null) {
      window.clearTimeout(openingVillainActionDelayTimeoutRef.current)
      openingVillainActionDelayTimeoutRef.current = null
    }

    if (openingVillainActionDelayMs <= 0) {
      setOpeningVillainActionBlocked(false)
      callback()
      return
    }

    setOpeningVillainActionBlocked(true)
    openingVillainActionDelayTimeoutRef.current = window.setTimeout(() => {
      openingVillainActionDelayTimeoutRef.current = null
      callback()
    }, openingVillainActionDelayMs)
  }, [openingVillainActionDelayMs])

  const scheduleBotElevenDecisionAfterDeal = useCallback((matchId: string) => {
    clearBotElevenDecisionTimeout()

    botElevenDecisionTimeoutRef.current = window.setTimeout(() => {
      botElevenDecisionTimeoutRef.current = null
      resumeDeferredBotElevenDecisionRef.current?.(matchId)
    }, Math.max(0, botElevenDecisionAfterDealMs))
  }, [botElevenDecisionAfterDealMs, clearBotElevenDecisionTimeout])


  const resolveHeroPlayRevealDelayMs = useCallback((fallbackDelayMs = 0) => {
    const resolvedFallbackDelayMs = Math.max(0, fallbackDelayMs)
    const readyAt = heroPlayRevealReadyAtRef.current
    if (readyAt == null) {
      return resolvedFallbackDelayMs
    }

    return Math.max(resolvedFallbackDelayMs, readyAt - nowMs())
  }, [])

  const triggerHeroPlayMotion = useCallback(() => {
    clearHeroPlayMotionTimeout()
    heroPlayRevealReadyAtRef.current = nowMs() + heroPlayMotionSettleMs + HERO_RESPONSE_FOLLOW_DELAY_MS
    heroPlayMotionElementRef.current =
      currentPlayerCardRef.current ??
      (document.querySelector('[data-testid="hero-table-slot"]') as HTMLElement | null)
    heroPlayMotionElementRef.current?.setAttribute('data-motion-state', 'animating')
    setHeroPlayMotionActive(true)
  }, [clearHeroPlayMotionTimeout, heroPlayMotionSettleMs])

  const scheduleHeroPlayMotionClear = useCallback(() => {
    clearHeroPlayMotionTimeout()
    heroPlayMotionTimeoutRef.current = window.setTimeout(() => {
      heroPlayMotionElementRef.current?.setAttribute('data-motion-state', 'idle')
      heroPlayMotionElementRef.current = null
      setHeroPlayMotionActive(false)
      heroPlayMotionTimeoutRef.current = null
    }, heroPlayMotionSettleMs)
  }, [clearHeroPlayMotionTimeout, heroPlayMotionSettleMs])

  const startHeroPlayOverlay = useCallback((cardId: string) => {
    if (heroPlayMotionSettleMs <= 0) {
      clearHeroPlayOverlay()
      return
    }

    const fallbackSourceIndex = session?.playerView.hand?.hand.findIndex((card) => card.id === cardId) ?? -1
    const mappedSourceIndex = heroHandSlotIndexByCardIdRef.current.get(cardId)
      ?? (session ? handSlotIndexFromCardId(cardId, session.humanPlayer) : null)
    const sourceIndex = mappedSourceIndex ?? fallbackSourceIndex
    const sourceEl = sourceIndex >= 0 ? playerSlotRefs.current[sourceIndex] : null
    const targetEl = currentPlayerCardRef.current
    const sourceRect = getMotionElementRect(sourceEl)
    const targetRect = getMotionElementRect(targetEl)
    const sourceSize = getMotionElementSize(sourceEl)
    const targetSize = getMotionElementSize(targetEl)

    if (!sourceEl || !targetEl || !sourceRect || !targetRect || !sourceSize || !targetSize) {
      debugLog('startHeroPlayOverlay.bail.noGeometry', {
        cardId,
        sourceIndex,
        hasSourceEl: Boolean(sourceEl),
        hasTargetEl: Boolean(targetEl),
        hasSourceRect: Boolean(sourceRect),
        hasTargetRect: Boolean(targetRect),
        hasSourceSize: Boolean(sourceSize),
        hasTargetSize: Boolean(targetSize),
      })
      clearHeroPlayOverlay()
      return
    }

    heroPlayOverlayRunIdRef.current += 1
    const runId = heroPlayOverlayRunIdRef.current
    if (heroPlayOverlayTimeoutRef.current != null) {
      window.clearTimeout(heroPlayOverlayTimeoutRef.current)
      heroPlayOverlayTimeoutRef.current = null
    }

    setHeroPlayOverlayReadyCardId(null)
    setHeroPlayOverlay({
      cardId,
      from: {
        x: sourceRect.left + sourceRect.width / 2,
        y: sourceRect.top + sourceRect.height / 2,
      },
      to: {
        x: targetRect.left + targetRect.width / 2,
        y: targetRect.top + targetRect.height / 2,
      },
      width: sourceSize.width,
      height: sourceSize.height,
      borderRadius: getMotionElementBorderRadius(sourceEl),
      rotateFrom: getMotionElementRotationDeg(sourceEl),
      rotateTo: getMotionElementRotationDeg(targetEl) - 360,
      toWidth: targetSize.width,
      toHeight: targetSize.height,
      toBorderRadius: getMotionElementBorderRadius(targetEl),
    })

    heroPlayOverlayTimeoutRef.current = window.setTimeout(() => {
      if (heroPlayOverlayRunIdRef.current !== runId) return
      setHeroPlayOverlayReadyCardId(cardId)
      heroPlayOverlayTimeoutRef.current = null
    }, heroPlayMotionSettleMs)
  }, [clearHeroPlayOverlay, heroPlayMotionSettleMs, session])

  const clearQueuedOpponentRevealAfterHeroPlay = useCallback(() => {
    clearQueuedOpponentRevealTimeout()
    queuedOpponentRevealAfterHeroPlayRef.current = null
  }, [clearQueuedOpponentRevealTimeout])

  const clearOpponentPlayAnimation = useCallback(() => {
    opponentPlayRunIdRef.current += 1
    pendingVillainRevealNextRef.current = null
    clearQueuedOpponentRevealAfterHeroPlay()
    setOpponentPlayOverlay(null)
    setPendingVillainRevealCardId(null)
    setPendingVillainRevealCount(1)
    setOpponentRevealInFlight(false)
  }, [clearQueuedOpponentRevealAfterHeroPlay])


  const clearResolvedRoundPreview = useCallback(() => {
    clearRoundResultPreviewTimeout()
    setResolvedRoundPreview(null)
  }, [clearRoundResultPreviewTimeout])

  const queueTransitionSoundCues = useCallback((cues: QueuedSoundCue[]) => {
    clearQueuedSoundTimeouts()

    for (const sound of cues) {
      const soundOptions = sound.stake == null && sound.scorePoints == null
        ? undefined
        : { stake: sound.stake, scorePoints: sound.scorePoints }

      if ((sound.delayMs ?? 0) <= 0) {
        playSound(sound.cue, soundOptions)
        continue
      }

      const timeoutId = window.setTimeout(() => {
        playSound(sound.cue, soundOptions)
        queuedSoundTimeoutsRef.current = queuedSoundTimeoutsRef.current.filter((candidate) => candidate !== timeoutId)
      }, sound.delayMs)

      queuedSoundTimeoutsRef.current.push(timeoutId)
    }
  }, [clearQueuedSoundTimeouts, playSound])

  const triggerStakeFx = useCallback((
    nextStakeFx: Omit<StakeFx, 'runId'> | null,
    options?: { delayMs?: number; preserveCurrentUntilDelay?: boolean },
  ) => {
    clearStakeFxTimeout()

    if (!nextStakeFx || fastModeEnabled) {
      stakeFxRef.current = null
      setStakeFx(null)
      return
    }

    const delayMs = Math.max(0, options?.delayMs ?? 0)
    const currentStakeFx = stakeFxRef.current
    const shouldReuseStakeFx = delayMs === 0 && isSameStakeFx(currentStakeFx, nextStakeFx)
    const runId = shouldReuseStakeFx && currentStakeFx
      ? currentStakeFx.runId
      : ++stakeFxRunIdRef.current
    const resolvedStakeFx = { ...nextStakeFx, runId }

    const showStakeFx = () => {
      stakeFxRef.current = resolvedStakeFx
      setStakeFx(resolvedStakeFx)
      stakeFxClearTimeoutRef.current = window.setTimeout(() => {
        setStakeFx((current) => {
          if (current?.runId !== runId) return current
          stakeFxRef.current = null
          return null
        })
        stakeFxClearTimeoutRef.current = null
      }, Math.max(stakeFxOverlayDurationMs(resolvedStakeFx), stakeFxBadgeDurationMs(resolvedStakeFx)))
    }

    if (delayMs > 0) {
      if (!options?.preserveCurrentUntilDelay) {
        stakeFxRef.current = null
        setStakeFx(null)
      }
      stakeFxStartTimeoutRef.current = window.setTimeout(() => {
        stakeFxStartTimeoutRef.current = null
        showStakeFx()
      }, delayMs)
      return
    }

    showStakeFx()
  }, [clearStakeFxTimeout, fastModeEnabled])

  const syncDealVisibilityFromSession = useCallback((
    nextSession: SessionPayload | null,
    options?: { opponentCountOverride?: number },
  ) => {
    const heroCount = nextSession?.playerView.hand?.hand.length ?? 0
    const opponentCount = nextSession
      ? options?.opponentCountOverride ?? countRemainingCards(nextSession.playerView, nextSession.botPlayer)
      : 0
    setHeroDealSlotsVisible([0, 1, 2].map((index) => index < heroCount))
    setHeroDealSlotsFaceDown([false, false, false])
    setOpponentDealSlotsVisible([0, 1, 2].map((index) => index < opponentCount))
    setTurnupFaceDown(false)
  }, [])

  const revealDealtSlot = useCallback((target: DealTarget, index: number) => {
    if (target === 'player') {
      setHeroDealSlotsVisible((previous) => previous.map((visible, slotIndex) => (
        slotIndex === index ? true : visible
      )))
      setHeroDealSlotsFaceDown((previous) => previous.map((faceDown, slotIndex) => (
        slotIndex === index ? true : faceDown
      )))

      const timeoutId = window.setTimeout(() => {
        setHeroDealSlotsFaceDown((previous) => previous.map((faceDown, slotIndex) => (
          slotIndex === index ? false : faceDown
        )))
      }, heroDealFlipDelayMs)
      heroFlipTimeoutsRef.current.push(timeoutId)
      return
    }

    setOpponentDealSlotsVisible((previous) => previous.map((visible, slotIndex) => (
      slotIndex === index ? true : visible
    )))
  }, [heroDealFlipDelayMs])

  const computeDealAnimation = useCallback((step: number) => {
    const deckEl = turnupRef.current
    const deal = DEAL_ORDER[step]
    const slotEl = deal?.target === 'player'
      ? playerSlotRefs.current[deal.index]
      : opponentSlotRefs.current[deal.index]

    if (!deckEl || !slotEl) return null

    const deckRect = getMotionElementRect(deckEl)
    const slotRect = getMotionElementRect(slotEl)

    if (!deckRect || !slotRect) return null

    return {
      step,
      from: {
        x: deckRect.left + deckRect.width / 2,
        y: deckRect.top + deckRect.height / 2,
      },
      to: {
        x: slotRect.left + slotRect.width / 2,
        y: slotRect.top + slotRect.height / 2,
      },
      width: slotRect.width,
      height: slotRect.height,
      borderRadius: getMotionElementBorderRadius(slotEl),
      rotateFrom: getMotionElementRotationDeg(deckEl),
      rotateTo: getMotionElementRotationDeg(slotEl),
    }
  }, [])

  const startDealSequence = useCallback((
    nextSession: SessionPayload,
    options?: { onComplete?: () => void; opponentCountOverride?: number; transitionSound?: boolean },
  ) => {
    clearHeroFlipTimeouts()
    dealRunIdRef.current += 1

    const opponentCount = options?.opponentCountOverride
      ?? countRemainingCards(nextSession.playerView, nextSession.botPlayer)

    if (fastModeEnabled) {
      clearBetweenHandsDeck()
      setDealAnim(null)
      setIsDealingCards(false)
      syncDealVisibilityFromSession(nextSession, { opponentCountOverride: opponentCount })
      options?.onComplete?.()
      return
    }

    const runId = dealRunIdRef.current
    const heroCount = nextSession.playerView.hand?.hand.length ?? 0

    const dealSequenceStart = debugLog('startDealSequence.begin', {
      matchId: nextSession.matchId,
      runId,
      heroCount,
      opponentCount,
    })

    setIsDealingCards(true)
    setTurnupFaceDown(true)
    setDealAnim(null)
    setHeroDealSlotsVisible([false, false, false])
    setHeroDealSlotsFaceDown([false, false, false])
    setOpponentDealSlotsVisible([false, false, false])

    const runSequence = async () => {
      if (options?.transitionSound) {
        playSound('hand_transition')
        await sleep(handTransitionDealDelayMs)
        if (dealRunIdRef.current !== runId) {
          return
        }
      }

      clearBetweenHandsDeck()
      await nextFrame()
      await nextFrame()

      for (let step = 0; step < DEAL_ORDER.length; step += 1) {
        if (dealRunIdRef.current !== runId) return

        const deal = DEAL_ORDER[step]
        if ((deal.target === 'player' && deal.index >= heroCount) || (deal.target === 'opponent' && deal.index >= opponentCount)) {
          continue
        }

        let animation = computeDealAnimation(step)
        if (!animation) {
          await sleep(40)
          animation = computeDealAnimation(step)
        }

        if (!animation) {
          playSound('deal')
          revealDealtSlot(deal.target, deal.index)
          continue
        }

        setDealAnim(animation)
        await sleep(dealAnimDurationMs)
        if (dealRunIdRef.current !== runId) return

        setDealAnim(null)
        playSound('deal')
        revealDealtSlot(deal.target, deal.index)
        await sleep(dealStepPauseMs)
      }

      if (dealRunIdRef.current !== runId) return

      setDealAnim(null)
      setIsDealingCards(false)
      setTurnupFaceDown(false)
      debugLog('startDealSequence.complete', {
        matchId: nextSession.matchId,
        runId,
        elapsedMs: Date.now() - dealSequenceStart,
      })
      options?.onComplete?.()
    }

    void runSequence()
  }, [
    clearHeroFlipTimeouts,
    clearBetweenHandsDeck,
    computeDealAnimation,
    dealAnimDurationMs,
    dealStepPauseMs,
    fastModeEnabled,
    handTransitionDealDelayMs,
    playSound,
    revealDealtSlot,
    syncDealVisibilityFromSession,
  ])

  const startOpponentPlayOverlay = useCallback((
    sourceIndex: number,
    cardId: string,
    options?: { delayMs?: number; soundCue?: OpponentPlaySoundCue },
  ) => {
    const delayMs = options?.delayMs ?? 0
    const soundCue = options?.soundCue ?? 'card_play'

    if (opponentPlayOverlayMs <= 0) {
      playSound(soundCue)
      setOpeningVillainActionBlocked(false)
      clearOpponentPlayAnimation()
      return
    }

    opponentPlayRunIdRef.current += 1
    const runId = opponentPlayRunIdRef.current
    setPendingVillainRevealCardId(cardId)

    const runOverlay = async () => {
      debugLog('startOpponentPlayOverlay.runOverlay.enter', { sourceIndex, cardId, delayMs, runId })
      if (delayMs > 0) {
        await sleep(delayMs)
      }

      if (opponentPlayRunIdRef.current !== runId) return
      await nextFrame()
      await nextFrame()
      if (opponentPlayRunIdRef.current !== runId) return

      playSound(soundCue)

      const sourceEl = opponentSlotRefs.current[sourceIndex]
      const targetEl = currentOpponentCardRef.current
      if (!sourceEl || !targetEl) {
        debugLog('startOpponentPlayOverlay.runOverlay.bail.noEl', { sourceIndex, cardId, hasSourceEl: Boolean(sourceEl), hasTargetEl: Boolean(targetEl) })
        if (opponentPlayRunIdRef.current !== runId) return
        setPendingVillainRevealCardId((current) => (current === cardId ? null : current))
        setOpponentRevealInFlight(false)
        setOpeningVillainActionBlocked(false)
        return
      }

      const sourceRect = getMotionElementRect(sourceEl)
      const targetRect = getMotionElementRect(targetEl)

      if (!sourceRect || !targetRect) {
        debugLog('startOpponentPlayOverlay.runOverlay.bail.noRect', { sourceIndex, cardId, hasSourceRect: Boolean(sourceRect), hasTargetRect: Boolean(targetRect) })
        if (opponentPlayRunIdRef.current !== runId) return
        setPendingVillainRevealCardId((current) => (current === cardId ? null : current))
        setOpponentRevealInFlight(false)
        setOpeningVillainActionBlocked(false)
        return
      }

      debugLog('startOpponentPlayOverlay.runOverlay.animating', { sourceIndex, cardId, sourceRect: { x: sourceRect.x, y: sourceRect.y, w: sourceRect.width, h: sourceRect.height }, targetRect: { x: targetRect.x, y: targetRect.y } })
      setOpeningVillainActionBlocked(false)
      setOpponentRevealInFlight(true)
      setOpponentPlayOverlay({
        cardId,
        from: {
          x: sourceRect.left + sourceRect.width / 2,
          y: sourceRect.top + sourceRect.height / 2,
        },
        to: {
          x: targetRect.left + targetRect.width / 2,
          y: targetRect.top + targetRect.height / 2,
        },
        width: sourceRect.width,
        height: sourceRect.height,
        borderRadius: getMotionElementBorderRadius(sourceEl),
        rotateFrom: getMotionElementRotationDeg(sourceEl),
        rotateTo: getMotionElementRotationDeg(targetEl),
      })

      window.setTimeout(() => {
        if (opponentPlayRunIdRef.current !== runId) return
        setOpponentPlayOverlay(null)
        const next = pendingVillainRevealNextRef.current
        if (next) {
          pendingVillainRevealNextRef.current = null
          setPendingVillainRevealCardId((current) => (current === cardId ? next.cardId : current))
          setPendingVillainRevealCount(next.count)
        } else {
          setPendingVillainRevealCardId((current) => (current === cardId ? null : current))
        }
        setOpponentRevealInFlight(false)
      }, opponentPlayOverlayMs)
    }

    void runOverlay()
  }, [clearOpponentPlayAnimation, opponentPlayOverlayMs, playSound])

  const startQueuedOpponentRevealAfterHeroPlay = useCallback((delayMs: number) => {
    clearQueuedOpponentRevealTimeout()
    const pendingReveal = queuedOpponentRevealAfterHeroPlayRef.current
    if (!pendingReveal) return
    const resolvedDelayMs = resolveHeroPlayRevealDelayMs(delayMs)

    queuedOpponentRevealTimeoutRef.current = window.setTimeout(() => {
      const currentPendingReveal = queuedOpponentRevealAfterHeroPlayRef.current
      if (
        !currentPendingReveal ||
        currentPendingReveal.sourceIndex !== pendingReveal.sourceIndex ||
        currentPendingReveal.cardId !== pendingReveal.cardId
      ) {
        return
      }

      queuedOpponentRevealAfterHeroPlayRef.current = null
      queuedOpponentRevealTimeoutRef.current = null
      heroPlayMotionElementRef.current?.setAttribute('data-motion-state', 'idle')
      heroPlayMotionElementRef.current = null
      setHeroPlayMotionActive(false)
      startOpponentPlayOverlay(currentPendingReveal.sourceIndex, currentPendingReveal.cardId, {
        soundCue: currentPendingReveal.soundCue,
      })
    }, resolvedDelayMs)
  }, [clearQueuedOpponentRevealTimeout, resolveHeroPlayRevealDelayMs, startOpponentPlayOverlay])

  const queueOpponentRevealAfterHeroPlay = useCallback((sourceIndex: number, cardId: string, soundCue: OpponentPlaySoundCue) => {
    queuedOpponentRevealAfterHeroPlayRef.current = { sourceIndex, cardId, soundCue }
    startQueuedOpponentRevealAfterHeroPlay(heroPlayMotionSettleMs + HERO_RESPONSE_FOLLOW_DELAY_MS)
  }, [heroPlayMotionSettleMs, startQueuedOpponentRevealAfterHeroPlay])

  const rememberRecentLiveMatch = useCallback((nextSession: SessionPayload) => {
    const nextRecent = buildRecentLiveMatch(nextSession)

    setRecentLiveMatch((current) => {
      if (nextRecent) {
        persistRecentLiveMatch(nextRecent)
        return nextRecent
      }

      if (current?.matchId === nextSession.matchId) {
        clearRecentLiveMatch()
        return null
      }

      return current
    })
  }, [])

  const handleHeroTableCardLayoutStart = useCallback(() => {
    heroPlayRevealReadyAtRef.current = nowMs() + layoutMoveDurationS * 1000 + HERO_RESPONSE_FOLLOW_DELAY_MS
    setHeroPlayMotionActive(true)
    debugLog('heroLayout.start', {
      hasQueuedReveal: Boolean(queuedOpponentRevealAfterHeroPlayRef.current),
      queuedCardId: queuedOpponentRevealAfterHeroPlayRef.current?.cardId ?? null,
    })
    if (!queuedOpponentRevealAfterHeroPlayRef.current) return
    startQueuedOpponentRevealAfterHeroPlay(0)
  }, [layoutMoveDurationS, startQueuedOpponentRevealAfterHeroPlay])

  const handleHeroTableCardLayoutComplete = useCallback(() => {
    clearHeroPlayMotionTimeout()
    heroPlayMotionElementRef.current?.setAttribute('data-motion-state', 'idle')
    heroPlayMotionElementRef.current = null
    setHeroPlayMotionActive(false)
    debugLog('heroLayout.complete', {
      hasQueuedReveal: Boolean(queuedOpponentRevealAfterHeroPlayRef.current),
      queuedCardId: queuedOpponentRevealAfterHeroPlayRef.current?.cardId ?? null,
    })
    if (!queuedOpponentRevealAfterHeroPlayRef.current) {
      heroPlayRevealReadyAtRef.current = null
      return
    }

    startQueuedOpponentRevealAfterHeroPlay(0)
  }, [clearHeroPlayMotionTimeout, startQueuedOpponentRevealAfterHeroPlay])

  const applySessionSnapshot = useCallback((nextSession: SessionPayload, source: SessionSnapshotSource) => {
    const previousSession = previousSessionRef.current ?? (source === 'action' ? session : null)
    const switchedMatches = previousSession?.matchId != null && previousSession.matchId !== nextSession.matchId
    if (switchedMatches) {
      lastHandEndPayoffRef.current = null
    }
    clearBotElevenDecisionTimeout()
    clearOpeningVillainActionDelayTimeout()
    if (source !== 'next-hand') {
      clearBetweenHandsDeck()
    }
    const shouldDealNewHand = didStartNewHand(previousSession, nextSession, source)
    const shouldPlayHandTransition = shouldDealNewHand &&
      source === 'next-hand' &&
      previousSession != null &&
      !previousSession.publicView.hand_in_progress
    debugLog('applySessionSnapshot.start', {
      matchId: nextSession.matchId,
      source,
      shouldDealNewHand,
      shouldPlayHandTransition,
      switchedMatches,
      completedRoundCount: nextSession.state.current_hand?.state.completed_rounds.length ?? 0,
      handInProgress: nextSession.publicView.hand_in_progress,
    })
    rememberRecentLiveMatch(nextSession)
    const handEndPayoff = deriveHandEndPayoff(previousSession, nextSession)
    const resolvedRoundTransition = deriveResolvedRoundPreview(previousSession, nextSession)
    const lastHandSummary = previousSession ? buildHandSummary(previousSession, nextSession) : null
    const nextMatchResultKey = nextSession.publicView.winner != null
      ? `${nextSession.matchId}:${nextSession.publicView.winner}`
      : null
    const nextOpponentCards = countRemainingCards(nextSession.playerView, nextSession.botPlayer)
    const previousHeroPlay = previousSession?.state.current_hand?.state.current_round.plays
      ? statePlayForSeat(previousSession.state.current_hand.state.current_round.plays, previousSession.humanPlayer)
      : null
    const nextHeroPlay = nextSession.state.current_hand?.state.current_round.plays
      ? statePlayForSeat(nextSession.state.current_hand.state.current_round.plays, nextSession.humanPlayer)
      : null
    const pendingPlayerAction = pendingAction?.kind === 'player-action' ? pendingAction.action : null
    const optimisticStakeResponseAnchor =
      optimisticStakeSoundRef.current ??
      optimisticStakeSoundFromActiveFx(stakeFxRef.current) ??
      optimisticStakeSoundFromAction(previousSession, pendingPlayerAction)
    const confirmedStakeFx = deriveStakeFxFromSessionDiff(previousSession, nextSession, source)
    const forcedStakeResponseFx = source === 'action' ? pendingStakeResponseFxRef.current : null
    const skippedStakeResponseFx = deriveSkippedOptimisticRaiseResponseFx(
      optimisticStakeResponseAnchor,
      previousSession,
      nextSession,
      confirmedStakeFx,
      source,
    )
    const nextStakeFx = forcedStakeResponseFx ?? skippedStakeResponseFx ?? confirmedStakeFx
    const rawSoundCues = deriveSessionSoundCues(previousSession, nextSession, source)
    const heroFaceDownPlaySoundOverride = source === 'action'
      ? heroFaceDownPlaySoundOverrideRef.current
      : null
    const soundCues = heroFaceDownPlaySoundOverride
      ? rawSoundCues.flatMap((sound) => {
          if (sound.actor !== 'hero' || sound.cue !== 'card_hide') return [sound]
          return heroFaceDownPlaySoundOverride === 'suppress'
            ? []
            : [{ ...sound, cue: heroFaceDownPlaySoundOverride }]
        })
      : rawSoundCues
    if (source === 'action') {
      heroFaceDownPlaySoundOverrideRef.current = null
    }
    const previousVillainTableCard = currentRoundCardForSeat(previousSession, previousSession?.botPlayer)
    const nextVillainTableCard = currentRoundCardForSeat(nextSession, nextSession.botPlayer)
    const shouldStageOpponentReveal = source !== 'load' &&
      !handEndPayoff &&
      Boolean(nextVillainTableCard) &&
      nextVillainTableCard?.id !== previousVillainTableCard?.id
    const stagedOpponentCardsBeforeReveal = shouldStageOpponentReveal
      ? Math.min(3, nextOpponentCards + 1)
      : null
    const fallbackOpponentRevealSourceIndex = Math.max(0, Math.min(2, nextOpponentCards))
    const opponentSlotIndexForCard = (cardId: string, fallbackIndex = fallbackOpponentRevealSourceIndex) => (
      handSlotIndexFromCardId(cardId, nextSession.botPlayer) ?? fallbackIndex
    )
    const opponentRevealSourceIndex = nextVillainTableCard
      ? opponentSlotIndexForCard(nextVillainTableCard.id)
      : fallbackOpponentRevealSourceIndex
    const resolvedOpponentRevealSourceIndex = resolvedRoundTransition?.villainCard
      ? opponentSlotIndexForCard(resolvedRoundTransition.villainCard.id)
      : fallbackOpponentRevealSourceIndex
    const heroJustPlayed = !previousHeroPlay && Boolean(nextHeroPlay)
    const latestCompletedRound = nextSession.state.current_hand?.state.completed_rounds.at(-1) ?? null
    // When hero plays first and bot responds synchronously, the round is already in completed_rounds
    // by the time we fetch state — so nextHeroPlay is null but hero still led the round.
    const heroLedJustCompletedRound = !previousHeroPlay &&
      Boolean(resolvedRoundTransition) &&
      latestCompletedRound?.leader === nextSession.humanPlayer &&
      Boolean(resolvedRoundTransition?.villainCard)
    const resolvedVillainCardNeedsReveal = Boolean(
      resolvedRoundTransition?.villainCard &&
      resolvedRoundTransition.villainCard.id !== previousVillainTableCard?.id,
    )
    debugLog('applySessionSnapshot.roundTransitionDecision', {
      source,
      resolvedRoundTransition: Boolean(resolvedRoundTransition),
      heroLedJustCompletedRound,
      previousHeroPlayId: previousHeroPlay?.card.id ?? null,
      nextHeroPlayId: nextHeroPlay?.card.id ?? null,
      humanPlayer: nextSession.humanPlayer,
      latestCompletedRoundLeader: latestCompletedRound?.leader ?? null,
      villainCardId: resolvedRoundTransition?.villainCard?.id ?? null,
      nextVillainTableCardId: nextVillainTableCard?.id ?? null,
      shouldStageOpponentReveal,
      resolvedVillainCardNeedsReveal,
      completedRoundsCount: nextSession.state.current_hand?.state.completed_rounds.length ?? 0,
    })
    const shouldDelayStakeFx = shouldDelayStakeFxUntilAfterRoundPreview(
      previousSession,
      nextSession,
      nextStakeFx,
    )
    const heroPlayedIntoVillainRaise = heroJustPlayed &&
      nextStakeFx?.actor === 'villain' &&
      (nextStakeFx.action === 'raise' || nextStakeFx.action === 'reraise')
    const heroPlayStakeFxDelayMs = heroPlayedIntoVillainRaise
      ? heroPlayMotionSettleMs + HERO_RESPONSE_FOLLOW_DELAY_MS
      : 0
    const heroLedRoundRaiseDelayMs = heroLedJustCompletedRound && resolvedRoundTransition?.villainCard
      ? heroPlayMotionSettleMs
        + HERO_RESPONSE_FOLLOW_DELAY_MS
        + opponentPlayOverlayMs
        + roundResultPreviewMs
        + POST_ROUND_STAKE_REVEAL_GAP_MS
      : 0
    const roundPreviewStakeFxDelayMs = shouldDelayStakeFx
      ? Math.max(roundResultPreviewMs, heroLedRoundRaiseDelayMs)
      : 0
    const optimisticStakeResponseDelayMs = resolveOptimisticStakeResponseDelayMs(
      optimisticStakeResponseAnchor,
      nextStakeFx,
      source,
      fastModeEnabled,
    )
    const stakeFxDelayMs = Math.max(
      roundPreviewStakeFxDelayMs,
      heroPlayStakeFxDelayMs,
      optimisticStakeResponseDelayMs,
    )
    const shouldDelayOpeningStakeFxUntilAfterDeal = shouldDelayStakeFxUntilAfterNewHandDeal(
      shouldDealNewHand,
      nextSession,
      nextStakeFx,
    )
    // Resume a deferred bot mão-de-onze decision on ANY snapshot that still
    // shows it pending — not just freshly dealt hands. Otherwise a page reload
    // (source 'load') or a timeout recovery would clear the resume timer and
    // leave the table frozen with no legal actions.
    const shouldResumeDeferredBotElevenDecision = hasPendingBotElevenDecision(nextSession)
    const shouldDeferStakeResponseReveal = stakeFxDelayMs > 0 &&
      nextStakeFx?.actor === 'villain' &&
      (nextStakeFx.action === 'raise' || nextStakeFx.action === 'reraise')
    const opponentPlayAfterAcceptDelayMs = nextStakeFx?.actor === 'hero' &&
      nextStakeFx.action === 'accept'
      ? ACCEPT_RESPONSE_FOLLOW_DELAY_MS
      : nextStakeFx?.actor === 'villain' &&
        nextStakeFx.action === 'accept' &&
        optimisticStakeResponseDelayMs > 0
        ? optimisticStakeResponseDelayMs + ACCEPT_RESPONSE_FOLLOW_DELAY_MS
        : 0
    const syntheticStakeResponseFx = forcedStakeResponseFx ?? skippedStakeResponseFx
    const stakeResponseSoundCues: QueuedSoundCue[] = syntheticStakeResponseFx
      ? [
          ...soundCues,
          {
            cue: 'decline',
            stake: syntheticStakeResponseFx.stake,
          },
        ]
      : soundCues
    const delayedSoundCues = stakeResponseSoundCues
      .filter((sound) => {
        if (
          source === 'action' &&
          optimisticStakeResponseAnchor &&
          nextStakeFx?.actor === 'hero' &&
          isRaiseStakeAction(nextStakeFx.action) &&
          sound.cue === 'raise' &&
          sound.stake === nextStakeFx.stake
        ) {
          return false
        }

        return sound.actor !== 'villain' ||
          (sound.cue !== 'card_play' && sound.cue !== 'card_hide')
      })
      .map((sound) => {
        if (
          stakeFxDelayMs <= 0 ||
          !nextStakeFx ||
          sound.stake !== nextStakeFx.stake ||
          (
            (sound.cue !== 'raise' || !isRaiseStakeAction(nextStakeFx.action)) &&
            (sound.cue !== 'accept' || nextStakeFx.action !== 'accept') &&
            (sound.cue !== 'decline' || nextStakeFx.action !== 'decline')
          )
        ) {
          return sound
        }

        return {
          ...sound,
          delayMs: (sound.delayMs ?? 0) + stakeFxDelayMs,
        }
      })
    const stakeResponsePayoffDelayMs = handEndPayoff && nextStakeFx
      ? stakeFxDelayMs + stakeFxVisibleDurationMs(nextStakeFx) + STAKE_RESPONSE_PAYOFF_GAP_MS
      : 0
    debugLog('applySessionSnapshot.stakeFxDecision', {
      source,
      confirmedStakeFx,
      forcedStakeResponseFx,
      skippedStakeResponseFx,
      nextStakeFx,
      optimisticStakeSound: optimisticStakeResponseAnchor,
      optimisticStakeResponseDelayMs,
      stakeFxDelayMs,
      stakeResponsePayoffDelayMs,
      hasHandEndPayoff: Boolean(handEndPayoff),
    })
    const payoffAwareSoundCues = handEndPayoff
      ? delayedSoundCues.filter((sound) => sound.cue !== 'score')
      : delayedSoundCues

    if (
      source !== 'action' ||
      !nextStakeFx ||
      nextStakeFx.actor === 'villain' ||
      !isRaiseStakeAction(nextStakeFx.action)
    ) {
      optimisticStakeSoundRef.current = null
    }
    if (source !== 'action') {
      pendingStakeResponseFxRef.current = null
    }

    const looksLikeFreshMatch =
      nextSession.publicView.score['0'] === 0 &&
      nextSession.publicView.score['1'] === 0 &&
      nextSession.publicView.winner == null &&
      nextSession.publicView.hand_in_progress &&
      (nextSession.state.current_hand?.state.completed_rounds.length ?? 0) === 0

    let nextLastHandReview: StoredLastHandReview | null | undefined

    if (lastHandSummary) {
      const review = {
        state: nextSession.state,
        summary: lastHandSummary,
      } satisfies StoredLastHandReview
      nextLastHandReview = review
      writeStoredLastHandReview(nextSession.matchId, review)
    } else if (source === 'create' || looksLikeFreshMatch) {
      clearStoredLastHandReview(nextSession.matchId)
      nextLastHandReview = null
    } else if (!previousSession || switchedMatches) {
      nextLastHandReview = readStoredLastHandReview(nextSession.matchId)
    }

    if (lastHandSummary?.winner != null && previousSession && !switchedMatches) {
      const nextHistoryResult: MatchHistoryResult = lastHandSummary.winner === nextSession.humanPlayer ? 'W' : 'L'
      setMatchHandHistory((current) => [...current, nextHistoryResult].slice(-24))
    } else if (source === 'create' || looksLikeFreshMatch || switchedMatches || !previousSession) {
      setMatchHandHistory([])
    }

    const nextScoreKeys = heroVillainScoreKeys(nextSession.humanPlayer)
    if (!previousSession || switchedMatches || source === 'create' || source === 'load') {
      setDevScoreHero(nextSession.state.score[nextScoreKeys.hero])
      setDevScoreVillain(nextSession.state.score[nextScoreKeys.villain])
    }

    if (!previousSession || switchedMatches) {
      setDevVillainCards(null)
      setDevVillainCardsStale(false)
    } else if (shouldDealNewHand && devVillainCards) {
      setDevVillainCardsStale(true)
    }

    clearRoundResultPreviewTimeout()
    if (shouldDelayOpeningStakeFxUntilAfterDeal) {
      clearStakeResponseRevealTimeout()
      setStakeResponseRevealBlocked(true)
    } else {
      scheduleStakeResponseReveal(shouldDeferStakeResponseReveal ? stakeFxDelayMs : 0)
    }
    setStagedFaceDownCardIds((current) => {
      if (source !== 'action' || switchedMatches || shouldDealNewHand || !nextSession.publicView.hand_in_progress) {
        return current.size === 0 ? current : new Set<string>()
      }

      return filterStagedFaceDownCardIds(current, nextSession.playerView.hand?.hand)
    })
    const nextDisplayScore = handEndPayoff ? handEndPayoff.previousScore : sessionDisplayScore(nextSession)
    if (source === 'action') {
      dispatchEngineEvent({
        type: 'action-applied',
        result: {
          snapshot: nextSession,
          source,
          pendingAction,
        },
        payoff: handEndPayoff,
        displayScore: nextDisplayScore,
        lastHandReview: nextLastHandReview,
      })
    } else {
      dispatchEngineEvent({
        type: 'session-loaded',
        snapshot: nextSession,
        source,
        payoff: handEndPayoff,
        displayScore: nextDisplayScore,
        lastHandReview: nextLastHandReview,
      })
    }
    setLatchedVillainTableCard(nextVillainTableCard)
    previousSessionRef.current = nextSession
    setUsePostPayoffNextHandDelay(Boolean(handEndPayoff))
    if (!previousHeroPlay && nextHeroPlay) {
      triggerHeroPlayMotion()
    }
    if (shouldDelayOpeningStakeFxUntilAfterDeal) {
      triggerStakeFx(null)
    } else {
      triggerStakeFx(nextStakeFx, {
        delayMs: stakeFxDelayMs,
        preserveCurrentUntilDelay: optimisticStakeResponseDelayMs > 0,
      })
    }
    if (source === 'action') {
      pendingStakeResponseFxRef.current = null
    }
    queueTransitionSoundCues(payoffAwareSoundCues.map((sound) => ({
      ...sound,
      delayMs: sound.delayMs == null
        ? undefined
        : sound.cue === 'score' || sound.cue === 'match_win' || sound.cue === 'match_lose'
          ? Math.min(sound.delayMs, matchResultSoundDelayMs)
          : sound.delayMs,
    })))

    const revealOpeningStakeFxAfterDeal = () => {
      if (!shouldDelayOpeningStakeFxUntilAfterDeal) return
      const delayedStakeSound = soundCueForDelayedOpeningStakeFx(
        shouldDelayOpeningStakeFxUntilAfterDeal,
        nextStakeFx,
      )
      setStakeResponseRevealBlocked(false)
      triggerStakeFx(nextStakeFx)
      setOpeningVillainActionBlocked(false)
      if (delayedStakeSound) {
        playSound(delayedStakeSound.cue, { stake: delayedStakeSound.stake })
      }
    }

    const delayOpeningVillainActionAfterDeal = (callback: () => void) => {
      if (!shouldDelayOpeningStakeFxUntilAfterDeal && !(shouldStageOpponentReveal && nextVillainTableCard)) {
        callback()
        return
      }

      scheduleOpeningVillainActionAfterDeal(callback)
    }

    const resumeDeferredBotElevenDecisionAfterDeal = () => {
      if (!shouldResumeDeferredBotElevenDecision) return
      scheduleBotElevenDecisionAfterDeal(nextSession.matchId)
    }

    if (shouldDealNewHand) {
      clearResolvedRoundPreview()
      resetHandEndPayoffState(sessionDisplayScore(nextSession))
      setUsePostPayoffNextHandDelay(false)
      clearOpponentPlayAnimation()
      if (openingVillainActionDelayMs > 0 && (
        shouldDelayOpeningStakeFxUntilAfterDeal ||
        (shouldStageOpponentReveal && nextVillainTableCard)
      )) {
        setOpeningVillainActionBlocked(true)
      }
      if (shouldStageOpponentReveal && nextVillainTableCard) {
        setPendingVillainRevealCardId(nextVillainTableCard.id)
        setOpponentRevealInFlight(false)
        startDealSequence(nextSession, {
          opponentCountOverride: stagedOpponentCardsBeforeReveal ?? undefined,
          transitionSound: shouldPlayHandTransition,
          onComplete: () => {
            delayOpeningVillainActionAfterDeal(() => {
              revealOpeningStakeFxAfterDeal()
              startOpponentPlayOverlay(opponentRevealSourceIndex, nextVillainTableCard.id, {
                delayMs: opponentPlayAfterAcceptDelayMs,
                soundCue: cardSoundCueForDisplay(nextVillainTableCard),
              })
              resumeDeferredBotElevenDecisionAfterDeal()
            })
          },
        })
        return
      }

      startDealSequence(nextSession, {
        transitionSound: shouldPlayHandTransition,
        onComplete: () => {
          delayOpeningVillainActionAfterDeal(() => {
            revealOpeningStakeFxAfterDeal()
            resumeDeferredBotElevenDecisionAfterDeal()
          })
        },
      })
      return
    }

    clearHeroFlipTimeouts()
    dealRunIdRef.current += 1
    setDealAnim(null)
    setIsDealingCards(false)
    syncDealVisibilityFromSession(nextSession)

    // Non-deal snapshots (page reload, timeout recovery) can still carry a
    // deferred bot mão-de-onze decision; without this the table freezes.
    resumeDeferredBotElevenDecisionAfterDeal()

    if (resolvedRoundTransition) {
      setResolvedRoundPreview(resolvedRoundTransition)
    } else {
      setResolvedRoundPreview(null)
    }

    if (handEndPayoff) {
      lastHandEndPayoffRef.current = handEndPayoff
      clearOpponentPlayAnimation()
      setReadyMatchCompleteResultKey(null)

      const startHandEndPayoffSequence = (delayMs = 0) => {
        const runId = ++handEndFxRunIdRef.current
        const startSequence = async () => {
          if (handEndFxRunIdRef.current !== runId) return
          await runHandEndPayoffSequence(handEndPayoff, runId, {
            onScoreLand: (payoff) => playPayoffScoreSoundAndGather(payoff, nextSession),
            scoreSettleMs: scoreAndGatherSettleMsForPayoff,
          })
          if (handEndFxRunIdRef.current !== runId) return
          if (nextMatchResultKey != null) {
            setReadyMatchCompleteResultKey(nextMatchResultKey)
          }
        }

        if (delayMs > 0) {
          setIsHandEndSequenceRunning(true)
          window.setTimeout(startSequence, delayMs)
        } else {
          startSequence()
        }

        return runId
      }

      const clearResolvedRoundPreviewAfter = (runId: number, delayMs: number) => {
        roundResultPreviewTimeoutRef.current = window.setTimeout(() => {
          roundResultPreviewTimeoutRef.current = null
          if (handEndFxRunIdRef.current !== runId) return
          setResolvedRoundPreview(null)
        }, delayMs)
      }

      if (resolvedRoundTransition) {
        if (heroLedJustCompletedRound && resolvedRoundTransition.villainCard) {
          setPendingVillainRevealCardId(resolvedRoundTransition.villainCard.id)
          setOpponentRevealInFlight(false)
          triggerHeroPlayMotion()
          queueOpponentRevealAfterHeroPlay(
            resolvedOpponentRevealSourceIndex,
            resolvedRoundTransition.villainCard.id,
            cardSoundCueForDisplay(resolvedRoundTransition.villainCard),
          )
          const scoreAndMatchFxDelayMs = Math.max(
            stakeResponsePayoffDelayMs,
            heroPlayMotionSettleMs
            + HERO_RESPONSE_FOLLOW_DELAY_MS
            + opponentPlayOverlayMs,
          )
          const runId = startHandEndPayoffSequence(scoreAndMatchFxDelayMs)
          clearResolvedRoundPreviewAfter(runId, scoreAndMatchFxDelayMs + roundResultPreviewMs)
        } else if (resolvedVillainCardNeedsReveal && resolvedRoundTransition.villainCard) {
          setPendingVillainRevealCardId(resolvedRoundTransition.villainCard.id)
          setOpponentRevealInFlight(false)
          startOpponentPlayOverlay(resolvedOpponentRevealSourceIndex, resolvedRoundTransition.villainCard.id, {
            delayMs: opponentPlayAfterAcceptDelayMs,
            soundCue: cardSoundCueForDisplay(resolvedRoundTransition.villainCard),
          })
          const scoreAndMatchFxDelayMs = Math.max(
            stakeResponsePayoffDelayMs,
            opponentPlayAfterAcceptDelayMs + opponentPlayOverlayMs,
            layoutMoveDurationS * 1000,
          )
          const runId = startHandEndPayoffSequence(scoreAndMatchFxDelayMs)
          clearResolvedRoundPreviewAfter(runId, scoreAndMatchFxDelayMs + roundResultPreviewMs)
        } else {
          const scoreAndMatchFxDelayMs = Math.max(
            stakeResponsePayoffDelayMs,
            layoutMoveDurationS * 1000,
          )
          const runId = startHandEndPayoffSequence(scoreAndMatchFxDelayMs)
          clearResolvedRoundPreviewAfter(runId, scoreAndMatchFxDelayMs + roundResultPreviewMs)
        }
      } else {
        startHandEndPayoffSequence(stakeResponsePayoffDelayMs)
      }
      return
    }

    resetHandEndPayoffState(sessionDisplayScore(nextSession))
    setUsePostPayoffNextHandDelay(false)
    setReadyMatchCompleteResultKey(nextMatchResultKey)

    if (resolvedRoundTransition) {
      clearOpponentPlayAnimation()
      if (heroLedJustCompletedRound && resolvedRoundTransition.villainCard) {
        triggerHeroPlayMotion()
        if (nextVillainTableCard && shouldStageOpponentReveal) {
          // Villain won the just-completed round and already led the next round (bot plays
          // synchronously). Animate villain's round-1 card after hero settles (must hide it
          // by its own ID so shouldHideVillainTableCardForOverlay matches displayedVillainTableCard
          // while resolvedRoundPreview is active), show the round preview, then reveal the
          // round-2 card via a second overlay pass.
          setPendingVillainRevealCardId(resolvedRoundTransition.villainCard.id)
          setPendingVillainRevealCount(2)
          setOpponentRevealInFlight(false)
          // When round-1 overlay completes, transition to round-2 card ID (count=1) so the
          // villain keeps showing 2 slots during the preview instead of dropping to 1.
          pendingVillainRevealNextRef.current = {
            cardId: nextVillainTableCard.id,
            count: 1,
          }
          queueOpponentRevealAfterHeroPlay(
            opponentSlotIndexForCard(
              resolvedRoundTransition.villainCard.id,
              Math.max(0, Math.min(2, nextOpponentCards + 1)),
            ),
            resolvedRoundTransition.villainCard.id,
            cardSoundCueForDisplay(resolvedRoundTransition.villainCard),
          )
          roundResultPreviewTimeoutRef.current = window.setTimeout(() => {
            roundResultPreviewTimeoutRef.current = null
            setPendingVillainRevealCardId(nextVillainTableCard.id)
            setPendingVillainRevealCount(1)
            setOpponentRevealInFlight(false)
            setResolvedRoundPreview(null)
            startOpponentPlayOverlay(opponentRevealSourceIndex, nextVillainTableCard.id, {
              delayMs: opponentPlayAfterAcceptDelayMs,
              soundCue: cardSoundCueForDisplay(nextVillainTableCard),
            })
          }, heroPlayMotionSettleMs + HERO_RESPONSE_FOLLOW_DELAY_MS + opponentPlayOverlayMs + roundResultPreviewMs)
          return
        }
        // The opponent responded in the same round the user led — hide the response until after that card
        // animates, then reveal via overlay.
        setPendingVillainRevealCardId(resolvedRoundTransition.villainCard.id)
        setOpponentRevealInFlight(false)
        queueOpponentRevealAfterHeroPlay(
          resolvedOpponentRevealSourceIndex,
          resolvedRoundTransition.villainCard.id,
          cardSoundCueForDisplay(resolvedRoundTransition.villainCard),
        )
        const roundPreviewClearDelayMs = Math.max(
          heroPlayMotionSettleMs + HERO_RESPONSE_FOLLOW_DELAY_MS + opponentPlayOverlayMs + roundResultPreviewMs,
          stakeFxDelayMs,
        )
        roundResultPreviewTimeoutRef.current = window.setTimeout(() => {
          roundResultPreviewTimeoutRef.current = null
          setResolvedRoundPreview(null)
        }, roundPreviewClearDelayMs)
        return
      }
      if (resolvedVillainCardNeedsReveal && resolvedRoundTransition.villainCard) {
        setPendingVillainRevealCardId(resolvedRoundTransition.villainCard.id)
        setOpponentRevealInFlight(false)
        startOpponentPlayOverlay(resolvedOpponentRevealSourceIndex, resolvedRoundTransition.villainCard.id, {
          delayMs: opponentPlayAfterAcceptDelayMs,
          soundCue: cardSoundCueForDisplay(resolvedRoundTransition.villainCard),
        })
        const roundPreviewClearDelayMs = Math.max(
          opponentPlayAfterAcceptDelayMs + opponentPlayOverlayMs + roundResultPreviewMs,
          stakeFxDelayMs,
        )
        roundResultPreviewTimeoutRef.current = window.setTimeout(() => {
          roundResultPreviewTimeoutRef.current = null
          setResolvedRoundPreview(null)
        }, roundPreviewClearDelayMs)
        return
      }
      if (shouldStageOpponentReveal && nextVillainTableCard) {
        setPendingVillainRevealCardId(nextVillainTableCard.id)
        setOpponentRevealInFlight(false)
      }
      roundResultPreviewTimeoutRef.current = window.setTimeout(() => {
        roundResultPreviewTimeoutRef.current = null
        setResolvedRoundPreview(null)
        if (shouldStageOpponentReveal && nextVillainTableCard) {
          startOpponentPlayOverlay(opponentRevealSourceIndex, nextVillainTableCard.id, {
            delayMs: opponentPlayAfterAcceptDelayMs,
            soundCue: cardSoundCueForDisplay(nextVillainTableCard),
          })
        }
      }, roundResultPreviewMs)
      return
    }

    if (shouldStageOpponentReveal && nextVillainTableCard) {
      setOpponentRevealInFlight(false)
      if (heroJustPlayed) {
        setPendingVillainRevealCardId(nextVillainTableCard.id)
        queueOpponentRevealAfterHeroPlay(
          opponentRevealSourceIndex,
          nextVillainTableCard.id,
          cardSoundCueForDisplay(nextVillainTableCard),
        )
        return
      }

      startOpponentPlayOverlay(opponentRevealSourceIndex, nextVillainTableCard.id, {
        delayMs: opponentPlayAfterAcceptDelayMs,
        soundCue: cardSoundCueForDisplay(nextVillainTableCard),
      })
      return
    }

    clearOpponentPlayAnimation()
  }, [
    clearOpponentPlayAnimation,
    clearHeroFlipTimeouts,
    clearBetweenHandsDeck,
    clearBotElevenDecisionTimeout,
    clearOpeningVillainActionDelayTimeout,
    clearResolvedRoundPreview,
    clearRoundResultPreviewTimeout,
    clearStakeResponseRevealTimeout,
    dispatchEngineEvent,
    heroPlayMotionSettleMs,
    layoutMoveDurationS,
    matchResultSoundDelayMs,
    openingVillainActionDelayMs,
    opponentPlayOverlayMs,
    queueTransitionSoundCues,
    queueOpponentRevealAfterHeroPlay,
    pendingAction,
    playSound,
    playPayoffScoreSoundAndGather,
    rememberRecentLiveMatch,
    handEndFxRunIdRef,
    resetHandEndPayoffState,
    roundResultPreviewMs,
    runHandEndPayoffSequence,
    scoreAndGatherSettleMsForPayoff,
    scheduleBotElevenDecisionAfterDeal,
    scheduleOpeningVillainActionAfterDeal,
    scheduleStakeResponseReveal,
    setIsHandEndSequenceRunning,
    startDealSequence,
    startOpponentPlayOverlay,
    syncDealVisibilityFromSession,
    fastModeEnabled,
    devVillainCards,
    setDevScoreHero,
    setDevScoreVillain,
    setDevVillainCards,
    setDevVillainCardsStale,
    session,
    triggerStakeFx,
    triggerHeroPlayMotion,
    lastHandEndPayoffRef,
    previousSessionRef,
  ])

  const playerView = session?.playerView ?? null
  applySessionSnapshotRef.current = applySessionSnapshot

  const grouped = session ? groupedActions(session.legalActions) : null
  const turnup = session?.state.current_hand?.state.turnup ?? null
  const pendingRaise = playerView?.hand?.public_state.pending_raise ?? null
  const pendingDecision = playerView?.hand?.public_state.pending_decision ?? null
  const displayedPendingRaise = (isResolvedRoundPreviewActive || stakeResponseRevealBlocked)
    ? null
    : pendingRaise
  const canAct =
    session?.publicView.hand_in_progress &&
    session.publicView.current_player === session.humanPlayer &&
    !isDealingCards &&
    !isResolvedRoundPreviewActive &&
    !stakeResponseRevealBlocked &&
    !openingVillainActionBlocked
  const humanRaiseDecisionPending = displayedPendingRaise?.raised_by === session?.botPlayer
  const botRaiseDecisionPending = displayedPendingRaise?.raised_by === session?.humanPlayer
  const humanElevenDecisionPending = pendingDecision?.player === session?.humanPlayer
  const botElevenDecisionPending = pendingDecision?.player === session?.botPlayer
  const isResolvingTurn = isPending ||
    isAutoStartingHand ||
    isDealingCards ||
    isResolvedRoundPreviewActive ||
    stakeResponseRevealBlocked ||
    openingVillainActionBlocked

  const heroScore = displayScore.hero
  const villainScore = displayScore.villain
  const matchCompleteOverlayHeroScore = isDevMatchCompleteScreen
    ? devMatchCompleteScreenWinner === (session?.humanPlayer ?? 0) ? 12 : Math.min(heroScore, 11)
    : heroScore
  const matchCompleteOverlayVillainScore = isDevMatchCompleteScreen
    ? devMatchCompleteScreenWinner !== (session?.humanPlayer ?? 0) ? 12 : Math.min(villainScore, 11)
    : villainScore
  const scorepadElevenRingSide = resolveScorePadElevenRingSide(
    { hero: heroScore, villain: villainScore },
    lastHandEndPayoffRef.current,
  )
  const maoDeOnzeSide: ScorePadSide | null = pendingDecision?.type === 'mao_de_onze' && session
    ? pendingDecision.player === session.humanPlayer
      ? 'hero'
      : pendingDecision.player === session.botPlayer
        ? 'villain'
        : null
    : null
  const elevenFocusMode: ScorePadElevenFocusMode | null =
    devElevenFocusMode ?? maoDeOnzeSide ?? (heroScore === 11 && villainScore === 11 ? 'duel' : null)
  const currentStake = playerView?.hand?.public_state.hand_value ?? 1

  useEffect(() => {
    const nextScore = { hero: heroScore, villain: villainScore }
    const previousScore = previousElevenTensionScoreRef.current
    previousElevenTensionScoreRef.current = nextScore

    if (!previousScore) return

    const cue = resolveElevenTensionSoundCue(previousScore, nextScore)
    const soundMatchId = session?.matchId ?? 'local'

    if (cue === 'eleven_entry' && elevenEntrySoundMatchIdRef.current !== soundMatchId) {
      elevenEntrySoundMatchIdRef.current = soundMatchId
      playSound('eleven_entry')
      return
    }

    if (cue === 'eleven_duel' && elevenDuelSoundMatchIdRef.current !== soundMatchId) {
      elevenDuelSoundMatchIdRef.current = soundMatchId
      playSound('eleven_duel')
    }
  }, [heroScore, playSound, session?.matchId, villainScore])

  useEffect(() => {
    const focusSide = elevenFocusMode === 'hero' || elevenFocusMode === 'villain'
      ? elevenFocusMode
      : null
    const focusKey = focusSide ? `${session?.matchId ?? 'local'}:${focusSide}` : null

    if (!focusKey) {
      previousElevenFocusSoundRef.current = null
      return
    }

    if (previousElevenFocusSoundRef.current === focusKey) return

    previousElevenFocusSoundRef.current = focusKey
    playSound('eleven_focus')
  }, [elevenFocusMode, playSound, session?.matchId])

  const devScoreEditState = deriveLiveDevScoreEditState(session)
  const heroScoreLocked = devScoreEditState.heroLocked
  const villainScoreLocked = devScoreEditState.villainLocked
  const selectedStakeResponse = (() => {
    switch (devStakeResponseAction) {
      case 'accept_raise':
        return { type: 'accept_raise' } satisfies SessionAction
      case 'fold':
        return { type: 'fold' } satisfies SessionAction
    }
  })()
  const pendingBotOverride = session?.pendingBotOverride ?? null
  const pendingStakeOverride = pendingBotOverride && (
    pendingBotOverride.type === 'accept_raise' ||
    pendingBotOverride.type === 'fold'
  )
    ? pendingBotOverride
    : null
  const pendingForceRaiseOverride = pendingBotOverride && (
    pendingBotOverride.type === 'next_legal_raise' ||
    pendingBotOverride.type === 'raise'
  )
    ? pendingBotOverride
    : null
  const pendingVillainCardOverride = pendingBotOverride && (
    pendingBotOverride.type === 'play_face_up' ||
    pendingBotOverride.type === 'play_face_down'
  )
    ? pendingBotOverride
    : null
  const matchEndActionsDisabled = isPending || isAutoStartingHand || isDealingCards
  const showLauncherOverlay = !session && !isPending && !sessionFailure && !launcherTransitioningOut
  const displayedStake = activeHandEndPayoff?.points ?? displayedPendingRaise?.to ?? currentStake
  const autoStartDelayMs = usePostPayoffNextHandDelay ? nextHandAfterPayoffDelayMs : nextHandDelayMs
  const scoreSideLabelText = (side: ScoreSide) => (
    side === 'hero' ? tCommon('you') : tCommon('them')
  )
  const scoreSideSubjectText = (side: ScoreSide) => (
    side === 'hero' ? tCommon('you') : tCommon('they')
  )
  const playerWinsText = (player: number | null | undefined, humanPlayer: Seat) => {
    if (player == null) return tCommon('tie')
    return player === humanPlayer ? tStatus('matchWon') : tStatus('matchLost')
  }
  const stakeFxActorText = stakeFx
    ? scoreSideSubjectText(stakeFx.actor)
    : ''
  const stakeFxCallout = stakeFx
    ? tStakeFx(`callout.${stakeFx.action}`, { actor: stakeFxActorText, stake: stakeFx.stake })
    : null
  const stakeFxLiveBadge = stakeFx?.action === 'accept'
    ? tStakeFx('liveBadge', { stake: stakeFx.stake })
    : null
  const decisionFxLabel = stakeFx
    ? tStakeFx(`label.${stakeFx.action}`, { actor: stakeFxActorText })
    : null
  const stakeAcceptTransitionActive = stakeFx?.action === 'accept'

  const scoreCelebrationFor = (side: ScoreSide) => {
    if (handEndFx?.winner === side) return handEndFx.phase === 'land' ? 'impact' : handEndFx.phase
    if (scorePulseState?.player === side) return 'settle'
    if (isHandEndSequenceRunning && activeHandEndPayoff?.winner === side) return 'charge'
    return null
  }
  const scoreCelebration = {
    hero: scoreCelebrationFor('hero'),
    villain: scoreCelebrationFor('villain'),
  }
  const stagedFaceDownCardCount = stagedFaceDownCardIds.size
  const hasStagedFaceDownCards = stagedFaceDownCardCount > 0

  const decisionSummary = (() => {
    if (isHandEndSequenceRunning && activeHandEndPayoff) {
      return tStatus('scoreDelta', {
        side: scoreSideLabelText(activeHandEndPayoff.winner),
        points: activeHandEndPayoff.points,
      })
    }
    if (stakeFx?.action === 'accept') return tStatus('stakeLocked', { stake: stakeFx.stake })
    if (stakeFx?.action === 'reraise') return tStatus(
      stakeFx.actor === 'hero' ? 'heroReraised' : 'villainReraised',
      { stake: stakeFx.stake },
    )
    if (stakeFx?.action === 'raise') return tStatus(
      stakeFx.actor === 'hero' ? 'heroRaised' : 'villainRaised',
      { stake: stakeFx.stake },
    )
    if (stakeFx?.action === 'decline') return tStatus(stakeFx.actor === 'hero' ? 'heroFolded' : 'villainFolded')
    if (!session) return tStatus('noHand')
    if (isDealingCards) return tStatus('dealingShort')
    if (isResolvedRoundPreviewActive) return tStatus('roundSettled')
    if (!session.publicView.hand_in_progress) return tStatus('noHand')
    if (hasStagedFaceDownCards) return tStatus('hiddenReady', { count: stagedFaceDownCardCount })
    if (humanElevenDecisionPending) return tStatus('elevenDecision')
    if (botElevenDecisionPending) return tStatus('theyDeciding')
    if (humanRaiseDecisionPending) return tStatus('theyRaisedTo', { stake: pendingRaise?.to ?? 0 })
    if (botRaiseDecisionPending) return tStatus('raiseSent', { stake: pendingRaise?.to ?? 0 })
    if (canAct) return hasStagedFaceDownCards ? tStatus('tapHidden') : tStatus('playCard')
    if (isResolvingTurn) return tStatus('resolving')
    return tStatus('theyThinking')
  })()

  const tableStatusText = (() => {
    if (!session) return null
    if (matchWinner != null) return playerWinsText(matchWinner, session.humanPlayer)
    if (isHandEndSequenceRunning && activeHandEndPayoff) {
      return tStatus('sideTakesPoints', {
        side: scoreSideSubjectText(activeHandEndPayoff.winner),
        points: activeHandEndPayoff.points,
      })
    }
    if (isDealingCards) return tStatus('dealing')
    if (isResolvedRoundPreviewActive) return tStatus('roundSettled')
    if (!session.publicView.hand_in_progress) return tStatus('betweenHands')
    if (stakeFxCallout) return stakeFxLiveBadge ? `${stakeFxCallout} - ${stakeFxLiveBadge}` : stakeFxCallout
    if (hasStagedFaceDownCards) return tStatus('faceDownReady', { count: stagedFaceDownCardCount })
    if (humanElevenDecisionPending) return tStatus('elevenDecisionChoose')
    if (botElevenDecisionPending) return tStatus('theyDecidingProgress')
    if (humanRaiseDecisionPending) return tStatus('theyRaisedTo', { stake: pendingRaise?.to ?? 0 })
    if (botRaiseDecisionPending) return tStatus('theyDecidingProgress')
    if (canAct) return tStatus('yourTurn')
    if (isResolvingTurn) return tStatus('resolvingProgress')
    return tStatus('theirTurn')
  })()

  const heroIsResponder = humanRaiseDecisionPending
  const responseFocusActive = heroIsResponder || humanElevenDecisionPending
  const compactViewportActive = compactViewport || readCompactLiveViewport()
  const hasPlayerView = Boolean(playerView)
  const compactPlayMode = compactViewportActive && Boolean(session && playerView)
  const scorepadRailVisible = !scorepadCanUsePaper || scorepadRolled
  const dealerMarkSide = dealerMarkSideForSession(session)
  const dealerMarkHandKey = currentHandSlotKey(session)
  const settingsDrawerOpen = activeUtilitySurface === 'settings'
  const shouldShowFirstRunDeckPicker = Boolean(
    didHydrateStoredUiSettings &&
    session &&
    !showLauncherOverlay &&
    !settingsDrawerOpen &&
    matchWinner == null &&
    visibleMatchWinner == null &&
    !pendingMatchCompleteState &&
    !pendingNewMatchRequest &&
    !gamePreferences.deckPickerCompleted &&
    gamePreferences.deckPickerDismissCount < MAX_DECK_PICKER_DISMISSALS &&
    deckPickerSkippedMatchId !== session.matchId,
  )
  const actionRailHint = (() => {
    const gotIt = tHints('gotIt')
    const dismissAllLabel = tHints('neverShowHints')
    const onDismissAll = () => { updateGameplayHints(s => setHintsEnabled(s, false)) }
    if (devPreviewHint === 'raise') {
      return {
        text: tHints('raise', { raisedTo: 3, reraiseTo: 6, foldGives: 1 }),
        dismissLabel: gotIt,
        onDismiss: () => { setDevPreviewHint(null) },
        dismissAllLabel,
        onDismissAll,
      }
    }
    if (devPreviewHint === 'elevenHand') {
      return {
        text: tHints('elevenHand'),
        dismissLabel: gotIt,
        onDismiss: () => { setDevPreviewHint(null) },
        dismissAllLabel,
        onDismissAll,
      }
    }
    if (humanRaiseDecisionPending && shouldShowRaiseHint(gameplayHints) && displayedPendingRaise) {
      const reraiseTo = grouped?.raise?.to ?? null
      const raiseText = reraiseTo != null
        ? tHints('raise', { raisedTo: displayedPendingRaise.to, reraiseTo, foldGives: displayedPendingRaise.previous_value })
        : tHints('raiseMax', { raisedTo: displayedPendingRaise.to, foldGives: displayedPendingRaise.previous_value })
      return {
        text: raiseText,
        dismissLabel: gotIt,
        onDismiss: () => { updateGameplayHints(dismissRaiseHint) },
        dismissAllLabel,
        onDismissAll,
      }
    }
    if (humanElevenDecisionPending && shouldShowElevenHandHint(gameplayHints)) {
      return {
        text: tHints('elevenHand'),
        dismissLabel: gotIt,
        onDismiss: () => { updateGameplayHints(dismissElevenHandHint) },
        dismissAllLabel,
        onDismissAll,
      }
    }
    return null
  })()

  const boardClasses = [
    'live-arena__board',
    responseFocusActive ? 'is-response-focus' : '',
    pendingMatchCompleteState ? 'is-match-complete-pending' : '',
    pendingMatchCompleteState ? `is-match-complete-${pendingMatchCompleteState.tone}` : '',
  ].filter(Boolean).join(' ')
  const motionCardBackClassName = [
    'farol-motion-card-back',
    `is-deck-${deckSystem}`,
  ].join(' ')

  const clearFarolIntroTimers = useCallback(() => {
    if (farolIntroHoldTimeoutRef.current !== null) {
      window.clearTimeout(farolIntroHoldTimeoutRef.current)
      farolIntroHoldTimeoutRef.current = null
    }
    if (farolIntroSettleTimeoutRef.current !== null) {
      window.clearTimeout(farolIntroSettleTimeoutRef.current)
      farolIntroSettleTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    const matchId = session?.matchId ?? null
    const shouldCancelIntro =
      !matchId ||
      !hasPlayerView ||
      compactViewportActive ||
      fastModeEnabled ||
      (farolIntroPhase && farolIntroMatchIdRef.current !== matchId)

    if (!shouldCancelIntro) return

    clearFarolIntroTimers()
    farolIntroMatchIdRef.current = null
    farolIntroSawDealRef.current = false
    setFarolIntroPhase(null)
  }, [
    clearFarolIntroTimers,
    compactViewportActive,
    farolIntroPhase,
    fastModeEnabled,
    hasPlayerView,
    session?.matchId,
  ])

  useEffect(() => {
    if (farolIntroPhase !== 'tilted') return

    if (isDealingCards) {
      farolIntroSawDealRef.current = true
      if (farolIntroHoldTimeoutRef.current !== null) {
        window.clearTimeout(farolIntroHoldTimeoutRef.current)
        farolIntroHoldTimeoutRef.current = null
      }
      return
    }

    if (!farolIntroSawDealRef.current || farolIntroHoldTimeoutRef.current !== null) return

    farolIntroHoldTimeoutRef.current = window.setTimeout(() => {
      farolIntroHoldTimeoutRef.current = null
      setFarolIntroPhase('settling')
    }, FAROL_INTRO_PLAYABLE_HOLD_MS)
  }, [farolIntroPhase, isDealingCards])

  useEffect(() => {
    if (farolIntroPhase !== 'settling') return

    if (farolIntroSettleTimeoutRef.current !== null) {
      window.clearTimeout(farolIntroSettleTimeoutRef.current)
    }
    farolIntroSettleTimeoutRef.current = window.setTimeout(() => {
      farolIntroSettleTimeoutRef.current = null
      setFarolIntroPhase(null)
    }, FAROL_INTRO_SETTLE_MS)
  }, [farolIntroPhase])

  useEffect(() => () => {
    clearFarolIntroTimers()
  }, [clearFarolIntroTimers])

  const normalTurnFoldDisabled = (() => {
    if (!grouped?.concedeHand) return true
    if (isPending || isAutoStartingHand || isDealingCards) return true
    return !canAct
  })()

  const raiseDisabled = (() => {
    if (stakeAcceptTransitionActive) return true
    if (isPending || isAutoStartingHand || isDealingCards) return true
    if (humanElevenDecisionPending) return true
    if (!grouped?.raise) return true
    if (humanRaiseDecisionPending) return false
    return !canAct
  })()
  const stakePegAction: SessionAction | null = (() => {
    if (!session?.publicView.hand_in_progress) return null
    if (
      isPending ||
      isAutoStartingHand ||
      isDealingCards ||
      isResolvedRoundPreviewActive ||
      stakeAcceptTransitionActive
    ) return null
    if (humanElevenDecisionPending) return grouped?.acceptEleven ?? null
    if (humanRaiseDecisionPending) return grouped?.acceptRaise ?? null
    if (displayedPendingRaise) return null
    if (!canAct) return null
    return grouped?.raise ?? null
  })()
  const stakePegRefuseAction: SessionAction | null = (() => {
    if (!session?.publicView.hand_in_progress) return null
    if (
      isPending ||
      isAutoStartingHand ||
      isDealingCards ||
      isResolvedRoundPreviewActive ||
      stakeAcceptTransitionActive
    ) return null
    if (!humanRaiseDecisionPending) return null
    return grouped?.fold ?? null
  })()
  const stakePegActionLabel = stakeActionLabel(stakePegAction, {
    acceptRaise: tActions('acceptRaise'),
    playFor3: tActions('playFor3'),
    raiseTo: (stake) => tActions('raiseTo', { stake }),
  })
  const stakePegRefuseActionLabel = stakePegRefuseAction ? tActions('foldTitle') : null
  const shortcutGroupedActions = stakeAcceptTransitionActive && grouped
    ? { ...grouped, raise: undefined }
    : grouped

  const currentSoundTheme = getTableSoundTheme(soundSettings.soundTheme)
  const devDebugSnapshot = buildLiveDevDebugSnapshot(session)
  const devControlsBusy = isPending || isAutoStartingHand || isDealingCards
  const canReplayGameStartAnimation = Boolean(
    session &&
    hasPlayerView &&
    !compactViewportActive &&
    !fastModeEnabled &&
    !devControlsBusy &&
    !isHandEndSequenceRunning,
  )
  const canReplayLastPayoffFx = Boolean(lastHandEndPayoffRef.current) && !devControlsBusy && !isHandEndSequenceRunning
  const pendingNewMatchSubtitle = tNewMatch('subtitle')
  const pendingNewMatchTitle = tNewMatch('title')
  const pendingNewMatchCopy = tNewMatch('copy')
  const pendingNewMatchCancelLabel = tNewMatch('cancel')
  const pendingNewMatchConfirmLabel = tNewMatch('confirm')
  const pendingNewMatchLiveStatus = pendingNewMatchRequest && session
    ? {
        youScore: heroScore,
        themScore: villainScore,
        botKind: session.botKind,
        botProfile: session.botProfile,
        botModel: session.botModel,
      }
    : null

  const syncSessionUrl = useCallback((matchId: string) => {
    setBootMatchId(matchId)
    router.replace({ pathname: '/', query: { match: matchId } }, { scroll: false })
  }, [router, setBootMatchId])

  const clearSessionUrl = useCallback(() => {
    setBootMatchId(null)
    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.delete('match')
    window.history.replaceState(window.history.state, '', nextUrl)
  }, [setBootMatchId])

  const resetToLauncher = useCallback((options: { clearUrl?: boolean } = {}) => {
    actionLockRef.current = false
    clearHeroFlipTimeouts()
    clearHeroPlayOverlay()
    clearHeroPlayMotionTimeout()
    clearBotElevenDecisionTimeout()
    clearOpeningVillainActionDelayTimeout()
    clearQueuedSoundTimeouts()
    clearStakeFxTimeout()
    clearStakeResponseRevealTimeout()
    clearBetweenHandsDeck()
    clearDevElevenFocus()
    clearResolvedRoundPreview()
    previousSessionRef.current = null
    lastHandEndPayoffRef.current = null
    dealRunIdRef.current += 1
    opponentPlayRunIdRef.current += 1
    clearQueuedOpponentRevealAfterHeroPlay()
    stakeFxRef.current = null
    handEndFxRunIdRef.current += 1
    clearScorePulseTimeout()
    dispatchEngineEvent({ type: 'reset', displayScore: { hero: 0, villain: 0 } })
    setLatchedVillainTableCard(null)
    setDealAnim(null)
    setOpponentPlayOverlay(null)
    setPendingVillainRevealCardId(null)
    setOpponentRevealInFlight(false)
    setStakeFx(null)
    setStakeResponseRevealBlocked(false)
    setOpeningVillainActionBlocked(false)
    setIsDealingCards(false)
    setIsHeroDragActive(false)
    setIsHeroDragOverDropTarget(false)
    setStagedFaceDownCardIds(new Set<string>())
    setUsePostPayoffNextHandDelay(false)
    setPendingNewMatchRequest(null)
    setActiveUtilitySurface(null)
    setOverlayMenuOpen(null)
    setLauncherTransitioningOut(false)
    setMatchHandHistory([])
    setDevScoreHero(0)
    setDevScoreVillain(0)
    setDevVillainCards(null)
    setDevVillainCardsStale(false)

    if (options.clearUrl) {
      clearSessionUrl()
    }
  }, [clearBetweenHandsDeck, clearBotElevenDecisionTimeout, clearDevElevenFocus, clearHeroFlipTimeouts, clearHeroPlayOverlay, clearHeroPlayMotionTimeout, clearOpeningVillainActionDelayTimeout, clearQueuedOpponentRevealAfterHeroPlay, clearQueuedSoundTimeouts, clearResolvedRoundPreview, clearScorePulseTimeout, clearSessionUrl, clearStakeFxTimeout, clearStakeResponseRevealTimeout, dispatchEngineEvent, handEndFxRunIdRef, setActiveUtilitySurface, setDevScoreHero, setDevScoreVillain, setDevVillainCards, setDevVillainCardsStale, setLauncherTransitioningOut, setOverlayMenuOpen, actionLockRef, lastHandEndPayoffRef, previousSessionRef])

  const presentSessionFailure = useCallback((
    error: unknown,
    options: {
      retryAction: SessionFailureState['retryAction']
      retryMatchId?: string | null
      resetSession?: boolean
      clearUrl?: boolean
    },
  ) => {
    const failure = toLiveSessionFailure(error)
    const shouldResetSession = options.resetSession ?? shouldClearBrokenMatchQuery(failure.code)
    const shouldClearUrl = options.clearUrl ?? shouldClearBrokenMatchQuery(failure.code)

    if (shouldResetSession) {
      resetToLauncher({ clearUrl: shouldClearUrl })
    }

    dispatchEngineEvent({
      type: 'session-failed',
      failure: {
        ...failure,
        retryAction: shouldClearBrokenMatchQuery(failure.code) ? null : options.retryAction,
        retryMatchId: options.retryMatchId ?? null,
      },
    })

    return failure
  }, [dispatchEngineEvent, resetToLauncher])

  const recoverTimedOutMatch = useCallback(async (matchId: string) => {
    for (let attempt = 0; attempt < SESSION_TIMEOUT_RECOVERY_ATTEMPTS; attempt += 1) {
      if (attempt > 0) {
        await sleep(SESSION_TIMEOUT_RECOVERY_RETRY_DELAY_MS)
      }

      try {
        const recoveryAbort = new AbortController()
        const recoveredSession = await withClientTimeout(
          fetchSession(matchId, { signal: recoveryAbort.signal }),
          SESSION_RECOVERY_TIMEOUT_MS,
          'Refreshing the live session took too long.',
          recoveryAbort,
        )
        applySessionSnapshot(recoveredSession, 'load')
        setSessionFailure(null)
        return true
      } catch (recoveryError) {
        if (!isEngineTimeoutError(recoveryError)) {
          break
        }
      }
    }

    return false
  }, [applySessionSnapshot, setSessionFailure])

  const resumeDeferredBotElevenDecision = useCallback(async (matchId: string) => {
    const currentSession = previousSessionRef.current
    if (
      !currentSession ||
      currentSession.matchId !== matchId ||
      !hasPendingBotElevenDecision(currentSession)
    ) {
      return
    }

    if (actionLockRef.current) {
      // Another request is in flight; retry after it settles instead of
      // orphaning the bot's decision (which would freeze the table).
      scheduleBotElevenDecisionAfterDeal(matchId)
      return
    }

    actionLockRef.current = true
    dispatchEngineEvent({
      type: 'action-pending',
      action: { kind: 'refresh-match', matchId },
    })

    try {
      const botTurnAbort = new AbortController()
      const nextSession = await withClientTimeout(
        advanceBotTurns(matchId, { signal: botTurnAbort.signal }),
        MATCH_ACTION_TIMEOUT_MS,
        'Applying the villain decision took too long.',
        botTurnAbort,
      )
      applySessionSnapshotRef.current?.(nextSession, 'action')
    } catch (nextError) {
      if (isEngineTimeoutError(nextError) && await recoverTimedOutMatch(matchId)) {
        return
      }
      presentSessionFailure(nextError, {
        retryAction: 'refresh-match',
        retryMatchId: matchId,
      })
    } finally {
      actionLockRef.current = false
      dispatchEngineEvent({ type: 'action-settled', actionKind: 'refresh-match' })
    }
  }, [
    actionLockRef,
    dispatchEngineEvent,
    presentSessionFailure,
    previousSessionRef,
    recoverTimedOutMatch,
    scheduleBotElevenDecisionAfterDeal,
  ])

  resumeDeferredBotElevenDecisionRef.current = resumeDeferredBotElevenDecision

  const startNewGame = useCallback(async (dealerChoice: DealerChoice = 'random') => {
    if (actionLockRef.current || llmSelectionIssue) return
    primeSound()
    actionLockRef.current = true
    closeOverlayMenus()
    dispatchEngineEvent({ type: 'action-pending', action: { kind: 'start-match' } })
    setLastHandReview(null)
    clearBetweenHandsDeck()
    resetHandEndPayoffState({ hero: 0, villain: 0 })
    clearResolvedRoundPreview()
    setStagedFaceDownCardIds(new Set<string>())
    setUsePostPayoffNextHandDelay(false)
    setPendingNewMatchRequest(null)
    setMatchHandHistory([])
    try {
      const startMatchAbort = new AbortController()
      const nextSession = await withClientTimeout(
        createBotSession({
          humanPlayer: 0,
          startingDealer: dealerChoice === 'random' ? undefined : dealerChoice,
          botKind: selectedBotKind,
          botProfile: selectedBotProfile,
          botModel: isLlmBotKind(selectedBotKind) ? selectedBotModel || undefined : undefined,
          apiKey: isLlmBotKind(selectedBotKind) ? selectedApiKey.trim() || undefined : undefined,
          signal: startMatchAbort.signal,
        }),
        START_MATCH_TIMEOUT_MS,
        'Starting the match took too long.',
        startMatchAbort,
      )
      applySessionSnapshot(nextSession, 'create')
      syncSessionUrl(nextSession.matchId)
    } catch (nextError) {
      presentSessionFailure(nextError, {
        retryAction: 'start-match',
        resetSession: true,
        clearUrl: true,
      })
    } finally {
      actionLockRef.current = false
      dispatchEngineEvent({ type: 'action-settled', actionKind: 'start-match' })
    }
  }, [
    applySessionSnapshot,
    clearBetweenHandsDeck,
    clearResolvedRoundPreview,
    closeOverlayMenus,
    dispatchEngineEvent,
    llmSelectionIssue,
    presentSessionFailure,
    primeSound,
    resetHandEndPayoffState,
    selectedApiKey,
    selectedBotKind,
    selectedBotModel,
    selectedBotProfile,
    syncSessionUrl,
    actionLockRef,
    setLastHandReview,
  ])

  const requestStartNewGame = useCallback((
    dealerChoice: DealerChoice = newMatchDealerChoice,
    options: { confirm?: boolean } = {},
  ) => {
    if (dealerChoice !== newMatchDealerChoice) {
      setNewMatchDealerChoice(dealerChoice)
    }
    closeOverlayMenus()
    const shouldOpenRecoverySetup =
      !session &&
      sessionFailure != null &&
      shouldClearBrokenMatchQuery(sessionFailure.code)
    if (shouldOpenRecoverySetup) {
      resetToLauncher({ clearUrl: true })
      return
    }
    const shouldConfirmReset = (options.confirm ?? true) && Boolean(activeMatchId)
    if (shouldConfirmReset) {
      setPendingNewMatchRequest({ dealerChoice })
      return
    }

    void startNewGame(dealerChoice)
  }, [activeMatchId, closeOverlayMenus, newMatchDealerChoice, resetToLauncher, session, sessionFailure, startNewGame])

  const startFreshFromMatchNotFound = useCallback(() => {
    if (recentLiveMatch) {
      setSelectedBotKind(recentLiveMatch.botKind)
      setSelectedBotProfile(recentLiveMatch.botProfile ?? 'balanced')
      setSelectedBotModel(recentLiveMatch.botModel ?? '')
    }

    requestStartNewGame(newMatchDealerChoice)
  }, [newMatchDealerChoice, recentLiveMatch, requestStartNewGame])

  const startLauncherMatch = useCallback(async () => {
    if (launcherTransitioningOut || matchStartDisabled) return
    closeOverlayMenus()
    setLauncherTransitioningOut(true)
    await nextFrame()
    await nextFrame()
    await startNewGame(newMatchDealerChoice)
  }, [closeOverlayMenus, launcherTransitioningOut, matchStartDisabled, newMatchDealerChoice, setLauncherTransitioningOut, startNewGame])

  const cancelPendingNewMatch = useCallback(() => {
    closeOverlayMenus()
    setPendingNewMatchRequest(null)
  }, [closeOverlayMenus])

  const confirmPendingNewMatch = useCallback(() => {
    if (!pendingNewMatchRequest) return
    closeOverlayMenus()
    setPendingNewMatchRequest(null)
    void startNewGame(pendingNewMatchRequest.dealerChoice)
  }, [closeOverlayMenus, pendingNewMatchRequest, startNewGame])

  useEffect(() => {
    if (!pendingNewMatchRequest) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPendingNewMatchRequest(null)
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [pendingNewMatchRequest])

  const dismissMatchCompleteOverlay = useCallback(() => {
    if (!matchResultKey) return
    clearMatchResultOverlayTimeout()
    setVisibleMatchWinner(null)
    setDismissedMatchResultKey(matchResultKey)
  }, [clearMatchResultOverlayTimeout, matchResultKey])

  const requestChangeOpponentFromMatchResult = useCallback((dealerChoice: DealerChoice) => {
    dismissMatchCompleteOverlay()
    requestStartNewGame(dealerChoice, { confirm: true })
  }, [dismissMatchCompleteOverlay, requestStartNewGame])

  const dismissDevMatchCompleteScreen = useCallback(() => {
    clearDevMatchCompletePreview()
  }, [clearDevMatchCompletePreview])

  useEffect(() => {
    if (!matchResultKey || matchWinner == null) {
      clearMatchResultOverlayTimeout()
      setVisibleMatchWinner(null)
      setDismissedMatchResultKey(null)
      return
    }

    if (dismissedMatchResultKey === matchResultKey || !isMatchCompletePresentationReady) {
      clearMatchResultOverlayTimeout()
      setVisibleMatchWinner(null)
      return
    }

    if (visibleMatchWinner === matchWinner) {
      clearMatchResultOverlayTimeout()
      return
    }

    clearMatchResultOverlayTimeout()
    matchResultOverlayTimeoutRef.current = window.setTimeout(() => {
      matchResultOverlayTimeoutRef.current = null
      setVisibleMatchWinner(matchWinner)
    }, MATCH_COMPLETE_OVERLAY_DELAY_MS)

    return () => {
      clearMatchResultOverlayTimeout()
    }
  }, [
    clearMatchResultOverlayTimeout,
    dismissedMatchResultKey,
    isMatchCompletePresentationReady,
    matchResultKey,
    matchWinner,
    visibleMatchWinner,
  ])

  useEffect(() => {
    if (visibleMatchWinner == null || session == null) return
    playSound(visibleMatchWinner === session.humanPlayer ? 'match_win' : 'match_lose')
  }, [visibleMatchWinner, session, playSound])

  useEffect(() => {
    if (visibleMatchWinner == null) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismissMatchCompleteOverlay()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [dismissMatchCompleteOverlay, visibleMatchWinner])


  useEffect(() => {
    if (!compactViewportActive || !session || !playerView) {
      return
    }
    setActiveUtilitySurface(null)
  }, [compactViewportActive, playerView, session, setActiveUtilitySurface])

  useEffect(() => {
    if (!pendingNewMatchRequest) return
    closeOverlayMenus()
    setActiveUtilitySurface(null)
  }, [closeOverlayMenus, pendingNewMatchRequest, setActiveUtilitySurface])

  const loadExistingGame = useCallback(async (matchId: string) => {
    if (actionLockRef.current) return
    actionLockRef.current = true
    dispatchEngineEvent({ type: 'action-pending', action: { kind: 'load-match', matchId } })
    clearBetweenHandsDeck()
    resetHandEndPayoffState()
    clearResolvedRoundPreview()
    setStagedFaceDownCardIds(new Set<string>())
    setUsePostPayoffNextHandDelay(false)
    setPendingNewMatchRequest(null)
    try {
      const loadAbort = new AbortController()
      const nextSession = await withClientTimeout(
        fetchSession(matchId, { signal: loadAbort.signal }),
        MATCH_LOAD_TIMEOUT_MS,
        'Loading that match took too long.',
        loadAbort,
      )
      applySessionSnapshot(nextSession, 'load')
      syncSessionUrl(nextSession.matchId)
    } catch (nextError) {
      if (isEngineTimeoutError(nextError) && await recoverTimedOutMatch(matchId)) {
        return
      }
      presentSessionFailure(nextError, {
        retryAction: 'load-match',
        retryMatchId: matchId,
        clearUrl: false,
      })
    } finally {
      actionLockRef.current = false
      dispatchEngineEvent({ type: 'action-settled', actionKind: 'load-match' })
    }
  }, [applySessionSnapshot, clearBetweenHandsDeck, clearResolvedRoundPreview, dispatchEngineEvent, presentSessionFailure, recoverTimedOutMatch, resetHandEndPayoffState, syncSessionUrl, actionLockRef])

  const rejoinRecentLocalMatch = useCallback((matchId: string) => {
    setSessionFailure(null)
    void loadExistingGame(matchId)
  }, [loadExistingGame, setSessionFailure])

  const loadPastedMatchLink = useCallback((link: string) => {
    const matchId = extractLiveMatchId(link)
    if (!matchId) return false

    setSessionFailure(null)
    void loadExistingGame(matchId)
    return true
  }, [loadExistingGame, setSessionFailure])

  const continueMatch = useCallback(async () => {
    if (!session || actionLockRef.current) return
    actionLockRef.current = true
    clearResolvedRoundPreview()
    setStagedFaceDownCardIds(new Set<string>())
    setUsePostPayoffNextHandDelay(false)
    dispatchEngineEvent({
      type: 'action-pending',
      action: { kind: 'continue-match', matchId: session.matchId },
    })
    try {
      const nextHandAbort = new AbortController()
      const nextSession = await withClientTimeout(
        startNextHand(session.matchId, {
          deferBotEleven: true,
          // Dev-only vira forcing (engine-gated); 'random' leaves the deal alone.
          viraRank: showDevControls && devNextViraRank !== 'random' ? devNextViraRank : undefined,
          signal: nextHandAbort.signal,
        }),
        NEXT_HAND_TIMEOUT_MS,
        'Dealing the next hand took too long.',
        nextHandAbort,
      )
      applySessionSnapshot(nextSession, 'next-hand')
    } catch (nextError) {
      if (isEngineTimeoutError(nextError) && await recoverTimedOutMatch(session.matchId)) {
        return
      }
      presentSessionFailure(nextError, {
        retryAction: 'continue-match',
        retryMatchId: session.matchId,
      })
    } finally {
      actionLockRef.current = false
      dispatchEngineEvent({ type: 'action-settled', actionKind: 'continue-match' })
    }
  }, [applySessionSnapshot, clearResolvedRoundPreview, devNextViraRank, dispatchEngineEvent, presentSessionFailure, recoverTimedOutMatch, session, showDevControls, actionLockRef])

  useEffect(() => {
    void refreshProviderCatalogs()
  }, [refreshProviderCatalogs])

  useEffect(() => {
    if (!selectedProvider) return

    const nextModel = resolvePreferredLlmModel(selectedProvider, selectedBotModel)
    if (nextModel !== selectedBotModel) {
      setSelectedBotModel(nextModel)
    }
  }, [selectedBotModel, selectedProvider])

  useEffect(() => {
    if (didBootRef.current) return
    didBootRef.current = true
    if (!bootMatchId) return
    startTransition(() => {
      void (async () => {
        try {
          await loadExistingGame(bootMatchId)
          return
        } catch {
          return
        }
      })()
    })
  }, [bootMatchId, loadExistingGame, didBootRef])

  useEffect(() => {
    const nextBootMatchId = searchParams.get('match')
    setBootMatchId((current) => (current === nextBootMatchId ? current : nextBootMatchId))
  }, [searchParams, setBootMatchId])

  useEffect(() => {
    setGamePreferences(readLiveGamePreferences())
    setSoundSettings(readLiveSoundSettings())
    const matchSetupPreferences = readLiveMatchSetupPreferences()
    setSelectedBotKind(matchSetupPreferences.selectedBotKind)
    setSelectedBotProfile(matchSetupPreferences.selectedBotProfile)
    setSelectedBotModel(matchSetupPreferences.selectedBotModel)
    setNewMatchDealerChoice(matchSetupPreferences.newMatchDealerChoice)
    setStrengthGuideDiscovery(readStrengthGuideDiscovery())
    setGameplayHints(readGameplayHints())
    setDidHydrateStoredUiSettings(true)
  }, [])

  useEffect(() => {
    if (!didHydrateStoredUiSettings) return
    setDevAuditionThemeId((current) => (
      current === DEFAULT_SOUND_THEME_ID
        ? soundSettings.soundTheme
        : current
    ))
  }, [didHydrateStoredUiSettings, setDevAuditionThemeId, soundSettings.soundTheme])

  useEffect(() => {
    if (!didHydrateStoredUiSettings) return
    persistLiveGamePreferences(gamePreferences)
  }, [didHydrateStoredUiSettings, gamePreferences])

  useEffect(() => {
    if (!didHydrateStoredUiSettings) return
    persistLiveSoundSettings(soundSettings)
  }, [didHydrateStoredUiSettings, soundSettings])

  useEffect(() => {
    if (!didHydrateStoredUiSettings) return
    persistLiveMatchSetupPreferences({
      selectedBotKind,
      selectedBotProfile,
      selectedBotModel,
      newMatchDealerChoice,
    })
  }, [
    didHydrateStoredUiSettings,
    newMatchDealerChoice,
    selectedBotKind,
    selectedBotModel,
    selectedBotProfile,
  ])

  useEffect(() => {
    if (!didHydrateStoredUiSettings) return
    persistStrengthGuideDiscovery(strengthGuideDiscovery)
  }, [didHydrateStoredUiSettings, strengthGuideDiscovery])

  useEffect(() => {
    if (!didHydrateStoredUiSettings) return
    setStrengthGuideDiscovery((current) => markStrengthGuideHandSeen(current, session?.matchId, dealerMarkHandKey))
  }, [dealerMarkHandKey, didHydrateStoredUiSettings, session?.matchId])

  useEffect(() => {
    if (!session || isPending || isAutoStartingHand || isHandEndSequenceRunning || isResolvedRoundPreviewActive) return undefined
    if (session.publicView.winner != null || session.publicView.hand_in_progress) return undefined

    const timeoutId = window.setTimeout(() => {
      void continueMatch()
    }, autoStartDelayMs)

    return () => { window.clearTimeout(timeoutId) }
  }, [autoStartDelayMs, continueMatch, isAutoStartingHand, isHandEndSequenceRunning, isPending, isResolvedRoundPreviewActive, session])

  useEffect(() => {
    return () => {
      clearDevMatchCompletePreviewTimeout()
      devMatchCompletePreviewRunIdRef.current += 1
      clearBotElevenDecisionTimeout()
      clearHeroFlipTimeouts()
      clearHeroPlayOverlay()
      clearHeroPlayMotionTimeout()
      clearMatchResultOverlayTimeout()
      clearOpeningVillainActionDelayTimeout()
      clearQueuedOpponentRevealAfterHeroPlay()
      clearQueuedSoundTimeouts()
      clearStakeFxTimeout()
      clearStakeResponseRevealTimeout()
      clearDevElevenFocusTimeout()
      clearRoundResultPreviewTimeout()
      clearScorePulseTimeout()
      clearDevClipboardTimeout()
      handEndFxRunIdRef.current += 1
      dealRunIdRef.current += 1
      heroPlayOverlayRunIdRef.current += 1
      opponentPlayRunIdRef.current += 1
    }
  }, [clearBotElevenDecisionTimeout, clearDevClipboardTimeout, clearDevElevenFocusTimeout, clearDevMatchCompletePreviewTimeout, clearHeroFlipTimeouts, clearHeroPlayOverlay, clearHeroPlayMotionTimeout, clearMatchResultOverlayTimeout, clearOpeningVillainActionDelayTimeout, clearQueuedOpponentRevealAfterHeroPlay, clearQueuedSoundTimeouts, clearRoundResultPreviewTimeout, clearScorePulseTimeout, clearStakeFxTimeout, clearStakeResponseRevealTimeout, devMatchCompletePreviewRunIdRef, handEndFxRunIdRef])

  const reloadCurrentMatch = useCallback(() => {
    if (!session) return
    void loadExistingGame(session.matchId)
  }, [loadExistingGame, session])

  const copyCurrentMatchId = useCallback(async () => {
    if (!session) return

    if (!window.navigator.clipboard?.writeText) {
      flashDevClipboardMessage('Clipboard unavailable here')
      return
    }

    try {
      await window.navigator.clipboard.writeText(session.matchId)
      flashDevClipboardMessage('Match ID copied')
    } catch {
      flashDevClipboardMessage('Copy failed')
    }
  }, [flashDevClipboardMessage, session])

  const replayLastPayoffFx = useCallback(() => {
    const payoff = lastHandEndPayoffRef.current
    if (!payoff || isPending || isAutoStartingHand || isDealingCards || isHandEndSequenceRunning) {
      return
    }

    clearBetweenHandsDeck()
    resetHandEndPayoffState(payoff.previousScore)
    setUsePostPayoffNextHandDelay(false)
    const runId = ++handEndFxRunIdRef.current
    void runHandEndPayoffSequence(payoff, runId, {
      onScoreLand: (landedPayoff) => playPayoffScoreSoundAndGather(landedPayoff, session),
      scoreSettleMs: scoreAndGatherSettleMsForPayoff,
    })
  }, [
    handEndFxRunIdRef,
    clearBetweenHandsDeck,
    isAutoStartingHand,
    isDealingCards,
    isHandEndSequenceRunning,
    isPending,
    playPayoffScoreSoundAndGather,
    resetHandEndPayoffState,
    runHandEndPayoffSequence,
    scoreAndGatherSettleMsForPayoff,
    session,
    lastHandEndPayoffRef,
  ])

  const previewDevCue = useCallback((themeId: SoundThemeId, cue: SoundCue) => {
    const stake = cue === 'raise' || cue === 'accept' || cue === 'decline' ? 6 : undefined
    primeSound()
    previewSound(cue, stake == null ? { themeId } : { themeId, stake })
  }, [previewSound, primeSound])

  const playCurrentThemeReel = useCallback(() => {
    primeSound()
    previewThemeReel(soundSettings.soundTheme)
  }, [previewThemeReel, primeSound, soundSettings.soundTheme])

  const playAuditionThemeReel = useCallback(() => {
    primeSound()
    previewThemeReel(devAuditionThemeId)
  }, [devAuditionThemeId, previewThemeReel, primeSound])

  const triggerDevCardsToDeck = useCallback(() => {
    setHeroDealSlotsVisible([false, false, false])
    setHeroDealSlotsFaceDown([false, false, false])
    setOpponentDealSlotsVisible([false, false, false])
  }, [])

  const triggerDevDealAnimation = useCallback(() => {
    if (!session || isDealingCards) return
    primeSound()
    startDealSequence(session)
  }, [isDealingCards, primeSound, session, startDealSequence])

  const replayGameStartAnimation = useCallback(() => {
    if (!session || !canReplayGameStartAnimation) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    clearFarolIntroTimers()
    farolIntroMatchIdRef.current = session.matchId
    farolIntroSawDealRef.current = false
    setFarolIntroPhase('tilted')
    primeSound()
    startDealSequence(session)
  }, [
    canReplayGameStartAnimation,
    clearFarolIntroTimers,
    primeSound,
    session,
    startDealSequence,
  ])

  const triggerDevStakeFx = useCallback((
    action: 'raise' | 'reraise' | 'accept' | 'decline',
    actor: 'hero' | 'villain' = 'villain',
  ) => {
    const fromIdx = (STAKE_LEVELS as readonly number[]).indexOf(devAnimStakeFrom)
    const nextStake = fromIdx >= 0 && fromIdx < STAKE_LEVELS.length - 1
      ? STAKE_LEVELS[fromIdx + 1]!
      : devAnimStakeFrom
    const effectiveStake = action === 'decline' ? devAnimStakeFrom : nextStake
    primeSound()
    triggerStakeFx({ actor, action, stake: effectiveStake, fromStake: devAnimStakeFrom })
    playSound(
      action === 'accept' ? 'accept' : action === 'decline' ? 'decline' : 'raise',
      { stake: effectiveStake },
    )
  }, [devAnimStakeFrom, playSound, primeSound, triggerStakeFx])

  const triggerDevElevenDecisionFx = useCallback((mode: ScorePadElevenFocusMode) => {
    clearDevElevenFocusTimeout()
    primeSound()
    playSound('score', { scorePoints: 3 })
    setDevElevenFocusMode(mode)
    devElevenFocusTimeoutRef.current = window.setTimeout(() => {
      setDevElevenFocusMode(null)
      devElevenFocusTimeoutRef.current = null
    }, DEV_ELEVEN_FOCUS_MS)
  }, [clearDevElevenFocusTimeout, playSound, primeSound])

  const triggerDevElevenStakeFx = useCallback((action: 'accept' | 'decline') => {
    const stake = 3
    primeSound()
    triggerStakeFx({ actor: 'hero', action, stake, fromStake: 1 })
    playSound(action === 'accept' ? 'accept' : 'decline', { stake })
  }, [playSound, primeSound, triggerStakeFx])

  const triggerDevScoreFx = useCallback(() => {
    clearBetweenHandsDeck()
    resetHandEndPayoffState(displayScore)
    const runId = ++handEndFxRunIdRef.current
    const payoff: HandEndPayoff = {
      winner: devAnimScoreWinner,
      points: devAnimScorePoints,
      completedRoundCount: 3,
      previousScore: displayScore,
      nextScore: {
        hero: displayScore.hero + (devAnimScoreWinner === 'hero' ? devAnimScorePoints : 0),
        villain: displayScore.villain + (devAnimScoreWinner === 'villain' ? devAnimScorePoints : 0),
      },
    }
    primeSound()
    void runHandEndPayoffSequence(payoff, runId, {
      onScoreLand: (landedPayoff) => playPayoffScoreSoundAndGather(landedPayoff, session),
      scoreSettleMs: scoreAndGatherSettleMsForPayoff,
    })
  }, [clearBetweenHandsDeck, devAnimScorePoints, devAnimScoreWinner, displayScore, handEndFxRunIdRef, playPayoffScoreSoundAndGather, primeSound, resetHandEndPayoffState, runHandEndPayoffSequence, scoreAndGatherSettleMsForPayoff, session])

  const triggerDevMatchCompletePreview = useCallback((tone: 'victory' | 'defeat') => {
    if (!session) return

    const winnerSide: ScoreSide = tone === 'victory' ? 'hero' : 'villain'
    const runId = ++devMatchCompletePreviewRunIdRef.current
    clearDevMatchCompletePreviewTimeout()
    setDevMatchCompletePreview(null)

    void (async () => {
      await nextFrame()
      await nextFrame()
      if (devMatchCompletePreviewRunIdRef.current !== runId) return

      setDevMatchCompletePreview({ tone, winnerSide, showScreen: true })
      devMatchCompletePreviewTimeoutRef.current = window.setTimeout(() => {
        if (devMatchCompletePreviewRunIdRef.current !== runId) return
        devMatchCompletePreviewTimeoutRef.current = null
        setDevMatchCompletePreview(null)
      }, DEV_MATCH_COMPLETE_SCREEN_HOLD_MS)
    })()
  }, [clearDevMatchCompletePreviewTimeout, devMatchCompletePreviewRunIdRef, devMatchCompletePreviewTimeoutRef, session, setDevMatchCompletePreview])

  const {
    applyDevScore,
    applyDevBotOverride,
    refreshDevVillainCards,
  } = useLiveDevActions({
    session,
    actionLockRef,
    dispatchEngineEvent,
    clearResolvedRoundPreview,
    devScoreHero,
    devScoreVillain,
    devScoreEditState,
    setDevVillainCards,
    setDevVillainCardsStale,
    applySessionSnapshot,
    presentSessionFailure,
    recoverTimedOutMatch,
    withClientTimeout,
    isEngineTimeoutError,
    matchActionTimeoutMs: MATCH_ACTION_TIMEOUT_MS,
    matchLoadTimeoutMs: MATCH_LOAD_TIMEOUT_MS,
  })

  const act = useCallback(async (action: SessionAction) => {
    if (!session || actionLockRef.current) return
    primeSound()
    const optimisticStakeFx = deriveOptimisticStakeFx(session, action)
    actionLockRef.current = true
    dispatchEngineEvent({
      type: 'action-pending',
      action: { kind: 'player-action', matchId: session.matchId, action },
    })
    clearResolvedRoundPreview()
    if (action.type === 'concede_hand') {
      playSound('soft_fold')
    }
    if (optimisticStakeFx) {
      triggerStakeFx(optimisticStakeFx)
      if (isRaiseStakeAction(optimisticStakeFx.action)) {
        playSound('raise', { stake: optimisticStakeFx.stake })
        optimisticStakeSoundRef.current = {
          action: optimisticStakeFx.action,
          stake: optimisticStakeFx.stake,
          fromStake: optimisticStakeFx.fromStake,
          playedAtMs: nowMs(),
        }
      } else {
        optimisticStakeSoundRef.current = null
      }
    } else {
      optimisticStakeSoundRef.current = null
    }
    const actStart = debugLog('act.dispatch', {
      matchId: session.matchId,
      actionType: action.type,
    })
    try {
      const actionAbort = new AbortController()
      const nextSession = await withClientTimeout(
        applySessionAction(session.matchId, action, { signal: actionAbort.signal }),
        MATCH_ACTION_TIMEOUT_MS,
        'Applying that action took too long.',
        actionAbort,
      )
      const responseAt = debugLog('act.response', {
        matchId: session.matchId,
        actionType: action.type,
        roundtripMs: Date.now() - actStart,
      })
      if (
        optimisticStakeFx &&
        isRaiseStakeAction(optimisticStakeFx.action) &&
        !deriveStakeFxFromSessionDiff(session, nextSession, 'action') &&
        (
          scoreDeltaForSeat(session, nextSession, session.humanPlayer) > 0 ||
          !nextSession.publicView.hand_in_progress
        )
      ) {
        pendingStakeResponseFxRef.current = {
          actor: 'villain',
          action: 'decline',
          stake: optimisticStakeFx.stake,
          fromStake: optimisticStakeFx.fromStake,
        }
      }
      const delayedStakeResponseFx = pendingStakeResponseFxRef.current
      if (delayedStakeResponseFx && optimisticStakeFx && isRaiseStakeAction(optimisticStakeFx.action) && !fastModeEnabled) {
        const stakeResponseAnchor = optimisticStakeSoundRef.current ?? {
          action: optimisticStakeFx.action,
          stake: optimisticStakeFx.stake,
          fromStake: optimisticStakeFx.fromStake,
          playedAtMs: nowMs(),
        }
        const stakeResponseDelayMs = resolveOptimisticStakeResponseDelayMs(
          stakeResponseAnchor,
          delayedStakeResponseFx,
          'action',
          fastModeEnabled,
        )
        if (stakeResponseDelayMs > 0) {
          await sleep(stakeResponseDelayMs)
        }
      }
      applySessionSnapshot(nextSession, 'action')
      debugLog('act.snapshot.applied', {
        matchId: session.matchId,
        actionType: action.type,
        snapshotApplyMs: Date.now() - responseAt,
      })
    } catch (nextError) {
      if (action.type === 'play_face_down') {
        heroFaceDownPlaySoundOverrideRef.current = null
      }
      clearHeroPlayMotionTimeout()
      clearHeroPlayOverlay()
      setHeroPlayMotionActive(false)
      if (optimisticStakeFx) {
        triggerStakeFx(null)
      }
      optimisticStakeSoundRef.current = null
      pendingStakeResponseFxRef.current = null
      if (isEngineTimeoutError(nextError) && await recoverTimedOutMatch(session.matchId)) {
        return
      }
      presentSessionFailure(nextError, {
        retryAction: 'refresh-match',
        retryMatchId: session.matchId,
      })
    } finally {
      actionLockRef.current = false
      dispatchEngineEvent({ type: 'action-settled', actionKind: 'player-action' })
    }
  }, [
    applySessionSnapshot,
    clearHeroPlayOverlay,
    clearHeroPlayMotionTimeout,
    clearResolvedRoundPreview,
    dispatchEngineEvent,
    presentSessionFailure,
    playSound,
    primeSound,
    recoverTimedOutMatch,
    session,
    triggerStakeFx,
    fastModeEnabled,
    actionLockRef,
  ])

  const retrySessionFailure = useCallback(() => {
    if (!sessionFailure) return

    setSessionFailure(null)

    if (sessionFailure.retryAction === 'start-match') {
      requestStartNewGame()
      return
    }

    if (
      (sessionFailure.retryAction === 'load-match' || sessionFailure.retryAction === 'refresh-match') &&
      sessionFailure.retryMatchId
    ) {
      void loadExistingGame(sessionFailure.retryMatchId)
      return
    }

    if (sessionFailure.retryAction === 'continue-match') {
      void continueMatch()
    }
  }, [continueMatch, loadExistingGame, requestStartNewGame, sessionFailure, setSessionFailure])

  const dismissSessionFailure = useCallback(() => {
    setSessionFailure(null)
  }, [setSessionFailure])

  function handleRaiseOrReraise() {
    if (raiseDisabled) return
    if (humanRaiseDecisionPending && grouped?.raise) {
      void act(grouped.raise)
    } else if (grouped?.raise) {
      void act(grouped.raise)
    }
  }

  const handleStakePegAction = useCallback(() => {
    if (!stakePegAction) return
    void act(stakePegAction)
  }, [act, stakePegAction])

  const handleStakePegRefuse = useCallback(() => {
    if (!stakePegRefuseAction) return
    void act(stakePegRefuseAction)
  }, [act, stakePegRefuseAction])

  const rawHeroHand = playerView?.hand?.hand ?? EMPTY_SESSION_CARDS
  const heroHandSlotKey = currentHandSlotKey(session)
  const heroHandSlotPlayer = session?.humanPlayer ?? playerView?.player ?? 0
  const heroHandSlotLayout = deriveStableHandCardSlots({
    cards: rawHeroHand,
    player: heroHandSlotPlayer,
    previous: heroHandSlotStateRef.current,
    handKey: heroHandSlotKey,
  })
  heroHandSlotStateRef.current = heroHandSlotLayout.state
  heroHandSlotIndexByCardIdRef.current = new Map(
    heroHandSlotLayout.cardsBySlot.flatMap((card, index) => (
      card ? [[card.id, index] as const] : []
    )),
  )

  const heroCards: (SessionCard | null)[] = heroHandSlotLayout.cardsBySlot

  const visibleHeroCards = heroCards.map((card, index) => (
    isDealingCards && !heroDealSlotsVisible[index] ? null : card
  ))

  const opponentCardCount = playerView
    ? countRemainingCards(playerView, session!.botPlayer)
    : 0
  const fallbackVisibleOpponentCardCount = isDealingCards
    ? opponentDealSlotsVisible.filter(Boolean).length
    : pendingVillainRevealCardId
      ? Math.min(3, opponentCardCount + Math.max(0, pendingVillainRevealCount - (opponentRevealInFlight ? 1 : 0)))
      : opponentCardCount
  const pendingVisibleOpponentCardIds = (() => {
    if (!pendingVillainRevealCardId) return []

    const pendingIds: string[] = []
    if (!opponentRevealInFlight) {
      pendingIds.push(pendingVillainRevealCardId)
    }
    if (pendingVillainRevealCount > 1 && pendingVillainRevealNextRef.current?.cardId) {
      pendingIds.push(pendingVillainRevealNextRef.current.cardId)
    }
    return pendingIds
  })()
  const visibleOpponentSlots = isDealingCards
    ? opponentDealSlotsVisible
    : deriveVisibleOpponentHandSlots({
        player: session?.botPlayer ?? 1,
        playedCardIds: playedCardIdsForSeat(session, session?.botPlayer),
        pendingVisibleCardIds: pendingVisibleOpponentCardIds,
        fallbackVisibleCount: fallbackVisibleOpponentCardCount,
      })

  const heroStatePlay = session?.state.current_hand?.state.current_round.plays
    ? statePlayForSeat(session.state.current_hand.state.current_round.plays, session.humanPlayer)
    : null

  const completedRounds = session?.state.current_hand?.state.completed_rounds ?? []

  const turnupCard: CardDisplay | null = turnup
    ? { id: 'turnup', rank: turnup.rank, suit: turnup.suit }
    : null
  const heroManilhaRank = turnupCard && !turnupFaceDown ? nextManilhaRank(turnupCard.rank) : null
  const strengthGuideAvailability = {
    turnup: turnupCard,
    turnupFaceDown,
    handEndSequenceRunning: isHandEndSequenceRunning,
    betweenHandsPhase: betweenHandsGather.phase,
  } as const
  const strengthGuideAvailable = isStrengthGuideAvailable(strengthGuideAvailability)
  const strengthGuidePeekStowed = isStrengthGuidePeekStowed(strengthGuideAvailability)
  const strengthGuidePanelTurnup = turnupCard && !turnupFaceDown ? turnupCard : null
  const strengthGuideShouldShimmer = strengthGuideAvailable && shouldPulseStrengthGuide(strengthGuideDiscovery, session?.matchId)
  const strengthGuideTurnupKey = strengthGuideAvailable && turnupCard
    ? [session?.matchId ?? 'match', dealerMarkHandKey ?? 'hand', turnupCard.rank, turnupCard.suit].join(':')
    : null
  const strengthGuidePulse = strengthGuideShouldShimmer && strengthGuideShimmerActive
  const strengthGuideShellClassName = [
    'live-arena__strength-shell',
    strengthGuideOpen && strengthGuideAvailable ? 'is-open' : '',
    strengthGuidePeekStowed ? 'is-stowed' : '',
  ].filter(Boolean).join(' ')

  useEffect(() => {
    if (!strengthGuideShouldShimmer || !strengthGuideTurnupKey) {
      setStrengthGuideShimmerActive(false)
      return undefined
    }

    setStrengthGuideShimmerActive(true)
    const timeoutId = window.setTimeout(() => {
      setStrengthGuideShimmerActive(false)
    }, 6000)

    return () => { window.clearTimeout(timeoutId) }
  }, [strengthGuideShouldShimmer, strengthGuideTurnupKey])

  useEffect(() => {
    if (!strengthGuideAvailable && strengthGuideOpen) {
      setStrengthGuideOpen(false)
    }
  }, [strengthGuideAvailable, strengthGuideOpen])

  useEffect(() => {
    if (!strengthGuideOpen || !strengthGuideAvailable) return undefined

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeStrengthGuide()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeStrengthGuide, strengthGuideAvailable, strengthGuideOpen])

  function toHeroCardDisplay(play: StatePlay | null): CardDisplay | null {
    return cardDisplayFromStatePlay(play)
  }

  const currentHeroTableCard = toHeroCardDisplay(heroStatePlay)
  const currentVillainTableCard = currentRoundCardForSeat(session, session?.botPlayer)
  const displayedHeroTableCard = resolvedRoundPreview?.heroCard ?? currentHeroTableCard
  const displayedVillainTableCard = resolvedRoundPreview?.villainCard ?? currentVillainTableCard ?? latchedVillainTableCard
  const shouldHideVillainTableCardForOverlay = Boolean(
    pendingVillainRevealCardId &&
    displayedVillainTableCard &&
    displayedVillainTableCard.id === pendingVillainRevealCardId,
  )
  const shouldHideHeroTableCardForOverlay = Boolean(
    heroPlayOverlay &&
    displayedHeroTableCard,
  )
  const displayedCompletedRounds = resolvedRoundPreview
    ? completedRounds.slice(0, Math.max(0, completedRounds.length - 1))
    : completedRounds
  const heroCardsInteractive =
    Boolean(canAct) &&
    !isPending &&
    !isAutoStartingHand &&
    !isDealingCards &&
    !currentHeroTableCard
  const heroCardAffordances = heroCards.map((card) => {
    if (!card || !session) return null

    const isStagedFaceDown = stagedFaceDownCardIds.has(card.id)

    const canPlayFaceUp = heroCardsInteractive &&
      !isStagedFaceDown &&
      Boolean(legalActionForCard(session.legalActions, card.id, 'play_face_up'))
    const canPlayFaceDown = heroCardsInteractive && Boolean(legalActionForCard(session.legalActions, card.id, 'play_face_down'))

    return {
      isStagedFaceDown,
      canPlayFaceUp,
      canPlayFaceDown,
      handAffordance: (canPlayFaceUp || canPlayFaceDown) ? 'playable' as const : 'inactive' as const,
    }
  })
  const canReorderHeroCards =
    Boolean(session?.publicView.hand_in_progress && playerView?.hand) &&
    !isPending &&
    !isAutoStartingHand &&
    !isDealingCards &&
    heroCards.filter(Boolean).length > 1

  const getHeroHandReorderPreviewOffsets = useCallback((sourceIndex: number, targetIndex: number | null) => {
    if (
      targetIndex === null ||
      targetIndex === sourceIndex ||
      !heroHandSlotStateRef.current?.cardIdsBySlot[targetIndex]
    ) {
      return EMPTY_HERO_HAND_REORDER_OFFSETS
    }

    const slotCenters = playerSlotRefs.current.map((element) => {
      const rect = element?.getBoundingClientRect()
      return rect ? rect.left + (rect.width / 2) : null
    })
    if (slotCenters[sourceIndex] == null || slotCenters[targetIndex] == null) {
      return EMPTY_HERO_HAND_REORDER_OFFSETS
    }

    const offsets = [...EMPTY_HERO_HAND_REORDER_OFFSETS]
    if (sourceIndex < targetIndex) {
      for (let index = sourceIndex + 1; index <= targetIndex; index += 1) {
        const fromCenter = slotCenters[index]
        const toCenter = slotCenters[index - 1]
        if (fromCenter != null && toCenter != null) {
          offsets[index] = toCenter - fromCenter
        }
      }
    } else {
      for (let index = targetIndex; index < sourceIndex; index += 1) {
        const fromCenter = slotCenters[index]
        const toCenter = slotCenters[index + 1]
        if (fromCenter != null && toCenter != null) {
          offsets[index] = toCenter - fromCenter
        }
      }
    }

    return offsets
  }, [])

  const setHeroHandReorderTarget = useCallback((index: number | null, sourceIndex?: number) => {
    const nextOffsets = index === null || sourceIndex == null
      ? EMPTY_HERO_HAND_REORDER_OFFSETS
      : getHeroHandReorderPreviewOffsets(sourceIndex, index)
    const currentOffsets = heroHandReorderPreviewOffsets
    const offsetsChanged = currentOffsets.length !== nextOffsets.length ||
      currentOffsets.some((offset, offsetIndex) => offset !== nextOffsets[offsetIndex])

    if (heroHandReorderTargetIndexRef.current === index && !offsetsChanged) return

    heroHandReorderTargetIndexRef.current = index
    setHeroHandReorderTargetIndex(index)
    setHeroHandReorderPreviewOffsets(nextOffsets)
  }, [getHeroHandReorderPreviewOffsets, heroHandReorderPreviewOffsets])

  const getHeroHandReorderSlotIndex = useCallback((point: { x: number; y: number }, draggedIndex: number) => {
    const slots = playerSlotRefs.current
      .map((element, index) => {
        const rect = element?.getBoundingClientRect()
        return rect ? { index, rect } : null
      })
      .filter((slot): slot is { index: number; rect: DOMRect } => slot !== null)

    if (slots.length === 0) return null

    const left = Math.min(...slots.map((slot) => slot.rect.left))
    const right = Math.max(...slots.map((slot) => slot.rect.right))
    const top = Math.min(...slots.map((slot) => slot.rect.top))
    const bottom = Math.max(...slots.map((slot) => slot.rect.bottom))
    const verticalSlack = 24
    const horizontalSlack = 18

    if (
      point.x < left - horizontalSlack ||
      point.x > right + horizontalSlack ||
      point.y < top - verticalSlack ||
      point.y > bottom + verticalSlack
    ) {
      return null
    }

    const containingSlot = slots.find((slot) => (
      point.x >= slot.rect.left &&
      point.x <= slot.rect.right &&
      point.y >= slot.rect.top - verticalSlack &&
      point.y <= slot.rect.bottom + verticalSlack
    ))
    const nearestSlot = containingSlot ?? slots.reduce((best, slot) => {
      const slotCenterX = slot.rect.left + (slot.rect.width / 2)
      const bestCenterX = best.rect.left + (best.rect.width / 2)
      return Math.abs(point.x - slotCenterX) < Math.abs(point.x - bestCenterX)
        ? slot
        : best
    }, slots[0])

    return nearestSlot.index === draggedIndex ? null : nearestSlot.index
  }, [])

  const reorderHeroHand = useCallback((cardId: string, toSlotIndex: number) => {
    const nextState = reorderStableHandCardSlots({
      state: heroHandSlotStateRef.current,
      handKey: heroHandSlotKey,
      cardId,
      toSlotIndex,
    })

    if (!nextState || nextState === heroHandSlotStateRef.current) return false

    heroHandSlotStateRef.current = nextState
    setHeroHandOrderRevision((revision) => revision + 1)
    return true
  }, [heroHandSlotKey])

  const heroShortcutSlots = heroCards.map((card, index) => ({
    cardId: card?.id ?? null,
    isStagedFaceDown: Boolean(heroCardAffordances[index]?.isStagedFaceDown),
    canPlayFaceUp: Boolean(heroCardAffordances[index]?.canPlayFaceUp),
    canPlayFaceDown: Boolean(heroCardAffordances[index]?.canPlayFaceDown),
  }))

  const submitHeroCardAction = useCallback(
    (
      cardId: string,
      type: 'play_face_up' | 'play_face_down',
      options?: { faceDownSound?: HeroFaceDownPlaySoundOverride },
    ) => {
      if (!session) {
        debugLog('submitHeroCardAction.rejected', { cardId, type, rejectReason: 'no-session' })
        return false
      }
      const rejectReason =
        !canAct ? 'cannot-act'
        : isPending ? 'is-pending'
        : isAutoStartingHand ? 'auto-starting-hand'
        : isDealingCards ? 'is-dealing-cards'
        : null
      if (rejectReason) {
        debugLog('submitHeroCardAction.rejected', { cardId, type, rejectReason })
        return false
      }
      const action = legalActionForCard(session.legalActions, cardId, type)
      if (!action) {
        debugLog('submitHeroCardAction.illegalAction', { cardId, type })
        return false
      }
      const hand = session.state.current_hand?.state
      const completedRoundCount = hand?.completed_rounds.length ?? 0
      const currentRoundPlays = hand?.current_round.plays ?? []
      const currentRoundLeader = hand?.current_round.leader ?? null
      const heroIsLeadingCurrentRound = currentRoundLeader === session.humanPlayer
      const heroPlayedThisRound = currentRoundPlays.some((play) => play.player === session.humanPlayer)
      debugLog('submitHeroCardAction.accepted', {
        cardId,
        type,
        matchId: session.matchId,
        humanPlayer: session.humanPlayer,
        botKind: session.botKind,
        completedRoundCount,
        roundNumber: completedRoundCount + 1,
        heroIsFirstInRound: heroIsLeadingCurrentRound && !heroPlayedThisRound && currentRoundPlays.length === 0,
        heroIsLeadingCurrentRound,
        currentRoundPlayCount: currentRoundPlays.length,
        handValue: hand?.hand_value ?? null,
        isDealingCards,
      })
      if (type === 'play_face_down') {
        heroFaceDownPlaySoundOverrideRef.current = options?.faceDownSound
          ?? (stagedFaceDownCardIds.has(cardId) ? 'card_play' : null)
      }
      setStagedFaceDownCardIds((current) => removeStagedFaceDownCardId(current, cardId))
      if (type === 'play_face_up') {
        startHeroPlayOverlay(cardId)
        triggerHeroPlayMotion()
      }
      void act(action)
      return true
    },
    [act, canAct, isAutoStartingHand, isDealingCards, isPending, session, stagedFaceDownCardIds, startHeroPlayOverlay, triggerHeroPlayMotion],
  )

  const toggleStagedFaceDownCard = useCallback((cardId: string) => {
    if (!session || !canAct || isPending || isAutoStartingHand || isDealingCards) return
    if (!legalActionForCard(session.legalActions, cardId, 'play_face_down')) return
    activeHeroDragRef.current = null
    isHeroDragActiveRef.current = false
    setIsHeroDragActive(false)
    setHeroHandReorderSourceIndex(null)
    heroDragOverDropTargetRef.current = false
    lastHeroDragPointRef.current = null
    setIsHeroDragOverDropTarget(false)
    setHeroHandReorderTarget(null)
    setStagedFaceDownCardIds((current) => toggleStagedFaceDownCardId(current, cardId))
  }, [canAct, isAutoStartingHand, isDealingCards, isPending, session, setHeroHandReorderTarget])

  const playStagedHideSound = useCallback(() => {
    primeSound()
    playSound('card_hide')
  }, [playSound, primeSound])

  const handleHideCardChoice = useCallback((cardId: string) => {
    if (gamePreferences.hideCardPlaysImmediately) {
      const didSubmit = submitHeroCardAction(cardId, 'play_face_down', { faceDownSound: 'suppress' })
      if (didSubmit) {
        playStagedHideSound()
      }
      return
    }

    toggleStagedFaceDownCard(cardId)
  }, [gamePreferences.hideCardPlaysImmediately, playStagedHideSound, submitHeroCardAction, toggleStagedFaceDownCard])

  const { shortcutCaptureAction, setShortcutCaptureAction } = useLiveShortcuts({
    shortcutsEnabled: gamePreferences.shortcutsEnabled,
    shortcuts: gamePreferences.shortcuts,
    hideCardPlaysImmediately: gamePreferences.hideCardPlaysImmediately,
    canAct: Boolean(canAct),
    heroIsResponder,
    humanElevenDecisionPending,
    isPending,
    isAutoStartingHand,
    isDealingCards,
    heroCardSlots: heroShortcutSlots,
    groupedActions: shortcutGroupedActions,
    settingsDrawerOpen,
    strengthGuideAvailable,
    gameShortcutsBlocked: Boolean(
      pendingNewMatchRequest ||
      displayedMatchCompleteWinner != null ||
      settingsDrawerOpen ||
      shouldShowFirstRunDeckPicker ||
      showLauncherOverlay,
    ),
    act,
    assignShortcut,
    handleHideCardChoice,
    submitHeroCardAction,
    toggleStrengthGuide,
  })

  const getHeroDropSlotRect = useCallback(() => {
    return currentPlayerCardRef.current?.getBoundingClientRect() ?? null
  }, [])

  const getDraggedHeroCardRect = useCallback((cardIndex: number, offset: { x: number; y: number }) => {
    const originRect = playerSlotRefs.current[cardIndex]?.getBoundingClientRect()
    if (!originRect) return null

    return {
      left: originRect.left + offset.x,
      right: originRect.right + offset.x,
      top: originRect.top + offset.y,
      bottom: originRect.bottom + offset.y,
    }
  }, [])

  const doesDraggedCardOverlapHeroSlot = useCallback((cardIndex: number, offset: { x: number; y: number }) => {
    const draggedRect = getDraggedHeroCardRect(cardIndex, offset)
    const slotRect = getHeroDropSlotRect()
    if (!draggedRect || !slotRect) return false

    return (
      Math.min(draggedRect.right, slotRect.right) > Math.max(draggedRect.left, slotRect.left) &&
      Math.min(draggedRect.bottom, slotRect.bottom) > Math.max(draggedRect.top, slotRect.top)
    )
  }, [getDraggedHeroCardRect, getHeroDropSlotRect])

  const isPointInsideHeroSlot = useCallback((point: { x: number; y: number }) => {
    const slotRect = getHeroDropSlotRect()
    if (!slotRect) return false

    return (
      point.x >= slotRect.left &&
      point.x <= slotRect.right &&
      point.y >= slotRect.top &&
      point.y <= slotRect.bottom
    )
  }, [getHeroDropSlotRect])

  const canUseHeroTableDrop = useCallback((activeDrag: ActiveHeroDrag | null) => (
    Boolean(activeDrag?.canDropOnTable) &&
    Boolean(canAct) &&
    !isPending &&
    !isAutoStartingHand &&
    !isDealingCards &&
    !currentHeroTableCard
  ), [canAct, currentHeroTableCard, isAutoStartingHand, isDealingCards, isPending])

  const handleHeroCardDrag = useCallback((
    cardId: string,
    cardIndex: number,
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    const activeDrag = activeHeroDragRef.current
    if (!activeDrag || activeDrag.cardId !== cardId) return

    const reorderTargetIndex = canReorderHeroCards
      ? getHeroHandReorderSlotIndex(info.point, cardIndex)
      : null
    const isOverDropTarget = reorderTargetIndex === null && canUseHeroTableDrop(activeDrag) &&
      (doesDraggedCardOverlapHeroSlot(cardIndex, info.offset) || isPointInsideHeroSlot(info.point))
    heroDragOverDropTargetRef.current = isOverDropTarget
    lastHeroDragPointRef.current = { x: info.point.x, y: info.point.y }
    setIsHeroDragOverDropTarget(isOverDropTarget)
    setHeroHandReorderTarget(
      isOverDropTarget ? null : reorderTargetIndex,
      cardIndex,
    )
  }, [
    canReorderHeroCards,
    canUseHeroTableDrop,
    doesDraggedCardOverlapHeroSlot,
    getHeroHandReorderSlotIndex,
    isPointInsideHeroSlot,
    setHeroHandReorderTarget,
  ])

  const resetHeroDragState = useCallback(() => {
    activeHeroDragRef.current = null
    isHeroDragActiveRef.current = false
    setIsHeroDragActive(false)
    setHeroHandReorderSourceIndex(null)
    heroDragOverDropTargetRef.current = false
    lastHeroDragPointRef.current = null
    setIsHeroDragOverDropTarget(false)
    setHeroHandReorderTarget(null)
  }, [setHeroHandReorderTarget])

  const handleHeroCardDragEnd = useCallback((
    cardId: string,
    cardIndex: number,
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    const activeDrag = activeHeroDragRef.current
    const wasOverDropTarget = heroDragOverDropTargetRef.current
    const lastDragPoint = lastHeroDragPointRef.current
    const reorderTargetIndex = heroHandReorderTargetIndexRef.current ??
      (canReorderHeroCards ? getHeroHandReorderSlotIndex(info.point, cardIndex) : null)
    setIsHeroDragOverDropTarget(false)

    if (!activeDrag || activeDrag.cardId !== cardId) {
      resetHeroDragState()
      return
    }

    if (reorderTargetIndex !== null) {
      reorderHeroHand(cardId, reorderTargetIndex)
      resetHeroDragState()
      clearHeroPlayMotionTimeout()
      setHeroPlayMotionActive(false)
      return
    }

    const sourceRect = playerSlotRefs.current[cardIndex]?.getBoundingClientRect() ?? null
    const droppedOnSlot = canUseHeroTableDrop(activeDrag) && (
      wasOverDropTarget ||
      (lastDragPoint ? isPointInsideHeroSlot(lastDragPoint) : false) ||
      doesDraggedCardOverlapHeroSlot(cardIndex, info.offset) ||
      isPointInsideHeroSlot(info.point)
    )
    const releasedIntoFaceDownSleeve = Boolean(activeDrag.canPlayFaceDown) && (
      info.offset.y <= -30 ||
      Boolean(sourceRect && info.point.y <= sourceRect.top - 30) ||
      Boolean(lastDragPoint && sourceRect && lastDragPoint.y <= sourceRect.top - 30)
    )

    if (!droppedOnSlot) {
      resetHeroDragState()
      if (releasedIntoFaceDownSleeve) {
        submitHeroCardAction(cardId, 'play_face_down')
        return
      }

      clearHeroPlayMotionTimeout()
      setHeroPlayMotionActive(false)
      return
    }

    resetHeroDragState()
    submitHeroCardAction(cardId, 'play_face_up')
  }, [
    canReorderHeroCards,
    canUseHeroTableDrop,
    clearHeroPlayMotionTimeout,
    doesDraggedCardOverlapHeroSlot,
    getHeroHandReorderSlotIndex,
    isPointInsideHeroSlot,
    reorderHeroHand,
    resetHeroDragState,
    submitHeroCardAction,
  ])

  useEffect(() => {
    if (canReorderHeroCards || (canAct && !isPending && !isAutoStartingHand && !isDealingCards && !currentHeroTableCard)) return
    resetHeroDragState()
  }, [canAct, canReorderHeroCards, currentHeroTableCard, isAutoStartingHand, isDealingCards, isPending, resetHeroDragState])

  useEffect(() => {
    setStagedFaceDownCardIds((current) => filterStagedFaceDownCardIds(current, rawHeroHand))
  }, [rawHeroHand])

  useEffect(() => {
    const updateDragTargetState = (point: { x: number; y: number }) => {
      const activeDrag = activeHeroDragRef.current
      if (!activeDrag) return

      const reorderTargetIndex = canReorderHeroCards
        ? getHeroHandReorderSlotIndex(point, activeDrag.index)
        : null
      const isOverDropTarget = reorderTargetIndex === null && canUseHeroTableDrop(activeDrag) && isPointInsideHeroSlot(point)
      heroDragOverDropTargetRef.current = isOverDropTarget
      lastHeroDragPointRef.current = point
      setIsHeroDragOverDropTarget(isOverDropTarget)
      setHeroHandReorderTarget(
        isOverDropTarget ? null : reorderTargetIndex,
        activeDrag.index,
      )
    }

    const handleMouseMove = (event: MouseEvent) => {
      updateDragTargetState({ x: event.clientX, y: event.clientY })
    }

    const handleMouseUp = (event: MouseEvent) => {
      const activeDrag = activeHeroDragRef.current
      const wasOverDropTarget = heroDragOverDropTargetRef.current
      const lastDragPoint = lastHeroDragPointRef.current
      const releasePoint = { x: event.clientX, y: event.clientY }
      const reorderTargetIndex = activeDrag && canReorderHeroCards
        ? heroHandReorderTargetIndexRef.current ?? getHeroHandReorderSlotIndex(releasePoint, activeDrag.index)
        : null
      const sourceRect = activeDrag
        ? playerSlotRefs.current[activeDrag.index]?.getBoundingClientRect() ?? null
        : null
      const droppedOnSlot = Boolean(activeDrag && canUseHeroTableDrop(activeDrag) && (
        wasOverDropTarget ||
        (lastDragPoint ? isPointInsideHeroSlot(lastDragPoint) : false) ||
        isPointInsideHeroSlot(releasePoint)
      ))
      const releasedIntoFaceDownSleeve = Boolean(
        activeDrag?.canPlayFaceDown &&
        sourceRect &&
        releasePoint.y <= sourceRect.top - 30,
      )
      if (!activeDrag) return
      if (reorderTargetIndex !== null) {
        reorderHeroHand(activeDrag.cardId, reorderTargetIndex)
        resetHeroDragState()
        clearHeroPlayMotionTimeout()
        setHeroPlayMotionActive(false)
        return
      }
      if (droppedOnSlot) {
        resetHeroDragState()
        submitHeroCardAction(activeDrag.cardId, 'play_face_up')
        return
      }

      if (releasedIntoFaceDownSleeve) {
        resetHeroDragState()
        submitHeroCardAction(activeDrag.cardId, 'play_face_down')
        return
      }

      window.setTimeout(() => {
        const currentDrag = activeHeroDragRef.current
        if (currentDrag?.cardId === activeDrag.cardId && currentDrag.index === activeDrag.index) {
          resetHeroDragState()
        }
      }, 120)
    }

    window.addEventListener('mousemove', handleMouseMove, true)
    window.addEventListener('mouseup', handleMouseUp, true)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove, true)
      window.removeEventListener('mouseup', handleMouseUp, true)
    }
  }, [
    canReorderHeroCards,
    canUseHeroTableDrop,
    clearHeroPlayMotionTimeout,
    getHeroHandReorderSlotIndex,
    isPointInsideHeroSlot,
    reorderHeroHand,
    resetHeroDragState,
    session,
    setHeroHandReorderTarget,
    submitHeroCardAction,
  ])

  useEffect(() => {
    if (displayedHeroTableCard) return
    clearHeroPlayMotionTimeout()
    heroPlayRevealReadyAtRef.current = null
    setHeroPlayMotionActive(false)
  }, [clearHeroPlayMotionTimeout, displayedHeroTableCard])

  useEffect(() => {
    if (!heroPlayOverlay || heroPlayOverlayReadyCardId !== heroPlayOverlay.cardId) return
    if (!displayedHeroTableCard || displayedHeroTableCard.id !== heroPlayOverlay.cardId) return

    setHeroPlayOverlay(null)
    setHeroPlayOverlayReadyCardId(null)
  }, [displayedHeroTableCard, heroPlayOverlay, heroPlayOverlayReadyCardId])

  useEffect(() => {
    if (!heroPlayMotionActive || !displayedHeroTableCard) return
    scheduleHeroPlayMotionClear()
  }, [displayedHeroTableCard, heroPlayMotionActive, scheduleHeroPlayMotionClear])

  return (
    <LayoutGroup>
      <div
        className={`app-shell is-live-match ${fastModeEnabled ? 'is-fast-mode' : ''}${pendingNewMatchRequest ? ' is-new-match-confirming' : ''}`}
        data-testid="live-game-shell"
        data-compact-play={compactPlayMode ? 'true' : 'false'}
      >
        {showDevControls && (
          <LiveDevPanel
            devControls={{
              devPanelRef,
              devPanelOpen,
              setDevPanelOpen,
              devPanelPosition,
              setDevPanelPosition,
              resetDevPanelPosition,
              isDraggingDevPanel,
              handleDevPanelPointerDown,
              devSectionOpenState,
              setDevSectionOpenState,
              devClipboardMessage,
              devDealerChoice,
              setDevDealerChoice,
              devNextViraRank,
              setDevNextViraRank,
              devScoreHero,
              setDevScoreHero,
              devScoreVillain,
              setDevScoreVillain,
              devStakeResponseAction,
              setDevStakeResponseAction,
              devVillainCards,
              setDevVillainCards,
              devVillainCardsStale,
              setDevVillainCardsStale,
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
              devMatchCompletePreview,
              setDevMatchCompletePreview,
              devMatchCompletePreviewTimeoutRef,
              devMatchCompletePreviewRunIdRef,
              clearDevPanelDrag,
              clearDevClipboardTimeout,
              flashDevClipboardMessage,
              clearDevMatchCompletePreviewTimeout,
              clearDevMatchCompletePreview,
            }}
            session={session}
            matchStartDisabled={matchStartDisabled}
            isDealingCards={isDealingCards}
            settingsDrawerOpen={settingsDrawerOpen}
            compactViewportActive={compactViewportActive}
            devControlsBusy={devControlsBusy}
            devDebugSnapshot={devDebugSnapshot}
            devScoreEditState={devScoreEditState}
            heroScoreLocked={heroScoreLocked}
            villainScoreLocked={villainScoreLocked}
            selectedStakeResponse={selectedStakeResponse}
            pendingStakeOverride={pendingStakeOverride}
            pendingVillainCardOverride={pendingVillainCardOverride}
            pendingForceRaiseOverride={pendingForceRaiseOverride}
            canReplayGameStartAnimation={canReplayGameStartAnimation}
            canReplayLastPayoffFx={canReplayLastPayoffFx}
            currentSoundTheme={currentSoundTheme}
            startNewGame={startNewGame}
            reloadCurrentMatch={reloadCurrentMatch}
            copyCurrentMatchId={copyCurrentMatchId}
            triggerDevCardsToDeck={triggerDevCardsToDeck}
            triggerDevDealAnimation={triggerDevDealAnimation}
            replayGameStartAnimation={replayGameStartAnimation}
            replayLastPayoffFx={replayLastPayoffFx}
            triggerDevStakeFx={triggerDevStakeFx}
            triggerDevElevenDecisionFx={triggerDevElevenDecisionFx}
            triggerDevElevenStakeFx={triggerDevElevenStakeFx}
            triggerDevScoreFx={triggerDevScoreFx}
            triggerDevMatchCompletePreview={triggerDevMatchCompletePreview}
            playCurrentThemeReel={playCurrentThemeReel}
            playAuditionThemeReel={playAuditionThemeReel}
            previewDevCue={previewDevCue}
            applyDevScore={applyDevScore}
            applyDevBotOverride={applyDevBotOverride}
            refreshDevVillainCards={refreshDevVillainCards}
            resetFirstRunDeckPicker={resetFirstRunDeckPicker}
            gameplayHints={gameplayHints}
            updateGameplayHints={updateGameplayHints}
            devPreviewHint={devPreviewHint}
            setDevPreviewHint={setDevPreviewHint}
          />
        )}

        <div className="live-arena">
        {session && playerView && (
          <>
            <div
              className="table-status"
              style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden', pointerEvents: 'none' }}
              aria-hidden="true"
            >
              {tableStatusText}
            </div>
          </>
        )}

        {sessionFailure && matchNotFoundReason && (
          <LiveMatchNotFound
            reason={matchNotFoundReason}
            link={matchNotFoundLink}
            recent={matchNotFoundRecent}
            isStartDisabled={matchStartDisabled}
            isRetryDisabled={isPending}
            onStartFresh={startFreshFromMatchNotFound}
            onRejoinLocal={rejoinRecentLocalMatch}
            onPasteLink={loadPastedMatchLink}
            onRetry={retrySessionFailure}
          />
        )}

        {sessionFailure && !matchNotFoundReason && (
          <LiveSessionFailureNote
            failure={sessionFailure}
            hasSession={Boolean(session)}
            isStartDisabled={matchStartDisabled}
            onRetry={retrySessionFailure}
            onStartFresh={() => { requestStartNewGame() }}
            onDismiss={dismissSessionFailure}
            apiKeyValue={selectedApiKey}
            onApiKeyChange={setSelectedApiKey}
            onUseApiKey={() => { requestStartNewGame(newMatchDealerChoice, { confirm: false }) }}
          />
        )}

        {session && playerView && (
          <div
            className={boardClasses}
            data-match-complete-pending={pendingMatchCompleteState?.tone}
            data-match-complete-winner-side={pendingMatchCompleteState?.winnerSide}
          >
            <div className={strengthGuideShellClassName}>
              <div className="live-arena__strength-table">
                <FarolTable
                  heroScore={heroScore}
                  villainScore={villainScore}
                  dealerSide={dealerMarkSide}
                  dealerHandKey={dealerMarkHandKey}
                  elevenRingSide={scorepadElevenRingSide}
                  maoDeOnzeSide={maoDeOnzeSide}
                  elevenFocusMode={elevenFocusMode}
                  displayedStake={displayedStake}
                  stakeFx={stakeFx}
                  stakeFxCallout={stakeFxCallout}
                  stakeFxLiveBadge={stakeFxLiveBadge}
                  stakeCalloutStyle="wash"
                  deckSwitchAnimation="dissolve"
                  deckSystem={deckSystem}
                  stakeActionLabel={stakePegActionLabel}
                  stakeRefuseActionLabel={stakePegRefuseActionLabel}
                  heroIsResponder={heroIsResponder}
                  humanElevenDecisionPending={humanElevenDecisionPending}
                  humanPlayer={session.humanPlayer}
                  botPlayer={session.botPlayer}
                  betweenHandsGather={betweenHandsGather}
                  turnupCard={turnupCard}
                  turnupFaceDown={turnupFaceDown}
                  turnupRef={turnupRef}
                  displayedCompletedRounds={displayedCompletedRounds}
                  roundRefs={roundRefs}
                  displayedVillainTableCard={displayedVillainTableCard}
                  displayedHeroTableCard={displayedHeroTableCard}
                  shouldHideVillainTableCardForOverlay={shouldHideVillainTableCardForOverlay}
                  shouldHideHeroTableCardForOverlay={shouldHideHeroTableCardForOverlay}
                  currentOpponentCardRef={currentOpponentCardRef}
                  currentPlayerCardRef={currentPlayerCardRef}
                  stakeCurrentRef={stakeCurrentRef}
                  scoreRowRefs={scoreRowRefs}
                  scoreNumberRefs={scoreNumberRefs}
                  scoreCelebration={scoreCelebration}
                  onSettingsClick={toggleSettingsDrawer}
                  settingsOpen={settingsDrawerOpen}
                  settingsAlert={Boolean(matchStartBlocked || providerLoadIssue)}
                  studyButton={studyButton}
                  devControlsButton={showDevControls && compactViewportActive ? {
                    isOpen: devPanelOpen,
                    onClick: () => { setDevPanelOpen((open) => !open) },
                  } : null}
                  scorepadCanUsePaper={scorepadCanUsePaper}
                  scorepadRailVisible={scorepadRailVisible}
                  scorepadRolled={scorepadRolled}
                  onRollScorepad={() => { setScorepadRolled(true) }}
                  onUnrollScorepad={() => { setScorepadRolled(false) }}
                  isHeroDragActive={isHeroDragActive}
                  isHeroDragOverDropTarget={isHeroDragOverDropTarget}
                  heroPlayMotionActive={heroPlayMotionActive}
                  fastModeEnabled={fastModeEnabled}
                  lampSwingLeadMs={devLampSwingLeadMs}
                  introPhase={farolIntroPhase}
                  layoutMoveDurationS={layoutMoveDurationS}
                  onStakeAction={stakePegAction ? handleStakePegAction : null}
                  onStakeRefuse={stakePegRefuseAction ? handleStakePegRefuse : null}
                  onDeckSwitch={setPreferredDeckSystem}
                  onDeckClick={openStrengthGuide}
                  onHeroTableCardLayoutStart={handleHeroTableCardLayoutStart}
                  onHeroTableCardLayoutComplete={handleHeroTableCardLayoutComplete}
                  villainHandSlot={
                    <LiveVillainHand
                      visibleOpponentSlots={visibleOpponentSlots}
                      opponentSlotRefs={opponentSlotRefs}
                      deckSystem={deckSystem}
                    />
                  }
                  heroHandSlot={
                    <LiveHeroHand
                      visibleHeroCards={visibleHeroCards}
                      heroDealSlotsFaceDown={heroDealSlotsFaceDown}
                      heroCardAffordances={heroCardAffordances}
                      heroCardHiddenForPlayMotionId={heroPlayOverlay?.cardId ?? null}
                      deckSystem={deckSystem}
                      heroHandReorderTargetIndex={heroHandReorderTargetIndex}
                      heroHandReorderSourceIndex={heroHandReorderSourceIndex}
                      heroHandReorderPreviewOffsets={heroHandReorderPreviewOffsets}
                      canReorderHeroCards={canReorderHeroCards}
                      compactViewportActive={compactViewportActive}
                      hideCardPlaysImmediately={gamePreferences.hideCardPlaysImmediately}
                      layoutMoveDurationS={layoutMoveDurationS}
                      manilhaRank={heroManilhaRank}
                      playerSlotRefs={playerSlotRefs}
                      submitHeroCardAction={submitHeroCardAction}
                      handleHideCardChoice={handleHideCardChoice}
                      playStagedHideSound={playStagedHideSound}
                      triggerHeroPlayMotion={triggerHeroPlayMotion}
                      handleHeroCardDrag={handleHeroCardDrag}
                      handleHeroCardDragEnd={handleHeroCardDragEnd}
                      isPointInsideHeroSlot={isPointInsideHeroSlot}
                      onHeroDragPointerDown={(cardId, index, options) => {
                        activeHeroDragRef.current = { cardId, index, ...options }
                        isHeroDragActiveRef.current = false
                        heroDragOverDropTargetRef.current = false
                        lastHeroDragPointRef.current = null
                        setIsHeroDragOverDropTarget(false)
                        setHeroHandReorderSourceIndex(null)
                        setHeroHandReorderTarget(null)
                      }}
                      onHeroDragStart={(cardId, index, options) => {
                        activeHeroDragRef.current = { cardId, index, ...options }
                        isHeroDragActiveRef.current = options.canDropOnTable
                        setIsHeroDragActive(options.canDropOnTable)
                        setHeroHandReorderSourceIndex(index)
                        heroDragOverDropTargetRef.current = false
                        lastHeroDragPointRef.current = null
                        setIsHeroDragOverDropTarget(false)
                        setHeroHandReorderTarget(null)
                      }}
                    />
                  }
                  decisionRailSlot={
                    <FarolActionRail
                      heroIsResponder={heroIsResponder}
                      humanElevenDecisionPending={humanElevenDecisionPending}
                      displayedStake={displayedStake}
                      raiseDisabled={raiseDisabled}
                      normalTurnFoldDisabled={normalTurnFoldDisabled}
                      concedeHandAction={grouped?.concedeHand}
                      isPending={isPending}
                      isAutoStartingHand={isAutoStartingHand}
                      isDealingCards={isDealingCards}
                      onAct={(action) => { void act(action) }}
                      onRaiseOrReraise={handleRaiseOrReraise}
                      stakeFx={stakeFx}
                      decisionSummary={decisionSummary}
                      decisionFxLabel={decisionFxLabel}
                      settingsButton={!scorepadRailVisible ? {
                        isOpen: settingsDrawerOpen,
                        hasAlert: Boolean(matchStartBlocked || providerLoadIssue),
                        onClick: toggleSettingsDrawer,
                      } : null}
                      studyButton={!scorepadRailVisible ? studyButton : null}
                      hint={actionRailHint}
                    />
                  }
                />
              </div>
              <StrengthGuidePanel
                open={strengthGuideOpen && strengthGuideAvailable}
                turnup={strengthGuidePanelTurnup}
                deckSystem={deckSystem}
                pulse={strengthGuidePulse}
                peekPortalRef={turnupRef}
                peekDisabled={!strengthGuideAvailable}
                onOpen={openStrengthGuide}
                onClose={closeStrengthGuide}
              />
            </div>

          </div>
        )}
        </div>

        {settingsDrawerOpen && (
          <LiveSettingsDrawer
            closeUtilitySurface={closeUtilitySurface}
            openSettingsDrawer={openSettingsDrawer}
            requestStartNewGame={requestStartNewGame}
            newMatchDealerChoice={newMatchDealerChoice}
            showBotProviderStatus={showBotProviderStatus}
            matchStartBlocked={matchStartBlocked}
            providerLoadIssue={providerLoadIssue}
            providerStatusCopy={providerStatusCopy}
            expandedSettingsSection={expandedSettingsSection}
            toggleSettingsSection={toggleSettingsSection}
            fastModeEnabled={fastModeEnabled}
            gamePreferences={gamePreferences}
            updateGamePreferences={updateGamePreferences}
            compactViewportActive={compactViewportActive}
            soundSettings={soundSettings}
            updateSoundSettings={updateSoundSettings}
            beginSoundSliderGesture={beginSoundSliderGesture}
            endSoundSliderGesture={endSoundSliderGesture}
            soundSliderStartVolumeRef={soundSliderStartVolumeRef}
            primeSound={primeSound}
            selectedBotKind={selectedBotKind}
            selectedBotProfile={selectedBotProfile}
            selectedBotModel={selectedBotModel}
            llmProviders={llmProviders}
            solverAvailable={solverAvailable}
            isLoadingProviders={isLoadingProviders}
            selectedProvider={selectedProvider}
            onBotKindChange={handleBotKindChange}
            onBotProfileChange={setSelectedBotProfile}
            onBotModelChange={setSelectedBotModel}
            apiKeyValue={selectedApiKey}
            onApiKeyChange={setSelectedApiKey}
            overlayMenuOpen={overlayMenuOpen}
            setOverlayMenuOpen={setOverlayMenuOpen}
            setOverlayMenuRef={setOverlayMenuRef}
            refreshProviderCatalogs={refreshProviderCatalogs}
            isPending={isPending}
            isAutoStartingHand={isAutoStartingHand}
            switchBackToHeuristic={switchBackToHeuristic}
            shortcutCaptureAction={shortcutCaptureAction}
            setShortcutCaptureAction={setShortcutCaptureAction}
            gameplayHints={gameplayHints}
            updateGameplayHints={updateGameplayHints}
            studySpotText={studySpotText}
          />
        )}

        {isDealingCards && dealAnim && (
          <motion.div
            key={`deal-${dealAnim.step}`}
            className={motionCardBackClassName}
            data-testid="deal-overlay-card"
            initial={{
              top: dealAnim.from.y,
              left: dealAnim.from.x,
              width: dealAnim.width,
              height: dealAnim.height,
              borderRadius: dealAnim.borderRadius,
              rotate: dealAnim.rotateFrom,
              zIndex: 1000,
            }}
            animate={{
              top: dealAnim.to.y,
              left: dealAnim.to.x,
              rotate: dealAnim.rotateTo,
            }}
            transition={{
              duration: dealAnimDurationS,
              ease: [0.2, 0.8, 0.2, 1],
            }}
            style={{
              position: 'fixed',
              pointerEvents: 'none',
              transformOrigin: 'center center',
              x: '-50%',
              y: '-50%',
            }}
          >
            <MotionCardBackGraphic deckSystem={deckSystem} />
          </motion.div>
        )}

        {heroPlayOverlay && (
          <motion.div
            key={`hero-play-${heroPlayOverlay.cardId}-${heroPlayOverlay.from.x}-${heroPlayOverlay.from.y}`}
            className={motionCardBackClassName}
            data-testid="hero-play-overlay"
            initial={{
              top: heroPlayOverlay.from.y,
              left: heroPlayOverlay.from.x,
              width: heroPlayOverlay.width,
              height: heroPlayOverlay.height,
              borderRadius: heroPlayOverlay.borderRadius,
              rotate: heroPlayOverlay.rotateFrom,
              zIndex: 1000,
            }}
            animate={{
              top: heroPlayOverlay.to.y,
              left: heroPlayOverlay.to.x,
              width: heroPlayOverlay.toWidth ?? heroPlayOverlay.width,
              height: heroPlayOverlay.toHeight ?? heroPlayOverlay.height,
              borderRadius: heroPlayOverlay.toBorderRadius ?? heroPlayOverlay.borderRadius,
              rotate: heroPlayOverlay.rotateTo,
            }}
            transition={{
              duration: heroPlayMotionSettleMs / 1000,
              ease: [0.2, 0.8, 0.2, 1],
            }}
            style={{
              position: 'fixed',
              pointerEvents: 'none',
              transformOrigin: 'center center',
              x: '-50%',
              y: '-50%',
            }}
          >
            <MotionCardBackGraphic deckSystem={deckSystem} />
          </motion.div>
        )}

        {opponentPlayOverlay && (
          <motion.div
            key={`opponent-play-${opponentPlayOverlay.cardId}-${opponentPlayOverlay.from.x}-${opponentPlayOverlay.from.y}`}
            className={motionCardBackClassName}
            data-testid="opponent-play-overlay"
            initial={{
              top: opponentPlayOverlay.from.y,
              left: opponentPlayOverlay.from.x,
              width: opponentPlayOverlay.width,
              height: opponentPlayOverlay.height,
              borderRadius: opponentPlayOverlay.borderRadius,
              rotate: opponentPlayOverlay.rotateFrom,
              zIndex: 1000,
            }}
            animate={{
              top: opponentPlayOverlay.to.y,
              left: opponentPlayOverlay.to.x,
              width: opponentPlayOverlay.toWidth ?? opponentPlayOverlay.width,
              height: opponentPlayOverlay.toHeight ?? opponentPlayOverlay.height,
              borderRadius: opponentPlayOverlay.toBorderRadius ?? opponentPlayOverlay.borderRadius,
              rotate: opponentPlayOverlay.rotateTo,
            }}
            transition={{
              duration: opponentPlayOverlayMs / 1000,
              ease: [0.2, 0.8, 0.2, 1],
            }}
            style={{
              position: 'fixed',
              pointerEvents: 'none',
              transformOrigin: 'center center',
              x: '-50%',
              y: '-50%',
            }}
          >
            <MotionCardBackGraphic deckSystem={deckSystem} />
          </motion.div>
        )}

        {showLauncherOverlay && (
          <LiveLauncherOverlay
            showStudyLabLink={STUDY_LAB_LINKS_ENABLED}
            selectedBotKind={selectedBotKind}
            selectedBotProfile={selectedBotProfile}
            selectedBotModel={selectedBotModel}
            llmProviders={llmProviders}
            solverAvailable={solverAvailable}
            isLoadingProviders={isLoadingProviders}
            selectedProvider={selectedProvider}
            showBotProviderStatus={showBotProviderStatus}
            providerStatusCopy={providerStatusCopy}
            matchStartBlocked={matchStartBlocked}
            providerLoadIssue={providerLoadIssue}
            handleBotKindChange={handleBotKindChange}
            setSelectedBotProfile={setSelectedBotProfile}
            setSelectedBotModel={setSelectedBotModel}
            dealerChoice={pendingNewMatchRequest?.dealerChoice ?? newMatchDealerChoice}
            selectNewMatchDealerChoice={selectNewMatchDealerChoice}
            overlayMenuOpen={overlayMenuOpen}
            setOverlayMenuOpen={setOverlayMenuOpen}
            setOverlayMenuRef={setOverlayMenuRef}
            matchStartDisabled={matchStartDisabled}
            startLauncherMatch={startLauncherMatch}
          />
        )}

        {shouldShowFirstRunDeckPicker && (
          <FirstRunDeckPicker
            onPick={handleFirstRunDeckPick}
            onSkip={handleFirstRunDeckSkip}
          />
        )}

        {displayedMatchCompleteWinner != null && (
          <LiveMatchCompleteOverlay
            showStudyLabLink={STUDY_LAB_LINKS_ENABLED}
            studySpotHref={studyButton?.href ?? null}
            visibleMatchWinner={displayedMatchCompleteWinner}
            humanPlayer={session?.humanPlayer ?? 0}
            heroScore={matchCompleteOverlayHeroScore}
            villainScore={matchCompleteOverlayVillainScore}
            handHistory={matchHandHistory}
            matchEndActionsDisabled={isDevMatchCompleteScreen ? false : matchEndActionsDisabled}
            matchStartBlocked={isDevMatchCompleteScreen ? false : matchStartBlocked}
            requestStartNewGame={isDevMatchCompleteScreen
              ? dismissDevMatchCompleteScreen
              : requestStartNewGame}
            requestChangeOpponent={isDevMatchCompleteScreen
              ? dismissDevMatchCompleteScreen
              : requestChangeOpponentFromMatchResult}
            dismissMatchCompleteOverlay={isDevMatchCompleteScreen
              ? dismissDevMatchCompleteScreen
              : dismissMatchCompleteOverlay}
          />
        )}
      </div>

      {pendingNewMatchRequest && (
        <LiveNewMatchConfirmDialog
          selectedBotKind={selectedBotKind}
          selectedBotProfile={selectedBotProfile}
          selectedBotModel={selectedBotModel}
          llmProviders={llmProviders}
          solverAvailable={solverAvailable}
          isLoadingProviders={isLoadingProviders}
          selectedProvider={selectedProvider}
          showBotProviderStatus={showBotProviderStatus}
          providerStatusCopy={providerStatusCopy}
          matchStartBlocked={matchStartBlocked}
          providerLoadIssue={providerLoadIssue}
          handleBotKindChange={handleBotKindChange}
          setSelectedBotProfile={setSelectedBotProfile}
          setSelectedBotModel={setSelectedBotModel}
          dealerChoice={pendingNewMatchRequest?.dealerChoice ?? newMatchDealerChoice}
          selectNewMatchDealerChoice={selectNewMatchDealerChoice}
          overlayMenuOpen={overlayMenuOpen}
          setOverlayMenuOpen={setOverlayMenuOpen}
          setOverlayMenuRef={setOverlayMenuRef}
          pendingNewMatchSubtitle={pendingNewMatchSubtitle}
          pendingNewMatchTitle={pendingNewMatchTitle}
          pendingNewMatchCopy={pendingNewMatchCopy}
          pendingNewMatchCancelLabel={pendingNewMatchCancelLabel}
          pendingNewMatchConfirmLabel={pendingNewMatchConfirmLabel}
          liveMatchStatus={pendingNewMatchLiveStatus}
          matchStartDisabled={matchStartDisabled}
          cancelPendingNewMatch={cancelPendingNewMatch}
          confirmPendingNewMatch={confirmPendingNewMatch}
        />
      )}

    </LayoutGroup>
  )
}
