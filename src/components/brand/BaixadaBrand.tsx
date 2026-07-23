import type { CSSProperties, ReactNode } from 'react'

import './BaixadaBrand.css'

export type BaixadaSuitKind = 'oros' | 'copas' | 'espadas' | 'bastos'
export type BaixadaGameName = 'Truco' | 'Escopa' | 'Bisca'

type CssVars = CSSProperties & Record<`--${string}`, string | number>

const GAME_ACCENTS: Record<BaixadaGameName, string> = {
  Truco: 'var(--suit-red)',
  Escopa: 'var(--suit-green)',
  Bisca: 'var(--suit-ochre)',
}

const SUIT_COLORS: Record<BaixadaSuitKind, string> = {
  oros: 'var(--suit-ochre)',
  copas: 'var(--suit-red)',
  espadas: 'var(--suit-black)',
  bastos: 'var(--suit-green)',
}

function svgA11y(title?: string) {
  return title
    ? { role: 'img' as const, 'aria-label': title }
    : { 'aria-hidden': true as const }
}

export function PorchLamp({
  size = 64,
  color = 'var(--brass-1)',
  glow = 'var(--brass-2)',
  className,
  title,
}: {
  size?: number
  color?: string
  glow?: string
  className?: string
  title?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      focusable="false"
      {...svgA11y(title)}
    >
      <line x1="32" y1="0" x2="32" y2="14" stroke={color} strokeWidth="1" />
      <path d="M 18 14 L 46 14 L 42 26 L 22 26 Z" fill={color} stroke={color} strokeWidth="0.5" strokeLinejoin="round" />
      <path d="M 22 14 L 28 14 L 26 26 L 24 26 Z" fill={glow} opacity="0.4" />
      <circle cx="32" cy="36" r="14" fill={glow} opacity="0.18" />
      <circle cx="32" cy="36" r="9" fill={glow} opacity="0.32" />
      <circle cx="32" cy="36" r="5" fill={glow} />
      <circle cx="32" cy="36" r="5" fill="none" stroke={color} strokeWidth="0.75" />
      <path d="M 22 26 L 14 56 L 50 56 L 42 26 Z" fill={glow} opacity="0.06" />
    </svg>
  )
}

export function SuitGlyph({
  kind,
  size = 18,
  color,
  className,
  title,
}: {
  kind: BaixadaSuitKind
  size?: number
  color?: string
  className?: string
  title?: string
}) {
  const c = color ?? SUIT_COLORS[kind]
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    className,
    focusable: false as const,
    ...svgA11y(title),
  }

  switch (kind) {
    case 'oros':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" fill={c} />
          <circle cx="12" cy="12" r="6" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="0.5" />
          <circle cx="12" cy="12" r="2" fill="rgba(0,0,0,0.22)" />
        </svg>
      )
    case 'copas':
      return (
        <svg {...props}>
          <path d="M 6 4 L 18 4 L 17 11 Q 17 15 12 15 Q 7 15 7 11 Z" fill={c} />
          <rect x="11" y="15" width="2" height="4" fill={c} />
          <rect x="8" y="19" width="8" height="1.5" fill={c} />
        </svg>
      )
    case 'espadas':
      return (
        <svg {...props}>
          <path d="M 12 3 L 12 18" stroke={c} strokeWidth="2" />
          <path d="M 12 16 Q 8 18 7 14 Q 11 13 12 16 Z" fill={c} />
          <path d="M 12 16 Q 16 18 17 14 Q 13 13 12 16 Z" fill={c} />
          <rect x="9" y="18" width="6" height="1.5" fill={c} />
          <rect x="11" y="19" width="2" height="2.5" fill={c} />
        </svg>
      )
    case 'bastos':
      return (
        <svg {...props}>
          <rect x="10.5" y="3" width="3" height="18" fill={c} rx="0.5" />
          <ellipse cx="12" cy="3.5" rx="2.5" ry="1" fill={c} />
          <ellipse cx="12" cy="20.5" rx="2.5" ry="1" fill={c} />
          <line x1="10.5" y1="8" x2="13.5" y2="8" stroke="rgba(0,0,0,0.3)" strokeWidth="0.4" />
          <line x1="10.5" y1="14" x2="13.5" y2="14" stroke="rgba(0,0,0,0.3)" strokeWidth="0.4" />
        </svg>
      )
  }
}

export function SuitRow({
  size = 18,
  gap = 14,
  color,
  className,
}: {
  size?: number
  gap?: number
  color?: string
  className?: string
}) {
  return (
    <span
      className={['baixada-suit-row', className].filter(Boolean).join(' ')}
      style={{ gap }}
      aria-hidden="true"
    >
      <SuitGlyph kind="oros" size={size} color={color} />
      <SuitGlyph kind="copas" size={size} color={color} />
      <SuitGlyph kind="espadas" size={size} color={color} />
      <SuitGlyph kind="bastos" size={size} color={color} />
    </span>
  )
}

export function Plaque({
  children,
  color = 'var(--brass-1)',
  className,
}: {
  children: ReactNode
  color?: string
  className?: string
}) {
  return (
    <span
      className={['baixada-plaque', className].filter(Boolean).join(' ')}
      style={{ '--baixada-plaque-color': color } as CssVars}
    >
      {children}
    </span>
  )
}

export function HandUnderline({
  width = 220,
  color = 'var(--brass-1)',
  className,
}: {
  width?: number
  color?: string
  className?: string
}) {
  return (
    <svg
      width={width}
      height="6"
      viewBox={`0 0 ${width} 6`}
      className={className}
      style={{ display: 'block' }}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={`M 2 4 Q ${width * 0.25} 1, ${width * 0.5} 3 T ${width - 2} 3`}
        stroke={color}
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function BaixadaWordmark({
  tagline = 'a lab for the card games of the south',
  showTagline = true,
  showLamp = false,
  dark = false,
  className,
}: {
  tagline?: string
  showTagline?: boolean
  showLamp?: boolean
  dark?: boolean
  className?: string
}) {
  return (
    <div className={['baixada-wordmark', dark ? 'baixada-wordmark--dark' : '', className].filter(Boolean).join(' ')}>
      {showLamp && (
        <PorchLamp
          className="baixada-wordmark__lamp"
          size={84}
          color={dark ? 'var(--brass-2)' : 'var(--brass-0)'}
          glow={dark ? 'var(--brass-hi)' : 'var(--brass-1)'}
        />
      )}
      <div className="baixada-wordmark__name">Baixada</div>
      <HandUnderline width={260} color={dark ? 'var(--brass-2)' : 'var(--brass-1)'} />
      {showTagline && <div className="baixada-wordmark__tagline">{tagline}</div>}
    </div>
  )
}

export function BaixadaGameLockup({
  game,
  suffix,
  accent,
  dark = false,
  className,
}: {
  game: BaixadaGameName
  suffix?: '· Lab'
  accent?: string
  dark?: boolean
  className?: string
}) {
  const resolvedAccent = accent ?? (suffix === '· Lab' ? 'var(--brass-1)' : GAME_ACCENTS[game])

  return (
    <div
      className={['baixada-game-lockup', dark ? 'baixada-game-lockup--dark' : '', className].filter(Boolean).join(' ')}
      style={{ '--baixada-lockup-accent': resolvedAccent } as CssVars}
    >
      <div className="baixada-game-lockup__eyebrow">Baixada</div>
      <div className="baixada-game-lockup__rule" />
      <div className="baixada-game-lockup__name">{game}</div>
      {suffix && (
        <div className="baixada-game-lockup__suffix">
          <Plaque color={resolvedAccent}>{suffix}</Plaque>
        </div>
      )}
    </div>
  )
}

export function BaixadaHorizontalLockup({ className }: { className?: string }) {
  return (
    <div className={['baixada-horizontal-lockup', className].filter(Boolean).join(' ')}>
      <PorchLamp size={64} color="var(--brass-0)" glow="var(--brass-1)" />
      <div>
        <div className="baixada-horizontal-lockup__name">Baixada</div>
        <div className="baixada-horizontal-lockup__label">card games · the south</div>
      </div>
    </div>
  )
}

export function BaixadaStamp({
  letter = 'B',
  className,
  title = 'Baixada',
}: {
  letter?: string
  className?: string
  title?: string
}) {
  return (
    <span className={['baixada-stamp', className].filter(Boolean).join(' ')} role="img" aria-label={title}>
      <span className="baixada-stamp__letter">{letter}</span>
    </span>
  )
}
