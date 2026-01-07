<template>
  <div class="path-picker" v-if="visible && (dirs.length > 0 || isLoading)">
    <div class="path-picker-header">
      <span class="title">Directories</span>
      <span class="count" v-if="!isLoading">{{ dirs.length }}</span>
      <span class="loading-indicator" v-else>
        <svg class="spinner" width="14" height="14" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="32" stroke-linecap="round" />
        </svg>
      </span>
    </div>
    <div class="path-list" v-if="dirs.length > 0">
      <div
        v-for="(dir, index) in dirs"
        :key="dir"
        :class="['path-item', { selected: index === selectedIndex }]"
        @click="selectPath(dir)"
        @mouseenter="selectedIndex = index"
      >
        <div class="path-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <div class="path-name">{{ getDisplayName(dir) }}</div>
      </div>
    </div>
    <div class="path-list-empty" v-else-if="!isLoading && pathInput">
      <span>No directories found</span>
    </div>
    <div class="path-picker-hint">
      <span><kbd>Tab</kbd> complete</span>
      <span><kbd>Enter</kbd> confirm</span>
      <span><kbd>Esc</kbd> close</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'

interface Props {
  visible: boolean
  pathInput: string  // The path being typed after /cd
}

interface Emits {
  (e: 'select', path: string): void
  (e: 'close'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const dirs = ref<string[]>([])
const selectedIndex = ref(0)
const isLoading = ref(false)

// Debounce timer
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// Get display name (just the directory name, not full path)
function getDisplayName(fullPath: string): string {
  const parts = fullPath.split('/')
  return parts[parts.length - 1] || fullPath
}

// Fetch directories with debounce
async function fetchDirs() {
  const pathToSearch = props.pathInput.trim() || '~'

  isLoading.value = true

  try {
    const result = await window.electronAPI.listDirs({
      basePath: pathToSearch,
      limit: 50,
    })

    if (result.success) {
      dirs.value = result.dirs
    } else {
      console.error('[PathPicker] Failed to list directories:', result.error)
      dirs.value = []
    }
  } catch (error) {
    console.error('[PathPicker] Error fetching directories:', error)
    dirs.value = []
  } finally {
    isLoading.value = false
  }
}

// Watch for path input changes with debounce
watch(
  () => [props.pathInput, props.visible] as const,
  ([_pathInput, visible]) => {
    // Reset selection when input changes
    selectedIndex.value = 0

    // Clear previous timer
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }

    // Only fetch if visible
    if (visible) {
      // Debounce the search
      debounceTimer = setTimeout(() => {
        fetchDirs()
      }, 150) // 150ms debounce
    }
  },
  { immediate: true }
)

// Handle keyboard navigation
function handleKeyDown(e: KeyboardEvent) {
  if (!props.visible) return

  switch (e.key) {
    case 'ArrowUp':
      e.preventDefault()
      selectedIndex.value = Math.max(0, selectedIndex.value - 1)
      scrollToSelected()
      break
    case 'ArrowDown':
      e.preventDefault()
      selectedIndex.value = Math.min(dirs.value.length - 1, selectedIndex.value + 1)
      scrollToSelected()
      break
    case 'Tab':
      // Tab selects the completion, Enter sends the command
      if (dirs.value.length > 0) {
        e.preventDefault()
        selectPath(dirs.value[selectedIndex.value])
      }
      break
    // Enter is NOT handled here - let InputBox send the command
    case 'Escape':
      e.preventDefault()
      emit('close')
      break
  }
}

function scrollToSelected() {
  const list = document.querySelector('.path-picker .path-list')
  const selected = list?.querySelector('.path-item.selected')
  if (selected) {
    selected.scrollIntoView({ block: 'nearest' })
  }
}

function selectPath(path: string) {
  emit('select', path)
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
})
</script>

<style scoped>
.path-picker {
  margin-bottom: 8px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  z-index: 100;
  animation: slideUp 0.15s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.path-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}

.path-picker-header .title {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.path-picker-header .count {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--hover);
  border-radius: 10px;
  color: var(--muted);
}

.loading-indicator {
  display: flex;
  align-items: center;
  color: var(--muted);
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.path-list {
  max-height: 240px;
  overflow-y: auto;
  padding: 6px;
}

.path-list-empty {
  padding: 20px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}

.path-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.1s ease;
}

.path-item:hover,
.path-item.selected {
  background: var(--hover);
}

.path-item.selected {
  background: rgba(59, 130, 246, 0.15);
}

.path-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--hover);
  border-radius: 6px;
  color: var(--muted);
  flex-shrink: 0;
}

.path-item.selected .path-icon {
  background: rgba(59, 130, 246, 0.2);
  color: var(--accent);
}

.path-name {
  flex: 1;
  font-size: 13px;
  font-family: 'SF Mono', 'Monaco', monospace;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.path-picker-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--muted);
}

.path-picker-hint kbd {
  display: inline-block;
  padding: 2px 5px;
  background: var(--hover);
  border-radius: 4px;
  font-family: 'SF Mono', 'Monaco', monospace;
  font-size: 10px;
  margin: 0 2px;
}
</style>
