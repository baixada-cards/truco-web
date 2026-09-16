// Chapter viii — studying with the lab. The one chapter that is a method
// rather than a reference: a single loop from a decision the reader faces
// often to a named habit, its price, and a rule to carry to the table. The
// worked example is the tour's spot (the leader's opening lead at 11×11,
// 4 turned up), and every number is read from that export at render time
// (see method-data.ts), so the copy can never drift from the chart.

import { useTranslations } from 'next-intl'

import styles from '../guide.module.css'
import { LabSpotLink } from '../LabSpotLink'
import { METHOD_SPOT, methodFacts } from '../method-data'
import { Reveal, Section } from '../Section'
import { Prose } from '../Prose'
import { rich } from '../rich'

export function MethodChapter() {
  const t = useTranslations('Study.guide')
  const f = methodFacts()
  return (
    <>
      <Reveal>
        <Prose>{t.rich('sec.method.lede', rich)}</Prose>
      </Reveal>

      <Section id="spot" mark="§ 1" title={t('sec.method.spotHead')}>
        <Prose>{t.rich('sec.method.spotP1', rich)}</Prose>
        <LabSpotLink spot={METHOD_SPOT} />
        <Prose>
          {t.rich('sec.method.spotP2', { ...rich, holdings: f.holdings, equity: f.equityPct })}
        </Prose>
      </Section>

      <Section id="habit" mark="§ 2" title={t('sec.method.habitHead')}>
        <Prose>{t.rich('sec.method.habitP1', rich)}</Prose>
      </Section>

      <Section id="read" mark="§ 3" title={t('sec.method.readHead')}>
        <Prose>{t.rich('sec.method.readP1', rich)}</Prose>
        <Prose>{t.rich('sec.method.readP2', { ...rich, mixing: f.mixing, holdings: f.holdings })}</Prose>
      </Section>

      <Section id="price" mark="§ 4" title={t('sec.method.priceHead')}>
        <Prose>{t.rich('sec.method.priceP1', rich)}</Prose>
        <Prose>
          {t.rich('sec.method.priceP2', {
            ...rich,
            holdings: f.holdings,
            strongestAvg: f.strongest.avgPp,
            strongestFree: f.strongest.free,
            strongestWorstHand: f.strongest.worstHand,
            strongestWorstPp: f.strongest.worstPp,
            strongestWorstBest: f.strongest.worstBest,
            weakestAvg: f.weakest.avgPp,
            weakestWorstHand: f.weakest.worstHand,
            weakestWorstPp: f.weakest.worstPp,
            mostPlayedMax: f.mostPlayedMaxPp,
          })}
        </Prose>
        <aside className={styles.margin}>{t.rich('sec.method.priceAside', rich)}</aside>
      </Section>

      <Section id="scores" mark="§ 5" title={t('sec.method.scoresHead')}>
        <Prose>{t.rich('sec.method.scoresP1', rich)}</Prose>
      </Section>

      <Section id="rule" mark="§ 6" title={t('sec.method.ruleHead')}>
        <Prose>
          {t.rich('sec.method.ruleP1', {
            ...rich,
            oneManilhaPct: f.oneManilhaPct,
            oneManilha: f.oneManilha,
            oneManilhaLeadsManilha: f.oneManilhaLeadsManilha,
            oneManilhaLeadsWeakest: f.oneManilhaLeadsWeakest,
          })}
        </Prose>
        <Prose>
          {t.rich('sec.method.ruleP2', {
            ...rich,
            noManilha: f.noManilha,
            noManilhaStrongest: f.noManilhaStrongest,
            noManilhaWeakest: f.noManilhaWeakest,
          })}
        </Prose>
        <p className={styles.takeaway}>{t('sec.method.ruleTakeaway')}</p>
      </Section>
    </>
  )
}
