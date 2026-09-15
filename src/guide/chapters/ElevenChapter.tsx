// Part II, chapter: the mão-de-onze accept/fold charts (plan 80 step 3,
// closing plan 76 G). Every solved 11xN root, digested for players: the
// charts score by score, plus the shape of the range and what mistakes
// cost. Data comes from the checked-in fixture snapshot (src/guide/eleven-data.ts).

import { useTranslations } from 'next-intl'

import { digestElevenSpot, loadElevenFixture } from '../eleven-data'
import styles from '../guide.module.css'
import { Reveal, Section } from '../Section'
import { Prose } from '../Prose'
import { rich } from '../rich'
import { ElevenChartsPlate } from '../plates/ElevenChartsPlate'

export function ElevenChapter() {
  const t = useTranslations('Study.guide')
  const fixture = loadElevenFixture()
  const spots = Object.entries(fixture.spots)
    .map(([key, spot]) => digestElevenSpot(key, spot))
    .sort((a, b) => a.opp - b.opp || Number(b.ownerDeals) - Number(a.ownerDeals))
  const tc = Object.values(fixture.spots)[0]?.tc ?? 0

  return (
    <>
      <Reveal>
        <Prose>{t.rich('sec.eleven.lede', rich)}</Prose>
      </Reveal>

      <Section id="stakes" mark="§ 1" title={t('sec.eleven.stakesHead')}>
        <Prose>{t.rich('sec.eleven.stakesP1', rich)}</Prose>
        <Prose>{t.rich('sec.eleven.stakesP2', rich)}</Prose>
        <aside className={styles.margin}>{t.rich('sec.eleven.stakesAside', rich)}</aside>
      </Section>

      <Section id="reading" mark="§ 2" title={t('sec.eleven.readingHead')}>
        <Prose>{t.rich('sec.eleven.readingP1', rich)}</Prose>
        <Prose>{t.rich('sec.eleven.readingP2', rich)}</Prose>
      </Section>

      <Section id="charts" mark="§ 3" title={t('sec.eleven.chartsHead')}>
        <Prose>{t.rich('sec.eleven.chartsP1', rich)}</Prose>
        <ElevenChartsPlate spots={spots} tc={tc} />
      </Section>

      <Section id="shape" mark="§ 4" title={t('sec.eleven.shapeHead')}>
        <Prose>{t.rich('sec.eleven.shapeP1', rich)}</Prose>
        <Prose>{t.rich('sec.eleven.shapeP2', rich)}</Prose>
        <Prose>{t.rich('sec.eleven.shapeP3', rich)}</Prose>
        <aside className={styles.margin}>{t.rich('sec.eleven.shapeAside', rich)}</aside>
      </Section>
    </>
  )
}
