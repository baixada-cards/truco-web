import type { BotKind, BotProfile, SessionPayload } from './session-api.ts'

export type RecentLiveMatch = {
  matchId: string
  opponent: string
  youScore: number
  themScore: number
  updatedAt: number
  botKind: BotKind
  botProfile: BotProfile | null
  botModel: string | null
}

export type RecentLiveMatchDisplay = {
  opponent: string
  youScore: number
  themScore: number
  when: string
  matchId: string
}

export const RECENT_LIVE_MATCH_STORAGE_KEY = 'truco-live-recent-match-v1' // gitleaks:allow — browser storage key, not a credential

const botKinds = new Set<BotKind>([
  'random',
  'simple',
  'heuristic',
  'solver',
  'openai',
  'anthropic',
  'openrouter',
])

function titleBotKind(botKind: BotKind) {
  switch (botKind) {
    case 'random': return 'Random'
    case 'simple': return 'Simple'
    case 'heuristic': return 'Heuristic'
    case 'solver': return 'Solver'
    case 'openai': return 'OpenAI'
    case 'anthropic': return 'Anthropic'
    case 'openrouter': return 'OpenRouter'
  }
}

function profileLabel(botProfile: BotProfile | null | undefined) {
  return botProfile ?? 'balanced'
}

export function formatRecentOpponent(
  session: Pick<SessionPayload, 'botKind' | 'botProfile' | 'botModel'>,
) {
  if (!session.botKind) return 'Local table'

  if (session.botModel) {
    return `${titleBotKind(session.botKind)} · ${session.botModel}`
  }

  if (session.botKind === 'heuristic') {
    return `${titleBotKind(session.botKind)} · ${profileLabel(session.botProfile)}`
  }

  if (session.botProfile) {
    return `${titleBotKind(session.botKind)} · ${profileLabel(session.botProfile)}`
  }

  return titleBotKind(session.botKind)
}

export function buildRecentLiveMatch(
  session: Pick<SessionPayload, 'matchId' | 'humanPlayer' | 'botPlayer' | 'botKind' | 'botProfile' | 'botModel' | 'publicView'>,
  now = Date.now(),
): RecentLiveMatch | null {
  if (!session.botKind || session.publicView.winner != null) {
    return null
  }

  return {
    matchId: session.matchId,
    opponent: formatRecentOpponent(session),
    youScore: session.publicView.score[String(session.humanPlayer) as '0' | '1'],
    themScore: session.publicView.score[String(session.botPlayer) as '0' | '1'],
    updatedAt: now,
    botKind: session.botKind,
    botProfile: session.botProfile,
    botModel: session.botModel,
  }
}

export function sanitizeRecentLiveMatch(value: unknown): RecentLiveMatch | null {
  if (!value || typeof value !== 'object') return null

  const candidate = value as Partial<RecentLiveMatch>
  if (
    typeof candidate.matchId !== 'string' ||
    typeof candidate.opponent !== 'string' ||
    typeof candidate.youScore !== 'number' ||
    typeof candidate.themScore !== 'number' ||
    typeof candidate.updatedAt !== 'number' ||
    !candidate.botKind ||
    !botKinds.has(candidate.botKind)
  ) {
    return null
  }

  return {
    matchId: candidate.matchId,
    opponent: candidate.opponent,
    youScore: candidate.youScore,
    themScore: candidate.themScore,
    updatedAt: candidate.updatedAt,
    botKind: candidate.botKind,
    botProfile: candidate.botProfile ?? null,
    botModel: candidate.botModel ?? null,
  }
}

export function readRecentLiveMatch(): RecentLiveMatch | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = window.localStorage.getItem(RECENT_LIVE_MATCH_STORAGE_KEY)
    return stored ? sanitizeRecentLiveMatch(JSON.parse(stored)) : null
  } catch {
    return null
  }
}

export function persistRecentLiveMatch(recent: RecentLiveMatch) {
  try {
    window.localStorage.setItem(
      RECENT_LIVE_MATCH_STORAGE_KEY,
      JSON.stringify(sanitizeRecentLiveMatch(recent)),
    )
  } catch {
    return
  }
}

export function clearRecentLiveMatch() {
  try {
    window.localStorage.removeItem(RECENT_LIVE_MATCH_STORAGE_KEY)
  } catch {
    return
  }
}

export function formatRecentLiveMatchWhen(updatedAt: number, now = Date.now()) {
  const elapsedMs = Math.max(0, now - updatedAt)
  const elapsedMinutes = Math.floor(elapsedMs / 60_000)

  if (elapsedMinutes < 1) return 'just now'
  if (elapsedMinutes < 60) return `${elapsedMinutes} min ago`

  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `${elapsedHours} hr ago`

  const elapsedDays = Math.floor(elapsedHours / 24)
  return `${elapsedDays} day${elapsedDays === 1 ? '' : 's'} ago`
}

export function formatRecentLiveMatchDisplay(
  recent: RecentLiveMatch,
  now = Date.now(),
): RecentLiveMatchDisplay {
  return {
    opponent: recent.opponent,
    youScore: recent.youScore,
    themScore: recent.themScore,
    when: formatRecentLiveMatchWhen(recent.updatedAt, now),
    matchId: recent.matchId,
  }
}
