import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server.js'

const LIVE_SUBJECT_COOKIE_NAME = 'truco_live_subject'
const LIVE_SUBJECT_COOKIE_VERSION = 'v1'
const LIVE_SUBJECT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

// The no-env fallback secret must be shared process-wide, not per module
// instance: the dev server bundles routes separately, and a cookie signed by
// one route's instance must verify in another's (a per-instance secret made
// one route's session cookies read as forbidden everywhere else). Prod should
// still set TRUCO_ANON_COOKIE_SECRET; the fallback cannot survive restarts or
// span replicas.
const FALLBACK_SECRET_KEY = '__truco_live_subject_fallback_secret__'
const globalStore = globalThis as Record<string, unknown>
if (typeof globalStore[FALLBACK_SECRET_KEY] !== 'string') {
  globalStore[FALLBACK_SECRET_KEY] = randomBytes(32).toString('hex')
}
const fallbackLiveSubjectSecret = globalStore[FALLBACK_SECRET_KEY] as string

export const LIVE_SUBJECT_HEADER = 'x-truco-anonymous-subject'

export class MatchAuthorizationError extends Error {
  status: number
  code: string

  constructor(message = 'This browser is not allowed to access that live match.') {
    super(message)
    this.name = 'MatchAuthorizationError'
    this.status = 403
    this.code = 'MATCH_FORBIDDEN'
  }
}

export function resolveAnonymousSubject(request: Request) {
  const existingSubject = readVerifiedAnonymousSubject(request)
  if (existingSubject) {
    return {
      subject: existingSubject,
      isFresh: false,
    }
  }

  return {
    subject: generateAnonymousSubject(),
    isFresh: true,
  }
}

export function requireAnonymousSubject(request: Request) {
  const subject = readVerifiedAnonymousSubject(request)
  if (!subject) {
    throw new MatchAuthorizationError()
  }

  return subject
}

export function setAnonymousSubjectCookie(response: NextResponse, subject: string) {
  response.cookies.set({
    name: LIVE_SUBJECT_COOKIE_NAME,
    value: encodeSignedSubject(subject),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: LIVE_SUBJECT_COOKIE_MAX_AGE_SECONDS,
  })
}

export function withAnonymousSubjectHeader(
  headers: HeadersInit | undefined,
  subject: string,
) {
  const nextHeaders = new Headers(headers)
  nextHeaders.set(LIVE_SUBJECT_HEADER, subject)
  return nextHeaders
}

function readVerifiedAnonymousSubject(request: Request) {
  const rawCookie = readCookie(request.headers.get('cookie'), LIVE_SUBJECT_COOKIE_NAME)
  if (!rawCookie) return null

  return decodeSignedSubject(rawCookie)
}

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null

  for (const entry of cookieHeader.split(';')) {
    const separatorIndex = entry.indexOf('=')
    if (separatorIndex === -1) continue

    const cookieName = entry.slice(0, separatorIndex).trim()
    if (cookieName !== name) continue

    const cookieValue = entry.slice(separatorIndex + 1).trim()
    try {
      return decodeURIComponent(cookieValue)
    } catch {
      return cookieValue
    }
  }

  return null
}

function generateAnonymousSubject() {
  return randomBytes(16).toString('hex')
}

function encodeSignedSubject(subject: string) {
  return [
    LIVE_SUBJECT_COOKIE_VERSION,
    subject,
    signAnonymousSubject(subject),
  ].join('.')
}

function decodeSignedSubject(value: string) {
  const [version, subject, signature, ...rest] = value.split('.')
  if (rest.length > 0) return null
  if (version !== LIVE_SUBJECT_COOKIE_VERSION) return null
  if (!isAnonymousSubject(subject) || typeof signature !== 'string' || signature.length === 0) {
    return null
  }

  const expectedSignature = signAnonymousSubject(subject)
  const actualSignatureBuffer = Buffer.from(signature)
  const expectedSignatureBuffer = Buffer.from(expectedSignature)
  if (actualSignatureBuffer.length !== expectedSignatureBuffer.length) {
    return null
  }
  if (!timingSafeEqual(actualSignatureBuffer, expectedSignatureBuffer)) {
    return null
  }

  return subject
}

function signAnonymousSubject(subject: string) {
  return createHmac('sha256', getLiveSubjectSecret())
    .update(`${LIVE_SUBJECT_COOKIE_VERSION}:${subject}`)
    .digest('base64url')
}

function getLiveSubjectSecret() {
  return (
    process.env.TRUCO_ANON_COOKIE_SECRET ??
    process.env.TRUCO_LIVE_COOKIE_SECRET ??
    fallbackLiveSubjectSecret
  )
}

function isAnonymousSubject(value: string | undefined): value is string {
  return typeof value === 'string' && /^[a-f0-9]{32}$/u.test(value)
}
