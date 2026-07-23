'use client'

// Plate — the study-string grammar, two complete examples, and small checks
// that use the actual parser rather than a second, guide-only language.

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { parseStudyString } from '../../lib/study-string'
import styles from '../guide.module.css'

const GRAMMAR_ROWS = [
  { key: 'spot', rule: '[score] [vira] [draft] : [history]' },
  { key: 'draft', rule: 'role [ ! ] [ card card card ]' },
  { key: 'card', rule: 'plain-rank | manilha-rank+suit | m+suit | ?' },
  { key: 'history', rule: 'action action / action …' },
  { key: 'action', rule: 'card [ * ] | r | r6 | r9 | r12 | a | f' },
] as const

function isPinnedExample(input: string) {
  try {
    const ast = parseStudyString(input)
    const draft = ast.drafts?.[0]
    return (
      ast.drafts?.length === 1 &&
      draft?.role === 'mão' &&
      draft.pinned &&
      draft.slots.join('|') === '5d|3|?'
    )
  } catch {
    return false
  }
}

export function NotationGrammar() {
  const t = useTranslations('Study.guide')
  return (
    <figure className={styles.plate}>
      <div className={styles.notationGrammar} aria-label={t('sec.notation.grammar.aria')}>
        <div className={styles.notationGrammarLead}>
          <span>{t('sec.notation.grammar.kicker')}</span>
          <code>spot</code>
        </div>
        <dl>
          {GRAMMAR_ROWS.map(({ key, rule }) => (
            <div key={key}>
              <dt>{t(`sec.notation.grammar.${key}.term`)}</dt>
              <dd>
                <code>{rule}</code>
                <p>{t(`sec.notation.grammar.${key}.desc`)}</p>
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <figcaption className={styles.plateCaption}>
        <span className={styles.plateNo}>VII</span> {t('sec.notation.grammar.caption')}
      </figcaption>
    </figure>
  )
}

export function NotationExamples() {
  const t = useTranslations('Study.guide')
  return (
    <div className={styles.notationExamples}>
      <article>
        <span>{t('sec.notation.examples.fixedKicker')}</span>
        <code>10x10 v4 pe![5d 3 ?] : 3 j / r a</code>
        <p>{t('sec.notation.examples.fixedText')}</p>
      </article>
      <article>
        <span>{t('sec.notation.examples.elevenKicker')}</span>
        <code>11x8 v4 mao![5d 3 ?] : a 5d 7 / 3* j</code>
        <p>{t('sec.notation.examples.elevenText')}</p>
      </article>
    </div>
  )
}

export function NotationQuizzes() {
  const t = useTranslations('Study.guide')
  const [reading, setReading] = useState<string | null>(null)
  const [written, setWritten] = useState('')
  const [checked, setChecked] = useState<boolean | null>(null)

  return (
    <div className={styles.notationQuiz}>
        <div className={styles.notationQuizHead}>
          <span>{t('sec.notation.quiz.kicker')}</span>
          <h3>{t('sec.notation.quiz.readHead')}</h3>
          <p>{t('sec.notation.quiz.readPrompt')}</p>
        </div>
        <div className={styles.notationChoices} role="group" aria-label={t('sec.notation.quiz.readHead')}>
          {(['correct', 'wrongRole', 'wrongKnown'] as const).map((choice) => {
            const selected = reading === choice
            return (
              <button
                key={choice}
                type="button"
                className={selected ? styles.notationChoiceOn : styles.notationChoice}
                aria-pressed={selected}
                onClick={() => setReading(choice)}
              >
                {t(`sec.notation.quiz.options.${choice}`)}
              </button>
            )
          })}
        </div>
        {reading ? (
          <p className={reading === 'correct' ? styles.notationCorrect : styles.notationTryAgain} role="status">
            {t(reading === 'correct' ? 'sec.notation.quiz.readCorrect' : 'sec.notation.quiz.readAgain')}
          </p>
        ) : null}

        <div className={styles.notationWrite}>
          <div>
            <h3>{t('sec.notation.quiz.writeHead')}</h3>
            <p>{t('sec.notation.quiz.writePrompt')}</p>
          </div>
          <div>
            <input
              value={written}
              placeholder="mao![5d 3 ?]"
              aria-label={t('sec.notation.quiz.writeHead')}
              onChange={(event) => {
                setWritten(event.target.value)
                setChecked(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setChecked(isPinnedExample(written))
              }}
            />
            <button type="button" onClick={() => setChecked(isPinnedExample(written))}>
              {t('sec.notation.quiz.check')}
            </button>
          </div>
          {checked !== null ? (
            <p className={checked ? styles.notationCorrect : styles.notationTryAgain} role="status">
              {t(checked ? 'sec.notation.quiz.writeCorrect' : 'sec.notation.quiz.writeAgain')}
            </p>
          ) : null}
        </div>
    </div>
  )
}
