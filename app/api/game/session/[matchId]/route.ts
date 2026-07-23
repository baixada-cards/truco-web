import { NextResponse } from 'next/server.js'

import { requireAnonymousSubject } from '../../../../../src/server/anonymous-subject'
import { loadSessionPayload } from '../../../../../src/server/game-session'
import { engineErrorResponse } from '../../../../../src/server/route-error'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  try {
    const ownerSubject = requireAnonymousSubject(request)
    const { matchId } = await params

    return NextResponse.json(
      await loadSessionPayload(matchId, { ownerSubject }),
    )
  } catch (error) {
    return engineErrorResponse(error, 'Failed to load session')
  }
}
