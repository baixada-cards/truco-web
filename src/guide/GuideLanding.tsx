// The guide's landing page: the front matter of a book — title page, then
// the contents leaf with each part's chapters set as leader lines. Renders on
// the server; client helpers handle legacy-anchor redirects and locale
// switching.

import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'

import { LanguagePicker } from '../components/live/LanguagePicker'
import { guideBooks } from '../server/guide-downloads'
import { CopyEditor } from './CopyEditor'
import { chapterRoman, GUIDE_PARTS } from './chapters'
import styles from './guide.module.css'
import { HashRedirect } from './HashRedirect'
import { rich } from './rich'

export function GuideLanding() {
  const t = useTranslations('Study.guide')
  const locale = useLocale()
  const labHref = `/${locale}/lab/study`
  const base = `/${locale}/lab/study/guide`
  const books = guideBooks(locale)

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

      <div className={styles.leaf}>
        <header className={styles.masthead}>
          <div className={styles.kicker}>{t('kicker')}</div>
          <h1 className={styles.title}>{t('title')}</h1>
          <div className={styles.orn} aria-hidden>
            <i />
            <em>❧</em>
            <i />
          </div>
          <p className={styles.lede}>{t.rich('lede', rich)}</p>
          <div className={styles.contentsHead}>{t('contents')}</div>
        </header>

        <div className={styles.landing}>
          {GUIDE_PARTS.map((part) => (
            <section key={part.id} className={styles.tocPart} aria-label={t(`parts.${part.id}.head`)}>
              <div className={styles.tocPartHead}>
                <div className={styles.tocPartKicker}>{t(`parts.${part.id}.kicker`)}</div>
                <h2 className={styles.tocPartName}>{t(`parts.${part.id}.head`)}</h2>
                {t.has(`parts.${part.id}.lede`) ? (
                  <p className={styles.tocPartLede}>{t.rich(`parts.${part.id}.lede`, rich)}</p>
                ) : null}
              </div>
              {part.chapters.length > 0 ? (
                <ol className={styles.tocList}>
                  {part.chapters.map((id) => (
                    <li key={id}>
                      <Link href={`${base}/${id}`} className={styles.tocEntry}>
                        <span className={styles.tocName}>{t(`toc.${id}`)}</span>
                        <i className={styles.tocDots} aria-hidden />
                        <span className={styles.tocNo}>{chapterRoman(id)}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              ) : null}
            </section>
          ))}

          {/* built books, when this deploy carries them */}
          {books.length > 0 ? (
            <section className={styles.colophon} aria-label={t('downloads.head')}>
              <div className={styles.colophonHead}>{t('downloads.head')}</div>
              <p className={styles.colophonNote}>{t('downloads.note')}</p>
              <div className={styles.colophonLinks}>
                {books.map((book) => (
                  <a key={book.format} className={styles.colophonLink} href={book.href} download>
                    {book.format.toUpperCase()}
                    <span className={styles.colophonSize}>{book.size}</span>
                  </a>
                ))}
              </div>
            </section>
          ) : null}
        </div>
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

      <CopyEditor />
    </div>
  )
}
