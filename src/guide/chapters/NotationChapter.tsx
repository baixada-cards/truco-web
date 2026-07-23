// Chapter V — writing a spot down. Migrated from guide v2; the string
// anatomy plate stays its interactive figure.

import { useTranslations } from 'next-intl'

import { NotationExamples, NotationGrammar, NotationQuizzes } from '../plates/NotationWorkbench'
import { StringAnatomy } from '../plates/StringAnatomy'
import { Reveal, Section } from '../Section'
import { rich } from '../rich'

export function NotationChapter() {
  const t = useTranslations('Study.guide')
  return (
    <>
      <Reveal>
        <p>{t.rich('sec.notation.p1', rich)}</p>
      </Reveal>
      <Section id="histories" mark="§ 1" title={t('sec.notation.historiesHead')}>
        <p>{t.rich('sec.notation.historiesP', rich)}</p>
        <StringAnatomy />
        <NotationExamples />
      </Section>
      <Section id="grammar" mark="§ 2" title={t('sec.notation.grammarHead')}>
        <p>{t.rich('sec.notation.grammarP', rich)}</p>
        <NotationGrammar />
      </Section>
      <Section id="quizzes" mark="§ 3" title={t('sec.notation.quizHead')}>
        <p>{t.rich('sec.notation.p2', rich)}</p>
        <NotationQuizzes />
      </Section>
    </>
  )
}
