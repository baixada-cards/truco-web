'use client'

// The chapter-page frame: field-guide masthead, the cross-page chapter rail
// (current chapter highlighted, scroll-spy over its in-page sections), the
// mobile chip nav, and the prev/next footer. Chapter bodies render on the
// server and pass through as children.

import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { LanguagePicker } from '../components/live/LanguagePicker'
import {
  GUIDE_CHAPTERS,
  ROMAN,
  chapterNeighbours,
  chapterRoman,
  type ChapterSection,
  type GuideChapter,
} from './chapters'
import styles from './guide.module.css'
import { useReveal } from './useReveal'

// Which section is under the reading line — drives the rail's brass marker.
function useScrollSpy(ids: readonly string[]) {
  const [active, setActive] = useState<string | null>(ids[0] ?? null)
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || ids.length === 0) return
    const visible = new Set<string>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id)
          else visible.delete(e.target.id)
        }
        // the earliest section currently crossing the reading band wins
        for (const id of ids) {
          if (visible.has(id)) {
            setActive(id)
            return
          }
        }
      },
      { rootMargin: '-30% 0px -55% 0px', threshold: 0 },
    )
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [ids])
  return active
}

export function GuideShell({
  chapter,
  sections,
  children,
}: {
  chapter: GuideChapter
  /** this chapter's in-page sections, for the rail's sub-navigation */
  sections: ChapterSection[]
  children: React.ReactNode
}) {
  const t = useTranslations('Study.guide')
  const locale = useLocale()
  const labHref = `/${locale}/lab/study`
  const base = `/${locale}/lab/study/guide`
  const headRef = useReveal<HTMLElement>()
  // stable identity so the scroll-spy doesn't resubscribe on every render
  const idsKey = sections.map((s) => s.id).join('|')
  const sectionIds = useMemo(() => idsKey.split('|').filter(Boolean), [idsKey])
  const activeSection = useScrollSpy(sectionIds)
  const { prev, next } = chapterNeighbours(chapter)

  return (
    <div className={styles.page}>
      <div className={styles.guideBar}>
        <Link className={styles.back} href={base}>
          ← {t('nav.backToContents')}
        </Link>
        <div className={styles.guideTools}>
          <a className={styles.backAlt} href={labHref}>
            {t('nav.openLabShort')} →
          </a>
          <LanguagePicker variant="guide" />
        </div>
      </div>
      <header className={`${styles.masthead} ${styles.chapterHead}`} ref={headRef}>
        <div className={styles.kicker}>
          {t('kicker')} · {t('nav.chapter', { no: chapterRoman(chapter).toUpperCase() })}
        </div>
        <h1 className={`${styles.title} ${styles.chapterTitle}`}>{t(`sec.${chapter}.title`)}</h1>
      </header>

      <div className={styles.shell}>
        <nav className={styles.rail} aria-label={t('contents')}>
          <Link className={`${styles.railHead} ${styles.railHeadLink}`} href={base}>
            {t('contents')}
          </Link>
          {GUIDE_CHAPTERS.map((id, i) => (
            <div key={id}>
              <Link href={`${base}/${id}`} className={id === chapter ? styles.railOn : styles.railItem}>
                <span className={styles.railNo}>{ROMAN[i]}</span>
                {t(`toc.${id}`)}
              </Link>
              {id === chapter && sections.length > 1 ? (
                <div className={styles.railSubs}>
                  {sections.map((s) => (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      className={activeSection === s.id ? styles.railSubOn : styles.railSub}
                    >
                      {s.label}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </nav>

        {/* the rail hides on small screens; this chip row takes over */}
        <nav className={styles.toc} aria-label={t('contents')}>
          {GUIDE_CHAPTERS.map((id) => (
            <Link key={id} href={`${base}/${id}`} className={id === chapter ? styles.tocChipOn : undefined}>
              {t(`toc.${id}`)}
            </Link>
          ))}
        </nav>

        <main className={styles.main}>{children}</main>
      </div>

      <nav className={styles.pager} aria-label={t('nav.pagerAria')}>
        <div className={styles.pagerInner}>
          {prev ? (
            <Link className={styles.pagerPrev} href={`${base}/${prev}`}>
              <span className={styles.pagerTag}>← {t('nav.previous')}</span>
              <span className={styles.pagerName}>{t(`toc.${prev}`)}</span>
            </Link>
          ) : (
            <Link className={styles.pagerPrev} href={base}>
              <span className={styles.pagerTag}>← {t('nav.previous')}</span>
              <span className={styles.pagerName}>{t('contents')}</span>
            </Link>
          )}
          {next ? (
            <Link className={styles.pagerNext} href={`${base}/${next}`}>
              <span className={styles.pagerTag}>{t('nav.next')} →</span>
              <span className={styles.pagerName}>{t(`toc.${next}`)}</span>
            </Link>
          ) : (
            <a className={styles.pagerNext} href={labHref}>
              <span className={styles.pagerTag}>{t('nav.next')} →</span>
              <span className={styles.pagerName}>{t('footer.openLab')}</span>
            </a>
          )}
        </div>
      </nav>

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
