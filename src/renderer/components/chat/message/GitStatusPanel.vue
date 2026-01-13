<template>
  <div
    class="git-status-panel"
    :class="{ loading: isLoading }"
    tabindex="0"
    @keydown="handleKeydown"
  >
    <!-- Header with branch info -->
    <div class="panel-header">
      <div class="header-main">
        <div class="branch-info">
          <svg class="branch-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="6" y1="3" x2="6" y2="15"/>
            <circle cx="18" cy="6" r="3"/>
            <circle cx="6" cy="18" r="3"/>
            <path d="M18 9a9 9 0 0 1-9 9"/>
          </svg>
          <span class="branch-name">{{ data.branch?.current || 'unknown' }}</span>
        </div>

        <button
          class="refresh-btn"
          :class="{ spinning: isLoading }"
          @click="handleRefresh"
          title="Refresh (R)"
          :disabled="isLoading"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
        <button
          class="close-btn"
          @click="handleClose"
          title="Close panel"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div v-if="data.branch?.upstream" class="tracking-info">
        <span class="tracking-arrow">↳</span>
        <span class="upstream-name">{{ data.branch.upstream }}</span>
        <span v-if="data.branch?.ahead" class="sync-badge ahead">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="18 15 12 9 6 15"/>
          </svg>
          {{ data.branch.ahead }}
        </span>
        <span v-if="data.branch?.behind" class="sync-badge behind">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
          {{ data.branch.behind }}
        </span>
      </div>

      <div class="stats-row">
        <span v-if="data.summary.totalChanges > 0" class="stat-badge total">
          {{ data.summary.totalChanges }} changes
        </span>
        <span v-if="data.summary.stagedCount > 0" class="stat-badge staged">
          {{ data.summary.stagedCount }} staged
        </span>
        <span v-if="data.summary.unstagedCount > 0" class="stat-badge modified">
          {{ data.summary.unstagedCount }} modified
        </span>
        <span v-if="data.summary.untrackedCount > 0" class="stat-badge untracked">
          {{ data.summary.untrackedCount }} untracked
        </span>
      </div>
    </div>

    <!-- Error state -->
    <div v-if="!data.isRepo" class="error-state">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <div class="error-text">
        <span class="error-title">Not a git repository</span>
        <span class="error-detail">{{ data.error || 'Initialize with git init' }}</span>
      </div>
    </div>

    <!-- Quick actions (fixed, outside scrollable area) -->
    <div v-if="data.isRepo" class="actions-bar">
      <button
        class="action-btn primary"
        @click="emitAction('stage-all')"
        title="Stage all changes (git add -A)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <span>Stage All</span>
      </button>
      <button
        class="action-btn"
        @click="emitAction('commit')"
        title="Commit staged changes"
        :disabled="data.summary.stagedCount === 0"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="4"/>
          <line x1="1.05" y1="12" x2="7" y2="12"/>
          <line x1="17.01" y1="12" x2="22.96" y2="12"/>
        </svg>
        <span>Commit</span>
      </button>
      <button
        class="action-btn"
        @click="emitAction('push')"
        title="Push to remote"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="19" x2="12" y2="5"/>
          <polyline points="5 12 12 5 19 12"/>
        </svg>
        <span>Push</span>
      </button>
      <button
        class="action-btn"
        @click="emitAction('pull')"
        title="Pull from remote"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <polyline points="19 12 12 19 5 12"/>
        </svg>
        <span>Pull</span>
      </button>
    </div>

    <!-- Content sections (scrollable) -->
    <div v-if="data.isRepo" class="panel-content">
      <!-- Staged files -->
      <div v-if="data.staged.length > 0" class="section">
        <div class="section-header" @click="toggleSection('staged')">
          <svg
            :class="['chevron', { collapsed: collapsedSections.staged }]"
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
          <span class="section-title">Staged</span>
          <span class="section-count">{{ data.staged.length }}</span>
          <button
            class="section-action"
            @click.stop="emitAction('unstage-all')"
            title="Unstage all"
          >
            Unstage All
          </button>
        </div>
        <Transition name="section">
          <div v-show="!collapsedSections.staged" class="section-content">
            <div
              v-for="file in data.staged"
              :key="'staged-' + file.path"
              class="file-item-wrapper"
            >
              <div
                class="file-item"
                :class="{ expanded: isDiffExpanded(file.path) }"
                @click="toggleDiff(file.path, true)"
              >
                <span :class="['status-icon', `status-${file.status}`]">
                  {{ getStatusIcon(file.status) }}
                </span>
                <span class="file-path" :title="file.path">
                  <span class="file-dir">{{ getFileDir(file.path) }}</span>
                  <span class="file-name">{{ getFileName(file.path) }}</span>
                </span>
                <div class="file-actions">
                  <button
                    class="file-action-btn"
                    @click.stop="emitFileAction('unstage', file.path)"
                    title="Unstage file"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                  </button>
                </div>
              </div>
              <!-- Expanded diff content -->
              <Transition name="diff">
                <div v-if="getDiffState(file.path)" class="diff-container">
                  <DiffView
                    :diff="getDiffState(file.path)?.content || ''"
                    :loading="getDiffState(file.path)?.loading"
                    :error="getDiffState(file.path)?.error"
                    :fileName="file.path"
                    :showFileName="false"
                  />
                </div>
              </Transition>
            </div>
          </div>
        </Transition>
      </div>

      <!-- Unstaged changes -->
      <div v-if="data.unstaged.length > 0" class="section">
        <div class="section-header" @click="toggleSection('unstaged')">
          <svg
            :class="['chevron', { collapsed: collapsedSections.unstaged }]"
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
          <span class="section-title">Changes</span>
          <span class="section-count">{{ data.unstaged.length }}</span>
          <button
            class="section-action"
            @click.stop="emitAction('stage-all-changes')"
            title="Stage all changes"
          >
            Stage All
          </button>
        </div>
        <Transition name="section">
          <div v-show="!collapsedSections.unstaged" class="section-content">
            <div
              v-for="file in data.unstaged"
              :key="'unstaged-' + file.path"
              class="file-item-wrapper"
            >
              <div
                class="file-item"
                :class="{ expanded: isDiffExpanded(file.path) }"
                @click="toggleDiff(file.path, false)"
              >
                <span :class="['status-icon', `status-${file.status}`]">
                  {{ getStatusIcon(file.status) }}
                </span>
                <span class="file-path" :title="file.path">
                  <span class="file-dir">{{ getFileDir(file.path) }}</span>
                  <span class="file-name">{{ getFileName(file.path) }}</span>
                </span>
                <div class="file-actions">
                  <button
                    class="file-action-btn"
                    @click.stop="emitFileAction('stage', file.path)"
                    title="Stage file"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="12" y1="5" x2="12" y2="19"/>
                      <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                  </button>
                  <button
                    class="file-action-btn danger"
                    @click.stop="emitFileAction('discard', file.path)"
                    title="Discard changes"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                  </button>
                </div>
              </div>
              <!-- Expanded diff content -->
              <Transition name="diff">
                <div v-if="getDiffState(file.path)" class="diff-container">
                  <DiffView
                    :diff="getDiffState(file.path)?.content || ''"
                    :loading="getDiffState(file.path)?.loading"
                    :error="getDiffState(file.path)?.error"
                    :fileName="file.path"
                    :showFileName="false"
                  />
                </div>
              </Transition>
            </div>
          </div>
        </Transition>
      </div>

      <!-- Untracked files -->
      <div v-if="data.untracked.length > 0" class="section">
        <div class="section-header" @click="toggleSection('untracked')">
          <svg
            :class="['chevron', { collapsed: collapsedSections.untracked }]"
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
          <span class="section-title">Untracked</span>
          <span class="section-count">{{ data.untracked.length }}</span>
          <button
            class="section-action"
            @click.stop="emitAction('stage-all-untracked')"
            title="Stage all untracked"
          >
            Add All
          </button>
        </div>
        <Transition name="section">
          <div v-show="!collapsedSections.untracked" class="section-content">
            <div
              v-for="file in data.untracked"
              :key="'untracked-' + file.path"
              class="file-item"
            >
              <span class="status-icon status-untracked">?</span>
              <span class="file-path" :title="file.path">
                <span class="file-dir">{{ getFileDir(file.path) }}</span>
                <span class="file-name">{{ getFileName(file.path) }}</span>
              </span>
              <div class="file-actions">
                <button
                  class="file-action-btn"
                  @click.stop="emitFileAction('stage', file.path)"
                  title="Add file"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>

      <!-- No changes state -->
      <div v-if="data.summary.totalChanges === 0" class="empty-state">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <div class="empty-text">
          <span class="empty-title">Working tree clean</span>
          <span class="empty-detail">No changes to commit</span>
        </div>
      </div>

      <!-- Recent commits -->
      <div v-if="data.recentCommits.length > 0" class="section commits-section">
        <div class="section-header" @click="toggleSection('commits')">
          <svg
            :class="['chevron', { collapsed: collapsedSections.commits }]"
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
          <span class="section-title">Recent Commits</span>
          <span class="section-count">{{ data.recentCommits.length }}</span>
        </div>
        <Transition name="section">
          <div v-show="!collapsedSections.commits" class="section-content commits-list">
            <div
              v-for="commit in data.recentCommits"
              :key="commit.hash"
              class="commit-card"
            >
              <div class="commit-header">
                <button
                  class="commit-hash"
                  @click="copyToClipboard(commit.shortHash)"
                  :title="`Copy ${commit.shortHash}`"
                >
                  {{ commit.shortHash }}
                  <svg class="copy-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                </button>
                <span class="commit-date">{{ commit.relativeDate }}</span>
              </div>
              <div class="commit-message" :title="commit.message">
                {{ commit.message }}
              </div>
              <div class="commit-author">
                <div class="author-avatar">
                  {{ getInitials(commit.author) }}
                </div>
                <span class="author-name">{{ commit.author }}</span>
              </div>
            </div>
          </div>
        </Transition>
      </div>

    </div>

    <!-- Toast notification -->
    <Transition name="toast">
      <div v-if="toastMessage" class="toast">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        {{ toastMessage }}
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue'
import type { GitStatusData, GitFileStatus } from '@/services/commands/git'
import DiffView from './DiffView.vue'

interface Props {
  data: GitStatusData
  isRefreshing?: boolean
  workingDirectory?: string
  sessionId?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'action', action: string): void
  (e: 'file-action', action: string, filePath: string): void
  (e: 'refresh'): void
  (e: 'close'): void
}>()

// State
const toastMessage = ref('')

// Use prop for loading state
const isLoading = computed(() => props.isRefreshing ?? false)

// Expanded diff state: { [filePath]: { content: string, loading: boolean, staged: boolean } }
const expandedDiffs = reactive<Record<string, { content: string; loading: boolean; error?: string }>>({})

// Collapsible sections state
const collapsedSections = reactive({
  staged: false,
  unstaged: false,
  untracked: false,
  commits: true, // Start collapsed
})

// Reset state when data changes (e.g., session switch)
watch(() => props.data, () => {
  // Clear expanded diffs
  Object.keys(expandedDiffs).forEach(key => {
    delete expandedDiffs[key]
  })
  // Reset collapsed sections to defaults
  collapsedSections.staged = false
  collapsedSections.unstaged = false
  collapsedSections.untracked = false
  collapsedSections.commits = true
}, { deep: true })

// Toggle section collapse
function toggleSection(section: keyof typeof collapsedSections) {
  collapsedSections[section] = !collapsedSections[section]
}

// Get status icon for display
function getStatusIcon(status: GitFileStatus['status']): string {
  switch (status) {
    case 'modified':
      return '●'
    case 'added':
      return '+'
    case 'deleted':
      return '−'
    case 'renamed':
      return '→'
    case 'conflicted':
      return '!'
    case 'untracked':
      return '?'
    default:
      return '?'
  }
}

// Get file directory part
function getFileDir(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/')
  return lastSlash > -1 ? filePath.substring(0, lastSlash + 1) : ''
}

// Get file name part
function getFileName(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/')
  return lastSlash > -1 ? filePath.substring(lastSlash + 1) : filePath
}

// Get initials from author name
function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// Copy text to clipboard
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    showToast(`Copied: ${text}`)
  } catch {
    showToast('Failed to copy')
  }
}

// Show toast notification
function showToast(message: string) {
  toastMessage.value = message
  setTimeout(() => {
    toastMessage.value = ''
  }, 2000)
}

// Handle refresh - parent manages loading state
function handleRefresh() {
  if (isLoading.value) return
  emit('refresh')
}

// Handle close - emit to parent for persistent deletion
function handleClose() {
  emit('close')
}

// Toggle diff expansion for a file
async function toggleDiff(filePath: string, staged: boolean) {
  // If already expanded, collapse it
  if (expandedDiffs[filePath]) {
    delete expandedDiffs[filePath]
    return
  }

  // Need working directory to run git commands
  if (!props.workingDirectory) {
    expandedDiffs[filePath] = { content: '', loading: false, error: 'No working directory' }
    return
  }

  // Start loading
  expandedDiffs[filePath] = { content: '', loading: true }

  try {
    const command = staged ? `git diff --staged "${filePath}"` : `git diff "${filePath}"`

    // Execute git diff via electronAPI with working directory
    const result = await window.electronAPI.executeTool(
      'bash',
      { command, working_directory: props.workingDirectory },
      `git-diff-${Date.now()}`,
      props.sessionId || ''
    )

    if (result.success && result.result?.output) {
      const output = result.result.output
      // Check if there's actual diff content
      if (output.trim() && output !== '(no output)') {
        expandedDiffs[filePath] = { content: output, loading: false }
      } else {
        expandedDiffs[filePath] = { content: '', loading: false, error: 'No changes' }
      }
    } else {
      expandedDiffs[filePath] = { content: '', loading: false, error: result.error || 'Failed to get diff' }
    }
  } catch (error) {
    expandedDiffs[filePath] = {
      content: '',
      loading: false,
      error: error instanceof Error ? error.message : 'Failed to get diff'
    }
  }
}

// Check if diff is expanded for a file
function isDiffExpanded(filePath: string): boolean {
  return !!expandedDiffs[filePath]
}

// Get diff state for a file
function getDiffState(filePath: string) {
  return expandedDiffs[filePath]
}

// Handle keyboard shortcuts
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'r' || event.key === 'R') {
    handleRefresh()
  }
}

// Emit action to parent
function emitAction(action: string) {
  emit('action', action)
}

// Emit file-specific action
function emitFileAction(action: string, filePath: string) {
  emit('file-action', action, filePath)
}

</script>

<style scoped>
.git-status-panel {
  width: 100%;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--panel);
  overflow: hidden;
  animation: fadeIn 0.2s ease-out;
  outline: none;
  position: relative;
}

.git-status-panel:focus {
  border-color: var(--accent);
}

.git-status-panel.loading {
  opacity: 0.7;
  pointer-events: none;
}

/* Header styles */
.panel-header {
  padding: 14px 16px;
  background: linear-gradient(135deg, rgba(var(--accent-rgb), 0.08), rgba(var(--accent-rgb), 0.03));
  border-bottom: 1px solid var(--border);
}

.header-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.branch-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.branch-icon {
  color: var(--accent);
}

.branch-name {
  font-weight: 600;
  font-size: 15px;
  color: var(--text);
  font-family: 'SF Mono', Monaco, monospace;
}

.refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.refresh-btn:hover:not(:disabled) {
  background: var(--hover);
  color: var(--accent);
  border-color: var(--accent);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.refresh-btn.spinning svg {
  animation: spin 1s linear infinite;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
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

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.tracking-info {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 12px;
}

.tracking-arrow {
  color: var(--muted);
}

.upstream-name {
  color: var(--muted);
  font-family: 'SF Mono', Monaco, monospace;
}

.sync-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  font-family: 'SF Mono', Monaco, monospace;
}

.sync-badge.ahead {
  background: rgba(34, 197, 94, 0.15);
  color: rgb(34, 197, 94);
}

.sync-badge.behind {
  background: rgba(251, 191, 36, 0.15);
  color: rgb(251, 191, 36);
}

.stats-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.stat-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
}

.stat-badge.total {
  background: rgba(var(--accent-rgb), 0.12);
  color: var(--accent);
}

.stat-badge.staged {
  background: rgba(34, 197, 94, 0.12);
  color: rgb(34, 197, 94);
}

.stat-badge.modified {
  background: rgba(251, 191, 36, 0.12);
  color: rgb(217, 164, 31);
}

.stat-badge.untracked {
  background: rgba(148, 163, 184, 0.12);
  color: rgb(148, 163, 184);
}

/* Error state */
.error-state {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 24px;
  color: rgb(239, 68, 68);
}

.error-state svg {
  flex-shrink: 0;
}

.error-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.error-title {
  font-weight: 600;
  font-size: 14px;
}

.error-detail {
  font-size: 12px;
  opacity: 0.8;
}

/* Empty state */
.empty-state {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 24px;
  color: rgb(34, 197, 94);
}

.empty-state svg {
  flex-shrink: 0;
}

.empty-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.empty-title {
  font-weight: 600;
  font-size: 14px;
}

.empty-detail {
  font-size: 12px;
  opacity: 0.8;
}

/* Panel content */
.panel-content {
  max-height: 450px;
  overflow-y: auto;
}

/* Section styles */
.section {
  border-bottom: 1px solid var(--border);
}

.section:last-of-type {
  border-bottom: none;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease;
}

.section-header:hover {
  background: var(--hover);
}

.chevron {
  color: var(--muted);
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.chevron.collapsed {
  transform: rotate(-90deg);
}

.section-title {
  font-weight: 500;
  font-size: 13px;
  color: var(--text);
}

.section-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  background: rgba(var(--accent-rgb), 0.12);
  color: var(--accent);
  font-size: 11px;
  font-weight: 600;
  border-radius: 9px;
}

.section-action {
  margin-left: auto;
  padding: 4px 10px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.section-action:hover {
  background: var(--hover);
  border-color: var(--accent);
  color: var(--accent);
}

.section-content {
  padding: 0 14px 10px;
}

/* Section transition */
.section-enter-active,
.section-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.section-enter-from,
.section-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

/* File item styles */
.file-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.file-item:hover {
  background: var(--hover);
}

.file-item:hover .file-actions {
  opacity: 1;
}

.status-icon {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 12px;
  font-weight: 700;
  border-radius: 4px;
  flex-shrink: 0;
}

.status-modified {
  background: rgba(251, 191, 36, 0.2);
  color: rgb(217, 164, 31);
}

.status-added {
  background: rgba(34, 197, 94, 0.2);
  color: rgb(34, 197, 94);
}

.status-deleted {
  background: rgba(239, 68, 68, 0.2);
  color: rgb(239, 68, 68);
}

.status-renamed {
  background: rgba(59, 130, 246, 0.2);
  color: rgb(59, 130, 246);
}

.status-conflicted {
  background: rgba(249, 115, 22, 0.2);
  color: rgb(249, 115, 22);
}

.status-untracked {
  background: rgba(148, 163, 184, 0.2);
  color: rgb(148, 163, 184);
}

.file-path {
  flex: 1;
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.file-dir {
  color: var(--muted);
}

.file-name {
  color: var(--text);
  font-weight: 500;
}

.file-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.file-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.file-action-btn:hover {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.file-action-btn.danger:hover {
  background: rgb(239, 68, 68);
  border-color: rgb(239, 68, 68);
}

/* Commits section */
.commits-section {
  background: rgba(0, 0, 0, 0.02);
}

.commits-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.commit-card {
  padding: 10px 12px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  transition: all 0.15s ease;
}

.commit-card:hover {
  border-color: rgba(var(--accent-rgb), 0.3);
}

.commit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.commit-hash {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: rgba(var(--accent-rgb), 0.1);
  border: none;
  border-radius: 4px;
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
  cursor: pointer;
  transition: all 0.15s ease;
}

.commit-hash:hover {
  background: rgba(var(--accent-rgb), 0.2);
}

.commit-hash .copy-icon {
  opacity: 0;
  transition: opacity 0.15s ease;
}

.commit-hash:hover .copy-icon {
  opacity: 1;
}

.commit-date {
  font-size: 11px;
  color: var(--muted);
}

.commit-message {
  font-size: 13px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 8px;
}

.commit-author {
  display: flex;
  align-items: center;
  gap: 8px;
}

.author-avatar {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--accent), rgba(var(--accent-rgb), 0.7));
  border-radius: 50%;
  font-size: 9px;
  font-weight: 600;
  color: white;
}

.author-name {
  font-size: 11px;
  color: var(--muted);
}

/* Actions bar */
.actions-bar {
  display: flex;
  gap: 8px;
  padding: 12px 14px;
  background: rgba(0, 0, 0, 0.03);
  border-bottom: 1px solid var(--border);
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover:not(:disabled) {
  background: var(--hover);
  border-color: var(--accent);
  color: var(--accent);
}

.action-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.action-btn.primary:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  color: white;
}

/* Toast notification */
.toast {
  position: absolute;
  bottom: 60px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--text);
  color: var(--panel);
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 10;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}

/* Scrollbar styles */
.panel-content::-webkit-scrollbar {
  width: 6px;
}

.panel-content::-webkit-scrollbar-track {
  background: transparent;
}

.panel-content::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

.panel-content::-webkit-scrollbar-thumb:hover {
  background: var(--muted);
}

/* Animation */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* File item wrapper for diff expansion */
.file-item-wrapper {
  display: flex;
  flex-direction: column;
}

.file-item.expanded {
  background: rgba(var(--accent-rgb), 0.05);
  border-radius: 6px 6px 0 0;
}

.file-action-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

/* Diff container styles */
.diff-container {
  margin: 0 0 8px 0;
  border-radius: 0 0 8px 8px;
  border: 1px solid var(--border);
  border-top: none;
  background: var(--background);
  overflow: hidden;
}

/* Diff transition */
.diff-enter-active,
.diff-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}

.diff-enter-from,
.diff-leave-to {
  opacity: 0;
  max-height: 0;
}

.diff-enter-to,
.diff-leave-from {
  max-height: 400px;
}
</style>
