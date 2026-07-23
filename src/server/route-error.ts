import { NextResponse } from 'next/server.js'

import { MatchAuthorizationError } from './anonymous-subject.ts'
import { EngineServiceRequestError } from './engine-service.ts'
import { loadSessionPayload } from './game-session.ts'

export function engineErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof MatchAuthorizationError) {
    return NextResponse.json(
      {
        code: error.code,
        message: error.message,
      },
      { status: error.status },
    )
  }

  if (error instanceof EngineServiceRequestError) {
    return NextResponse.json(
      {
        code: error.code,
        message: error.message,
        details: error.details,
      },
      { status: error.status },
    )
  }

  return NextResponse.json(
    { code: 'BFF_ERROR', message: error instanceof Error ? error.message : fallbackMessage },
    { status: 500 },
  )
}

export async function recoverWithSessionRefresh(
  matchId: string,
  ownerSubject: string,
  notice: string,
  fallbackMessage: string,
): Promise<NextResponse> {
  try {
    return NextResponse.json(
      await loadSessionPayload(matchId, { notice, ownerSubject }),
    )
  } catch (refreshError) {
    return engineErrorResponse(refreshError, fallbackMessage)
  }
}
