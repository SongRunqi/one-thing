<template>
  <aside :class="['sidebar', 'panel', { collapsed }]">
    <!-- Collapsed State -->
    <template v-if="collapsed">
      <div class="collapsed-content">
        <button class="collapse-btn" @click="emit('toggleCollapse')" title="Expand sidebar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M13 17l5-5-5-5M6 17l5-5-5-5"/>
          </svg>
        </button>

        <button class="icon-btn collapsed-action" title="New chat" @click="createNewSession">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </button>

        <div class="collapsed-sessions">
          <div
            v-for="session in recentSessions"
            :key="session.id"
            :class="['collapsed-session', { active: session.id === sessionsStore.currentSessionId }]"
            :title="session.name || 'New chat'"
            @click="switchSession(session.id)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
          </div>
        </div>

        <div class="collapsed-footer">
          <button class="icon-btn collapsed-action" title="Settings" @click="openSettings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
          </button>
        </div>
      </div>
    </template>

    <!-- Expanded State -->
    <template v-else>
      <div class="sidebar-top">
        <div class="brand-row">
          <div class="brand">
            <div class="brand-mark">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <circle cx="12" cy="12" r="4"/>
              </svg>
            </div>
            <div class="brand-name">ChatGPT</div>
          </div>
          <div class="brand-actions">
            <button class="icon-btn" title="Collapse sidebar" @click="emit('toggleCollapse')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/>
              </svg>
            </button>
            <button class="icon-btn new-chat-btn" title="New chat" @click="createNewSession">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="search pill">
          <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <input v-model="query" class="search-input" placeholder="Search chats..." />
          <button v-if="query" class="clear-search" @click="query = ''">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="sessions-list" role="list">
        <template v-for="group in groupedSessions" :key="group.label">
          <div class="group-header">{{ group.label }}</div>
          <div
            v-for="session in group.sessions"
            :key="session.id"
            :class="[
              'session-item',
              {
                active: session.id === sessionsStore.currentSessionId,
                editing: editingSessionId === session.id,
                branch: session.depth > 0,
                'has-branches': session.hasBranches,
                collapsed: session.isCollapsed,
                'last-child': session.isLastChild,
                hidden: session.isHidden
              }
            ]"
            :style="{ paddingLeft: `${12 + session.depth * 20}px` }"
            @click="handleSessionClickWithToggle(session)"
            @contextmenu.prevent="openContextMenu($event, session)"
          >
            <!-- Branch indicator for child sessions -->
            <div v-if="session.depth > 0" class="branch-indicator">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 3v12"/>
                <path d="M18 9a3 3 0 01-3 3H9"/>
              </svg>
            </div>
            <!-- Expand/Collapse chevron for sessions with branches -->
            <div
              v-if="session.hasBranches"
              class="collapse-chevron"
              :class="{ collapsed: session.isCollapsed }"
              @click.stop="toggleCollapse(session.id)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
            <div class="session-content">
              <!-- Inline editing mode -->
              <input
                v-if="editingSessionId === session.id"
                ref="inlineInputRef"
                v-model="editingName"
                class="session-name-input"
                @click.stop
                @keydown.enter="confirmInlineRename"
                @keydown.esc="cancelInlineRename"
                @blur="confirmInlineRename"
              />
              <span v-else class="session-name">{{ session.name || 'New chat' }}</span>
              <span v-if="editingSessionId !== session.id" class="session-preview">{{ getSessionPreview(session) }}</span>
            </div>
            <div class="session-meta">
              <!-- Show branch count badge when collapsed -->
              <span v-if="session.hasBranches && session.isCollapsed" class="branch-count" :title="`${session.branchCount} branch${session.branchCount > 1 ? 'es' : ''}`">
                +{{ session.branchCount }}
              </span>
              <span class="session-time">{{ formatRelativeTime(session.updatedAt) }}</span>
              <div class="session-actions">
                <button
                  class="session-action-btn"
                  title="Rename"
                  @click.stop="startInlineRename(session)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button
                  :class="['session-action-btn', 'danger', { 'confirm-delete': pendingDeleteId === session.id }]"
                  :title="pendingDeleteId === session.id ? 'Click again to confirm' : 'Delete'"
                  @click.stop="deleteSessionById(session.id)"
                >
                  <svg v-if="pendingDeleteId !== session.id" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                  </svg>
                  <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M5 13l4 4L19 7"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </template>

        <div v-if="filteredSessions.length === 0" class="empty-sessions">
          <span v-if="query">No chats found</span>
          <span v-else>No chats yet</span>
        </div>
      </div>

      <!-- Context Menu -->
      <Teleport to="body">
        <div
          v-if="contextMenu.show"
          class="context-menu"
          :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
          @click.stop
        >
          <button class="context-item" @click="handleRename">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Rename
          </button>
          <button class="context-item" @click="handlePin">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2v20M2 12h20"/>
            </svg>
            Pin
          </button>
          <div class="context-divider"></div>
          <button class="context-item danger" @click="handleDelete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
            Delete
          </button>
        </div>
        <div v-if="contextMenu.show" class="context-overlay" @click="closeContextMenu"></div>
      </Teleport>

      <div class="sidebar-footer">
        <div class="footer-profile" @click="toggleUserMenu">
          <div class="avatar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div class="profile-text">
            <div class="profile-name">You</div>
            <div class="profile-stats">{{ totalChats }} chats</div>
          </div>
          <svg class="profile-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </div>

        <!-- User Menu Dropdown -->
        <div v-if="showUserMenu" class="user-menu">
          <button class="user-menu-item" @click="openSettings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
            Settings
          </button>
          <button class="user-menu-item" @click="clearAllChats">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
            Clear all chats
          </button>
        </div>
      </div>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import type { ChatSession } from '@/types'

interface Props {
  collapsed?: boolean
}

withDefaults(defineProps<Props>(), {
  collapsed: false,
})

const emit = defineEmits<{
  openSettings: []
  toggleCollapse: []
}>()

const sessionsStore = useSessionsStore()
const showUserMenu = ref(false)
const query = ref('')
const inlineInputRef = ref<HTMLInputElement | null>(null)

// Context menu state
const contextMenu = ref({
  show: false,
  x: 0,
  y: 0,
  session: null as ChatSession | null,
})

// Inline editing state
const editingSessionId = ref<string | null>(null)
const editingName = ref('')

// Delete confirmation state - stores session ID pending deletion
const pendingDeleteId = ref<string | null>(null)
let deleteConfirmTimer: ReturnType<typeof setTimeout> | null = null

// Collapsed parent sessions state (stores parent session IDs that are collapsed)
const collapsedParents = ref<Set<string>>(new Set())

// Track if initial collapse has been done
const initialCollapseApplied = ref(false)

// Track clicks for manual double-click detection
// This is needed because DOM updates break native double-click detection
const lastClickInfo = ref<{ sessionId: string; time: number } | null>(null)
const DOUBLE_CLICK_THRESHOLD = 400 // milliseconds

// Check if a session has branches
function hasBranches(sessionId: string): boolean {
  return sessionsStore.sessions.some(s => s.parentSessionId === sessionId)
}

// Initialize collapsed state - collapse all parent sessions on startup
function initializeCollapsedState() {
  if (initialCollapseApplied.value) return

  const parentsWithBranches = sessionsStore.sessions
    .filter(s => !s.parentSessionId) // Root sessions only
    .filter(s => hasBranches(s.id))
    .map(s => s.id)

  if (parentsWithBranches.length > 0) {
    collapsedParents.value = new Set(parentsWithBranches)
    initialCollapseApplied.value = true
  }
}

// Watch for sessions to be loaded and apply initial collapse
watch(
  () => sessionsStore.sessions.length,
  (newLength) => {
    if (newLength > 0 && !initialCollapseApplied.value) {
      initializeCollapsedState()
    }
  },
  { immediate: true }
)

// Toggle collapse state for a parent session
function toggleCollapse(sessionId: string) {
  if (collapsedParents.value.has(sessionId)) {
    collapsedParents.value.delete(sessionId)
  } else {
    collapsedParents.value.add(sessionId)
  }
  // Trigger reactivity
  collapsedParents.value = new Set(collapsedParents.value)
}

// Check if a session is collapsed
function isCollapsed(sessionId: string): boolean {
  return collapsedParents.value.has(sessionId)
}

// Get the root parent ID for a session (for checking if any ancestor is collapsed)
function getRootParentId(session: ChatSession): string | null {
  let current = session
  while (current.parentSessionId) {
    const parent = sessionsStore.sessions.find(s => s.id === current.parentSessionId)
    if (!parent) break
    current = parent
  }
  return current.id !== session.id ? current.id : null
}

// Check if any ancestor of a session is collapsed
function isAncestorCollapsed(session: ChatSession): boolean {
  let current = session
  while (current.parentSessionId) {
    if (collapsedParents.value.has(current.parentSessionId)) {
      return true
    }
    const parent = sessionsStore.sessions.find(s => s.id === current.parentSessionId)
    if (!parent) break
    current = parent
  }
  return false
}

const filteredSessions = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return sessionsStore.sessions
  return sessionsStore.sessions.filter((s) => (s.name || '').toLowerCase().includes(q))
})

const totalChats = computed(() => sessionsStore.sessions.length)

// Get recent sessions for collapsed view
const recentSessions = computed(() => {
  return sessionsStore.sessions.slice(0, 8)
})

// Check if a session is a branch
function isBranch(session: ChatSession): boolean {
  return !!session.parentSessionId
}

// Get branch depth (how deep the branch is)
function getBranchDepth(session: ChatSession): number {
  let depth = 0
  let current = session
  while (current.parentSessionId) {
    depth++
    const parent = sessionsStore.sessions.find(s => s.id === current.parentSessionId)
    if (!parent) break
    current = parent
  }
  return depth
}

// Organize sessions with their branches
interface SessionWithBranches extends ChatSession {
  branches: SessionWithBranches[]
  depth: number
  hasBranches: boolean
  isCollapsed: boolean
  isLastChild: boolean
  branchCount: number
  isHidden: boolean  // Whether this session should be hidden (parent is collapsed)
}

function organizeSessionsWithBranches(sessions: ChatSession[]): SessionWithBranches[] {
  const sessionMap = new Map<string, SessionWithBranches>()
  const rootSessions: SessionWithBranches[] = []

  // First pass: create SessionWithBranches objects
  for (const session of sessions) {
    sessionMap.set(session.id, {
      ...session,
      branches: [],
      depth: 0,
      hasBranches: false,
      isCollapsed: collapsedParents.value.has(session.id),
      isLastChild: false,
      branchCount: 0,
      isHidden: false,
    })
  }

  // Second pass: organize into hierarchy
  for (const session of sessions) {
    const withBranches = sessionMap.get(session.id)!
    if (session.parentSessionId) {
      const parent = sessionMap.get(session.parentSessionId)
      if (parent) {
        withBranches.depth = getBranchDepth(session)
        parent.branches.push(withBranches)
        parent.hasBranches = true
      } else {
        // Parent not in filtered list, show as root
        rootSessions.push(withBranches)
      }
    } else {
      rootSessions.push(withBranches)
    }
  }

  // Third pass: mark last children and count branches
  function markLastChildren(sessions: SessionWithBranches[]) {
    for (const session of sessions) {
      session.branchCount = session.branches.length
      if (session.branches.length > 0) {
        session.branches[session.branches.length - 1].isLastChild = true
        markLastChildren(session.branches)
      }
    }
  }
  markLastChildren(rootSessions)

  // Flatten hierarchy for display
  // Always include all sessions, but mark hidden ones with isHidden flag
  // This keeps DOM stable for proper mouse event handling
  function flattenWithBranches(sessions: SessionWithBranches[], parentCollapsed: boolean = false): SessionWithBranches[] {
    const result: SessionWithBranches[] = []
    for (const session of sessions) {
      session.isHidden = parentCollapsed
      result.push(session)
      // Always include branches, but mark them as hidden if parent is collapsed
      if (session.branches.length > 0) {
        const shouldHideChildren = parentCollapsed || session.isCollapsed
        result.push(...flattenWithBranches(session.branches, shouldHideChildren))
      }
    }
    return result
  }

  return flattenWithBranches(rootSessions)
}

// Group sessions by time
const groupedSessions = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStart = today.getTime()

  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStart = yesterday.getTime()

  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 7)
  const weekAgoStart = weekAgo.getTime()

  const groups: { label: string; sessions: SessionWithBranches[] }[] = [
    { label: 'Today', sessions: [] },
    { label: 'Yesterday', sessions: [] },
    { label: 'Previous 7 Days', sessions: [] },
    { label: 'Older', sessions: [] },
  ]

  // Get organized sessions (with branches nested under parents)
  const organizedSessions = organizeSessionsWithBranches(filteredSessions.value)

  for (const session of organizedSessions) {
    // Use root session time for grouping
    const time = session.updatedAt
    if (time >= todayStart) {
      groups[0].sessions.push(session)
    } else if (time >= yesterdayStart) {
      groups[1].sessions.push(session)
    } else if (time >= weekAgoStart) {
      groups[2].sessions.push(session)
    } else {
      groups[3].sessions.push(session)
    }
  }

  return groups.filter((g) => g.sessions.length > 0)
})

function getSessionPreview(session: ChatSession): string {
  if (!session.messages || session.messages.length === 0) {
    return 'No messages yet'
  }
  const lastMessage = session.messages[session.messages.length - 1]
  const preview = lastMessage.content.slice(0, 50)
  return preview.length < lastMessage.content.length ? preview + '...' : preview
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`

  const date = new Date(timestamp)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

async function createNewSession() {
  await sessionsStore.createSession('')
}

function handleSessionClick(sessionId: string) {
  // Don't switch if we're editing
  if (editingSessionId.value) return
  switchSession(sessionId)
}

// Handle session click - check for double-click to toggle collapse
function handleSessionClickWithToggle(session: SessionWithBranches) {
  // Don't switch if we're editing
  if (editingSessionId.value) return

  const now = Date.now()
  const lastClick = lastClickInfo.value

  // Check if this is a double-click (same session clicked within threshold)
  if (lastClick && lastClick.sessionId === session.id && (now - lastClick.time) < DOUBLE_CLICK_THRESHOLD) {
    // Double-click detected - toggle collapse
    lastClickInfo.value = null // Reset click tracking

    if (session.hasBranches) {
      // Parent session: toggle its own collapse state
      toggleCollapse(session.id)
    } else if (session.parentSessionId) {
      // Child session: collapse its parent
      toggleCollapse(session.parentSessionId)
    }
    return // Don't switch session on double-click
  }

  // Single click - record it and switch session
  lastClickInfo.value = { sessionId: session.id, time: now }
  switchSession(session.id)
}

async function switchSession(sessionId: string) {
  await sessionsStore.switchSession(sessionId)
}

function openContextMenu(event: MouseEvent, session: ChatSession) {
  contextMenu.value = {
    show: true,
    x: event.clientX,
    y: event.clientY,
    session,
  }
}

function closeContextMenu() {
  contextMenu.value.show = false
}

// Inline rename functions
function startInlineRename(session: ChatSession) {
  editingSessionId.value = session.id
  editingName.value = session.name || ''
  nextTick(() => {
    const input = inlineInputRef.value
    if (Array.isArray(input)) {
      input[0]?.focus()
      input[0]?.select()
    } else if (input) {
      input.focus()
      input.select()
    }
  })
}

function cancelInlineRename() {
  editingSessionId.value = null
  editingName.value = ''
}

async function confirmInlineRename() {
  if (!editingSessionId.value) return
  const newName = editingName.value.trim()
  if (newName) {
    await sessionsStore.renameSession(editingSessionId.value, newName)
  }
  editingSessionId.value = null
  editingName.value = ''
}

function handleRename() {
  if (!contextMenu.value.session) return
  startInlineRename(contextMenu.value.session)
  closeContextMenu()
}

function handlePin() {
  console.log('Pin session:', contextMenu.value.session?.id)
  closeContextMenu()
}

async function deleteSessionById(sessionId: string) {
  // If already pending deletion for this session, confirm delete
  if (pendingDeleteId.value === sessionId) {
    if (deleteConfirmTimer) {
      clearTimeout(deleteConfirmTimer)
      deleteConfirmTimer = null
    }
    pendingDeleteId.value = null
    await sessionsStore.deleteSession(sessionId)
    return
  }

  // First click - set pending state
  pendingDeleteId.value = sessionId

  // Auto-reset after 3 seconds if not confirmed
  if (deleteConfirmTimer) {
    clearTimeout(deleteConfirmTimer)
  }
  deleteConfirmTimer = setTimeout(() => {
    pendingDeleteId.value = null
    deleteConfirmTimer = null
  }, 3000)
}

async function handleDelete() {
  if (!contextMenu.value.session) return
  await deleteSessionById(contextMenu.value.session.id)
  closeContextMenu()
}

function openSettings() {
  emit('openSettings')
  showUserMenu.value = false
}

function toggleUserMenu() {
  showUserMenu.value = !showUserMenu.value
}

async function clearAllChats() {
  if (confirm('Are you sure you want to delete all chats? This cannot be undone.')) {
    for (const session of sessionsStore.sessions) {
      await sessionsStore.deleteSession(session.id)
    }
  }
  showUserMenu.value = false
}

function handleOutsideClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.footer-profile') && !target.closest('.user-menu')) {
    showUserMenu.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleOutsideClick)
  // Clean up delete confirmation timer
  if (deleteConfirmTimer) {
    clearTimeout(deleteConfirmTimer)
    deleteConfirmTimer = null
  }
})
</script>

<style scoped>
.sidebar {
  width: 300px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  transition: width 0.2s ease;
}

.sidebar.collapsed {
  width: 60px;
}

/* Collapsed State Styles */
.collapsed-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  height: 100%;
  gap: 8px;
}

.collapse-btn {
  width: 44px;
  height: 44px;
  border: none;
  background: transparent;
  border-radius: 10px;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  margin-bottom: 8px;
}

.collapse-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.collapsed-action {
  width: 44px;
  height: 44px;
  border-radius: 10px;
}

.collapsed-sessions {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  width: 100%;
}

.collapsed-session {
  width: 44px;
  height: 44px;
  margin: 0 auto;
  border-radius: 10px;
  border: 1px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--muted);
  transition: all 0.15s ease;
}

.collapsed-session:hover {
  background: var(--hover);
  border-color: var(--border);
  color: var(--text);
}

.collapsed-session.active {
  background: rgba(16, 163, 127, 0.12);
  border-color: rgba(16, 163, 127, 0.25);
  color: var(--accent);
}

.collapsed-footer {
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

/* Expanded State Styles */
.sidebar-top {
  padding: 14px 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-bottom: 1px solid var(--border);
}

.brand-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  user-select: none;
}

.brand-mark {
  height: 32px;
  width: 32px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--accent) 0%, #0d8a6a 100%);
  color: white;
}

.brand-name {
  font-weight: 650;
  font-size: 15px;
  letter-spacing: 0.2px;
}

.brand-actions {
  display: flex;
  gap: 4px;
}

.new-chat-btn {
  background: var(--accent);
  color: white;
  border-radius: 10px;
}

.new-chat-btn:hover {
  background: #0d8a6a;
}

.search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  position: relative;
}

.search-icon {
  color: var(--muted);
  flex-shrink: 0;
}

.search-input {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: var(--text);
}

.search-input::placeholder {
  color: var(--muted);
}

.clear-search {
  padding: 4px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.clear-search:hover {
  color: var(--text);
}

.sessions-list {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: 8px;
}

.group-header {
  padding: 8px 10px 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.session-item {
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease, opacity 0.2s ease, max-height 0.25s ease, padding 0.25s ease, margin 0.25s ease;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 2px;
  user-select: none;
  -webkit-user-select: none;
  max-height: 100px;
  opacity: 1;
  overflow: hidden;
}

/* Hidden sessions (parent is collapsed) - animate collapse */
.session-item.hidden {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin-bottom: 0;
  border-width: 0;
  pointer-events: none;
}

.session-item:hover {
  background: var(--hover);
  border-color: var(--border);
}

.session-item.active {
  background: rgba(16, 163, 127, 0.12);
  border-color: rgba(16, 163, 127, 0.25);
}

/* Parent session with branches - keep same style as normal sessions */
.session-item.has-branches {
  /* No special styling - same as regular sessions */
}

/* Branch (child) session styles - subtle distinction */
.session-item.branch {
  /* Inherits normal session styles, just has padding-left via inline style */
}

/* Branch indicator icon - subtle visual cue */
.branch-indicator {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin-right: 4px;
  color: var(--muted);
  opacity: 0.5;
}

.session-item.branch:hover .branch-indicator,
.session-item.branch.active .branch-indicator {
  opacity: 0.8;
}

/* Branch count badge */
.branch-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  font-size: 10px;
  font-weight: 600;
  color: var(--accent);
  background: rgba(16, 163, 127, 0.15);
  border-radius: 9px;
  margin-right: 6px;
}

/* Collapse chevron - indicates expand/collapse state */
.collapse-chevron {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 6px;
  color: var(--muted);
  transition: all 0.15s ease;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  cursor: pointer;
}

.collapse-chevron:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
}

.collapse-chevron svg {
  transition: transform 0.15s ease;
}

.collapse-chevron.collapsed svg {
  transform: rotate(-90deg);
}

.session-item:hover .collapse-chevron {
  color: var(--text);
}

/* Branch sessions use same text styling as regular sessions */

.session-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.session-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 500;
}

.session-name-input {
  width: 100%;
  padding: 2px 6px;
  margin: -2px -6px;
  border: 1px solid var(--accent);
  border-radius: 4px;
  background: var(--panel-2);
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  outline: none;
}

.session-item.editing {
  background: var(--hover);
  border-color: var(--border);
}

.session-item.editing .session-actions {
  display: none;
}

.session-item.editing .session-time {
  display: block;
}

.session-preview {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-meta {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  position: relative;
}

.session-time {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
}

.session-actions {
  display: flex;
  gap: 2px;
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0;
  transition: opacity 0.15s ease;
  background: inherit;
}

.session-item:hover .session-actions {
  opacity: 1;
}

.session-item:hover .session-time {
  visibility: hidden;
}

/* Keep branch count visible on hover */
.session-item:hover .branch-count {
  visibility: visible;
}

.session-action-btn {
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.session-action-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.session-action-btn.danger:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

/* Confirm delete state - highlighted with animation */
.session-action-btn.confirm-delete {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
  animation: pulse-delete 1s ease-in-out infinite;
}

@keyframes pulse-delete {
  0%, 100% {
    background: rgba(239, 68, 68, 0.2);
  }
  50% {
    background: rgba(239, 68, 68, 0.35);
  }
}

.empty-sessions {
  padding: 20px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}

/* Context Menu */
.context-menu {
  position: fixed;
  z-index: 1000;
  min-width: 160px;
  padding: 6px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.context-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  text-align: left;
  transition: background 0.1s ease;
}

.context-item:hover {
  background: var(--hover);
}

.context-item.danger {
  color: #ef4444;
}

.context-item.danger:hover {
  background: rgba(239, 68, 68, 0.1);
}

.context-divider {
  height: 1px;
  background: var(--border);
  margin: 4px 0;
}

.context-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
}

/* Footer */
.sidebar-footer {
  padding: 12px;
  border-top: 1px solid var(--border);
  position: relative;
}

.footer-profile {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--panel-2);
  cursor: pointer;
  transition: all 0.15s ease;
}

.footer-profile:hover {
  background: var(--hover);
  border-color: rgba(255, 255, 255, 0.12);
}

.avatar {
  height: 36px;
  width: 36px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, var(--accent) 0%, #0d8a6a 100%);
  color: white;
}

.profile-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.profile-name {
  font-size: 13px;
  font-weight: 600;
}

.profile-stats {
  font-size: 12px;
  color: var(--muted);
}

.profile-chevron {
  color: var(--muted);
  transition: transform 0.2s ease;
}

.footer-profile:hover .profile-chevron {
  transform: translateY(2px);
}

/* User Menu */
.user-menu {
  position: absolute;
  bottom: 100%;
  left: 12px;
  right: 12px;
  margin-bottom: 8px;
  padding: 6px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.user-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  text-align: left;
  transition: background 0.1s ease;
}

.user-menu-item:hover {
  background: var(--hover);
}
</style>
