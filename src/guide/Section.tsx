'use client'

import styles from './guide.module.css'
import { useReveal } from './useReveal'

/** an untitled revealed block — chapter intros, plates, closing notes */
export function Reveal({ children }: { children: React.ReactNode }) {
  const ref = useReveal<HTMLDivElement>()
  return (
    <div className={styles.section} ref={ref}>
      {children}
    </div>
  )
}

/** one revealed chapter section; server chapters pass their content through */
export function Section({
  id,
  mark,
  title,
  children,
}: {
  id: string
  mark: string
  title: string
  children: React.ReactNode
}) {
  const ref = useReveal<HTMLElement>()
  return (
    <section id={id} className={styles.section} ref={ref}>
      <header className={styles.secHead}>
        <span className={styles.marker}>{mark}</span>
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  )
}
