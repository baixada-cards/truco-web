import type { CSSProperties, ReactNode } from 'react'

import { SuitGlyph, type BaixadaSuitKind } from './BaixadaBrand'

type CssVars = CSSProperties & Record<`--${string}`, string | number>

const SUIT_INK: Record<BaixadaSuitKind, string> = {
  espadas: 'var(--suit-black)',
  copas: 'var(--suit-red)',
  oros: 'var(--suit-ochre)',
  bastos: 'var(--suit-green)',
}

function iconA11y(title?: string) {
  return title
    ? { role: 'img' as const, 'aria-label': title }
    : { 'aria-hidden': true as const }
}

export function BaixadaIconTile({
  size = 180,
  radius,
  frame = true,
  weave = true,
  accent = 'var(--brass-1)',
  className,
  children,
  title,
}: {
  size?: number
  radius?: number
  frame?: boolean
  weave?: boolean
  accent?: string
  className?: string
  children: ReactNode
  title?: string
}) {
  const resolvedRadius = radius ?? Math.round(size * 0.22)
  const inset = Math.max(6, Math.round(size * 0.055))
  const innerRadius = Math.max(2, resolvedRadius - inset + 2)

  return (
    <span
      className={className}
      style={{
        '--baixada-icon-size': `${size}px`,
        '--baixada-icon-radius': `${resolvedRadius}px`,
        '--baixada-icon-inner-inset': `${inset}px`,
        '--baixada-icon-inner-radius': `${innerRadius}px`,
        '--baixada-icon-accent': accent,
        position: 'relative',
        display: 'inline-flex',
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderRadius: resolvedRadius,
        background: 'linear-gradient(155deg, var(--card-back-a) 0%, var(--card-back-b) 100%)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -2px 0 rgba(0,0,0,0.35)',
        flexShrink: 0,
      } as CssVars}
      {...iconA11y(title)}
    >
      {weave && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: resolvedRadius,
            backgroundImage: `repeating-linear-gradient(45deg, rgba(212,179,106,0.07) 0 ${size * 0.025}px, rgba(0,0,0,0.10) ${size * 0.025}px ${size * 0.05}px)`,
            mixBlendMode: 'overlay',
            pointerEvents: 'none',
          }}
        />
      )}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: resolvedRadius,
          background: 'radial-gradient(ellipse 70% 55% at 50% 28%, rgba(255,220,160,0.18) 0%, rgba(255,220,160,0.04) 50%, transparent 80%)',
          pointerEvents: 'none',
        }}
      />
      {frame && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset,
            border: `1px solid ${accent}`,
            borderRadius: innerRadius,
            opacity: 0.7,
            pointerEvents: 'none',
          }}
        />
      )}
      <span
        aria-hidden="true"
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </span>
    </span>
  )
}

export function SpanishIconCard({
  width = 90,
  suit = 'espadas',
  numeral = '1',
}: {
  width?: number
  suit?: BaixadaSuitKind
  numeral?: string
}) {
  const height = Math.round(width * 1.45)
  const inset = Math.max(2, width * 0.04)
  const corner = Math.max(3, width * 0.06)
  const innerCorner = Math.max(2, width * 0.035)
  const ink = SUIT_INK[suit]

  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-flex',
        width,
        height,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: corner,
        background: 'linear-gradient(180deg, var(--card-0), var(--card-1))',
        boxShadow: '0 1px 1px rgba(0,0,0,0.25), 0 3px 6px rgba(0,0,0,0.28)',
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      <span
        style={{
          position: 'absolute',
          inset,
          border: `${Math.max(1, width * 0.012)}px solid var(--card-edge)`,
          borderRadius: innerCorner,
        }}
      />
      <span
        style={{
          position: 'absolute',
          top: width * 0.085,
          left: width * 0.09,
          color: ink,
          fontFamily: 'var(--font-serif)',
          fontSize: width * 0.22,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          lineHeight: 1,
        }}
      >
        {numeral}
      </span>
      <span
        style={{
          position: 'absolute',
          right: width * 0.09,
          bottom: width * 0.085,
          color: ink,
          fontFamily: 'var(--font-serif)',
          fontSize: width * 0.22,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          lineHeight: 1,
          transform: 'rotate(180deg)',
        }}
      >
        {numeral}
      </span>
      <SuitGlyph kind={suit} size={width * 0.5} />
    </span>
  )
}

export function TrucoIcon({
  size = 180,
  frame,
  className,
  title = 'Truco',
}: {
  size?: number
  frame?: boolean
  className?: string
  title?: string
}) {
  return (
    <BaixadaIconTile
      size={size}
      frame={frame ?? size > 32}
      className={className}
      title={title}
    >
      <SpanishIconCard width={size * 0.62} suit="espadas" numeral="1" />
    </BaixadaIconTile>
  )
}

export function FutureGameIcon({
  game,
  size = 180,
  className,
}: {
  game: 'Escopa' | 'Bisca'
  size?: number
  className?: string
}) {
  const suit = game === 'Escopa' ? 'bastos' : 'oros'

  return (
    <BaixadaIconTile size={size} frame={size > 32} className={className} title={game}>
      <SpanishIconCard width={size * 0.62} suit={suit} numeral="1" />
    </BaixadaIconTile>
  )
}
