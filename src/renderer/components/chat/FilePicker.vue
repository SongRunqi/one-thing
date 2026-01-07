<template>
  <div class="file-picker" v-if="visible && (files.length > 0 || isLoading)">
    <div class="file-picker-header">
      <span class="title">Files</span>
      <span class="count" v-if="!isLoading">{{ files.length }}</span>
      <span class="loading-indicator" v-else>
        <svg class="spinner" width="14" height="14" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="32" stroke-linecap="round" />
        </svg>
      </span>
    </div>
    <div class="file-list" v-if="files.length > 0">
      <div
        v-for="(file, index) in files"
        :key="file"
        :class="['file-item', { selected: index === selectedIndex }]"
        @click="selectFile(file)"
        @mouseenter="selectedIndex = index"
      >
        <div class="file-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>
        <div class="file-path">{{ getRelativePath(file) }}</div>
      </div>
    </div>
    <div class="file-list-empty" v-else-if="!isLoading && query">
      <span>No files found matching "{{ query }}"</span>
    </div>
    <div class="file-picker-hint">
      <span>Press <kbd>Enter</kbd> to select</span>
      <span><kbd>Esc</kbd> to close</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'

interface Props {
  visible: boolean
  query: string
  cwd: string
}

interface Emits {
  (e: 'select', filePath: string): void
  (e: 'close'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const files = ref<string[]>([])
const selectedIndex = ref(0)
const isLoading = ref(false)

// Debounce timer
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// Fetch files with debounce
async function fetchFiles() {
  if (!props.cwd) {
    files.value = []
    return
  }

  isLoading.value = true

  try {
    const result = await window.electronAPI.listFiles({
      cwd: props.cwd,
      query: props.query,
      limit: 50,
    })

    if (result.success) {
      files.value = result.files
    } else {
      console.error('[FilePicker] Failed to list files:', result.error)
      files.value = []
    }
  } catch (error) {
    console.error('[FilePicker] Error fetching files:', error)
    files.value = []
  } finally {
    isLoading.value = false
  }
}

// Watch for query changes with debounce
watch(
  () => [props.query, props.cwd, props.visible] as const,
  ([_query, _cwd, visible]) => {
    // Reset selection when query changes
    selectedIndex.value = 0

    // Clear previous timer
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }

    // Only fetch if visible
    if (visible) {
      // Debounce the search
      debounceTimer = setTimeout(() => {
        fetchFiles()
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
      selectedIndex.value = Math.min(files.value.length - 1, selectedIndex.value + 1)
      scrollToSelected()
      break
    case 'Tab':
    case 'Enter':
      if (files.value.length > 0) {
        e.preventDefault()
        selectFile(files.value[selectedIndex.value])
      }
      break
    case 'Escape':
      e.preventDefault()
      emit('close')
      break
  }
}

function scrollToSelected() {
  const list = document.querySelector('.file-picker .file-list')
  const selected = list?.querySelector('.file-item.selected')
  if (selected) {
    selected.scrollIntoView({ block: 'nearest' })
  }
}

function selectFile(filePath: string) {
  emit('select', filePath)
}

// Get relative path for display (keeps full path for selection)
function getRelativePath(absolutePath: string): string {
  if (props.cwd && absolutePath.startsWith(props.cwd)) {
    let relativePath = absolutePath.slice(props.cwd.length)
    // Remove leading slash
    if (relativePath.startsWith('/')) {
      relativePath = relativePath.slice(1)
    }
    return relativePath || absolutePath
  }
  return absolutePath
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
.file-picker {
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

.file-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}

.file-picker-header .title {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.file-picker-header .count {
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

.file-list {
  max-height: 240px;
  overflow-y: auto;
  padding: 6px;
}

.file-list-empty {
  padding: 20px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.1s ease;
}

.file-item:hover,
.file-item.selected {
  background: var(--hover);
}

.file-item.selected {
  background: rgba(59, 130, 246, 0.15);
}

.file-icon {
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

.file-item.selected .file-icon {
  background: rgba(59, 130, 246, 0.2);
  color: var(--accent);
}

.file-path {
  flex: 1;
  font-size: 13px;
  font-family: 'SF Mono', 'Monaco', monospace;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-picker-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--muted);
}

.file-picker-hint kbd {
  display: inline-block;
  padding: 2px 5px;
  background: var(--hover);
  border-radius: 4px;
  font-family: 'SF Mono', 'Monaco', monospace;
  font-size: 10px;
  margin: 0 2px;
}
</style>
