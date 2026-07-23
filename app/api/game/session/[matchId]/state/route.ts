import { NextResponse } from 'next/server.js'

import {
  requireAnonymousSubject,
  withAnonymousSubjectHeader,
} from '../../../../../../src/server/anonymous-subject'
import { areDevRoutesEnabled, disabledDevRouteResponse } from '../../../../../../src/server/dev-routes'
import { jsonEngineRequest } from '../../../../../../src/server/engine-service'
import { loadSessionPayload } from '../../../../../../src/server/game-session'
import { engineErrorResponse } from '../../../../../../src/server/route-error'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  try {
    if (!areDevRoutesEnabled()) return disabledDevRouteResponse()

    const ownerSubject = requireAnonymousSubject(request)
    const { matchId } = await params
    const body = (await request.json()) as {
      state: unknown
    }

    await jsonEngineRequest(`/matches/${matchId}`, {
      method: 'PUT',
      headers: withAnonymousSubjectHeader(undefined, ownerSubject),
      json: body.state,
    })

    return NextResponse.json(
      await loadSessionPayload(matchId, {
        notice: 'Loaded the exact match state into the hosted session.',
        ownerSubject,
      }),
    )
  } catch (error) {
    return engineErrorResponse(error, 'Failed to replace session state')
  }
}
