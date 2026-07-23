// Chapter III — reading a chart, rebuilt on the REAL cell component (plan 77
// C): exact blocks with one card pinned per block, the printed number, the ≈
// flag, and the LIST as the same data sorted into rows. The old "Grid, List
// & H·M·L" section is gone (plan 77 K-1): the lab's brass block badge is now
// the control and explains itself. The interactive and the list snippet both
// draw the same real solved node the lab charts.

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
import { findNode, loadStudyDoc } from '../GuideFigures'
import styles from '../guide.module.css'
import { ApproxFigure } from '../plates/ApproxFigure'
import { GuideChartReader } from '../plates/GuideChartReader'
import { LineWalkerPlate } from '../plates/LineWalkerPlate'
import { Reveal, Section } from '../Section'
import { rich } from '../rich'

const CHART_DOC = '11x11-tc0-d0.json'
// The game tree is rank-isomorphic across turn-ups: the same certified class
// strategy can be rendered under another vira without changing a row's class
// or action. This reader uses v5 so its default L = 7 example has real room.
const FINDING_HAND_TURNUP_CLASS = 1

/** the real node the whole chapter reads: mão's opening lead at 11×11, v4 */
function chapterNode() {
  const doc = loadStudyDoc(CHART_DOC)
  return { doc, node: findNode(doc, []) }
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
  const { doc, node } = chapterNode()
  const infos = classInfos(doc.tc, 'cards')
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
  const { doc, node } = chapterNode()
  return (
    <>
      <Reveal>
        <p>{t.rich('sec.chart.intro1', rich)}</p>
        <p>{t.rich('sec.chart.intro2', rich)}</p>
      </Reveal>

      <Section id="blocks" mark="§ 1" title={t('sec.chart.blocksHead')}>
        <p>{t.rich('sec.chart.blocksP', rich)}</p>
        <GuideChartReader
          tc={FINDING_HAND_TURNUP_CLASS}
          qgapPP={doc.certificate?.assert_qgap_pp ?? 1}
          rows={readerRows(node.rows)}
        />
      </Section>

      <Section id="number" mark="§ 2" title={t('sec.chart.numberHead')}>
        <p>{t.rich('sec.chart.numberP', rich)}</p>
        <p>{t.rich('sec.chart.approxP', rich)}</p>
        <ApproxProps />
        <p className={styles.aside}>{t.rich('sec.chart.aside', rich)}</p>
      </Section>

      <Section id="list" mark="§ 3" title={t('sec.chart.listHead')}>
        <p>{t.rich('sec.chart.listP', rich)}</p>
        <ListSnippet />
      </Section>

      <Section id="walk" mark="§ 4" title={t('sec.chart.walkHead')}>
        <p>{t.rich('sec.chart.walkP1', rich)}</p>
        <p>{t.rich('sec.chart.walkP2', rich)}</p>
        <LineWalkerPlate />
        <aside className={styles.margin}>{t.rich('sec.chart.walkAside', rich)}</aside>
      </Section>
    </>
  )
}
