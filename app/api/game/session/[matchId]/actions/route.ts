import { NextResponse } from 'next/server.js'

import {
  requireAnonymousSubject,
  withAnonymousSubjectHeader,
} from '../../../../../../src/server/anonymous-subject'
import { debugLogServer } from '../../../../../../src/server/debug-log.ts'
import {
  EngineServiceRequestError,
  jsonEngineRequest,
} from '../../../../../../src/server/engine-service'
import { loadSessionPayload } from '../../../../../../src/server/game-session'
import { engineErrorResponse, recoverWithSessionRefresh } from '../../../../../../src/server/route-error'

const recoverableActionCodes = new Set([
  'HAND_ALREADY_DECIDED',
  'NO_ACTIVE_HAND',
  'ACT_OUT_OF_TURN',
  'MATCH_ALREADY_DECIDED',
])

export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params
  const routeStart = Date.now()

  try {
    const ownerSubject = requireAnonymousSubject(request)
    const body = (await request.json()) as {
      action: Record<string, unknown>
    }

    await debugLogServer('actions.route.start', {
      matchId,
      action: body.action,
      elapsedSinceEntry: Date.now() - routeStart,
    })

    const engineStart = Date.now()
    await jsonEngineRequest(`/matches/${matchId}/actions`, {
      method: 'POST',
      headers: withAnonymousSubjectHeader(undefined, ownerSubject),
      json: body.action,
    })
    const engineElapsed = Date.now() - engineStart
    await debugLogServer('actions.route.engine.applied', {
      matchId,
      engineElapsedMs: engineElapsed,
    })

    const loadStart = Date.now()
    const payload = await loadSessionPayload(matchId, { ownerSubject })
    const loadElapsed = Date.now() - loadStart
    await debugLogServer('actions.route.session.loaded', {
      matchId,
      loadSessionPayloadMs: loadElapsed,
      totalRouteMs: Date.now() - routeStart,
    })

    return NextResponse.json(payload)
  } catch (error) {
    if (
      error instanceof EngineServiceRequestError &&
      recoverableActionCodes.has(error.code ?? '')
    ) {
      return recoverWithSessionRefresh(
        matchId,
        requireAnonymousSubject(request),
        'The game state moved on before that action landed, so the board was refreshed.',
        'Failed to refresh session after action race',
      )
    }

    return engineErrorResponse(error, 'Failed to apply action')
  }
}
