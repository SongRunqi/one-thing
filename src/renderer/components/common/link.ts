export const linkUnderlineValues = ['always', 'hover', 'none'] as const
export const linkIconPositions = ['start', 'end'] as const

export type LinkUnderlineMode = (typeof linkUnderlineValues)[number]
export type LinkUnderline = boolean | LinkUnderlineMode
export type LinkIconPosition = (typeof linkIconPositions)[number]

export function normalizeLinkUnderline(value: LinkUnderline | undefined): LinkUnderlineMode {
  if (value === true) return 'always'
  if (value === false) return 'none'
  if (value && linkUnderlineValues.includes(value)) return value

  return 'hover'
}
