import { NextResponse } from 'next/server.js'

type DevRouteEnv = {
  NODE_ENV?: string
  NEXT_PUBLIC_SHOW_DEV_CONTROLS?: string
  TRUCO_ENABLE_DEV_ROUTES?: string
}

function flagEnabled(value: string | undefined) {
  if (value == null || value === '') return null
  return value === 'true'
}

export function areDevRoutesEnabled(env: DevRouteEnv = process.env) {
  if (env.NODE_ENV === 'production') return false

  const serverOverride = flagEnabled(env.TRUCO_ENABLE_DEV_ROUTES)
  if (serverOverride != null) return serverOverride

  const panelOverride = flagEnabled(env.NEXT_PUBLIC_SHOW_DEV_CONTROLS)
  if (panelOverride != null) return panelOverride

  return true
}

export function disabledDevRouteResponse() {
  return NextResponse.json(
    {
      code: 'NOT_FOUND',
      message: 'not found',
    },
    { status: 404 },
  )
}

export function forbiddenPlayerViewResponse() {
  return NextResponse.json(
    {
      code: 'MATCH_FORBIDDEN',
      message: 'player view is not available',
    },
    { status: 403 },
  )
}
