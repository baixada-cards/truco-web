// Part II, chapter: the mão-de-onze accept/fold charts (plan 80 step 3,
// closing plan 76 G). Every solved 11xN root, digested for players: the
// charts score by score, plus the shape of the range and what mistakes
// cost. Data comes from a checked-in fixture snapshot (see
// scripts/build_eleven_handbook_fixture.mjs), never from the lab's manifest.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

import { useTranslations } from 'next-intl'

import type { ChartNode, ChartRow } from '../../lib/study-data'
import styles from '../guide.module.css'
import { Reveal, Section } from '../Section'
import { Prose } from '../Prose'
import { rich } from '../rich'
import { ElevenChartsPlate, type ElevenSpot } from '../plates/ElevenChartsPlate'

interface ElevenFixture {
  format: string
  source: string
  spots: Record<
    string,
    { score: [number, number]; dealer: number; tc: number; node: ChartNode }
  >
}

let fixtureCache: ElevenFixture | null = null

function loadElevenFixture(): ElevenFixture {
  if (fixtureCache) return fixtureCache
  const compressed = readFileSync(
    path.join(process.cwd(), 'src', 'guide', 'fixtures', 'eleven-handbook-data.json.gz'),
  )
  const fixture = JSON.parse(gunzipSync(compressed).toString('utf8')) as ElevenFixture
  if (fixture.format !== 'eleven-handbook-fixture/v1') {
    throw new Error(`unexpected eleven fixture format: ${fixture.format}`)
  }
  fixtureCache = fixture
  return fixture
}

const ACCEPT = 33
const FOLD = 34

function actionP(row: ChartRow, code: number): number {
  return row.actions.find((a) => a.c === code)?.p ?? 0
}
function actionQ(row: ChartRow, code: number): number {
  return row.actions.find((a) => a.c === code)?.q ?? 0
}

/** one spot's node → the compact payload the client plate mounts with */
function digestSpot(key: string, spot: ElevenFixture['spots'][string]): ElevenSpot {
  const rows = spot.node.rows
  const totalW = rows.reduce((s, r) => s + r.w, 0)
  const acceptMass = rows.reduce((s, r) => s + r.w * actionP(r, ACCEPT), 0)
  const foldQ = actionQ(rows[0], FOLD)
  return {
    key,
    opp: spot.score[1],
    // in every solved d0 spot the eleven side is also the dealer; d1 is the
    // one solved spot where it leads instead (see plan 80 / data survey)
    ownerDeals: spot.dealer === 0,
    foldWin: 50 + foldQ * 50,
    acceptPct: (acceptMass / totalW) * 100,
    rows: rows.map((r) => [
      r.hand[0],
      r.hand[1],
      r.hand[2],
      Number(actionP(r, ACCEPT).toFixed(3)),
      Number(actionQ(r, ACCEPT).toFixed(4)),
      Number(r.w.toFixed(6)),
    ]),
  }
}

export function ElevenChapter() {
  const t = useTranslations('Study.guide')
  const fixture = loadElevenFixture()
  const spots = Object.entries(fixture.spots)
    .map(([key, spot]) => digestSpot(key, spot))
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
