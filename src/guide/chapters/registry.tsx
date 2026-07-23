// One place tying each chapter id to its body component and the in-page
// sections its rail sub-navigation shows.

import type { ChapterSection, GuideChapter } from '../chapters'

import { ChartChapter } from './ChartChapter'
import { AbstractionsChapter } from './AbstractionsChapter'
import { ElevenChapter } from './ElevenChapter'
import { RulesChapter } from './RulesChapter'
import { GlossaryChapter } from './GlossaryChapter'
import { LeadsChapter } from './LeadsChapter'
import { LeaksChapter } from './LeaksChapter'
import { NotationChapter } from './NotationChapter'
import { NumbersChapter } from './NumbersChapter'
import { RaisingChapter } from './RaisingChapter'
import { RangeChapter } from './RangeChapter'
import { SolvingChapter } from './SolvingChapter'
import { TrustChapter } from './TrustChapter'
import { ViewsChapter } from './ViewsChapter'

export const CHAPTER_BODIES: Record<GuideChapter, React.ComponentType> = {
  rules: RulesChapter,
  solving: SolvingChapter,
  chart: ChartChapter,
  ranges: RangeChapter,
  views: ViewsChapter,
  abstractions: AbstractionsChapter,
  notation: NotationChapter,
  trust: TrustChapter,
  eleven: ElevenChapter,
  leads: LeadsChapter,
  raising: RaisingChapter,
  leaks: LeaksChapter,
  numbers: NumbersChapter,
  glossary: GlossaryChapter,
}

/** section ids + their label message keys (full paths into the catalog) */
export const CHAPTER_SECTION_DEFS: Record<GuideChapter, Array<{ id: string; labelKey: string }>> = {
  rules: [
    { id: 'cards', labelKey: 'Study.guide.sec.rules.cardsHead' },
    { id: 'rounds', labelKey: 'Study.guide.sec.rules.roundsHead' },
    { id: 'facedown', labelKey: 'Study.guide.sec.rules.fdHead' },
    { id: 'stakes', labelKey: 'Study.guide.sec.rules.stakesHead' },
    { id: 'eleven', labelKey: 'Study.guide.sec.rules.elevenHead' },
    { id: 'match', labelKey: 'Study.guide.sec.rules.matchHead' },
  ],
  solving: [
    { id: 'toy', labelKey: 'Study.guide.sec.solving.toyHead' },
    { id: 'mixing', labelKey: 'Study.guide.sec.solving.mixHead' },
    { id: 'cfr', labelKey: 'Study.guide.sec.solving.cfrHead' },
  ],
  abstractions: [
    { id: 'suits', labelKey: 'Study.guide.sec.abstractions.suitsHead' },
    { id: 'copies', labelKey: 'Study.guide.sec.abstractions.copiesHead' },
    { id: 'roles', labelKey: 'Study.guide.sec.abstractions.rolesHead' },
    { id: 'vira-classes', labelKey: 'Study.guide.sec.abstractions.viraHead' },
    { id: 'subgames', labelKey: 'Study.guide.sec.abstractions.subgamesHead' },
  ],
  chart: [
    { id: 'blocks', labelKey: 'Study.guide.sec.chart.blocksHead' },
    { id: 'number', labelKey: 'Study.guide.sec.chart.numberHead' },
    { id: 'list', labelKey: 'Study.guide.sec.chart.listHead' },
    { id: 'walk', labelKey: 'Study.guide.sec.chart.walkHead' },
  ],
  ranges: [
    { id: 'range-tool', labelKey: 'Study.guide.sec.ranges.toolHead' },
    { id: 'blockers', labelKey: 'Study.guide.sec.ranges.blockersHead' },
  ],
  views: [
    { id: 'table', labelKey: 'Study.guide.sec.views.tableHead' },
    { id: 'strategy', labelKey: 'Study.lab.viewStrategy' },
    { id: 'range', labelKey: 'Study.lab.viewRange' },
    { id: 'cost', labelKey: 'Study.lab.viewCost' },
    { id: 'compare', labelKey: 'Study.lab.compare' },
    { id: 'selectors', labelKey: 'Study.guide.sec.views.selHead' },
    { id: 'header', labelKey: 'Study.guide.sec.views.headHead' },
  ],
  notation: [
    { id: 'histories', labelKey: 'Study.guide.sec.notation.historiesHead' },
    { id: 'grammar', labelKey: 'Study.guide.sec.notation.grammarHead' },
    { id: 'quizzes', labelKey: 'Study.guide.sec.notation.quizHead' },
  ],
  trust: [],
  eleven: [
    { id: 'stakes', labelKey: 'Study.guide.sec.eleven.stakesHead' },
    { id: 'reading', labelKey: 'Study.guide.sec.eleven.readingHead' },
    { id: 'charts', labelKey: 'Study.guide.sec.eleven.chartsHead' },
    { id: 'shape', labelKey: 'Study.guide.sec.eleven.shapeHead' },
  ],
  leads: [
    { id: 'question', labelKey: 'Study.guide.sec.leads.questionHead' },
    { id: 'charts', labelKey: 'Study.guide.sec.leads.chartsHead' },
    { id: 'patterns', labelKey: 'Study.guide.sec.leads.patternsHead' },
    { id: 'prices', labelKey: 'Study.guide.sec.leads.pricesHead' },
  ],
  raising: [
    { id: 'ladder', labelKey: 'Study.guide.sec.raising.ladderHead' },
    { id: 'timing', labelKey: 'Study.guide.sec.raising.timingHead' },
    { id: 'range', labelKey: 'Study.guide.sec.raising.rangeHead' },
    { id: 'answering', labelKey: 'Study.guide.sec.raising.answerHead' },
  ],
  leaks: [
    { id: 'pricing', labelKey: 'Study.guide.sec.leaks.pricingHead' },
    { id: 'table', labelKey: 'Study.guide.sec.leaks.tableHead' },
    { id: 'reading', labelKey: 'Study.guide.sec.leaks.readingHead' },
  ],
  numbers: [
    { id: 'census', labelKey: 'Study.guide.sec.numbers.censusHead' },
    { id: 'coverage', labelKey: 'Study.guide.sec.numbers.coverageHead' },
    { id: 'certificates', labelKey: 'Study.guide.sec.numbers.certHead' },
    { id: 'similarity', labelKey: 'Study.guide.sec.numbers.simHead' },
    { id: 'purity', labelKey: 'Study.guide.sec.numbers.purityHead' },
    { id: 'effort', labelKey: 'Study.guide.sec.numbers.effortHead' },
  ],
  glossary: [],
}

export function chapterSections(
  chapter: GuideChapter,
  t: (key: string) => string,
): ChapterSection[] {
  return CHAPTER_SECTION_DEFS[chapter].map(({ id, labelKey }) => ({ id, label: t(labelKey) }))
}
