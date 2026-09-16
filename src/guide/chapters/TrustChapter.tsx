// Chapter vii — what the solve actually measured, where a quality badge comes
// from, and what the warning flag means. The legacy self-loss and own-reach
// diagnostics live in Appendix B (numbers#diagnostics).

import { useTranslations } from 'next-intl'

import { TrustWarningFigure } from '../GuideFigures'
import styles from '../guide.module.css'
import { Reveal, Section } from '../Section'
import { Prose } from '../Prose'
import { rich } from '../rich'

export function TrustChapter() {
  const t = useTranslations('Study.guide')
  return (
    <>
      <Reveal>
        <Prose>{t.rich('sec.trust.intro', rich)}</Prose>
      </Reveal>

      <Section id="badge" mark="§ 1" title={t('sec.trust.badgeHead')}>
        <Prose>{t.rich('sec.trust.badgeP', rich)}</Prose>
        <dl className={styles.trustLevels}>
          <div>
            <dt className={styles.trustSolid}>{t('sec.trust.solidTerm')}</dt>
            <dd>{t('sec.trust.solidDef')}</dd>
          </div>
          <div>
            <dt className={styles.trustCaution}>{t('sec.trust.cautionTerm')}</dt>
            <dd>{t('sec.trust.cautionDef')}</dd>
          </div>
          <div>
            <dt className={styles.trustWeak}>{t('sec.trust.weakTerm')}</dt>
            <dd>{t('sec.trust.weakDef')}</dd>
          </div>
        </dl>
        <p className={styles.aside}>{t('sec.trust.badgeAside')}</p>
      </Section>

      <Section id="warning" mark="§ 2" title={t('sec.trust.warningHead')}>
        <Prose>{t.rich('sec.trust.warningP', rich)}</Prose>
        <TrustWarningFigure />
        <p className={styles.takeaway}>{t('sec.trust.warningTakeaway')}</p>
      </Section>

      <Section id="certificate" mark="§ 3" title={t('sec.trust.certificateHead')}>
        <Prose>{t.rich('sec.trust.certificateP', rich)}</Prose>
        <p className={styles.takeaway}>{t('sec.trust.certificateTakeaway')}</p>
      </Section>
    </>
  )
}
