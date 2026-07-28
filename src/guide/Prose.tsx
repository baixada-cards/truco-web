// Renders a catalog string as one or more paragraphs: a blank line in the
// string starts a new one. Chapters use this everywhere they used to write
// <p>{t.rich(…)}</p>, so any string can be split in two from the copy editor
// without touching a component.

import { splitParagraphs } from './paragraphs'

export function Prose({ children }: { children: React.ReactNode }) {
  const paragraphs = splitParagraphs(children)
  return (
    <>
      {/* paragraphs have no identity beyond their order in the string */}
      {paragraphs.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </>
  )
}
