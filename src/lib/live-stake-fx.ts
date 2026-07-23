import type { SessionAction, SessionPayload } from './session-api'

type Seat = 0 | 1

export type SessionSnapshotSource = 'action' | 'create' | 'load' | 'next-hand'
export type StakeFxAction = 'raise' | 'accept' | 'decline' | 'reraise'
export type StakeFxActor = 'hero' | 'villain'

export type StakeFxDescriptor = {
  actor: StakeFxActor
  action: StakeFxAction
  stake: number
  fromStake: number
}
export type StakeFxSoundCue = 'raise' | 'accept' | 'decline'
export type StakeFxSoundCueDescriptor = {
  cue: StakeFxSoundCue
  stake: number
}

/**
 * An active stake effect instance, combining descriptor fields with a
 * monotonically-increasing runId used as a React animation key.
 */
export type StakeFx = StakeFxDescriptor & { runId: number }

type HandState = NonNullable<SessionPayload['state']['current_hand']>['state']

function stakeFxActorForSeat(seat: Seat, humanPlayer: Seat): StakeFxActor {
  return seat === humanPlayer ? 'hero' : 'villain'
}

function actorSubject(actor: StakeFxActor) {
  return actor === 'hero' ? 'You' : 'They'
}

function lastRaisedByForState(handState: HandState | null): Seat | null {
  return (handState?.last_raised_by ?? null) as Seat | null
}

function isReraiseTransition(
  previousPendingRaise: HandState['pending_raise'],
  nextPendingRaise: NonNullable<HandState['pending_raise']>,
  previousHandValue: number,
  previousLastRaisedBy: Seat | null,
  nextLastRaisedBy: Seat | null,
) {
  if (previousPendingRaise) return true
  if (nextPendingRaise.previous_value > previousHandValue) return true
  return nextLastRaisedBy != null
    ? nextLastRaisedBy !== nextPendingRaise.raised_by
    : previousLastRaisedBy != null && previousLastRaisedBy !== nextPendingRaise.raised_by
}

function deriveOpeningStakeFxFromSnapshot(
  nextHandState: HandState,
  humanPlayer: Seat,
): StakeFxDescriptor | null {
  const nextPendingRaise = nextHandState.pending_raise ?? null
  if (!nextPendingRaise) return null
  if (nextHandState.completed_rounds.length > 0 || nextHandState.current_round.plays.length > 0) {
    return null
  }

  return {
    actor: stakeFxActorForSeat(nextPendingRaise.raised_by as Seat, humanPlayer),
    action: nextPendingRaise.previous_value > 1 ? 'reraise' : 'raise',
    stake: nextPendingRaise.to,
    fromStake: nextPendingRaise.previous_value,
  }
}

export function describeStakeFxLabel(stakeFx: Pick<StakeFxDescriptor, 'actor' | 'action'>) {
  const actor = actorSubject(stakeFx.actor)

  switch (stakeFx.action) {
    case 'raise':
      return `${actor} raise`
    case 'reraise':
      return `${actor} re-raise`
    case 'accept':
      return `${actor} accept`
    case 'decline':
      return `${actor} decline`
  }
}

export function describeStakeFxCallout(stakeFx: Pick<StakeFxDescriptor, 'actor' | 'action' | 'stake'>) {
  const actor = actorSubject(stakeFx.actor)

  switch (stakeFx.action) {
    case 'raise':
      return `${actor} raise to +${stakeFx.stake}`
    case 'reraise':
      return `${actor} re-raise to +${stakeFx.stake}`
    case 'accept':
      return `${actor} accept`
    case 'decline':
      return `${actor} decline`
  }
}

export function describeStakeFxLiveBadge(stakeFx: Pick<StakeFxDescriptor, 'action' | 'stake'>) {
  if (stakeFx.action !== 'accept') return null
  return `+${stakeFx.stake} is live`
}

export function soundCueForStakeFx(stakeFx: Pick<StakeFxDescriptor, 'action'>): StakeFxSoundCue {
  if (stakeFx.action === 'accept') return 'accept'
  if (stakeFx.action === 'decline') return 'decline'
  return 'raise'
}

export function soundCueForDelayedOpeningStakeFx(
  shouldDelayOpeningStakeFxUntilAfterDeal: boolean,
  stakeFx: Pick<StakeFxDescriptor, 'action' | 'stake'> | null,
): StakeFxSoundCueDescriptor | null {
  if (!shouldDelayOpeningStakeFxUntilAfterDeal || !stakeFx) return null
  return {
    cue: soundCueForStakeFx(stakeFx),
    stake: stakeFx.stake,
  }
}

export function deriveStakeFxFromSessionDiff(
  previousSession: SessionPayload | null,
  nextSession: SessionPayload,
  source: SessionSnapshotSource,
): StakeFxDescriptor | null {
  if (source === 'load') return null

  const previousHandState = previousSession
    ? previousSession.state.current_hand?.state ?? null
    : null
  const nextHandState = nextSession.state.current_hand?.state ?? null
  if (!nextHandState) return null
  if (!previousSession || !previousHandState) {
    return deriveOpeningStakeFxFromSnapshot(nextHandState, nextSession.humanPlayer)
  }

  const previousPendingRaise = previousHandState.pending_raise ?? null
  const nextPendingRaise = nextHandState.pending_raise ?? null
  const previousPendingDecision = previousHandState.pending_decision ?? null
  const nextPendingDecision = nextHandState.pending_decision ?? null
  const previousHandValue = previousHandState.hand_value ?? 1
  const nextHandValue = nextHandState.hand_value
  const previousLastRaisedBy = lastRaisedByForState(previousHandState)
  const nextLastRaisedBy = lastRaisedByForState(nextHandState)

  if (
    nextPendingRaise && (
      !previousPendingRaise ||
      previousPendingRaise.to !== nextPendingRaise.to ||
      previousPendingRaise.raised_by !== nextPendingRaise.raised_by
    )
  ) {
    return {
      actor: stakeFxActorForSeat(nextPendingRaise.raised_by as Seat, nextSession.humanPlayer),
      action: isReraiseTransition(
        previousPendingRaise,
        nextPendingRaise,
        previousHandValue,
        previousLastRaisedBy,
        nextLastRaisedBy,
      )
        ? 'reraise'
        : 'raise',
      stake: nextPendingRaise.to,
      fromStake: nextPendingRaise.previous_value,
    }
  }

  if (previousPendingRaise && !nextPendingRaise) {
    // The raise that resolved is not always `previousPendingRaise`: when the hero
    // re-raises, the action response collapses the re-raise and the bot's reply
    // into one snapshot. `last_raised_by` names whoever made the final raise, so
    // the responder is the other seat.
    const resolvedRaiser = (nextLastRaisedBy ?? previousPendingRaise.raised_by) as Seat
    const wasCollapsedReraise = resolvedRaiser !== previousPendingRaise.raised_by
    const resolvedTo = wasCollapsedReraise
      ? Math.min(12, previousPendingRaise.to + 3)
      : previousPendingRaise.to
    const resolvedFrom = wasCollapsedReraise
      ? previousPendingRaise.to
      : previousPendingRaise.previous_value
    const responderSeat = (resolvedRaiser === 0 ? 1 : 0) as Seat
    const accepted = nextHandValue > previousHandValue || nextHandValue >= resolvedTo
    return {
      actor: stakeFxActorForSeat(responderSeat, nextSession.humanPlayer),
      action: accepted ? 'accept' : 'decline',
      stake: accepted ? Math.max(nextHandValue, resolvedTo) : resolvedTo,
      fromStake: resolvedFrom,
    }
  }

  if (!previousPendingRaise && !nextPendingRaise && nextHandValue > previousHandValue && nextLastRaisedBy != null) {
    const responderSeat = (nextLastRaisedBy === 0 ? 1 : 0) as Seat

    return {
      actor: stakeFxActorForSeat(responderSeat, nextSession.humanPlayer),
      action: 'accept',
      stake: nextHandValue,
      fromStake: previousHandValue,
    }
  }

  if (previousPendingDecision && !nextPendingDecision) {
    const accepted = nextHandValue > previousHandValue
    const maoStake = Math.max(3, nextHandValue)
    return {
      actor: stakeFxActorForSeat(previousPendingDecision.player as Seat, nextSession.humanPlayer),
      action: accepted ? 'accept' : 'decline',
      stake: maoStake,
      fromStake: previousHandValue,
    }
  }

  return null
}

export function shouldDelayStakeFxUntilAfterRoundPreview(
  previousSession: SessionPayload | null,
  nextSession: SessionPayload,
  nextStakeFx: StakeFxDescriptor | null,
) {
  if (!previousSession || !nextStakeFx) return false
  if (nextStakeFx.actor !== 'villain') return false
  if (nextStakeFx.action !== 'raise' && nextStakeFx.action !== 'reraise') return false

  const previousRounds = previousSession.state.current_hand?.state.completed_rounds.length ?? 0
  const nextRounds = nextSession.state.current_hand?.state.completed_rounds.length ?? 0

  return nextRounds > previousRounds
}

export function shouldDelayStakeFxUntilAfterNewHandDeal(
  shouldDealNewHand: boolean,
  nextSession: SessionPayload,
  nextStakeFx: StakeFxDescriptor | null,
) {
  if (!shouldDealNewHand || !nextStakeFx) return false
  if (nextStakeFx.actor !== 'villain') return false
  if (nextStakeFx.action !== 'raise' && nextStakeFx.action !== 'reraise') return false

  const nextHandState = nextSession.state.current_hand?.state ?? null
  if (!nextHandState) return false

  return nextHandState.completed_rounds.length === 0 &&
    nextHandState.current_round.plays.length === 0
}

export function deriveOptimisticStakeFx(
  session: SessionPayload | null,
  action: SessionAction,
): StakeFxDescriptor | null {
  const publicHandState = session?.playerView.hand?.public_state ?? null
  if (!session || !publicHandState || !session.publicView.hand_in_progress) return null

  switch (action.type) {
    case 'raise':
      return {
        actor: 'hero',
        action: publicHandState.pending_raise ? 'reraise' : 'raise',
        stake: action.to,
        fromStake: publicHandState.pending_raise?.to ?? publicHandState.hand_value,
      }
    case 'accept_raise': {
      const pendingRaise = publicHandState.pending_raise
      if (!pendingRaise) return null
      return {
        actor: 'hero',
        action: 'accept',
        stake: Math.max(publicHandState.hand_value, pendingRaise.to),
        fromStake: pendingRaise.previous_value,
      }
    }
    case 'fold': {
      if (publicHandState.pending_raise) {
        return {
          actor: 'hero',
          action: 'decline',
          stake: publicHandState.pending_raise.to,
          fromStake: publicHandState.pending_raise.previous_value,
        }
      }

      if (publicHandState.pending_decision) {
        return {
          actor: 'hero',
          action: 'decline',
          stake: Math.max(3, publicHandState.hand_value),
          fromStake: publicHandState.hand_value,
        }
      }

      return null
    }
    case 'accept_eleven':
      if (!publicHandState.pending_decision) return null
      return {
        actor: 'hero',
        action: 'accept',
        stake: Math.max(3, publicHandState.hand_value),
        fromStake: publicHandState.hand_value,
      }
    case 'concede_hand':
      return null
    case 'fold_eleven':
      if (!publicHandState.pending_decision) return null
      return {
        actor: 'hero',
        action: 'decline',
        stake: Math.max(3, publicHandState.hand_value),
        fromStake: publicHandState.hand_value,
      }
    default:
      return null
  }
}

export function isSameStakeFx(
  current: Pick<StakeFxDescriptor, 'actor' | 'action' | 'stake' | 'fromStake'> | null,
  next: StakeFxDescriptor | null,
) {
  return Boolean(
    current &&
    next &&
    current.actor === next.actor &&
    current.action === next.action &&
    current.stake === next.stake &&
    current.fromStake === next.fromStake,
  )
}
