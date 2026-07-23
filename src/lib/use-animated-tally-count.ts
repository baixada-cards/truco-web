import { useEffect, useRef, useState } from 'react'

import { SCORE_TALLY_STROKE_GAP_MS } from './live-score-sound.ts'

const MAX_SEQUENTIAL_TALLY_REVEAL = 12

function tallyCount(score: number) {
  return Math.min(12, Math.max(0, Math.floor(score)))
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useAnimatedTallyCount(score: number) {
  const targetCount = tallyCount(score)
  const [visibleCount, setVisibleCount] = useState(targetCount)
  const previousTargetRef = useRef(targetCount)
  const timeoutsRef = useRef<number[]>([])

  useEffect(() => {
    const previousCount = previousTargetRef.current
    const delta = targetCount - previousCount
    previousTargetRef.current = targetCount

    for (const timeoutId of timeoutsRef.current) {
      window.clearTimeout(timeoutId)
    }
    timeoutsRef.current = []

    if (
      delta <= 1 ||
      delta > MAX_SEQUENTIAL_TALLY_REVEAL ||
      prefersReducedMotion()
    ) {
      setVisibleCount(targetCount)
      return
    }

    setVisibleCount(previousCount + 1)
    for (let step = 2; step <= delta; step += 1) {
      const timeoutId = window.setTimeout(() => {
        setVisibleCount(previousCount + step)
        timeoutsRef.current = timeoutsRef.current.filter((candidate) => (
          candidate !== timeoutId
        ))
      }, (step - 1) * SCORE_TALLY_STROKE_GAP_MS)
      timeoutsRef.current.push(timeoutId)
    }

    return () => {
      for (const timeoutId of timeoutsRef.current) {
        window.clearTimeout(timeoutId)
      }
      timeoutsRef.current = []
    }
  }, [targetCount])

  return visibleCount
}
