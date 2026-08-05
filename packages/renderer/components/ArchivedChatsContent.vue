<template>
  <div class="archived-chats-content">
    <!-- Header -->
    <div class="content-header">
      <input
        v-model="searchQuery"
        type="text"
        class="search-input"
        placeholder="Search archived chats…"
        aria-label="Search archived chats"
      >
      <!-- Grouping Mode Toggle -->
      <div
        class="grouping-toggle"
        role="group"
        aria-label="Group archived chats"
      >
        <Button
          unstyled
          class="text-action toggle-action"
          :class="{ 'is-active': groupingMode === 'date' }"
          :aria-pressed="groupingMode === 'date'"
          title="Group by date"
          @click="groupingMode = 'date'"
        >
          date
        </Button>
        <span
          class="toggle-sep"
          aria-hidden="true"
        >/</span>
        <Button
          unstyled
          class="text-action toggle-action"
          :class="{ 'is-active': groupingMode === 'branch' }"
          :aria-pressed="groupingMode === 'branch'"
          title="Group by branch"
          @click="groupingMode = 'branch'"
        >
          branch
        </Button>
      </div>
    </div>

    <!-- Archived Chats List -->
    <div class="content-body">
      <!-- Loading State -->
      <p
        v-if="sessionsStore.isLoading"
        class="ledger-note"
      >
        loading archived chats…
      </p>

      <!-- Grouped Chats -->
      <div
        v-else-if="groupedChats.length > 0"
        class="ledger-body"
      >
        <section
          v-for="(group, index) in groupedChats"
          :key="`${group.label}-${group.sessions[0]?.id || index}`"
          class="chat-group"
        >
          <h4
            class="group-header"
            :class="{ collapsed: collapsedGroups.has(group.label) }"
            role="button"
            tabindex="0"
            :aria-expanded="!collapsedGroups.has(group.label)"
            @click="toggleGroup(group.label)"
            @keydown.enter.prevent="toggleGroup(group.label)"
            @keydown.space.prevent="toggleGroup(group.label)"
          >
            <span
              class="group-mark"
              aria-hidden="true"
            >{{ collapsedGroups.has(group.label) ? '+' : '−' }}</span>
            <span
              class="group-title"
              :title="group.label"
            >{{ group.label }}</span>
            <span class="group-count">{{ group.sessions.length }}</span>
          </h4>
          <div
            v-show="!collapsedGroups.has(group.label)"
            class="chat-list"
          >
            <div
              v-for="session in group.sessions"
              :key="session.id"
              class="chat-row"
              :class="{
                active: sessionsStore.currentSessionId === session.id,
                'is-branch': session.parentSessionId
              }"
              role="button"
              tabindex="0"
              @click="viewChat(session)"
              @keydown.enter.prevent="viewChat(session)"
              @keydown.space.prevent="viewChat(session)"
            >
              <span
                class="row-index"
                aria-hidden="true"
              />
              <span
                class="chat-name"
                :title="session.name || 'Untitled Chat'"
              >{{ session.name || 'Untitled Chat' }}</span>
              <span class="chat-meta">
                <!-- Branch parent indicator -->
                <span
                  v-if="session.parentSessionId"
                  class="chat-branch"
                  :title="`Branched from ${getParentName(session.parentSessionId)}`"
                >↳ {{ getParentName(session.parentSessionId) }}</span>
                <span
                  v-else
                  class="chat-time"
                >{{ formatTime(session.archivedAt || session.updatedAt) }}</span>
                <span
                  v-if="session.messages?.length"
                  class="chat-messages"
                >{{ session.messages.length }} msg</span>
                <!-- Show branch count if has children -->
                <span
                  v-if="getBranchCount(session.id) > 0"
                  class="chat-branches"
                >{{ getBranchCount(session.id) }} branch{{ getBranchCount(session.id) > 1 ? 'es' : '' }}</span>
              </span>
              <span
                class="chat-actions"
                @click.stop
              >
                <Button
                  unstyled
                  class="text-action"
                  title="Restore"
                  @click="restoreChat(session)"
                >
                  restore
                </Button>
                <Button
                  unstyled
                  class="text-action is-danger"
                  title="Delete permanently"
                  @click="confirmDelete(session)"
                >
                  delete
                </Button>
              </span>
            </div>
          </div>
        </section>
      </div>

      <!-- Empty State -->
      <div
        v-else
        class="empty-state"
      >
        <p class="empty-text">
          No archived chats
        </p>
        <p class="empty-hint">
          Deleted chats will appear here
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useConfirm } from '@/composables/useConfirm'
import Button from '@/components/common/Button.vue'
import { ref, computed } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import type { ChatSession, ChatMessage } from '@/types'

const sessionsStore = useSessionsStore()
const { confirm } = useConfirm()
const searchQuery = ref('')
const groupingMode = ref<'date' | 'branch'>('date')
const collapsedGroups = ref<Set<string>>(new Set())

// Toggle group collapse state
function toggleGroup(label: string) {
  if (collapsedGroups.value.has(label)) {
    collapsedGroups.value.delete(label)
  } else {
    collapsedGroups.value.add(label)
  }
  // Trigger reactivity
  collapsedGroups.value = new Set(collapsedGroups.value)
}

// Filter archived sessions by search query
const filteredSessions = computed(() => {
  const archived = sessionsStore.archivedSessions
  if (!searchQuery.value) return archived
  const query = searchQuery.value.toLowerCase()
  return archived.filter(s =>
    (s.name || '').toLowerCase().includes(query)
  )
})

// Session type for archived list (messages may be undefined for optimized loading)
type ArchivedSession = Omit<ChatSession, 'messages'> & { messages?: ChatMessage[] }

// Group sessions by date
function groupByDate(sessions: ArchivedSession[]): { label: string; sessions: ArchivedSession[]; isParent?: boolean }[] {
  if (sessions.length === 0) return []

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStart = today.getTime()

  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStart = yesterday.getTime()

  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 7)
  const weekAgoStart = weekAgo.getTime()

  const monthAgo = new Date(today)
  monthAgo.setMonth(monthAgo.getMonth() - 1)
  const monthAgoStart = monthAgo.getTime()

  const groups: { label: string; sessions: ArchivedSession[]; isParent?: boolean }[] = [
    { label: 'Today', sessions: [] },
    { label: 'Yesterday', sessions: [] },
    { label: 'This Week', sessions: [] },
    { label: 'This Month', sessions: [] },
    { label: 'Older', sessions: [] },
  ]

  for (const session of sessions) {
    const time = session.archivedAt || session.updatedAt
    if (time >= todayStart) {
      groups[0].sessions.push(session)
    } else if (time >= yesterdayStart) {
      groups[1].sessions.push(session)
    } else if (time >= weekAgoStart) {
      groups[2].sessions.push(session)
    } else if (time >= monthAgoStart) {
      groups[3].sessions.push(session)
    } else {
      groups[4].sessions.push(session)
    }
  }

  return groups.filter(g => g.sessions.length > 0)
}

// Group sessions by branch relationship
function groupByBranch(sessions: ArchivedSession[]): { label: string; sessions: ArchivedSession[]; isParent?: boolean }[] {
  if (sessions.length === 0) return []

  const groups: { label: string; sessions: ArchivedSession[]; isParent?: boolean }[] = []

  // First, find all parent sessions (sessions without parentSessionId or whose parent is not archived)
  const parentSessions = sessions.filter(s => {
    if (!s.parentSessionId) return true
    // Check if parent is also in archived list
    const parentInArchived = sessions.find(p => p.id === s.parentSessionId)
    return !parentInArchived
  })

  // For each parent, create a group with it and its branches
  for (const parent of parentSessions) {
    // Find all branches of this parent (recursively)
    function findBranches(parentId: string): ArchivedSession[] {
      const directBranches = sessions.filter(s => s.parentSessionId === parentId)
      let allBranches: ArchivedSession[] = [...directBranches]
      for (const branch of directBranches) {
        allBranches = allBranches.concat(findBranches(branch.id))
      }
      return allBranches
    }

    const branches = findBranches(parent.id)

    if (branches.length > 0) {
      // Parent with branches
      groups.push({
        label: parent.name || 'Untitled Chat',
        sessions: [parent, ...branches],
        isParent: true
      })
    } else {
      // Standalone session (no branches)
      groups.push({
        label: parent.name || 'Untitled Chat',
        sessions: [parent],
        isParent: true
      })
    }
  }

  // Sort groups by most recent activity
  groups.sort((a, b) => {
    const aTime = Math.max(...a.sessions.map(s => s.archivedAt || s.updatedAt))
    const bTime = Math.max(...b.sessions.map(s => s.archivedAt || s.updatedAt))
    return bTime - aTime
  })

  return groups
}

// Computed grouped chats based on mode
const groupedChats = computed(() => {
  const sessions = filteredSessions.value
  if (groupingMode.value === 'branch') {
    return groupByBranch(sessions)
  }
  return groupByDate(sessions)
})

// Format time for display
function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (timestamp >= today.getTime()) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  } else if (timestamp >= yesterday.getTime()) {
    return 'Yesterday ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
}

// Get parent session name
function getParentName(parentId: string): string {
  const parent = sessionsStore.sessions.find(s => s.id === parentId)
  return parent?.name || 'Parent Chat'
}

// Get number of branches for a session
function getBranchCount(sessionId: string): number {
  return sessionsStore.sessions.filter(s => s.parentSessionId === sessionId && s.isArchived).length
}

// View archived chat (switch to it in ChatWindow)
async function viewChat(session: ArchivedSession) {
  await sessionsStore.switchSession(session.id)
}

// Restore chat from archive
async function restoreChat(session: ArchivedSession) {
  await sessionsStore.restoreSession(session.id)
}

// Confirm and permanently delete chat
async function confirmDelete(session: ArchivedSession) {
  const confirmed = await confirm({
    title: 'Delete chat',
    message: `Permanently delete "${session.name || 'Untitled Chat'}"? This cannot be undone.`,
    confirmText: 'Delete',
    danger: true,
  })
  if (!confirmed) return
  await sessionsStore.permanentlyDeleteSession(session.id)
}
</script>

<style scoped>
/*
 * Archived chats — 画线风 (ledger / ink-line).
 * No fills, no radii: groups and rows hang on one vertical rule.
 */
.archived-chats-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  animation: ledger-fade 0.15s ease;
}

@keyframes ledger-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ---- header ---- */
.content-header {
  padding: 16px 4px 12px;
  display: flex;
  gap: 14px;
  align-items: baseline;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.search-input {
  flex: 1 1 160px;
  min-width: 0;
  padding: 4px 2px 5px;
  font-size: 12px;
  color: var(--ui-text-primary-fg, var(--text-primary));
  background: transparent;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 70%, transparent);
  border-radius: 0;
  transition: border-color 0.12s ease;
}

.search-input:hover,
.search-input:focus {
  outline: none;
  border-bottom-color: var(--ui-accent-primary-fg, var(--accent));
}

.search-input::placeholder {
  color: var(--ui-text-faint-fg, var(--muted));
}

/* Grouping toggle: text actions, active one carries the accent underline */
.grouping-toggle {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-shrink: 0;
}

.toggle-sep {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--ui-text-faint-fg, var(--muted));
}

.toggle-action {
  padding: 4px 0;
}

.toggle-action.is-active {
  color: var(--ui-text-primary-fg, var(--text-primary));
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--ui-accent-primary-fg, var(--accent));
}

.content-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 4px 16px;
}

/* ---- notes / empty ---- */
.ledger-note {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.empty-state {
  padding: 8px 0 16px;
}

.empty-text {
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  margin: 0 0 2px;
}

.empty-hint {
  font-size: 11px;
  color: var(--ui-text-faint-fg, var(--muted));
  margin: 0;
}

/* ---- the ledger rule ---- */
.ledger-body {
  position: relative;
  padding-left: 16px;
}

.ledger-body::before {
  content: '';
  position: absolute;
  left: 3px;
  top: 6px;
  bottom: 6px;
  width: 1px;
  background: color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 72%, transparent);
}

/* ---- groups ---- */
.chat-group {
  margin-bottom: 22px;
}

.chat-group:last-child {
  margin-bottom: 0;
}

.group-header {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: var(--font-weight-semibold, 600);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ui-text-primary-fg, var(--text-primary));
  cursor: pointer;
  user-select: none;
  min-width: 0;
}

.group-header::before {
  content: '';
  position: absolute;
  left: -16px;
  top: 50%;
  width: 10px;
  height: 2px;
  background: var(--ui-border-strong-border, var(--border-strong, var(--border)));
}

.group-header:focus-visible {
  outline: none;
}

.group-header:focus-visible::before,
.group-header:hover::before {
  background: var(--ui-accent-primary-fg, var(--accent));
}

.group-header.collapsed {
  color: var(--ui-text-muted-fg, var(--text-muted));
  margin-bottom: 0;
}

.group-mark {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: var(--font-weight-normal, 400);
  color: var(--ui-text-faint-fg, var(--muted));
  flex-shrink: 0;
  min-width: 10px;
}

.group-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-count {
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  font-weight: var(--font-weight-normal, 400);
  color: var(--ui-text-faint-fg, var(--muted));
  flex-shrink: 0;
}

/* ---- rows ---- */
.chat-list {
  counter-reset: chat-row;
}

.chat-row {
  position: relative;
  counter-increment: chat-row;
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-height: 30px;
  padding: 6px 0;
  border-top: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--border-subtle, var(--border))) 32%, transparent);
  cursor: pointer;
  min-width: 0;
}

.chat-row:first-child {
  border-top: none;
}

/* Tick hanging the row on the rule */
.chat-row::before {
  content: '';
  position: absolute;
  left: -13px;
  top: 50%;
  width: 7px;
  height: 1px;
  background: var(--ui-border-strong-border, var(--border-strong, var(--border)));
  transition: width 0.12s ease, height 0.12s ease, background-color 0.12s ease;
}

.chat-row:hover::before {
  width: 12px;
  background: var(--ui-text-muted-fg, var(--text-muted));
}

.chat-row:focus-visible {
  outline: none;
}

.chat-row.active::before,
.chat-row:focus-visible::before {
  width: 14px;
  height: 2px;
  background: var(--ui-accent-primary-fg, var(--accent));
}

.row-index::before {
  content: counter(chat-row, decimal-leading-zero);
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  color: var(--ui-text-faint-fg, var(--muted));
  flex-shrink: 0;
  min-width: 16px;
  display: inline-block;
}

.chat-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.chat-row.active .chat-name {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.chat-meta {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-shrink: 0;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--ui-text-faint-fg, var(--muted));
  min-width: 0;
  max-width: 55%;
}

.chat-time,
.chat-messages,
.chat-branches {
  white-space: nowrap;
}

.chat-branch {
  color: var(--ui-text-muted-fg, var(--text-muted));
  min-width: 0;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Branch rows sit one step in from the rule */
.chat-row.is-branch {
  padding-left: 16px;
}

/* ---- row actions ---- */
.chat-actions {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.chat-row:hover .chat-actions,
.chat-row:focus-visible .chat-actions,
.chat-actions:focus-within {
  opacity: 1;
}

/* ---- shared text-action ---- */
.text-action {
  appearance: none;
  background: transparent;
  border: none;
  padding: 0;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  cursor: pointer;
  transition: color 0.12s ease;
}

.text-action:hover:not(:disabled) {
  color: var(--ui-text-primary-fg, var(--text-primary));
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--ui-accent-primary-fg, var(--accent));
}

.text-action.is-danger:hover:not(:disabled) {
  color: var(--ui-status-danger-fg, var(--text-error, #b3403a));
  text-decoration-color: var(--ui-status-danger-fg, var(--text-error, #b3403a));
}

.text-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .archived-chats-content {
    animation: none;
  }
}
</style>
