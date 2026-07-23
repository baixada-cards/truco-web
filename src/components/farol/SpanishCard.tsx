import './SpanishCard.css'

export type Suit = 'espadas' | 'bastos' | 'copas' | 'oros'
export type CardSize = 'sm' | 'md' | 'lg'

// ─── SVG suit glyphs ────────────────────────────────────────────────────────

function OrosGlyph({ size = 24, color }: { size?: number; color: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'block' }}>
      <circle cx="12" cy="12" r="10" fill={color} />
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="var(--card-0)" strokeWidth="1.2" />
      <circle cx="12" cy="12" r="2" fill="var(--card-0)" />
    </svg>
  )
}

function CopasGlyph({ size = 24, color }: { size?: number; color: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'block' }}>
      <path
        d="M 5 3 L 19 3 L 19 5 C 19 10 16 13 13 13.5 L 13 19 L 17 19 L 17 21 L 7 21 L 7 19 L 11 19 L 11 13.5 C 8 13 5 10 5 5 Z"
        fill={color}
      />
    </svg>
  )
}

function EspadasGlyph({ size = 24, color }: { size?: number; color: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'block' }}>
      <path d="M 11 2 L 13 2 L 13 15 L 11 15 Z" fill={color} />
      <path d="M 11 2 L 12 0.5 L 13 2 Z" fill={color} />
      <rect x="6" y="15" width="12" height="1.8" fill={color} />
      <rect x="11.3" y="16.8" width="1.4" height="3.5" fill={color} />
      <circle cx="12" cy="21.2" r="1.4" fill={color} />
    </svg>
  )
}

function BastosGlyph({ size = 24, color }: { size?: number; color: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'block' }}>
      <path
        d="M 9 2 Q 6 4 7 8 L 10 18 Q 10.5 21 12 21.5 Q 13.5 21 14 18 L 17 8 Q 18 4 15 2 Q 12 3.5 9 2 Z"
        fill={color}
      />
      <circle cx="10" cy="9" r="0.9" fill="var(--card-0)" opacity="0.5" />
      <circle cx="14" cy="13" r="0.9" fill="var(--card-0)" opacity="0.5" />
      <circle cx="11" cy="16" r="0.7" fill="var(--card-0)" opacity="0.5" />
    </svg>
  )
}

type GlyphComponent = (props: { size?: number; color: string }) => React.ReactElement

const SUIT_MAP: Record<Suit, { Glyph: GlyphComponent; color: string }> = {
  oros:    { Glyph: OrosGlyph,    color: 'var(--suit-ochre)' },
  copas:   { Glyph: CopasGlyph,   color: 'var(--suit-red)' },
  espadas: { Glyph: EspadasGlyph, color: 'var(--suit-black)' },
  bastos:  { Glyph: BastosGlyph,  color: 'var(--suit-green)' },
}

const RANK_LABEL: Record<number, string> = {
  1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7',
  10: 'S', 11: 'C', 12: 'R',
}

const RANK_FULL: Record<number, string> = {
  10: 'Sota', 11: 'Caballo', 12: 'Rey',
}

const DIMS: Record<CardSize, { w: number; h: number; rankSize: number; cornerGlyph: number; centerGlyph: number }> = {
  sm: { w: 52,  h: 78,  rankSize: 18, cornerGlyph: 10, centerGlyph: 30 },
  md: { w: 84,  h: 128, rankSize: 28, cornerGlyph: 14, centerGlyph: 50 },
  lg: { w: 120, h: 180, rankSize: 42, cornerGlyph: 20, centerGlyph: 72 },
}

interface SpanishCardProps {
  rank: number
  suit: Suit
  size?: CardSize
  faceDown?: boolean
  lost?: boolean
  isManilha?: boolean
  manilhaSuitStrength?: 0 | 1 | 2 | 3
  className?: string
  style?: React.CSSProperties
}

export function SpanishCard({
  rank,
  suit,
  size = 'md',
  faceDown = false,
  lost = false,
  isManilha = false,
  manilhaSuitStrength,
  className = '',
  style,
}: SpanishCardProps) {
  const dims = DIMS[size]

  if (faceDown) {
    return (
      <div
        className={`spcard-back ${className}`}
        style={{ width: dims.w, height: dims.h, ...style }}
        aria-hidden="true"
      >
        <div className="spcard-back-pattern" />
      </div>
    )
  }

  const { Glyph, color } = SUIT_MAP[suit]
  const isFace = rank >= 10
  const rankLabel = RANK_LABEL[rank] ?? String(rank)
  const manilhaClass = isManilha
    ? `spcard-manilha${manilhaSuitStrength != null ? ` spcard-manilha-s${manilhaSuitStrength}` : ''}`
    : ''

  return (
    <div
      className={['spcard', lost ? 'spcard-lost' : '', manilhaClass, className].filter(Boolean).join(' ')}
      style={{ width: dims.w, height: dims.h, ...style }}
    >
      <div className="spcard-inner">
        <div className="spcard-corner spcard-corner-tl" style={{ color }}>
          <div style={{ fontSize: dims.rankSize * 0.6, fontWeight: 600, lineHeight: 1 }}>{rankLabel}</div>
          <Glyph size={dims.cornerGlyph} color={color} />
        </div>

        <div className="spcard-center">
          {isFace ? (
            <div className="spcard-face">
              <div className="spcard-face-letter" style={{ color, fontSize: dims.centerGlyph * 0.95 }}>
                {rankLabel}
              </div>
              <div className="spcard-face-label">{RANK_FULL[rank]}</div>
              <Glyph size={dims.cornerGlyph * 1.4} color={color} />
            </div>
          ) : (
            <div className="spcard-pip">
              <div className="spcard-pip-num" style={{ color, fontSize: dims.rankSize * 1.2 }}>{rankLabel}</div>
              <Glyph size={dims.centerGlyph} color={color} />
            </div>
          )}
        </div>

        <div className="spcard-corner spcard-corner-br" style={{ color }}>
          <div style={{ fontSize: dims.rankSize * 0.6, fontWeight: 600, lineHeight: 1 }}>{rankLabel}</div>
          <Glyph size={dims.cornerGlyph} color={color} />
        </div>
      </div>
    </div>
  )
}
