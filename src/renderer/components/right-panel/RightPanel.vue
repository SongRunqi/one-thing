<template>
  <Transition name="right-panel">
    <div
      v-if="store.isOpen"
      class="right-panel"
      :class="{ resizing: isResizing }"
      :style="panelStyle"
    >
      <!-- Resize Handle (left edge - adjusts total panel width) -->
      <div class="panel-resize-handle" @mousedown="startPanelResize"></div>

      <!-- Panel Header -->
      <div class="panel-header">
        <div class="panel-tabs">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            class="panel-tab"
            :class="{ active: store.activeTab === tab.id }"
            :title="tab.label"
            @click="store.setActiveTab(tab.id)"
          >
            <component :is="tab.icon" :size="14" :stroke-width="1.5" />
            <span class="panel-tab-label">{{ tab.label }}</span>
          </button>
        </div>
        <div class="panel-actions">
          <button
            v-if="canRefresh"
            class="panel-action-btn"
            title="Refresh git status"
            :disabled="isRefreshing"
            @click="handleRefresh"
          >
            <RefreshCw :size="14" :stroke-width="1.5" :class="{ spinning: isRefreshing }" />
          </button>
          <button
            class="panel-action-btn close-btn"
            title="Close panel"
            @click="store.close()"
          >
            <X :size="14" :stroke-width="1.5" />
          </button>
        </div>
      </div>

      <div class="panel-body">
        <!-- Sidebar Section -->
        <div class="sidebar-section" :style="sidebarStyle">
          <RightSidebar
            ref="rightSidebarRef"
            :visible="true"
            :session-id="sessionId"
            :working-directory="workingDirectory"
            @close="store.close()"
            @open-diff="emit('open-diff', $event)"
            @open-commit-dialog="emit('open-commit-dialog')"
          />
        </div>

        <!-- Divider (between sidebar and preview, only when preview is open) -->
        <div
          v-if="previewVisible"
          class="divider"
          :class="{ active: isDividerResizing }"
          @mousedown="startDividerResize"
        ></div>

        <!-- Preview Section -->
        <div v-if="previewVisible" class="preview-section">
          <div v-if="isPreviewLoading" class="preview-loading">
            <div class="loading-spinner"></div>
            <span>Loading diff...</span>
          </div>
          <div v-else-if="previewError" class="preview-error">
            <span>{{ previewError }}</span>
          </div>
          <!-- Diff preview (only mode) -->
          <template v-if="previewDiff">
            <div class="preview-toolbar">
              <span class="preview-filename">{{ previewDiff.path }}</span>
            </div>
            <DiffView
              :diff="previewDiff.diff"
              :fileName="previewDiff.path"
              :showFileName="false"
              :allowStyleToggle="false"
              :allowCopy="false"
              :expandUnchanged="true"
              :expansionLineCount="5"
              :oldContent="previewDiff.oldContent"
              :newContent="previewDiff.newContent"
              maxHeight="100%"
              diffStyle="unified"
            />
          </template>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, ref, onUnmounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { FolderTree, GitBranch, FileCode, RefreshCw, X } from 'lucide-vue-next'
import { useRightSidebarStore } from '@/stores/right-sidebar'
import { RightSidebar } from '@/components/right-sidebar'
import DiffView from '@/components/chat/message/DiffView.vue'

const props = defineProps<{
  sessionId?: string
  workingDirectory?: string
}>()

const emit = defineEmits<{
  'open-diff': [data: { filePath: string; workingDirectory: string; sessionId: string; isStaged: boolean }]
  'open-commit-dialog': []
}>()

const store = useRightSidebarStore()

type RightSidebarHandle = {
  refreshActive: () => void
}

const rightSidebarRef = ref<RightSidebarHandle | null>(null)

const tabs = [
  { id: 'files' as const, label: 'Files', icon: FolderTree },
  { id: 'git' as const, label: 'Git', icon: GitBranch },
  { id: 'documents' as const, label: 'Docs', icon: FileCode },
]

const canRefresh = computed(() => store.activeTab === 'git')
const isRefreshing = computed(() => false)
// Enable preview panel for both Files and Git tabs
// Get reactive refs from store
const { previewDiff, isPreviewLoading, previewError } = storeToRefs(store)

const previewVisible = computed(() =>
  (store.activeTab === 'files' || store.activeTab === 'git') && store.isPreviewOpen
)

function handleRefresh() {
  rightSidebarRef.value?.refreshActive()
}

// ==================== Panel Style ====================
const panelStyle = computed(() => ({
  width: `${store.panelWidth}px`,
}))

const sidebarStyle = computed(() => ({
  width: previewVisible.value ? `${store.sidebarWidth}px` : '100%',
  flexShrink: 0,
}))

// ==================== Panel Resize (left edge) ====================
const isResizing = ref(false)
const startX = ref(0)
const startWidth = ref(0)

const MIN_PANEL_WIDTH = 400
const MAX_PANEL_WIDTH = 1200

function startPanelResize(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()

  isResizing.value = true
  startX.value = event.clientX
  startWidth.value = store.panelWidth
  store.setResizing(true)

  document.addEventListener('mousemove', handlePanelResize)
  document.addEventListener('mouseup', stopPanelResize)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function handlePanelResize(event: MouseEvent) {
  if (!isResizing.value) return

  // Drag left = increase width, drag right = decrease width
  const delta = startX.value - event.clientX
  const newWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, startWidth.value + delta))
  store.setPanelWidth(newWidth)

  if (previewVisible.value) {
    clampSidebarWidth(newWidth)
  }
}

function stopPanelResize() {
  isResizing.value = false
  store.setResizing(false)
  document.removeEventListener('mousemove', handlePanelResize)
  document.removeEventListener('mouseup', stopPanelResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

// ==================== Divider Resize (between sidebar and preview) ====================
const isDividerResizing = ref(false)
const dividerStartX = ref(0)
const dividerStartSidebarWidth = ref(0)

const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 500
const MIN_PREVIEW_WIDTH = 250
const DIVIDER_GAP = 0 // Divider is an overlay; no layout width.

function clampSidebarWidth(panelWidth: number) {
  const maxSidebarWidth = Math.min(MAX_SIDEBAR_WIDTH, panelWidth - MIN_PREVIEW_WIDTH - DIVIDER_GAP)
  if (store.sidebarWidth > maxSidebarWidth) {
    store.setSidebarWidth(Math.max(0, maxSidebarWidth))
  }
}

function startDividerResize(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()

  isDividerResizing.value = true
  dividerStartX.value = event.clientX
  dividerStartSidebarWidth.value = store.sidebarWidth
  store.setResizing(true)

  document.addEventListener('mousemove', handleDividerResize)
  document.addEventListener('mouseup', stopDividerResize)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function handleDividerResize(event: MouseEvent) {
  if (!isDividerResizing.value) return

  // Drag right = increase sidebar width
  const delta = event.clientX - dividerStartX.value
  let newSidebarWidth = dividerStartSidebarWidth.value + delta

  // Constrain sidebar width
  newSidebarWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, newSidebarWidth))

  // Ensure preview has minimum width
  const availableForPreview = store.panelWidth - newSidebarWidth - DIVIDER_GAP
  if (availableForPreview < MIN_PREVIEW_WIDTH) {
    newSidebarWidth = store.panelWidth - MIN_PREVIEW_WIDTH - DIVIDER_GAP
  }

  store.setSidebarWidth(newSidebarWidth)
}

function stopDividerResize() {
  isDividerResizing.value = false
  store.setResizing(false)
  document.removeEventListener('mousemove', handleDividerResize)
  document.removeEventListener('mouseup', stopDividerResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

// ==================== Cleanup ====================
onUnmounted(() => {
  if (isResizing.value) {
    document.removeEventListener('mousemove', handlePanelResize)
    document.removeEventListener('mouseup', stopPanelResize)
  }
  if (isDividerResizing.value) {
    document.removeEventListener('mousemove', handleDividerResize)
    document.removeEventListener('mouseup', stopDividerResize)
  }
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
})

watch(() => previewVisible.value, (open) => {
  if (open) {
    clampSidebarWidth(store.panelWidth)
  }
})
</script>

<style scoped>
.right-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  height: 100%;
  min-height: 0;
  background: var(--bg);
  border-left: 1px solid var(--border-subtle);
  box-shadow: -4px 0 12px rgba(0, 0, 0, 0.18);
  transition: width 0.2s ease;
}

html[data-theme='light'] .right-panel {
  box-shadow: -4px 0 12px rgba(16, 15, 15, 0.08);
}

.right-panel.resizing {
  transition: none;
}

/* Panel Resize Handle (left edge) */
.panel-resize-handle {
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  cursor: col-resize;
  background: linear-gradient(
    to right,
    transparent,
    rgba(var(--accent-rgb), 0.35),
    transparent
  );
  opacity: 0;
  transition: opacity 0.15s ease;
  z-index: 10;
}

.panel-resize-handle:hover,
.right-panel.resizing .panel-resize-handle {
  opacity: 1;
}

.panel-header {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-divider);
  background: transparent;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.panel-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
}

.panel-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.panel-tab:hover {
  background: var(--hover);
  color: var(--text);
}

.panel-tab.active {
  background: var(--bg-elevated);
  color: var(--text);
  border-color: var(--border-subtle);
}

.panel-tab:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.25);
}

.panel-tab-label {
  font-size: 11px;
  line-height: 1;
  letter-spacing: 0.01em;
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.panel-action-btn {
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

.panel-action-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.panel-action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.panel-action-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.25);
}

.panel-action-btn.close-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.panel-action-btn .spinning {
  animation: spin 1s linear infinite;
}

.panel-actions :deep(svg) {
  width: 1em;
  height: 1em;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.panel-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* Sidebar Section */
.sidebar-section {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;  /* Allow flex shrinking */
  background: var(--bg-sunken, color-mix(in srgb, var(--bg) 95%, black));
  overflow: hidden;
}

/* Divider (between sidebar and preview) */
.divider {
  position: relative;
  width: 0;
  flex-shrink: 0;
  cursor: col-resize;
  background: transparent;
}

.divider::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -2px;
  width: 4px;
  border-radius: 999px;
  background: var(--border-subtle);
  opacity: 0;
  transition: background 0.15s ease, opacity 0.15s ease;
}

.divider::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -4px;
  width: 8px;
  cursor: col-resize;
}

.divider:hover,
.divider.active {
  background: transparent;
}

.divider:hover::before,
.divider.active::before {
  background: rgba(var(--accent-rgb), 0.6);
  opacity: 1;
}

/* Preview Section */
.preview-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}

/* Remove border from DiffView in preview */
.preview-section :deep(.diff-view) {
  border: none;
  border-radius: 0;
}

/* Preview toolbar */
.preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--bg-code-header);
  border-bottom: 1px solid var(--border-code);
  flex-shrink: 0;
}

.preview-filename {
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-loading,
.preview-error,
.preview-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px;
  color: var(--text-secondary);
  font-size: 13px;
}

.preview-error {
  color: var(--text-error);
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-default);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin-loader 0.8s linear infinite;
}

@keyframes spin-loader {
  to { transform: rotate(360deg); }
}

/* Transition */
.right-panel-enter-active,
.right-panel-leave-active {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.2s ease;
}

.right-panel-enter-from,
.right-panel-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
