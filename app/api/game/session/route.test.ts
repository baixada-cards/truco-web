import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { POST } from './route.ts'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('create session returns 429 payload when active match quota is exceeded', async () => {
  const fetchCalls: string[] = []

  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    fetchCalls.push(url)

    assert.match(url, /\/bot-matches$/)
    assert.equal(init?.method, 'POST')

    return jsonResponse(429, {
      code: 'SESSION_LIMIT_REACHED',
      message: 'too many active matches for this browser',
    })
  }

  const response = await POST(
    new Request('http://localhost/api/game/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ humanPlayer: 0, startingDealer: 1 }),
    }),
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
  assert.equal(fetchCalls.length, 1)
})

test('repeated create attempts return the route-level RATE_LIMITED payload', async () => {
  const ownerSubjects: string[] = []
  let createAttemptCount = 0

  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

    if (url.endsWith('/bot-matches')) {
      createAttemptCount += 1
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        human_player: 0 | 1
        owner_subject?: string
      }

      assert.ok(body.owner_subject)
      ownerSubjects.push(body.owner_subject)

      if (createAttemptCount === 1) {
        return jsonResponse(200, {
          match_id: 'match-1',
          human_player: body.human_player,
          bot_player: body.human_player === 0 ? 1 : 0,
          state: { id: 'match-1' },
          public_view: { id: 'match-1' },
        })
      }

      return jsonResponse(429, {
        code: 'RATE_LIMITED',
        message: 'too many matches created recently for this browser',
      })
    }

    if (url.endsWith('/matches/match-1/start-hand/random')) {
      return jsonResponse(200, { ok: true })
    }

    if (url.endsWith('/matches/match-1/public-view')) {
      return jsonResponse(200, { board: 'public' })
    }

    if (url.endsWith('/matches/match-1/players/0/view')) {
      return jsonResponse(200, { board: 'player' })
    }

    if (url.endsWith('/matches/match-1/legal-actions')) {
      return jsonResponse(200, [])
    }

    if (url.endsWith('/matches/match-1/meta')) {
      return jsonResponse(200, {
        human_player: 0,
        bot_player: 1,
      })
    }

    if (url.endsWith('/matches/match-1')) {
      return jsonResponse(200, { id: 'match-1' })
    }

    throw new Error(`Unexpected fetch: ${url}`)
  }

  const firstResponse = await POST(
    new Request('http://localhost/api/game/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ humanPlayer: 0, startingDealer: 1 }),
    }),
  )

  assert.equal(firstResponse.status, 200)
  const cookie = firstResponse.headers.get('set-cookie')
  assert.ok(cookie)

  const secondResponse = await POST(
    new Request('http://localhost/api/game/session', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({ humanPlayer: 1, startingDealer: 0 }),
    }),
  )

  assert.equal(secondResponse.status, 429)
  assert.deepEqual(await secondResponse.json(), {
    code: 'RATE_LIMITED',
    message: 'too many matches created recently for this browser',
    details: {
      code: 'RATE_LIMITED',
      message: 'too many matches created recently for this browser',
    },
  })
  assert.equal(createAttemptCount, 2)
  assert.equal(ownerSubjects.length, 2)
  assert.equal(ownerSubjects[1], ownerSubjects[0])
})

test('create session rejects unavailable LLM providers before creating a match', async () => {
  const fetchCalls: string[] = []

  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    fetchCalls.push(url)

    if (url.endsWith('/engine/llm-providers')) {
      assert.equal(init?.method, undefined)
      return jsonResponse(200, [
        {
          provider: 'openai',
          enabled: false,
          default_model: null,
          models: [],
          note: 'OpenAI credentials are not configured on this service.',
        },
      ])
    }

    throw new Error(`Unexpected fetch: ${url}`)
  }

  const response = await POST(
    new Request('http://localhost/api/game/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        humanPlayer: 0,
        startingDealer: 1,
        botKind: 'openai',
        botModel: 'gpt-4.1-mini',
      }),
    }),
  )

  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), {
    code: 'BOT_PROVIDER_UNAVAILABLE',
    message: 'OpenAI credentials are not configured on this service.',
    details: {
      provider: 'openai',
      requested_model: 'gpt-4.1-mini',
    },
  })
  assert.deepEqual(fetchCalls, ['http://127.0.0.1:4000/engine/llm-providers'])
})

test('create session requires an LLM model when a provider is selected', async () => {
  const fetchCalls: string[] = []

  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    fetchCalls.push(url)

    if (url.endsWith('/engine/llm-providers')) {
      assert.equal(init?.method, undefined)
      return jsonResponse(200, [
        {
          provider: 'anthropic',
          enabled: true,
          default_model: 'claude-3-5-haiku-latest',
          models: [
            { id: 'claude-3-5-haiku-latest' },
            { id: 'claude-3-7-sonnet-latest' },
          ],
          note: 'Anthropic is available.',
        },
      ])
    }

    throw new Error(`Unexpected fetch: ${url}`)
  }

  const response = await POST(
    new Request('http://localhost/api/game/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        humanPlayer: 0,
        startingDealer: 1,
        botKind: 'anthropic',
      }),
    }),
  )

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), {
    code: 'BOT_MODEL_REQUIRED',
    message: 'Choose an Anthropic model before starting a new match.',
    details: {
      provider: 'anthropic',
      requested_model: null,
    },
  })
  assert.deepEqual(fetchCalls, ['http://127.0.0.1:4000/engine/llm-providers'])
})

test('create session passes the selected LLM model through to the engine', async () => {
  const fetchCalls: string[] = []

  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    fetchCalls.push(url)

    if (url.endsWith('/engine/llm-providers')) {
      return jsonResponse(200, [
        {
          provider: 'openai',
          enabled: true,
          default_model: 'gpt-4.1-mini',
          models: [{ id: 'gpt-4.1-mini' }],
          note: 'OpenAI is available.',
        },
      ])
    }

    if (url.endsWith('/bot-matches')) {
      assert.equal(init?.method, 'POST')
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        human_player: 0 | 1
        bot_kind?: string
        bot_model?: string
      }

      assert.equal(body.bot_kind, 'openai')
      assert.equal(body.bot_model, 'gpt-4.1-mini')

      return jsonResponse(200, {
        match_id: 'match-openai-1',
        human_player: body.human_player,
        bot_player: body.human_player === 0 ? 1 : 0,
        state: { id: 'match-openai-1' },
        public_view: { id: 'match-openai-1' },
      })
    }

    if (url.endsWith('/matches/match-openai-1/start-hand/random')) {
      return jsonResponse(200, { ok: true })
    }

    if (url.endsWith('/matches/match-openai-1/public-view')) {
      return jsonResponse(200, { board: 'public' })
    }

    if (url.endsWith('/matches/match-openai-1/players/0/view')) {
      return jsonResponse(200, { board: 'player' })
    }

    if (url.endsWith('/matches/match-openai-1/legal-actions')) {
      return jsonResponse(200, [])
    }

    if (url.endsWith('/matches/match-openai-1/meta')) {
      return jsonResponse(200, {
        human_player: 0,
        bot_player: 1,
        bot_kind: 'openai',
        bot_model: 'gpt-4.1-mini',
      })
    }

    if (url.endsWith('/matches/match-openai-1')) {
      return jsonResponse(200, { id: 'match-openai-1' })
    }

    throw new Error(`Unexpected fetch: ${url}`)
  }

  const response = await POST(
    new Request('http://localhost/api/game/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        humanPlayer: 0,
        startingDealer: 1,
        botKind: 'openai',
        botModel: 'gpt-4.1-mini',
      }),
    }),
  )

  assert.equal(response.status, 200)
  assert.deepEqual(fetchCalls, [
    'http://127.0.0.1:4000/engine/llm-providers',
    'http://127.0.0.1:4000/bot-matches',
    'http://127.0.0.1:4000/matches/match-openai-1/start-hand/random',
    'http://127.0.0.1:4000/matches/match-openai-1/meta',
    'http://127.0.0.1:4000/matches/match-openai-1',
    'http://127.0.0.1:4000/matches/match-openai-1/public-view',
    'http://127.0.0.1:4000/matches/match-openai-1/players/0/view',
    'http://127.0.0.1:4000/matches/match-openai-1/legal-actions',
  ])
})

test('create session starts solver matches at 10-10 and everything else at 0-0', async () => {
  const scoresSent: Array<Record<string, number>> = []

  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

    if (url.endsWith('/bot-matches')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        human_player: 0 | 1
        score: Record<string, number>
      }
      scoresSent.push(body.score)
      const matchId = `match-${scoresSent.length}`
      return jsonResponse(200, {
        match_id: matchId,
        human_player: body.human_player,
        bot_player: body.human_player === 0 ? 1 : 0,
        state: { id: matchId },
        public_view: { id: matchId },
      })
    }

    if (/\/matches\/match-\d+\/start-hand\/random$/.test(url)) return jsonResponse(200, { ok: true })
    if (url.endsWith('/public-view')) return jsonResponse(200, { board: 'public' })
    if (url.endsWith('/players/0/view')) return jsonResponse(200, { board: 'player' })
    if (url.endsWith('/legal-actions')) return jsonResponse(200, [])
    if (url.endsWith('/meta')) return jsonResponse(200, { human_player: 0, bot_player: 1 })
    if (/\/matches\/match-\d+$/.test(url)) return jsonResponse(200, { id: 'match' })

    throw new Error(`Unexpected fetch: ${url}`)
  }

  const solverResponse = await POST(
    new Request('http://localhost/api/game/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ humanPlayer: 0, startingDealer: 1, botKind: 'solver' }),
    }),
  )
  assert.equal(solverResponse.status, 200)

  const heuristicResponse = await POST(
    new Request('http://localhost/api/game/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ humanPlayer: 0, startingDealer: 1, botKind: 'heuristic' }),
    }),
  )
  assert.equal(heuristicResponse.status, 200)

  assert.deepEqual(scoresSent, [
    { '0': 10, '1': 10 },
    { '0': 0, '1': 0 },
  ])
})

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  })
}
