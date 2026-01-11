<template>
  <div class="files-tab">
    <!-- Header with refresh button (can be hidden when parent provides it) -->
    <div v-if="!hideHeader" class="tab-header" :title="workingDirectory">
      <span class="header-title">Explorer</span>
      <button class="refresh-btn" @click="refresh" :disabled="isLoading" title="Refresh">
        <RefreshCw :size="14" :stroke-width="1.5" :class="{ spinning: isLoading }" />
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading && !hasTree" class="loading-state">
      <div class="skeleton-tree">
        <div v-for="i in 8" :key="i" class="skeleton-item" :style="{ paddingLeft: `${(i % 3) * 16 + 8}px` }">
          <div class="skeleton-icon"></div>
          <div class="skeleton-name" :style="{ width: `${60 + Math.random() * 80}px` }"></div>
        </div>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-state">
      <AlertCircle :size="32" :stroke-width="1.5" />
      <p class="error-text">{{ error }}</p>
      <button class="retry-btn" @click="refresh">Retry</button>
    </div>

    <!-- Empty State -->
    <div v-else-if="!workingDirectory" class="empty-state">
      <FolderOpen :size="32" :stroke-width="1.5" />
      <p class="empty-text">No working directory</p>
      <p class="empty-hint">Select a chat session with a working directory</p>
    </div>

    <!-- File Tree -->
    <div v-else class="file-tree-container">
      <FileTree
        :nodes="fileTree"
        :depth="0"
        @toggle="handleToggle"
        @select="handleSelect"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, onMounted } from 'vue'
import { RefreshCw, AlertCircle, FolderOpen } from 'lucide-vue-next'
import { useRightSidebarStore } from '@/stores/right-sidebar'
import FileTree from '../files/FileTree.vue'

const props = defineProps<{
  workingDirectory?: string
  hideHeader?: boolean
}>()

const store = useRightSidebarStore()

// Computed properties
const isLoading = computed(() => store.isCurrentTreeLoading)
const error = computed(() => store.fileTreeError)
const fileTree = computed(() => store.currentFileTree)
const hasTree = computed(() => fileTree.value.length > 0)

// Load file tree when working directory changes
watch(() => props.workingDirectory, (newDir) => {
  if (newDir) {
    store.loadFileTree(newDir)
  }
}, { immediate: true })

onMounted(() => {
  if (props.workingDirectory) {
    store.loadFileTree(props.workingDirectory)
  }
})

function refresh() {
  if (props.workingDirectory) {
    store.loadFileTree(props.workingDirectory, true)
  }
}

function handleToggle(path: string) {
  store.toggleExpanded(path)
}

function handleSelect(node: import('@/types').FileTreeNode) {
  // Open file preview panel
  store.openPreview(node)
}
</script>

<style scoped>
.files-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.tab-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-divider);
  background: transparent;
}

.header-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--muted);
  text-transform: uppercase;
}

.refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.refresh-btn:hover:not(:disabled) {
  background: var(--hover);
  color: var(--text);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.refresh-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.25);
}

.refresh-btn .spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Loading skeleton */
.loading-state {
  padding: 12px;
}

.skeleton-tree {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.skeleton-icon {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  background: var(--hover);
  animation: pulse 1.5s ease-in-out infinite;
}

.skeleton-name {
  height: 12px;
  border-radius: 4px;
  background: var(--hover);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Error state */
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  color: var(--muted);
  text-align: center;
}

.error-text {
  margin: 12px 0;
  font-size: 13px;
  color: var(--error, #ef4444);
}

.retry-btn {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.retry-btn:hover {
  background: var(--hover);
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  color: var(--muted);
  text-align: center;
}

.empty-text {
  margin: 12px 0 4px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.empty-hint {
  font-size: 12px;
  color: var(--muted);
}

/* File tree container */
.file-tree-container {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}
</style>
