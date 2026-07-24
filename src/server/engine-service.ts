import { debugLogServer, debugTimingEnabled } from './debug-log.ts'

const engineServiceUrl =
  process.env.TRUCO_ENGINE_SERVICE_URL ?? 'http://127.0.0.1:4000'
const metadataIdentityEndpoint =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity'

let cachedIdentity:
  | {
      audience: string
      token: string
      expiresAtMs: number
    }
  | undefined

export function getEngineServiceUrl() {
  return engineServiceUrl
}

type EngineRequestInit = RequestInit & {
  json?: unknown
}

function decodeJwtExpiryMs(token: string) {
  const payload = token.split('.')[1]
  if (!payload) return 0

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as { exp?: unknown }
    return typeof parsed.exp === 'number' ? parsed.exp * 1000 : 0
  } catch {
    return 0
  }
}

async function cloudRunIdentityToken() {
  const audience = process.env.TRUCO_ENGINE_SERVICE_AUDIENCE?.trim()
  if (!audience) return undefined

  const now = Date.now()
  if (
    cachedIdentity?.audience === audience &&
    cachedIdentity.expiresAtMs > now + 60_000
  ) {
    return cachedIdentity.token
  }

  const endpoint = new URL(
    process.env.TRUCO_GOOGLE_METADATA_IDENTITY_ENDPOINT ??
      metadataIdentityEndpoint,
  )
  endpoint.searchParams.set('audience', audience)

  const response = await fetch(endpoint, {
    headers: {
      'Metadata-Flavor': 'Google',
    },
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok) {
    throw new Error(
      `Cloud Run identity token request failed (${response.status})`,
    )
  }

  const token = (await response.text()).trim()
  const expiresAtMs = decodeJwtExpiryMs(token)
  if (!token || expiresAtMs <= now) {
    throw new Error('Cloud Run identity token response was invalid')
  }

  cachedIdentity = {
    audience,
    token,
    expiresAtMs,
  }
  return token
}

export class EngineServiceRequestError extends Error {
  status: number
  code?: string
  details?: Record<string, unknown>

  constructor(
    status: number,
    message: string,
    code?: string,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'EngineServiceRequestError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export async function jsonEngineRequest<T = unknown>(
  path: string,
  init: EngineRequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json')
  }

  let response: Response

  const timingEnabled = debugTimingEnabled()
  const method = init.method ?? (init.json !== undefined || init.body !== undefined ? 'POST' : 'GET')
  const fetchStart = Date.now()

  try {
    const identityToken = await cloudRunIdentityToken()
    if (identityToken && !headers.has('x-serverless-authorization')) {
      headers.set(
        'x-serverless-authorization',
        `Bearer ${identityToken}`,
      )
    }

    response = await fetch(`${engineServiceUrl}${path}`, {
      ...init,
      headers,
      body: init.json === undefined ? init.body : JSON.stringify(init.json),
      cache: 'no-store',
    })
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError'
    if (timingEnabled) {
      await debugLogServer('engine.fetch.error', {
        path,
        method,
        fetchElapsedMs: Date.now() - fetchStart,
        isTimeout,
      })
    }
    throw new EngineServiceRequestError(
      isTimeout ? 504 : 503,
      isTimeout
        ? 'Engine service timed out.'
        : 'Engine service is temporarily unavailable.',
      isTimeout ? 'ENGINE_TIMEOUT' : 'ENGINE_UNAVAILABLE',
      error instanceof Error ? { cause: error.message } : undefined,
    )
  }

  const fetchElapsed = Date.now() - fetchStart
  const parseStart = Date.now()

  const data = (await response.json().catch(() => null)) as
    | { code?: string; message?: string }
    | T
    | null

  if (timingEnabled) {
    await debugLogServer('engine.fetch.done', {
      path,
      method,
      status: response.status,
      fetchElapsedMs: fetchElapsed,
      parseElapsedMs: Date.now() - parseStart,
    })
  }

  if (!response.ok) {
    const code =
      data && typeof data === 'object' && 'code' in data && typeof data.code === 'string'
        ? data.code
        : undefined
    const message =
      data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
        ? data.message
        : `Engine request failed (${response.status})`
    const details =
      data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined
    throw new EngineServiceRequestError(response.status, message, code, details)
  }

  return data as T
}
