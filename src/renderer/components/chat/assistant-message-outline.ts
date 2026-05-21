export type AssistantOutlineKind = 'heading' | 'code' | 'table' | 'image'

export interface AssistantMessageOutlineMarker {
  navIndex: number
  messageId: string
  anchorId: string
  level: number
  kind: AssistantOutlineKind
  label: string
  preview: string
}

export const ASSISTANT_OUTLINE_ANCHOR_ATTR = 'data-assistant-outline-anchor'

const HEADING_SELECTOR = '.content h1, .content h2, .content h3, .content h4'
const LANDMARK_SELECTOR = '.content .code-block-container, .content table, .content img'
const MAX_OUTLINE_MARKERS = 28

function compactText(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim()
}

function truncateLabel(value: string, maxLength = 72): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1).trimEnd()}...`
}

function headingLevel(element: Element): number {
  const match = element.tagName.match(/^H([1-6])$/i)
  return match ? Number(match[1]) : 4
}

function isHeading(element: Element): boolean {
  return /^H[1-6]$/i.test(element.tagName)
}

function isCodeBlock(element: Element): boolean {
  return element.classList.contains('code-block-container')
}

function labelForLandmark(element: HTMLElement): { kind: AssistantOutlineKind; label: string; level: number } | null {
  if (isCodeBlock(element)) {
    const lang = compactText(element.querySelector('.code-block-lang')?.textContent)
    return {
      kind: 'code',
      label: lang ? `Code - ${lang}` : 'Code',
      level: 4,
    }
  }

  if (element.tagName === 'TABLE') {
    return { kind: 'table', label: 'Table', level: 4 }
  }

  if (element.tagName === 'IMG') {
    const alt = compactText((element as HTMLImageElement).alt)
    return {
      kind: 'image',
      label: alt ? `Image - ${truncateLabel(alt, 48)}` : 'Image',
      level: 4,
    }
  }

  return null
}

function sortByDocumentOrder(elements: HTMLElement[]): HTMLElement[] {
  return [...elements].sort((a, b) => {
    if (a === b) return 0
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  })
}

function uniqueElements(elements: HTMLElement[]): HTMLElement[] {
  const seen = new Set<HTMLElement>()
  return elements.filter(element => {
    if (seen.has(element)) return false
    seen.add(element)
    return true
  })
}

export function buildAssistantMessageOutlineMarkers(
  messageId: string,
  row: HTMLElement,
): AssistantMessageOutlineMarker[] {
  const headingElements = Array.from(row.querySelectorAll<HTMLElement>(HEADING_SELECTOR))
    .filter(element => compactText(element.textContent).length > 0)

  const primaryHeadings = headingElements.filter(element => headingLevel(element) <= 3)
  const headings = primaryHeadings.length >= 2 ? primaryHeadings : headingElements

  const landmarkElements = headings.length >= 2
    ? []
    : Array.from(row.querySelectorAll<HTMLElement>(LANDMARK_SELECTOR))

  const outlineElements = sortByDocumentOrder(uniqueElements([
    ...headings,
    ...landmarkElements,
  ])).slice(0, MAX_OUTLINE_MARKERS)

  return outlineElements.flatMap((element, navIndex) => {
    const heading = isHeading(element)
    const landmark = heading ? null : labelForLandmark(element)
    const label = heading ? compactText(element.textContent) : landmark?.label
    if (!label) return []

    const anchorId = `${messageId}:${navIndex}`
    element.setAttribute(ASSISTANT_OUTLINE_ANCHOR_ATTR, anchorId)

    return [{
      navIndex,
      messageId,
      anchorId,
      level: heading ? headingLevel(element) : landmark?.level ?? 4,
      kind: heading ? 'heading' as const : landmark?.kind ?? 'code' as const,
      label: truncateLabel(label),
      preview: truncateLabel(label, 48),
    }]
  })
}

export function shouldShowAssistantMessageOutline(
  row: HTMLElement,
  scroller: HTMLElement,
  markerCount: number,
): boolean {
  if (markerCount < 2) return false
  const minimumHeight = Math.max(620, scroller.clientHeight * 0.78)
  return row.offsetHeight >= minimumHeight
}
