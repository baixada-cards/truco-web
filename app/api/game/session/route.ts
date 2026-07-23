import { NextResponse } from 'next/server.js'

import { isLlmBotKind, validateLlmBotSelection } from '../../../../src/lib/live-bot-selection.ts'
import type { BotKind } from '../../../../src/lib/session-api.ts'
import {
  resolveAnonymousSubject,
  setAnonymousSubjectCookie,
  withAnonymousSubjectHeader,
} from '../../../../src/server/anonymous-subject.ts'
import { jsonEngineRequest } from '../../../../src/server/engine-service.ts'
import { loadSessionPayload } from '../../../../src/server/game-session.ts'
import { engineErrorResponse } from '../../../../src/server/route-error.ts'

type LlmProviderCatalogResponse = {
  provider: 'openai' | 'anthropic' | 'openrouter'
  enabled: boolean
  default_model?: string | null
  models: Array<{ id: string }>
  note?: string | null
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      humanPlayer?: 0 | 1
      startingDealer?: 0 | 1
      botKind?: BotKind
      botProfile?: 'conservative' | 'balanced' | 'aggressive' | 'tricky'
      botModel?: string
      // Bring-your-own-key: forwarded to the engine as `api_key`. Never logged
      // here; it transits to the engine in plaintext.
      apiKey?: string
      seed?: number
    }
    const anonymousSubject = resolveAnonymousSubject(request)
    const humanPlayer = body.humanPlayer === 1 ? 1 : 0
    const startingDealer =
      body.startingDealer === 0 || body.startingDealer === 1
        ? body.startingDealer
        : Math.random() < 0.5
          ? 0
          : 1

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

    // The solver opponent plays the exact solved strategy, which only exists
    // from 10-10 onward; matches against it start there. The score is derived
    // here (not client-supplied) so the solved-region invariant holds.
    const startingScore = body.botKind === 'solver'
      ? { '0': 10, '1': 10 }
      : { '0': 0, '1': 0 }

    const created = await jsonEngineRequest<{
      match_id: string
      human_player: 0 | 1
      bot_player: 0 | 1
      state: unknown
      public_view: unknown
    }>('/bot-matches', {
      method: 'POST',
      json: {
        starting_dealer: startingDealer,
        score: startingScore,
        human_player: humanPlayer,
        bot_kind: body.botKind,
        bot_profile: body.botProfile,
        bot_model: body.botModel,
        api_key: body.apiKey,
        seed: body.seed,
        owner_subject: anonymousSubject.subject,
      },
    })

    await jsonEngineRequest(`/matches/${created.match_id}/start-hand/random`, {
      method: 'POST',
      headers: withAnonymousSubjectHeader(undefined, anonymousSubject.subject),
    })

    const response = NextResponse.json(
      await loadSessionPayload(
        created.match_id,
        { ownerSubject: anonymousSubject.subject },
      ),
    )
    setAnonymousSubjectCookie(response, anonymousSubject.subject)
    return response
  } catch (error) {
    return engineErrorResponse(error, 'Failed to create session')
  }
}
