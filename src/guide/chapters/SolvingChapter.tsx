// Chapter — what "solving" a game like truco even means, reworked around
// the toy game (plan 77 J-1): a one-street bluff at the engine's real
// stakes, solved analytically in the copy, then the reason equilibria mix,
// then how CFR computes the real thing. Ends on a references footer.

import { useTranslations } from 'next-intl'

import { ChapterRefs } from '../ChapterRefs'
import styles from '../guide.module.css'
import { Math } from '../Math'
import { ToyGameWidget } from '../plates/ToyGameWidget'
import { Reveal, Section } from '../Section'
import { Prose } from '../Prose'
import { rich } from '../rich'

const TEX = {
  evCall: String.raw`\mathrm{EV}_{\text{call}} \;=\; p\,(-3) \;+\; (1-p)\,(+3) \;=\; 3 - 6p`,
  indiff: String.raw`3 - 6p \;=\; \underbrace{-1}_{\text{fold}} \quad\Longrightarrow\quad p^{\star} = \tfrac{2}{3}`,
  posterior: String.raw`P(\text{m}\clubsuit \mid \text{truco}) \;=\; \frac{\tfrac12}{\tfrac12 + \tfrac12\,b} \;=\; \frac{1}{1+b} \;\overset{!}{=}\; \tfrac{2}{3} \quad\Longrightarrow\quad b^{\star} = \tfrac{1}{2}`,
  bluffEv: String.raw`\mathrm{EV}_{\text{bluff}} \;=\; c\,(-3) \;+\; (1-c)\,(+1) \;=\; 1 - 4c \;\overset{!}{=}\; -1 \quad\Longrightarrow\quad c^{\star} = \tfrac{1}{2}`,
  regretSum: String.raw`R^{T}(a) \;=\; \sum_{t \,\le\, T} \Bigl( u_t(a) - u_t(\sigma_t) \Bigr)`,
  regretMatch: String.raw`\sigma_{T+1}(a) \;=\; \frac{\max\!\bigl(R^{T}(a),\,0\bigr)}{\sum_{a'} \max\!\bigl(R^{T}(a'),\,0\bigr)}`,
} as const

export function SolvingChapter() {
  const t = useTranslations('Study.guide')
  return (
    <>
      <Reveal>
        <Prose>{t.rich('sec.solving.p1', rich)}</Prose>
      </Reveal>

      <Section id="toy" mark="§ 1" title={t('sec.solving.toyHead')}>
        <Prose>{t.rich('sec.solving.toySetup', rich)}</Prose>
        <ToyGameWidget />
        <Prose>{t.rich('sec.solving.toyP2', rich)}</Prose>
        <div className={styles.formula}>
          <Math display tex={TEX.evCall} />
          <Math display tex={TEX.indiff} />
          <p className={styles.formulaNote}>{t('sec.solving.toyFnote')}</p>
        </div>
        <Prose>{t.rich('sec.solving.toyP3', rich)}</Prose>
      </Section>

      <Section id="mixing" mark="§ 2" title={t('sec.solving.mixHead')}>
        <Prose>{t.rich('sec.solving.mixP1', rich)}</Prose>
        <Prose>{t.rich('sec.solving.mixP2', rich)}</Prose>
        <div className={styles.formula}>
          <Math display tex={TEX.posterior} />
          <Math display tex={TEX.bluffEv} />
          <p className={styles.formulaNote}>{t('sec.solving.mixFnote')}</p>
        </div>
        <p className={styles.takeaway}>{t('sec.solving.mixTakeaway')}</p>
      </Section>

      <Section id="cfr" mark="§ 3" title={t('sec.solving.cfrHead')}>
        <Prose>{t.rich('sec.solving.cfrP1', rich)}</Prose>
        <div className={styles.formula}>
          <Math display tex={TEX.regretSum} />
          <Math display tex={TEX.regretMatch} />
          <p className={styles.formulaNote}>{t('sec.solving.cfrFnote')}</p>
        </div>
        <Prose>{t.rich('sec.solving.cfrP2', rich)}</Prose>
        <p className={styles.aside}>{t('sec.solving.aside')}</p>
      </Section>

      <ChapterRefs
        items={[
          {
            label:
              'Todd W. Neller & Marc Lanctot (2013), “An Introduction to Counterfactual Regret Minimization”',
            href: 'http://modelai.gettysburg.edu/2013/cfr/cfr.pdf',
          },
        ]}
      />
    </>
  )
}
