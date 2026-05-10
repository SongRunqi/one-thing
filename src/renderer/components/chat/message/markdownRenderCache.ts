import type { MarkdownSegment } from '@/composables/parseStreamingMarkdown'

const SEGMENT_CACHE_MAX = 128
const MD_CACHE_MAX = 256

const segmentCache = new Map<string, MarkdownSegment[]>()
const mdCache = new Map<string, string>()

function touchCacheEntry<T>(cache: Map<string, T>, key: string, value: T, maxSize: number) {
  if (cache.has(key)) cache.delete(key)
  cache.set(key, value)
  while (cache.size > maxSize) {
    const firstKey = cache.keys().next().value
    if (firstKey === undefined) break
    cache.delete(firstKey)
  }
}

export function getCachedSegments(key: string): MarkdownSegment[] | undefined {
  return segmentCache.get(key)
}

export function cacheSegments(key: string, value: MarkdownSegment[]) {
  touchCacheEntry(segmentCache, key, value, SEGMENT_CACHE_MAX)
}

export function getCachedMarkdownHtml(key: string): string | undefined {
  return mdCache.get(key)
}

export function cacheMarkdownHtml(key: string, value: string) {
  touchCacheEntry(mdCache, key, value, MD_CACHE_MAX)
}
