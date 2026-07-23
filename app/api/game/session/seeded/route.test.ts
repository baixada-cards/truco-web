import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { POST } from './route.ts'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('seeded session forwards snake_case fields to the engine and skips start-hand', async () => {
  const fetchCalls: string[] = []

  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    fetchCalls.push(url)

    if (url.endsWith('/bot-matches/seeded')) {
      assert.equal(init?.method, 'POST')
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        human_player: 0 | 1
        score: Record<string, number>
        dealer: 0 | 1
        vira_rank: string
        hero_hand: number[]
        villain_hand: number[] | null
        history: Array<{ seat: 0 | 1; kind: string; class?: number; to?: number }>
        owner_subject?: string
      }

      assert.deepEqual(body.hero_hand, [1, 2, 3])
      assert.equal(body.vira_rank, '5')
      assert.deepEqual(body.score, { '0': 2, '1': 4 })
      assert.deepEqual(body.history, [{ seat: 0, kind: 'play_face_up', class: 7 }])
      assert.ok(body.owner_subject)

      return jsonResponse(200, {
        match_id: 'match-seeded-1',
        human_player: body.human_player,
        bot_player: body.human_player === 0 ? 1 : 0,
        state: { id: 'match-seeded-1' },
        public_view: { id: 'match-seeded-1' },
        villain_sampling: 'posterior',
      })
    }

    if (url.endsWith('/matches/match-seeded-1/meta')) {
      return jsonResponse(200, { human_player: 0, bot_player: 1 })
    }

    if (url.endsWith('/matches/match-seeded-1')) {
      return jsonResponse(200, { id: 'match-seeded-1' })
    }

    if (url.endsWith('/matches/match-seeded-1/public-view')) {
      return jsonResponse(200, { board: 'public' })
    }

    if (url.endsWith('/matches/match-seeded-1/players/0/view')) {
      return jsonResponse(200, { board: 'player' })
    }

    if (url.endsWith('/matches/match-seeded-1/legal-actions')) {
      return jsonResponse(200, [])
    }

    throw new Error(`Unexpected fetch: ${url}`)
  }

  const response = await POST(
    new Request('http://localhost/api/game/session/seeded', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        humanPlayer: 0,
        score: { '0': 2, '1': 4 },
        dealer: 1,
        viraRank: '5',
        heroHand: [1, 2, 3],
        villainHand: null,
        history: [{ seat: 0, kind: 'play_face_up', class: 7 }],
        botKind: 'heuristic',
        seed: 42,
      }),
    }),
  )

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json().then((payload) => payload.villainSampling), 'posterior')
  assert.ok(!fetchCalls.some((url) => url.includes('/start-hand')))
})

test('seeded session rejects a heroHand that is not exactly 3 cards', async () => {
  const fetchCalls: string[] = []

  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    fetchCalls.push(url)
    throw new Error(`Unexpected fetch: ${url}`)
  }

  const response = await POST(
    new Request('http://localhost/api/game/session/seeded', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        score: { '0': 0, '1': 0 },
        dealer: 0,
        viraRank: '5',
        heroHand: [1, 2],
      }),
    }),
  )

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), {
    code: 'INVALID_SEED',
    message: 'heroHand, when given, must be an array of exactly 3 numbers.',
  })
  assert.equal(fetchCalls.length, 0)
})

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  })
}
