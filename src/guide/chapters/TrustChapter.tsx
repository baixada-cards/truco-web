// Chapter VI — what the solve actually measured, where a quality badge comes
// from, and why a low-reach continuation can still be garbage.

import { useTranslations } from 'next-intl'

import { TrustWarningFigure } from '../GuideFigures'
import { FormulaTerms, Math } from '../Math'
import styles from '../guide.module.css'
import { Reveal, Section } from '../Section'
import { Prose } from '../Prose'
import { rich } from '../rich'

const TEX = {
  selfLoss: String.raw`L_{\mathrm{self}}(h) = 50\sum_a \sigma(a\mid h)\bigl(\max_{a'}q(a'\mid h)-q(a\mid h)\bigr)`,
  ownReach: String.raw`\rho_{\mathrm{own}}(h) = \prod_{d\,\in\,\ell_{\mathrm{own}}}\sigma(a_d\mid h)`,
} as const

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

      <Section id="diagnostics" mark="§ 3" title={t('sec.trust.diagnosticsHead')}>
        <Prose>{t.rich('sec.trust.diagnosticsP', rich)}</Prose>
        <div className={styles.formula}>
          <Math display tex={TEX.selfLoss} />
          <FormulaTerms
            items={[
              { tex: String.raw`\sigma(a\mid h)`, text: t('symbols.sigma') },
              { tex: String.raw`q(a\mid h)`, text: t('sec.trust.selfLossQ') },
              { tex: String.raw`50`, text: t('sec.trust.selfLossScale') },
            ]}
          />
          <p className={styles.formulaNote}>{t('sec.trust.selfLossNote')}</p>
        </div>
        <div className={styles.formula}>
          <Math display tex={TEX.ownReach} />
          <FormulaTerms
            items={[
              { tex: String.raw`\ell_{\mathrm{own}}`, text: t('sec.trust.ownLine') },
              { tex: String.raw`\rho_{\mathrm{own}}`, text: t('sec.trust.ownReach') },
            ]}
          />
          <p className={styles.formulaNote}>{t('sec.trust.ownReachNote')}</p>
        </div>
        <Prose>{t.rich('sec.trust.pruningP', rich)}</Prose>
      </Section>

      <Section id="certificate" mark="§ 4" title={t('sec.trust.certificateHead')}>
        <Prose>{t.rich('sec.trust.certificateP', rich)}</Prose>
        <p className={styles.takeaway}>{t('sec.trust.certificateTakeaway')}</p>
      </Section>
    </>
  )
}
