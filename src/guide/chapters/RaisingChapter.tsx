// Part II, chapter: when to raise, when to let a hand go. The truco
// decision from both sides — when the solve calls it, and how it answers —
// priced off the 10×10 tc0 export window (depths 0–3, the solved root
// band's own numbers; see the analysis notes in plans/80). Numbers are
// deal-weighted over the exported windows and quoted in the copy; there is
// deliberately no fixture — every figure here is a citable constant.

import { useTranslations } from 'next-intl'

import styles from '../guide.module.css'
import { LabSpotLink } from '../LabSpotLink'
import { Reveal, Section } from '../Section'
import { Prose } from '../Prose'
import { rich } from '../rich'

// Measured 2026-07-18 off the 10x10-tc0-d0 shallow+deep windows.
const TIMING_ROWS = [
  { key: 'timingRoot', share: '0.3%' },
  { key: 'timingReply', share: '11.3%' },
  { key: 'timingWon', share: '5.3%' },
  { key: 'timingTied', share: '32.3%' },
  { key: 'timingDeep', share: '23.3%' },
] as const

export function RaisingChapter() {
  const t = useTranslations('Study.guide')

  return (
    <>
      <Reveal>
        <Prose>{t.rich('sec.raising.lede', rich)}</Prose>
      </Reveal>

      <Section id="ladder" mark="§ 1" title={t('sec.raising.ladderHead')}>
        <Prose>{t.rich('sec.raising.ladderP1', rich)}</Prose>
        <Prose>{t.rich('sec.raising.ladderP2', rich)}</Prose>
      </Section>

      <Section id="timing" mark="§ 2" title={t('sec.raising.timingHead')}>
        <Prose>{t.rich('sec.raising.timingP1', rich)}</Prose>
        <div className={styles.treeTableWrap}>
          <table className={`${styles.treeTable} ${styles.statTable}`}>
            <colgroup>
              <col />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th>{t('sec.raising.timingColMoment')}</th>
                <th>{t('sec.raising.timingColShare')}</th>
              </tr>
            </thead>
            <tbody>
              {TIMING_ROWS.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{t(`sec.raising.${row.key}`)}</th>
                  <td>{row.share}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Prose>{t.rich('sec.raising.timingP2', rich)}</Prose>
        <aside className={styles.margin}>{t.rich('sec.raising.timingAside', rich)}</aside>
      </Section>

      <Section id="range" mark="§ 3" title={t('sec.raising.rangeHead')}>
        <Prose>{t.rich('sec.raising.rangeP1', rich)}</Prose>
        <Prose>{t.rich('sec.raising.rangeP2', rich)}</Prose>
      </Section>

      <Section id="answering" mark="§ 4" title={t('sec.raising.answerHead')}>
        <Prose>{t.rich('sec.raising.answerP1', rich)}</Prose>
        <Prose>{t.rich('sec.raising.answerP2', rich)}</Prose>
        <aside className={styles.margin}>{t.rich('sec.raising.answerAside', rich)}</aside>
        <LabSpotLink spot="10x10 v4 : 3 3 /" />
      </Section>
    </>
  )
}
