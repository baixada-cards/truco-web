import { NextResponse } from 'next/server.js'

import { jsonEngineRequest } from '../../../../../src/server/engine-service'
import { engineErrorResponse } from '../../../../../src/server/route-error'

export async function GET() {
  try {
    const providers = await jsonEngineRequest('/engine/llm-providers')
    return NextResponse.json(providers)
  } catch (error) {
    return engineErrorResponse(error, 'Failed to load LLM providers')
  }
}
