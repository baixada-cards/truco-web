// Part II, chapter: opening leads (the handbook's second chapter). The
// leader's first decision at the solved roots — which card opens the hand,
// when the strongest card leads vs waits, and what a wrong lead costs.
// Data comes from a checked-in fixture snapshot (see
// scripts/build_leads_handbook_fixture.mjs), never from the lab's manifest.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

import { useTranslations } from 'next-intl'

import type { ChartNode } from '../../lib/study-data'
import styles from '../guide.module.css'
import { Reveal, Section } from '../Section'
import { rich } from '../rich'
import { LeadsChartsPlate, type LeadsSpot } from '../plates/LeadsChartsPlate'

interface LeadsFixture {
  format: string
  source: string
  spots: Record<
    string,
    {
      score: [number, number]
      dealer: number
      tc: number
      digest: LeadsSpot['digest']
      node: ChartNode
    }
  >
}

let fixtureCache: LeadsFixture | null = null

function loadLeadsFixture(): LeadsFixture {
  if (fixtureCache) return fixtureCache
  const compressed = readFileSync(
    path.join(process.cwd(), 'src', 'guide', 'fixtures', 'leads-handbook-data.json.gz'),
  )
  const fixture = JSON.parse(gunzipSync(compressed).toString('utf8')) as LeadsFixture
  if (fixture.format !== 'leads-handbook-fixture/v1') {
    throw new Error(`unexpected leads fixture format: ${fixture.format}`)
  }
  fixtureCache = fixture
  return fixture
}

const SPOT_LABEL_KEYS: Record<string, string> = {
  '10x10-tc0-d0.json': 'spotTen',
  '11x11-tc0-d0.json': 'spotIronDeal',
  '11x11-tc0-d1.json': 'spotIronLead',
}

/** one spot's node → the compact payload the client plate mounts with */
function digestSpot(key: string, spot: LeadsFixture['spots'][string]): LeadsSpot {
  return {
    key,
    labelKey: SPOT_LABEL_KEYS[key] ?? 'spotTen',
    digest: spot.digest,
    rows: spot.node.rows.map((r) => [
      r.hand[0],
      r.hand[1],
      r.hand[2],
      Number(r.w.toFixed(6)),
      ...r.actions.flatMap((a) => [a.c, Number(a.p.toFixed(3)), Number(a.q.toFixed(4))]),
    ]),
  }
}

export function LeadsChapter() {
  const t = useTranslations('Study.guide')
  const fixture = loadLeadsFixture()
  const order = Object.keys(SPOT_LABEL_KEYS)
  const spots = Object.entries(fixture.spots)
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([key, spot]) => digestSpot(key, spot))
  const tc = Object.values(fixture.spots)[0]?.tc ?? 0

  return (
    <>
      <Reveal>
        <p>{t.rich('sec.leads.lede', rich)}</p>
      </Reveal>

      <Section id="question" mark="§ 1" title={t('sec.leads.questionHead')}>
        <p>{t.rich('sec.leads.questionP1', rich)}</p>
        <p>{t.rich('sec.leads.questionP2', rich)}</p>
      </Section>

      <Section id="charts" mark="§ 2" title={t('sec.leads.chartsHead')}>
        <p>{t.rich('sec.leads.chartsP1', rich)}</p>
        <LeadsChartsPlate spots={spots} tc={tc} />
      </Section>

      <Section id="patterns" mark="§ 3" title={t('sec.leads.patternsHead')}>
        <p>{t.rich('sec.leads.patternsP1', rich)}</p>
        <p>{t.rich('sec.leads.patternsP2', rich)}</p>
        <p>{t.rich('sec.leads.patternsP3', rich)}</p>
        <aside className={styles.margin}>{t.rich('sec.leads.patternsAside', rich)}</aside>
      </Section>

      <Section id="prices" mark="§ 4" title={t('sec.leads.pricesHead')}>
        <p>{t.rich('sec.leads.pricesP1', rich)}</p>
        <p>{t.rich('sec.leads.pricesP2', rich)}</p>
      </Section>
    </>
  )
}
