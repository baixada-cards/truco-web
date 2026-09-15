// Reading a chart, on the REAL cell component (plan 77 C): exact blocks
// with one card pinned per block, the printed number, the ≈ flag, and the
// LIST as the same data sorted into rows. The lab's brass block badge is the
// control and explains itself. The reader and the list snippet both draw the
// same real solved node: the hand of eleven against nine, whose only actions
// are accept and fold, so a first chart has two colours and no hidden
// opponent action to reason about. The ≈ figure keeps its rarely-visited
// opening-lead corner, where the flag actually occurs.

import { useTranslations } from 'next-intl'

import {
  ListRowMixBar,
  cellStyles as cells,
  ClassMark,
} from '../../components/study/ChartCells'
import {
  actionRole,
  classInfos,
  displayActionsForRow,
  historyStepLabel,
  roleOrder,
  type ChartRow,
} from '../../lib/study-data'
import { CHART_CHAPTER_SPOT, loadElevenFixture } from '../eleven-data'
import { findNode, loadStudyDoc } from '../GuideFigures'
import styles from '../guide.module.css'
import { ApproxFigure } from '../plates/ApproxFigure'
import { GuideChartReader } from '../plates/GuideChartReader'
import { Reveal, Section } from '../Section'
import { Prose } from '../Prose'
import { rich } from '../rich'

/** the real node the reader and the list read: the eleven side's accept-or-
 *  fold at 11×9, turn-up 4. The fixture carries no certificate, so the ≈
 *  tolerance falls back to the lab's default. */
function chapterNode() {
  const spot = loadElevenFixture().spots[CHART_CHAPTER_SPOT]
  return { tc: spot.tc, qgapPP: 1, node: spot.node }
}

/** compact copy of the node's rows for the client-side reader */
function readerRows(rows: ChartRow[]): ChartRow[] {
  return rows.map((r) => ({
    hand: r.hand,
    w: Number(r.w.toFixed(6)),
    actions: r.actions.map((a) => ({
      c: a.c,
      p: Number(a.p.toFixed(4)),
      q: Number(a.q.toFixed(4)),
    })),
  }))
}

/** the first rows of the L=4 block, exactly as the lab's LIST sorts them */
function ListSnippet() {
  const t = useTranslations('Study.guide')
  const { tc, node } = chapterNode()
  const infos = classInfos(tc, 'cards')
  const labels = infos.map((c) => c.label)
  const entries = node.rows
    .filter((r) => r.hand[2] === 0)
    .sort((a, b) => {
      for (let i = 0; i < 3; i += 1) {
        if (a.hand[i] !== b.hand[i]) return b.hand[i] - a.hand[i]
      }
      return 0
    })
    .slice(0, 8)
  return (
    <figure className={styles.plate}>
      <div className={styles.figCanvas}>
        <div className={cells.handList} style={{ maxHeight: 'none', paddingRight: 0 }}>
          {entries.map((row) => {
            const acts = displayActionsForRow(row)
              .filter(({ p }) => p > 0)
              .sort((a, b) => roleOrder(a.role) - roleOrder(b.role))
            return (
              <div key={row.hand.join(',')} className={cells.handRow}>
                <span className={cells.handRowCards}>
                  {row.hand.map((c, i) => (
                    <span key={i} className={cells.handRowCard}>
                      <ClassMark info={infos[c]} />
                    </span>
                  ))}
                </span>
                <span className={cells.handRowBar} aria-hidden>
                  <ListRowMixBar
                    acts={acts}
                    roleOf={(code) => actionRole(code, row.hand)}
                    label={(code) => historyStepLabel(code, labels)}
                  />
                </span>
                <span className={cells.handRowVal} />
              </div>
            )
          })}
        </div>
      </div>
      <figcaption className={styles.plateCaption}>
        <span className={styles.plateNo}>{t('plate', { no: 'II·c' })}</span>{' '}
        {t('sec.chart.listCaption')}
      </figcaption>
    </figure>
  )
}

/** the ≈ figure's real corner: a line the solve rarely plays (plan 77 J-5).
 *  11x11 v4 — mão led the 4, pé took the round with a 3 and led round 2
 *  face down; node [0,8,26] in the deep export, mão to reply. */
function ApproxProps() {
  const deep = loadStudyDoc('11x11-tc0-d0-deep.json.gz')
  const node = findNode(deep, [0, 8, 26])
  return (
    <ApproxFigure
      tc={deep.tc}
      qgapPP={deep.certificate?.assert_qgap_pp ?? 1}
      ownPlayed={[0]}
      rows={readerRows(node.rows)}
    />
  )
}

export function ChartChapter() {
  const t = useTranslations('Study.guide')
  const { tc, qgapPP, node } = chapterNode()
  return (
    <>
      <Reveal>
        <Prose>{t.rich('sec.chart.intro1', rich)}</Prose>
        <Prose>{t.rich('sec.chart.intro2', rich)}</Prose>
      </Reveal>

      <Section id="blocks" mark="§ 1" title={t('sec.chart.blocksHead')}>
        <Prose>{t.rich('sec.chart.blocksP', rich)}</Prose>
        <GuideChartReader tc={tc} qgapPP={qgapPP} rows={readerRows(node.rows)} />
      </Section>

      <Section id="number" mark="§ 2" title={t('sec.chart.numberHead')}>
        <Prose>{t.rich('sec.chart.numberP', rich)}</Prose>
        <Prose>{t.rich('sec.chart.approxP', rich)}</Prose>
        <ApproxProps />
        <p className={styles.aside}>{t.rich('sec.chart.aside', rich)}</p>
      </Section>

      <Section id="list" mark="§ 3" title={t('sec.chart.listHead')}>
        <Prose>{t.rich('sec.chart.listP', rich)}</Prose>
        <ListSnippet />
      </Section>
    </>
  )
}
