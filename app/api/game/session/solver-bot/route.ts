import { NextResponse } from 'next/server.js'

import { jsonEngineRequest } from '../../../../../src/server/engine-service'
import { engineErrorResponse } from '../../../../../src/server/route-error'

// Availability of the solved-strategy opponent: whether the engine service has
// policy artifacts mounted (SOLVER_POLICY_DIR) and how many profiles they hold.
// The launcher gates the "solver" opponent option on `enabled`.
export async function GET() {
  try {
    const status = await jsonEngineRequest('/engine/solver-bot')
    return NextResponse.json(status)
  } catch (error) {
    return engineErrorResponse(error, 'Failed to load solver-bot status')
  }
}
