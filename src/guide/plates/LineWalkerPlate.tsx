'use client'

// Plate VII — a deliberately small rail. It teaches the interaction contract
// before the reader reaches the full Study timeline: focus moves through a
// single line; it does not rewrite the whole hand.

import { useState } from 'react'

import { MiniCard } from '../../components/study/ChartCells'
import { classInfos } from '../../lib/study-data'
import styles from '../guide.module.css'
import { useTranslations } from 'next-intl'

const STEPS = ['deal', 'lead', 'reply', 'next'] as const

export function LineWalkerPlate() {
  const t = useTranslations('Study.guide')
  const infos = classInfos(0, 'cards')
  const [step, setStep] = useState(0)
  return (
    <figure className={styles.plate}>
      <div className={`${styles.figCanvas} ${styles.walkerPlate}`}>
        <div className={styles.walkerRail} aria-label={t('sec.chart.walkerAria')}>
          {STEPS.map((key, index) => (
            <button
              key={key}
              type="button"
              className={step === index ? styles.walkerStepOn : styles.walkerStep}
              aria-pressed={step === index}
              onClick={() => setStep(index)}
            >
              <span>{index + 1}</span>
              {t(`sec.chart.walker.${key}`)}
            </button>
          ))}
        </div>
        <div className={styles.walkerReadout} aria-live="polite">
          <span className={styles.rangeEyebrow}>{t('sec.chart.walker.focus')}</span>
          <h3>{t(`sec.chart.walker.${STEPS[step]}`)}</h3>
          <p>{t(`sec.chart.walker.${STEPS[step]}P`)}</p>
          <div className={styles.walkerCards} aria-hidden>
            {step >= 1 ? <MiniCard info={infos[0]} /> : <span className={styles.walkerUnknown}>?</span>}
            {step >= 2 ? <MiniCard info={infos[2]} /> : <span className={styles.walkerUnknown}>?</span>}
          </div>
        </div>
      </div>
      <figcaption className={styles.plateCaption}>
        <span className={styles.plateNo}>VII</span> {t('sec.chart.walkerCaption')}
      </figcaption>
    </figure>
  )
}
