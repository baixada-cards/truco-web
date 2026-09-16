import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, afterEach, before, test } from 'node:test'

import { DELETE, GET, PATCH, POST } from './route.ts'

const BASE = 'http://localhost/api/dev/guide-comments'

// the route resolves its store out of the working directory, so the test
// gives it a throwaway one rather than writing into the repository
let directory = ''
let store = ''
let original = ''

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'guide-comments-'))
  await mkdir(path.join(directory, 'src', 'guide', 'review'), { recursive: true })
  store = path.join(directory, 'src', 'guide', 'review', 'comments.json')
  original = process.cwd()
  process.chdir(directory)
})

after(async () => {
  if (original) process.chdir(original)
  if (directory) await rm(directory, { recursive: true, force: true })
})

afterEach(async () => {
  delete process.env.TRUCO_ENABLE_DEV_ROUTES
  await rm(store, { force: true })
})

function post(body: unknown) {
  return POST(
    new Request(BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

function patch(body: unknown) {
  return PATCH(
    new Request(BASE, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

async function storedText() {
  return readFile(store, 'utf8')
}

test('every method 404s when dev routes are disabled', async () => {
  process.env.TRUCO_ENABLE_DEV_ROUTES = 'false'

  const responses = [
    await GET(new Request(`${BASE}?locale=en`)),
    await post({ locale: 'en', key: 'sec.method.p1', body: 'no' }),
    await patch({ id: 'whatever', resolved: true }),
    await DELETE(new Request(`${BASE}?id=whatever`)),
  ]

  for (const response of responses) {
    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { code: 'NOT_FOUND', message: 'not found' })
  }
})

test('a comment round-trips through the store file', async () => {
  const created = await post({
    locale: 'en',
    key: 'sec.method.p1',
    quote: 'the words it is reaching for',
    body: '  this claims more than the chart shows  ',
  })
  assert.equal(created.status, 200)
  const { comment } = (await created.json()) as {
    comment: { id: string; body: string; quote: string; resolved: boolean; createdAt: string }
  }
  assert.equal(comment.body, 'this claims more than the chart shows')
  assert.equal(comment.quote, 'the words it is reaching for')
  assert.equal(comment.resolved, false)
  assert.match(comment.createdAt, /^\d{4}-\d{2}-\d{2}T/)

  // 2-space indented, one trailing newline, so the file stays diff-friendly
  const text = await storedText()
  assert.ok(text.endsWith('\n'))
  assert.ok(text.includes('\n  {\n    "id": '))
  assert.deepEqual(JSON.parse(text), [comment])

  const listed = await GET(new Request(`${BASE}?locale=en`))
  assert.deepEqual((await listed.json()) as unknown, { locale: 'en', comments: [comment] })

  const other = await GET(new Request(`${BASE}?locale=es`))
  assert.deepEqual((await other.json()) as unknown, { locale: 'es', comments: [] })

  const edited = await patch({ id: comment.id, body: 'sharper now', resolved: true })
  assert.equal(edited.status, 200)
  assert.deepEqual(JSON.parse(await storedText()), [
    { ...comment, body: 'sharper now', resolved: true },
  ])

  const dropped = await DELETE(new Request(`${BASE}?id=${comment.id}`))
  assert.equal(dropped.status, 200)
  assert.deepEqual(JSON.parse(await storedText()), [])
})

test('the store stays sorted by creation time', async () => {
  const keys = ['sec.method.p1', 'sec.method.p2', 'sec.method.p3']
  for (const key of keys) {
    const response = await post({ locale: 'en', key, body: `note on ${key}` })
    assert.equal(response.status, 200)
  }

  const stored = JSON.parse(await storedText()) as Array<{ createdAt: string; key: string }>
  assert.equal(stored.length, 3)
  const times = stored.map((one) => one.createdAt)
  assert.deepEqual(times, [...times].sort())
})

test('malformed input is rejected before anything is written', async () => {
  const cases: Array<[unknown, string]> = [
    [{ locale: 'de', key: 'sec.method.p1', body: 'hi' }, 'BAD_LOCALE'],
    [{ locale: 'en', key: 'sec method p1', body: 'hi' }, 'BAD_KEY'],
    [{ locale: 'en', key: 'sec.method.p1', body: '   ' }, 'BAD_BODY'],
    [{ locale: 'en', key: 'sec.method.p1', body: 'hi', quote: 7 }, 'BAD_QUOTE'],
  ]

  for (const [body, code] of cases) {
    const response = await post(body)
    assert.equal(response.status, 400)
    assert.equal(((await response.json()) as { code: string }).code, code)
  }

  const missing = await patch({ id: 'c20260101T0000-aaaa', resolved: true })
  assert.equal(missing.status, 404)
  assert.equal(((await missing.json()) as { code: string }).code, 'UNKNOWN_COMMENT')

  const gone = await DELETE(new Request(`${BASE}?id=c20260101T0000-aaaa`))
  assert.equal(gone.status, 404)
})
