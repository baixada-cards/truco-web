import { NextResponse } from 'next/server.js'

import {
  requireAnonymousSubject,
  withAnonymousSubjectHeader,
} from '../../../../../../src/server/anonymous-subject'
import { areDevRoutesEnabled, disabledDevRouteResponse } from '../../../../../../src/server/dev-routes'
import { jsonEngineRequest } from '../../../../../../src/server/engine-service'
import { engineErrorResponse } from '../../../../../../src/server/route-error'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  try {
    if (!areDevRoutesEnabled()) return disabledDevRouteResponse()

    const ownerSubject = requireAnonymousSubject(request)
    const { matchId } = await params
    const body = (await request.json()) as { action: unknown }

    const result = await jsonEngineRequest(`/matches/${matchId}/bot-override`, {
      method: 'PUT',
      headers: withAnonymousSubjectHeader(undefined, ownerSubject),
      json: body,
    })

    return NextResponse.json(result)
  } catch (error) {
    return engineErrorResponse(error, 'Failed to set bot override')
  }
}
