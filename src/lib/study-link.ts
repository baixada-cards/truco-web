// Serialize a live hand into a study-lab hand string ("study this spot").
//
// The study lab only loads pre-solved spots, so callers should gate the link
// with `studySpotSolved` against /study/manifest.json. Reconstruction limits:
// resolved mid-hand raises are not in the client state (only the net stake),
// so raised non-onze hands return an error instead of a wrong history.

import type { SessionPayload } from './session-api.ts'
import { viraChoices } from './study-data.ts'

const RANK_LADDER = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'] as const
const SUIT_LETTER: Record<string, string> = {
  DIAMONDS: 'd',
  SPADES: 's',
  HEARTS: 'h',
  CLUBS: 'c',
}
const SUIT_INDEX: Record<string, number> = {
  DIAMONDS: 0,
  SPADES: 1,
  HEARTS: 2,
  CLUBS: 3,
}

type Card = { rank: string; suit: string }

/** the manilha rank is the next ladder rank after the vira, wrapping 3 → 4 */
export function manilhaRankFor(viraRank: string): string {
  const i = RANK_LADDER.indexOf(viraRank as (typeof RANK_LADDER)[number])
  return RANK_LADDER[(i + 1) % RANK_LADDER.length]
}

/** solver class (0..12) of a concrete card under a vira rank */
export function classOf(card: Card, viraRank: string): number {
  const manilha = manilhaRankFor(viraRank)
  if (card.rank === manilha) return 9 + (SUIT_INDEX[card.suit] ?? 0)
  const plain = RANK_LADDER.filter((r) => r !== manilha)
  return plain.indexOf(card.rank as (typeof RANK_LADDER)[number])
}

/** study-string token of a concrete card under a vira rank */
export function cardTokenFor(card: Card, viraRank: string): string {
  const manilha = manilhaRankFor(viraRank)
  if (card.rank === manilha) {
    return `${card.rank.toLowerCase()}${SUIT_LETTER[card.suit] ?? 'd'}`
  }
  return card.rank.toLowerCase()
}

export type StudySpotBlockedCode = 'no-hand' | 'raised' | 'hidden-card'

export type StudySpot =
  | { ok: true; text: string; mao: number; pe: number; viraRank: string }
  | { ok: false; code: StudySpotBlockedCode; reason: string }

/** the live hand as a study string, or the reason it cannot be one */
export function buildStudySpotString(session: SessionPayload): StudySpot {
  const hand = session.state.current_hand
  if (!hand) return { ok: false, code: 'no-hand', reason: 'no hand in progress' }
  const st = hand.state
  const dealer = st.dealer
  const maoSeat = (1 - dealer) as 0 | 1
  const mao = st.score[String(maoSeat) as '0' | '1']
  const pe = st.score[String(dealer) as '0' | '1']
  const viraRank = st.turnup.rank
  const eleven = (mao === 11) !== (pe === 11)

  // resolved raises are not reconstructable from client state (net stake only)
  const baseStake = eleven ? 3 : 1
  const resolvedRaise = st.pending_raise
    ? st.pending_raise.previous_value > baseStake
    : st.hand_value > baseStake
  if (resolvedRaise) {
    return { ok: false, code: 'raised', reason: 'raised hands cannot be reconstructed yet' }
  }

  const plays = [
    ...st.completed_rounds.flatMap((r) => r.plays),
    ...st.current_round.plays,
  ]
  const tokens: string[] = []
  for (const play of plays) {
    if (!play.card?.rank) {
      return { ok: false, code: 'hidden-card', reason: 'a face-down card is still unknown' }
    }
    tokens.push(cardTokenFor(play.card, viraRank) + (play.visibility === 'down' ? '*' : ''))
  }
  if (st.pending_raise) {
    tokens.push(st.pending_raise.to === 3 ? 'r' : `r${st.pending_raise.to}`)
  }

  // the human's full dealt hand: remaining cards plus their own plays
  const own: Card[] = [
    ...(session.playerView.hand?.hand ?? []),
    ...plays.filter((p) => p.player === session.humanPlayer).map((p) => p.card),
  ]
  const parts = [`${mao}x${pe}`, `v${viraRank.toLowerCase()}`]
  if (own.length === 3) {
    const sorted = [...own].sort((a, b) => classOf(b, viraRank) - classOf(a, viraRank))
    const who = session.humanPlayer === dealer ? 'pe' : 'mao'
    // pin (!) the hero's hand so the lab conditions on it; the opponent draft is
    // deliberately never emitted, which leaves their range fully open
    parts.push(`${who}![${sorted.map((c) => cardTokenFor(c, viraRank)).join(' ')}]`)
  }
  if (tokens.length > 0) parts.push(`: ${tokens.join(' ')}`)
  return { ok: true, text: parts.join(' '), mao, pe, viraRank }
}

type StudyManifest = {
  spots: Array<{ score: [number, number]; tc: number; dealer: number }>
} | null

/**
 * How available a live spot is in the loaded study manifest:
 * - `available`: the exact (role scores + vira/turn-up class) chart is shipped.
 * - `vira-unavailable`: the score IS covered, but not for this vira. The
 *   manifest shipped here is a subset (e.g. only turn-up class 0); a fuller
 *   build would resolve it. This is a data-availability gap, NOT an unsolved
 *   score — 10x10 stays in the solved region regardless of the vira.
 * - `score-unsolved`: no chart at these role scores at all.
 */
export type StudySpotAvailability = 'available' | 'vira-unavailable' | 'score-unsolved'

export function studySpotAvailability(
  manifest: StudyManifest,
  spot: StudySpot,
): StudySpotAvailability {
  if (!manifest || !spot.ok) return 'score-unsolved'
  const scoreMatches = manifest.spots.filter((s) => {
    const rsMao = s.dealer === 0 ? s.score[1] : s.score[0]
    const rsPe = s.dealer === 0 ? s.score[0] : s.score[1]
    return rsMao === spot.mao && rsPe === spot.pe
  })
  if (scoreMatches.length === 0) return 'score-unsolved'
  const choice = viraChoices().find((c) => c.rank === spot.viraRank)
  if (choice && scoreMatches.some((s) => s.tc === choice.tc)) return 'available'
  return 'vira-unavailable'
}

/** whether the study manifest has a solve for this exact spot (score + vira) */
export function studySpotSolved(manifest: StudyManifest, spot: StudySpot): boolean {
  return studySpotAvailability(manifest, spot) === 'available'
}
