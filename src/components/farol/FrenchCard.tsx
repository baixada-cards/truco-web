import './FrenchCard.css'

import type { CardSize } from './SpanishCard'

export type FrenchSuit = 'ouros' | 'copas' | 'espadas' | 'paus'
export type FrenchRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 'J' | 'Q' | 'K'

type GlyphProps = {
  size?: number
  color: string
}

function SpadeGlyph({ size = 24, color }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'block' }}>
      <path
        d="M 12 2.5 C 9 7 3.5 10.5 3.5 14.5 C 3.5 16.8 5.4 18.7 7.7 18.7 C 9.2 18.7 10.5 17.9 11.1 16.7 L 9.8 21.5 L 14.2 21.5 L 12.9 16.7 C 13.5 17.9 14.8 18.7 16.3 18.7 C 18.6 18.7 20.5 16.8 20.5 14.5 C 20.5 10.5 15 7 12 2.5 Z"
        fill={color}
      />
    </svg>
  )
}

function HeartGlyph({ size = 24, color }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'block' }}>
      <path
        d="M 12 21 C 10 18.8 3.5 14.5 3.5 9.6 C 3.5 6.9 5.6 4.8 8.2 4.8 C 10 4.8 11.2 5.7 12 7 C 12.8 5.7 14 4.8 15.8 4.8 C 18.4 4.8 20.5 6.9 20.5 9.6 C 20.5 14.5 14 18.8 12 21 Z"
        fill={color}
      />
    </svg>
  )
}

function DiamondGlyph({ size = 24, color }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'block' }}>
      <path d="M 12 2.5 L 19 12 L 12 21.5 L 5 12 Z" fill={color} />
    </svg>
  )
}

function ClubGlyph({ size = 24, color }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'block' }}>
      <path
        d="M 12 3 C 14.4 3 16.4 4.9 16.4 7.3 C 16.4 7.7 16.3 8.1 16.2 8.5 C 16.7 8.4 17.2 8.3 17.7 8.3 C 20.1 8.3 22 10.2 22 12.6 C 22 15 20.1 16.9 17.7 16.9 C 15.9 16.9 14.4 15.7 13.8 14.1 L 14.5 21.5 L 9.5 21.5 L 10.2 14.1 C 9.6 15.7 8.1 16.9 6.3 16.9 C 3.9 16.9 2 15 2 12.6 C 2 10.2 3.9 8.3 6.3 8.3 C 6.8 8.3 7.3 8.4 7.8 8.5 C 7.7 8.1 7.6 7.7 7.6 7.3 C 7.6 4.9 9.6 3 12 3 Z"
        fill={color}
      />
    </svg>
  )
}

type GlyphComponent = (props: GlyphProps) => React.ReactElement

const FRENCH_SUITS: Record<FrenchSuit, { Glyph: GlyphComponent; color: string }> = {
  ouros: { Glyph: DiamondGlyph, color: 'var(--suit-ochre)' },
  copas: { Glyph: HeartGlyph, color: 'var(--suit-red)' },
  espadas: { Glyph: SpadeGlyph, color: 'var(--suit-black)' },
  paus: { Glyph: ClubGlyph, color: 'var(--suit-green)' },
}

const FRENCH_RANK_LABEL: Record<FrenchRank, string> = {
  1: 'A',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  J: 'J',
  Q: 'Q',
  K: 'K',
}

const FRENCH_RANK_FULL: Partial<Record<FrenchRank, string>> = {
  J: 'valete',
  Q: 'dama',
  K: 'rei',
}

const PIP_LAYOUTS: Partial<Record<FrenchRank, ReadonlyArray<readonly [number, number, boolean?]>>> = {
  1: [[0.5, 0.5]],
  2: [[0.5, 0.20], [0.5, 0.80, true]],
  3: [[0.5, 0.20], [0.5, 0.50], [0.5, 0.80, true]],
  4: [[0.30, 0.22], [0.70, 0.22], [0.30, 0.78, true], [0.70, 0.78, true]],
  5: [[0.30, 0.22], [0.70, 0.22], [0.50, 0.50], [0.30, 0.78, true], [0.70, 0.78, true]],
  6: [[0.30, 0.22], [0.70, 0.22], [0.30, 0.50], [0.70, 0.50], [0.30, 0.78, true], [0.70, 0.78, true]],
  7: [[0.30, 0.18], [0.70, 0.18], [0.50, 0.36], [0.30, 0.54], [0.70, 0.54], [0.30, 0.82, true], [0.70, 0.82, true]],
}

const DIMS: Record<CardSize, { w: number; h: number; rankSize: number; cornerGlyph: number; pipGlyph: number }> = {
  sm: { w: 52, h: 78, rankSize: 13, cornerGlyph: 7, pipGlyph: 10 },
  md: { w: 84, h: 128, rankSize: 23, cornerGlyph: 11, pipGlyph: 16 },
  lg: { w: 120, h: 180, rankSize: 36, cornerGlyph: 18, pipGlyph: 26 },
}

function FrenchPipCluster({
  rank,
  suit,
  glyphSize,
}: {
  rank: FrenchRank
  suit: FrenchSuit
  glyphSize: number
}) {
  const pips = PIP_LAYOUTS[rank]
  if (!pips) return null

  const { Glyph, color } = FRENCH_SUITS[suit]

  return (
    <div className="fcard-pipfield">
      {pips.map(([x, y, flip], index) => (
        <div
          className="fcard-pip"
          key={index}
          style={{
            left: `${x * 100}%`,
            top: `${y * 100}%`,
            transform: `translate(-50%, -50%)${flip ? ' rotate(180deg)' : ''}`,
          }}
        >
          <Glyph size={glyphSize} color={color} />
        </div>
      ))}
    </div>
  )
}

export function FrenchCard({
  rank,
  suit,
  size = 'md',
  faceDown = false,
  lost = false,
  isManilha = false,
  manilhaSuitStrength,
  className = '',
  style,
}: {
  rank: FrenchRank
  suit: FrenchSuit
  size?: CardSize
  faceDown?: boolean
  lost?: boolean
  isManilha?: boolean
  manilhaSuitStrength?: 0 | 1 | 2 | 3
  className?: string
  style?: React.CSSProperties
}) {
  const dims = DIMS[size]

  if (faceDown) {
    return (
      <div
        className={['fcard-back', className].filter(Boolean).join(' ')}
        style={{ width: dims.w, height: dims.h, ...style }}
        aria-hidden="true"
      >
        <div className="fcard-back-pattern">
          <svg viewBox="0 0 60 90" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
            <g fill="none" stroke="rgba(200,160,100,0.30)" strokeWidth="0.6">
              <circle cx="30" cy="45" r="18" />
              <circle cx="30" cy="45" r="13" />
              <circle cx="30" cy="45" r="8" />
            </g>
            <g fill="rgba(200,160,100,0.32)">
              {[0, 60, 120, 180, 240, 300].map((deg) => (
                <path
                  key={deg}
                  d="M 30 27 L 31.2 45 L 30 63 L 28.8 45 Z"
                  transform={`rotate(${deg} 30 45)`}
                />
              ))}
              <circle cx="30" cy="45" r="2.2" />
            </g>
          </svg>
        </div>
      </div>
    )
  }

  const { Glyph, color } = FRENCH_SUITS[suit]
  const isFace = rank === 'J' || rank === 'Q' || rank === 'K'
  const label = FRENCH_RANK_LABEL[rank]
  const manilhaClass = isManilha
    ? `fcard-manilha${manilhaSuitStrength != null ? ` fcard-manilha-s${manilhaSuitStrength}` : ''}`
    : ''

  return (
    <div
      className={['fcard', lost ? 'fcard-lost' : '', manilhaClass, className].filter(Boolean).join(' ')}
      style={{ width: dims.w, height: dims.h, ...style }}
    >
      <div className="fcard-inner">
        <div className="fcard-corner fcard-corner-tl" style={{ color }}>
          <div className="fcard-corner-rank" style={{ fontSize: dims.rankSize * 0.85 }}>{label}</div>
          <Glyph size={dims.cornerGlyph} color={color} />
        </div>

        <div className="fcard-center">
          {isFace ? (
            <div className="fcard-face">
              <div className="fcard-face-letter" style={{ color, fontSize: dims.rankSize * 2 }}>{label}</div>
              <div className="fcard-face-label">{FRENCH_RANK_FULL[rank]}</div>
              <Glyph size={dims.cornerGlyph * 1.4} color={color} />
            </div>
          ) : (
            <FrenchPipCluster
              rank={rank}
              suit={suit}
              glyphSize={rank === 1 ? Math.round(dims.pipGlyph * 2.1) : dims.pipGlyph}
            />
          )}
        </div>

        <div className="fcard-corner fcard-corner-br" style={{ color }}>
          <div className="fcard-corner-rank" style={{ fontSize: dims.rankSize * 0.85 }}>{label}</div>
          <Glyph size={dims.cornerGlyph} color={color} />
        </div>
      </div>
    </div>
  )
}
