// The four-views summary table: view × what the number shows × formula ×
// player takeaway. Opens the views chapter and teases it from the landing.
// Server-rendered; formulas come out of KaTeX at render time.

import { useTranslations } from 'next-intl'

import styles from './guide.module.css'
import { Math } from './Math'

const VIEWS = ['strategy', 'range', 'cost', 'compare'] as const

const TABLE_TEX: Record<(typeof VIEWS)[number], string> = {
  strategy: String.raw`\sigma(a \mid h)`,
  range: String.raw`P(h \mid \ell) \propto P_0(h)\,\textstyle\prod \sigma`,
  cost: String.raw`\max_{a} v(a) - v(\cdot)`,
  compare: String.raw`\Delta\sigma_{\mathrm{accept}} \;/\; \mathrm{TV}(\sigma, \sigma')`,
}

export function ViewsSummaryTable() {
  const t = useTranslations('Study.guide')
  const tl = useTranslations('Study.lab')
  const names: Record<(typeof VIEWS)[number], string> = {
    strategy: tl('viewStrategy'),
    range: tl('viewRange'),
    cost: tl('viewCost'),
    compare: tl('compare'),
  }
  return (
    <div className={styles.vtableWrap}>
      <table className={styles.vtable}>
        <thead>
          <tr>
            <th>{t('sec.views.table.colView')}</th>
            <th>{t('sec.views.table.colShows')}</th>
            <th>{t('sec.views.table.colFormula')}</th>
            <th>{t('sec.views.table.colTakeaway')}</th>
          </tr>
        </thead>
        <tbody>
          {VIEWS.map((v) => (
            <tr key={v}>
              <td>{names[v]}</td>
              <td>{t(`sec.views.${v}.shows`)}</td>
              <td>
                <Math tex={TABLE_TEX[v]} />
              </td>
              <td>{t(`sec.views.${v}.takeaway`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
