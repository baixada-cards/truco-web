import { NextResponse } from 'next/server.js'

import { isLlmBotKind, validateLlmBotSelection } from '../../../../../src/lib/live-bot-selection.ts'
import type { BotKind, SeededHistoryEntry } from '../../../../../src/lib/session-api.ts'
import {
  resolveAnonymousSubject,
  setAnonymousSubjectCookie,
} from '../../../../../src/server/anonymous-subject.ts'
import { jsonEngineRequest } from '../../../../../src/server/engine-service.ts'
import { loadSessionPayload } from '../../../../../src/server/game-session.ts'
import { engineErrorResponse } from '../../../../../src/server/route-error.ts'

type LlmProviderCatalogResponse = {
  provider: 'openai' | 'anthropic' | 'openrouter'
  enabled: boolean
  default_model?: string | null
  models: Array<{ id: string }>
  note?: string | null
}

type SeededSessionRequestBody = {
  humanPlayer?: 0 | 1
  score?: { '0'?: number; '1'?: number }
  dealer?: 0 | 1
  viraRank?: string
  heroHand?: number[] | null
  villainHand?: number[] | null
  history?: SeededHistoryEntry[]
  botKind?: BotKind
  botProfile?: 'conservative' | 'balanced' | 'aggressive' | 'tricky'
  botModel?: string
  // Bring-your-own-key: forwarded to the engine as `api_key`. Never logged
  // here; it transits to the engine in plaintext.
  apiKey?: string
  seed?: number
}

function validateSeededSessionBody(body: SeededSessionRequestBody) {
  // heroHand may be absent/null: the engine deals the human's unspecified
  // cards from the line-conditioned range. When given, it must be complete.
  if (
    body.heroHand != null &&
    (!Array.isArray(body.heroHand) ||
      body.heroHand.length !== 3 ||
      body.heroHand.some((card) => typeof card !== 'number'))
  ) {
    return 'heroHand, when given, must be an array of exactly 3 numbers.'
  }

  if (body.humanPlayer !== undefined && body.humanPlayer !== 0 && body.humanPlayer !== 1) {
    return 'humanPlayer must be 0 or 1.'
  }

  if (body.dealer !== 0 && body.dealer !== 1) {
    return 'dealer must be 0 or 1.'
  }

  if (
    typeof body.score !== 'object' ||
    body.score === null ||
    typeof body.score['0'] !== 'number' ||
    typeof body.score['1'] !== 'number'
  ) {
    return "score must include numeric '0' and '1' fields."
  }

  if (typeof body.viraRank !== 'string' || body.viraRank.length === 0) {
    return 'viraRank must be a non-empty string.'
  }

  if (body.history !== undefined && !Array.isArray(body.history)) {
    return 'history must be an array.'
  }

  return null
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as SeededSessionRequestBody

    const validationError = validateSeededSessionBody(body)
    if (validationError) {
      return NextResponse.json(
        { code: 'INVALID_SEED', message: validationError },
        { status: 400 },
      )
    }

    const anonymousSubject = resolveAnonymousSubject(request)
    const humanPlayer = body.humanPlayer === 1 ? 1 : 0

    if (isLlmBotKind(body.botKind)) {
      const providers = await jsonEngineRequest<LlmProviderCatalogResponse[]>('/engine/llm-providers')
      const validationIssue = validateLlmBotSelection({
        botKind: body.botKind,
        botModel: body.botModel,
        providers,
      })

      if (validationIssue) {
        return NextResponse.json(
          {
            code: validationIssue.code,
            message: validationIssue.message,
            details: {
              provider: body.botKind,
              requested_model: body.botModel ?? null,
            },
          },
          { status: validationIssue.status },
        )
      }
    }

    const created = await jsonEngineRequest<{
      match_id: string
      human_player: 0 | 1
      bot_player: 0 | 1
      state: unknown
      public_view: unknown
      villain_sampling: 'pinned' | 'posterior' | 'prior'
    }>('/bot-matches/seeded', {
      method: 'POST',
      json: {
        human_player: humanPlayer,
        score: body.score,
        dealer: body.dealer,
        vira_rank: body.viraRank,
        hero_hand: body.heroHand ?? null,
        villain_hand: body.villainHand ?? null,
        history: body.history ?? [],
        bot_kind: body.botKind,
        bot_profile: body.botProfile,
        bot_model: body.botModel,
        api_key: body.apiKey,
        seed: body.seed,
        owner_subject: anonymousSubject.subject,
      },
    })

    const response = NextResponse.json({
      ...(await loadSessionPayload(
        created.match_id,
        { ownerSubject: anonymousSubject.subject },
      )),
      villainSampling: created.villain_sampling,
    })
    setAnonymousSubjectCookie(response, anonymousSubject.subject)
    return response
  } catch (error) {
    return engineErrorResponse(error, 'Failed to create seeded session')
  }
}
