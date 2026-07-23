import { NextResponse } from 'next/server.js'

import {
  requireAnonymousSubject,
  withAnonymousSubjectHeader,
} from '../../../../../../src/server/anonymous-subject'
import {
  EngineServiceRequestError,
  jsonEngineRequest,
} from '../../../../../../src/server/engine-service'
import { loadSessionPayload } from '../../../../../../src/server/game-session'
import { engineErrorResponse, recoverWithSessionRefresh } from '../../../../../../src/server/route-error'

const recoverableStartHandCodes = new Set([
  'HAND_STILL_IN_PROGRESS',
  'MATCH_ALREADY_DECIDED',
])

export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params

  try {
    const ownerSubject = requireAnonymousSubject(request)
    const body = (await request.json().catch(() => ({}))) as {
      deferBotEleven?: boolean
      // Dev-only passthrough: force the next hand's turnup rank. The engine
      // rejects it when dev routes are disabled.
      viraRank?: string
    }

    await jsonEngineRequest(`/matches/${matchId}/start-hand/random`, {
      method: 'POST',
      headers: withAnonymousSubjectHeader(undefined, ownerSubject),
      json: {
        defer_bot_eleven: body.deferBotEleven === true,
        vira_rank: typeof body.viraRank === 'string' ? body.viraRank : undefined,
      },
    })

    return NextResponse.json(
      await loadSessionPayload(matchId, { ownerSubject }),
    )
  } catch (error) {
    if (
      error instanceof EngineServiceRequestError &&
      recoverableStartHandCodes.has(error.code ?? '')
    ) {
      return recoverWithSessionRefresh(
        matchId,
        requireAnonymousSubject(request),
        'The next hand was already in progress, so the board was refreshed.',
        'Failed to refresh session after start-hand race',
      )
    }

    return engineErrorResponse(error, 'Failed to start next hand')
  }
}
