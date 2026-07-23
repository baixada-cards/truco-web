export const STAKE_REFUSE_DRAG_THRESHOLD_PX = 48
export const STAKE_REFUSE_DRAG_MAX_OFFSET_PX = 76
export const STAKE_REFUSE_DRAG_SLOP_PX = 10

export type StakePegRefuseDrag = {
  offsetY: number
  isDragging: boolean
  isArmed: boolean
}

export const idleStakePegRefuseDrag: StakePegRefuseDrag = {
  offsetY: 0,
  isDragging: false,
  isArmed: false,
}

export function resolveStakePegRefuseDrag(deltaX: number, deltaY: number): StakePegRefuseDrag {
  const travel = Math.hypot(deltaX, deltaY)
  const downwardOffset = Math.max(0, Math.min(STAKE_REFUSE_DRAG_MAX_OFFSET_PX, deltaY))

  return {
    offsetY: Math.round(downwardOffset),
    isDragging: travel >= STAKE_REFUSE_DRAG_SLOP_PX,
    isArmed: downwardOffset >= STAKE_REFUSE_DRAG_THRESHOLD_PX,
  }
}
