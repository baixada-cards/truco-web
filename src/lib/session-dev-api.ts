import {
  engineFetch,
  type PlayerSessionView,
  type SessionBotOverride,
  type SessionPayload,
} from './session-api'

export async function replaceSessionState(
  matchId: string,
  state: unknown,
) {
  return engineFetch<SessionPayload>(`/${matchId}/state`, {
    method: 'PUT',
    json: { state },
  })
}

export async function setBotOverride(
  matchId: string,
  action: SessionBotOverride | null,
) {
  return engineFetch<{ ok: boolean; pending_override: SessionBotOverride | null }>(
    `/${matchId}/bot-override`,
    { method: 'PUT', json: { action } },
  )
}

export async function fetchPlayerView(matchId: string, player: 0 | 1) {
  return engineFetch<PlayerSessionView>(`/${matchId}/players/${player}/view`)
}
