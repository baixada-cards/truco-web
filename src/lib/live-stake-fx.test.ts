import assert from 'node:assert/strict'
import test from 'node:test'

import type { SessionPayload } from './session-api'
import {
  deriveOptimisticStakeFx,
  deriveStakeFxFromSessionDiff,
  describeStakeFxCallout,
  describeStakeFxLabel,
  describeStakeFxLiveBadge,
  isSameStakeFx,
  shouldDelayStakeFxUntilAfterNewHandDeal,
  shouldDelayStakeFxUntilAfterRoundPreview,
  soundCueForDelayedOpeningStakeFx,
  soundCueForStakeFx,
} from './live-stake-fx.ts'

function buildSession(options: {
  humanPlayer?: 0 | 1
  handValue?: number
  pendingRaise?: { raised_by: 0 | 1; to: number; previous_value: number } | null
  pendingDecision?: { type: 'mao_de_onze'; player: 0 | 1 } | null
  lastRaisedBy?: 0 | 1 | null
  completedRounds?: Array<{
    leader: 0 | 1
    winner: 0 | 1 | null
  }>
} = {}): SessionPayload {
  const humanPlayer = options.humanPlayer ?? 0
  const botPlayer = humanPlayer === 0 ? 1 : 0
  const handValue = options.handValue ?? 1
  const pendingRaise = options.pendingRaise ?? null
  const pendingDecision = options.pendingDecision ?? null
  const lastRaisedBy = options.lastRaisedBy ?? null
  const completedRounds = options.completedRounds ?? []
  const publicHandState = {
    next_player: humanPlayer,
    hand_value: handValue,
    hand_winner: null,
    match_winner: null,
    score: { '0': 0, '1': 0 },
    completed_rounds: completedRounds,
    current_round: {
      leader: 0 as const,
      plays: [],
    },
    pending_raise: pendingRaise,
    pending_decision: pendingDecision,
  }

  return {
    matchId: 'match-1',
    humanPlayer,
    botPlayer,
    botKind: null,
    botProfile: null,
    botModel: null,
    state: {
      next_dealer: 0,
      score: { '0': 0, '1': 0 },
      winner: null,
      current_hand: {
        state: {
          dealer: 0,
          next_player: humanPlayer,
          score: { '0': 0, '1': 0 },
          hand_value: handValue,
          turnup: { rank: 'A', suit: 'SPADES' },
          completed_rounds: completedRounds.map((round) => ({
            ...round,
            plays: [],
          })),
          current_round: {
            leader: 0,
            plays: [],
          },
          last_raised_by: lastRaisedBy,
          pending_raise: pendingRaise,
          pending_decision: pendingDecision,
        },
        hand_winner: null,
        match_winner: null,
      },
    },
    publicView: {
      score: { '0': 0, '1': 0 },
      winner: null,
      next_dealer: 0,
      current_player: humanPlayer,
      hand_in_progress: true,
      hand: publicHandState,
    },
    playerView: {
      player: humanPlayer,
      score: { '0': 0, '1': 0 },
      winner: null,
      next_dealer: 0,
      current_player: humanPlayer,
      hand_in_progress: true,
      hand: {
        public_state: publicHandState,
        hand: [],
      },
    },
    legalActions: [],
  }
}

test('derives villain raise transitions', () => {
  const previousSession = buildSession()
  const nextSession = buildSession({
    pendingRaise: { raised_by: 1, to: 3, previous_value: 1 },
  })

  assert.deepEqual(deriveStakeFxFromSessionDiff(previousSession, nextSession, 'action'), {
    actor: 'villain',
    action: 'raise',
    stake: 3,
    fromStake: 1,
  })
})

test('derives opening villain raise from the first fresh-hand snapshot', () => {
  const nextSession = buildSession({
    pendingRaise: { raised_by: 1, to: 3, previous_value: 1 },
  })

  assert.deepEqual(deriveStakeFxFromSessionDiff(null, nextSession, 'create'), {
    actor: 'villain',
    action: 'raise',
    stake: 3,
    fromStake: 1,
  })
})

test('does not replay opening stake fx from a loaded snapshot', () => {
  const nextSession = buildSession({
    pendingRaise: { raised_by: 1, to: 3, previous_value: 1 },
  })

  assert.equal(deriveStakeFxFromSessionDiff(null, nextSession, 'load'), null)
})

test('derives hero re-raise transitions', () => {
  const previousSession = buildSession({
    pendingRaise: { raised_by: 1, to: 3, previous_value: 1 },
  })
  const nextSession = buildSession({
    pendingRaise: { raised_by: 0, to: 6, previous_value: 3 },
  })

  assert.deepEqual(deriveStakeFxFromSessionDiff(previousSession, nextSession, 'action'), {
    actor: 'hero',
    action: 'reraise',
    stake: 6,
    fromStake: 3,
  })
})

test('derives routed villain re-raise transitions without an intermediate raise snapshot', () => {
  const previousSession = buildSession({ handValue: 1 })
  const nextSession = buildSession({
    handValue: 1,
    lastRaisedBy: 0,
    pendingRaise: { raised_by: 1, to: 6, previous_value: 3 },
  })

  assert.deepEqual(deriveStakeFxFromSessionDiff(previousSession, nextSession, 'action'), {
    actor: 'villain',
    action: 'reraise',
    stake: 6,
    fromStake: 3,
  })
})

test('derives accepted raises', () => {
  const previousSession = buildSession({
    handValue: 1,
    pendingRaise: { raised_by: 1, to: 3, previous_value: 1 },
  })
  const nextSession = buildSession({ handValue: 3 })

  assert.deepEqual(deriveStakeFxFromSessionDiff(previousSession, nextSession, 'action'), {
    actor: 'hero',
    action: 'accept',
    stake: 3,
    fromStake: 1,
  })
})

test('derives routed villain accept transitions from raise memory', () => {
  const previousSession = buildSession({ handValue: 1 })
  const nextSession = buildSession({ handValue: 3, lastRaisedBy: 0 })

  assert.deepEqual(deriveStakeFxFromSessionDiff(previousSession, nextSession, 'action'), {
    actor: 'villain',
    action: 'accept',
    stake: 3,
    fromStake: 1,
  })
})

test('derives declined raises', () => {
  const previousSession = buildSession({
    handValue: 1,
    pendingRaise: { raised_by: 1, to: 3, previous_value: 1 },
  })
  const nextSession = buildSession({ handValue: 1 })

  assert.deepEqual(deriveStakeFxFromSessionDiff(previousSession, nextSession, 'action'), {
    actor: 'hero',
    action: 'decline',
    stake: 3,
    fromStake: 1,
  })
})

test('attributes a collapsed hero re-raise acceptance to the villain', () => {
  // Hero re-raises villain's truco; the bot accepts inside the same action
  // response, so the diff jumps from villain's pending raise straight to the
  // resolved hand value. last_raised_by identifies hero as the final raiser.
  const previousSession = buildSession({
    handValue: 1,
    lastRaisedBy: 1,
    pendingRaise: { raised_by: 1, to: 3, previous_value: 1 },
  })
  const nextSession = buildSession({ handValue: 6, lastRaisedBy: 0 })

  assert.deepEqual(deriveStakeFxFromSessionDiff(previousSession, nextSession, 'action'), {
    actor: 'villain',
    action: 'accept',
    stake: 6,
    fromStake: 3,
  })
})

test('attributes a collapsed hero re-raise decline to the villain', () => {
  const previousSession = buildSession({
    handValue: 1,
    lastRaisedBy: 1,
    pendingRaise: { raised_by: 1, to: 3, previous_value: 1 },
  })
  const nextSession = buildSession({ handValue: 1, lastRaisedBy: 0 })

  assert.deepEqual(deriveStakeFxFromSessionDiff(previousSession, nextSession, 'action'), {
    actor: 'villain',
    action: 'decline',
    stake: 6,
    fromStake: 3,
  })
})

test('still attributes a plain raise resolution to the hero responder', () => {
  const previousSession = buildSession({
    handValue: 1,
    lastRaisedBy: 1,
    pendingRaise: { raised_by: 1, to: 3, previous_value: 1 },
  })
  const nextSession = buildSession({ handValue: 3, lastRaisedBy: 1 })

  assert.deepEqual(deriveStakeFxFromSessionDiff(previousSession, nextSession, 'action'), {
    actor: 'hero',
    action: 'accept',
    stake: 3,
    fromStake: 1,
  })
})

test('delays villain raise fx until after a newly resolved round preview', () => {
  const previousSession = buildSession()
  const nextStakeFx = {
    actor: 'villain',
    action: 'raise',
    stake: 3,
    fromStake: 1,
  } as const
  const nextSession = buildSession({
    pendingRaise: { raised_by: 1, to: 3, previous_value: 1 },
    completedRounds: [{ leader: 0, winner: 1 }],
  })

  assert.equal(
    shouldDelayStakeFxUntilAfterRoundPreview(previousSession, nextSession, nextStakeFx),
    true,
  )
})

test('does not delay stake fx when no new round resolved', () => {
  const previousSession = buildSession()
  const nextStakeFx = {
    actor: 'villain',
    action: 'raise',
    stake: 3,
    fromStake: 1,
  } as const
  const nextSession = buildSession({
    pendingRaise: { raised_by: 1, to: 3, previous_value: 1 },
  })

  assert.equal(
    shouldDelayStakeFxUntilAfterRoundPreview(previousSession, nextSession, nextStakeFx),
    false,
  )
})

test('delays opening villain raise fx until the new-hand deal finishes', () => {
  const nextStakeFx = {
    actor: 'villain',
    action: 'raise',
    stake: 3,
    fromStake: 1,
  } as const
  const nextSession = buildSession({
    pendingRaise: { raised_by: 1, to: 3, previous_value: 1 },
  })

  assert.equal(
    shouldDelayStakeFxUntilAfterNewHandDeal(true, nextSession, nextStakeFx),
    true,
  )
})

test('keeps non-opening stake fx on the existing timing path', () => {
  const nextStakeFx = {
    actor: 'villain',
    action: 'raise',
    stake: 3,
    fromStake: 1,
  } as const
  const nextSession = buildSession({
    pendingRaise: { raised_by: 1, to: 3, previous_value: 1 },
  })

  assert.equal(
    shouldDelayStakeFxUntilAfterNewHandDeal(false, nextSession, nextStakeFx),
    false,
  )
})

test('does not delay opening hero raise fx behind dealing', () => {
  const nextStakeFx = {
    actor: 'hero',
    action: 'raise',
    stake: 3,
    fromStake: 1,
  } as const
  const nextSession = buildSession({
    pendingRaise: { raised_by: 0, to: 3, previous_value: 1 },
  })

  assert.equal(
    shouldDelayStakeFxUntilAfterNewHandDeal(true, nextSession, nextStakeFx),
    false,
  )
})

test('maps delayed opening stake fx to the stake sound after the deal', () => {
  const openingVillainRaise = {
    actor: 'villain',
    action: 'raise',
    stake: 3,
    fromStake: 1,
  } as const

  assert.equal(soundCueForStakeFx(openingVillainRaise), 'raise')
  assert.deepEqual(soundCueForDelayedOpeningStakeFx(true, openingVillainRaise), {
    cue: 'raise',
    stake: 3,
  })
  assert.equal(soundCueForDelayedOpeningStakeFx(false, openingVillainRaise), null)
})

test('starts optimistic hero raise feedback immediately', () => {
  const session = buildSession()

  assert.deepEqual(deriveOptimisticStakeFx(session, { type: 'raise', to: 3 }), {
    actor: 'hero',
    action: 'raise',
    stake: 3,
    fromStake: 1,
  })
})

test('starts optimistic hero re-raise feedback immediately', () => {
  const session = buildSession({
    pendingRaise: { raised_by: 1, to: 3, previous_value: 1 },
  })

  assert.deepEqual(deriveOptimisticStakeFx(session, { type: 'raise', to: 6 }), {
    actor: 'hero',
    action: 'reraise',
    stake: 6,
    fromStake: 3,
  })
})

test('maps accept and fold decisions to optimistic feedback', () => {
  const raiseSession = buildSession({
    handValue: 1,
    pendingRaise: { raised_by: 1, to: 3, previous_value: 1 },
  })
  const elevenSession = buildSession({
    handValue: 1,
    pendingDecision: { type: 'mao_de_onze', player: 0 },
  })

  assert.deepEqual(deriveOptimisticStakeFx(raiseSession, { type: 'accept_raise' }), {
    actor: 'hero',
    action: 'accept',
    stake: 3,
    fromStake: 1,
  })
  assert.deepEqual(deriveOptimisticStakeFx(raiseSession, { type: 'fold' }), {
    actor: 'hero',
    action: 'decline',
    stake: 3,
    fromStake: 1,
  })
  assert.deepEqual(deriveOptimisticStakeFx(elevenSession, { type: 'accept_eleven' }), {
    actor: 'hero',
    action: 'accept',
    stake: 3,
    fromStake: 1,
  })
  assert.deepEqual(deriveOptimisticStakeFx(elevenSession, { type: 'fold_eleven' }), {
    actor: 'hero',
    action: 'decline',
    stake: 3,
    fromStake: 1,
  })
})

test('describes acceptance with separate action and live-state copy', () => {
  const acceptFx = { actor: 'villain', action: 'accept', stake: 6, fromStake: 3 } as const
  const reraiseFx = { actor: 'hero', action: 'reraise', stake: 9, fromStake: 6 } as const

  assert.equal(describeStakeFxLabel(acceptFx), 'They accept')
  assert.equal(describeStakeFxCallout(acceptFx), 'They accept')
  assert.equal(describeStakeFxLiveBadge(acceptFx), '+6 is live')
  assert.equal(describeStakeFxCallout(reraiseFx), 'You re-raise to +9')
  assert.equal(describeStakeFxLiveBadge(reraiseFx), null)
})

test('matches confirmed stake fx to in-flight optimistic feedback', () => {
  assert.equal(
    isSameStakeFx(
      { actor: 'hero', action: 'reraise', stake: 6, fromStake: 3 },
      { actor: 'hero', action: 'reraise', stake: 6, fromStake: 3 },
    ),
    true,
  )
  assert.equal(
    isSameStakeFx(
      { actor: 'hero', action: 'raise', stake: 3, fromStake: 1 },
      { actor: 'hero', action: 'accept', stake: 3, fromStake: 1 },
    ),
    false,
  )
})
