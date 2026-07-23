import type { BotKind, BotProfile, SessionPayload } from './session-api.ts'
import { abbreviateLiveMatchId, formatLivePerspective } from './live-session-links.ts'

type Seat = 0 | 1

export type LiveGameStatusItem = {
  label: string
  value: string
}

export type LiveMatchLedger = {
  heroWins: number
  villainWins: number
  ties: number
  recordedMatchIds: string[]
}

export type LiveMatchOutcome = 'hero' | 'villain' | 'tie'

export const LIVE_MATCH_LEDGER_STORAGE_KEY = 'truco-live-match-ledger-v1' // gitleaks:allow — browser storage key, not a credential

export function formatLiveSeatLabel(seat: Seat | null | undefined, humanPlayer: Seat = 0) {
  if (seat == null) return 'None'
  return seat === humanPlayer ? 'You' : 'Them'
}

function botKindLabel(botKind: BotKind | null | undefined) {
  switch (botKind) {
    case 'random': return 'Random'
    case 'simple': return 'Simple'
    case 'heuristic': return 'Heuristic'
    case 'openai': return 'OpenAI'
    case 'anthropic': return 'Anthropic'
    case 'openrouter': return 'OpenRouter'
    default: return 'Unknown'
  }
}

function botProfileLabel(botProfile: BotProfile | null | undefined) {
  switch (botProfile) {
    case 'conservative': return 'Conservative'
    case 'balanced': return 'Balanced'
    case 'aggressive': return 'Aggressive'
    case 'tricky': return 'Tricky'
    default: return 'Balanced'
  }
}

export function formatLiveBotSummary(
  session: Pick<SessionPayload, 'botKind' | 'botProfile' | 'botModel'>,
) {
  if (!session.botKind) return 'Human only'

  const parts = [botKindLabel(session.botKind)]

  if (session.botKind === 'heuristic') {
    parts.push(botProfileLabel(session.botProfile))
  } else if (session.botModel) {
    parts.push(session.botModel)
  } else if (session.botProfile) {
    parts.push(botProfileLabel(session.botProfile))
  }

  return parts.join(' / ')
}

export function buildLiveGameStatus(
  session: Pick<SessionPayload, 'matchId' | 'humanPlayer' | 'botKind' | 'botProfile' | 'botModel' | 'state' | 'publicView' | 'playerView'>,
): LiveGameStatusItem[] {
  const handValue = session.playerView.hand?.public_state.hand_value
    ?? session.publicView.hand?.hand_value
    ?? session.state.current_hand?.state.hand_value
    ?? null

  return [
    {
      label: 'Perspective',
      value: formatLivePerspective(session.humanPlayer),
    },
    {
      label: 'Current Turn',
      value: formatLiveSeatLabel(session.publicView.current_player, session.humanPlayer),
    },
    {
      label: 'Hand Value',
      value: handValue == null ? '—' : String(handValue),
    },
    {
      label: 'Next Dealer',
      value: formatLiveSeatLabel(session.publicView.next_dealer, session.humanPlayer),
    },
    {
      label: 'Match Id',
      value: abbreviateLiveMatchId(session.matchId, 8),
    },
    {
      label: 'Bot',
      value: formatLiveBotSummary(session),
    },
  ]
}

export function buildDefaultLiveMatchLedger(): LiveMatchLedger {
  return {
    heroWins: 0,
    villainWins: 0,
    ties: 0,
    recordedMatchIds: [],
  }
}

export function sanitizeLiveMatchLedger(value: unknown): LiveMatchLedger {
  const defaults = buildDefaultLiveMatchLedger()

  if (!value || typeof value !== 'object') {
    return defaults
  }

  const candidate = value as Partial<LiveMatchLedger>

  return {
    heroWins: typeof candidate.heroWins === 'number' ? candidate.heroWins : 0,
    villainWins: typeof candidate.villainWins === 'number' ? candidate.villainWins : 0,
    ties: typeof candidate.ties === 'number' ? candidate.ties : 0,
    recordedMatchIds: Array.isArray(candidate.recordedMatchIds)
      ? candidate.recordedMatchIds.filter((matchId): matchId is string => typeof matchId === 'string')
      : defaults.recordedMatchIds,
  }
}

export function readLiveMatchLedger(): LiveMatchLedger {
  if (typeof window === 'undefined') {
    return buildDefaultLiveMatchLedger()
  }

  try {
    const stored = window.localStorage.getItem(LIVE_MATCH_LEDGER_STORAGE_KEY)
    return stored
      ? sanitizeLiveMatchLedger(JSON.parse(stored))
      : buildDefaultLiveMatchLedger()
  } catch {
    return buildDefaultLiveMatchLedger()
  }
}

export function persistLiveMatchLedger(ledger: LiveMatchLedger) {
  try {
    window.localStorage.setItem(
      LIVE_MATCH_LEDGER_STORAGE_KEY,
      JSON.stringify(sanitizeLiveMatchLedger(ledger)),
    )
  } catch {
    return
  }
}

export function deriveLiveMatchOutcome(
  session: Pick<SessionPayload, 'publicView'>,
): LiveMatchOutcome | null {
  if (session.publicView.winner === 0) return 'hero'
  if (session.publicView.winner === 1) return 'villain'
  return null
}

export function recordLiveMatchOutcome(
  ledger: LiveMatchLedger,
  matchId: string,
  outcome: LiveMatchOutcome | null,
): LiveMatchLedger {
  if (!outcome || ledger.recordedMatchIds.includes(matchId)) {
    return ledger
  }

  return {
    heroWins: ledger.heroWins + (outcome === 'hero' ? 1 : 0),
    villainWins: ledger.villainWins + (outcome === 'villain' ? 1 : 0),
    ties: ledger.ties + (outcome === 'tie' ? 1 : 0),
    recordedMatchIds: [...ledger.recordedMatchIds, matchId],
  }
}

export function recordCompletedLiveMatch(
  ledger: LiveMatchLedger,
  session: Pick<SessionPayload, 'matchId' | 'publicView'>,
): LiveMatchLedger {
  return recordLiveMatchOutcome(ledger, session.matchId, deriveLiveMatchOutcome(session))
}
