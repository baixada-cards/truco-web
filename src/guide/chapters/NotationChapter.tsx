// Chapter V — writing a spot down. Migrated from guide v2; the string
// anatomy plate stays its interactive figure.

import { useTranslations } from 'next-intl'

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
      <Section id="grammar" mark="§ 2" title={t('sec.notation.grammarHead')}>
        <Prose>{t.rich('sec.notation.grammarP', rich)}</Prose>
        <NotationGrammar />
      </Section>
      <Section id="quizzes" mark="§ 3" title={t('sec.notation.quizHead')}>
        <Prose>{t.rich('sec.notation.p2', rich)}</Prose>
        <NotationQuizzes />
      </Section>
    </>
  )
}
