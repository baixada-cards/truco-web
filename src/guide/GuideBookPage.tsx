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
  /** the printed number: a roman numeral, or a letter for an appendix */
  number: string
  /** the heading label above the title: "Chapter iii", "Appendix A" */
  label: string
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
  written,
  parts,
}: {
  locale: string
  kicker: string
  title: string
  contents: string
  /** how the text was made: drafted with an AI assistant, reviewed by the
   *  author. Said once on the title page, as on the landing. */
  written: string
  parts: BookPart[]
}) {
  return (
    <div className={styles.book} data-book={locale}>
      {/* the cover: printed full-bleed, and grabbed as the EPUB's cover image */}
      <section className={styles.bookCover} data-cover>
        <div className={styles.bookCoverMark}>Baixada</div>
        <h1 className={styles.bookCoverTitle}>{title}</h1>
        <div className={styles.bookCoverOrn} aria-hidden>
          <i />
          <em>❧</em>
          <i />
        </div>
        <div className={styles.bookCoverFoot}>{kicker}</div>
      </section>

      <section className={styles.bookTitlePage} data-title-page>
        <div className={styles.kicker}>{kicker}</div>
        <h1 className={styles.title}>{title}</h1>
        <div className={styles.orn} aria-hidden>
          <i />
          <em>❧</em>
          <i />
        </div>
        <p className={styles.bookWritten}>{written}</p>
      </section>

      <nav className={styles.bookToc} aria-label={contents} data-toc>
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
                    <span className={styles.tocNo}>{chapter.number}</span>
                    <span className={styles.tocName}>{chapter.tocName}</span>
                  </a>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </nav>

      {parts.map((part) => (
        <section key={part.id} className={styles.bookPart} data-part={part.id}>
          <div className={styles.bookPartPage} data-part-page>
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
              data-chapter-label={chapter.label}
              data-chapter-part={part.head}
            >
              <div className={styles.chapNo}>{chapter.label}</div>
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
