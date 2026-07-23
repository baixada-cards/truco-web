export const DEFAULT_STAKE_CALLOUT_STYLE = 'wash'

export const STAKE_CALLOUT_STYLE_OPTIONS = [
  {
    id: 'current',
    label: '0 Current',
    summary: 'Unchanged gold callout',
  },
  {
    id: 'halo',
    label: '1 Halo',
    summary: 'Extra dark glow behind the lettering',
  },
  {
    id: 'wash',
    label: '2 Walnut wash',
    summary: 'Soft lacquer backdrop under the callout',
  },
  {
    id: 'smart-offset',
    label: '3 Smart offset',
    summary: 'Move away from active table cards',
  },
  {
    id: 'lane',
    label: '4 Callout lane',
    summary: 'Use a fixed clear lane above the table action',
  },
  {
    id: 'spotlight',
    label: '5 Spotlight',
    summary: 'Subtly dim cards beneath the event',
  },
  {
    id: 'split',
    label: '6 Split',
    summary: 'Decorative peg word, full copy stays in the rail',
  },
] as const

export type StakeCalloutStyle = typeof STAKE_CALLOUT_STYLE_OPTIONS[number]['id']

const STAKE_CALLOUT_STYLE_IDS = new Set<string>(
  STAKE_CALLOUT_STYLE_OPTIONS.map((option) => option.id),
)

export function isStakeCalloutStyle(value: unknown): value is StakeCalloutStyle {
  return typeof value === 'string' && STAKE_CALLOUT_STYLE_IDS.has(value)
}
