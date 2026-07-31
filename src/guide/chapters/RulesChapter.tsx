// Chapter — the exact truco variant the solver plays (plan 77 J-3).
// Every rule on this page is derived from crates/truco-engine (cards.rs,
// rules.rs, engine.rs; constants in lib.rs: MATCH_TARGET=12,
// INITIAL_HAND_VALUE=1, RAISE_LADDER=[1,3,6,9,12]) — not from folklore.
// Where common truco-paulista lore differs (no envido/flor, no blind
// "ferro" hand at 11×11, face-down cards always lose), the engine wins.

import { useTranslations } from 'next-intl'

import styles from '../guide.module.css'
import { Reveal, Section } from '../Section'
import { Prose } from '../Prose'
import { ElevenPlate, FaceDownPlate, ManilhaPlate, MatchPlate, StakesPlate, TiePlate } from '../plates/RulesPlates'
import { rich } from '../rich'

export function RulesChapter() {
  const t = useTranslations('Study.guide')
  return (
    <>
      <Reveal>
        <Prose>{t.rich('sec.rules.intro1', rich)}</Prose>
        <Prose>{t.rich('sec.rules.intro2', rich)}</Prose>
      </Reveal>

      <Section id="cards" mark="§ 1" title={t('sec.rules.cardsHead')}>
        <Prose>{t.rich('sec.rules.cardsP1', rich)}</Prose>
        <Prose>{t.rich('sec.rules.cardsP2', rich)}</Prose>
        <ManilhaPlate />
      </Section>

      <Section id="rounds" mark="§ 2" title={t('sec.rules.roundsHead')}>
        <Prose>{t.rich('sec.rules.roundsP1', rich)}</Prose>
        <div className={styles.roundsRuleLayout}>
          <dl className={styles.views}>
            {(['tie1', 'tie2', 'tie3', 'tie4'] as const).map((k) => (
              <div key={k}>
                <dt>{t(`sec.rules.${k}.term`)}</dt>
                <dd>{t.rich(`sec.rules.${k}.def`, rich)}</dd>
              </div>
            ))}
          </dl>
          <TiePlate />
        </div>
      </Section>

      <Section id="facedown" mark="§ 3" title={t('sec.rules.fdHead')}>
        <Prose>{t.rich('sec.rules.fdP1', rich)}</Prose>
        <FaceDownPlate />
      </Section>

      <Section id="stakes" mark="§ 4" title={t('sec.rules.stakesHead')}>
        <Prose>{t.rich('sec.rules.stakesP1', rich)}</Prose>
        <Prose>{t.rich('sec.rules.stakesP2', rich)}</Prose>
        <StakesPlate />
      </Section>

      <Section id="eleven" mark="§ 5" title={t('sec.rules.elevenHead')}>
        <Prose>{t.rich('sec.rules.elevenP1', rich)}</Prose>
        <Prose>{t.rich('sec.rules.elevenP2', rich)}</Prose>
        <ElevenPlate />
      </Section>

      <Section id="match" mark="§ 6" title={t('sec.rules.matchHead')}>
        <Prose>{t.rich('sec.rules.matchP1', rich)}</Prose>
        <MatchPlate />
        <aside className={styles.margin}>{t('sec.rules.aside')}</aside>
      </Section>
    </>
  )
}
