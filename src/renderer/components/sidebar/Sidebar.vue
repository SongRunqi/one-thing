<template>
  <aside
    :class="['sidebar', { collapsed, floating, 'floating-closing': floatingClosing }]"
    :style="sidebarStyle"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <Space
      as="div"
      direction="vertical"
      size="none"
      align="stretch"
      class="sidebar-content"
      :class="{ 'content-hidden': collapsed && !floating }"
      :aria-hidden="collapsed && !floating"
    >
      <!-- Sidebar Header: traffic lights space -->
      <SidebarHeader />

      <!-- Session List: workspace actions live inside the same scroll panel -->
      <SessionList
        :groups="groupedSessions"
        :active-index="activeSidebarIndex"
        :current-session-id="sessionsStore.currentSessionId"
        :is-session-generating="chatStore.isSessionGenerating"
        :editing-session-id="editingSessionId"
        :editing-name="editingName"
        @create-new-chat="$emit('create-new-chat')"
        @menu-select="handleSidebarMenuSelect"
        @context-menu="openContextMenu"
        @toggle-collapse="sessionOrganizer.toggleCollapse"
        @start-rename="startInlineRename"
        @confirm-rename="confirmInlineRename"
        @cancel-rename="cancelInlineRename"
        @overflow-change="handleOverflowChange"
      />

      <!-- Bottom bar: low-frequency library entries live here as an icon
           row so the session list owns the prime sidebar real estate -->
      <div class="sidebar-bottom">
        <div class="sidebar-bottom-actions">
          <Button
            v-for="action in workspaceActions"
            :key="action.id"
            text
            circle
            class="sidebar-bottom-btn workspace-action-btn"
            :class="{ 'is-active': activeWorkspacePanel === action.id }"
            :title="action.label"
            :aria-label="action.label"
            :icon="action.icon"
            :style="workspaceActionStyle(action.categorySlot)"
            @click="$emit('open-workspace-panel', action.id)"
          />
        </div>
        <div class="sidebar-bottom-spacer" />
        <Button
          text
          circle
          class="sidebar-bottom-btn"
          title="Settings"
          aria-label="Settings"
          :icon="Settings"
          @click="$emit('open-settings')"
        />
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
    </Space>
  </aside>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import Space from '@/components/common/Space.vue'
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { useChatStore } from '@/stores/chat'
import { Bot, Brain, CalendarClock, Images, Settings } from 'lucide-vue-next'
import SidebarHeader from './SidebarHeader.vue'
import SessionList from './SessionList.vue'
import SessionContextMenu from './SessionContextMenu.vue'
import { useSessionOrganizer, type SessionWithBranches } from './useSessionOrganizer'

interface Props {
  collapsed?: boolean
  floating?: boolean
  floatingClosing?: boolean
  noTransition?: boolean
  mediaPanelOpen?: boolean
  activeWorkspacePanel?: 'memory' | 'media' | 'agents' | 'tasks' | null
  width?: number
}

type WorkspacePanel = 'memory' | 'media' | 'agents' | 'tasks'

const props = withDefaults(defineProps<Props>(), {
  collapsed: false,
  floating: false,
  floatingClosing: false,
  noTransition: false,
  activeWorkspacePanel: null,
  width: 300,
})

const emit = defineEmits<{
  toggleCollapse: []
  'toggle-media-panel': []
  'open-workspace-panel': [panel: WorkspacePanel]
  'select-session': [sessionId: string]
  'create-new-chat': []
  'open-search': []
  'open-settings': []
  'request-floating-keep-open': []
  'request-floating-close': []
}>()

// Stores
const sessionsStore = useSessionsStore()
const chatStore = useChatStore()

const workspaceActions = [
  { id: 'memory' as const, label: 'Memory', icon: Brain, categorySlot: 1 },
  { id: 'media' as const, label: 'Media', icon: Images, categorySlot: 2 },
  { id: 'agents' as const, label: 'Agents', icon: Bot, categorySlot: 3 },
  { id: 'tasks' as const, label: 'Tasks', icon: CalendarClock, categorySlot: 4 },
]

// Composable
const sessionOrganizer = useSessionOrganizer()

// Make props available in template
const collapsed = computed(() => props.collapsed)
const floating = computed(() => props.floating)
const floatingClosing = computed(() => props.floatingClosing)

// Local state
const localSearchQuery = ref('')
const hasContentBelow = ref(false)

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
  const baseStyle = {
    '--sidebar-docked-width': `${props.width}px`,
  }

  if (floating.value || floatingClosing.value) {
    return {
      ...baseStyle,
      transition: 'none'
    }
  }

  return {
    ...baseStyle,
    transition: props.noTransition ? 'none' : undefined
  }
})

// Filtered and flat sessions
const filteredSessions = computed(() => {
  const sessions = sessionsStore.sidebarSessions
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

const activeSidebarIndex = computed(() => {
  if (sessionsStore.currentSessionId) return sessionMenuIndex(sessionsStore.currentSessionId)
  return ''
})

function sessionMenuIndex(sessionId: string): string {
  return `session:${sessionId}`
}

function workspaceActionStyle(categorySlot: number): Record<string, string> {
  return {
    '--workspace-action-icon-color': `var(--ui-category-${categorySlot}-icon)`,
  }
}

function handleSidebarMenuSelect(index: string) {
  if (index.startsWith('session:')) {
    if (editingSessionId.value) return
    emit('select-session', index.slice('session:'.length))
  }
}

function handleMouseEnter() {
  if (!props.floating && !props.floatingClosing) return
  emit('request-floating-keep-open')
}

function handleMouseLeave() {
  if (!props.floating || props.floatingClosing) return
  emit('request-floating-close')
}

// Overflow change handler
function handleOverflowChange(_isOverflowing: boolean, hasBelow: boolean) {
  hasContentBelow.value = hasBelow
}

// Context menu handlers
function openContextMenu(event: MouseEvent, session: SessionWithBranches) {
  if (sessionsStore.isNewChatDraftId(session.id)) return
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
  if (sessionsStore.isNewChatDraftId(session.id)) return
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
  --sidebar-docked-width: 300px;
  --sidebar-floating-gutter: 6px;
  --sidebar-floating-safe-zone: 36px;
  --sidebar-bg: var(
    --ui-sidebar-surface-bg,
    var(--ui-surface-app-bg, var(--bg-app, var(--bg)))
  );
  position: relative;
  flex: 1 1 auto;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  transition: opacity 0.2s ease;
  overflow: hidden;
  background: var(--sidebar-bg);
  padding: 0;
  contain: layout style;
}

/* Floating sidebar mode */
.sidebar.floating {
  position: fixed;
  left: 0;
  top: 0;
  width: calc(
    var(--sidebar-docked-width)
    + var(--sidebar-floating-gutter)
    + var(--sidebar-floating-gutter)
    + var(--sidebar-floating-safe-zone)
  ) !important;
  max-width: calc(
    var(--sidebar-docked-width)
    + var(--sidebar-floating-gutter)
    + var(--sidebar-floating-gutter)
    + var(--sidebar-floating-safe-zone)
  ) !important;
  height: 100%;
  z-index: 650;
  background: transparent;
  animation: slideInLeft 0.2s cubic-bezier(0.32, 0.72, 0, 1) forwards;
  overflow: visible;
  transition: none;
  pointer-events: auto;
}

/* Floating card clears the fixed window-controls strip (traffic lights +
   sidebar actions, top 12px + 24px) instead of sliding beneath it — list
   content must never show through that transparent strip. */
.sidebar.floating .sidebar-content {
  width: var(--sidebar-docked-width);
  min-width: var(--sidebar-docked-width);
  max-width: var(--sidebar-docked-width);
  height: calc(100% - 44px - var(--sidebar-floating-gutter));
  margin: 44px var(--sidebar-floating-gutter) var(--sidebar-floating-gutter);
  padding-bottom: 0;
  background: var(--sidebar-bg);
  border: 1px solid color-mix(in srgb, var(--ui-sidebar-border-border, var(--ui-border-subtle-border, var(--border-subtle, var(--border)))) 72%, transparent);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-floating);
  will-change: transform, opacity;
  pointer-events: auto;
}

/* The in-card traffic-lights spacer is meaningless when the card already
   starts below the window controls. */
.sidebar.floating .sidebar-content :deep(.sidebar-header) {
  display: none;
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
  align-self: flex-start;
  width: var(--sidebar-docked-width);
  min-width: var(--sidebar-docked-width);
  max-width: var(--sidebar-docked-width);
  min-height: 0;
  margin-top: 12px;
  background: transparent;
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
  padding: 0;
  overflow: hidden;
  border: none;
  box-shadow: none;
}

.sidebar-bottom-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* Library entries stay neutral at rest; category color appears only on
   hover/active (accent containment). */
.workspace-action-btn:hover,
.workspace-action-btn:focus-visible {
  color: var(--workspace-action-icon-color, var(--ui-accent-primary-fg, var(--accent)));
}

.workspace-action-btn.is-active {
  background: color-mix(in srgb, var(--workspace-action-icon-color, var(--ui-accent-primary-fg, var(--accent))) 13%, transparent);
  color: var(--workspace-action-icon-color, var(--ui-accent-primary-fg, var(--accent)));
}

.sidebar-bottom {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  flex-shrink: 0;
}

.sidebar-bottom-btn {
  --app-button-height: 32px;
  --app-button-min-width: 32px;
  --app-button-padding-x: 0;
  --app-button-hover-fill: var(--ui-sidebar-action-hover-bg, var(--ui-state-hover-bg, var(--hover)));
  --app-button-hover-fg: var(--ui-sidebar-action-hover-fg, var(--ui-text-primary-fg, var(--text)));
  --app-button-shadow: none;
  --app-button-hover-shadow: none;

  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(
    --ui-sidebar-action-fg,
    color-mix(in srgb, var(--ui-sidebar-item-fg, var(--ui-text-secondary-fg, var(--text-sidebar-item))) 88%, transparent)
  );
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.sidebar-bottom-btn:hover {
  background: var(--ui-sidebar-action-hover-bg, var(--ui-state-hover-bg, var(--hover)));
  color: var(--ui-sidebar-action-hover-fg, var(--ui-text-primary-fg, var(--text)));
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
