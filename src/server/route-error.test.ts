import assert from 'node:assert/strict'
import test from 'node:test'

import { EngineServiceRequestError } from './engine-service.ts'
import { engineErrorResponse } from './route-error.ts'

test('engineErrorResponse preserves 429 quota error payload details', async () => {
  const response = engineErrorResponse(
    new EngineServiceRequestError(
      429,
      'too many active matches for this browser',
      'SESSION_LIMIT_REACHED',
      {
        code: 'SESSION_LIMIT_REACHED',
        message: 'too many active matches for this browser',
      },
    ),
    'Failed to create session',
  )

  assert.equal(response.status, 429)
  assert.deepEqual(await response.json(), {
    code: 'SESSION_LIMIT_REACHED',
    message: 'too many active matches for this browser',
    details: {
      code: 'SESSION_LIMIT_REACHED',
      message: 'too many active matches for this browser',
    },
  })
})
