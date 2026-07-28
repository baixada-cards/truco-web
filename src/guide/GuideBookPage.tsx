// The guide as one continuous book: title page, contents, then every part
// and chapter in reading order. Used by /lab/study/guide/print, which is
// what the PDF and EPUB builds render. Server component — the chapter
// bodies are the very same ones the routed pages use.
//
// The data-book / data-chapter attributes are the contract the EPUB builder
// relies on to split the document into chapter files; keep them in step with
// scripts/build_guide_book.mjs.

import styles from './guide.module.css'

export interface BookChapter {
  id: string
  roman: string
  title: string
  tocName: string
  Body: React.ComponentType
}

export interface BookPart {
  id: string
  kicker: string
  head: string
  /** the part's blurb, shown on its half-title page */
  lede: string | null
  chapters: BookChapter[]
}

export function GuideBookPage({
  locale,
  kicker,
  title,
  contents,
  chapterLabel,
  parts,
}: {
  locale: string
  kicker: string
  title: string
  contents: string
  chapterLabel: (roman: string) => string
  parts: BookPart[]
}) {
  return (
    <div className={styles.book} data-book={locale}>
      <section className={styles.bookTitlePage}>
        <div className={styles.kicker}>{kicker}</div>
        <h1 className={styles.title}>{title}</h1>
        <div className={styles.orn} aria-hidden>
          <i />
          <em>❧</em>
          <i />
        </div>
      </section>

      <nav className={styles.bookToc} aria-label={contents}>
        <div className={styles.contentsHead}>{contents}</div>
        {parts.map((part) => (
          <section key={part.id} className={styles.tocPart}>
            <div className={styles.tocPartHead}>
              <div className={styles.tocPartKicker}>{part.kicker}</div>
              <h2 className={styles.tocPartName}>{part.head}</h2>
            </div>
            <ol className={styles.tocList}>
              {part.chapters.map((chapter) => (
                <li key={chapter.id}>
                  <a className={styles.tocEntry} href={`#ch-${chapter.id}`}>
                    <span className={styles.tocName}>{chapter.tocName}</span>
                    <i className={styles.tocDots} aria-hidden />
                    <span className={styles.tocNo}>{chapter.roman}</span>
                  </a>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </nav>

      {parts.map((part) => (
        <section key={part.id} className={styles.bookPart} data-part={part.id}>
          <div className={styles.bookPartPage}>
            <div className={styles.tocPartKicker}>{part.kicker}</div>
            <h2 className={styles.bookPartName}>{part.head}</h2>
            {part.lede ? <p className={styles.tocPartLede}>{part.lede}</p> : null}
          </div>
          {part.chapters.map((chapter) => (
            <article
              key={chapter.id}
              id={`ch-${chapter.id}`}
              className={styles.bookChapter}
              data-chapter={chapter.id}
              data-chapter-title={chapter.title}
              data-chapter-roman={chapter.roman}
              data-chapter-part={part.head}
            >
              <div className={styles.chapNo}>{chapterLabel(chapter.roman)}</div>
              <h1 className={styles.chapTitle}>{chapter.title}</h1>
              <div className={styles.main}>
                <chapter.Body />
              </div>
            </article>
          ))}
        </section>
      ))}
    </div>
  )
}
