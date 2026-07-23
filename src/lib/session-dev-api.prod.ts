import {
  SessionRequestError,
  type PlayerSessionView,
  type SessionBotOverride,
  type SessionPayload,
} from './session-api'

function devApiDisabled(): never {
  throw new SessionRequestError('not found', 'NOT_FOUND', 404)
}

export async function replaceSessionState(
  _matchId: string,
  _state: unknown,
): Promise<SessionPayload> {
  void _matchId
  void _state
  devApiDisabled()
}

export async function setBotOverride(
  _matchId: string,
  _action: SessionBotOverride | null,
): Promise<{ ok: boolean; pending_override: SessionBotOverride | null }> {
  void _matchId
  void _action
  devApiDisabled()
}

export async function fetchPlayerView(
  _matchId: string,
  _player: 0 | 1,
): Promise<PlayerSessionView> {
  void _matchId
  void _player
  devApiDisabled()
}
