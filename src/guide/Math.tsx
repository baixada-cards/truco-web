// Server-rendered math: KaTeX runs at render time via renderToString, so the
// client ships plain HTML + the stylesheet — no CDN, no client-side math JS.
// Import this only from server components to keep katex out of the bundle.

import { Fragment } from 'react'

import katex from 'katex'

import styles from './guide.module.css'

export function Math({ tex, display = false }: { tex: string; display?: boolean }) {
  const html = katex.renderToString(tex, {
    displayMode: display,
    throwOnError: true,
    strict: 'ignore',
  })
  return (
    <span
      className={display ? styles.mathBlock : styles.mathInline}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/** the small per-block legend defining every symbol a formula leans on */
export function FormulaTerms({
  items,
}: {
  items: Array<{ tex: string; text: string }>
}) {
  return (
    <dl className={styles.formulaTerms}>
      {items.map(({ tex, text }) => (
        <Fragment key={tex}>
          <dt>
            <Math tex={tex} />
          </dt>
          <dd>{text}</dd>
        </Fragment>
      ))}
    </dl>
  )
}
