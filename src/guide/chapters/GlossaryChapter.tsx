// Chapter VII — glossary. Migrated from guide v2; terms keep their
// deep-linkable `g-<term>` ids.

import { useTranslations } from 'next-intl'

import styles from '../guide.module.css'
import { Reveal } from '../Section'
import { rich } from '../rich'

const GLOSSARY = [
  'mao',
  'pe',
  'vira',
  'manilha',
  'zap',
  'ladder',
  'eleven',
  'iron',
  'spot',
  'solve',
  'equity',
  'pp',
  'range',
  'blocker',
  'reach',
  'pure',
  'mix',
  'selfloss',
  'eps',
] as const

export function GlossaryChapter() {
  const t = useTranslations('Study.guide')
  return (
    <Reveal>
      <p>{t.rich('sec.glossary.p1', rich)}</p>
      <dl className={styles.glossary}>
        {GLOSSARY.map((g) => (
          <div key={g} id={`g-${g}`} className={styles.gTerm}>
            <dt>{t(`glossary.${g}.term`)}</dt>
            <dd>{t.rich(`glossary.${g}.def`, rich)}</dd>
          </div>
        ))}
      </dl>
    </Reveal>
  )
}
