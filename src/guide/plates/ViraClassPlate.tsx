import { useTranslations } from 'next-intl'

import styles from '../guide.module.css'

const CONCRETE = {
  '2': {
    plain: ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2'],
    manilha: '3',
  },
  '3': {
    plain: ['5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'],
    manilha: '4',
  },
} as const

type MergedVira = keyof typeof CONCRETE
const VIRAS = Object.entries(CONCRETE) as Array<[MergedVira, (typeof CONCRETE)[MergedVira]]>

/** Static proof-by-inspection for the only merged vira class in the deck. */
export function ViraClassPlate() {
  const t = useTranslations('Study.guide.sec.abstractions.visual')

  return (
    <figure className={styles.viraClassPlate} aria-label={t('aria')}>
      <header className={styles.viraClassHead}>
        <div>
          <span className={styles.viraClassKicker}>{t('kicker')}</span>
          <strong>{t('title')}</strong>
        </div>
      </header>

      <div className={styles.viraRowsViewport}>
        <div className={styles.viraRows}>
          <div className={styles.viraRowHead}>
            <span>{t('concrete')}</span>
            <span>{t('plain')}</span>
            <span>{t('manilhas')}</span>
          </div>
          {VIRAS.map(([vira, concrete]) => (
            <div className={styles.viraRow} key={vira}>
              <div className={styles.viraRowName}>
                <strong>{t('viraChoice', { rank: vira })}</strong>
                <span>{t('manilhaValue', { rank: concrete.manilha })}</span>
              </div>
              <div className={styles.viraPlainRanks}>
                {concrete.plain.map((rank, index) => (
                  <span key={rank} className={index === concrete.plain.length - 1 ? styles.viraRankShort : undefined}>
                    <b>{rank}</b>
                    <small>×{index === concrete.plain.length - 1 ? 3 : 4}</small>
                  </span>
                ))}
              </div>
              <div className={styles.viraManilhas}>
                {(['♦', '♠', '♥', '♣'] as const).map((suit) => (
                  <span key={suit}>
                    <b>{concrete.manilha}</b>
                    <i data-suit={suit}>{suit}</i>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <figcaption>{t('caption')}</figcaption>
    </figure>
  )
}
