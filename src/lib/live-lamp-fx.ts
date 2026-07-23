import type { StakeFxAction } from './live-stake-fx'

export const LAMP_RAISE_FX_DURATIONS_MS = {
  6: 820,
  9: 1650,
  12: 1900,
} as const

export type LampRaiseFxStake = keyof typeof LAMP_RAISE_FX_DURATIONS_MS
export type LampRaiseFxKind = 'pulse' | 'swing'

export type LampRaiseFx = {
  className: string
  durationMs: number
  kind: LampRaiseFxKind
  stake: LampRaiseFxStake
}

function isRaiseLikeStakeFxAction(action: StakeFxAction | null | undefined) {
  return action === 'raise' || action === 'reraise'
}

function lampRaiseFxStake(stake: number): LampRaiseFxStake | null {
  if (stake >= 12) return 12
  if (stake >= 9) return 9
  if (stake >= 6) return 6
  return null
}

export function lampRaiseFxForStakeAction(
  action: StakeFxAction | null | undefined,
  stake: number | null | undefined,
  fastModeEnabled = false,
): LampRaiseFx | null {
  if (!isRaiseLikeStakeFxAction(action) || stake == null || fastModeEnabled) {
    return null
  }

  const fxStake = lampRaiseFxStake(stake)
  if (!fxStake) return null

  const kind: LampRaiseFxKind = fxStake >= 9 ? 'swing' : 'pulse'
  return {
    className: kind === 'swing'
      ? `ft-root--lamp-swing-${fxStake}`
      : `ft-root--lamp-pulse-${fxStake}`,
    durationMs: LAMP_RAISE_FX_DURATIONS_MS[fxStake],
    kind,
    stake: fxStake,
  }
}

export function minimumRaiseResponseReadMs({
  action,
  stake,
  baseVisibleMs,
  gapMs,
  followDelayMs,
  fastModeEnabled = false,
}: {
  action: StakeFxAction | null | undefined
  stake: number | null | undefined
  baseVisibleMs: number
  gapMs: number
  followDelayMs: number
  fastModeEnabled?: boolean
}) {
  if (fastModeEnabled) return 0

  const lampRaiseFx = lampRaiseFxForStakeAction(action, stake, fastModeEnabled)
  return Math.max(
    followDelayMs,
    baseVisibleMs + gapMs,
    (lampRaiseFx?.durationMs ?? 0) + gapMs,
  )
}
