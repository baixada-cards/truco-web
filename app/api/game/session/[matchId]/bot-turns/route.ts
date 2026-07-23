import { NextResponse } from 'next/server.js'

import {
  requireAnonymousSubject,
  withAnonymousSubjectHeader,
} from '../../../../../../src/server/anonymous-subject'
import { jsonEngineRequest } from '../../../../../../src/server/engine-service'
import { loadSessionPayload } from '../../../../../../src/server/game-session'
import { engineErrorResponse } from '../../../../../../src/server/route-error'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params

  try {
    const ownerSubject = requireAnonymousSubject(request)
    await request.json().catch(() => ({}))

    await jsonEngineRequest(`/matches/${matchId}/bot-turns`, {
      method: 'POST',
      headers: withAnonymousSubjectHeader(undefined, ownerSubject),
    })

    return NextResponse.json(
      await loadSessionPayload(matchId, { ownerSubject }),
    )
  } catch (error) {
    return engineErrorResponse(error, 'Failed to advance bot turns')
  }
}
