import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import './DealerMark.css'

export type DealerSide = 'hero' | 'villain'
type DealerGlyph = 'blank' | 'pip' | 'sun'
type DealerFinish = 'default' | 'satin' | 'polished' | 'aged'

function DealerGlyphBlank() {
  return null
}

function DealerGlyphPip({ size = 28 }: { size?: number }) {
  const diameter = Math.max(2, size * 0.12)

  return (
    <span
      className="dm-chip-glyph"
      style={{
        width: diameter,
        height: diameter,
        borderRadius: '50%',
        background: 'rgba(40, 22, 6, 0.55)',
        boxShadow: 'inset 0 0.5px 0 rgba(0,0,0,0.4), 0 0.5px 0 rgba(255,225,170,0.45)',
      }}
    />
  )
}

function DealerGlyphSun({ size = 28 }: { size?: number }) {
  const glyphSize = size * 0.55

  return (
    <svg className="dm-chip-glyph" width={glyphSize} height={glyphSize} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3.4" fill="rgba(40,22,6,0.65)" />
      {Array.from({ length: 8 }).map((_, index) => {
        const angle = (index * Math.PI) / 4
        const x1 = 12 + Math.cos(angle) * 5.2
        const y1 = 12 + Math.sin(angle) * 5.2
        const x2 = 12 + Math.cos(angle) * 8.4
        const y2 = 12 + Math.sin(angle) * 8.4

        return (
          <line
            key={index}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="rgba(40,22,6,0.65)"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        )
      })}
    </svg>
  )
}

const DEALER_GLYPHS = {
  blank: DealerGlyphBlank,
  pip: DealerGlyphPip,
  sun: DealerGlyphSun,
} satisfies Record<DealerGlyph, ({ size }: { size?: number }) => JSX.Element | null>

export function DealerChip({
  size = 28,
  glyph = 'blank',
  finish = 'default',
}: {
  size?: number
  glyph?: DealerGlyph
  finish?: DealerFinish
}) {
  const t = useTranslations('Live.table')
  const Glyph = DEALER_GLYPHS[glyph] ?? DealerGlyphBlank
  const finishClass = finish === 'default' ? '' : `dm-chip-${finish}`

  return (
    <span
      className={['dm-chip', finishClass].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
      role="img"
      aria-label={t('dealerMarker')}
    >
      <Glyph size={size} />
    </span>
  )
}

function hashDealerHand(handKey: string | number, dealer: DealerSide) {
  const source = `${dealer}:${handKey}`
  let hash = 2166136261

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

function seededUnit(seed: number, salt: number) {
  let value = (seed + Math.imul(salt, 0x9e3779b1)) >>> 0
  value ^= value >>> 16
  value = Math.imul(value, 0x7feb352d)
  value ^= value >>> 15
  value = Math.imul(value, 0x846ca68b)
  value ^= value >>> 16

  return (value >>> 0) / 0xffffffff
}

function dealerJitterFor(handKey: string | number, dealer: DealerSide) {
  const seed = hashDealerHand(handKey, dealer)

  return {
    dx: (seededUnit(seed, 1) - 0.5) * 18,
    dy: (seededUnit(seed, 2) - 0.5) * 14,
    rot: (seededUnit(seed, 3) - 0.5) * 16,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function PaperDealerChip({
  handKey,
  dealer,
  padWidth = 280,
  padHeight = 240,
  size = 28,
  glyph = 'blank',
  finish = 'default',
}: {
  handKey: string | number
  dealer: DealerSide
  padWidth?: number
  padHeight?: number
  size?: number
  glyph?: DealerGlyph
  finish?: DealerFinish
}) {
  const xCenter = dealer === 'hero' ? padWidth * 0.25 : padWidth * 0.75
  const yAnchor = padHeight - 48
  const jitter = dealerJitterFor(handKey, dealer)
  const margin = 12
  const left = clamp(xCenter - size / 2 + jitter.dx, margin, padWidth - size - margin)
  const top = clamp(yAnchor - size / 2 + jitter.dy, margin, padHeight - size - margin)
  const previousDealerRef = useRef(dealer)
  const [traveling, setTraveling] = useState(false)
  const [entering, setEntering] = useState(false)

  useEffect(() => {
    if (previousDealerRef.current === dealer) return undefined

    previousDealerRef.current = dealer
    setTraveling(true)
    const timeoutId = window.setTimeout(() => {
      setTraveling(false)
    }, 540)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [dealer])

  useEffect(() => {
    const enterId = window.setTimeout(() => {
      setEntering(true)
    }, 20)
    const clearId = window.setTimeout(() => {
      setEntering(false)
    }, 640)

    return () => {
      window.clearTimeout(enterId)
      window.clearTimeout(clearId)
    }
  }, [])

  return (
    <div
      className={[
        'dm-pad-chip',
        entering ? 'dm-enter' : '',
        traveling ? 'dm-traveling' : '',
      ].filter(Boolean).join(' ')}
      style={{
        left,
        top,
        transform: `rotate(${jitter.rot.toFixed(2)}deg)`,
      } satisfies CSSProperties}
    >
      <DealerChip size={size} glyph={glyph} finish={finish} />
    </div>
  )
}

export function DockDealerInset({
  active = true,
  size = 18,
}: {
  active?: boolean
  size?: number
}) {
  return (
    <span
      className="dm-dock-inset"
      data-active={active ? 'true' : 'false'}
      style={{ width: size, height: size }}
      role={active ? 'img' : undefined}
      aria-label={active ? 'Dealer marker' : undefined}
      aria-hidden={active ? undefined : true}
    />
  )
}
