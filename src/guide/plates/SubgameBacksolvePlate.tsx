import { useTranslations } from 'next-intl'

import styles from '../guide.module.css'

const HAND_SAMPLES = [
  {
    key: 'sampleOne', comparison: '>', outcome: 'accept',
    cards: [{ rank: '5', suit: '♦' }, { rank: 'A' }, { rank: '4' }],
  },
  {
    key: 'sampleFour', comparison: '<', outcome: 'fold',
    cards: [{ rank: 'A' }, { rank: 'Q' }, { rank: '4' }],
  },
] as const

/** Actual root hands from the shipped vira-4/dealer-0 mão-de-onze solve. */
export function SubgameBacksolvePlate() {
  const t = useTranslations('Study.guide.sec.abstractions.backsolve')

  return (
    <figure className={styles.backsolvePlate} aria-label={t('aria')}>
      <header className={styles.backsolveHead}>
        <span>{t('kicker')}</span>
        <strong>{t('title')}</strong>
        <small>{t('context')}</small>
      </header>

      <div className={styles.backsolveRoot}>
        <small>{t('rootLabel')}</small>
        <strong>{t('rootValue')}</strong>
      </div>

      <div className={styles.backsolveFork}>
        <svg viewBox="0 0 100 42" preserveAspectRatio="none" aria-hidden>
          <path d="M50 0V12M50 12H25V42M50 12H75V42" />
        </svg>
        <span className={styles.backsolveAcceptEdge}>{t('acceptEdge')}</span>
        <span className={styles.backsolveFoldEdge}>{t('foldEdge')}</span>
      </div>

      <div className={styles.backsolveBranches}>
        <article>
          <span>{t('acceptLabel')}</span>
          <div className={styles.backsolveHandValues}>
            {HAND_SAMPLES.map((sample) => (
              <div
                className={styles.backsolveHandSample}
                data-outcome={sample.outcome}
                key={sample.key}
                aria-label={`${t(`${sample.key}Hand`)}: ${t(`${sample.key}Chance`)} ${sample.comparison} ${t('foldChance')}; ${t(sample.outcome)}`}
              >
                <span className={styles.backsolveSampleTop}>
                  <b className={styles.backsolveOutcome} data-outcome={sample.outcome}>
                    {t(sample.outcome)}
                  </b>
                  <strong className={styles.backsolveEquity}>{t(`${sample.key}Chance`)}</strong>
                </span>
                <span className={styles.backsolveSampleBottom}>
                  <span className={styles.backsolveMiniCards} aria-hidden>
                    {sample.cards.map((card, index) => (
                      <span className={styles.backsolveMiniCard} key={`${card.rank}-${index}`}>
                        <b>{card.rank}</b>
                        {'suit' in card ? <i data-suit={card.suit}>{card.suit}</i> : null}
                      </span>
                    ))}
                  </span>
                  <span className={styles.backsolveThreshold}>
                    <i>{sample.comparison}</i>
                    <small>{t('foldChance')}</small>
                  </span>
                </span>
              </div>
            ))}
            <span className={styles.backsolveMore} aria-label={t('moreHands')}>…</span>
          </div>
        </article>
        <article className={styles.backsolveFold}>
          <span>{t('foldLabel')}</span>
          <div className={styles.backsolveValue}>
            <strong>{t('foldChance')}</strong>
            <small>{t('foldChanceNote')}</small>
          </div>
        </article>
      </div>

      <div className={styles.backsolveVerdict}>
        <strong>{t('verdict')}</strong>
        <span>{t('legend')}</span>
      </div>

      <figcaption>{t('caption')}</figcaption>
    </figure>
  )
}
