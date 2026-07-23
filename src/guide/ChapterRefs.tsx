// A light references footer for chapters that cite sources. Bibliographic
// labels stay untranslated (proper nouns, original titles); only the heading
// is localized.

import { useTranslations } from 'next-intl'

import styles from './guide.module.css'

export interface ChapterRef {
  label: string
  href: string
}

export function ChapterRefs({ items }: { items: ChapterRef[] }) {
  const t = useTranslations('Study.guide')
  return (
    <footer className={styles.refs}>
      <span className={styles.refsHead}>{t('refsHead')}</span>
      <ul className={styles.refsList}>
        {items.map((ref) => (
          <li key={ref.href}>
            <a href={ref.href} target="_blank" rel="noreferrer">
              {ref.label}
            </a>{' '}
            ↗
          </li>
        ))}
      </ul>
    </footer>
  )
}
