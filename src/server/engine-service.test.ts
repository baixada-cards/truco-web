import assert from 'node:assert/strict'
import test from 'node:test'

import { jsonEngineRequest } from './engine-service.ts'

function fakeIdentityToken(expirySeconds: number) {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode({ exp: expirySeconds })}.signature`
}

test('engine requests remain unauthenticated when no Cloud Run audience is configured', async (t) => {
  const originalFetch = globalThis.fetch
  const originalAudience = process.env.TRUCO_ENGINE_SERVICE_AUDIENCE
  delete process.env.TRUCO_ENGINE_SERVICE_AUDIENCE

  t.after(() => {
    globalThis.fetch = originalFetch
    if (originalAudience === undefined) {
      delete process.env.TRUCO_ENGINE_SERVICE_AUDIENCE
    } else {
      process.env.TRUCO_ENGINE_SERVICE_AUDIENCE = originalAudience
    }
  })

  globalThis.fetch = async (_input, init) => {
    const headers = new Headers(init?.headers)
    assert.equal(headers.has('x-serverless-authorization'), false)
    return Response.json({ ok: true })
  }

  assert.deepEqual(await jsonEngineRequest('/health'), { ok: true })
})

test('engine requests obtain and attach a cached Cloud Run identity token', async (t) => {
  const originalFetch = globalThis.fetch
  const originalAudience = process.env.TRUCO_ENGINE_SERVICE_AUDIENCE
  const originalEndpoint =
    process.env.TRUCO_GOOGLE_METADATA_IDENTITY_ENDPOINT
  const audience = 'https://truco-server-test.us-west1.run.app'
  const token = fakeIdentityToken(Math.floor(Date.now() / 1000) + 3600)
  process.env.TRUCO_ENGINE_SERVICE_AUDIENCE = audience
  process.env.TRUCO_GOOGLE_METADATA_IDENTITY_ENDPOINT =
    'http://metadata.test/identity'

  t.after(() => {
    globalThis.fetch = originalFetch
    if (originalAudience === undefined) {
      delete process.env.TRUCO_ENGINE_SERVICE_AUDIENCE
    } else {
      process.env.TRUCO_ENGINE_SERVICE_AUDIENCE = originalAudience
    }
    if (originalEndpoint === undefined) {
      delete process.env.TRUCO_GOOGLE_METADATA_IDENTITY_ENDPOINT
    } else {
      process.env.TRUCO_GOOGLE_METADATA_IDENTITY_ENDPOINT = originalEndpoint
    }
  })

  let metadataRequests = 0
  let engineRequests = 0
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    if (url.startsWith('http://metadata.test/identity')) {
      metadataRequests += 1
      assert.equal(new URL(url).searchParams.get('audience'), audience)
      assert.equal(headers.get('metadata-flavor'), 'Google')
      return new Response(token)
    }

    engineRequests += 1
    assert.equal(
      headers.get('x-serverless-authorization'),
      `Bearer ${token}`,
    )
    return Response.json({ ok: true })
  }

  await jsonEngineRequest('/health')
  await jsonEngineRequest('/health')
  assert.equal(metadataRequests, 1)
  assert.equal(engineRequests, 2)
})
