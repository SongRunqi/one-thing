<template>
  <aside
    :class="['sidebar', { collapsed, floating, 'floating-closing': floatingClosing, resizing: isResizing }]"
    :style="sidebarStyle"
  >
    <div
      v-show="showContent"
      class="sidebar-content"
      :class="{ 'content-hidden': collapsed && !floating }"
    >
      <!-- Sidebar Header: traffic lights space -->
      <SidebarHeader />

      <!-- Session List: workspace actions live inside the same scroll panel -->
      <SessionList
        :groups="groupedSessions"
        :current-session-id="sessionsStore.currentSessionId"
        :is-session-generating="chatStore.isSessionGenerating"
        :editing-session-id="editingSessionId"
        :editing-name="editingName"
        @create-new-chat="$emit('create-new-chat')"
        @session-click="handleSessionClick"
        @context-menu="openContextMenu"
        @toggle-collapse="sessionOrganizer.toggleCollapse"
        @start-rename="startInlineRename"
        @confirm-rename="confirmInlineRename"
        @cancel-rename="cancelInlineRename"
        @overflow-change="handleOverflowChange"
      >
        <template #before>
          <div class="sidebar-workspace-actions">
            <button
              v-for="action in workspaceActions"
              :key="action.id"
              type="button"
              class="workspace-action"
              :class="{ active: activeWorkspacePanel === action.id }"
              @click="$emit('open-workspace-panel', action.id)"
            >
              <component
                :is="action.icon"
                :size="16"
                :stroke-width="1.8"
                class="workspace-action-icon"
              />
              <span class="workspace-action-title">{{ action.label }}</span>
            </button>
          </div>
        </template>
      </SessionList>

      <!-- Bottom bar -->
      <div class="sidebar-bottom">
        <div class="sidebar-bottom-spacer" />
        <button
          class="sidebar-bottom-btn"
          title="Settings"
          @click="$emit('open-settings')"
        >
          <Settings
            :size="18"
            :stroke-width="1.5"
          />
        </button>
      </div>

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
import { Brain, CalendarClock, Images, Settings } from 'lucide-vue-next'
import SidebarHeader from './SidebarHeader.vue'
import SessionList from './SessionList.vue'
import SessionContextMenu from './SessionContextMenu.vue'
import SidebarResizeHandle from './SidebarResizeHandle.vue'
import { useSessionOrganizer, type SessionWithBranches } from './useSessionOrganizer'

interface Props {
  collapsed?: boolean
  floating?: boolean
  floatingClosing?: boolean
  noTransition?: boolean
  mediaPanelOpen?: boolean
  activeWorkspacePanel?: 'memory' | 'media' | 'tasks' | null
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
  'open-workspace-panel': [panel: 'memory' | 'media' | 'tasks']
  'create-new-chat': []
  'open-search': []
  'open-settings': []
  'resize': [width: number]
}>()

// Stores
const sessionsStore = useSessionsStore()
const chatStore = useChatStore()

const workspaceActions = [
  { id: 'memory' as const, label: 'Memory', icon: Brain },
  { id: 'media' as const, label: 'Media', icon: Images },
  { id: 'tasks' as const, label: 'Tasks', icon: CalendarClock },
]

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

// Content visibility
const showContent = computed(() => !props.collapsed || props.floating)

// Inline editing state
const editingSessionId = ref<string | null>(null)
const editingName = ref('')

// Context menu state
const contextMenu = ref({
  show: false,
  x: 0,
  y: 0,
  session: null as SessionWithBranches | null,
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

const groupedSessions = computed(() => {
  return sessionOrganizer.getGroupedSessions(filteredSessions.value)
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
    await sessionsStore.deleteSession(contextMenu.value.session.id)
  }
}

// Inline rename handlers
function startInlineRename(session: SessionWithBranches) {
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
})
</script>

<style scoped>
.sidebar {
  --sidebar-bg:
    linear-gradient(rgba(var(--accent-rgb), 0.06), rgba(var(--accent-rgb), 0.06)),
    var(--bg-app);
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
  background: var(--sidebar-bg);
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
  background: var(--sidebar-bg);
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

.sidebar-workspace-actions {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 6px 4px 8px 0;
  margin: 0 4px 4px 0;
  flex-shrink: 0;
}

.workspace-action {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 32px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: background 0.14s ease, color 0.14s ease;
}

.workspace-action:hover {
  background: var(--hover);
  color: var(--text);
}

.workspace-action.active {
  background: color-mix(in srgb, var(--accent-sub, var(--accent-light)) 38%, transparent);
  color: var(--accent-main, var(--accent));
  font-weight: 500;
}

.workspace-action-icon {
  flex: 0 0 auto;
  color: currentColor;
  opacity: 0.78;
}

.workspace-action.active .workspace-action-icon {
  opacity: 1;
}

.workspace-action-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-bottom {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  flex-shrink: 0;
}

.sidebar-bottom-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--muted);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.sidebar-bottom-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.sidebar-bottom-spacer {
  flex: 1;
}

@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    height: 100%;
    z-index: 1000;
  }
}
</style>
