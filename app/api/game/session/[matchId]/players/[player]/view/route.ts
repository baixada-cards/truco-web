import { NextResponse } from 'next/server.js'

import {
  requireAnonymousSubject,
  withAnonymousSubjectHeader,
} from '../../../../../../../../src/server/anonymous-subject'
import { areDevRoutesEnabled, forbiddenPlayerViewResponse } from '../../../../../../../../src/server/dev-routes'
import { jsonEngineRequest } from '../../../../../../../../src/server/engine-service'
import { loadMatchMetadata } from '../../../../../../../../src/server/game-session'
import { engineErrorResponse } from '../../../../../../../../src/server/route-error'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ matchId: string; player: string }> },
) {
  try {
    const ownerSubject = requireAnonymousSubject(request)
    const { matchId, player } = await params

    if (!areDevRoutesEnabled()) {
      const requestedPlayer = Number(player)
      const metadata = await loadMatchMetadata(matchId, ownerSubject)
      if (requestedPlayer !== metadata.human_player) return forbiddenPlayerViewResponse()
    }

    const result = await jsonEngineRequest(
      `/matches/${matchId}/players/${player}/view`,
      {
        headers: withAnonymousSubjectHeader(undefined, ownerSubject),
      },
    )

    return NextResponse.json(result)
  } catch (error) {
    return engineErrorResponse(error, 'Failed to load player view')
  }
}
