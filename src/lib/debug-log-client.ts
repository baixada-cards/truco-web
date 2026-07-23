const DEBUG_FLAG_STORAGE_KEY = 'truco:debug-timing'

function envFlagEnabled(): boolean {
  if (typeof process === 'undefined') return false
  return process.env.NEXT_PUBLIC_DEBUG_TIMING === '1'
}

function storageFlagEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(DEBUG_FLAG_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function isEnabled(): boolean {
  return envFlagEnabled() || storageFlagEnabled()
}

export function debugTimingEnabled(): boolean {
  return isEnabled()
}

type LogPayload = Record<string, unknown> | undefined

function formatEntry(event: string, data: LogPayload) {
  return {
    t: Date.now(),
    iso: new Date().toISOString(),
    event,
    data: data ?? null,
  }
}

export function debugLog(event: string, data?: LogPayload): number {
  const timestamp = Date.now()
  if (!isEnabled()) return timestamp

  const entry = formatEntry(event, data)

  if (typeof window === 'undefined') {
    console.log('[debug-timing]', JSON.stringify(entry))
    return timestamp
  }

  try {
    fetch('/api/debug-log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(entry),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Swallow logging errors so instrumentation never breaks gameplay.
  }

  return timestamp
}
