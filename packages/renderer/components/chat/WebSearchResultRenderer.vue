<template>
  <div class="web-search-result">
    <div class="web-search-summary">
      <div class="summary-title">
        <div
          class="search-icon-wrapper"
          :class="{ loading: isLoading }"
        >
          <Loader2
            v-if="isLoading"
            class="spin"
            :size="13"
          />
          <Search
            v-else
            :size="13"
            :stroke-width="2.4"
          />
        </div>
        <span>{{ phaseLabel }}</span>
      </div>
      <div class="summary-counts">
        <span class="count-badge">{{ resultCount }} results</span>
        <span
          v-if="pageCount > 0"
          class="count-badge page-badge"
        >{{ fetchedPageCount }}/{{ pageCount }} pages</span>
      </div>
    </div>

    <div class="web-search-body">
      <div class="searches-pane">
        <section
          v-for="search in searches"
          :key="search.id"
          class="search-group"
        >
          <div
            v-if="searches.length > 1"
            class="search-heading"
          >
            <span>{{ search.query }}</span>
            <span class="badge">{{ search.results.length }}</span>
          </div>

          <div class="results-grid">
            <Button
              v-for="item in search.results"
              :key="item.id"
              unstyled
              class="result-row card-item"
              :class="{ active: item.id === selectedResultId }"
              native-type="button"
              @click="selectResult(item.id)"
            >
              <div class="card-header-row">
                <div class="favicon-wrapper">
                  <img
                    :src="`https://www.google.com/s2/favicons?sz=64&domain=${hostFor(item.url)}`"
                    class="favicon"
                    alt=""
                    @error="onFaviconError"
                  >
                </div>
                <span class="result-rank">#{{ item.rank }}</span>
              </div>

              <div class="result-main">
                <span class="result-title">{{ item.title }}</span>
                <span
                  v-if="item.snippet"
                  class="result-snippet"
                >{{ item.snippet }}</span>
              </div>

              <div class="card-footer-row">
                <span class="result-url">{{ hostFor(item.url) }}</span>
                <span
                  class="page-status"
                  :class="pageStatusClass(item)"
                >
                  <span class="status-dot" />
                  <span class="status-text">{{ pageStatusLabel(item) }}</span>
                </span>
              </div>
            </Button>
          </div>
        </section>
      </div>

      <div
        class="reader-backdrop"
        :class="{ open: isReaderOpen }"
        @click="isReaderOpen = false"
      />

      <aside
        class="page-pane"
        :class="{ open: isReaderOpen }"
      >
        <template v-if="selectedResult">
          <div class="page-header">
            <div class="page-title-row">
              <FileText
                :size="15"
                :stroke-width="2.2"
              />
              <span
                class="page-title"
                :title="selectedPage?.title || selectedResult.title"
              >
                {{ selectedPage?.title || selectedResult.title }}
              </span>
            </div>
            <div class="header-actions">
              <a
                class="page-link"
                :href="selectedPage?.finalUrl || selectedResult.url"
                target="_blank"
                rel="noreferrer"
                title="Open original page"
              >
                <ExternalLink
                  :size="14"
                  :stroke-width="2.2"
                />
              </a>
              <Button
                unstyled
                class="close-reader-btn"
                native-type="button"
                title="Close reader"
                @click="isReaderOpen = false"
              >
                <X
                  :size="14"
                  :stroke-width="2.2"
                />
              </Button>
            </div>
          </div>

          <div class="page-meta">
            <span class="meta-tag domain-tag">{{ hostFor(selectedPage?.finalUrl || selectedResult.url) }}</span>
            <span
              v-if="selectedPage?.wordCount"
              class="meta-tag"
            >{{ selectedPage.wordCount }} words</span>
            <span
              v-if="selectedPage?.fetchMs !== undefined"
              class="meta-tag"
            >{{ selectedPage.fetchMs }}ms</span>
            <span
              v-if="selectedMatches.length > 0"
              class="meta-tag matches-tag"
            >{{ selectedMatches.length }} matches</span>
            <span
              v-if="selectedPage?.truncated"
              class="meta-tag warning-tag"
            >truncated</span>
          </div>

          <div
            v-if="selectedMatches.length > 0"
            class="matches-panel"
          >
            <div class="matches-heading">
              <Search
                :size="12"
                :stroke-width="2.2"
              />
              <span>Matching Excerpts</span>
            </div>
            <div class="matches-list">
              <div
                v-for="match in selectedMatches"
                :key="match.id"
                class="match-row"
              >
                <span class="match-index">{{ match.id }}</span>
                <span class="match-excerpt">{{ match.excerpt }}</span>
              </div>
            </div>
          </div>

          <pre
            v-if="selectedPage?.text"
            class="page-text"
          >{{ selectedPage.text }}</pre>
          <div
            v-else
            class="page-fallback"
          >
            <AlertCircle
              :size="15"
              :stroke-width="2.2"
            />
            <span>{{ selectedPage?.error || selectedResult.snippet || 'Reading page contents...' }}</span>
          </div>
        </template>

        <div
          v-else
          class="page-empty"
        >
          <Loader2
            v-if="isLoading"
            class="spin"
            :size="18"
            :stroke-width="2.2"
          />
          <Search
            v-else
            :size="18"
            :stroke-width="2.2"
          />
          <span>{{ isLoading ? 'Searching Brave...' : 'No search results selected' }}</span>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { computed, ref, watch } from 'vue'
import { AlertCircle, ExternalLink, FileText, Loader2, Search, X } from 'lucide-vue-next'
import type { ToolPartialResult } from '@/types'

interface WebSearchResultItem {
  id?: string
  searchId?: string
  query?: string
  rank?: number
  title: string
  url: string
  snippet: string
  pageId?: string
}

interface WebSearchRun {
  id?: string
  query: string
  resultCount?: number
  results: WebSearchResultItem[]
}

interface FetchedSearchPage {
  id: string
  resultId: string
  searchId: string
  query: string
  title: string
  url: string
  finalUrl?: string
  snippet: string
  status: 'ready' | 'failed' | 'skipped'
  statusCode?: number
  contentType?: string
  description?: string
  text?: string
  excerpt?: string
  charCount?: number
  wordCount?: number
  truncated?: boolean
  fetchMs?: number
  error?: string
}

interface WebSearchDetails {
  mode?: 'search' | 'open' | 'find'
  phase?: 'searching' | 'fetching_pages' | 'ready'
  query?: string
  queries?: string[]
  provider?: string
  resultCount?: number
  pageCount?: number
  fetchedPageCount?: number
  searches?: WebSearchRun[]
  results?: WebSearchResultItem[]
  pages?: FetchedSearchPage[]
  matches?: WebSearchMatch[]
}

interface WebSearchMatch {
  id: string
  pageId: string
  resultId: string
  pattern: string
  index: number
  match: string
  before: string
  after: string
  excerpt: string
}

const props = defineProps<{
  result: ToolPartialResult
  isPartial?: boolean
}>()

const selectedResultId = ref('')
const isReaderOpen = ref(false)

const details = computed(() => (props.result.details || {}) as WebSearchDetails)
const pages = computed(() => Array.isArray(details.value.pages) ? details.value.pages : [])
const matches = computed(() => Array.isArray(details.value.matches) ? details.value.matches : [])
const pagesById = computed(() => new Map(pages.value.map(page => [page.id, page])))
const pagesByResultId = computed(() => new Map(pages.value.map(page => [page.resultId, page])))

const searches = computed(() => {
  if (Array.isArray(details.value.searches) && details.value.searches.length > 0) {
    return details.value.searches.map((search, searchIndex) => normalizeSearch(search, searchIndex))
  }

  const results = Array.isArray(details.value.results) ? details.value.results : []
  return [{
    id: 's1',
    query: details.value.query || 'Search',
    results: results.map((result, resultIndex) => normalizeResult(result, 's1', details.value.query || 'Search', resultIndex)),
  }]
})

const flatResults = computed(() => searches.value.flatMap(search => search.results))
const selectedResult = computed(() =>
  flatResults.value.find(result => result.id === selectedResultId.value) || flatResults.value[0] || null,
)
const selectedPage = computed(() => {
  const result = selectedResult.value
  if (!result) return null
  return (result.pageId ? pagesById.value.get(result.pageId) : undefined) ||
    pagesByResultId.value.get(result.id) ||
    null
})
const selectedMatches = computed(() => {
  const result = selectedResult.value
  const page = selectedPage.value
  if (!result && !page) return []
  return matches.value.filter(match =>
    (page?.id && match.pageId === page.id) ||
    (result?.id && match.resultId === result.id),
  )
})

const resultCount = computed(() => details.value.resultCount ?? flatResults.value.length)
const pageCount = computed(() => details.value.pageCount ?? pages.value.length)
const fetchedPageCount = computed(() =>
  details.value.fetchedPageCount ?? pages.value.filter(page => page.status === 'ready').length,
)
const isLoading = computed(() => props.isPartial || details.value.phase === 'searching' || details.value.phase === 'fetching_pages')
const phaseLabel = computed(() => {
  if (details.value.mode === 'open' && isLoading.value) return 'Opening page'
  if (details.value.mode === 'open') return 'Page opened'
  if (details.value.mode === 'find' && isLoading.value) return 'Finding on page'
  if (details.value.mode === 'find') return 'Find complete'
  if (details.value.phase === 'fetching_pages') return 'Fetching pages'
  if (details.value.phase === 'searching') return 'Searching'
  if (resultCount.value > 0) return 'Search complete'
  return 'Web search'
})

watch(
  [flatResults, pages],
  () => {
    if (flatResults.value.some(result => result.id === selectedResultId.value)) return
    const firstReady = flatResults.value.find(result => pageForResult(result)?.status === 'ready')
    selectedResultId.value = firstReady?.id || flatResults.value[0]?.id || ''
  },
  { immediate: true },
)

function normalizeSearch(search: WebSearchRun, searchIndex: number) {
  const searchId = search.id || `s${searchIndex + 1}`
  const query = search.query || details.value.query || 'Search'
  return {
    id: searchId,
    query,
    results: (Array.isArray(search.results) ? search.results : [])
      .map((result, resultIndex) => normalizeResult(result, searchId, query, resultIndex)),
  }
}

function normalizeResult(result: WebSearchResultItem, searchId: string, query: string, resultIndex: number) {
  return {
    ...result,
    id: result.id || `${searchId}-r${resultIndex + 1}`,
    searchId: result.searchId || searchId,
    query: result.query || query,
    rank: result.rank || resultIndex + 1,
    title: result.title || result.url || 'Untitled result',
    url: result.url || '',
    snippet: result.snippet || '',
  }
}

function selectResult(id: string) {
  selectedResultId.value = id
  isReaderOpen.value = true
}

function pageForResult(result: WebSearchResultItem): FetchedSearchPage | null {
  return (result.pageId ? pagesById.value.get(result.pageId) : undefined) ||
    (result.id ? pagesByResultId.value.get(result.id) : undefined) ||
    null
}

function pageStatusLabel(result: WebSearchResultItem): string {
  const page = pageForResult(result)
  if (!page) return isLoading.value ? 'pending' : 'result'
  if (page.status === 'ready') return 'read'
  return page.status
}

function pageStatusClass(result: WebSearchResultItem): string {
  const page = pageForResult(result)
  if (!page) return isLoading.value ? 'pending' : 'result'
  return page.status
}

function hostFor(value: string): string {
  if (!value) return ''
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return value
  }
}

function onFaviconError(e: Event) {
  const target = e.target as HTMLImageElement | null
  if (target) {
    target.style.display = 'none'
  }
}
</script>

<style scoped>
.web-search-result {
  display: flex;
  flex-direction: column;
  min-width: 0;
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  font-family: var(--tool-font-sans);
  background: transparent;
  padding: 4px 0;
  position: relative;
  overflow: hidden;
}

.web-search-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 5px 0 7px;
  margin-bottom: 4px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--tool-border)) 26%, transparent);
  background: transparent;
}

.summary-title {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--ui-tool-text-fg, var(--tool-ink));
  font-size: var(--font-size-sm, 12px);
  font-weight: var(--font-weight-semibold, 600);
}

.search-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--ui-tool-accent-fg) 10%, transparent);
  color: var(--ui-tool-accent-fg);
}

.search-icon-wrapper.loading {
  background: color-mix(in srgb, var(--ui-tool-accent-fg) 15%, transparent);
  box-shadow: 0 0 10px color-mix(in srgb, var(--ui-tool-accent-fg) 30%, transparent);
}

.summary-counts {
  display: flex;
  align-items: center;
  gap: 6px;
}

.count-badge {
  font-size: var(--font-size-xs, 11px);
  font-weight: var(--font-weight-medium, 500);
  padding: 1px 7px;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--ui-tool-text-fg) 8%, transparent);
  color: var(--ui-tool-text-muted-fg);
}

.page-badge {
  background: color-mix(in srgb, var(--ui-tool-accent-fg) 10%, transparent);
  color: var(--ui-tool-accent-fg);
}

.web-search-body {
  position: relative;
  width: 100%;
}

.searches-pane {
  min-width: 0;
  width: 100%;
}

.search-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.search-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px;
  font-size: var(--font-size-xs, 11px);
  color: var(--ui-tool-text-faint-fg);
  font-weight: var(--font-weight-semibold);
}

.search-heading .badge {
  padding: 1px 6px;
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--ui-tool-text-fg) 8%, transparent);
}

.results-grid {
  display: flex;
  flex-direction: column;
  gap: 0;
  max-height: min(260px, 34vh);
  overflow: auto;
  padding: 0;
}

/* Card-Item result button styling */
.result-row.card-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "main rank"
    "footer footer";
  align-items: start;
  column-gap: 10px;
  row-gap: 4px;
  text-align: left;
  border: 0;
  border-top: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--tool-border)) 24%, transparent);
  border-radius: 0;
  background: transparent;
  padding: 7px 2px;
  min-height: 0;
  cursor: pointer;
  outline: none;
  font-family: inherit;
  transition: background var(--duration-fast, 0.15s) var(--ease-default), color var(--duration-fast, 0.15s) var(--ease-default);
  box-shadow: none;
}

.result-row.card-item:first-child {
  border-top: 0;
}

.result-row.card-item:hover {
  background: color-mix(in srgb, var(--ui-state-hover-bg, var(--hover)) 22%, transparent);
}

.result-row.card-item.active {
  background: color-mix(in srgb, var(--ui-accent-primary-fg) 6%, transparent);
  box-shadow: inset 2px 0 0 var(--ui-accent-primary-fg);
}

.card-header-row {
  grid-area: rank;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  margin-bottom: 0;
}

.favicon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--ui-tool-text-fg) 6%, transparent);
  overflow: hidden;
}

.favicon {
  width: 12px;
  height: 12px;
  object-fit: contain;
}

.result-rank {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ui-tool-text-faint-fg);
  font-weight: var(--font-weight-semibold);
}

.result-main {
  grid-area: main;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  margin-bottom: 0;
}

.result-title {
  color: var(--ui-tool-text-fg, var(--tool-ink));
  font-size: var(--font-size-sm, 12px);
  font-weight: var(--font-weight-semibold, 600);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  overflow: hidden;
}

.result-snippet {
  font-size: var(--font-size-xs, 11px);
  color: var(--ui-tool-text-muted-fg);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  overflow: hidden;
}

.card-footer-row {
  grid-area: footer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0;
  font-size: var(--font-size-xs, 11px);
}

.result-url {
  color: var(--ui-tool-text-faint-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 65%;
}

.page-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border-radius: var(--radius-full);
  font-size: 9px;
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.02em;
  background: color-mix(in srgb, var(--ui-tool-text-fg) 8%, transparent);
  color: var(--ui-tool-text-faint-fg);
}

.page-status .status-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
}

.page-status.ready {
  background: color-mix(in srgb, var(--ui-tool-success-text-fg) 12%, transparent);
  color: var(--ui-tool-success-text-fg);
}

.page-status.failed,
.page-status.skipped {
  background: color-mix(in srgb, var(--ui-tool-danger-text-fg) 12%, transparent);
  color: var(--ui-tool-danger-text-fg);
}

.page-status.pending {
  background: color-mix(in srgb, var(--ui-tool-accent-fg) 12%, transparent);
  color: var(--ui-tool-accent-fg);
}

/* Slide-over Reader Sheet - Changed to position: absolute */
.reader-backdrop {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 999;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s ease;
}

.reader-backdrop.open {
  opacity: 1;
  pointer-events: auto;
}

.page-pane {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 480px;
  max-width: calc(100vw - 60px);
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
  border-left: 1px solid var(--ui-border-divider-border, var(--border-divider));
  box-shadow: var(--shadow-xl);
  z-index: 1000;
  transform: translateX(100%);
  transition: transform 0.26s cubic-bezier(0.25, 1, 0.5, 1), visibility 0.26s;
  visibility: hidden;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-pane.open {
  transform: translateX(0);
  visibility: visible;
  pointer-events: auto;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--ui-border-divider-border, var(--border-divider));
}

.page-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--ui-text-primary-fg);
}

.page-title {
  font-size: var(--font-size-md, 14px);
  font-weight: var(--font-weight-semibold, 600);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.page-link,
.close-reader-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  border: 0;
  background: transparent;
  color: var(--ui-text-muted-fg);
  cursor: pointer;
  transition: all var(--duration-fast, 0.15s) var(--ease-default);
}

.page-link:hover,
.close-reader-btn:hover {
  background: var(--ui-state-hover-bg);
  color: var(--ui-text-primary-fg);
}

.page-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 12px 16px;
  background: color-mix(in srgb, var(--ui-text-primary-fg) 2%, transparent);
  border-bottom: 1px solid var(--ui-border-divider-border, var(--border-divider));
}

.meta-tag {
  font-size: 10px;
  font-weight: var(--font-weight-medium);
  padding: 1px 6px;
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--ui-text-primary-fg) 6%, transparent);
  color: var(--ui-text-muted-fg);
}

.domain-tag {
  background: color-mix(in srgb, var(--ui-accent-primary-fg) 8%, transparent);
  color: var(--ui-accent-primary-fg);
}

.matches-tag {
  background: var(--ui-status-warning-bg, transparent);
  color: var(--ui-status-warning-fg);
}

/* Truncation is a warning, not a failure. Kept unfilled with a hairline so it
   stays distinct from the filled .matches-tag sitting beside it in the row —
   status surfaces must come from the complete bg/border/fg token set, never
   color-mixed off -fg (see styles/__tests__/ui-token-vars.test.ts). */
.warning-tag {
  background: transparent;
  border: 1px solid var(--ui-status-warning-border, var(--ui-status-warning-fg));
  color: var(--ui-status-warning-fg);
}

/* Matches Panel */
.matches-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: color-mix(in srgb, var(--ui-accent-primary-fg) 4%, var(--ui-surface-elevated-bg));
  border-bottom: 1px solid var(--ui-border-divider-border, var(--border-divider));
  padding: 12px 16px;
  max-height: 160px;
}

.matches-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-xs, 11px);
  font-weight: var(--font-weight-semibold);
  color: var(--ui-text-primary-fg);
}

.matches-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
}

.match-row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 8px;
  padding: 4px 0;
  border-top: 1px solid color-mix(in srgb, var(--ui-border-divider-border) 40%, transparent);
}

.match-row:first-of-type {
  border-top: 0;
}

.match-index {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ui-text-faint-fg);
  text-align: center;
}

.match-excerpt {
  font-size: var(--font-size-sm, 12px);
  color: var(--ui-text-muted-fg);
  line-height: 1.45;
  word-break: break-word;
}

/* Reader Body Text */
.page-text {
  flex: 1;
  margin: 0;
  padding: 16px 20px;
  overflow-y: auto;
  font-family: var(--font-serif);
  font-size: 13.5px;
  line-height: var(--tool-line-height, 1.6);
  color: var(--ui-text-secondary-fg);
  white-space: pre-wrap;
  word-break: break-word;
  background: transparent;
}

.page-fallback {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 24px;
  color: var(--ui-text-muted-fg);
  font-size: var(--font-size-sm, 12px);
}

.page-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex: 1;
  color: var(--ui-text-faint-fg);
  font-size: var(--font-size-sm, 12px);
}

.spin {
  animation: web-search-spin 0.8s linear infinite;
}

@keyframes web-search-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 600px) {
  .results-grid {
    grid-template-columns: 1fr;
  }
  .page-pane {
    width: 100%;
    max-width: 100%;
  }
}
</style>
