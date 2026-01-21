<template>
  <div class="files-changed-panel">
    <!-- Header -->
    <div class="panel-header">
      <div class="header-icon">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      </div>
      <span class="header-title">Changed Files</span>
      <span class="header-count">({{ displayFiles.length }})</span>
      <span
        class="header-hint"
        title="Only Edit and Write tool changes are tracked"
      >Edit/Write only</span>
      <span class="header-stats">
        <span class="stat-add">+{{ summary.totalAdditions }}</span>
        <span class="stat-del">-{{ summary.totalDeletions }}</span>
      </span>
      <!-- Rollback All Button -->
      <button
        v-if="hasRollbackableFiles"
        class="rollback-all-btn"
        :disabled="isRollingBack"
        title="Rollback all changes"
        @click.stop="rollbackAll"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
        <span>Rollback All</span>
      </button>
      <!-- Close Button -->
      <button
        class="close-btn"
        title="Close panel"
        @click.stop="handleClose"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line
            x1="18"
            y1="6"
            x2="6"
            y2="18"
          />
          <line
            x1="6"
            y1="6"
            x2="18"
            y2="18"
          />
        </svg>
      </button>
    </div>

    <!-- Empty state -->
    <div
      v-if="displayFiles.length === 0"
      class="empty-state"
    >
      All changes have been rolled back
    </div>

    <!-- Content area -->
    <div
      v-else
      class="panel-content"
    >
      <!-- File list -->
      <div class="file-list">
        <div
          v-for="file in displayFiles"
          :key="file.filePath"
          :class="['file-item', { selected: selectedFile?.filePath === file.filePath }]"
          @click="selectFile(file)"
        >
          <div class="file-icon">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <div class="file-info">
            <div class="file-name">
              {{ getFileName(file.filePath) }}
            </div>
            <div class="file-path">
              {{ getFileDir(file.filePath) }}
            </div>
          </div>
          <div class="file-stats">
            <span
              v-if="file.isNew"
              class="badge-new"
            >new</span>
            <span
              v-if="file.additions > 0"
              class="stat-add"
            >+{{ file.additions }}</span>
            <span
              v-if="file.deletions > 0"
              class="stat-del"
            >-{{ file.deletions }}</span>
          </div>
          <!-- Rollback button for each file -->
          <button
            v-if="canRollback(file)"
            class="rollback-btn"
            :disabled="isRollingBack"
            title="Rollback this file"
            @click.stop="rollbackFile(file)"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Detail view -->
      <div class="detail-view">
        <div
          v-if="!selectedFile"
          class="detail-placeholder"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="M15 15l6 6m-11-4a7 7 0 1 1 0-14 7 7 0 0 1 0 14z" />
          </svg>
          <span>Select a file to view changes</span>
        </div>
        <div
          v-else
          class="diff-container"
        >
          <div class="diff-header">
            <span class="diff-filename">{{ selectedFile.filePath }}</span>
          </div>
          <DiffView
            v-if="selectedFile.diff"
            :diff="selectedFile.diff"
            max-height="100%"
            :show-file-name="false"
          />
          <div
            v-else
            class="diff-empty"
          >
            <span>No diff available</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { FileChangeData, FilesChangedMessage } from '@/services/commands/files'
import DiffView from './DiffView.vue'

interface Props {
  data: FilesChangedMessage
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'rollback', files: FileChangeData[]): void
  (e: 'close'): void
}>()

/** 已回滚的文件路径集合 */
const rolledBackFiles = ref<Set<string>>(new Set())

/** 显示的文件列表（排除已回滚的） */
const displayFiles = computed(() => {
  return props.data.files.filter(f => !rolledBackFiles.value.has(f.filePath))
})

/** 动态计算的统计数据 */
const summary = computed(() => {
  const files = displayFiles.value
  return {
    totalFiles: files.length,
    totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
    totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
  }
})

const selectedFile = ref<FileChangeData | null>(null)
const isRollingBack = ref(false)

// 当 props.data 变化时重置回滚状态
watch(() => props.data, () => {
  rolledBackFiles.value = new Set()
  selectedFile.value = null
})

function selectFile(file: FileChangeData) {
  selectedFile.value = file
}

// Handle close - emit to parent for persistent deletion
function handleClose() {
  emit('close')
}

/**
 * 检查文件是否可以回滚
 * 需要有 originalContent（即使是空字符串也行，表示新文件）
 */
function canRollback(file: FileChangeData): boolean {
  return file.originalContent !== undefined
}

/**
 * 是否有可回滚的文件
 */
const hasRollbackableFiles = computed(() => {
  return displayFiles.value.some(f => canRollback(f))
})

/**
 * 从显示列表中移除文件（标记为已回滚）
 */
function markAsRolledBack(filePath: string) {
  rolledBackFiles.value.add(filePath)
  // 如果当前选中的文件被回滚，清除选择
  if (selectedFile.value?.filePath === filePath) {
    selectedFile.value = null
  }
}

/**
 * 回滚单个文件
 */
async function rollbackFile(file: FileChangeData) {
  if (!canRollback(file)) return

  const fileName = getFileName(file.filePath)
  const action = file.isNew ? 'delete' : 'restore'

  if (!confirm(`Are you sure you want to ${action} "${fileName}"?`)) {
    return
  }

  isRollingBack.value = true
  try {
    const result = await window.electronAPI.rollbackFile({
      filePath: file.filePath,
      originalContent: file.originalContent!,
      isNew: file.isNew,
    })

    if (result.success) {
      markAsRolledBack(file.filePath)
      emit('rollback', [file])
    } else {
      alert(`Failed to rollback: ${result.error}`)
    }
  } catch (error: any) {
    alert(`Rollback error: ${error.message}`)
  } finally {
    isRollingBack.value = false
  }
}

/**
 * 回滚所有文件
 */
async function rollbackAll() {
  const rollbackableFiles = displayFiles.value.filter(f => canRollback(f))
  if (rollbackableFiles.length === 0) return

  if (!confirm(`Are you sure you want to rollback all ${rollbackableFiles.length} file(s)?`)) {
    return
  }

  isRollingBack.value = true
  const successFiles: FileChangeData[] = []
  const failedFiles: string[] = []

  try {
    for (const file of rollbackableFiles) {
      const result = await window.electronAPI.rollbackFile({
        filePath: file.filePath,
        originalContent: file.originalContent!,
        isNew: file.isNew,
      })

      if (result.success) {
        markAsRolledBack(file.filePath)
        successFiles.push(file)
      } else {
        failedFiles.push(getFileName(file.filePath))
      }
    }

    if (successFiles.length > 0) {
      emit('rollback', successFiles)
    }

    if (failedFiles.length > 0) {
      alert(`Failed to rollback: ${failedFiles.join(', ')}`)
    }
  } catch (error: any) {
    alert(`Rollback error: ${error.message}`)
  } finally {
    isRollingBack.value = false
  }
}

function getFileName(filePath: string): string {
  return filePath.split('/').pop() || filePath
}

function getFileDir(filePath: string): string {
  const parts = filePath.split('/')
  if (parts.length <= 1) return ''
  parts.pop()
  return parts.join('/')
}

</script>

<style scoped>
.files-changed-panel {
  width: 100%;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--panel);
  overflow: hidden;
  animation: fadeIn 0.18s ease-out;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: rgba(var(--accent-rgb), 0.08);
  border-bottom: 1px solid var(--border);
}

.header-icon {
  color: var(--accent);
}

.header-title {
  font-weight: 600;
  color: var(--text);
}

.header-count {
  color: var(--muted);
  font-size: 14px;
}

.header-hint {
  font-size: 11px;
  color: var(--muted);
  background: var(--hover);
  padding: 2px 6px;
  border-radius: 4px;
  cursor: help;
}

.header-stats {
  margin-left: auto;
  display: flex;
  gap: 8px;
  font-size: 13px;
  font-family: 'SF Mono', Monaco, monospace;
}

.stat-add {
  color: var(--text-success);
}

.stat-del {
  color: var(--text-error);
}

.empty-state {
  height: 350px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
}

.panel-content {
  display: flex;
  height: 350px;
}

.file-list {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  overflow-y: auto;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
  transition: background 0.15s ease;
}

.file-item:hover {
  background: var(--hover);
}

.file-item.selected {
  background: rgba(var(--accent-rgb), 0.12);
  border-left: 3px solid var(--accent);
  padding-left: 9px;
}

.file-icon {
  color: var(--muted);
  flex-shrink: 0;
}

.file-info {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.file-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-path {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-stats {
  display: flex;
  gap: 6px;
  font-size: 12px;
  font-family: 'SF Mono', Monaco, monospace;
  flex-shrink: 0;
}

.badge-new {
  background: rgba(var(--accent-rgb), 0.15);
  color: var(--accent);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 500;
}

.detail-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;  /* Allow flex shrinking */
  overflow: hidden;  /* Contain children */
  background: var(--background);
}

.detail-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--muted);
  font-size: 14px;
}

.diff-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;  /* Allow flex shrinking */
  overflow: hidden;  /* Contain children */
}

.diff-header {
  padding: 8px 12px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}

.diff-filename {
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 12px;
  color: var(--text);
}

/* Override DiffView styles for full-height display */
.diff-container :deep(.diff-view) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;  /* Allow flex shrinking for proper scrolling */
}

.diff-container :deep(.diff-content) {
  max-height: none;
  flex: 1;
  min-height: 0;  /* Allow flex shrinking for proper scrolling */
  overflow: auto;  /* Enable scrollbars */
}

.diff-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 14px;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Scrollbar styles */
.file-list::-webkit-scrollbar,
.diff-container :deep(.diff-content)::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.file-list::-webkit-scrollbar-track,
.diff-container :deep(.diff-content)::-webkit-scrollbar-track {
  background: var(--panel);
  border-radius: 4px;
}

.file-list::-webkit-scrollbar-thumb,
.diff-container :deep(.diff-content)::-webkit-scrollbar-thumb {
  background: var(--muted);
  border-radius: 4px;
  border: 2px solid var(--panel);
}

.file-list::-webkit-scrollbar-thumb:hover,
.diff-container :deep(.diff-content)::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary, var(--muted));
}

.diff-container :deep(.diff-content)::-webkit-scrollbar-corner {
  background: var(--panel);
}

/* === Rollback Buttons === */

.rollback-all-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 12px;
  padding: 4px 10px;
  background: rgba(var(--warning-rgb, 255, 152, 0), 0.15);
  border: 1px solid rgba(var(--warning-rgb, 255, 152, 0), 0.3);
  border-radius: 6px;
  color: var(--text-warning, #f0a800);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.rollback-all-btn:hover:not(:disabled) {
  background: rgba(var(--warning-rgb, 255, 152, 0), 0.25);
  border-color: rgba(var(--warning-rgb, 255, 152, 0), 0.5);
}

.rollback-all-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.rollback-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-left: 6px;
  padding: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--muted);
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s ease;
}

.file-item:hover .rollback-btn {
  opacity: 1;
}

.rollback-btn:hover:not(:disabled) {
  background: rgba(var(--warning-rgb, 255, 152, 0), 0.15);
  border-color: rgba(var(--warning-rgb, 255, 152, 0), 0.3);
  color: var(--text-warning, #f0a800);
}

.rollback-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Close button */
.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-left: 8px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: rgb(239, 68, 68);
  border-color: rgb(239, 68, 68);
}
</style>
