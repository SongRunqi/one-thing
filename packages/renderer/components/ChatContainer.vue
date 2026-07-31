<template>
  <div class="chat-container-wrapper">
    <!-- Hover trigger for floating sidebar -->
    <div
      v-if="showHoverTrigger"
      class="sidebar-hover-trigger"
      @mouseenter="$emit('show-floating-sidebar')"
      @mouseleave="$emit('hide-floating-sidebar')"
    />

    <div
      ref="chatPanelsRootRef"
      class="chat-panels"
    >
      <Container
        sidebar-position="right"
        :sidebar-width="chatSidePanelWidth"
        main-class="chat-panels-main"
        full-height
        overflow="hidden"
        main-overflow="hidden"
        sidebar-overflow="hidden"
      >
        <!-- Empty state when nothing is open -->
        <div
          v-if="!workspaceStore.hasAnyChatTab"
          class="empty-state"
        >
          <div class="empty-state-content">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <h3>No Active Chat</h3>
            <p>Start a new conversation to begin</p>
            <Button
              unstyled
              class="new-chat-btn"
              @click="createNewSession"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              New Chat
            </Button>
          </div>
        </div>
        <!-- Chat panels whenever anything is open. Keyed off the workspace
             store (not currentSessionId): tab/panel state lives in the store,
             so this v-if flipping only toggles the view, never the state. -->
        <PanelTree
          v-if="workspaceStore.hasAnyChatTab"
          class="chat-panels-tree"
          :node="workspaceStore.root"
          :active-leaf-id="workspaceStore.activeLeafId"
          :total-leaf-count="workspaceStore.leaves.length"
          :first-leaf-id="workspaceStore.leaves[0]?.id ?? ''"
          :reveal-sidebar-toggle="revealSidebarToggle"
          :media-panel-open="mediaPanelOpen"
          :is-inspector-open="isInspectorOpen"
          :reserve-sidebar-actions="reserveSidebarActions"
          :layout-transitioning="layoutTransitioning"
          :register-panel-ref="setPanelRef"
          :side-panel-available="sidePanelAvailable"
          :side-panel-collapsed="sidePanelCollapsed"
          :outline-rail-target="chatSideOutlineTarget"
          @panel-event="handlePanelEvent"
        />

        <template
          v-if="sidePanelVisible"
          #sidebar
        >
          <ChatSidePanel
            :session-id="activeLeafSession?.id"
            :working-directory="activeLeafSession?.workingDirectory || ''"
            :agent-id="activeLeafSession?.agentId"
            :last-provider="activeLeafSession?.lastProvider"
            :last-model="activeLeafSession?.lastModel"
            :collapsed="sidePanelCollapsed"
            @outline-target-change="handleSideOutlineTargetChange"
            @toggle-collapsed="toggleSidePanelCollapsed"
            @jump-to-message="(sessionId, messageId) => { void jumpToMessage(sessionId, messageId) }"
          />
        </template>
      </Container>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { useChatStore } from '@/stores/chat'
import { platformApi } from '@/platform'
import ChatWindow from '@/components/chat/ChatWindow.vue'
import ChatSidePanel from '@/components/chat/ChatSidePanel.vue'
import PanelTree from '@/components/chat/PanelTree.vue'
import Container from '@/components/common/Container.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useSettingsStore } from '@/stores/settings'
import { resolveShellMode } from '@/composables/useShellMode'
import type { SplitDirection } from '@/stores/workspace-tree'
import type { PanelEvent } from '@/components/chat/panel-event'

const props = defineProps<{
  sidebarCollapsed?: boolean
  sidebarFloating?: boolean
  showHoverTrigger?: boolean
  mediaPanelOpen?: boolean
  isInspectorOpen?: boolean
  reserveSidebarActions?: boolean
  layoutTransitioning?: boolean
}>()

const emit = defineEmits<{
  'toggle-sidebar': []
  'open-search': []
  'create-new-chat': []
  'show-floating-sidebar': []
  'hide-floating-sidebar': []
  'toggle-inspector': []
  'open-file': [filePath: string]
  'review-goal': [sessionId: string]
}>()

const sessionsStore = useSessionsStore()
const chatStore = useChatStore()

// Panel refs for focusing input, keyed by leaf id
const panelRefs = ref<Record<string, InstanceType<typeof ChatWindow> | null>>({})

function setPanelRef(id: string, el: unknown) {
  panelRefs.value[id] = el as InstanceType<typeof ChatWindow> | null
}

// Only the first (leftmost/topmost) leaf reserves titlebar space for the
// collapsed-sidebar toggle button.
const revealSidebarToggle = computed(() => !!props.sidebarCollapsed && !props.sidebarFloating)

// Split tree + tabs live in the workspace store (single owner, persisted as
// one tree); this component is a view over it.
const workspaceStore = useWorkspaceStore()

const activeLeafSession = computed(() => {
  const sessionId = workspaceStore.activeSessionId
  return sessionId ? sessionsStore.getSessionItem(sessionId) : null
})

// Single shared side panel (Outline/System prompt/Todo/Variables) for the
// whole split-panel workspace, reflecting whichever leaf is focused — moved
// up from ChatWindow.vue, which used to render one of these per split panel.
const CHAT_SIDE_PANEL_WIDTH = 268
const CHAT_SIDE_PANEL_COLLAPSED_WIDTH = 0
const CHAT_SIDE_PANEL_MIN_WINDOW_WIDTH = 1100
const CHAT_SIDE_PANEL_COLLAPSED_STORAGE_KEY = 'chatSidePanelCollapsed'

const chatPanelsRootRef = ref<HTMLElement | null>(null)
const chatSideOutlineTarget = ref<HTMLElement | null>(null)
const sidePanelAvailable = ref(false)
const sidePanelCollapsed = ref(localStorage.getItem(CHAT_SIDE_PANEL_COLLAPSED_STORAGE_KEY) === 'true')
let chatResizeObserver: ResizeObserver | null = null
const chatSidePanelWidth = computed(() =>
  activeLeafOnRoomSurface.value || sidePanelCollapsed.value
    ? CHAT_SIDE_PANEL_COLLAPSED_WIDTH
    : CHAT_SIDE_PANEL_WIDTH)

/**
 * 房 / 私聊新面上没有 ChatSidePanel(去复用重构 R1,§8.2):它的活(大纲 / 文件 /
 * 引用)并入右栏 tab 或房头动作。判定与 `ChatWindow.roomSurfaceActive` 同口径,
 * 只是这里看的是**当前聚焦的那个 leaf** —— 侧栏本来就只服务它。
 * classic 与直聊一个字节不变。
 */
const settingsStore = useSettingsStore()
const activeLeafOnRoomSurface = computed(() =>
  activeLeafSession.value?.kind === 'room' && resolveShellMode(settingsStore.settings) === 'workbench')

const sidePanelVisible = computed(() =>
  !activeLeafOnRoomSurface.value && (sidePanelAvailable.value || !sidePanelCollapsed.value))

function updateSidePanelAvailability() {
  const width = chatPanelsRootRef.value?.getBoundingClientRect().width ?? 0
  sidePanelAvailable.value = width >= CHAT_SIDE_PANEL_MIN_WINDOW_WIDTH
}

function observeChatWidth() {
  chatResizeObserver?.disconnect()
  chatResizeObserver = null
  const root = chatPanelsRootRef.value
  if (!root || typeof ResizeObserver === 'undefined') {
    updateSidePanelAvailability()
    return
  }
  chatResizeObserver = new ResizeObserver(updateSidePanelAvailability)
  chatResizeObserver.observe(root)
  updateSidePanelAvailability()
}

function handleSideOutlineTargetChange(target: HTMLElement | null) {
  chatSideOutlineTarget.value = !sidePanelCollapsed.value ? target : null
}

function toggleSidePanelCollapsed() {
  sidePanelCollapsed.value = !sidePanelCollapsed.value
  localStorage.setItem(CHAT_SIDE_PANEL_COLLAPSED_STORAGE_KEY, String(sidePanelCollapsed.value))
  if (sidePanelCollapsed.value) {
    chatSideOutlineTarget.value = null
  }
}

watch(sidePanelCollapsed, (collapsed) => {
  if (collapsed) {
    chatSideOutlineTarget.value = null
  }
})

onMounted(() => {
  nextTick(observeChatWidth)
})

onBeforeUnmount(() => {
  chatResizeObserver?.disconnect()
  chatResizeObserver = null
})

// Split goes through the Search Everywhere window: it opens locked to Chats
// with a split intent, and the chosen session comes back via search:action.
function openSplitSearch(leafId: string) {
  void platformApi.toggleSearchWindow({ intent: { type: 'split-panel', panelId: leafId } })
}

// Split a leaf - create a new leaf with the selected session. Public method:
// called by App.vue's Search Everywhere split flow with the legacy
// (leafId, sessionId) signature, so it keeps defaulting to a right split.
// The new leaf becomes active, so the workspace effect switches to (and
// loads) the session.
function splitPanel(leafId: string, sessionId: string) {
  workspaceStore.splitLeaf(leafId, sessionId, 'right')
}

async function switchLeafSession(leafId: string, sessionId: string) {
  workspaceStore.openSession(sessionId, { leafId })
}

function handleSplitDrop(leafId: string, sessionId: string, sourcePanelId: string, direction: SplitDirection) {
  const newLeafId = workspaceStore.splitLeaf(leafId, sessionId, direction)
  if (!newLeafId) return
  // The session moved panels: drop its tab in the source leaf only. It is
  // still open (in the new leaf), so no cache eviction is involved.
  workspaceStore.closeSessionTabs(sessionId, { onlyLeafId: sourcePanelId })
}

// Every ChatWindow (at any depth in the tree) funnels its events through a
// single `panel-event` bubbled up by PanelTree, tagged with its own leaf id.
function handlePanelEvent(event: PanelEvent) {
  switch (event.type) {
    case 'focus':
      workspaceStore.setActiveLeaf(event.leafId)
      break
    case 'openSplitSearch':
      openSplitSearch(event.leafId)
      break
    case 'equalize':
      workspaceStore.equalizeSiblings(event.leafId)
      break
    case 'splitWithBranch':
      splitPanel(event.leafId, event.sessionId)
      break
    case 'switchSession':
      void switchLeafSession(event.leafId, event.sessionId)
      break
    case 'splitDrop':
      handleSplitDrop(event.leafId, event.sessionId, event.sourcePanelId, event.direction)
      break
    case 'toggleSidePanel':
      toggleSidePanelCollapsed()
      break
    case 'toggleSidebar':
      emit('toggle-sidebar')
      break
    case 'openSearch':
      emit('open-search')
      break
    case 'createNewChat':
      emit('create-new-chat')
      break
    case 'toggleInspector':
      emit('toggle-inspector')
      break
    case 'openFile':
      emit('open-file', event.filePath)
      break
    case 'reviewGoal':
      emit('review-goal', event.sessionId)
      break
  }
}

// Create new session from empty state
async function createNewSession() {
  sessionsStore.openNewChatDraft('New Chat')
  await nextTick()
  focusInput()
}

// Focus input of the currently focused panel.
function focusInput() {
  let attempts = 0
  const maxAttempts = 4
  const focus = () => {
    attempts += 1
    const activeLeafId = workspaceStore.activeLeafId
    if (panelRefs.value[activeLeafId]) {
      panelRefs.value[activeLeafId]?.focusInput()
    }
    if (attempts >= maxAttempts) return
    nextTick(() => {
      const scheduleFrame = globalThis.requestAnimationFrame || ((callback: FrameRequestCallback) => window.setTimeout(callback, 0))
      scheduleFrame(focus)
    })
  }
  focus()
}

function insertPromptReference(promptId: string) {
  const activeLeafId = workspaceStore.activeLeafId
  panelRefs.value[activeLeafId]?.insertPromptReference(promptId)
}

// Open a file in the app-level right workbench.
function openFileTab(filePath: string) {
  emit('open-file', filePath)
}

async function jumpToMessage(sessionId: string, messageId: string) {
  // Prefer a leaf that already shows the session; otherwise open it in the
  // focused one. Focusing + activating first means the explicit switch below
  // reuses that exact tab.
  const leaf = workspaceStore.leaves.find(l => l.tabs.some(tab => tab.sessionId === sessionId))
    ?? workspaceStore.activeLeaf
  if (!leaf) return false
  workspaceStore.openSession(sessionId, { leafId: leaf.id })

  if (sessionsStore.currentSessionId !== sessionId) {
    await sessionsStore.switchSession(sessionId)
    await nextTick()
  }
  if (sessionsStore.currentSessionId !== sessionId) return false
  await nextTick()

  const hasLoadedMessage = () => {
    return (chatStore.sessionMessages.get(sessionId) || []).some(message => message.id === messageId)
  }

  if (!hasLoadedMessage()) {
    const loaded = await chatStore.loadMessagesAround(sessionId, messageId)
    if (!loaded) return false
    await nextTick()
  }

  return panelRefs.value[leaf.id]?.scrollToMessage?.(messageId) ?? false
}

// Cmd+1..9: applies to the currently focused panel's tabs only.
function selectFocusedPanelTabByIndex(digit: number) {
  panelRefs.value[workspaceStore.activeLeafId]?.selectTabByIndex?.(digit)
}

// Cmd+W: applies to the currently focused panel's active tab only.
function closeFocusedPanelActiveTab() {
  panelRefs.value[workspaceStore.activeLeafId]?.closeActiveTab?.()
}

// Expose methods
defineExpose({
  focusInput,
  insertPromptReference,
  openFileTab,
  jumpToMessage,
  splitPanel,
  selectFocusedPanelTabByIndex,
  closeFocusedPanelActiveTab,
})
</script>

<style scoped>
.chat-container-wrapper {
  flex: 1;
  height: 100%;
  padding: 0;
  background: var(--ui-surface-app-bg, var(--bg-app, var(--bg)));
  min-width: 0;
  min-height: 0;
  display: flex;
  position: relative;
  overflow: hidden;
}

/* Hover trigger for floating sidebar */
.sidebar-hover-trigger {
  position: absolute;
  left: 0;
  top: 40px;
  width: 12px;
  height: calc(100% - 40px);
  -webkit-app-region: no-drag;
  cursor: pointer;
  z-index: 10;
}

.chat-panels {
  flex: 1;
  display: flex;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.chat-panels :deep(.chat-panels-main) {
  display: flex;
  flex: 1 1 0;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.chat-panels-tree {
  flex: 1;
  display: flex;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

/* Full page container for CreateAgent, etc. */
.full-page-container {
  flex: 1;
  display: flex;
  background: var(--ui-surface-chat-bg, var(--bg-chat, var(--ui-surface-panel-bg, var(--bg-panel, var(--bg-elevated)))));
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 84%, transparent);
  border-radius: 10px;
  box-shadow:
    0 10px 28px rgba(0, 0, 0, 0.16),
    inset 0 1px 0 color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 5%, transparent);
  overflow: hidden;
}

/* Empty state when no sessions */
.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ui-surface-chat-bg, var(--bg-chat, var(--ui-surface-panel-bg, var(--bg-panel, var(--bg-elevated)))));
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 84%, transparent);
  border-radius: 10px;
  box-shadow:
    0 10px 28px rgba(0, 0, 0, 0.16),
    inset 0 1px 0 color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 5%, transparent);
  position: relative;
  -webkit-app-region: drag;
  overflow: hidden;
}

.empty-state-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--ui-text-muted-fg, var(--muted));
  text-align: center;
  -webkit-app-region: no-drag;
}

.empty-state-content svg {
  opacity: 0.5;
}

.empty-state-content h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--ui-text-primary-fg, var(--text));
}

.empty-state-content p {
  margin: 0;
  font-size: 14px;
}

.new-chat-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 10px 20px;
  background: var(--ui-action-primary-bg, var(--ui-accent-primary-fg, var(--accent)));
  color: var(--ui-action-primary-fg, var(--ui-text-inverse-fg, white));
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  -webkit-app-region: no-drag;
}

.new-chat-btn:hover {
  background: var(--ui-action-primary-hover-bg, var(--ui-action-primary-bg, var(--ui-accent-primary-fg, var(--accent))));
  transform: translateY(-1px);
}
</style>
