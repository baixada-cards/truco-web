// Chapter — the exact, lossless reductions behind the shipped solve (plan 77 H).
// These are game isomorphisms, not buckets or approximations: concrete cards
// and seats are renamed only when that renaming preserves every legal action,
// probability, payoff, and continuation.

import { useLocale, useTranslations } from 'next-intl'

import styles from '../guide.module.css'
import { ScoreDependencyPlate } from '../plates/ScoreDependencyPlate'
import { SubgameBacksolvePlate } from '../plates/SubgameBacksolvePlate'
import { ViraClassPlate } from '../plates/ViraClassPlate'
import { Reveal, Section } from '../Section'
import { rich } from '../rich'

export function AbstractionsChapter() {
  const t = useTranslations('Study.guide')
  const locale = useLocale()
  const numbersHref = `/${locale}/lab/study/guide/numbers`

  return (
    <>
      <Reveal>
        <p>{t.rich('sec.abstractions.intro1', rich)}</p>
        <p>{t.rich('sec.abstractions.intro2', rich)}</p>
      </Reveal>

      <Section id="suits" mark="§ 1" title={t('sec.abstractions.suitsHead')}>
        <p>{t.rich('sec.abstractions.suitsP1', rich)}</p>
        <div className={styles.abstractionExample} aria-label={t('sec.abstractions.suitsAria')}>
          <span className={styles.abstractionCards}>3♦&ensp;3♠&ensp;3♥&ensp;3♣</span>
          <span className={styles.abstractionArrow}>→</span>
          <span className={styles.abstractionResult}>
            <span className={styles.abstractionPlainCard} aria-hidden>
              <b>3</b>
              <small>♦♠♥♣</small>
            </span>
            <strong>{t('sec.abstractions.plainThree')}</strong>
          </span>
        </div>
      </Section>

      <Section id="copies" mark="§ 2" title={t('sec.abstractions.copiesHead')}>
        <p>{t.rich('sec.abstractions.copiesP1', rich)}</p>
        <div className={styles.abstractionExample} aria-label={t('sec.abstractions.copiesAria')}>
          <span className={styles.abstractionSource}>
            <small>{t('sec.abstractions.oneSevenVisible')}</small>
            <span className={styles.abstractionCards}>7♦&ensp;7♠&ensp;7♥</span>
          </span>
          <span className={styles.abstractionArrow}>→</span>
          <strong>{t('sec.abstractions.threeCopies')}</strong>
        </div>
      </Section>

      <Section id="roles" mark="§ 3" title={t('sec.abstractions.rolesHead')}>
        <p>{t.rich('sec.abstractions.rolesP1', rich)}</p>
        <div className={styles.subgameFactors} aria-label={t('sec.abstractions.factorsAria')}>
          <div>
            <small>{t('sec.abstractions.factorOne')}</small>
            <span>{t('sec.abstractions.factorScore')}</span>
            <strong>5 × 7</strong>
            <p>{t('sec.abstractions.factorScoreWhy')}</p>
          </div>
          <b aria-hidden>+</b>
          <div>
            <small>{t('sec.abstractions.factorTwo')}</small>
            <span>{t('sec.abstractions.factorDealer')}</span>
            <strong>{t('sec.abstractions.dealerSeat', { seat: 0 })}</strong>
            <p>{t('sec.abstractions.factorDealerWhy')}</p>
          </div>
          <b aria-hidden>+</b>
          <div>
            <small>{t('sec.abstractions.factorThree')}</small>
            <span>{t('sec.abstractions.factorTurnup')}</span>
            <strong>{t('sec.abstractions.factorTurnupValue')}</strong>
            <p>{t('sec.abstractions.factorTurnupWhy')}</p>
          </div>
          <b aria-hidden>→</b>
          <div className={styles.subgameFactorResult}>
            <small>{t('sec.abstractions.factorResultLabel')}</small>
            <strong>{t('sec.abstractions.factorResult')}</strong>
            <p>{t('sec.abstractions.factorResultValue')}</p>
          </div>
        </div>
        <p>{t.rich('sec.abstractions.rolesP2', rich)}</p>
        <div className={styles.roleEquivalence} aria-label={t('sec.abstractions.rolesAria')}>
          <div>
            <span>{t('sec.abstractions.dealerSeat', { seat: 0 })}</span>
            <strong>{t('sec.abstractions.roleScore', { mao: 7, pe: 5 })}</strong>
          </div>
          <span className={styles.abstractionNotEqual}>≠</span>
          <div>
            <span>{t('sec.abstractions.dealerSeat', { seat: 1 })}</span>
            <strong>{t('sec.abstractions.roleScore', { mao: 5, pe: 7 })}</strong>
          </div>
        </div>
        <p className={styles.roleExampleNote}>{t('sec.abstractions.roleExampleNote')}</p>

        <h3 className={styles.abstractionSubhead}>{t('sec.abstractions.censusHead')}</h3>
        <p>{t.rich('sec.abstractions.subgamesP1', rich)}</p>
        <div className={styles.subgameEquation} aria-label={t('sec.abstractions.censusAria')}>
          <div>
            <strong>12 × 12</strong>
            <span>{t('sec.abstractions.censusScores')}</span>
          </div>
          <b aria-hidden>×</b>
          <div>
            <strong>9</strong>
            <span>{t('sec.abstractions.censusTurnups')}</span>
          </div>
          <b aria-hidden>=</b>
          <div className={styles.subgameTotal}>
            <strong>1,296</strong>
            <span>{t('sec.abstractions.censusTotal')}</span>
          </div>
        </div>
        <p>{t.rich('sec.abstractions.subgamesP2', rich)}</p>
        <p>{t.rich('sec.abstractions.simTakeaway', rich)}</p>
        <a className={styles.anTry} href={`${numbersHref}#similarity`}>
          {t('sec.abstractions.seeAppendix')} →
        </a>
      </Section>

      <Section id="vira-classes" mark="§ 4" title={t('sec.abstractions.viraHead')}>
        <p>{t.rich('sec.abstractions.viraP1', rich)}</p>
        <ViraClassPlate />
        <p>{t.rich('sec.abstractions.viraP2', rich)}</p>
        <aside className={styles.margin}>{t('sec.abstractions.exactNote')}</aside>
      </Section>

      <Section id="subgames" mark="§ 5" title={t('sec.abstractions.subgamesHead')}>
        <p>{t.rich('sec.abstractions.backsolveP1', rich)}</p>
        <SubgameBacksolvePlate />
        <p>{t.rich('sec.abstractions.backsolveP2', rich)}</p>
        <ScoreDependencyPlate />
        <p>{t.rich('sec.abstractions.sizesTakeaway', rich)}</p>
        <a className={styles.anTry} href={`${numbersHref}#census`}>
          {t('sec.abstractions.seeAppendix')} →
        </a>
      </Section>

    </>
  )
}
