// Writing a spot down, and walking one: the string anatomy plate, the
// miniature rail (moved here from the chart chapter, since walking a hand is
// reading its line), the grammar, and the quizzes.

import { useTranslations } from 'next-intl'

import styles from '../guide.module.css'
import { LineWalkerPlate } from '../plates/LineWalkerPlate'
import { NotationExamples, NotationGrammar, NotationQuizzes } from '../plates/NotationWorkbench'
import { StringAnatomy } from '../plates/StringAnatomy'
import { Reveal, Section } from '../Section'
import { Prose } from '../Prose'
import { rich } from '../rich'

export function NotationChapter() {
  const t = useTranslations('Study.guide')
  return (
    <>
      <Reveal>
        <Prose>{t.rich('sec.notation.p1', rich)}</Prose>
      </Reveal>
      <Section id="histories" mark="§ 1" title={t('sec.notation.historiesHead')}>
        <Prose>{t.rich('sec.notation.historiesP', rich)}</Prose>
        <StringAnatomy />
        <NotationExamples />
      </Section>
      <Section id="walk" mark="§ 2" title={t('sec.notation.walkHead')}>
        <Prose>{t.rich('sec.notation.walkP1', rich)}</Prose>
        <Prose>{t.rich('sec.notation.walkP2', rich)}</Prose>
        <LineWalkerPlate />
        <aside className={styles.margin}>{t.rich('sec.notation.walkAside', rich)}</aside>
      </Section>
      <Section id="grammar" mark="§ 3" title={t('sec.notation.grammarHead')}>
        <Prose>{t.rich('sec.notation.grammarP', rich)}</Prose>
        <NotationGrammar />
      </Section>
      <Section id="quizzes" mark="§ 4" title={t('sec.notation.quizHead')}>
        <Prose>{t.rich('sec.notation.p2', rich)}</Prose>
        <NotationQuizzes />
      </Section>
    </>
  )
}
