import { SessionRequestError } from './session-api.ts'

const liveSessionFailureCodes = [
  'MATCH_NOT_FOUND',
  'MATCH_EXPIRED',
  'MATCH_FORBIDDEN',
  'ENGINE_TIMEOUT',
  'ENGINE_UNAVAILABLE',
  'SESSION_LIMIT_REACHED',
  'ENGINE_REJECTED_REQUEST',
  'BOT_PROVIDER_UNAVAILABLE',
  'BOT_MODEL_REQUIRED',
  'BOT_MODEL_UNAVAILABLE',
  'LLM_PROVIDER_EXHAUSTED',
] as const

export type LiveSessionFailureCode = (typeof liveSessionFailureCodes)[number]
export type NormalizedLiveSessionFailureCode = LiveSessionFailureCode | 'UNKNOWN'

export type LiveSessionFailure = {
  code: NormalizedLiveSessionFailureCode
  title: string
  description: string
  detail: string | null
  status: number | null
}

const liveSessionFailureCodeSet = new Set<string>(liveSessionFailureCodes)

const liveSessionFailureCodeAliases: Record<string, LiveSessionFailureCode> = {
  CLIENT_TIMEOUT: 'ENGINE_TIMEOUT',
  ENGINE_SERVICE_TIMEOUT: 'ENGINE_TIMEOUT',
  ENGINE_TIMEOUT: 'ENGINE_TIMEOUT',
  GATEWAY_TIMEOUT: 'ENGINE_TIMEOUT',
  TIMEOUT: 'ENGINE_TIMEOUT',
  ENGINE_SERVICE_UNAVAILABLE: 'ENGINE_UNAVAILABLE',
  ENGINE_UNAVAILABLE: 'ENGINE_UNAVAILABLE',
  SERVICE_UNAVAILABLE: 'ENGINE_UNAVAILABLE',
  UNAVAILABLE: 'ENGINE_UNAVAILABLE',
  MATCH_EXPIRED: 'MATCH_EXPIRED',
  MATCH_FORBIDDEN: 'MATCH_FORBIDDEN',
  FORBIDDEN: 'MATCH_FORBIDDEN',
  MATCH_UNAUTHORIZED: 'MATCH_FORBIDDEN',
  MATCH_NOT_FOUND: 'MATCH_NOT_FOUND',
  MATCH_UNKNOWN: 'MATCH_NOT_FOUND',
  NOT_FOUND: 'MATCH_NOT_FOUND',
  SESSION_LIMIT_REACHED: 'SESSION_LIMIT_REACHED',
  RATE_LIMITED: 'SESSION_LIMIT_REACHED',
  TOO_MANY_REQUESTS: 'SESSION_LIMIT_REACHED',
  TOO_MANY_SESSIONS: 'SESSION_LIMIT_REACHED',
  ENGINE_REJECTED_REQUEST: 'ENGINE_REJECTED_REQUEST',
  REQUEST_REJECTED: 'ENGINE_REJECTED_REQUEST',
  UNPROCESSABLE_ENTITY: 'ENGINE_REJECTED_REQUEST',
  BOT_PROVIDER_UNAVAILABLE: 'BOT_PROVIDER_UNAVAILABLE',
  BOT_MODEL_REQUIRED: 'BOT_MODEL_REQUIRED',
  BOT_MODEL_UNAVAILABLE: 'BOT_MODEL_UNAVAILABLE',
  LLM_PROVIDER_EXHAUSTED: 'LLM_PROVIDER_EXHAUSTED',
  INSUFFICIENT_CREDITS: 'LLM_PROVIDER_EXHAUSTED',
}

const liveSessionStatusFallbacks: Partial<Record<number, LiveSessionFailureCode>> = {
  402: 'LLM_PROVIDER_EXHAUSTED',
  403: 'MATCH_FORBIDDEN',
  404: 'MATCH_NOT_FOUND',
  410: 'MATCH_EXPIRED',
  422: 'ENGINE_REJECTED_REQUEST',
  429: 'SESSION_LIMIT_REACHED',
  503: 'ENGINE_UNAVAILABLE',
  504: 'ENGINE_TIMEOUT',
}

export function normalizeLiveSessionErrorCode(
  code?: string,
  status?: number,
): NormalizedLiveSessionFailureCode {
  if (typeof code === 'string') {
    const normalizedCode = code.trim().toUpperCase()
    const aliasedCode = liveSessionFailureCodeAliases[normalizedCode]

    if (aliasedCode) {
      return aliasedCode
    }

    if (liveSessionFailureCodeSet.has(normalizedCode)) {
      return normalizedCode as LiveSessionFailureCode
    }
  }

  if (typeof status === 'number') {
    const fallbackCode = liveSessionStatusFallbacks[status]
    if (fallbackCode) return fallbackCode
  }

  return 'UNKNOWN'
}

export function toLiveSessionFailure(error: unknown): LiveSessionFailure {
  if (error instanceof SessionRequestError) {
    return describeLiveSessionFailure(
      normalizeLiveSessionErrorCode(error.code, error.status),
      error.message,
      error.status,
    )
  }

  if (error instanceof Error) {
    return describeLiveSessionFailure('UNKNOWN', error.message)
  }

  return describeLiveSessionFailure('UNKNOWN')
}

export function shouldClearBrokenMatchQuery(code: NormalizedLiveSessionFailureCode) {
  return code === 'MATCH_NOT_FOUND' || code === 'MATCH_EXPIRED' || code === 'MATCH_FORBIDDEN'
}

function describeLiveSessionFailure(
  code: NormalizedLiveSessionFailureCode,
  detail?: string,
  status?: number,
): LiveSessionFailure {
  switch (code) {
    case 'MATCH_NOT_FOUND':
      return {
        code,
        title: 'Match not found',
        description: 'That live match is no longer available. Start a fresh match to jump back in.',
        detail: null,
        status: status ?? null,
      }
    case 'MATCH_EXPIRED':
      return {
        code,
        title: 'Match expired',
        description: 'That live match expired after sitting idle. Start a fresh match to keep playing.',
        detail: null,
        status: status ?? null,
      }
    case 'MATCH_FORBIDDEN':
      return {
        code,
        title: 'Match unavailable',
        description: 'That live match could not be opened here. Start a fresh match to keep playing.',
        detail: null,
        status: status ?? null,
      }
    case 'ENGINE_TIMEOUT':
      return {
        code,
        title: 'Live service timed out',
        description: 'The live game service took too long to respond. Retry in a moment or start fresh if the board stays stuck.',
        detail: null,
        status: status ?? null,
      }
    case 'ENGINE_UNAVAILABLE':
      return {
        code,
        title: 'Live service unavailable',
        description: 'The browser is up, but the live game engine cannot be reached right now. Retry in a moment.',
        detail: null,
        status: status ?? null,
      }
    case 'SESSION_LIMIT_REACHED':
      return {
        code,
        title: 'Session limit reached',
        description: 'The live service has hit its session limit. Wait a moment, close an older match, then try again.',
        detail: null,
        status: status ?? null,
      }
    case 'ENGINE_REJECTED_REQUEST':
      return {
        code,
        title: 'The table needs a refresh',
        description: 'The live game service rejected the last request. Try loading the match again before making another move.',
        detail: detail ?? null,
        status: status ?? null,
      }
    case 'BOT_PROVIDER_UNAVAILABLE':
      return {
        code,
        title: 'LLM bot unavailable',
        description: 'That provider is not ready on this service right now. Reload the provider list or switch back to a heuristic bot.',
        detail: detail ?? null,
        status: status ?? null,
      }
    case 'BOT_MODEL_REQUIRED':
      return {
        code,
        title: 'Choose a bot model',
        description: 'Select a model for the LLM bot before starting the next live match.',
        detail: detail ?? null,
        status: status ?? null,
      }
    case 'BOT_MODEL_UNAVAILABLE':
      return {
        code,
        title: 'Bot model unavailable',
        description: 'That model is no longer exposed by the selected provider. Pick another model or switch back to heuristic play.',
        detail: detail ?? null,
        status: status ?? null,
      }
    case 'LLM_PROVIDER_EXHAUSTED':
      return {
        code,
        title: 'Shared AI bot is out of credits',
        description: 'Our shared AI opponent has used up its credits for now. Add your own key in Settings to keep playing, or switch to a heuristic bot.',
        detail: detail ?? null,
        status: status ?? null,
      }
    default:
      return {
        code: 'UNKNOWN',
        title: 'Could not load the live session',
        description: 'Something unexpected went wrong while talking to the live game service.',
        detail: detail ?? null,
        status: status ?? null,
      }
  }
}
