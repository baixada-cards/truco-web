// Dev-only review comments on the field guide. The author reads the guide on
// a local dev server and leaves comments on paragraphs; they are stored in
// src/guide/review/comments.json, a plain sorted JSON array, so that a coding
// agent can read the file later and act on them. See
// src/guide/review-comment.ts for the record shape.
//
//   GET     ?locale=en                          every comment for a locale
//   POST    {locale, key, quote?, body}         create one, returns it
//   PATCH   {id, body?, resolved?}              edit the body or resolve it
//   DELETE  ?id=…                               drop one
//
// Disabled whenever dev routes are, which means always in production: see
// src/server/dev-routes.ts. Nothing here is reachable from a prod build.

import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { NextResponse } from 'next/server.js'

import type { GuideReviewComment } from '../../../../src/guide/review-comment.ts'
import {
  areDevRoutesEnabled,
  disabledDevRouteResponse,
} from '../../../../src/server/dev-routes.ts'

export const dynamic = 'force-dynamic'

const LOCALES = ['en', 'pt-BR', 'es'] as const
type Locale = (typeof LOCALES)[number]

const MAX_BODY = 4000
const MAX_QUOTE = 1000

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * Resolved at call time, and only ever out of the working directory: a path
 * the build cannot trace statically makes Turbopack trace the whole project
 * into the standalone output. The route test runs from a temp directory
 * rather than redirecting this.
 */
function commentsPath() {
  return path.join(process.cwd(), 'src', 'guide', 'review', 'comments.json')
}

function badRequest(code: string, message: string, status = 400) {
  return NextResponse.json({ code, message }, { status })
}

async function readComments(): Promise<GuideReviewComment[]> {
  let raw: string
  try {
    raw = await readFile(commentsPath(), 'utf8')
  } catch {
    return [] // a missing store is simply an empty one
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as GuideReviewComment[]) : []
  } catch {
    return []
  }
}

/** oldest first, ties broken by id so the file never churns on rewrite */
function sortComments(comments: GuideReviewComment[]) {
  return [...comments].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  )
}

async function writeComments(comments: GuideReviewComment[]) {
  await writeFile(commentsPath(), `${JSON.stringify(sortComments(comments), null, 2)}\n`, 'utf8')
}

/** sortable and readable: the minute it was left, plus four random hex */
function newId(createdAt: string) {
  return `c${createdAt.slice(0, 16).replace(/[-:]/g, '')}-${randomUUID().slice(0, 4)}`
}

function normalize(text: string) {
  return text.replace(/\r\n/g, '\n').trim()
}

export async function GET(request: Request) {
  if (!areDevRoutesEnabled()) return disabledDevRouteResponse()

  const locale = new URL(request.url).searchParams.get('locale')
  const comments = sortComments(await readComments())
  if (locale == null) return NextResponse.json({ comments })
  if (!isLocale(locale)) return badRequest('BAD_LOCALE', 'unknown locale')

  return NextResponse.json({ locale, comments: comments.filter((one) => one.locale === locale) })
}

export async function POST(request: Request) {
  if (!areDevRoutesEnabled()) return disabledDevRouteResponse()

  const input = (await request.json().catch(() => null)) as {
    locale?: unknown
    key?: unknown
    quote?: unknown
    body?: unknown
  } | null
  if (!input) return badRequest('BAD_REQUEST', 'expected a JSON body')
  if (!isLocale(input.locale)) return badRequest('BAD_LOCALE', 'unknown locale')
  if (typeof input.key !== 'string' || !/^[\w-]+(\.[\w-]+)*$/.test(input.key)) {
    return badRequest('BAD_KEY', 'malformed key')
  }
  if (typeof input.body !== 'string' || normalize(input.body) === '') {
    return badRequest('BAD_BODY', 'a comment needs a body')
  }
  if (input.quote != null && typeof input.quote !== 'string') {
    return badRequest('BAD_QUOTE', 'quote must be a string')
  }

  const createdAt = new Date().toISOString()
  const comment: GuideReviewComment = {
    id: newId(createdAt),
    locale: input.locale,
    key: input.key,
    quote: normalize(String(input.quote ?? '')).slice(0, MAX_QUOTE),
    body: normalize(input.body).slice(0, MAX_BODY),
    createdAt,
    resolved: false,
  }

  const comments = await readComments()
  comments.push(comment)
  await writeComments(comments)

  return NextResponse.json({ comment })
}

export async function PATCH(request: Request) {
  if (!areDevRoutesEnabled()) return disabledDevRouteResponse()

  const input = (await request.json().catch(() => null)) as {
    id?: unknown
    body?: unknown
    resolved?: unknown
  } | null
  if (!input) return badRequest('BAD_REQUEST', 'expected a JSON body')
  if (typeof input.id !== 'string' || input.id === '') return badRequest('BAD_ID', 'id is required')
  if (input.body != null && typeof input.body !== 'string') {
    return badRequest('BAD_BODY', 'body must be a string')
  }
  if (input.resolved != null && typeof input.resolved !== 'boolean') {
    return badRequest('BAD_RESOLVED', 'resolved must be a boolean')
  }
  if (input.body == null && input.resolved == null) {
    return badRequest('BAD_REQUEST', 'nothing to update')
  }

  const comments = await readComments()
  const found = comments.find((one) => one.id === input.id)
  if (!found) return badRequest('UNKNOWN_COMMENT', `no such comment: ${input.id}`, 404)

  if (typeof input.body === 'string') {
    const body = normalize(input.body)
    if (body === '') return badRequest('BAD_BODY', 'a comment needs a body')
    found.body = body.slice(0, MAX_BODY)
  }
  if (typeof input.resolved === 'boolean') found.resolved = input.resolved

  await writeComments(comments)

  return NextResponse.json({ comment: found })
}

export async function DELETE(request: Request) {
  if (!areDevRoutesEnabled()) return disabledDevRouteResponse()

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return badRequest('BAD_ID', 'id is required')

  const comments = await readComments()
  const kept = comments.filter((one) => one.id !== id)
  if (kept.length === comments.length) {
    return badRequest('UNKNOWN_COMMENT', `no such comment: ${id}`, 404)
  }
  await writeComments(kept)

  return NextResponse.json({ id, deleted: true })
}
