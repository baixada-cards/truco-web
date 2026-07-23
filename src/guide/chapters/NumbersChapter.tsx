// Back-matter appendix — the solutions, by the numbers (plan 80 owner
// addition). One consolidated home for the project's measured statistics:
// game census, shipped certificates, neighbor similarity, purity, and solve
// effort. Every figure is a dated SOLVER_BENCHMARKS.md entry (2026-07-15 →
// 2026-07-17); update the constants here when new measurements land.

import { useTranslations } from 'next-intl'

import styles from '../guide.module.css'
import { Reveal, Section } from '../Section'
import { rich } from '../rich'

// Exact TC0/dealer-0 census (SOLVER_BENCHMARKS.md 2026-07-15/16, pre-prune
// tree).
const TREE_TIERS = [
  { key: 'treeOnze', scoreKey: 'treeOnzeScore', ladder: '—', nodes: '49.6M', infos: '5.61M' },
  { key: 'treeTruco', scoreKey: 'treeTrucoScore', ladder: '1 → 3', nodes: '352.3M', infos: '39.5M' },
  { key: 'treeSix', scoreKey: 'treeSixScore', ladder: '1 → 3 → 6', nodes: '1.11B', infos: '129.1M' },
  { key: 'treeNine', scoreKey: 'treeNineScore', ladder: '1 → 3 → 6 → 9', nodes: '2.87B', infos: '341.7M' },
  { key: 'treeFull', scoreKey: 'treeFullScore', ladder: '1 → 3 → 6 → 9 → 12', nodes: '6.70B', infos: '812.9M' },
] as const

// Release 20260717-full-225-v1: per-spot self-certification, aggregated from
// the 225 COMPLETE.json markers (SOLVER_BENCHMARKS.md 2026-07-17).
const CERT_ROWS = [
  { key: 'certTransferred', spots: '192', raw: '0.00124 / 0.00627', pure: '0.00046 / 0.00395', gap: '0.014 / 0.098' },
  { key: 'certRefined', spots: '5', raw: '0.00306 / 0.00424', pure: '0.00037 / 0.00148', gap: '0.029 / 0.166' },
  { key: 'certFallback', spots: '28', raw: '0.00001 / 0.01685', pure: '0.00001 / 0.01683', gap: '2.551 / 12.591' },
] as const

// `solve compare-policies` (2026-07-17): unweighted over table rows vs
// weighted by the policy's own on-path reach.
const SIM_ROWS = [
  { key: 'simScoreMao', tvRows: '0.017', tvPlay: '0.129', agreeRows: '96.0%', agreePlay: '85.9%' },
  { key: 'simTurnupMao', tvRows: '0.017', tvPlay: '0.023', agreeRows: '96.2%', agreePlay: '97.2%' },
  { key: 'simTurnupBig', tvRows: '0.013', tvPlay: '0.024', agreeRows: '98.0%', agreePlay: '97.2%' },
] as const

// `policy-stats` (2026-07-17): "pure" = max action probability > 0.99.
const PURITY_ROWS = [
  { key: 'purityMao', rows: '20.4%', play: '56.1%', maxProb: '0.609 / 0.873' },
  { key: 'purityBig', rows: '26.8%', play: '52.4%', maxProb: '0.655 / 0.836' },
] as const

export function NumbersChapter() {
  const t = useTranslations('Study.guide')

  return (
    <>
      <Reveal>
        <p>{t.rich('sec.numbers.lede', rich)}</p>
      </Reveal>

      <Section id="census" mark="§ 1" title={t('sec.numbers.censusHead')}>
        <p>{t.rich('sec.numbers.censusP1', rich)}</p>
        <p>{t.rich('sec.numbers.censusPruneP', rich)}</p>
        <div className={styles.treeTableWrap}>
          <table className={styles.treeTable}>
            <colgroup>
              <col />
              <col />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th>{t('sec.numbers.treeTier')}</th>
                <th>{t('sec.numbers.treeScore')}</th>
                <th>{t('sec.numbers.treeLadder')}</th>
                <th>{t('sec.numbers.treeNodes')}</th>
                <th>{t('sec.numbers.treeInfos')}</th>
              </tr>
            </thead>
            <tbody>
              {TREE_TIERS.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{t(`sec.numbers.${row.key}`)}</th>
                  <td>{t(`sec.numbers.${row.scoreKey}`)}</td>
                  <td>{row.ladder}</td>
                  <td>{row.nodes}</td>
                  <td>{row.infos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.treeNote}>{t('sec.numbers.treeNote')}</p>
        <p>{t.rich('sec.numbers.censusP2', rich)}</p>
        <aside className={styles.margin}>{t.rich('sec.numbers.censusAside', rich)}</aside>
      </Section>

      <Section id="coverage" mark="§ 2" title={t('sec.numbers.coverageHead')}>
        <div className={styles.subgameCoverage} aria-label={t('sec.numbers.coverageAria')}>
          <div>
            <span>{t('sec.numbers.coverageLabel')}</span>
            <strong>216 / 1,296</strong>
          </div>
          <span className={styles.subgameCoverageTrack} aria-hidden>
            <i />
          </span>
          <small>{t('sec.numbers.coverageRemaining')}</small>
        </div>
        <p>{t.rich('sec.numbers.coverageP1', rich)}</p>
        <p>{t.rich('sec.numbers.coverageP2', rich)}</p>
        <aside className={styles.coverageNote}>{t.rich('sec.numbers.coverageNote', rich)}</aside>
      </Section>

      <Section id="certificates" mark="§ 3" title={t('sec.numbers.certHead')}>
        <p>{t.rich('sec.numbers.certP1', rich)}</p>
        <div className={styles.treeTableWrap}>
          <table className={`${styles.treeTable} ${styles.statTable} ${styles.statTable5}`}>
            <colgroup>
              <col />
              <col />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th>{t('sec.numbers.certColSource')}</th>
                <th>{t('sec.numbers.certColSpots')}</th>
                <th>{t('sec.numbers.certColRaw')}</th>
                <th>{t('sec.numbers.certColPure')}</th>
                <th>{t('sec.numbers.certColGap')}</th>
              </tr>
            </thead>
            <tbody>
              {CERT_ROWS.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{t(`sec.numbers.${row.key}`)}</th>
                  <td>{row.spots}</td>
                  <td>{row.raw}</td>
                  <td>{row.pure}</td>
                  <td>{row.gap}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>{t.rich('sec.numbers.certP2', rich)}</p>
        <aside className={styles.margin}>{t.rich('sec.numbers.certAside', rich)}</aside>
      </Section>

      <Section id="similarity" mark="§ 4" title={t('sec.numbers.simHead')}>
        <p>{t.rich('sec.numbers.simP1', rich)}</p>
        <div className={styles.treeTableWrap}>
          <table className={`${styles.treeTable} ${styles.statTable} ${styles.statTable5}`}>
            <colgroup>
              <col />
              <col />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th>{t('sec.numbers.simColPair')}</th>
                <th>{t('sec.numbers.simColTvRows')}</th>
                <th>{t('sec.numbers.simColTvPlay')}</th>
                <th>{t('sec.numbers.simColAgreeRows')}</th>
                <th>{t('sec.numbers.simColAgreePlay')}</th>
              </tr>
            </thead>
            <tbody>
              {SIM_ROWS.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{t(`sec.numbers.${row.key}`)}</th>
                  <td>{row.tvRows}</td>
                  <td>{row.tvPlay}</td>
                  <td>{row.agreeRows}</td>
                  <td>{row.agreePlay}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>{t.rich('sec.numbers.simP2', rich)}</p>
        <aside className={styles.margin}>{t.rich('sec.numbers.simAside', rich)}</aside>
      </Section>

      <Section id="purity" mark="§ 5" title={t('sec.numbers.purityHead')}>
        <p>{t.rich('sec.numbers.purityP1', rich)}</p>
        <div className={styles.treeTableWrap}>
          <table className={`${styles.treeTable} ${styles.statTable}`}>
            <colgroup>
              <col />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th>{t('sec.numbers.purityColSolution')}</th>
                <th>{t('sec.numbers.purityColRows')}</th>
                <th>{t('sec.numbers.purityColPlay')}</th>
                <th>{t('sec.numbers.purityColMaxProb')}</th>
              </tr>
            </thead>
            <tbody>
              {PURITY_ROWS.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{t(`sec.numbers.${row.key}`)}</th>
                  <td>{row.rows}</td>
                  <td>{row.play}</td>
                  <td>{row.maxProb}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>{t.rich('sec.numbers.purityP2', rich)}</p>
      </Section>

      <Section id="effort" mark="§ 6" title={t('sec.numbers.effortHead')}>
        <p>{t.rich('sec.numbers.effortP1', rich)}</p>
        <p>{t.rich('sec.numbers.effortP2', rich)}</p>
        <aside className={styles.margin}>{t.rich('sec.numbers.effortAside', rich)}</aside>
      </Section>
    </>
  )
}
