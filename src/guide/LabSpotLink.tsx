// A "walk this spot in the lab" link for the handbook chapters: takes a
// study-notation spot string and deep-links the lab preloaded on it. Works
// in both server chapters and client plates.

import { useLocale, useTranslations } from 'next-intl'

import styles from './guide.module.css'

export function LabSpotLink({ spot }: { spot: string }) {
  const t = useTranslations('Study.guide')
  const locale = useLocale()
  return (
    <a
      className={styles.anTry}
      href={`/${locale}/lab/study?s=${encodeURIComponent(spot)}`}
    >
      {t('labSpot')} <code>{spot}</code> →
    </a>
  )
}
