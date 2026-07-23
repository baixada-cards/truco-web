import { NextResponse } from 'next/server.js'
import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'

const LOG_FILENAME = 'debug-timing.log'

function isEnabled() {
  return process.env.NEXT_PUBLIC_DEBUG_TIMING === '1' || process.env.DEBUG_TIMING === '1'
}

function logPath() {
  return join(process.cwd(), LOG_FILENAME)
}

export async function POST(request: Request) {
  if (!isEnabled()) {
    return NextResponse.json({ ok: false, reason: 'disabled' }, { status: 404 })
  }

  try {
    const payload = await request.json()
    const line = JSON.stringify({ origin: 'client', ...payload })
    await appendFile(logPath(), `${line}\n`, 'utf8')
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'unknown' },
      { status: 500 },
    )
  }
}

export async function GET() {
  if (!isEnabled()) {
    return NextResponse.json({ ok: false, reason: 'disabled' }, { status: 404 })
  }
  return NextResponse.json({ ok: true, path: logPath() })
}
