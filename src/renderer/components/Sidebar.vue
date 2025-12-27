<template>
  <aside
    :class="['sidebar', { collapsed, floating, 'floating-closing': floatingClosing, resizing: isResizing }]"
    :style="sidebarStyle"
  >
    <div class="sidebar-content">
      <!-- Expanded State (only shown when not collapsed) -->
      <template v-if="!collapsed">
      <!-- Sidebar Header: Traffic lights space + Search + New Chat -->
      <div class="sidebar-header">
        <div class="traffic-lights-row">
          <div class="traffic-lights-space"></div>
          <button
            class="sidebar-toggle-btn"
            title="Hide sidebar"
            @click="$emit('toggleCollapse')"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="9" y1="3" x2="9" y2="21"/>
            </svg>
          </button>
        </div>
        <div class="sidebar-actions">
          <div class="search-wrapper">
            <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              v-model="localSearchQuery"
              type="text"
              class="search-input"
              placeholder="Search..."
              @keydown.escape="localSearchQuery = ''"
            />
          </div>
        </div>
      </div>

      <!-- Agent Grid at top -->
      <AgentGrid
        v-if="agentsStore.pinnedAgents.length > 0"
        @edit-agent="(agent) => $emit('edit-agent', agent)"
        @open-create-dialog="$emit('open-agent-dialog')"
      />

      <!-- Top scroll indicator line -->
      <div :class="['scroll-indicator-top', { visible: isSessionsOverflowing }]"></div>
      <div
        ref="sessionsListRef"
        class="sessions-list"
        role="list"
        @scroll="checkSessionsOverflow"
      >
        <!-- New Chat item - always at top -->
        <div
          class="session-item new-chat-item"
          @click="$emit('create-new-chat')"
        >
          <svg class="new-chat-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          <span class="session-name">New Chat</span>
        </div>

        <!-- Flat session list sorted by updatedAt -->
        <div
          v-for="session in flatSessions"
          :key="session.id"
          :class="[
            'session-item',
            {
              active: session.id === sessionsStore.currentSessionId,
              generating: session.id === chatStore.generatingSessionId,
              pinned: session.isPinned,
              editing: editingSessionId === session.id,
              branch: session.depth > 0,
              hidden: session.isHidden
            }
          ]"
          :style="{ paddingLeft: `${12 + session.depth * 16}px` }"
          :title="session.name || 'New chat'"
          @click="handleSessionClickWithToggle(session)"
          @contextmenu.prevent="openContextMenu($event, session)"
        >
          <!-- Collapse/Expand toggle for parent sessions -->
          <button
            v-if="session.hasBranches"
            class="collapse-btn"
            :class="{ collapsed: session.isCollapsed }"
            @click.stop="toggleCollapse(session.id)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          <!-- Branch indicator -->
          <span v-if="session.depth > 0" class="branch-indicator">↳</span>

          <!-- Generating indicator -->
          <div v-if="session.id === chatStore.generatingSessionId" class="generating-dot"></div>

          <!-- Pin indicator -->
          <svg v-if="session.isPinned && session.depth === 0" class="pin-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M12 2v8M7 10h10M9 10v7l-2 3h10l-2-3v-7"/>
          </svg>

          <!-- Agent avatar or chat icon -->
          <span v-if="getSessionAgent(session)?.avatar.type === 'emoji'" class="session-agent-avatar">
            {{ getSessionAgent(session)?.avatar.value }}
          </span>
          <img
            v-else-if="getSessionAgent(session)"
            :src="'file://' + getSessionAgent(session)?.avatar.value"
            class="session-agent-img"
            alt=""
          />

          <!-- Session name -->
          <input
            v-if="editingSessionId === session.id"
            ref="inlineInputRef"
            v-model="editingName"
            class="session-name-input"
            maxlength="50"
            @click.stop
            @keydown.enter="confirmInlineRename"
            @keydown.esc="cancelInlineRename"
            @blur="confirmInlineRename"
          />
          <span v-else class="session-name" @click.stop="startInlineRename(session)">{{ session.name || 'New chat' }}</span>

          <!-- Session time -->
          <span v-if="editingSessionId !== session.id" class="session-time">{{ formatSessionTime(session.updatedAt) }}</span>

          <!-- Hover actions -->
          <div class="session-actions">
            <button
              :class="['action-btn', 'danger', { 'confirm': pendingDeleteId === session.id }]"
              :title="getDeleteTitle(session)"
              @click.stop="deleteSessionById(session.id)"
            >
              <svg v-if="pendingDeleteId !== session.id" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
              <template v-else>
                <span v-if="session.hasBranches" class="delete-count">{{ session.branchCount + 1 }}</span>
                <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M5 13l4 4L19 7"/>
                </svg>
              </template>
            </button>
          </div>
        </div>

        <div v-if="sessionsStore.sessions.length === 0" class="empty-sessions">
          <span>No chats yet</span>
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
              <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
            </svg>
            Rename
          </button>
          <button class="context-item" @click="handlePin">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>
            </svg>
            {{ contextMenu.session?.isPinned ? 'Unpin' : 'Pin' }}
          </button>
          <div class="context-divider"></div>
          <button class="context-item danger" @click="handleDelete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
            Close
          </button>
        </div>
        <div v-if="contextMenu.show" class="context-overlay" @click="closeContextMenu"></div>
      </Teleport>

      <!-- Workspace Switcher -->
      <WorkspaceSwitcher
        :media-panel-open="mediaPanelOpen"
        :show-separator="hasContentBelow"
        @toggle-media-panel="$emit('toggle-media-panel')"
        @open-create-dialog="$emit('open-workspace-dialog')"
        @open-agent-dialog="$emit('open-agent-dialog')"
        @edit-workspace="(workspace) => $emit('edit-workspace', workspace)"
      />
    </template>
    </div>

    <!-- Resize Handle -->
    <div
      class="resize-handle"
      @mousedown="startResize"
    ></div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { useSettingsStore } from '@/stores/settings'
import { useChatStore } from '@/stores/chat'
import { useAgentsStore } from '@/stores/agents'
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher.vue'
import AgentGrid from '@/components/AgentGrid.vue'
import type { ChatSession, Workspace, Agent } from '@/types'

interface Props {
  collapsed?: boolean
  floating?: boolean
  floatingClosing?: boolean
  noTransition?: boolean
  mediaPanelOpen?: boolean
  width?: number
}

const props = withDefaults(defineProps<Props>(), {
  collapsed: false,
  floating: false,
  floatingClosing: false,
  noTransition: false,
  width: 300,
})

// Make collapsed and floating available in template
const collapsed = computed(() => props.collapsed)
const floating = computed(() => props.floating)
const floatingClosing = computed(() => props.floatingClosing)

// Computed style for sidebar - floating mode keeps 0 width in layout (overlay handles display)
const sidebarStyle = computed(() => {
  // When floating, force width to 0 (the CSS .floating class handles the visual width)
  if (floating.value || floatingClosing.value) {
    return {
      width: '0',
      maxWidth: '0',
      transition: 'none'
    }
  }

  // Normal mode
  return {
    width: collapsed.value ? '0' : props.width + 'px',
    maxWidth: collapsed.value ? '0' : props.width + 'px',
    transition: props.noTransition ? 'none' : undefined
  }
})

const emit = defineEmits<{
  toggleCollapse: []
  'toggle-media-panel': []
  'open-workspace-dialog': []
  'edit-workspace': [workspace: Workspace]
  'open-agent-dialog': []
  'edit-agent': [agent: Agent]
  'create-new-chat': []
  'open-search': []
  'resize': [width: number]
}>()

const sessionsStore = useSessionsStore()
const settingsStore = useSettingsStore()
const chatStore = useChatStore()
const agentsStore = useAgentsStore()

// Sidebar width management
const actualWidth = computed(() => props.width)
const isResizing = ref(false)
const startX = ref(0)
const startWidth = ref(0)

function startResize(event: MouseEvent) {
  isResizing.value = true
  startX.value = event.clientX
  startWidth.value = props.width
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function handleResize(event: MouseEvent) {
  if (!isResizing.value) return
  const delta = event.clientX - startX.value
  const newWidth = Math.min(500, Math.max(200, startWidth.value + delta))
  emit('resize', newWidth)
}

function stopResize() {
  isResizing.value = false
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

// Local search query for filtering sessions
const localSearchQuery = ref('')

// Get the agent for a session (if it has one)
function getSessionAgent(session: ChatSession) {
  if (!session.agentId) return null
  return agentsStore.agents.find(a => a.id === session.agentId) || null
}

// Computed animation speed from settings
const animationSpeed = computed(() => {
  return settingsStore.settings.general?.animationSpeed ?? 0.25
})
const inlineInputRef = ref<HTMLInputElement | null>(null)
const sessionsListRef = ref<HTMLElement | null>(null)
const isSessionsOverflowing = ref(false)  // Content scrolled above (for top line)
const hasContentBelow = ref(false)  // Content below viewport (for bottom line)
let mutationObserver: MutationObserver | null = null
let resizeObserver: ResizeObserver | null = null

// Check scroll state for both top and bottom separators
function checkSessionsOverflow() {
  if (sessionsListRef.value) {
    const el = sessionsListRef.value
    // Top separator: show only when content is actually scrolled above (not at top)
    isSessionsOverflowing.value = el.scrollTop > 0
    // Bottom separator: show only when there's more content below the visible area
    const hasMore = el.scrollHeight > el.clientHeight &&
                    el.scrollHeight > Math.ceil(el.scrollTop + el.clientHeight) + 2
    hasContentBelow.value = hasMore
  }
}

// Delayed check for overflow (after animations complete)
function checkSessionsOverflowDelayed() {
  // Wait for collapse/expand animation to complete
  setTimeout(checkSessionsOverflow, 350)
}

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

// Collapsed groups state (stores group labels that are collapsed)
const collapsedGroups = ref<Set<string>>(new Set())

// Track if initial collapse has been done
const initialCollapseApplied = ref(false)

// Track clicks for manual double-click detection
// This is needed because DOM updates break native double-click detection
const lastClickInfo = ref<{ sessionId: string; time: number } | null>(null)
const DOUBLE_CLICK_THRESHOLD = 400 // milliseconds

// Format model ID for display (e.g. gpt-4o-2024-05-13 -> GPT-4o)
function formatModelName(modelId?: string): string {
  if (!modelId) return ''
  
  // Custom mapping for common models
  const lower = modelId.toLowerCase()
  if (lower.includes('gpt-4o')) return 'GPT-4o'
  if (lower.includes('gpt-4-turbo')) return 'GPT-4T'
  if (lower.includes('gpt-4')) return 'GPT-4'
  if (lower.includes('gpt-3.5')) return 'GPT-3.5'
  if (lower.includes('claude-3-5-sonnet')) return 'Sonnet 3.5'
  if (lower.includes('claude-3-5')) return 'Claude 3.5'
  if (lower.includes('claude-3')) return 'Claude 3'
  if (lower.includes('deepseek-reasoner')) return 'DS Reasoner'
  if (lower.includes('deepseek-chat')) return 'DS Chat'
  if (lower.includes('deepseek')) return 'DeepSeek'
  if (lower.includes('gemini')) return 'Gemini'
  
  // Generic fallback: remove version dates and capitalize
  return modelId
    .replace(/-\d{4}-\d{2}-\d{2}$/, '')
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Check if a session has branches
function hasBranches(sessionId: string): boolean {
  return sessionsStore.sessions.some(s => s.parentSessionId === sessionId)
}

// Get all ancestor IDs for a session
function getAncestorIds(sessionId: string): string[] {
  const ancestors: string[] = []
  const session = sessionsStore.sessions.find(s => s.id === sessionId)
  if (!session) return ancestors

  let current = session
  while (current.parentSessionId) {
    ancestors.push(current.parentSessionId)
    const parent = sessionsStore.sessions.find(s => s.id === current.parentSessionId)
    if (!parent) break
    current = parent
  }
  return ancestors
}

// Initialize collapsed state - collapse all parent sessions on startup
// But keep ancestors of the current session expanded
function initializeCollapsedState() {
  if (initialCollapseApplied.value) return

  // Get ancestors of the current session (these should stay expanded)
  const currentSessionAncestors = new Set(getAncestorIds(sessionsStore.currentSessionId))

  const parentsWithBranches = sessionsStore.sessions
    .filter(s => !s.parentSessionId) // Root sessions only
    .filter(s => hasBranches(s.id))
    .filter(s => !currentSessionAncestors.has(s.id)) // Don't collapse ancestors of current session
    .map(s => s.id)

  if (parentsWithBranches.length > 0) {
    collapsedParents.value = new Set(parentsWithBranches)
  }
  initialCollapseApplied.value = true
}

// Watch for sessions to be loaded and apply initial collapse
watch(
  () => sessionsStore.sessions.length,
  (newLength) => {
    if (newLength > 0 && !initialCollapseApplied.value) {
      initializeCollapsedState()
    }
    // Recheck overflow when sessions count changes
    nextTick(checkSessionsOverflow)
  },
  { immediate: true }
)

// Watch for current session changes - expand ancestors when switching to a branch
watch(
  () => sessionsStore.currentSessionId,
  (newSessionId) => {
    if (!newSessionId) return

    // Get ancestors of the new current session
    const ancestors = getAncestorIds(newSessionId)

    // Expand any collapsed ancestors
    let changed = false
    for (const ancestorId of ancestors) {
      if (collapsedParents.value.has(ancestorId)) {
        collapsedParents.value.delete(ancestorId)
        changed = true
      }
    }

    // Trigger reactivity if we made changes
    if (changed) {
      collapsedParents.value = new Set(collapsedParents.value)
    }
  }
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

// Toggle collapse state for a group (Today, Yesterday, etc.)
function toggleGroupCollapse(groupLabel: string) {
  if (collapsedGroups.value.has(groupLabel)) {
    collapsedGroups.value.delete(groupLabel)
  } else {
    collapsedGroups.value.add(groupLabel)
  }
  // Trigger reactivity
  collapsedGroups.value = new Set(collapsedGroups.value)
  // Recheck overflow after animation completes
  checkSessionsOverflowDelayed()
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
  const sessions = sessionsStore.filteredSessions
  if (!localSearchQuery.value.trim()) {
    return sessions
  }
  const query = localSearchQuery.value.toLowerCase()
  return sessions.filter(s =>
    (s.name || '').toLowerCase().includes(query)
  )
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
  isHidden: boolean
  lastBranchUpdate: number
  ancestorsLastChild: boolean[]
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
      lastBranchUpdate: session.updatedAt,
      ancestorsLastChild: []
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
        
        // Propagate branch update time to ancestors
        let current: SessionWithBranches | undefined = parent
        while (current) {
          if (withBranches.updatedAt > current.lastBranchUpdate) {
            current.lastBranchUpdate = withBranches.updatedAt
          }
          current = current.parentSessionId ? sessionMap.get(current.parentSessionId) : undefined
        }
      } else {
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
  function flattenWithBranches(sessions: SessionWithBranches[], parentCollapsed: boolean = false, ancestorsLast: boolean[] = []): SessionWithBranches[] {
    const result: SessionWithBranches[] = []
    
    // Sort branches by updatedAt descending within their parent
    const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)
    
    for (let i = 0; i < sorted.length; i++) {
      const session = sorted[i]
      const isLast = (i === sorted.length - 1)
      session.isLastChild = isLast
      session.isHidden = parentCollapsed
      session.ancestorsLastChild = [...ancestorsLast]
      session.branchCount = session.branches.length // Restored
      
      result.push(session)
      
      if (session.branches.length > 0) {
        const shouldHideChildren = parentCollapsed || session.isCollapsed
        const nextAncestors = [...ancestorsLast, isLast]
        result.push(...flattenWithBranches(session.branches, shouldHideChildren, nextAncestors))
      }
    }
    return result
  }

  // Pre-sort root sessions by their branch activity so they arrive correctly at groupedSessions
  rootSessions.sort((a, b) => b.lastBranchUpdate - a.lastBranchUpdate)

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
    { label: 'Pinned', sessions: [] },
    { label: 'Today', sessions: [] },
    { label: 'Yesterday', sessions: [] },
    { label: 'Previous 7 Days', sessions: [] },
    { label: 'Older', sessions: [] },
  ]

  // Get organized sessions (with branches nested under parents)
  const organizedSessions = organizeSessionsWithBranches(filteredSessions.value)

  // Keep track of which root session ID we've processed to avoid splitting branches
  const processedRoots = new Set<string>()

  for (const session of organizedSessions) {
    if (session.isHidden) continue // Don't group hidden sessions
    
    // Find the root ancestor to determine the group for the whole branch
    let root = session
    while (root.parentSessionId) {
      const parent = organizedSessions.find(s => s.id === root.parentSessionId)
      if (!parent) break
      root = parent
    }

    // Only process each root's entire branch once
    if (processedRoots.has(root.id)) continue
    processedRoots.add(root.id)

    // Find all descendants of this root (they are sequential in organizedSessions)
    const branchSessions = organizedSessions.filter(s => {
      let curr = s
      while (curr.id !== root.id && curr.parentSessionId) {
        const p = organizedSessions.find(x => x.id === curr.parentSessionId)
        if (!p) break
        curr = p
      }
      return curr.id === root.id
    })

    const groupTarget = root.isPinned ? groups[0] : null
    if (groupTarget) {
      groupTarget.sessions.push(...branchSessions)
      continue
    }

    const time = root.lastBranchUpdate
    if (time >= todayStart) {
      groups[1].sessions.push(...branchSessions)
    } else if (time >= yesterdayStart) {
      groups[2].sessions.push(...branchSessions)
    } else if (time >= weekAgoStart) {
      groups[3].sessions.push(...branchSessions)
    } else {
      groups[4].sessions.push(...branchSessions)
    }
  }

  // We don't sort here anymore because organizeSessionsWithBranches handled it
  // and we want to preserve the tree order (parent then children)

  return groups.filter((g) => g.sessions.length > 0)
})

// Flat session list: pinned first, then by updatedAt (no date grouping)
const flatSessions = computed(() => {
  const organizedSessions = organizeSessionsWithBranches(filteredSessions.value)

  // Separate pinned and unpinned sessions
  const pinned: SessionWithBranches[] = []
  const unpinned: SessionWithBranches[] = []

  for (const session of organizedSessions) {
    // Find root to check if pinned
    let root = session
    while (root.parentSessionId) {
      const parent = organizedSessions.find(s => s.id === root.parentSessionId)
      if (!parent) break
      root = parent
    }

    if (root.isPinned) {
      pinned.push(session)
    } else {
      unpinned.push(session)
    }
  }

  // Return pinned first, then unpinned (both already sorted by updatedAt in organizeSessionsWithBranches)
  return [...pinned, ...unpinned]
})

// Format session time for display
function formatSessionTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const date = new Date(timestamp)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  // Less than 1 minute
  if (diff < 60000) return 'now'

  // Less than 1 hour
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`

  // Today - show time
  if (timestamp >= today.getTime()) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  // Yesterday
  if (timestamp >= yesterday.getTime()) {
    return 'Yesterday'
  }

  // Within a week
  if (diff < 7 * 24 * 3600000) {
    return date.toLocaleDateString('en-US', { weekday: 'short' })
  }

  // Older - show date
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getSessionPreview(session: ChatSession): string {
  if (!session.messages || session.messages.length === 0) {
    return 'No messages yet'
  }
  const lastMessage = session.messages[session.messages.length - 1]
  const preview = lastMessage.content.slice(0, 50)
  return preview.length < lastMessage.content.length ? preview + '...' : preview
}

// Get session item style with dynamic animation speed
function getSessionStyle(session: { depth: number }) {
  const speed = animationSpeed.value
  return {
    paddingLeft: `${12 + session.depth * 20}px`,
    // Avoid 'transition: all' as it can cause width issues during v-show toggles
    transition: `background-color 0.15s ease, border-color 0.15s ease, opacity ${speed}s ease, max-height ${speed}s ease, padding ${speed}s ease, margin ${speed}s ease`,
  }
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
  const id = editingSessionId.value
  const newName = editingName.value.trim()
  
  // Clear editing state first
  editingSessionId.value = null
  editingName.value = ''

  if (newName) {
    await sessionsStore.renameSession(id, newName)
  }
}

async function togglePin(session: ChatSession) {
  await sessionsStore.updateSessionPin(session.id, !session.isPinned)
}

function handleRename() {
  if (!contextMenu.value.session) return
  startInlineRename(contextMenu.value.session)
  closeContextMenu()
}

function handlePin() {
  if (!contextMenu.value.session) return
  togglePin(contextMenu.value.session)
  closeContextMenu()
}

function getDeleteTitle(session: SessionWithBranches): string {
  if (pendingDeleteId.value === session.id) {
    if (session.hasBranches) {
      return `Click to delete ${session.branchCount + 1} chats`
    }
    return 'Click to confirm delete'
  }
  if (session.hasBranches) {
    return `Delete (includes ${session.branchCount} branch${session.branchCount > 1 ? 'es' : ''})`
  }
  return 'Delete'
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
  // Logic removed as it's now handled in App.vue directly
}

function handleClearClick() {
  // New chat logic or clear session
  sessionsStore.currentSessionId = null
}


onMounted(() => {
  window.addEventListener('resize', handleWindowResize)
  // Don't call handleWindowResize() on mount - respect saved sidebar state from localStorage

  // Set up observers to detect DOM and size changes
  if (sessionsListRef.value) {
    // 1. MutationObserver for content changes (group toggle etc.)
    mutationObserver = new MutationObserver(() => {
      checkSessionsOverflow()
    })
    mutationObserver.observe(sessionsListRef.value, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    })

    // 2. ResizeObserver for container size changes
    resizeObserver = new ResizeObserver(() => {
      checkSessionsOverflow()
    })
    resizeObserver.observe(sessionsListRef.value)

    // Initial check
    checkSessionsOverflowDelayed()
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize)
  // Clean up delete confirmation timer
  if (deleteConfirmTimer) {
    clearTimeout(deleteConfirmTimer)
    deleteConfirmTimer = null
  }
  // Clean up Observers
  if (mutationObserver) {
    mutationObserver.disconnect()
    mutationObserver = null
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})

function handleWindowResize() {
  if (window.innerWidth < 768) {
    if (!props.collapsed) {
      emit('toggleCollapse')
    }
  }
}
</script>

<style scoped>
.sidebar {
  position: relative;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  transition:
    width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.2s ease;
  overflow: hidden;
  background: var(--bg);
  padding: 0;
}

/* Disable transition during resize for smooth dragging */
.sidebar.resizing {
  transition: none;
}

/* Floating sidebar mode */
.sidebar.floating {
  position: fixed;
  left: 0;
  top: 0;
  width: 300px !important;
  max-width: 300px !important;
  height: 100%;
  z-index: 500; /* Higher than InputBox (100) */
  background: transparent;
  animation: slideInLeft 0.2s cubic-bezier(0.32, 0.72, 0, 1) forwards;
  overflow: visible;
  /* Disable width transition - use animation instead */
  transition: none;
}

/* Floating mode only needs height adjustment since base styles already have margin */
.sidebar.floating .sidebar-content {
  height: calc(100% - 12px);
  margin: 6px;
  padding-bottom: 0;
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.sidebar.floating .traffic-lights-row {
  margin-top: 3px; /* Compensate for smaller top margin to keep button aligned */
}

html[data-theme='light'] .sidebar.floating .sidebar-content {
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}


.sidebar.floating.floating-closing {
  animation: slideOutLeft 0.2s cubic-bezier(0.4, 0, 1, 1) forwards;
}


@keyframes slideInLeft {
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideOutLeft {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(-100%);
    opacity: 0;
  }
}

/* Sidebar content panel */
.sidebar-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  margin-top: 12px;
  background: var(--bg);
  overflow: hidden;
}

/* Sidebar Header with traffic lights space */
.sidebar-header {
  flex-shrink: 0;
  padding: 0 12px;
}

.traffic-lights-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  height: 52px;
  margin-top: -3px; /* Pull up to align with traffic lights */
  -webkit-app-region: drag;
}

.traffic-lights-space {
  width: 70px; /* Space for macOS traffic lights */
  flex-shrink: 0;
}

.sidebar-toggle-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
  -webkit-app-region: no-drag;
}

.sidebar-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}

html[data-theme='light'] .sidebar-toggle-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

.sidebar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 0px;
}

.search-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  transition: all 0.2s ease;
}

html[data-theme='light'] .search-wrapper {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.08);
}

.search-wrapper:focus-within {
  border-color: var(--accent);
  background: rgba(255, 255, 255, 0.08);
}

.search-icon {
  flex-shrink: 0;
  color: var(--muted);
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 13px;
  color: var(--text);
  outline: none;
  min-width: 0;
}

.search-input::placeholder {
  color: var(--muted);
}

.new-chat-btn {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: var(--accent);
  border-radius: 8px;
  color: white;
  cursor: pointer;
  transition: all 0.2s ease;
}

.new-chat-btn:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.new-chat-btn:active {
  transform: scale(0.95);
}

/* Resize Handle */
.resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 4px;
  height: 100%;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s ease;
  z-index: 10;
}

.resize-handle:hover {
  background: var(--accent);
}

.sidebar.collapsed {
  width: 0;
  max-width: 0;
  min-width: 0;
  padding: 0;
  overflow: hidden;
  border: none;
  box-shadow: none;
  opacity: 0;
}

.sessions-list {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  min-width: 0;
  padding: 6px 0 60px 8px; /* top right bottom left */
  /* Prevent width jump when scrollbar appears/disappears */
  scrollbar-gutter: stable;
}

/* Top scroll indicator line - outside scroll container */
.scroll-indicator-top {
  height: 1px;
  margin: 0 16px;
  background: rgba(255, 255, 255, 0.06);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
  flex-shrink: 0;
}

html[data-theme='light'] .scroll-indicator-top {
  background: rgba(0, 0, 0, 0.04);
}

.scroll-indicator-top.visible {
  opacity: 1;
}

.session-group {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.group-sessions {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.group-sessions.collapsed {
  display: none;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px 4px;
  font-size: 10px;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  opacity: 0.7;
  cursor: pointer;
  margin: 4px 0 2px;
  transition: opacity 0.2s ease;
  user-select: none;
}

.group-header:hover {
  opacity: 1;
}

.group-chevron {
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.group-header.collapsed .group-chevron {
  transform: rotate(-90deg);
}

.group-label {
  flex: 1;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}

.group-count {
  font-size: 10px;
  font-weight: 500;
  color: var(--muted);
  background: rgba(255, 255, 255, 0.06);
  padding: 2px 6px;
  border-radius: 10px;
  opacity: 0.8;
}

html[data-theme='light'] .group-count {
  background: rgba(0, 0, 0, 0.06);
}

/* Session Item - Minimal Design */
.session-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 12px;
  margin: 2px 4px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  max-height: 60px;
  transition:
    background 0.15s ease,
    max-height 0.25s ease,
    padding 0.25s ease,
    margin 0.25s ease,
    opacity 0.2s ease;
}

.session-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

html[data-theme='light'] .session-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

.session-item.active {
  background: var(--session-highlight);
}

.session-item.hidden {
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin: 0;
  opacity: 0;
  pointer-events: none;
  overflow: hidden;
}

/* Generating indicator */
.generating-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
  flex-shrink: 0;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.1); }
}

/* Collapse button */
.collapse-btn {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
  padding: 0;
}

.collapse-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
}

html[data-theme='light'] .collapse-btn:hover {
  background: rgba(0, 0, 0, 0.08);
}

.collapse-btn svg {
  transition: transform 0.2s ease;
}

.collapse-btn.collapsed svg {
  transform: rotate(-90deg);
}

/* Branch indicator */
.branch-indicator {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--muted);
  opacity: 0.4;
}

/* Pin indicator */
.pin-icon {
  flex-shrink: 0;
  color: var(--muted);
  opacity: 0.5;
}

/* Agent avatar */
.session-agent-avatar {
  flex-shrink: 0;
  font-size: 14px;
  line-height: 1;
}

.session-agent-img {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  object-fit: cover;
}

/* Session name */
.session-name {
  flex: 1;
  min-width: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 400;
  letter-spacing: -0.01em;
  color: rgba(255, 255, 255, 0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 30px; /* Reserve space for hover actions */
  transition: color 0.15s ease;
}

html[data-theme='light'] .session-name {
  color: rgba(0, 0, 0, 0.5);
}

.session-item:hover .session-name {
  color: var(--accent-sub);
}

.session-item.active .session-name {
  font-weight: 500;
  color: var(--accent-main);
}

.session-name-input {
  flex: 1;
  min-width: 0;
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  font-size: 14px;
  font-weight: 400;
  color: var(--text);
  outline: none;
}

/* Session time */
.session-time {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--muted);
  opacity: 0.6;
  margin-left: 4px;
  transition: opacity 0.15s ease;
}

.session-item:hover .session-time {
  opacity: 0;
}

/* Hover actions */
.session-actions {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 2px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.session-item:hover .session-actions {
  opacity: 1;
  pointer-events: auto;
}

.action-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
}

html[data-theme='light'] .action-btn:hover {
  background: rgba(0, 0, 0, 0.08);
}

.action-btn.danger:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.action-btn.confirm {
  background: #ef4444;
  color: white;
  animation: shake 0.4s ease;
}

.action-btn.confirm:hover {
  background: #dc2626;
  color: white;
}

.delete-count {
  font-size: 10px;
  font-weight: 700;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-2px); }
  40% { transform: translateX(2px); }
  60% { transform: translateX(-2px); }
  80% { transform: translateX(2px); }
}

/* Pending delete state for session item */
.session-item:has(.action-btn.confirm) {
  background: rgba(239, 68, 68, 0.08) !important;
}

.session-item:has(.action-btn.confirm) .session-name {
  color: #ef4444;
}

.empty-sessions {
  padding: 20px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}

/* New Chat item - always at top of session list */
.session-item.new-chat-item {
  border-bottom: 1px solid var(--border);
  margin-bottom: 8px;
  padding-bottom: 12px;
}

.session-item.new-chat-item .new-chat-icon {
  color: var(--accent);
  flex-shrink: 0;
}

.session-item.new-chat-item .session-name {
  color: var(--accent);
  padding-right: 12px;
}

.session-item.new-chat-item:hover {
  background: rgba(var(--accent-rgb), 0.1);
}

.session-item.new-chat-item:hover .session-name {
  color: var(--accent);
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
  padding: 0 6px;
  display: flex;
  justify-content: center;
  pointer-events: none; /* Allow events through to background if necessary, but pill will override */
}

.footer-glass-pill {
  display: flex;
  align-items: center;
  padding: 4px;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 
    0 4px 16px rgba(0, 0, 0, 0.2),
    inset 0 1px 1px rgba(255, 255, 255, 0.05);
  pointer-events: auto;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.footer-glass-pill:hover {
  background: rgba(255, 255, 255, 0.08);
  transform: translateY(-2px);
  box-shadow: 
    0 8px 24px rgba(0, 0, 0, 0.3),
    inset 0 1px 1px rgba(255, 255, 255, 0.1);
}

.pill-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--muted);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.pill-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
}

.pill-btn:active {
  transform: scale(0.9);
}

.pill-divider {
  width: 1px;
  height: 16px;
  background: rgba(255, 255, 255, 0.1);
  margin: 0 4px;
}

@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    height: 100%;
    z-index: 1000;
  }
}
</style>
