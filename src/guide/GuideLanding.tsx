// The guide's landing page: the field-guide masthead, the chapter table of
// contents as the main content. Renders on the server; client helpers handle
// legacy-anchor redirects and locale switching.

import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'

import { LanguagePicker } from '../components/live/LanguagePicker'
import { chapterRoman, GUIDE_PARTS } from './chapters'
import styles from './guide.module.css'
import { HashRedirect } from './HashRedirect'
import { rich } from './rich'

export function GuideLanding() {
  const t = useTranslations('Study.guide')
  const locale = useLocale()
  const labHref = `/${locale}/lab/study`
  const base = `/${locale}/lab/study/guide`

  return (
    <div className={styles.page}>
      <HashRedirect />
      <div className={styles.guideBar}>
        <a className={styles.back} href={labHref}>
          ← {t('back')}
        </a>
        <div className={styles.guideTools}>
          <LanguagePicker variant="guide" />
        </div>
      </div>
      <header className={styles.masthead}>
        <div className={styles.kicker}>{t('kicker')}</div>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.lede}>{t.rich('lede', rich)}</p>
      </header>

      <div className={styles.landing}>
        <div className={styles.railHead}>{t('contents')}</div>
        {GUIDE_PARTS.map((part) => (
          <section key={part.id} className={styles.tocPart} aria-label={t(`parts.${part.id}.head`)}>
            <div className={styles.tocPartHead}>
              <span className={styles.tocPartKicker}>{t(`parts.${part.id}.kicker`)}</span>
              <h2 className={styles.tocPartName}>{t(`parts.${part.id}.head`)}</h2>
            </div>
            {part.id === 'handbook' ? (
              <p className={styles.tocPartLede}>{t.rich('parts.handbook.lede', rich)}</p>
            ) : null}
            {part.chapters.length > 0 ? (
              <ol className={styles.tocList}>
                {part.chapters.map((id) => (
                  <li key={id}>
                    <Link href={`${base}/${id}`} className={styles.tocCard}>
                      <span className={styles.tocNo}>{chapterRoman(id)}</span>
                      <span className={styles.tocBody}>
                        <span className={styles.tocName}>{t(`toc.${id}`)}</span>
                        <span className={styles.tocTeaser}>{t(`teaser.${id}`)}</span>
                      </span>
                      <span className={styles.tocArrow} aria-hidden>
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : null}
          </section>
        ))}
      </div>

      <footer className={styles.foot}>
        <div className={styles.footInner}>
          <a className={styles.cta} href={labHref}>
            {t('footer.openLab')} →
          </a>
          <a className={styles.ctaGhost} href={`${labHref}?tour=1`}>
            {t('footer.tour')} →
          </a>
        </div>
      </footer>
    </div>
  )
}
