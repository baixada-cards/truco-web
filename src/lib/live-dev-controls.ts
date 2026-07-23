import type { SessionPayload } from './session-api'

type LiveDevEnv = {
  NEXT_PUBLIC_SHOW_DEV_CONTROLS?: string
  NODE_ENV?: string
}

type LiveDevNextHandInput = {
  session: SessionPayload | null
  isPending: boolean
  isAutoStartingHand: boolean
  isDealingCards: boolean
  isHandEndSequenceRunning: boolean
}

export type LiveDevDebugSnapshot = {
  matchId: string
  score: string
  handState: string
  turn: string
  dealer: string
  stake: string
  pending: string
  legalActions: string
  bot: string
  notice: string
}

export type LiveDevScoreEditState = {
  heroLocked: boolean
  villainLocked: boolean
  canApply: boolean
}

type LiveDevProposedScore = {
  hero: number
  villain: number
}

function seatSubject(player: 0 | 1 | null, humanPlayer: 0 | 1) {
  if (player == null) return 'None'
  return player === humanPlayer ? 'You' : 'They'
}

function turnLabel(player: 0 | 1 | null, humanPlayer: 0 | 1) {
  if (player == null) return 'No one to act'
  return player === humanPlayer ? 'Your turn' : 'Their turn'
}

function clampEditableScore(value: number) {
  return Number.isFinite(value)
    ? Math.max(0, Math.min(10, Math.trunc(value)))
    : 0
}

function heroVillainScoreKeys(session: SessionPayload) {
  return session.humanPlayer === 0
    ? { hero: '0' as const, villain: '1' as const }
    : { hero: '1' as const, villain: '0' as const }
}

export function areLiveDevControlsEnabled(env?: LiveDevEnv) {
  const resolvedEnv = env ?? {
    NEXT_PUBLIC_SHOW_DEV_CONTROLS: process.env.NEXT_PUBLIC_SHOW_DEV_CONTROLS,
    NODE_ENV: process.env.NODE_ENV,
  }

  if (resolvedEnv.NODE_ENV === 'production') return false

  const override = resolvedEnv.NEXT_PUBLIC_SHOW_DEV_CONTROLS

  if (override != null && override !== '') {
    return override === 'true'
  }

  return resolvedEnv.NODE_ENV !== 'production'
}

export function canStartNextHandFromDevControls(input: LiveDevNextHandInput) {
  const { session, isPending, isAutoStartingHand, isDealingCards, isHandEndSequenceRunning } = input

  if (!session) return false
  if (isPending || isAutoStartingHand || isDealingCards || isHandEndSequenceRunning) return false
  if (session.publicView.winner != null) return false

  return !session.publicView.hand_in_progress
}

export function deriveLiveDevScoreEditState(session: SessionPayload | null): LiveDevScoreEditState {
  if (!session) {
    return {
      heroLocked: false,
      villainLocked: false,
      canApply: false,
    }
  }

  const scoreKeys = heroVillainScoreKeys(session)
  const heroLocked = session.state.score[scoreKeys.hero] === 11
  const villainLocked = session.state.score[scoreKeys.villain] === 11

  return {
    heroLocked,
    villainLocked,
    canApply: !(heroLocked && villainLocked),
  }
}

export function resolveLiveDevEditedScore(
  session: SessionPayload | null,
  proposedScore: LiveDevProposedScore,
): LiveDevProposedScore | null {
  if (!session) return null

  const scoreKeys = heroVillainScoreKeys(session)
  const scoreEditState = deriveLiveDevScoreEditState(session)

  return {
    hero: scoreEditState.heroLocked
      ? session.state.score[scoreKeys.hero]
      : clampEditableScore(proposedScore.hero),
    villain: scoreEditState.villainLocked
      ? session.state.score[scoreKeys.villain]
      : clampEditableScore(proposedScore.villain),
  }
}

export function buildLiveDevDebugSnapshot(
  session: SessionPayload | null,
): LiveDevDebugSnapshot | null {
  if (!session) return null

  const handState = session.state.current_hand?.state ?? null
  const publicHand = session.publicView.hand
  const pendingRaise = publicHand?.pending_raise ?? null
  const pendingDecision = publicHand?.pending_decision ?? null
  const score = session.publicView.score
  const scoreKeys = heroVillainScoreKeys(session)
  const botSummary = [session.botKind ?? 'unknown', session.botProfile, session.botModel]
    .filter(Boolean)
    .join(' / ')

  return {
    matchId: session.matchId,
    score: `You ${score[scoreKeys.hero]} · Them ${score[scoreKeys.villain]}`,
    handState:
      session.publicView.winner != null
        ? 'Match complete'
        : session.publicView.hand_in_progress
          ? `Hand live · ${publicHand?.completed_rounds.length ?? 0} completed rounds`
          : 'Between hands',
    turn:
      session.publicView.winner != null
        ? `${seatSubject(session.publicView.winner, session.humanPlayer)} won the match`
        : session.publicView.hand_in_progress
          ? turnLabel(session.publicView.current_player, session.humanPlayer)
          : 'Waiting to deal the next hand',
    dealer: handState
      ? `${seatSubject(handState.dealer, session.humanPlayer)} deal this hand`
      : `${seatSubject(session.publicView.next_dealer, session.humanPlayer)} deal next`,
    stake: pendingRaise
      ? `${publicHand?.hand_value ?? 1} → ${pendingRaise.to}`
      : String(publicHand?.hand_value ?? 1),
    pending: pendingRaise
      ? `${seatSubject(pendingRaise.raised_by, session.humanPlayer)} raised to ${pendingRaise.to}`
      : pendingDecision
        ? pendingDecision.player === session.humanPlayer
          ? 'Your eleven-hand decision'
          : 'Their eleven-hand decision'
        : 'None',
    legalActions:
      session.legalActions.length > 0
        ? session.legalActions.map((action) => action.type).join(', ')
        : 'None',
    bot: botSummary || 'Unknown bot',
    notice: session.notice ?? 'None',
  }
}
