<template>
  <Transition name="slide-right">
    <div
      v-if="isPreviewOpen"
      class="file-preview-panel"
      :class="{ resizing: storeIsResizing }"
    >
      <!-- Header -->
      <div class="preview-header">
        <div class="file-info">
          <FileCode :size="14" :stroke-width="1.5" class="file-icon" />
          <span class="file-name" :title="previewFile?.path">{{ previewFile?.name }}</span>
        </div>
        <div class="header-actions">
          <button
            class="action-btn"
            title="Search (Cmd+F)"
            @click="toggleSearch"
          >
            <Search :size="14" :stroke-width="1.5" />
          </button>
          <button
            class="action-btn"
            :title="copied ? 'Copied!' : 'Copy content'"
            @click="copyContent"
          >
            <Check v-if="copied" :size="14" :stroke-width="1.5" />
            <Copy v-else :size="14" :stroke-width="1.5" />
          </button>
          <button
            class="action-btn close-btn"
            title="Close preview"
            @click="closePreview"
          >
            <X :size="14" :stroke-width="1.5" />
          </button>
        </div>
      </div>

      <!-- Search bar -->
      <div v-if="showSearch" class="search-bar">
        <input
          ref="searchInput"
          v-model="searchQuery"
          type="text"
          placeholder="Search..."
          @keydown.escape="toggleSearch"
          @keydown.enter="handleSearchEnter"
          @input="onSearchInput"
        />
        <span v-if="searchQuery" class="search-results">
          {{ searchResults.length > 0 ? `${currentResultIndex + 1}/${searchResults.length}` : 'No results' }}
        </span>
        <button class="search-nav-btn" @click="findPrev" title="Previous (Shift+Enter)">
          <ChevronUp :size="12" :stroke-width="2" />
        </button>
        <button class="search-nav-btn" @click="findNext" title="Next (Enter)">
          <ChevronDown :size="12" :stroke-width="2" />
        </button>
        <button class="search-close-btn" @click="toggleSearch">
          <X :size="12" :stroke-width="2" />
        </button>
      </div>

      <!-- Loading state -->
      <div v-if="isPreviewLoading" class="preview-loading">
        <div class="loading-spinner"></div>
        <span>Loading file...</span>
      </div>

      <!-- Error state -->
      <div v-else-if="previewError" class="preview-error">
        <AlertCircle :size="24" :stroke-width="1.5" />
        <span>{{ previewError }}</span>
      </div>

      <!-- Content -->
      <div v-else-if="previewFile" ref="contentEl" class="preview-content">
        <div class="line-numbers">
          <span v-for="n in previewFile.lineCount" :key="n" class="line-number">{{ n }}</span>
        </div>
        <pre class="code-content"><code :class="`language-${previewFile.language}`" v-html="highlightedContent"></code></pre>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { FileCode, Search, Copy, Check, X, ChevronUp, ChevronDown, AlertCircle } from 'lucide-vue-next'
import { useRightSidebarStore } from '@/stores/right-sidebar'
import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import bash from 'highlight.js/lib/languages/bash'
import xml from 'highlight.js/lib/languages/xml'
import markdown from 'highlight.js/lib/languages/markdown'
import css from 'highlight.js/lib/languages/css'
import python from 'highlight.js/lib/languages/python'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import java from 'highlight.js/lib/languages/java'
import yaml from 'highlight.js/lib/languages/yaml'
import sql from 'highlight.js/lib/languages/sql'
import ruby from 'highlight.js/lib/languages/ruby'
import php from 'highlight.js/lib/languages/php'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'

// Register languages
hljs.registerLanguage('json', json)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('tsx', typescript)
hljs.registerLanguage('jsx', javascript)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('vue', xml)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('css', css)
hljs.registerLanguage('scss', css)
hljs.registerLanguage('less', css)
hljs.registerLanguage('python', python)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('java', java)
hljs.registerLanguage('kotlin', java)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('php', php)
hljs.registerLanguage('c', c)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('csharp', cpp)

const rightSidebarStore = useRightSidebarStore()
// Use storeToRefs to ensure Vue reactivity for store properties
const { isPreviewOpen, previewFile, isPreviewLoading, previewError, isResizing: storeIsResizing } = storeToRefs(rightSidebarStore)

const contentEl = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const copied = ref(false)

// Search state
const showSearch = ref(false)
const searchQuery = ref('')
const searchResults = ref<number[]>([])
const currentResultIndex = ref(0)

// Highlight content
const highlightedContent = computed(() => {
  if (!previewFile.value) return ''

  const { content, language } = previewFile.value

  if (language === 'plaintext') {
    return escapeHtml(content)
  }

  try {
    // Check if language is registered
    const lang = hljs.getLanguage(language)
    if (lang) {
      const result = hljs.highlight(content, {
        language,
        ignoreIllegals: true,
      })
      return result.value
    }
    return escapeHtml(content)
  } catch {
    return escapeHtml(content)
  }
})

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// Actions
async function copyContent() {
  if (!previewFile.value) return

  try {
    await navigator.clipboard.writeText(previewFile.value.content)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

function openInEditor() {
  if (!previewFile.value) return
  window.electronAPI.openPath(previewFile.value.path)
}

function closePreview() {
  rightSidebarStore.closePreview()
}

// Search functionality
function toggleSearch() {
  showSearch.value = !showSearch.value
  if (showSearch.value) {
    nextTick(() => {
      searchInput.value?.focus()
    })
  } else {
    searchQuery.value = ''
    searchResults.value = []
    currentResultIndex.value = 0
  }
}

function handleSearchEnter(event: KeyboardEvent) {
  if (event.shiftKey) {
    findPrev()
  } else {
    findNext()
  }
}

function onSearchInput() {
  if (!previewFile.value || !searchQuery.value) {
    searchResults.value = []
    currentResultIndex.value = 0
    return
  }

  const query = searchQuery.value.toLowerCase()
  const lines = previewFile.value.content.split('\n')
  const results: number[] = []

  lines.forEach((line, index) => {
    if (line.toLowerCase().includes(query)) {
      results.push(index)
    }
  })

  searchResults.value = results
  currentResultIndex.value = 0

  if (results.length > 0) {
    scrollToLine(results[0])
  }
}

function findNext() {
  if (searchResults.value.length === 0) return

  currentResultIndex.value = (currentResultIndex.value + 1) % searchResults.value.length
  scrollToLine(searchResults.value[currentResultIndex.value])
}

function findPrev() {
  if (searchResults.value.length === 0) return

  currentResultIndex.value = currentResultIndex.value === 0
    ? searchResults.value.length - 1
    : currentResultIndex.value - 1
  scrollToLine(searchResults.value[currentResultIndex.value])
}

function getLineMetrics() {
  if (!contentEl.value) {
    return { lineHeight: 20, paddingTop: 0 }
  }

  const lineNumbers = contentEl.value.querySelector<HTMLElement>('.line-numbers')
  const lineNumber = contentEl.value.querySelector<HTMLElement>('.line-number')
  const lineHeight = lineNumber?.getBoundingClientRect().height || 20
  const paddingTop = lineNumbers ? parseFloat(getComputedStyle(lineNumbers).paddingTop) || 0 : 0

  return { lineHeight, paddingTop }
}

function scrollToLine(lineIndex: number) {
  if (!contentEl.value) return

  const { lineHeight, paddingTop } = getLineMetrics()
  const targetTop = lineIndex * lineHeight + paddingTop
  const scrollTop = targetTop - (contentEl.value.clientHeight - lineHeight) / 2
  const maxScroll = contentEl.value.scrollHeight - contentEl.value.clientHeight

  contentEl.value.scrollTop = Math.min(Math.max(0, scrollTop), Math.max(0, maxScroll))
}

// Keyboard shortcut for search
function handleKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === 'f') {
    if (isPreviewOpen.value) {
      event.preventDefault()
      toggleSearch()
    }
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

watch(previewFile, () => {
  copied.value = false
  if (!showSearch.value) return

  nextTick(() => {
    if (searchQuery.value) {
      onSearchInput()
    } else {
      searchResults.value = []
      currentResultIndex.value = 0
    }
  })
})

watch(isPreviewOpen, (open) => {
  if (!open) {
    showSearch.value = false
    searchQuery.value = ''
    searchResults.value = []
    currentResultIndex.value = 0
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.file-preview-panel {
  position: relative;
  height: 100%;
  flex: 1;  /* Auto-fill remaining space */
  min-width: 0;  /* Allow flex shrinking - parent controls actual width */
  background: var(--panel);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.file-preview-panel.resizing {
  transition: none;  /* Disable transition during resize for smooth dragging */
}

/* Header - unified with RightPanel */
.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-divider);
  gap: 8px;
  background: transparent;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 0.4em;
  min-width: 0;
  flex: 1;
}

.file-icon {
  color: var(--muted);
  flex-shrink: 0;
}

.file-info :deep(svg) {
  width: 1em;
  height: 1em;
}

.file-name {
  font-size: 11px;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.01em;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 4px;
  color: var(--muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.action-btn :deep(svg) {
  width: 1em;
  height: 1em;
}

.action-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.action-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.25);
}

.close-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* Search bar */
.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: transparent;
  border-bottom: 1px solid var(--border-divider);
}

.search-bar input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
  outline: none;
}

.search-bar input:focus {
  border-color: var(--accent);
}

.search-results {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
}

.search-nav-btn,
.search-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.search-nav-btn:hover,
.search-close-btn:hover {
  background: var(--hover);
  color: var(--text);
}

/* Loading state */
.preview-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--muted);
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Error state */
.preview-error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--muted);
  padding: 20px;
  text-align: center;
}

.preview-error svg {
  color: #ef4444;
}

/* Content */
.preview-content {
  flex: 1;
  display: flex;
  overflow: auto;  /* Single scroll container */
  min-height: 0;
  background: var(--bg);
}

.line-numbers {
  display: flex;
  flex-direction: column;
  padding: 12px 8px;
  background: var(--bg);
  border-right: 1px solid var(--border-subtle);
  user-select: none;
  flex-shrink: 0;
  position: sticky;
  left: 0;
  z-index: 1;
}

.line-number {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 20px;
  color: var(--text-faint);
  text-align: right;
  min-width: 32px;
}

.code-content {
  margin: 0;
  padding: 12px;
  padding-left: 8px;
  background: var(--bg);
  width: max-content;  /* Width determined by content, not flex */
  min-width: 100%;  /* At least fill available space */
}

.code-content code {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 20px;
  color: var(--text);
  white-space: pre;
}

/* Transition */
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

/* Scrollbar */
.preview-content::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.preview-content::-webkit-scrollbar-track {
  background: transparent;
}

.preview-content::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.3);
  border-radius: 4px;
}

.preview-content::-webkit-scrollbar-thumb:hover {
  background: rgba(128, 128, 128, 0.5);
}
</style>
