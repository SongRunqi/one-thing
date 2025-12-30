<template>
  <div class="archived-chats-content">
    <!-- Header -->
    <div class="content-header">
      <input
        v-model="searchQuery"
        type="text"
        class="search-input"
        placeholder="Search archived chats..."
      />
      <!-- Grouping Mode Toggle -->
      <div class="grouping-toggle">
        <button
          class="toggle-btn"
          :class="{ active: groupingMode === 'date' }"
          @click="groupingMode = 'date'"
          title="Group by date"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </button>
        <button
          class="toggle-btn"
          :class="{ active: groupingMode === 'branch' }"
          @click="groupingMode = 'branch'"
          title="Group by branch"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="6" y1="3" x2="6" y2="15"/>
            <circle cx="18" cy="6" r="3"/>
            <circle cx="6" cy="18" r="3"/>
            <path d="M18 9a9 9 0 0 1-9 9"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Archived Chats List -->
    <div class="content-body">
      <!-- Loading State -->
      <div v-if="sessionsStore.isLoading" class="loading-state">
        <div class="loading-spinner"></div>
        <p>Loading archived chats...</p>
      </div>

      <!-- Grouped Chats -->
      <template v-else-if="groupedChats.length > 0">
        <div v-for="(group, index) in groupedChats" :key="`${group.label}-${group.sessions[0]?.id || index}`" class="chat-group">
          <h4
            class="group-title"
            :class="{ collapsed: collapsedGroups.has(group.label) }"
            @click="toggleGroup(group.label)"
          >
            <!-- Chevron icon -->
            <svg
              class="group-chevron"
              :class="{ collapsed: collapsedGroups.has(group.label) }"
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
            <!-- Date icon -->
            <svg v-if="groupingMode === 'date'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <!-- Branch icon for parent sessions -->
            <svg v-else-if="group.isParent" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <!-- Branch icon for branch groups -->
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="6" y1="3" x2="6" y2="15"/>
              <circle cx="18" cy="6" r="3"/>
              <circle cx="6" cy="18" r="3"/>
              <path d="M18 9a9 9 0 0 1-9 9"/>
            </svg>
            {{ group.label }}
            <span class="group-count">{{ group.sessions.length }}</span>
          </h4>
          <div v-show="!collapsedGroups.has(group.label)" class="chat-list">
            <div
              v-for="session in group.sessions"
              :key="session.id"
              class="chat-card"
              :class="{
                active: sessionsStore.currentSessionId === session.id,
                'is-branch': session.parentSessionId
              }"
              @click="viewChat(session)"
            >
              <div class="chat-icon" :class="{ 'branch-icon': session.parentSessionId }">
                <!-- Branch icon -->
                <svg v-if="session.parentSessionId" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="6" y1="3" x2="6" y2="15"/>
                  <circle cx="18" cy="6" r="3"/>
                  <circle cx="6" cy="18" r="3"/>
                  <path d="M18 9a9 9 0 0 1-9 9"/>
                </svg>
                <!-- Chat icon -->
                <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <div class="chat-info">
                <h5 class="chat-name">{{ session.name || 'Untitled Chat' }}</h5>
                <p class="chat-meta">
                  <!-- Branch parent indicator -->
                  <span v-if="session.parentSessionId" class="chat-branch">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="15 18 9 12 15 6"/>
                    </svg>
                    {{ getParentName(session.parentSessionId) }}
                  </span>
                  <span v-else class="chat-time">{{ formatTime(session.archivedAt || session.updatedAt) }}</span>
                  <span v-if="session.messages?.length" class="chat-messages">
                    {{ session.messages.length }} messages
                  </span>
                  <!-- Show branch count if has children -->
                  <span v-if="getBranchCount(session.id) > 0" class="chat-branches">
                    {{ getBranchCount(session.id) }} branch{{ getBranchCount(session.id) > 1 ? 'es' : '' }}
                  </span>
                </p>
              </div>
              <div class="chat-actions">
                <button class="action-btn" @click.stop="restoreChat(session)" title="Restore">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="1 4 1 10 7 10"/>
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                  </svg>
                </button>
                <button class="action-btn danger" @click.stop="confirmDelete(session)" title="Delete permanently">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Empty State -->
      <div v-else class="empty-state">
        <div class="empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <polyline points="21 8 21 21 3 21 3 8"/>
            <rect x="1" y="3" width="22" height="5"/>
            <line x1="10" y1="12" x2="14" y2="12"/>
          </svg>
        </div>
        <p class="empty-text">No archived chats</p>
        <p class="empty-hint">Deleted chats will appear here</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import type { ChatSession } from '@/types'

const sessionsStore = useSessionsStore()
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

// Group sessions by date
function groupByDate(sessions: ChatSession[]): { label: string; sessions: ChatSession[]; isParent?: boolean }[] {
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

  const groups: { label: string; sessions: ChatSession[]; isParent?: boolean }[] = [
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
function groupByBranch(sessions: ChatSession[]): { label: string; sessions: ChatSession[]; isParent?: boolean }[] {
  if (sessions.length === 0) return []

  const groups: { label: string; sessions: ChatSession[]; isParent?: boolean }[] = []

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
    function findBranches(parentId: string): ChatSession[] {
      const directBranches = sessions.filter(s => s.parentSessionId === parentId)
      let allBranches: ChatSession[] = [...directBranches]
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
async function viewChat(session: ChatSession) {
  await sessionsStore.switchSession(session.id)
}

// Restore chat from archive
async function restoreChat(session: ChatSession) {
  await sessionsStore.restoreSession(session.id)
}

// Confirm and permanently delete chat
async function confirmDelete(session: ChatSession) {
  const confirmed = confirm(`Permanently delete "${session.name || 'Untitled Chat'}"? This cannot be undone.`)
  if (confirmed) {
    await sessionsStore.permanentlyDeleteSession(session.id)
  }
}
</script>

<style scoped>
.archived-chats-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.content-header {
  padding: 16px;
  display: flex;
  gap: 10px;
  align-items: center;
}

.search-input {
  flex: 1;
  padding: 10px 14px;
  font-size: 14px;
  color: var(--text);
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: 10px;
  transition: all 0.15s ease;
}

.search-input:focus {
  outline: none;
  border-color: var(--accent);
}

.search-input::placeholder {
  color: var(--muted);
}

/* Grouping Toggle */
.grouping-toggle {
  display: flex;
  gap: 2px;
  padding: 3px;
  background: var(--hover);
  border-radius: 8px;
}

.toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.toggle-btn:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.06);
}

html[data-theme='light'] .toggle-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

.toggle-btn.active {
  color: var(--accent);
  background: var(--bg-elevated);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.content-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 16px;
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--muted);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Chat Groups */
.chat-group {
  margin-bottom: 24px;
}

.group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 12px;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.group-title:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
}

html[data-theme='light'] .group-title:hover {
  background: rgba(0, 0, 0, 0.04);
}

.group-title.collapsed {
  margin-bottom: 8px;
}

.group-chevron {
  flex-shrink: 0;
  opacity: 0.5;
  transition: transform 0.2s ease;
}

.group-chevron.collapsed {
  transform: rotate(-90deg);
}

.group-count {
  font-size: 10px;
  font-weight: 500;
  color: var(--muted);
  background: rgba(255, 255, 255, 0.06);
  padding: 2px 6px;
  border-radius: 10px;
  margin-left: auto;
}

html[data-theme='light'] .group-count {
  background: rgba(0, 0, 0, 0.06);
}

/* Chat List */
.chat-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--hover);
  border: 1px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.chat-card:hover {
  background: var(--active);
  border-color: var(--border);
}

.chat-card.active {
  background: rgba(var(--accent-rgb), 0.1);
  border-color: var(--accent);
}

.chat-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--active);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--muted);
}

.chat-info {
  flex: 1;
  min-width: 0;
}

.chat-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  margin: 0 0 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--muted);
  margin: 0;
}

.chat-time {
  opacity: 0.8;
}

.chat-messages::before {
  content: '·';
  margin-right: 8px;
}

.chat-branch {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--accent);
  font-size: 11px;
}

.chat-branch svg {
  opacity: 0.7;
}

.chat-branches {
  color: var(--muted);
  opacity: 0.8;
}

.chat-branches::before {
  content: '·';
  margin-right: 8px;
}

/* Branch styling */
.chat-card.is-branch {
  margin-left: 16px;
  border-left: 2px solid rgba(var(--accent-rgb), 0.3);
}

.chat-icon.branch-icon {
  background: rgba(var(--accent-rgb), 0.1);
  color: var(--accent);
}

/* Chat Actions */
.chat-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.chat-card:hover .chat-actions {
  opacity: 1;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.action-btn.danger:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-icon {
  color: var(--muted);
  opacity: 0.5;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 15px;
  font-weight: 500;
  color: var(--text);
  margin: 0 0 4px;
}

.empty-hint {
  font-size: 13px;
  color: var(--muted);
  margin: 0;
}
</style>
