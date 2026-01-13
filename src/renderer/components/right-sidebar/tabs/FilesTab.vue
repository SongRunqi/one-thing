<template>
  <div class="files-tab">
    <!-- Header (can be hidden when parent provides it) -->
    <div v-if="!hideHeader" class="tab-header" :title="workingDirectory">
      <div class="header-left">
        <span class="header-title">Changed Files</span>
        <span v-if="displayFiles.length" class="header-count">{{ displayFiles.length }}</span>
        <span
          v-if="displayFiles.length"
          class="header-hint"
          title="Only Edit/Write tool changes are tracked"
        >
          Edit/Write only
        </span>
      </div>
      <div v-if="displayFiles.length" class="header-stats">
        <span class="stat-add">+{{ summary.totalAdditions }}</span>
        <span class="stat-del">-{{ summary.totalDeletions }}</span>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="!sessionId" class="empty-state">
      <FolderOpen :size="32" :stroke-width="1.5" />
      <p class="empty-text">No active session</p>
      <p class="empty-hint">Select a chat session to see changed files</p>
    </div>

    <!-- Changed Files -->
    <div v-else-if="displayFiles.length" class="changes-list">
      <div class="section">
        <div class="section-header" @click="toggleSection('changes')">
          <ChevronRight :size="14" :stroke-width="1.5" :class="{ rotated: !collapsedSections.changes }" />
          <span class="section-title">Changes</span>
          <span class="section-count">{{ displayFiles.length }}</span>
        </div>
        <div v-show="!collapsedSections.changes" class="section-content">
          <button
            v-for="file in displayFiles"
            :key="file.filePath"
            type="button"
            class="file-item"
            :class="{ active: activePath === file.filePath }"
            :title="file.filePath"
            @click="openFile(file)"
          >
            <span class="file-status" :class="file.statusClass">{{ file.statusLabel }}</span>
            <span class="file-path">{{ file.displayPath }}</span>
            <span class="file-meta">
              <span v-if="file.isNew" class="badge-new">new</span>
              <span v-if="file.additions > 0" class="stat-add">+{{ file.additions }}</span>
              <span v-if="file.deletions > 0" class="stat-del">-{{ file.deletions }}</span>
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- No changes -->
    <div v-else class="empty-state">
      <FolderOpen :size="32" :stroke-width="1.5" />
      <p class="empty-text">No changes yet</p>
      <p class="empty-hint">Edits from Edit/Write tools will appear here</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import { FolderOpen, ChevronRight } from 'lucide-vue-next'
import { useRightSidebarStore } from '@/stores/right-sidebar'
import { collectFileChanges } from '@/services/commands/files'
import type { FileChangeData } from '@/services/commands/files'

const props = defineProps<{
  workingDirectory?: string
  sessionId?: string
  hideHeader?: boolean
}>()

const store = useRightSidebarStore()

type DisplayFile = FileChangeData & {
  displayPath: string
  statusLabel: string
  statusClass: string
}

const displayFiles = computed<DisplayFile[]>(() => {
  if (!props.sessionId) return []

  return collectFileChanges(props.sessionId).map((file) => {
    const displayPath = getDisplayPath(file.filePath)
    return {
      ...file,
      displayPath,
      statusLabel: getStatusLabel(file),
      statusClass: getStatusClass(file),
    }
  })
})

const summary = computed(() => {
  const files = displayFiles.value
  return {
    totalAdditions: files.reduce((sum, file) => sum + file.additions, 0),
    totalDeletions: files.reduce((sum, file) => sum + file.deletions, 0),
  }
})

const activePath = computed(() => store.previewFile?.path || store.previewDiff?.path || '')

const collapsedSections = reactive({
  changes: false,
})

function refresh() {
  // No-op: changes are derived from chat state and update reactively.
}

function toggleSection(section: keyof typeof collapsedSections) {
  collapsedSections[section] = !collapsedSections[section]
}

function openFile(file: FileChangeData) {
  const resolvedPath = resolveFilePath(file.filePath)
  store.openDiffPreview(resolvedPath)
  const diff = file.diff
  if (diff && diff.trim()) {
    store.setPreviewDiff(diff)
  } else {
    store.setPreviewError('No diff available')
  }
}

function getDisplayPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const base = props.workingDirectory?.replace(/\\/g, '/').replace(/\/$/, '')
  let relative = normalized

  if (base && normalized.startsWith(base)) {
    relative = normalized.slice(base.length).replace(/^\/+/, '')
  }

  return relative || normalized
}

function resolveFilePath(filePath: string): string {
  if (/^([A-Za-z]:[\\/]|\\\\|\/)/.test(filePath)) {
    return filePath
  }

  if (!props.workingDirectory) return filePath

  const base = props.workingDirectory.replace(/[\\/]$/, '')
  const cleaned = filePath.replace(/^[/\\]+/, '')
  return `${base}/${cleaned}`
}

function getStatusLabel(file: FileChangeData): string {
  if (file.isNew) return 'A'
  if (file.deletions > 0 && file.additions === 0) return 'D'
  return 'M'
}

function getStatusClass(file: FileChangeData): string {
  if (file.isNew) return 'added'
  if (file.deletions > 0 && file.additions === 0) return 'deleted'
  return 'modified'
}

defineExpose({
  refresh,
})
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
  gap: 10px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-divider);
  background: transparent;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.header-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--muted);
  text-transform: uppercase;
}

.header-count {
  padding: 2px 6px;
  border-radius: 10px;
  background: var(--hover);
  font-size: 10px;
  font-weight: 600;
  color: var(--muted);
}

.header-hint {
  font-size: 10px;
  color: var(--muted);
  background: var(--hover);
  padding: 2px 6px;
  border-radius: 4px;
  cursor: help;
  white-space: nowrap;
}

.header-stats {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-family: var(--font-mono);
}

.stat-add {
  color: #22c55e;
}

.stat-del {
  color: #ef4444;
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

/* Changed files list */
.changes-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

.section {
  margin-bottom: 8px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  cursor: pointer;
  user-select: none;
}

.section-header:hover {
  background: var(--hover);
}

.section-header svg {
  color: var(--muted);
  transition: transform 0.15s ease;
}

.section-header svg.rotated {
  transform: rotate(90deg);
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
}

.section-count {
  margin-left: auto;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--hover);
  font-size: 10px;
  font-weight: 500;
  color: var(--muted);
}

.section-content {
  padding: 4px 0;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 4px 12px 4px 28px;
  border: none;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  text-align: left;
  font-size: 12px;
}

.file-item:hover {
  background: var(--hover);
}

.file-item.active {
  background: var(--bg-elevated);
}

.file-status {
  flex-shrink: 0;
  width: 16px;
  text-align: center;
  font-weight: 600;
  font-size: 11px;
}

.file-status.added {
  color: #22c55e;
}

.file-status.modified {
  color: #f59e0b;
}

.file-status.deleted {
  color: #ef4444;
}

.file-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
}

.file-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--muted);
  flex-shrink: 0;
}

.badge-new {
  text-transform: uppercase;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 10px;
  color: #22c55e;
  background: rgba(34, 197, 94, 0.12);
}
</style>
