export interface FileSearchMatch {
  from: number
  to: number
}

export function findFileSearchMatches(
  text: string,
  query: string,
  caseSensitive: boolean,
): FileSearchMatch[] {
  if (!query) return []

  const haystack = caseSensitive ? text : text.toLocaleLowerCase()
  const needle = caseSensitive ? query : query.toLocaleLowerCase()
  const matches: FileSearchMatch[] = []
  let index = 0

  while (index <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, index)
    if (found === -1) break
    matches.push({ from: found, to: found + needle.length })
    index = found + Math.max(needle.length, 1)
  }

  return matches
}

export function normalizeSearchIndex(index: number, matchCount: number): number {
  if (matchCount <= 0) return -1
  return ((index % matchCount) + matchCount) % matchCount
}

export function nextSearchIndex(index: number, matchCount: number, direction: 1 | -1): number {
  if (matchCount <= 0) return -1
  return normalizeSearchIndex(index + direction, matchCount)
}

export function markSearchMatchesInHtml(
  html: string,
  matches: FileSearchMatch[],
  currentIndex: number,
): string {
  if (matches.length === 0 || typeof document === 'undefined') return html

  const template = document.createElement('template')
  template.innerHTML = html
  let offset = 0

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  let node = walker.nextNode()
  while (node) {
    textNodes.push(node as Text)
    node = walker.nextNode()
  }

  for (const textNode of textNodes) {
    const text = textNode.data
    const start = offset
    const end = offset + text.length
    offset = end

    const localMatches = matches
      .map((match, index) => ({ ...match, index }))
      .filter(match => match.to > start && match.from < end)

    if (localMatches.length === 0) continue

    const fragment = document.createDocumentFragment()
    let cursor = 0

    for (const match of localMatches) {
      const localFrom = Math.max(0, match.from - start)
      const localTo = Math.min(text.length, match.to - start)
      if (localFrom > cursor) {
        fragment.append(document.createTextNode(text.slice(cursor, localFrom)))
      }

      const mark = document.createElement('mark')
      mark.className = match.index === currentIndex
        ? 'file-search-match file-search-current'
        : 'file-search-match'
      mark.dataset.searchIndex = String(match.index)
      mark.textContent = text.slice(localFrom, localTo)
      fragment.append(mark)
      cursor = localTo
    }

    if (cursor < text.length) {
      fragment.append(document.createTextNode(text.slice(cursor)))
    }

    textNode.replaceWith(fragment)
  }

  return template.innerHTML
}
