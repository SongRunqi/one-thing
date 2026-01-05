<template>
  <aside
    :class="['sidebar', { collapsed, floating, 'floating-closing': floatingClosing, resizing: isResizing }]"
    :style="sidebarStyle"
  >
    <div v-show="showContent" class="sidebar-content" :class="{ 'content-hidden': collapsed && !floating }">
      <!-- Sidebar Header: Traffic lights space + Search + New Chat -->
      <SidebarHeader
        :search-query="localSearchQuery"
        @toggle-collapse="$emit('toggleCollapse')"
        @update:search-query="localSearchQuery = $event"
      />

      <!-- Agent Grid at top -->
      <AgentGrid
        v-if="agentsStore.pinnedAgents.length > 0"
        @edit-agent="(agent) => $emit('edit-agent', agent)"
        @open-create-dialog="$emit('open-agent-dialog')"
      />

      <!-- Session List -->
      <SessionList
        :sessions="flatSessions"
        :current-session-id="sessionsStore.currentSessionId"
        :is-session-generating="chatStore.isSessionGenerating"
        :editing-session-id="editingSessionId"
        :editing-name="editingName"
        :pending-delete-id="pendingDeleteId"
        :format-session-time="sessionOrganizer.formatSessionTime"
        @create-new-chat="$emit('create-new-chat')"
        @session-click="handleSessionClick"
        @context-menu="openContextMenu"
        @toggle-collapse="sessionOrganizer.toggleCollapse"
        @start-rename="startInlineRename"
        @confirm-rename="confirmInlineRename"
        @cancel-rename="cancelInlineRename"
        @delete="deleteSessionById"
        @overflow-change="handleOverflowChange"
      />

      <!-- Context Menu -->
      <SessionContextMenu
        :show="contextMenu.show"
        :x="contextMenu.x"
        :y="contextMenu.y"
        :session="contextMenu.session"
        @close="closeContextMenu"
        @rename="handleContextRename"
        @pin="handleContextPin"
        @delete="handleContextDelete"
      />

      <!-- Workspace Switcher -->
      <WorkspaceSwitcher
        :media-panel-open="mediaPanelOpen"
        :show-separator="hasContentBelow"
        @toggle-media-panel="$emit('toggle-media-panel')"
        @open-create-dialog="$emit('open-workspace-dialog')"
        @open-agent-dialog="$emit('open-agent-dialog')"
        @edit-workspace="(workspace) => $emit('edit-workspace', workspace)"
      />
    </div>

    <!-- Resize Handle -->
    <SidebarResizeHandle
      :current-width="width"
      @resize="(w) => $emit('resize', w)"
      @resize-start="isResizing = true"
      @resize-end="isResizing = false"
    />
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { useChatStore } from '@/stores/chat'
import { useAgentsStore } from '@/stores/agents'
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher.vue'
import AgentGrid from '@/components/AgentGrid.vue'
import SidebarHeader from './SidebarHeader.vue'
import SessionList from './SessionList.vue'
import SessionContextMenu from './SessionContextMenu.vue'
import SidebarResizeHandle from './SidebarResizeHandle.vue'
import { useSessionOrganizer, type SessionWithBranches } from './useSessionOrganizer'
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

// Stores
const sessionsStore = useSessionsStore()
const chatStore = useChatStore()
const agentsStore = useAgentsStore()

// Composable
const sessionOrganizer = useSessionOrganizer()

// Make props available in template
const collapsed = computed(() => props.collapsed)
const floating = computed(() => props.floating)
const floatingClosing = computed(() => props.floatingClosing)

// Local state
const localSearchQuery = ref('')
const isResizing = ref(false)
const hasContentBelow = ref(false)

// Content visibility - always show, use CSS for fade effect
const showContent = computed(() => !props.collapsed || props.floating)

// Inline editing state
const editingSessionId = ref<string | null>(null)
const editingName = ref('')

// Delete confirmation state
const pendingDeleteId = ref<string | null>(null)
let deleteConfirmTimer: ReturnType<typeof setTimeout> | null = null

// Context menu state
const contextMenu = ref({
  show: false,
  x: 0,
  y: 0,
  session: null as ChatSession | null,
})

// Computed sidebar style
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

// Filtered and flat sessions
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

const flatSessions = computed(() => {
  return sessionOrganizer.getFlatSessions(filteredSessions.value)
})

// Session click handler
function handleSessionClick(_event: MouseEvent, session: SessionWithBranches) {
  if (editingSessionId.value) return
  sessionsStore.switchSession(session.id)
}

// Overflow change handler
function handleOverflowChange(_isOverflowing: boolean, hasBelow: boolean) {
  hasContentBelow.value = hasBelow
}

// Context menu handlers
function openContextMenu(event: MouseEvent, session: SessionWithBranches) {
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

function handleContextRename() {
  if (contextMenu.value.session) {
    startInlineRename(contextMenu.value.session)
  }
}

async function handleContextPin() {
  if (contextMenu.value.session) {
    await sessionsStore.updateSessionPin(
      contextMenu.value.session.id,
      !contextMenu.value.session.isPinned
    )
  }
}

async function handleContextDelete() {
  if (contextMenu.value.session) {
    await deleteSessionById(contextMenu.value.session.id)
  }
}

// Inline rename handlers
function startInlineRename(session: ChatSession) {
  editingSessionId.value = session.id
  editingName.value = session.name || ''
}

function cancelInlineRename() {
  editingSessionId.value = null
  editingName.value = ''
}

async function confirmInlineRename(sessionId: string, newName: string) {
  const session = sessionsStore.filteredSessions.find(s => s.id === sessionId)
  const originalName = session?.name || ''
  const trimmedName = newName.trim()

  // Clear editing state first
  editingSessionId.value = null
  editingName.value = ''

  // Only call rename if name actually changed
  if (trimmedName && trimmedName !== originalName) {
    await sessionsStore.renameSession(sessionId, trimmedName)
  }
}

// Delete handler with two-click confirmation
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

// Window resize handler
function handleWindowResize() {
  if (window.innerWidth < 768) {
    if (!props.collapsed) {
      emit('toggleCollapse')
    }
  }
}

onMounted(() => {
  window.addEventListener('resize', handleWindowResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize)
  if (deleteConfirmTimer) {
    clearTimeout(deleteConfirmTimer)
    deleteConfirmTimer = null
  }
})
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
  /* Match container's darker base for consistent "surface" */
  background: var(--bg-sunken, color-mix(in srgb, var(--bg) 95%, black));
  padding: 0;
  contain: layout style;
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
  z-index: 500;
  background: transparent;
  animation: slideInLeft 0.2s cubic-bezier(0.32, 0.72, 0, 1) forwards;
  overflow: visible;
  transition: none;
  pointer-events: none;
}

/* Floating mode only needs height adjustment since base styles already have margin */
.sidebar.floating .sidebar-content {
  height: calc(100% - 12px);
  margin: 6px;
  padding-bottom: 0;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-floating);
  will-change: transform, opacity;
  pointer-events: auto;
}

.sidebar.floating .traffic-lights-row {
  margin-top: 3px;
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
  /* Match container's darker base */
  background: var(--bg-sunken, color-mix(in srgb, var(--bg) 95%, black));
  overflow: hidden;
  contain: layout style paint;
  transition: opacity 0.15s ease;
}

/* Content fades out faster than width shrinks */
.sidebar-content.content-hidden {
  opacity: 0;
  pointer-events: none;
}

.sidebar.collapsed {
  width: 0;
  max-width: 0;
  min-width: 0;
  padding: 0;
  overflow: hidden;
  border: none;
  box-shadow: none;
}

@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    height: 100%;
    z-index: 1000;
  }
}
</style>
