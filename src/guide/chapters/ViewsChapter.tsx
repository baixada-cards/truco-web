// Chapter IV — the four views. The most important chapter: one section per
// view with the exact formula the lab computes (derived from rowVisual /
// cellVisual / aggregateRows / rowCost / tvDistance / nodeEquity in the
// code), an intuitive takeaway, and a figure of REAL solved cells; then the
// toolbar selectors and the header numbers.

import { useTranslations } from 'next-intl'

import styles from '../guide.module.css'
import {
  CompareBlockFigure,
  CostBlockFigure,
  RangeGridFigure,
  StrategyBlockFigure,
} from '../GuideFigures'
import { FormulaTerms, Math } from '../Math'
import { Reveal, Section } from '../Section'
import { Prose } from '../Prose'
import { ViewsSummaryTable } from '../ViewsSummaryTable'
import { rich } from '../rich'

const TEX = {
  strategyNumber: String.raw`n_{\mathrm{cell}} = 100 \cdot \max_{a}\, \sigma(a \mid h)`,
  range: String.raw`\begin{aligned} P(h \mid \ell) \;&=\; \frac{w(h)}{\sum_{h'} w(h')} \\[10pt] w(h) \;&\propto\; P_0(h) \prod_{d \,\in\, \ell} \sigma(a_d \mid h) \end{aligned}`,
  cost: String.raw`\begin{aligned} \Delta_{\mathrm{worst}}(h) \;&=\; \max_{a \in \mathcal{P}} v(a) \;-\; \min_{a \in \mathcal{P}} v(a) \\[8pt] \Delta_{\mathrm{played}}(h) \;&=\; \max_{a \in \mathcal{P}} v(a) \;-\; v(a^{\star}) \end{aligned}`,
  costUnits: String.raw`v_{\mathrm{pts}}(a) \;=\; \mathrm{pts}(a) \qquad\qquad v_{\mathrm{win}}(a) \;=\; 50\, q(a)`,
  compareAccept: String.raw`\Delta_{\mathrm{accept}}(h) \;=\; \sigma'(\mathrm{accept} \mid h) \;-\; \sigma(\mathrm{accept} \mid h)`,
  compareTv: String.raw`\mathrm{TV}(h) \;=\; \tfrac{1}{2} \sum_{a} \bigl|\, \sigma'(a \mid h) - \sigma(a \mid h) \,\bigr|`,
  equity: String.raw`\begin{aligned} \mathrm{Eq} \;&=\; 50 + 50\,\bar q \\[8pt] \bar q \;&=\; \frac{\sum_h w(h)\, q_\sigma(h)}{\sum_h w(h)} \end{aligned}`,
  reach: String.raw`\mathrm{reach} \;=\; \frac{W_{\mathrm{node}}}{W_{\mathrm{root}}}, \qquad W = \sum_h w(h)`,
  unitPts: String.raw`v = \mathrm{pts}(a)`,
  unitWin: String.raw`v = 50\,q(a)`,
  selWorst: String.raw`\max_{\mathcal{P}} v - \min_{\mathcal{P}} v`,
  selPlayed: String.raw`\max_{\mathcal{P}} v - v(a^{\star})`,
} as const

export function ViewsChapter() {
  const t = useTranslations('Study.guide')
  return (
    <>
      <Reveal>
        <Prose>{t.rich('sec.views.intro', rich)}</Prose>
      </Reveal>

      <Section id="table" mark="§" title={t('sec.views.tableHead')}>
        <ViewsSummaryTable />
      </Section>

      <Section id="strategy" mark="§ 1" title={t('sec.views.strategy.head')}>
        <Prose>{t.rich('sec.views.strategy.p1', rich)}</Prose>
        <div className={styles.formula}>
          <Math display tex={TEX.strategyNumber} />
          <FormulaTerms
            items={[
              { tex: 'h', text: t('symbols.h') },
              { tex: String.raw`\sigma(a \mid h)`, text: t('symbols.sigma') },
            ]}
          />
          <p className={styles.formulaNote}>{t('sec.views.strategy.fnote')}</p>
        </div>
        <p className={styles.takeaway}>{t('sec.views.strategy.takeaway')}</p>
        <StrategyBlockFigure />
        <p className={styles.aside}>{t('sec.views.strategy.note')}</p>
      </Section>

      <Section id="range" mark="§ 2" title={t('sec.views.range.head')}>
        <Prose>{t.rich('sec.views.range.p1', rich)}</Prose>
        <div className={styles.formula}>
          <Math display tex={TEX.range} />
          <FormulaTerms
            items={[
              { tex: String.raw`P_0(h)`, text: t('symbols.p0') },
              { tex: String.raw`\ell`, text: t('symbols.ell') },
              { tex: 'd', text: t('symbols.d') },
              { tex: 'w(h)', text: t('symbols.w') },
            ]}
          />
          <p className={styles.formulaNote}>{t('sec.views.range.fnote')}</p>
        </div>
        <Prose>{t.rich('sec.views.range.p2', rich)}</Prose>
        <p className={styles.takeaway}>{t('sec.views.range.takeaway')}</p>
        <RangeGridFigure />
      </Section>

      <Section id="cost" mark="§ 3" title={t('sec.views.cost.head')}>
        <Prose>{t.rich('sec.views.cost.p1', rich)}</Prose>
        <div className={styles.formula}>
          <Math display tex={TEX.cost} />
          <Math display tex={TEX.costUnits} />
          <FormulaTerms
            items={[
              { tex: String.raw`\mathcal{P}`, text: t('symbols.pool') },
              { tex: 'v(a)', text: t('symbols.v') },
              { tex: 'q(a)', text: t('symbols.q') },
              { tex: String.raw`a^{\star}`, text: t('symbols.astar') },
            ]}
          />
        </div>
        <Prose>{t.rich('sec.views.cost.p2', rich)}</Prose>
        <p className={styles.takeaway}>{t('sec.views.cost.takeaway')}</p>
        <CostBlockFigure />
      </Section>

      <Section id="compare" mark="§ 4" title={t('sec.views.compare.head')}>
        <Prose>{t.rich('sec.views.compare.p1', rich)}</Prose>
        <div className={styles.formula}>
          <Math display tex={TEX.compareAccept} />
          <Math display tex={TEX.compareTv} />
          <FormulaTerms items={[{ tex: String.raw`\sigma'`, text: t('symbols.sigmaP') }]} />
          <p className={styles.formulaNote}>{t('sec.views.compare.fnote')}</p>
        </div>
        <p className={styles.takeaway}>{t('sec.views.compare.takeaway')}</p>
        <CompareBlockFigure />
      </Section>

      <Section id="selectors" mark="§ 5" title={t('sec.views.selHead')}>
        <Prose>{t('sec.views.selIntro')}</Prose>
        <dl className={styles.views}>
          <div>
            <dt>{t('sec.views.points.term')}</dt>
            <dd>
              {t('sec.views.points.desc')} <Math tex={TEX.unitPts} /> ·{' '}
              <Math tex={TEX.unitWin} />
            </dd>
          </div>
          <div>
            <dt>{t('sec.views.ignoreHides.term')}</dt>
            <dd>{t('sec.views.ignoreHides.desc')}</dd>
          </div>
          <div>
            <dt>{t('sec.views.mostPlayed.term')}</dt>
            <dd>
              {t('sec.views.mostPlayed.desc')} <Math tex={TEX.selPlayed} />
            </dd>
          </div>
          <div>
            <dt>{t('sec.views.worstAction.term')}</dt>
            <dd>
              {t('sec.views.worstAction.desc')} <Math tex={TEX.selWorst} />
            </dd>
          </div>
        </dl>
      </Section>

      <Section id="header" mark="§ 6" title={t('sec.views.headHead')}>
        <Prose>{t('sec.views.headIntro')}</Prose>
        <dl className={styles.views}>
          <div>
            <dt>{t('sec.views.equity.term')}</dt>
            <dd>{t('sec.views.equity.desc')}</dd>
          </div>
          <div>
            <dt>{t('sec.views.reach.term')}</dt>
            <dd>{t('sec.views.reach.desc')}</dd>
          </div>
        </dl>
        <div className={styles.formula}>
          <Math display tex={TEX.equity} />
          <Math display tex={TEX.reach} />
          <FormulaTerms
            items={[
              { tex: 'w(h)', text: t('symbols.w') },
              { tex: String.raw`q_\sigma(h)`, text: t('symbols.qsigma') },
              { tex: 'W', text: t('symbols.W') },
            ]}
          />
        </div>
      </Section>
    </>
  )
}
