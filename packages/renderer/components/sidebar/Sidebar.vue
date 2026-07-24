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

      <!-- 方案六 · 顶部「＋ 新会话」：固定在滚动区之外的文本入口 -->
      <button
        type="button"
        class="sidebar-newchat"
        @click="$emit('create-new-chat')"
      >
        ＋ 新会话
      </button>

      <!-- Session List: workspace actions live inside the same scroll panel -->
      <SessionList
        :groups="groupedSessions"
        :active-index="activeSidebarIndex"
        :current-session-id="sessionsStore.currentSessionId"
        :is-session-generating="chatStore.isSessionGenerating"
        :editing-session-id="editingSessionId"
        :editing-name="editingName"
        @menu-select="handleSidebarMenuSelect"
        @context-menu="openContextMenu"
        @toggle-collapse="sessionOrganizer.toggleCollapse"
        @start-rename="startInlineRename"
        @confirm-rename="confirmInlineRename"
        @cancel-rename="cancelInlineRename"
        @overflow-change="handleOverflowChange"
      />

      <!-- Bottom dock (方案二/v7 原样): 裸 16px 线性图标浮在白胶囊里，
           单色墨系（rest 灰 → hover/active 墨），设置在分隔线右侧。 -->
      <div class="sidebar-dock">
        <div class="sidebar-dock-pill">
          <button
            v-for="action in workspaceActions"
            :key="action.id"
            type="button"
            class="sidebar-dock-icon"
            :class="{ 'is-active': activeWorkspacePanel === action.id }"
            :title="action.label"
            :aria-label="action.label"
            @click="$emit('open-workspace-panel', action.id)"
          >
            <component
              :is="action.icon"
              :size="16"
              :stroke-width="1.7"
            />
          </button>
          <span
            class="sidebar-dock-divider"
            aria-hidden="true"
          />
          <button
            type="button"
            class="sidebar-dock-icon"
            title="Settings"
            aria-label="Settings"
            @click="$emit('open-settings')"
          >
            <Settings
              :size="16"
              :stroke-width="1.7"
            />
          </button>
        </div>
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
import Space from '@/components/common/Space.vue'
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { useChatStore } from '@/stores/chat'
import { Bot, Brain, CalendarClock, Images, Radio, Settings } from 'lucide-vue-next'
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
  activeWorkspacePanel?: 'memory' | 'media' | 'agents' | 'tasks' | 'music' | 'practice' | null
  width?: number
}

type WorkspacePanel = 'memory' | 'media' | 'agents' | 'tasks' | 'music' | 'practice'

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
  { id: 'memory' as const, label: 'Memory', icon: Brain },
  { id: 'media' as const, label: 'Media', icon: Images },
  { id: 'agents' as const, label: 'Agents', icon: Bot },
  { id: 'tasks' as const, label: 'Tasks', icon: CalendarClock },
  { id: 'music' as const, label: 'Music', icon: Radio },
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

/**
 * The radio DJ's curation sessions as a sidebar group of their own —
 * filtered out of the public list (they drive themselves and would read as
 * ghosts there), but one expand away. Clicking opens in the main chat like
 * any session. Synthesizing a SessionGroup buys SubMenu's collapse, the
 * 5-visible/show-more limit and the context menu for free.
 */
const musicGroup = computed(() => {
  const radioSessions = sessionsStore.radioSessions
  if (radioSessions.length === 0) return null
  return {
    key: 'music',
    label: 'Music · 电台',
    sessions: radioSessions.map((session): SessionWithBranches => ({
      ...session,
      branches: [],
      depth: 0,
      hasBranches: false,
      isCollapsed: false,
      isLastChild: false,
      branchCount: 0,
      isHidden: false,
      lastBranchUpdate: session.updatedAt,
      ancestorsLastChild: [],
    })),
  }
})

const groupedSessions = computed(() => {
  const groups = sessionOrganizer.getProjectGroupedSessions(filteredSessions.value)
  const music = musicGroup.value
  // Music rides on top: the station is a live thing, not an archive.
  return music ? [music, ...groups] : groups
})

const activeSidebarIndex = computed(() => {
  if (sessionsStore.currentSessionId) return sessionMenuIndex(sessionsStore.currentSessionId)
  return ''
})

function sessionMenuIndex(sessionId: string): string {
  return `session:${sessionId}`
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
  /* 行层级从墨色按比例派生，保证任何主题下 分组头(全墨) > 行文(72% 墨) >
     active(14%) > hover(8%) 的对比关系都成立——直接引各主题 token 时
     对比度不可控（用户实测过分组头/行文一个色、hover 看不见）。
     整棵 sidebar（新会话/列表/SessionItem）共用这条派生链。 */
  --sidebar-row-ink: var(--ui-text-primary-fg, var(--text-primary, var(--text)));
  --sidebar-row-fg: color-mix(in srgb, var(--sidebar-row-ink) 72%, transparent);
  --sidebar-row-hover-fill: color-mix(in srgb, var(--sidebar-row-ink) 8%, transparent);
  --sidebar-row-active-fill: color-mix(in srgb, var(--sidebar-row-ink) 14%, transparent);
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

/* 方案六 · 顶部「＋ 新会话」：文本行不进滚动区，hover 只由灰转墨（无填充），
   ＋ 号与分组行 chevron 同起笔线（x=24 = 列表容器 12 + 抽屉头起点 12）。
   上内边距 12px 让文字躲开 SidebarHeader 底部同高的淡出渐变。 */
.sidebar-newchat {
  flex-shrink: 0;
  margin: 0;
  padding: 12px 16px 10px 24px;
  border: none;
  background: transparent;
  text-align: left;
  font-family: inherit;
  /* v7：与行文同 13px */
  font-size: 13px;
  line-height: 1.5;
  color: var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg, var(--text-muted)));
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  transition: color 0.15s ease;
}

.sidebar-newchat:hover,
.sidebar-newchat:focus-visible {
  color: var(--sidebar-row-ink, var(--ui-text-primary-fg, var(--text)));
}

.sidebar.collapsed {
  padding: 0;
  overflow: hidden;
  border: none;
  box-shadow: none;
}

/* 方案二 · 底部悬浮胶囊 dock —— v7 原样：白胶囊、9/15 内边距、裸 16px
   线性图标、图标间距 15、细分隔线、无边框，阴影同设计稿。 */
.sidebar-dock {
  display: flex;
  justify-content: center;
  flex-shrink: 0;
  min-width: 0;
  padding: 10px 8px 14px;
}

/* 自然宽 = 图标 6×16 + 分隔线 1 + 内边距 30 + 间距 6×15 = 217px。
   space-between 让间距在足宽时恰为 15px（=设计稿 gap），sidebar 收窄时
   间距均匀压缩、图标不缩，200px 也不溢出。 */
.sidebar-dock-pill {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: min(217px, 100%);
  min-width: 0;
  padding: 9px 15px;
  border-radius: 999px;
  /* 主题色：用主题自己的最亮面（主界面纸色），与 sidebar 同色相、亮一档，
     浮起感靠阴影——与设计稿 #fff/#f0efea 的微差关系一致。
     fx-base-50 是 flexoki 静态阶，色相与自定义主题会打架，不能用。 */
  background: var(--ui-surface-app-bg, var(--bg-app, #fff));
  box-shadow: var(--shadow-md, 0 3px 12px rgba(30, 26, 16, 0.13));
}

/* 暗色（html[data-theme='dark']）：flexoki 色阶翻转后 fx-base-50 变最深，
   胶囊改用主题的浮起面（比 sidebar 底亮一档，与弹层一致） */
:global(html[data-theme='dark']) .sidebar-dock-pill {
  background: var(--ui-surface-floating-bg, var(--bg-floating, var(--fx-base-300)));
}

.sidebar-dock-divider {
  width: 1px;
  height: 15px;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--sidebar-row-ink, var(--text)) 12%, transparent);
}

/* 裸图标即入口（v7）：无按钮盒、无填充。padding+负 margin 只扩点击热区，
   不改变 16px 的排版占位。 */
.sidebar-dock-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 4px;
  margin: -4px;
  border: none;
  background: transparent;
  color: color-mix(in srgb, var(--sidebar-row-ink, var(--text)) 56%, transparent);
  cursor: pointer;
  transition: color 0.15s ease;
}

.sidebar-dock-icon:hover,
.sidebar-dock-icon:focus-visible,
.sidebar-dock-icon.is-active {
  color: var(--sidebar-row-ink, var(--ui-text-primary-fg, var(--text)));
}

.sidebar-dock-icon:focus-visible {
  outline: none;
  border-radius: 6px;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 36%, transparent);
}

@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    height: 100%;
    z-index: 1000;
  }
}
</style>
