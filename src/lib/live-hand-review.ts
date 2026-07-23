import type { SessionPayload, StateCompletedRound, StatePlay } from './session-api'

export type StoredReviewScore = {
  hero: number
  villain: number
}

export type StoredReviewRoundCard = {
  rank: string
  suit: string
  hidden: boolean
}

export type StoredReviewRoundSummary = {
  winner: 0 | 1 | null
  heroCard: StoredReviewRoundCard | null
  villainCard: StoredReviewRoundCard | null
}

export type StoredReviewSummary = {
  winner: 0 | 1 | null
  points: number
  scoreBefore: StoredReviewScore
  score: StoredReviewScore
  rounds: StoredReviewRoundSummary[]
  handValue: number
  turnup: string | null
  dealer: 0 | 1 | null
  reason: string
}

export type StoredLastHandReview = {
  state: SessionPayload['state']
  summary?: StoredReviewSummary
}

type LegacyReviewSummary = {
  winner?: unknown
  handValue?: unknown
  turnup?: unknown
  reason?: unknown
}

const RANK_ORDER = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'] as const

const MANILHA_SUIT_STRENGTH: Record<string, number> = {
  DIAMONDS: 0,
  SPADES: 1,
  HEARTS: 2,
  CLUBS: 3,
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isWinner(value: unknown): value is 0 | 1 | null {
  return value === 0 || value === 1 || value === null
}

function isStoredReviewScore(value: unknown): value is StoredReviewScore {
  return isPlainObject(value)
    && typeof value.hero === 'number'
    && Number.isFinite(value.hero)
    && typeof value.villain === 'number'
    && Number.isFinite(value.villain)
}

function statePlayForSeat(plays: StatePlay[], player: 0 | 1) {
  return plays.find((play) => play.player === player) ?? null
}

function toStoredReviewRoundCard(play: StatePlay | null | undefined): StoredReviewRoundCard | null {
  if (!play) return null

  return {
    rank: play.card.rank,
    suit: play.card.suit,
    hidden: play.visibility === 'down',
  }
}

function isStoredReviewRoundCard(value: unknown): value is StoredReviewRoundCard {
  return isPlainObject(value)
    && typeof value.rank === 'string'
    && typeof value.suit === 'string'
    && typeof value.hidden === 'boolean'
}

function normalizeStoredReviewRound(
  round: unknown,
  fallback: StoredReviewRoundSummary | undefined,
): StoredReviewRoundSummary {
  const winner = isPlainObject(round) && isWinner(round.winner) ? round.winner : fallback?.winner ?? null
  const heroCard = isPlainObject(round) && isStoredReviewRoundCard(round.heroCard)
    ? round.heroCard
    : fallback?.heroCard ?? null
  const villainCard = isPlainObject(round) && isStoredReviewRoundCard(round.villainCard)
    ? round.villainCard
    : fallback?.villainCard ?? null

  return {
    winner,
    heroCard,
    villainCard,
  }
}

function nextManilhaRank(turnupRank: string) {
  const rankIndex = RANK_ORDER.indexOf(turnupRank as typeof RANK_ORDER[number])
  if (rankIndex < 0) return null
  return RANK_ORDER[(rankIndex + 1) % RANK_ORDER.length]
}

function cardStrength(play: StatePlay, turnup: { rank: string; suit: string } | null | undefined) {
  const rankIndex = RANK_ORDER.indexOf(play.card.rank as typeof RANK_ORDER[number])
  if (rankIndex < 0) return null

  const manilhaRank = turnup ? nextManilhaRank(turnup.rank) : null
  if (manilhaRank && play.card.rank === manilhaRank) {
    const suitStrength = MANILHA_SUIT_STRENGTH[play.card.suit]
    return suitStrength == null ? null : 10 + suitStrength
  }

  return rankIndex
}

function buildCurrentRoundSummary(
  currentRound: { plays: StatePlay[] } | null | undefined,
  turnup: { rank: string; suit: string } | null | undefined,
  humanPlayer: 0 | 1 = 0,
): StoredReviewRoundSummary | null {
  if (!currentRound || currentRound.plays.length < 2) return null

  const heroPlay = statePlayForSeat(currentRound.plays, humanPlayer)
  const villainPlay = statePlayForSeat(currentRound.plays, humanPlayer === 0 ? 1 : 0)
  if (!heroPlay || !villainPlay) return null

  // Engine rule: a face-down play always loses (two face-down plays tie).
  const heroStrength = heroPlay.visibility === 'down' ? -1 : cardStrength(heroPlay, turnup)
  const villainStrength = villainPlay.visibility === 'down' ? -1 : cardStrength(villainPlay, turnup)

  let winner: 0 | 1 | null = null
  if (heroStrength != null && villainStrength != null) {
    winner = heroStrength === villainStrength
      ? null
      : heroStrength > villainStrength
        ? humanPlayer
        : humanPlayer === 0 ? 1 : 0
  }

  return {
    winner,
    heroCard: toStoredReviewRoundCard(heroPlay),
    villainCard: toStoredReviewRoundCard(villainPlay),
  }
}

function sameRoundSummary(left: StoredReviewRoundSummary | undefined, right: StoredReviewRoundSummary | null) {
  if (!left || !right) return false
  return JSON.stringify(left) === JSON.stringify(right)
}

export function buildStoredReviewRounds(
  completedRounds: StateCompletedRound[] | null | undefined,
  options?: {
    currentRound?: { plays: StatePlay[] } | null
    turnup?: { rank: string; suit: string } | null
    humanPlayer?: 0 | 1
  },
): StoredReviewRoundSummary[] {
  const humanPlayer = options?.humanPlayer ?? 0
  const villainPlayer = humanPlayer === 0 ? 1 : 0
  const rounds = (completedRounds ?? []).map((round) => ({
    winner: round.winner,
    heroCard: toStoredReviewRoundCard(statePlayForSeat(round.plays, humanPlayer)),
    villainCard: toStoredReviewRoundCard(statePlayForSeat(round.plays, villainPlayer)),
  }))

  const currentRoundSummary = buildCurrentRoundSummary(options?.currentRound, options?.turnup, humanPlayer)
  if (!currentRoundSummary || sameRoundSummary(rounds.at(-1), currentRoundSummary)) {
    return rounds
  }

  return [...rounds, currentRoundSummary]
}

function normalizeScore(state: SessionPayload['state']): StoredReviewScore {
  return {
    hero: state.score['0'],
    villain: state.score['1'],
  }
}

function inferScoreBefore(score: StoredReviewScore, winner: 0 | 1 | null, points: number) {
  if (!Number.isFinite(points) || points <= 0 || winner == null) {
    return score
  }

  if (winner === 0) {
    return {
      hero: Math.max(0, score.hero - points),
      villain: score.villain,
    }
  }

  return {
    hero: score.hero,
    villain: Math.max(0, score.villain - points),
  }
}

function formatTurnup(turnup: { rank?: unknown; suit?: unknown } | null | undefined) {
  if (!turnup || typeof turnup !== 'object') return null

  const { rank, suit } = turnup as { rank?: unknown; suit?: unknown }
  if (typeof rank !== 'string' || typeof suit !== 'string') return null

  switch (suit) {
    case 'SPADES': return `${rank}♠`
    case 'HEARTS': return `${rank}♥`
    case 'DIAMONDS': return `${rank}♦`
    case 'CLUBS': return `${rank}♣`
    default: return `${rank}${suit}`
  }
}

export function normalizeStoredReviewSummary(
  summary: unknown,
  state: SessionPayload['state'],
): StoredReviewSummary | undefined {
  if (!isPlainObject(summary)) return undefined

  const candidate = summary as Partial<StoredReviewSummary> & LegacyReviewSummary
  const fallbackRounds = buildStoredReviewRounds(
    state.current_hand?.state.completed_rounds,
    {
      currentRound: state.current_hand?.state.current_round,
      turnup: state.current_hand?.state.turnup ?? null,
    },
  )
  const winner = isWinner(candidate.winner) ? candidate.winner : null
  const score = isStoredReviewScore(candidate.score) ? candidate.score : normalizeScore(state)
  const points =
    typeof candidate.points === 'number' && Number.isFinite(candidate.points)
      ? candidate.points
      : typeof candidate.handValue === 'number' && Number.isFinite(candidate.handValue)
        ? candidate.handValue
        : winner === 0
          ? Math.max(0, score.hero - score.villain)
          : winner === 1
            ? Math.max(0, score.villain - score.hero)
            : 0
  const scoreBefore = isStoredReviewScore(candidate.scoreBefore)
    ? candidate.scoreBefore
    : inferScoreBefore(score, winner, points)
  const rounds = Array.isArray(candidate.rounds)
    ? candidate.rounds.map((round, index) => normalizeStoredReviewRound(round, fallbackRounds[index]))
    : fallbackRounds
  const handValue =
    typeof candidate.handValue === 'number' && Number.isFinite(candidate.handValue)
      ? candidate.handValue
      : points
  const turnup =
    typeof candidate.turnup === 'string' || candidate.turnup === null
      ? candidate.turnup
      : formatTurnup(state.current_hand?.state.turnup)
  const dealer = isWinner(candidate.dealer) ? candidate.dealer : state.current_hand?.state.dealer ?? null
  const reason = typeof candidate.reason === 'string' ? candidate.reason : 'Hand review snapshot.'

  return {
    winner,
    points,
    scoreBefore,
    score,
    rounds,
    handValue,
    turnup,
    dealer,
    reason,
  }
}

export function normalizeStoredLastHandReview(review: unknown): StoredLastHandReview | null {
  if (!isPlainObject(review) || !isPlainObject(review.state)) {
    return null
  }

  const state = review.state as SessionPayload['state']

  return {
    state,
    summary: normalizeStoredReviewSummary(review.summary, state),
  }
}
