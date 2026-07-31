// Part II, chapter: the habits that cost the most. Common human habits
// priced as one-shot deviations against the solved equilibrium — the
// deal-weighted mean and the single worst case, in match-win percentage
// points. Sources: the same certified exports the lab renders (10×10 and
// the 11×N roots, tc0); each figure is a citable constant measured off
// those windows (see plans/80 notes, 2026-07-18).

import { useTranslations } from 'next-intl'

import styles from '../guide.module.css'
import { LabSpotLink } from '../LabSpotLink'
import { Reveal, Section } from '../Section'
import { Prose } from '../Prose'
import { rich } from '../rich'

const HABIT_ROWS = [
  { key: 'habitAcceptTruco', mean: '10.4', worst: '36.6' },
  { key: 'habitFoldTruco', mean: '6.2', worst: '—' },
  { key: 'habitAcceptEleven', mean: '26.2', worst: '63.4' },
  { key: 'habitFoldEleven', mean: '18.7', worst: '55.3' },
  { key: 'habitLeadManilha', mean: '4.1', worst: '19.8' },
  { key: 'habitLeadStrongest', mean: '1.2', worst: '—' },
] as const

export function LeaksChapter() {
  const t = useTranslations('Study.guide')

  return (
    <>
      <Reveal>
        <Prose>{t.rich('sec.leaks.lede', rich)}</Prose>
      </Reveal>

      <Section id="pricing" mark="§ 1" title={t('sec.leaks.pricingHead')}>
        <Prose>{t.rich('sec.leaks.pricingP1', rich)}</Prose>
        <aside className={styles.margin}>{t.rich('sec.leaks.pricingAside', rich)}</aside>
      </Section>

      <Section id="table" mark="§ 2" title={t('sec.leaks.tableHead')}>
        <div className={styles.treeTableWrap}>
          <table className={`${styles.treeTable} ${styles.statTable}`}>
            <colgroup>
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th>{t('sec.leaks.colHabit')}</th>
                <th>{t('sec.leaks.colMean')}</th>
                <th>{t('sec.leaks.colWorst')}</th>
              </tr>
            </thead>
            <tbody>
              {HABIT_ROWS.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{t(`sec.leaks.${row.key}`)}</th>
                  <td>{row.mean}</td>
                  <td>{row.worst}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Prose>{t.rich('sec.leaks.tableP1', rich)}</Prose>
      </Section>

      <Section id="reading" mark="§ 3" title={t('sec.leaks.readingHead')}>
        <Prose>{t.rich('sec.leaks.readingP1', rich)}</Prose>
        <Prose>{t.rich('sec.leaks.readingP2', rich)}</Prose>
        <aside className={styles.margin}>{t.rich('sec.leaks.readingAside', rich)}</aside>
        {/* the bundled 11×9 eleven spot: the side on eleven deals, so the
            role-ordered string is mão 9 × pé 11 */}
        <LabSpotLink spot="9x11 v4" />
      </Section>
    </>
  )
}
