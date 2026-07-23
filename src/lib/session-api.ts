const sessionApiBasePath = '/api/game/session'

export type BotKind = 'random' | 'simple' | 'heuristic' | 'solver' | 'openai' | 'anthropic' | 'openrouter'
export type LlmBotKind = Extract<BotKind, 'openai' | 'anthropic' | 'openrouter'>
export type BotProfile = 'conservative' | 'balanced' | 'aggressive' | 'tricky'
export type WeightedBotChoice = {
  action: SessionAction
  weight: number
}

export type BotDecisionTrace = {
  action: SessionAction
  plan: {
    choices: WeightedBotChoice[]
    reasoning?: string | null
  }
}

type RequestInitWithJson = RequestInit & {
  json?: unknown
}

export class SessionRequestError extends Error {
  code?: string
  status?: number
  details?: Record<string, unknown>

  constructor(
    message: string,
    code?: string,
    status?: number,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'SessionRequestError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export async function engineFetch<T>(
  path: string,
  init: RequestInitWithJson = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json')
  }

  let response: Response

  try {
    response = await fetch(`${sessionApiBasePath}${path}`, {
      ...init,
      headers,
      body: init.json === undefined ? init.body : JSON.stringify(init.json),
      cache: 'no-store',
    })
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError'
    throw new SessionRequestError(
      isTimeout
        ? 'The live game service took too long to respond.'
        : 'The live game service is temporarily unavailable.',
      isTimeout ? 'ENGINE_TIMEOUT' : 'ENGINE_UNAVAILABLE',
      isTimeout ? 504 : 503,
      error instanceof Error ? { cause: error.message } : undefined,
    )
  }

  const data = (await response.json().catch(() => null)) as
    | { code?: string; message?: string }
    | T
    | null

  if (!response.ok) {
    const code =
      data && typeof data === 'object' && 'code' in data && typeof data.code === 'string'
        ? data.code
        : undefined
    const message =
      data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
        ? data.message
        : `Engine service request failed (${response.status})`
    const details =
      data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined
    throw new SessionRequestError(message, code, response.status, details)
  }

  return data as T
}

export type SessionAction =
  | { type: 'play_face_up'; card_id: string }
  | { type: 'play_face_down'; card_id: string }
  | { type: 'raise'; to: number }
  | { type: 'accept_raise' }
  | { type: 'fold' }
  | { type: 'accept_eleven' }
  | { type: 'concede_hand' }
  | { type: 'fold_eleven' }

export type SessionBotOverride =
  | SessionAction
  | { type: 'next_legal_raise' }

export type SessionCard = {
  id: string
  rank: string
  suit: string
}

export type TurnupCard = {
  rank: string
  suit: string
}

export type PublicPlay = {
  player: 0 | 1
  visibility: 'up' | 'down'
  card?: {
    rank: string
    suit: string
  } | null
}

export type StatePlay = {
  player: 0 | 1
  visibility: 'up' | 'down'
  card: SessionCard
}

export type StateCompletedRound = {
  leader: 0 | 1
  winner: 0 | 1 | null
  plays: StatePlay[]
}

export type PlayerSessionView = {
  player: 0 | 1
  score: { '0': number; '1': number }
  winner: 0 | 1 | null
  next_dealer: 0 | 1
  current_player: 0 | 1 | null
  hand_in_progress: boolean
  hand: {
    public_state: {
      next_player: 0 | 1 | null
      hand_value: number
      hand_winner: 0 | 1 | null
      match_winner: 0 | 1 | null
      score: { '0': number; '1': number }
      completed_rounds: Array<{
        leader: 0 | 1
        winner: 0 | 1 | null
      }>
      current_round: {
        leader: 0 | 1
        plays: PublicPlay[]
      }
      pending_raise: null | {
        raised_by: 0 | 1
        to: number
        previous_value: number
      }
      pending_decision: null | {
        type: 'mao_de_onze'
        player: 0 | 1
      }
    }
    hand: SessionCard[]
  } | null
}

export type PublicHandView = {
  next_player: 0 | 1 | null
  hand_value: number
  hand_winner: 0 | 1 | null
  match_winner: 0 | 1 | null
  score: { '0': number; '1': number }
  completed_rounds: Array<{
    leader: 0 | 1
    winner: 0 | 1 | null
  }>
  current_round: {
    leader: 0 | 1
    plays: PublicPlay[]
  }
  pending_raise: null | {
    raised_by: 0 | 1
    to: number
    previous_value: number
  }
  pending_decision: null | {
    type: 'mao_de_onze'
    player: 0 | 1
  }
}

export type SessionPayload = {
  matchId: string
  humanPlayer: 0 | 1
  botPlayer: 0 | 1
  botKind: BotKind | null
  botProfile: BotProfile | null
  botModel: string | null
  lastBotDecision?: BotDecisionTrace | null
  pendingBotOverride?: SessionBotOverride | null
  notice?: string | null
  state: {
    next_dealer: 0 | 1
    score: { '0': number; '1': number }
    winner: 0 | 1 | null
    current_hand: {
      state: {
        dealer: 0 | 1
        next_player: 0 | 1 | null
        score: { '0': number; '1': number }
        hand_value: number
        turnup: TurnupCard
        completed_rounds: StateCompletedRound[]
        current_round: {
          leader: 0 | 1
          plays: StatePlay[]
        }
        last_raised_by?: 0 | 1 | null
        pending_raise: PublicHandView['pending_raise']
        pending_decision: PublicHandView['pending_decision']
      }
      hand_winner: 0 | 1 | null
      match_winner: 0 | 1 | null
    } | null
  }
  publicView: {
    score: { '0': number; '1': number }
    winner: 0 | 1 | null
    next_dealer: 0 | 1
    current_player: 0 | 1 | null
    hand_in_progress: boolean
    hand: PublicHandView | null
  }
  playerView: PlayerSessionView
  legalActions: SessionAction[]
}

export type LlmProviderCatalog = {
  provider: LlmBotKind
  enabled: boolean
  default_model?: string | null
  models: Array<{ id: string }>
  note?: string | null
}

export async function createBotSession(options?: {
  humanPlayer?: 0 | 1
  startingDealer?: 0 | 1
  botKind?: BotKind
  botProfile?: BotProfile
  botModel?: string
  // Bring-your-own-key for LLM bots. Sent only on match creation; not persisted
  // client-side. Transits the BFF in plaintext (see the create-session route).
  apiKey?: string
  seed?: number
  signal?: AbortSignal
}) {
  return engineFetch<SessionPayload>('', {
    method: 'POST',
    signal: options?.signal,
    json: {
      humanPlayer: options?.humanPlayer ?? 0,
      startingDealer: options?.startingDealer,
      botKind: options?.botKind,
      botProfile: options?.botProfile,
      botModel: options?.botModel,
      apiKey: options?.apiKey,
      seed: options?.seed,
    },
  })
}

export type VillainSampling = 'pinned' | 'posterior' | 'prior'

export type SeededHistoryEntry = {
  seat: 0 | 1
  kind:
    | 'play_face_up'
    | 'play_face_down'
    | 'raise'
    | 'accept_raise'
    | 'fold'
    | 'accept_eleven'
    | 'fold_eleven'
  class?: number
  to?: number
}

export async function createSeededBotSession(options: {
  humanPlayer?: 0 | 1
  score: { '0': number; '1': number }
  dealer: 0 | 1
  viraRank: string
  heroHand?: number[] | null
  villainHand?: number[] | null
  history?: SeededHistoryEntry[]
  botKind?: BotKind
  botProfile?: BotProfile
  botModel?: string
  // Bring-your-own-key for LLM bots. Sent only on match creation; not persisted
  // client-side. Transits the BFF in plaintext (see the create-session route).
  apiKey?: string
  seed?: number
  signal?: AbortSignal
}) {
  return engineFetch<SessionPayload & { villainSampling?: VillainSampling }>('/seeded', {
    method: 'POST',
    signal: options.signal,
    json: {
      humanPlayer: options.humanPlayer ?? 0,
      score: options.score,
      dealer: options.dealer,
      viraRank: options.viraRank,
      heroHand: options.heroHand,
      villainHand: options.villainHand,
      history: options.history,
      botKind: options.botKind,
      botProfile: options.botProfile,
      botModel: options.botModel,
      apiKey: options.apiKey,
      seed: options.seed,
    },
  })
}

export async function fetchLlmProviderCatalogs(options?: { signal?: AbortSignal }) {
  return engineFetch<LlmProviderCatalog[]>('/llm-providers', { signal: options?.signal })
}

export type SolverBotStatus = { enabled: boolean; profiles: number }

export async function fetchSolverBotStatus(options?: { signal?: AbortSignal }) {
  return engineFetch<SolverBotStatus>('/solver-bot', { signal: options?.signal })
}

export async function fetchSession(matchId: string, options?: { signal?: AbortSignal }) {
  return engineFetch<SessionPayload>(`/${matchId}`, { signal: options?.signal })
}

export async function applySessionAction(
  matchId: string,
  action: SessionAction,
  options?: { signal?: AbortSignal },
) {
  return engineFetch<SessionPayload>(`/${matchId}/actions`, {
    method: 'POST',
    signal: options?.signal,
    json: { action },
  })
}

export async function startNextHand(
  matchId: string,
  options?: { deferBotEleven?: boolean; viraRank?: string; signal?: AbortSignal },
) {
  return engineFetch<SessionPayload>(`/${matchId}/start-hand`, {
    method: 'POST',
    signal: options?.signal,
    json: {
      deferBotEleven: options?.deferBotEleven === true,
      // Dev-only: force the next hand's turnup rank (engine-gated).
      viraRank: options?.viraRank,
    },
  })
}

export async function advanceBotTurns(matchId: string, options?: { signal?: AbortSignal }) {
  return engineFetch<SessionPayload>(`/${matchId}/bot-turns`, {
    method: 'POST',
    signal: options?.signal,
  })
}
