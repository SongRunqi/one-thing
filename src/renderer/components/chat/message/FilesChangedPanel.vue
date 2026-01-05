<template>
  <div class="files-changed-panel">
    <!-- Header -->
    <div class="panel-header">
      <div class="header-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      </div>
      <span class="header-title">Changed Files</span>
      <span class="header-count">({{ data.summary.totalFiles }})</span>
      <span class="header-stats">
        <span class="stat-add">+{{ data.summary.totalAdditions }}</span>
        <span class="stat-del">-{{ data.summary.totalDeletions }}</span>
      </span>
      <!-- Rollback All Button -->
      <button
        v-if="hasRollbackableFiles"
        class="rollback-all-btn"
        @click.stop="rollbackAll"
        :disabled="isRollingBack"
        title="Rollback all changes"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
        </svg>
        <span>Rollback All</span>
      </button>
    </div>

    <!-- Empty state -->
    <div v-if="data.files.length === 0" class="empty-state">
      No files changed in this conversation
    </div>

    <!-- Content area -->
    <div v-else class="panel-content">
      <!-- File list -->
      <div class="file-list">
        <div
          v-for="file in data.files"
          :key="file.filePath"
          :class="['file-item', { selected: selectedFile?.filePath === file.filePath }]"
          @click="selectFile(file)"
        >
          <div class="file-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div class="file-info">
            <div class="file-name">{{ getFileName(file.filePath) }}</div>
            <div class="file-path">{{ getFileDir(file.filePath) }}</div>
          </div>
          <div class="file-stats">
            <span v-if="file.isNew" class="badge-new">new</span>
            <span v-if="file.additions > 0" class="stat-add">+{{ file.additions }}</span>
            <span v-if="file.deletions > 0" class="stat-del">-{{ file.deletions }}</span>
          </div>
          <!-- Rollback button for each file -->
          <button
            v-if="canRollback(file)"
            class="rollback-btn"
            @click.stop="rollbackFile(file)"
            :disabled="isRollingBack"
            title="Rollback this file"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Detail view -->
      <div class="detail-view">
        <div v-if="!selectedFile" class="detail-placeholder">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M15 15l6 6m-11-4a7 7 0 1 1 0-14 7 7 0 0 1 0 14z"/>
          </svg>
          <span>Select a file to view changes</span>
        </div>
        <div v-else class="diff-container">
          <div class="diff-header">
            <span class="diff-filename">{{ selectedFile.filePath }}</span>
          </div>
          <div class="diff-content" v-if="selectedFile.diff">
            <div class="diff-table">
              <div
                v-for="(line, index) in parsedDiff"
                :key="index"
                :class="['diff-row', `diff-row--${line.type}`]"
              >
                <span class="diff-line-num diff-line-num--old">{{ line.oldLine ?? '' }}</span>
                <span class="diff-line-num diff-line-num--new">{{ line.newLine ?? '' }}</span>
                <span class="diff-sign">{{ getLineSign(line.type) }}</span>
                <span class="diff-code">{{ line.content }}</span>
              </div>
            </div>
          </div>
          <div class="diff-empty" v-else>
            <span>No diff available</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { FileChangeData, FilesChangedMessage } from '@/services/commands/files'

/** 解析后的 diff 行 */
interface DiffLine {
  type: 'add' | 'del' | 'context'
  content: string
  oldLine?: number
  newLine?: number
}

interface Props {
  data: FilesChangedMessage
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'rollback', files: FileChangeData[]): void
}>()

const selectedFile = ref<FileChangeData | null>(null)
const isRollingBack = ref(false)

function selectFile(file: FileChangeData) {
  selectedFile.value = file
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
  return props.data.files.some(f => canRollback(f))
})

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
  const rollbackableFiles = props.data.files.filter(f => canRollback(f))
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

/**
 * 解析 unified diff 格式，提取行号信息
 * 格式示例: @@ -10,5 +12,8 @@ function name()
 * 注意：Meta 行和 Hunk 头部不会被添加到结果中，只用于计算行号
 */
function parseDiff(diff: string): DiffLine[] {
  if (!diff) return []

  const lines = diff.split('\n')
  const result: DiffLine[] = []

  let oldLine = 0
  let newLine = 0

  for (const line of lines) {
    // 文件元信息行 (--- a/file, +++ b/file) - 跳过不显示
    if (line.startsWith('---') || line.startsWith('+++')) {
      continue
    }

    // Hunk 头部 @@ -old,count +new,count @@ - 只解析行号，不显示
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (match) {
        oldLine = parseInt(match[1], 10)
        newLine = parseInt(match[2], 10)
      }
      continue
    }

    // 添加行
    if (line.startsWith('+')) {
      result.push({
        type: 'add',
        content: line.slice(1), // 移除前导 +
        newLine: newLine++
      })
      continue
    }

    // 删除行
    if (line.startsWith('-')) {
      result.push({
        type: 'del',
        content: line.slice(1), // 移除前导 -
        oldLine: oldLine++
      })
      continue
    }

    // 上下文行（空格开头或无前缀）
    const content = line.startsWith(' ') ? line.slice(1) : line
    if (oldLine > 0 || newLine > 0) {
      result.push({
        type: 'context',
        content,
        oldLine: oldLine++,
        newLine: newLine++
      })
    }
  }

  return result
}

/** 计算选中文件的解析后 diff */
const parsedDiff = computed(() => {
  if (!selectedFile.value?.diff) return []
  return parseDiff(selectedFile.value.diff)
})

/** 根据行类型返回符号 */
function getLineSign(type: DiffLine['type']): string {
  switch (type) {
    case 'add': return '+'
    case 'del': return '-'
    default: return ''
  }
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
  padding: 32px;
  text-align: center;
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

.diff-content {
  flex: 1;
  overflow: auto;
}

/* Diff 表格容器 */
.diff-table {
  display: flex;
  flex-direction: column;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 12px;
  line-height: 1.6;
  min-width: max-content;  /* 允许内容撑开宽度，实现横向滚动 */
}

/* Diff 行 - 四列布局 */
.diff-row {
  display: grid;
  grid-template-columns: 36px 36px 20px 1fr;
  min-height: 20px;
  transition: background 0.1s ease;
}

.diff-row:hover {
  background: rgba(255, 255, 255, 0.03);
}

/* 行号列 */
.diff-line-num {
  padding: 0 6px;
  text-align: right;
  color: var(--text-faint, var(--muted));
  background: rgba(0, 0, 0, 0.08);
  user-select: none;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  border-right: 1px solid var(--border);
}

.diff-line-num--new {
  border-right: none;
}

/* 符号列 */
.diff-sign {
  width: 20px;
  text-align: center;
  user-select: none;
  font-weight: 600;
}

/* 代码内容列 */
.diff-code {
  padding: 0 12px;
  white-space: pre;
  /* 不在每行添加滚动条，由 .diff-content 统一处理横向滚动 */
}

/* === 行类型样式 === */

/* 添加行 */
.diff-row--add {
  background: var(--diff-add-bg);
}

.diff-row--add .diff-sign {
  color: var(--diff-add-text);
}

.diff-row--add .diff-code {
  color: var(--diff-add-text);
}

.diff-row--add .diff-line-num {
  background: rgba(135, 154, 57, 0.12);
  color: var(--diff-add-text);
}

/* 删除行 */
.diff-row--del {
  background: var(--diff-del-bg);
}

.diff-row--del .diff-sign {
  color: var(--diff-del-text);
}

.diff-row--del .diff-code {
  color: var(--diff-del-text);
}

.diff-row--del .diff-line-num {
  background: rgba(209, 77, 65, 0.12);
  color: var(--diff-del-text);
}

/* 上下文行 */
.diff-row--context {
  background: transparent;
}

.diff-row--context .diff-code {
  color: var(--text);
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
.diff-content::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.file-list::-webkit-scrollbar-track,
.diff-content::-webkit-scrollbar-track {
  background: transparent;
}

.file-list::-webkit-scrollbar-thumb,
.diff-content::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

.file-list::-webkit-scrollbar-thumb:hover,
.diff-content::-webkit-scrollbar-thumb:hover {
  background: var(--muted);
}

/* 横向滚动条角落 */
.diff-content::-webkit-scrollbar-corner {
  background: transparent;
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
</style>
