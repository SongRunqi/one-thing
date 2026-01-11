<template>
  <div class="git-tab">
    <!-- Header -->
    <div class="tab-header">
      <div class="branch-info" v-if="gitStatus">
        <GitBranch :size="14" :stroke-width="1.5" />
        <span class="branch-name">{{ gitStatus.branch || 'Unknown' }}</span>
        <span v-if="gitStatus.ahead" class="sync-badge ahead" title="Ahead">
          <ArrowUp :size="10" :stroke-width="2" />{{ gitStatus.ahead }}
        </span>
        <span v-if="gitStatus.behind" class="sync-badge behind" title="Behind">
          <ArrowDown :size="10" :stroke-width="2" />{{ gitStatus.behind }}
        </span>
      </div>
      <button class="refresh-btn" @click="loadGitStatus" :disabled="isLoading" title="Refresh">
        <RefreshCw :size="14" :stroke-width="1.5" :class="{ spinning: isLoading }" />
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading && !gitStatus" class="loading-state">
      <div class="skeleton-section">
        <div class="skeleton-header"></div>
        <div class="skeleton-item"></div>
        <div class="skeleton-item"></div>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-state">
      <AlertCircle :size="32" :stroke-width="1.5" />
      <p class="error-text">{{ error }}</p>
      <button class="retry-btn" @click="loadGitStatus">Retry</button>
    </div>

    <!-- No Working Directory -->
    <div v-else-if="!workingDirectory" class="empty-state">
      <GitBranch :size="32" :stroke-width="1.5" />
      <p class="empty-text">No working directory</p>
      <p class="empty-hint">Select a chat session with a working directory</p>
    </div>

    <!-- Not a Git Repository -->
    <div v-else-if="!gitStatus?.isRepo" class="empty-state">
      <FolderX :size="32" :stroke-width="1.5" />
      <p class="empty-text">Not a Git repository</p>
      <p class="empty-hint">This directory is not tracked by Git</p>
    </div>

    <!-- Git Status Content -->
    <div v-else class="git-content">
      <!-- Staged Changes -->
      <div v-if="gitStatus.staged.length > 0" class="section">
        <div class="section-header" @click="toggleSection('staged')">
          <ChevronRight :size="14" :stroke-width="1.5" :class="{ rotated: !collapsedSections.staged }" />
          <span class="section-title">Staged Changes</span>
          <span class="section-count">{{ gitStatus.staged.length }}</span>
        </div>
        <div v-show="!collapsedSections.staged" class="section-content">
          <div
            v-for="file in gitStatus.staged"
            :key="file.path"
            class="file-item"
          >
            <span class="file-status staged">{{ file.status }}</span>
            <span class="file-path">{{ file.path }}</span>
          </div>
        </div>
      </div>

      <!-- Unstaged Changes -->
      <div v-if="gitStatus.changes.length > 0" class="section">
        <div class="section-header" @click="toggleSection('changes')">
          <ChevronRight :size="14" :stroke-width="1.5" :class="{ rotated: !collapsedSections.changes }" />
          <span class="section-title">Changes</span>
          <span class="section-count">{{ gitStatus.changes.length }}</span>
        </div>
        <div v-show="!collapsedSections.changes" class="section-content">
          <div
            v-for="file in gitStatus.changes"
            :key="file.path"
            class="file-item"
          >
            <span class="file-status modified">{{ file.status }}</span>
            <span class="file-path">{{ file.path }}</span>
          </div>
        </div>
      </div>

      <!-- Untracked Files -->
      <div v-if="gitStatus.untracked.length > 0" class="section">
        <div class="section-header" @click="toggleSection('untracked')">
          <ChevronRight :size="14" :stroke-width="1.5" :class="{ rotated: !collapsedSections.untracked }" />
          <span class="section-title">Untracked</span>
          <span class="section-count">{{ gitStatus.untracked.length }}</span>
        </div>
        <div v-show="!collapsedSections.untracked" class="section-content">
          <div
            v-for="file in gitStatus.untracked"
            :key="file"
            class="file-item"
          >
            <span class="file-status untracked">?</span>
            <span class="file-path">{{ file }}</span>
          </div>
        </div>
      </div>

      <!-- No Changes -->
      <div v-if="noChanges" class="no-changes">
        <Check :size="32" :stroke-width="1.5" />
        <p>Working tree clean</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive, onMounted } from 'vue'
import {
  GitBranch,
  RefreshCw,
  AlertCircle,
  FolderX,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Check,
} from 'lucide-vue-next'

const props = defineProps<{
  workingDirectory?: string
  sessionId?: string
}>()

interface GitFileChange {
  path: string
  status: string
}

interface GitStatus {
  isRepo: boolean
  branch?: string
  ahead?: number
  behind?: number
  staged: GitFileChange[]
  changes: GitFileChange[]
  untracked: string[]
}

const isLoading = ref(false)
const error = ref<string | null>(null)
const gitStatus = ref<GitStatus | null>(null)

const collapsedSections = reactive({
  staged: false,
  changes: false,
  untracked: false,
})

const noChanges = computed(() => {
  if (!gitStatus.value) return false
  return (
    gitStatus.value.staged.length === 0 &&
    gitStatus.value.changes.length === 0 &&
    gitStatus.value.untracked.length === 0
  )
})

function toggleSection(section: keyof typeof collapsedSections) {
  collapsedSections[section] = !collapsedSections[section]
}

async function loadGitStatus() {
  if (!props.workingDirectory || !props.sessionId) return

  isLoading.value = true
  error.value = null

  try {
    // Execute git status command
    const result = await window.electronAPI.executeTool(
      'bash',
      {
        command: 'git status --porcelain=v2 --branch 2>/dev/null || echo "NOT_A_GIT_REPO"',
        working_directory: props.workingDirectory,
      },
      `git-status-${Date.now()}`,
      props.sessionId
    )

    if (!result.success) {
      error.value = result.error || 'Failed to get git status'
      return
    }

    const output = result.result || ''

    if (output.trim() === 'NOT_A_GIT_REPO') {
      gitStatus.value = {
        isRepo: false,
        staged: [],
        changes: [],
        untracked: [],
      }
      return
    }

    // Parse git status output
    const lines = output.split('\n')
    const status: GitStatus = {
      isRepo: true,
      staged: [],
      changes: [],
      untracked: [],
    }

    for (const line of lines) {
      if (line.startsWith('# branch.head ')) {
        status.branch = line.replace('# branch.head ', '')
      } else if (line.startsWith('# branch.ab ')) {
        const match = line.match(/\+(\d+) -(\d+)/)
        if (match) {
          status.ahead = parseInt(match[1], 10)
          status.behind = parseInt(match[2], 10)
        }
      } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
        // Changed entry
        const parts = line.split(' ')
        const xy = parts[1]
        const path = parts.slice(8).join(' ')

        if (xy[0] !== '.') {
          status.staged.push({ path, status: xy[0] })
        }
        if (xy[1] !== '.') {
          status.changes.push({ path, status: xy[1] })
        }
      } else if (line.startsWith('? ')) {
        // Untracked
        status.untracked.push(line.slice(2))
      }
    }

    gitStatus.value = status
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unknown error'
  } finally {
    isLoading.value = false
  }
}

// Load status when working directory changes
watch(() => props.workingDirectory, () => {
  loadGitStatus()
}, { immediate: true })

onMounted(() => {
  loadGitStatus()
})
</script>

<style scoped>
.git-tab {
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

.branch-info {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
}

.branch-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
}

.sync-badge {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 500;
}

.sync-badge.ahead {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.sync-badge.behind {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
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

.skeleton-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-header {
  width: 120px;
  height: 16px;
  border-radius: 4px;
  background: var(--hover);
  animation: pulse 1.5s ease-in-out infinite;
}

.skeleton-item {
  width: 100%;
  height: 24px;
  border-radius: 4px;
  background: var(--hover);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Error and empty states */
.error-state,
.empty-state {
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
}

.retry-btn:hover {
  background: var(--hover);
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

/* Git content */
.git-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
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
  padding: 4px 12px 4px 28px;
  font-size: 12px;
}

.file-item:hover {
  background: var(--hover);
}

.file-status {
  flex-shrink: 0;
  width: 16px;
  text-align: center;
  font-weight: 600;
  font-size: 11px;
}

.file-status.staged {
  color: #22c55e;
}

.file-status.modified {
  color: #f59e0b;
}

.file-status.untracked {
  color: #6b7280;
}

.file-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
}

.no-changes {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  color: var(--muted);
}

.no-changes svg {
  color: #22c55e;
}

.no-changes p {
  margin-top: 12px;
  font-size: 13px;
}
</style>
