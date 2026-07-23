// Chapter V — ranges before results. The rows come from the certified root
// chart, while the interactive editor uses the same draft feasibility rules as
// the lab proper (plan 77 D).

import { findNode, loadStudyDoc } from '../GuideFigures'
import { BlockerFigure } from '../plates/BlockerFigure'
import { RangeTool } from '../plates/RangeTool'
import { Reveal, Section } from '../Section'
import { rich } from '../rich'
import { useTranslations } from 'next-intl'

const DOC = '11x11-tc0-d0.json'

export function RangeChapter() {
  const t = useTranslations('Study.guide')
  const doc = loadStudyDoc(DOC)
  const node = findNode(doc, [])
  const rows = node.rows.map((row) => ({
    hand: row.hand,
    w: Number(row.w.toFixed(8)),
    actions: [],
  }))
  return (
    <>
      <Reveal>
        <p>{t.rich('sec.ranges.intro', rich)}</p>
      </Reveal>
      <Section id="range-tool" mark="§ 1" title={t('sec.ranges.toolHead')}>
        <p>{t.rich('sec.ranges.toolP', rich)}</p>
        <RangeTool tc={doc.tc} rows={rows} />
      </Section>
      <Section id="blockers" mark="§ 2" title={t('sec.ranges.blockersHead')}>
        <p>{t.rich('sec.ranges.blockersP', rich)}</p>
        <BlockerFigure />
      </Section>
    </>
  )
}
