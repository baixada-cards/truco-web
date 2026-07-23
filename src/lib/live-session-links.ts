import type { SessionPayload } from './session-api'

export type LiveSeat = 0 | 1

type LiveSessionStatusInput = {
  humanPlayer: LiveSeat
  publicView: Pick<SessionPayload['publicView'], 'winner' | 'hand_in_progress'>
}

export function buildLiveSessionPath(matchId: string) {
  const params = new URLSearchParams()
  params.set('match', matchId)
  return `/?${params.toString()}`
}

export function buildLiveSessionUrl(baseUrl: string | URL, matchId: string) {
  return new URL(buildLiveSessionPath(matchId), baseUrl).toString()
}

export function formatLivePerspective(player: LiveSeat) {
  void player
  return 'You'
}

export function abbreviateLiveMatchId(matchId: string, visible = 10) {
  if (matchId.length <= visible) return matchId
  return `${matchId.slice(0, visible)}…`
}

export function extractLiveMatchId(input: string) {
  const trimmed = input.trim()
  if (!trimmed) return null

  try {
    const url = new URL(trimmed, 'https://farol.local')
    const queryMatch = url.searchParams.get('match')?.trim()
    if (queryMatch) return queryMatch

    const routeMatch = url.pathname.match(/^\/m\/([^/?#]+)/)
    if (routeMatch?.[1]) {
      return decodeURIComponent(routeMatch[1])
    }
  } catch {
    // Fall through to raw-id parsing below.
  }

  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return trimmed
  }

  return null
}

export function describeLiveSessionStatus(session: LiveSessionStatusInput) {
  if (session.publicView.winner != null) {
    return session.publicView.winner === session.humanPlayer ? 'Match won' : 'Match lost'
  }

  if (session.publicView.hand_in_progress) {
    return 'Hand live'
  }

  return 'Awaiting next hand'
}
