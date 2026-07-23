'use client'

import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useFormatter, useTranslations } from 'next-intl'

import styles from '../guide.module.css'

type NodeProps = {
  x: number
  y: number
  score: string
  kind?: 'root' | 'eleven' | 'ordinary'
  label?: string
  tooltip: string
  onActivate: (tooltip: string) => void
  onDeactivate: () => void
}

function ScoreNode({ x, y, score, kind = 'ordinary', label, tooltip, onActivate, onDeactivate }: NodeProps) {
  const width = kind === 'root' ? 140 : 126
  const height = kind === 'root' ? 56 : 50

  return (
    <g
      aria-label={tooltip}
      className={styles.dependencyNode}
      data-kind={kind}
      onBlur={onDeactivate}
      onFocus={() => onActivate(tooltip)}
      onMouseEnter={() => onActivate(tooltip)}
      onMouseLeave={onDeactivate}
      role="group"
      tabIndex={0}
      transform={`translate(${x - width / 2} ${y - height / 2})`}
    >
      <rect width={width} height={height} rx="7" />
      <text x={width / 2} y={label ? 23 : 31} textAnchor="middle">{score}</text>
      {label ? <text className={styles.dependencyNodeLabel} x={width / 2} y="41" textAnchor="middle">{label}</text> : null}
    </g>
  )
}

/** Dealer-is-pé cells from the shipped `solutions/match_values.bin`, expressed by role. */
const STORED_ROLE_EQUITY: Partial<Record<string, { mao: number, pe: number }>> = {
  '11 × 11': { mao: 0.44685, pe: 0.55315 },
  '11 × 10': { mao: 0.63367, pe: 0.36633 },
  '10 × 11': { mao: 0.36609, pe: 0.63391 },
  '9 × 11': { mao: 0.27976, pe: 0.72024 },
  '11 × 9': { mao: 0.68749, pe: 0.31251 },
  '11 × 8': { mao: 0.79284, pe: 0.20716 },
  '8 × 11': { mao: 0.20491, pe: 0.79509 },
}

/** A deliberately shallow slice of the role-ordered score dependency DAG. */
export function ScoreDependencyPlate() {
  const t = useTranslations('Study.guide.sec.abstractions.dependencies')
  const format = useFormatter()
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const rawId = useId()
  const id = rawId.replaceAll(':', '')
  const markerId = `dependency-arrow-${id}`
  const fadeMarkerId = `dependency-fade-arrow-${id}`
  const paperId = `dependency-paper-${id}`
  const rootId = `dependency-root-${id}`
  const glowId = `dependency-glow-${id}`

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || viewport.scrollWidth <= viewport.clientWidth) return
    viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2
  }, [])

  const nodeTooltip = (score: string) => {
    const equity = STORED_ROLE_EQUITY[score]
    if (!equity) return t('missingEquity', { score })
    const percent = (value: number) => format.number(value, {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })
    return t('storedEquity', { score, mao: percent(equity.mao), pe: percent(equity.pe) })
  }

  return (
    <figure className={styles.dependencyPlate} aria-label={t('aria')}>
      <header className={styles.dependencyHead}>
        <span>{t('kicker')}</span>
        <strong>{t('title')}</strong>
        <div className={styles.dependencyHeadMeta}>
          <small>{t('edge')}</small>
          <output aria-live="polite" data-active={activeTooltip ? 'true' : 'false'}>
            {activeTooltip ?? t('hoverHint')}
          </output>
        </div>
      </header>

      <div className={styles.dependencyViewport} ref={viewportRef}>
        <svg className={styles.dependencyTree} viewBox="0 0 900 500" role="img" aria-label={t('treeAria')}>
          <defs>
            <linearGradient id={paperId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f6edd7" />
              <stop offset="1" stopColor="#e9dbb8" />
            </linearGradient>
            <linearGradient id={rootId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f2dda0" />
              <stop offset="1" stopColor="#d9b95d" />
            </linearGradient>
            <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#20150e" floodOpacity=".45" />
            </filter>
            <marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10Z" />
            </marker>
            <marker id={fadeMarkerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10Z" opacity=".52" />
            </marker>
          </defs>

          <g className={styles.dependencyEdges} markerEnd={`url(#${markerId})`}>
            <path d="M450 80C450 112 300 102 300 120" />
            <path d="M450 80C450 112 600 102 600 120" />

            <path d="M300 170C300 198 170 194 170 215" />
            <path d="M300 170C300 202 450 188 450 215" />
            <path d="M600 170C600 202 450 188 450 215" />
            <path d="M600 170C600 198 730 194 730 215" />

            <path d="M170 265C170 292 90 287 90 310" />
            <path d="M170 265C170 298 310 285 310 310" />
            <path d="M450 265C450 296 310 286 310 310" />
            <path d="M450 265C450 296 590 286 590 310" />
            <path d="M730 265C730 298 590 285 590 310" />
            <path d="M730 265C730 292 810 287 810 310" />

            <path d="M310 360C310 398 450 380 450 400" />
            <path d="M590 360C590 398 450 380 450 400" />
          </g>

          <g className={styles.dependencyFades} markerEnd={`url(#${fadeMarkerId})`}>
            <path d="M90 360V410" />
            <path d="M310 360C310 391 245 386 245 412" />
            <path d="M450 450V474" />
            <path d="M590 360C590 391 655 386 655 412" />
            <path d="M810 360V410" />
          </g>
          <g className={styles.dependencyEllipses}>
            <text x="90" y="440" textAnchor="middle">…</text>
            <text x="245" y="442" textAnchor="middle">…</text>
            <text x="450" y="498" textAnchor="middle">…</text>
            <text x="655" y="442" textAnchor="middle">…</text>
            <text x="810" y="440" textAnchor="middle">…</text>
          </g>

          <g style={{ '--dependency-paper': `url(#${paperId})`, '--dependency-root': `url(#${rootId})`, '--dependency-glow': `url(#${glowId})` } as CSSProperties}>
            <ScoreNode x={450} y={50} score="11 × 11" kind="root" label={t('first')} tooltip={nodeTooltip('11 × 11')} onActivate={setActiveTooltip} onDeactivate={() => setActiveTooltip(null)} />
            <ScoreNode x={300} y={145} score="11 × 10" kind="eleven" tooltip={nodeTooltip('11 × 10')} onActivate={setActiveTooltip} onDeactivate={() => setActiveTooltip(null)} />
            <ScoreNode x={600} y={145} score="10 × 11" kind="eleven" tooltip={nodeTooltip('10 × 11')} onActivate={setActiveTooltip} onDeactivate={() => setActiveTooltip(null)} />
            <ScoreNode x={170} y={240} score="9 × 11" kind="eleven" tooltip={nodeTooltip('9 × 11')} onActivate={setActiveTooltip} onDeactivate={() => setActiveTooltip(null)} />
            <ScoreNode x={450} y={240} score="10 × 10" tooltip={nodeTooltip('10 × 10')} onActivate={setActiveTooltip} onDeactivate={() => setActiveTooltip(null)} />
            <ScoreNode x={730} y={240} score="11 × 9" kind="eleven" tooltip={nodeTooltip('11 × 9')} onActivate={setActiveTooltip} onDeactivate={() => setActiveTooltip(null)} />
            <ScoreNode x={90} y={335} score="11 × 8" kind="eleven" tooltip={nodeTooltip('11 × 8')} onActivate={setActiveTooltip} onDeactivate={() => setActiveTooltip(null)} />
            <ScoreNode x={310} y={335} score="10 × 9" tooltip={nodeTooltip('10 × 9')} onActivate={setActiveTooltip} onDeactivate={() => setActiveTooltip(null)} />
            <ScoreNode x={590} y={335} score="9 × 10" tooltip={nodeTooltip('9 × 10')} onActivate={setActiveTooltip} onDeactivate={() => setActiveTooltip(null)} />
            <ScoreNode x={810} y={335} score="8 × 11" kind="eleven" tooltip={nodeTooltip('8 × 11')} onActivate={setActiveTooltip} onDeactivate={() => setActiveTooltip(null)} />
            <ScoreNode x={450} y={425} score="9 × 9" tooltip={nodeTooltip('9 × 9')} onActivate={setActiveTooltip} onDeactivate={() => setActiveTooltip(null)} />
          </g>
        </svg>
      </div>

      <figcaption>{t('caption')}</figcaption>
    </figure>
  )
}
