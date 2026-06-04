<template>
  <div class="search-window">
    <!-- Tabs row (IDEA style: tabs on top) -->
    <div class="search-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="['tab', { active: activeTab === tab.id }]"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Search input -->
    <div class="search-input-row">
      <Search
        :size="16"
        class="search-icon"
      />
      <input
        ref="inputRef"
        v-model="query"
        type="text"
        class="search-input"
        :placeholder="inputPlaceholder"
        spellcheck="false"
        @keydown="onInputKeydown"
      >
    </div>

    <!-- Results -->
    <div
      ref="resultsRef"
      class="search-results"
    >
      <template v-if="groupedResults.length > 0">
        <template
          v-for="group in groupedResults"
          :key="group.type"
        >
          <div
            v-if="activeTab === 'all'"
            class="group-header"
          >
            {{ group.label }}
          </div>
          <SearchResultItem
            v-for="(item, i) in group.items"
            :key="item.id"
            :result="item"
            :selected="flatIndex(group, i) === selectedIndex"
            @select="confirmResult(item)"
            @hover="selectedIndex = flatIndex(group, i)"
          />
        </template>
      </template>
      <div
        v-else-if="isLoading"
        class="search-state"
      >
        Searching...
      </div>
      <div
        v-else-if="searchError"
        class="search-state error"
      >
        {{ searchError }}
      </div>
      <div
        v-else
        class="search-state"
      >
        {{ emptyText }}
      </div>
    </div>

    <div
      v-if="showPromptCreate"
      class="prompt-dialog-backdrop"
      @click.self="closePromptCreate"
    >
      <form
        class="prompt-dialog"
        @submit.prevent="createPromptFromDialog"
      >
        <header class="prompt-dialog-header">
          <h2>Create Prompt</h2>
          <button
            type="button"
            class="prompt-dialog-close"
            @click="closePromptCreate"
          >
            ×
          </button>
        </header>
        <label>
          <span>Name</span>
          <input
            v-model="promptForm.title"
            type="text"
            autofocus
          >
        </label>
        <label>
          <span>Description</span>
          <input
            v-model="promptForm.description"
            type="text"
          >
        </label>
        <label>
          <span>Prompt</span>
          <textarea
            v-model="promptForm.body"
            rows="7"
          />
        </label>
        <div
          v-if="promptFormError"
          class="prompt-dialog-error"
        >
          {{ promptFormError }}
        </div>
        <footer>
          <button
            type="button"
            class="secondary"
            @click="closePromptCreate"
          >
            Cancel
          </button>
          <button type="submit">
            Save
          </button>
        </footer>
      </form>
    </div>

    <!-- Footer hints -->
    <div class="search-footer">
      <span><kbd>&uarr;</kbd><kbd>&darr;</kbd> Navigate</span>
      <span><kbd>&crarr;</kbd> Open</span>
      <span><kbd>Tab</kbd> Switch tab</span>
      <span><kbd>Esc</kbd> Close</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { Search } from 'lucide-vue-next'
import { useSettingsStore } from '@/stores/settings'
import { useThemeStore } from '@/stores/themes'
import SearchResultItem from './SearchResultItem.vue'
import type { SearchResult, SearchCategory } from '@shared/ipc/search'

// ── Tabs ──────────────────────────────────────────
const settingsStore = useSettingsStore()
const tabs = computed<{ id: SearchCategory; label: string }[]>(() => {
  const items: { id: SearchCategory; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'chats', label: 'Chats' },
  ]
  if (settingsStore.settings.general.dailyNotes?.enabled !== false) {
    items.push({ id: 'daily', label: 'Daily' })
  }
  items.push(
    { id: 'prompts', label: 'Prompts' },
    { id: 'files', label: 'Files' },
    { id: 'messages', label: 'Messages' },
    { id: 'actions', label: 'Actions' },
  )
  return items
})

const activeTab = ref<SearchCategory>('all')
const query = ref('')
const results = ref<SearchResult[]>([])
const selectedIndex = ref(0)
const isLoading = ref(false)
const searchError = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const resultsRef = ref<HTMLElement | null>(null)
const showPromptCreate = ref(false)
const promptForm = ref({ title: '', description: '', body: '' })
const promptFormError = ref('')

// ── Grouped results for "All" tab ─────────────────
interface ResultGroup {
  type: string
  label: string
  items: SearchResult[]
}

const groupedResults = computed<ResultGroup[]>(() => {
  if (results.value.length === 0) return []

  if (activeTab.value !== 'all') {
    return [{ type: activeTab.value, label: '', items: results.value }]
  }

  const groups: ResultGroup[] = []
  const chats = results.value.filter(r => r.type === 'chat')
  const daily = results.value.filter(r => r.type === 'daily')
  const prompts = results.value.filter(r => r.type === 'prompt')
  const files = results.value.filter(r => r.type === 'file')
  const messages = results.value.filter(r => r.type === 'message')
  const actions = results.value.filter(r => r.type === 'action')

  if (chats.length) groups.push({ type: 'chat', label: 'Chats', items: chats })
  if (prompts.length) groups.push({ type: 'prompt', label: 'Prompts', items: prompts })
  if (daily.length) groups.push({ type: 'daily', label: 'Daily Notes', items: daily })
  if (files.length) groups.push({ type: 'file', label: 'Files', items: files })
  if (messages.length) groups.push({ type: 'message', label: 'Messages', items: messages })
  if (actions.length) groups.push({ type: 'action', label: 'Actions', items: actions })

  return groups
})

const totalResults = computed(() =>
  groupedResults.value.reduce((sum, g) => sum + g.items.length, 0)
)

const inputPlaceholder = computed(() => {
  if (activeTab.value === 'actions') return 'Run a command...'
  if (activeTab.value === 'prompts') return 'Search or create prompts...'
  if (activeTab.value === 'daily') return 'Find daily notes, or open today...'
  if (activeTab.value === 'files') return 'Search files in current workspace and notes...'
  if (activeTab.value === 'messages') return 'Search across chat messages...'
  if (activeTab.value === 'chats') return 'Search chats...'
  return 'Search chats, prompts, daily notes, files, messages, and commands...'
})

const emptyText = computed(() => {
  if (query.value.trim()) return 'No results found'
  if (activeTab.value === 'prompts') return 'Type to search or create prompts...'
  if (activeTab.value === 'daily') return 'No daily notes directory found'
  if (activeTab.value === 'files' || activeTab.value === 'messages') return 'Type to search...'
  return 'Start typing, or use / for commands'
})

function flatIndex(group: ResultGroup, localIndex: number): number {
  let offset = 0
  for (const g of groupedResults.value) {
    if (g === group) return offset + localIndex
    offset += g.items.length
  }
  return offset + localIndex
}

function getResultByFlatIndex(idx: number): SearchResult | undefined {
  let offset = 0
  for (const g of groupedResults.value) {
    if (idx < offset + g.items.length) return g.items[idx - offset]
    offset += g.items.length
  }
}

// ── Search execution (debounced) ──────────────────
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let searchSeq = 0
let unsubscribeShown: (() => void) | null = null

async function doSearch() {
  const seq = ++searchSeq
  isLoading.value = true
  searchError.value = ''
  try {
    const res = await window.electronAPI.searchQuery({
      query: query.value,
      category: activeTab.value,
      limit: 24,
    })
    if (seq !== searchSeq) return
    if (res?.success) {
      results.value = res.results
      selectedIndex.value = 0
      nextTick(() => {
        if (resultsRef.value) resultsRef.value.scrollTop = 0
      })
    } else {
      results.value = []
      searchError.value = 'Search failed'
    }
  } catch (err) {
    if (seq !== searchSeq) return
    results.value = []
    searchError.value = err instanceof Error ? err.message : 'Search failed'
  } finally {
    if (seq === searchSeq) isLoading.value = false
  }
}

watch([query, activeTab], () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(doSearch, query.value ? 150 : 0)
})

// ── Keyboard navigation ──────────────────────────
function onInputKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && /^[1-7]$/.test(e.key)) {
    e.preventDefault()
    const tab = tabs.value[Number(e.key) - 1]
    if (tab) activeTab.value = tab.id
    return
  }

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      if (totalResults.value > 0) {
        selectedIndex.value = (selectedIndex.value + 1) % totalResults.value
      }
      scrollSelectedIntoView()
      break
    case 'ArrowUp':
      e.preventDefault()
      if (totalResults.value > 0) {
        selectedIndex.value = (selectedIndex.value - 1 + totalResults.value) % totalResults.value
      }
      scrollSelectedIntoView()
      break
    case 'Enter':
      e.preventDefault()
      confirmSelected()
      break
    case 'Escape':
      e.preventDefault()
      if (showPromptCreate.value) {
        closePromptCreate()
        return
      }
      window.electronAPI.closeSearchWindow()
      break
    case 'Tab':
      e.preventDefault()
      cycleTab(e.shiftKey ? -1 : 1)
      break
    case '/':
      if (!query.value && activeTab.value !== 'actions') {
        activeTab.value = 'actions'
      }
      break
  }
}

function cycleTab(dir: number) {
  const idx = tabs.value.findIndex(t => t.id === activeTab.value)
  const next = (idx + dir + tabs.value.length) % tabs.value.length
  activeTab.value = tabs.value[next].id
}

function scrollSelectedIntoView() {
  nextTick(() => {
    const container = resultsRef.value
    if (!container) return
    const items = container.querySelectorAll('.search-result-item')
    const el = items[selectedIndex.value] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  })
}

// ── Confirm ──────────────────────────────────────
function confirmSelected() {
  const item = getResultByFlatIndex(selectedIndex.value)
  if (item) confirmResult(item)
}

function confirmResult(item: SearchResult) {
  if (item.type === 'prompt' && item.actionId?.startsWith('create-prompt:')) {
    openPromptCreate(decodeURIComponent(item.actionId.slice('create-prompt:'.length)))
  } else if (item.type === 'prompt' && item.actionId) {
    window.electronAPI.searchExecuteAction(item.actionId)
  } else if (item.type === 'action' && item.actionId) {
    window.electronAPI.searchExecuteAction(item.actionId)
  } else if (item.type === 'daily' && item.actionId) {
    window.electronAPI.searchExecuteAction(item.actionId)
  } else if (item.type === 'file' && item.filePath) {
    window.electronAPI.searchExecuteAction(`open-file:${item.filePath}`)
  } else if (item.type === 'daily' && item.filePath) {
    window.electronAPI.searchExecuteAction(`open-file:${item.filePath}`)
  } else if (item.type === 'message' && item.sessionId && item.messageId) {
    window.electronAPI.searchExecuteAction(`jump-message:${item.sessionId}:${item.messageId}`)
  } else if (item.sessionId) {
    window.electronAPI.searchExecuteAction(`switch-session:${item.sessionId}`)
  }
}

function openPromptCreate(title: string) {
  promptForm.value = { title, description: '', body: '' }
  promptFormError.value = ''
  showPromptCreate.value = true
}

function closePromptCreate() {
  showPromptCreate.value = false
  promptFormError.value = ''
  inputRef.value?.focus()
}

async function createPromptFromDialog() {
  const title = promptForm.value.title.trim()
  const body = promptForm.value.body.trim()
  if (!title) {
    promptFormError.value = 'Name is required'
    return
  }
  if (!body) {
    promptFormError.value = 'Prompt is required'
    return
  }

  const response = await window.electronAPI.createPrompt({
    title,
    body,
    description: promptForm.value.description.trim() || undefined,
  })
  if (!response.success || !response.prompt) {
    promptFormError.value = response.error || 'Failed to create prompt'
    return
  }
  showPromptCreate.value = false
  window.electronAPI.searchExecuteAction(`insert-prompt:${response.prompt.id}`)
}

// ── Double Shift to close from within search window ──
let lastShiftUp = 0
let shiftClean = false

function onGlobalKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    if (showPromptCreate.value) {
      closePromptCreate()
      return
    }
    window.electronAPI.closeSearchWindow()
    return
  }
  if (e.key === 'Shift' && !e.ctrlKey && !e.altKey && !e.metaKey) {
    shiftClean = true
  } else {
    shiftClean = false
  }
}

function onGlobalKeyUp(e: KeyboardEvent) {
  if (e.key !== 'Shift' || !shiftClean) {
    shiftClean = false
    return
  }
  const now = Date.now()
  if (now - lastShiftUp < 300) {
    lastShiftUp = 0
    window.electronAPI.closeSearchWindow()
  } else {
    lastShiftUp = now
  }
  shiftClean = false
}

// ── Lifecycle ────────────────────────────────────
onMounted(async () => {
  // Initialize theme for this window
  const themeStore = useThemeStore()
  await settingsStore.loadSettings()
  await themeStore.initialize()

  inputRef.value?.focus()
  doSearch()
  unsubscribeShown = window.electronAPI.onSearchWindowShown?.(() => {
    query.value = ''
    activeTab.value = 'all'
    selectedIndex.value = 0
    inputRef.value?.focus()
    doSearch()
  }) ?? null
  window.addEventListener('keydown', onGlobalKeyDown, true)
  window.addEventListener('keyup', onGlobalKeyUp, true)
})

onUnmounted(() => {
  unsubscribeShown?.()
  window.removeEventListener('keydown', onGlobalKeyDown, true)
  window.removeEventListener('keyup', onGlobalKeyUp, true)
  if (debounceTimer) clearTimeout(debounceTimer)
})
</script>

<style scoped>
.search-window {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--ui-surface-app-bg, var(--bg));
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 0 0 0.5px var(--ui-border-default-border, var(--border));
  font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, sans-serif);
  user-select: none;
}

/* ── Tabs ───────────────────────────── */
.search-tabs {
  display: flex;
  gap: 0;
  padding: 8px 12px 0;
  border-bottom: 1px solid var(--ui-border-default-border, var(--border));
  -webkit-app-region: drag;
}

.tab {
  -webkit-app-region: no-drag;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 6px 14px 8px;
  font-size: 13px;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.tab:hover {
  color: var(--ui-text-primary-fg, var(--text));
}

.tab.active {
  color: var(--ui-text-primary-fg, var(--text));
  border-bottom-color: var(--ui-accent-primary-fg, var(--accent));
}

/* ── Input ──────────────────────────── */
.search-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--ui-border-default-border, var(--border));
}

.search-icon {
  flex-shrink: 0;
  color: var(--ui-text-muted-fg, var(--muted));
}

.search-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  font-size: 14px;
  color: var(--ui-text-primary-fg, var(--text));
  font-family: inherit;
}

.search-input::placeholder {
  color: var(--ui-text-muted-fg, var(--muted));
  opacity: 0.6;
}

/* ── Results ────────────────────────── */
.search-results {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.group-header {
  font-size: 11px;
  font-weight: 600;
  color: var(--ui-text-muted-fg, var(--muted));
  padding: 8px 20px 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.search-state {
  padding: 24px 20px;
  text-align: center;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 13px;
}

.search-state.error {
  color: var(--ui-status-danger-fg, var(--danger, #d14));
}

.prompt-dialog-backdrop {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.22);
  z-index: 20;
}

.prompt-dialog {
  width: min(520px, 100%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 10px;
  background: var(--ui-surface-panel-bg, var(--panel, var(--bg)));
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22);
}

.prompt-dialog-header,
.prompt-dialog footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.prompt-dialog h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
}

.prompt-dialog-close {
  border: 0;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
  font-size: 18px;
}

.prompt-dialog label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.prompt-dialog input,
.prompt-dialog textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 7px;
  background: var(--ui-surface-app-bg, var(--bg));
  color: var(--ui-text-primary-fg, var(--text));
  font: inherit;
  font-size: 13px;
  line-height: 1.45;
  outline: none;
  padding: 8px 9px;
  resize: vertical;
  text-transform: none;
  letter-spacing: 0;
}

.prompt-dialog button[type="submit"],
.prompt-dialog .secondary {
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 7px;
  background: var(--ui-accent-primary-fg, var(--accent));
  color: white;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  padding: 6px 10px;
}

.prompt-dialog .secondary {
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
}

.prompt-dialog-error {
  color: var(--ui-status-danger-fg, var(--danger, #d14));
  font-size: 12px;
}

/* ── Footer ─────────────────────────── */
.search-footer {
  display: flex;
  gap: 16px;
  padding: 6px 14px;
  border-top: 1px solid var(--ui-border-default-border, var(--border));
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--muted));
}

.search-footer kbd {
  display: inline-block;
  padding: 0 4px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 3px;
  font-size: 10px;
  font-family: inherit;
  line-height: 1.6;
  margin-right: 2px;
}
</style>
