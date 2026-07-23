import {
  EngineServiceRequestError,
  jsonEngineRequest,
} from './engine-service.ts'
import { withAnonymousSubjectHeader } from './anonymous-subject.ts'

type Seat = 0 | 1

type ActionType =
  | 'play_face_up'
  | 'play_face_down'
  | 'raise'
  | 'accept_raise'
  | 'fold'
  | 'accept_eleven'
  | 'concede_hand'
  | 'fold_eleven'

type BotOverrideType = ActionType | 'next_legal_raise'

export type MatchMetadata = {
  human_player: Seat
  bot_player?: Seat | null
  bot_kind?: 'random' | 'simple' | 'heuristic' | 'solver' | 'openai' | 'anthropic' | 'openrouter' | null
  bot_profile?: 'conservative' | 'balanced' | 'aggressive' | 'tricky' | null
  bot_model?: string | null
  last_bot_decision?: {
    action: {
      type: ActionType
      card_id?: string
      to?: number
    }
    plan: {
      choices: Array<{
        action: {
          type: ActionType
          card_id?: string
          to?: number
        }
        weight: number
      }>
      reasoning?: string | null
    }
  } | null
  pending_bot_override?: {
    type: BotOverrideType
    card_id?: string
    to?: number
  } | null
}

function ownedMatchRequestInit(ownerSubject?: string) {
  if (!ownerSubject) return undefined

  return {
    headers: withAnonymousSubjectHeader(undefined, ownerSubject),
  }
}

export async function loadMatchMetadata(matchId: string, ownerSubject?: string) {
  return jsonEngineRequest<MatchMetadata>(
    `/matches/${matchId}/meta`,
    ownedMatchRequestInit(ownerSubject),
  )
}

export async function loadSessionPayload(
  matchId: string,
  options: {
    notice?: string
    ownerSubject?: string
  } = {},
) {
  const metadata = await loadMatchMetadata(matchId, options.ownerSubject)
  const humanPlayer = metadata.human_player
  const botPlayer = metadata.bot_player ?? (humanPlayer === 0 ? 1 : 0)
  const ownerRequestInit = ownedMatchRequestInit(options.ownerSubject)
  const results = await Promise.allSettled([
    jsonEngineRequest(`/matches/${matchId}`, ownerRequestInit),
    jsonEngineRequest(`/matches/${matchId}/public-view`, ownerRequestInit),
    jsonEngineRequest(`/matches/${matchId}/players/${humanPlayer}/view`, ownerRequestInit),
    loadLegalActions(matchId, options.ownerSubject),
  ])

  const failedResults = results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  )

  if (failedResults.length > 0) {
    throw prioritizeSessionLoadError(failedResults.map((result) => result.reason))
  }

  const [state, publicView, playerView, legalActions] = results.map(
    (result) => (result as PromiseFulfilledResult<unknown>).value,
  ) as [unknown, unknown, unknown, unknown]

  return {
    matchId,
    humanPlayer,
    botPlayer: metadata.bot_player ?? botPlayer,
    botKind: metadata.bot_kind ?? null,
    botProfile: metadata.bot_profile ?? null,
    botModel: metadata.bot_model ?? null,
    lastBotDecision: metadata.last_bot_decision ?? null,
    pendingBotOverride: metadata.pending_bot_override ?? null,
    state,
    publicView,
    playerView,
    legalActions,
    notice: options.notice ?? null,
  }
}

function prioritizeSessionLoadError(errors: unknown[]) {
  const prioritizedCodes = [
    'MATCH_EXPIRED',
    'MATCH_FORBIDDEN',
    'MATCH_NOT_FOUND',
    'SESSION_LIMIT_REACHED',
    'RATE_LIMITED',
    'ENGINE_TIMEOUT',
    'ENGINE_UNAVAILABLE',
  ]

  for (const code of prioritizedCodes) {
    const matchingError = errors.find(
      (error) => error instanceof EngineServiceRequestError && error.code === code,
    )
    if (matchingError) return matchingError
  }

  const statusSortedError = errors.find(
    (error) => error instanceof EngineServiceRequestError && error.status === 410,
  )
  if (statusSortedError) return statusSortedError

  return errors[0] ?? new Error('Failed to load session')
}

async function loadLegalActions(matchId: string, ownerSubject?: string) {
  try {
    return await jsonEngineRequest(
      `/matches/${matchId}/legal-actions`,
      ownedMatchRequestInit(ownerSubject),
    )
  } catch (error) {
    if (
      error instanceof EngineServiceRequestError &&
      (
        error.code === 'NO_ACTIVE_HAND' ||
        error.code === 'HAND_ALREADY_DECIDED' ||
        error.code === 'MATCH_ALREADY_DECIDED'
      )
    ) {
      return []
    }

    throw error
  }
}
