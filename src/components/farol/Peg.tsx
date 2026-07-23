import './Peg.css'

export type PegState = 'idle' | 'pending' | 'accept' | 'legal' | 'future' | 'past' | 'ours'

interface PegProps {
  value: number
  state?: PegState
  size?: number
  style?: React.CSSProperties
  onClick?: () => void
  title?: string
}

const OPTICAL_LIFT: Record<number, number> = {
  3: -0.12, 9: -0.10, 6: -0.06, 12: -0.05,
}

export function Peg({ value, state = 'idle', size = 42, style, onClick, title }: PegProps) {
  const liftEm = OPTICAL_LIFT[value] ?? -0.05
  return (
    <div
      className={`peg peg-${state}`}
      onClick={onClick}
      title={title}
      style={{ width: size, height: size, ...style }}
    >
      <div className="peg-top">
        <span
          className="peg-num"
          style={{ fontSize: Math.round(size * 0.44), marginTop: `${liftEm}em` }}
        >
          {value}
        </span>
      </div>
    </div>
  )
}
