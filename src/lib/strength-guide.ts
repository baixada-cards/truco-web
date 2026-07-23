import type { DeckSystem } from './deck-system'

export const STRENGTH_GUIDE_DISCOVERY_STORAGE_KEY = 'truco.live.strengthGuide.discovery'
export const STRENGTH_GUIDE_DISCOVERY_HAND_LIMIT = 3

export const STRENGTH_RANK_ORDER = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'] as const
export const STRENGTH_SUIT_ORDER = ['DIAMONDS', 'SPADES', 'HEARTS', 'CLUBS'] as const

export type StrengthRank = typeof STRENGTH_RANK_ORDER[number]
export type StrengthSuit = typeof STRENGTH_SUIT_ORDER[number]
export type StrengthGuideMode = 'glance' | 'learn'

export type StrengthGuideCard = {
  rank: string
  suit: string
}

export type StrengthSuitMeta = {
  id: StrengthSuit
  glyph: string
  name: string
  manilhaName: string
  colorVar: string
}

export type StrengthGuideManilha = StrengthSuitMeta & {
  rank: StrengthRank
  suitIndex: number
  isManilha: true
}

export type StrengthGuideRanking = {
  manilhaRank: StrengthRank
  manilhas: StrengthGuideManilha[]
  others: Array<{ rank: StrengthRank; isManilha: false }>
  turnup: {
    rank: StrengthRank
    suit: StrengthSuit
  }
}

export type StrengthGuideDiscovery = {
  opened: boolean
  firstMatchId: string | null
  handKeys: string[]
}

export type StrengthGuideAvailability = {
  turnup: StrengthGuideCard | null | undefined
  turnupFaceDown: boolean
  handEndSequenceRunning?: boolean
  betweenHandsPhase?: 'idle' | 'gathering' | 'deck-visible'
}

const FRENCH_SUIT_META: Record<StrengthSuit, StrengthSuitMeta> = {
  DIAMONDS: {
    id: 'DIAMONDS',
    glyph: '♦',
    name: 'ouros',
    manilhaName: 'ouros',
    colorVar: 'var(--suit-ochre)',
  },
  SPADES: {
    id: 'SPADES',
    glyph: '♠',
    name: 'espadas',
    manilhaName: 'espadilha',
    colorVar: 'var(--suit-black)',
  },
  HEARTS: {
    id: 'HEARTS',
    glyph: '♥',
    name: 'copas',
    manilhaName: 'copas',
    colorVar: 'var(--suit-red)',
  },
  CLUBS: {
    id: 'CLUBS',
    glyph: '♣',
    name: 'paus',
    manilhaName: 'zap',
    colorVar: 'var(--suit-green)',
  },
}

const SPANISH_SUIT_META: Record<StrengthSuit, StrengthSuitMeta> = {
  DIAMONDS: {
    ...FRENCH_SUIT_META.DIAMONDS,
    glyph: '◉',
    name: 'oros',
    manilhaName: 'oros',
  },
  SPADES: {
    ...FRENCH_SUIT_META.SPADES,
    glyph: '⚔',
    name: 'espadas',
  },
  HEARTS: {
    ...FRENCH_SUIT_META.HEARTS,
    glyph: '⚱',
    name: 'copas',
  },
  CLUBS: {
    ...FRENCH_SUIT_META.CLUBS,
    glyph: '✦',
    name: 'bastos',
    manilhaName: 'basto',
  },
}

const NORMALIZED_SUITS: Record<string, StrengthSuit> = {
  DIAMONDS: 'DIAMONDS',
  OUROS: 'DIAMONDS',
  OROS: 'DIAMONDS',
  '♦': 'DIAMONDS',
  SPADES: 'SPADES',
  ESPADAS: 'SPADES',
  '♠': 'SPADES',
  HEARTS: 'HEARTS',
  COPAS: 'HEARTS',
  '♥': 'HEARTS',
  CLUBS: 'CLUBS',
  PAUS: 'CLUBS',
  BASTOS: 'CLUBS',
  '♣': 'CLUBS',
}

const FRENCH_RANK_LABEL: Record<StrengthRank, string> = {
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  Q: 'Q',
  J: 'J',
  K: 'K',
  A: 'A',
  '2': '2',
  '3': '3',
}

const SPANISH_RANK_LABEL: Record<StrengthRank, string> = {
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  Q: '10',
  J: '11',
  K: '12',
  A: '1',
  '2': '2',
  '3': '3',
}

function isStrengthRank(rank: string): rank is StrengthRank {
  return STRENGTH_RANK_ORDER.includes(rank as StrengthRank)
}

export function normalizeStrengthSuit(suit: string): StrengthSuit | null {
  return NORMALIZED_SUITS[suit.toUpperCase()] ?? null
}

export function suitMetaFor(deckSystem: DeckSystem, suit: StrengthSuit): StrengthSuitMeta {
  return deckSystem === 'spanish' ? SPANISH_SUIT_META[suit] : FRENCH_SUIT_META[suit]
}

export function manilhaRankOf(turnupRank: string): StrengthRank | null {
  if (!isStrengthRank(turnupRank)) return null
  const index = STRENGTH_RANK_ORDER.indexOf(turnupRank)
  return STRENGTH_RANK_ORDER[(index + 1) % STRENGTH_RANK_ORDER.length]
}

export function rankLabel(rank: string, deckSystem: DeckSystem): string {
  if (!isStrengthRank(rank)) return rank
  return deckSystem === 'spanish' ? SPANISH_RANK_LABEL[rank] : FRENCH_RANK_LABEL[rank]
}

export function rankingForTurnup(
  turnup: StrengthGuideCard | null | undefined,
  deckSystem: DeckSystem,
): StrengthGuideRanking | null {
  if (!turnup || !isStrengthRank(turnup.rank)) return null

  const turnupSuit = normalizeStrengthSuit(turnup.suit)
  const manilhaRank = manilhaRankOf(turnup.rank)
  if (!turnupSuit || !manilhaRank) return null

  const manilhas = STRENGTH_SUIT_ORDER.map((suit, suitIndex) => ({
    ...suitMetaFor(deckSystem, suit),
    rank: manilhaRank,
    suitIndex,
    isManilha: true as const,
  }))

  return {
    manilhaRank,
    manilhas,
    others: STRENGTH_RANK_ORDER
      .filter((rank) => rank !== manilhaRank)
      .map((rank) => ({ rank, isManilha: false as const })),
    turnup: {
      rank: turnup.rank,
      suit: turnupSuit,
    },
  }
}

export function isStrengthGuideAvailable({
  turnup,
  turnupFaceDown,
  handEndSequenceRunning = false,
  betweenHandsPhase = 'idle',
}: StrengthGuideAvailability): boolean {
  return Boolean(
    turnup &&
    !turnupFaceDown &&
    !handEndSequenceRunning &&
    betweenHandsPhase === 'idle',
  )
}

export function isStrengthGuidePeekStowed(options: StrengthGuideAvailability): boolean {
  return Boolean(
    options.turnup &&
    !options.turnupFaceDown &&
    !isStrengthGuideAvailable(options),
  )
}

export function buildDefaultStrengthGuideDiscovery(): StrengthGuideDiscovery {
  return {
    opened: false,
    firstMatchId: null,
    handKeys: [],
  }
}

export function sanitizeStrengthGuideDiscovery(value: unknown): StrengthGuideDiscovery {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return buildDefaultStrengthGuideDiscovery()
  }

  const candidate = value as Partial<StrengthGuideDiscovery>
  const firstMatchId = typeof candidate.firstMatchId === 'string' && candidate.firstMatchId.length > 0
    ? candidate.firstMatchId
    : null
  const handKeys = Array.isArray(candidate.handKeys)
    ? candidate.handKeys
      .filter((handKey): handKey is string => typeof handKey === 'string' && handKey.length > 0)
      .slice(-STRENGTH_GUIDE_DISCOVERY_HAND_LIMIT - 1)
    : []

  return {
    opened: candidate.opened === true,
    firstMatchId,
    handKeys,
  }
}

export function readStrengthGuideDiscovery(): StrengthGuideDiscovery {
  if (typeof window === 'undefined') return buildDefaultStrengthGuideDiscovery()

  try {
    const raw = window.localStorage.getItem(STRENGTH_GUIDE_DISCOVERY_STORAGE_KEY)
    return raw ? sanitizeStrengthGuideDiscovery(JSON.parse(raw)) : buildDefaultStrengthGuideDiscovery()
  } catch {
    return buildDefaultStrengthGuideDiscovery()
  }
}

export function persistStrengthGuideDiscovery(discovery: StrengthGuideDiscovery) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(
    STRENGTH_GUIDE_DISCOVERY_STORAGE_KEY,
    JSON.stringify(sanitizeStrengthGuideDiscovery(discovery)),
  )
}

export function markStrengthGuideHandSeen(
  discovery: StrengthGuideDiscovery,
  matchId: string | null | undefined,
  handKey: string | null | undefined,
): StrengthGuideDiscovery {
  if (!matchId || !handKey) return discovery

  const firstMatchId = discovery.firstMatchId ?? matchId
  if (matchId !== firstMatchId) {
    return discovery.firstMatchId === firstMatchId
      ? discovery
      : { ...discovery, firstMatchId }
  }

  if (discovery.handKeys.includes(handKey)) {
    return discovery.firstMatchId === firstMatchId
      ? discovery
      : { ...discovery, firstMatchId }
  }

  return {
    ...discovery,
    firstMatchId,
    handKeys: [...discovery.handKeys, handKey].slice(-STRENGTH_GUIDE_DISCOVERY_HAND_LIMIT - 1),
  }
}

export function markStrengthGuideOpened(discovery: StrengthGuideDiscovery): StrengthGuideDiscovery {
  if (discovery.opened) return discovery
  return {
    ...discovery,
    opened: true,
  }
}

export function shouldPulseStrengthGuide(
  discovery: StrengthGuideDiscovery,
  matchId?: string | null,
): boolean {
  if (discovery.opened) return false
  if (matchId && discovery.firstMatchId && discovery.firstMatchId !== matchId) return false
  return discovery.handKeys.length <= STRENGTH_GUIDE_DISCOVERY_HAND_LIMIT
}
