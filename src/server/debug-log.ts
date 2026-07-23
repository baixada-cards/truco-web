import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'

const LOG_FILENAME = 'debug-timing.log'

function isEnabled() {
  return process.env.NEXT_PUBLIC_DEBUG_TIMING === '1' || process.env.DEBUG_TIMING === '1'
}

export function debugTimingEnabled(): boolean {
  return isEnabled()
}

export async function debugLogServer(
  event: string,
  data?: Record<string, unknown>,
): Promise<number> {
  const timestamp = Date.now()
  if (!isEnabled()) return timestamp

  const line = JSON.stringify({
    origin: 'server',
    t: timestamp,
    iso: new Date(timestamp).toISOString(),
    event,
    data: data ?? null,
  })

  try {
    await appendFile(join(process.cwd(), LOG_FILENAME), `${line}\n`, 'utf8')
  } catch {
    // Swallow logging errors so instrumentation never breaks gameplay.
  }

  return timestamp
}
