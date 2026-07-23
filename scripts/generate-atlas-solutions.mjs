// Generates synthetic placeholder Solution Atlas data for the mão de onze (11-11)
// subgame, one JSON file per turn-up class (tc 0..8).
//
// SCHEMA (truco-frontend/public/solutions/11x11/tc{N}.json):
//   {
//     "score":[11,11], "turnup_class":N, "iterations":<int>, "num_info_sets":<int>,
//     "decisions": {
//       "opening": {
//         "hands": [
//           { "cards":[a,b,c], "player":1, "actions":[ {"a":"FU:i","p":0.33}, ... ] },
//           ...
//         ]
//       }
//     }
//   }
//
// The solved decision at 11-11 is the OPENING LEAD (which card the leader plays
// first), NOT an accept/fold. Each (hand, player) is one entry; both players 0
// and 1 appear (each deal solved under both dealer arrangements).
//
// Action encoding: "FU:i" = play card index i face-up; "FD:i" = face-down (rare).
// `p` is the average-strategy probability; per entry the ps sum to ~1.
//
// Card strength index 0..12:
//   0..8  = plain levels (weakest -> strongest), may repeat in a hand
//   9..12 = manilhas (unique per hand): 9=ouros, 10=espadilha, 11=copas, 12=zap
//
// THIS DATA IS SYNTHETIC. Replace with real solver exports (same shape) later.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'public', 'solutions', '11x11')

const MANILHA_MIN = 9

/** Enumerate every distinct abstract 3-card hand (sorted ascending). */
function enumerateHands() {
  const hands = []
  for (let a = 0; a <= 12; a++) {
    for (let b = a; b <= 12; b++) {
      for (let c = b; c <= 12; c++) {
        // Manilhas (>=9) are unique; a plain can repeat.
        if (a >= MANILHA_MIN && a === b) continue
        if (b >= MANILHA_MIN && b === c) continue
        hands.push([a, b, c])
      }
    }
  }
  return hands
}

function round4(x) {
  return Math.round(x * 10000) / 10000
}

/**
 * Build a plausible opening-lead distribution over the DISTINCT card indices in
 * a hand. We return a weight per distinct index; the caller normalizes.
 *
 * Behavioural shape (synthetic but plausible):
 *  - player 1 (default leader) leans toward leading the strongest card a bit
 *    more (probe / pressure), more so when the top card is a manilha.
 *  - player 0 sandbags more (slow-plays the strong card), leading mids/weak.
 *  - turn-up class tilts the strong-lead propensity slightly.
 */
function leadWeights(cards, player, tc) {
  const distinct = [...new Set(cards)].sort((a, b) => a - b)
  const top = distinct[distinct.length - 1]
  // Base inclination to lead the strongest card.
  let strongBias = player === 1 ? 0.62 : 0.42
  strongBias += (tc - 4) * 0.018 // small per-tc tilt
  if (top >= MANILHA_MIN) strongBias += 0.12 // manilhas get led more
  strongBias = Math.min(0.9, Math.max(0.12, strongBias))

  const weights = {}
  const others = distinct.filter((c) => c !== top)
  // Give the strongest card `strongBias` of the mass; split the rest among the
  // remaining distinct cards, slightly favouring the weaker ones (sandbag the mid).
  if (others.length === 0) {
    weights[top] = 1
  } else {
    weights[top] = strongBias
    const rest = 1 - strongBias
    // weaker cards get a touch more of the leftover
    const invRanks = others.map((c) => 1 / (1 + c))
    const sum = invRanks.reduce((s, v) => s + v, 0)
    others.forEach((c, i) => {
      weights[c] = rest * (invRanks[i] / sum)
    })
  }
  return weights
}

function buildEntry(cards, player, tc) {
  const weights = leadWeights(cards, player, tc)
  const indices = Object.keys(weights)
    .map(Number)
    .sort((a, b) => a - b)
  const total = indices.reduce((s, i) => s + weights[i], 0)
  const actions = indices.map((i) => ({
    a: `FU:${i}`,
    p: round4(weights[i] / total),
  }))
  return { cards, player, actions }
}

function buildFile(tc) {
  const hands = enumerateHands()
  const entries = []
  for (const cards of hands) {
    entries.push(buildEntry(cards, 1, tc))
    entries.push(buildEntry(cards, 0, tc))
  }

  const iterations = 80 + tc * 3
  const numInfoSets = 11_000_000 + tc * 27_531 + 222_246

  return {
    score: [11, 11],
    turnup_class: tc,
    iterations,
    num_info_sets: numInfoSets,
    decisions: {
      opening: {
        hands: entries,
      },
    },
  }
}

mkdirSync(outDir, { recursive: true })
for (let tc = 0; tc <= 8; tc++) {
  const data = buildFile(tc)
  const path = join(outDir, `tc${tc}.json`)
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n')
  console.log(`wrote ${path} (${data.decisions.opening.hands.length} entries)`)
}
