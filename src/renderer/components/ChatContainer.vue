<template>
  <div class="chat-container-wrapper">
    <!-- Hover trigger for floating sidebar -->
    <div
      v-if="showHoverTrigger"
      class="sidebar-hover-trigger"
      @mouseenter="$emit('show-floating-sidebar')"
      @mouseleave="$emit('hide-floating-sidebar')"
    />

    <div class="chat-panels">
      <!-- Empty state when no sessions -->
      <div
        v-if="!sessionsStore.currentSessionId"
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
      <!-- Chat panels when session exists -->
      <Splitter
        v-if="sessionsStore.currentSessionId"
        class="chat-panels-splitter"
        :gap="8"
      >
        <SplitterPanel
          v-for="(panel, index) in panels"
          :key="panel.id"
          v-model:size="panel.size"
          :min="12"
        >
          <ChatWindow
            :ref="el => setPanelRef(panel.id, el)"
            :session-id="panel.sessionId"
            :can-close="panels.length > 1"
            :show-settings="index === 0 && showSettings"
            :show-sidebar-toggle="index === 0 && sidebarCollapsed && !sidebarFloating"
            :media-panel-open="mediaPanelOpen"
            :is-inspector-open="isInspectorOpen"
            :reserve-sidebar-actions="index === 0 && reserveSidebarActions"
            :layout-transitioning="layoutTransitioning"
            :panel-focused="panels.length === 1 || panel.id === activePanelId"
            @pointerdown.capture="activePanelId = panel.id"
            @close="closePanel(panel.id)"
            @split="openSplitSearch(panel.id)"
            @equalize="equalizeAllPanels"
            @split-with-branch="(sessionId) => splitPanel(panel.id, sessionId)"
            @close-settings="$emit('close-settings')"
            @open-settings="$emit('open-settings')"
            @toggle-sidebar="$emit('toggle-sidebar')"
            @open-search="$emit('open-search')"
            @create-new-chat="$emit('create-new-chat')"
            @toggle-inspector="$emit('toggle-inspector')"
            @open-file="$emit('open-file', $event)"
            @switch-session="switchPanelSession(panel.id, $event)"
          />
        </SplitterPanel>
      </Splitter>

      <!-- Diff Overlay -->
      <DiffOverlay
        :visible="showDiffOverlay || false"
        :file-path="diffOverlayData?.filePath || ''"
        :working-directory="diffOverlayData?.workingDirectory || ''"
        :session-id="diffOverlayData?.sessionId || ''"
        :is-staged="diffOverlayData?.isStaged || false"
        @close="$emit('close-diff-overlay')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { ref, watch, nextTick } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { useChatStore } from '@/stores/chat'
import { platformApi } from '@/platform'
import ChatWindow from '@/components/chat/ChatWindow.vue'
import DiffOverlay from '@/components/chat/DiffOverlay.vue'
import Splitter from '@/components/common/Splitter.vue'
import SplitterPanel from '@/components/common/SplitterPanel.vue'

// Type for diff overlay data
interface DiffOverlayData {
  filePath: string
  workingDirectory: string
  sessionId: string
  isStaged: boolean
}

interface Panel {
  id: string
  sessionId: string
  size: number
}

defineProps<{
  showSettings?: boolean
  sidebarCollapsed?: boolean
  sidebarFloating?: boolean
  showHoverTrigger?: boolean
  mediaPanelOpen?: boolean
  showDiffOverlay?: boolean
  diffOverlayData?: DiffOverlayData | null
  isInspectorOpen?: boolean
  reserveSidebarActions?: boolean
  layoutTransitioning?: boolean
}>()

const emit = defineEmits<{
  'close-settings': []
  'open-settings': []
  'toggle-sidebar': []
  'open-search': []
  'create-new-chat': []
  'show-floating-sidebar': []
  'hide-floating-sidebar': []
  'close-diff-overlay': []
  'toggle-inspector': []
  'open-file': [filePath: string]
}>()

const sessionsStore = useSessionsStore()
const chatStore = useChatStore()

// Panel refs for focusing input
const panelRefs = ref<Record<string, InstanceType<typeof ChatWindow> | null>>({})

function setPanelRef(id: string, el: any) {
  panelRefs.value[id] = el
}

// Initialize with single panel
const panels = ref<Panel[]>([
  {
    id: 'main',
    sessionId: '',
    size: 100
  }
])

// Focused split panel: it shows the full header action group, the others
// collapse to just the close button. Any pointerdown inside a panel claims it.
const activePanelId = ref('main')

// Sync main panel with current session
watch(
  () => sessionsStore.currentSessionId,
  (sessionId) => {
    if (sessionId && panels.value.length > 0) {
      panels.value[0].sessionId = sessionId
    }
  },
  { immediate: true }
)

// Split goes through the Search Everywhere window: it opens locked to Chats
// with a split intent, and the chosen session comes back via search:action.
function openSplitSearch(panelId: string) {
  void platformApi.toggleSearchWindow({ intent: { type: 'split-panel', panelId } })
}

// Only the main panel goes through sessionsStore.switchSession, which owns
// message loading. Secondary panels get their session assigned directly, so
// their initial message page must be fetched here or they stay empty.
function ensurePanelSessionLoaded(sessionId: string) {
  if (!sessionId) return
  if (!sessionsStore.sessions.some(s => s.id === sessionId)) return
  const existing = chatStore.sessionMessages.get(sessionId)
  if (existing && existing.length > 0) return
  void chatStore.loadInitialMessagePage(sessionId)
}

// Split panel - create new panel with selected session
function splitPanel(panelId: string, sessionId: string) {
  const index = panels.value.findIndex(p => p.id === panelId)
  if (index === -1) return

  // Halve the size of current panel
  const currentSize = panels.value[index].size || 100 / Math.max(1, panels.value.length)
  panels.value[index].size = currentSize / 2

  // Insert new panel after current
  const newPanel: Panel = {
    id: `panel-${Date.now()}`,
    sessionId: sessionId,
    size: panels.value[index].size
  }
  panels.value.splice(index + 1, 0, newPanel)
  activePanelId.value = newPanel.id
  ensurePanelSessionLoaded(sessionId)
}

async function switchPanelSession(panelId: string, sessionId: string) {
  const panel = panels.value.find(p => p.id === panelId)
  if (!panel) return

  panel.sessionId = sessionId
  if (panel.id === panels.value[0]?.id) {
    await sessionsStore.switchSession(sessionId)
  } else {
    ensurePanelSessionLoaded(sessionId)
  }
}

// Close panel
function closePanel(panelId: string) {
  if (panels.value.length <= 1) return

  const index = panels.value.findIndex(p => p.id === panelId)
  if (index === -1) return

  // Give size to adjacent panel
  const removedSize = panels.value[index].size
  const targetIndex = index === 0 ? 1 : index - 1
  panels.value[targetIndex].size += removedSize

  if (activePanelId.value === panelId) {
    activePanelId.value = panels.value[targetIndex].id
  }
  panels.value.splice(index, 1)
}

// Equalize all panels - set equal size values
function equalizeAllPanels() {
  if (panels.value.length <= 1) return

  const equalSize = 100 / panels.value.length
  panels.value.forEach(panel => {
    panel.size = equalSize
  })
}

// Create new session from empty state
async function createNewSession() {
  sessionsStore.openNewChatDraft('New Chat')
  await nextTick()
  focusInput()
}

// Focus input of first panel
function focusInput() {
  let attempts = 0
  const maxAttempts = 4
  const focus = () => {
    attempts += 1
    const firstPanel = panels.value[0]
    if (firstPanel && panelRefs.value[firstPanel.id]) {
      panelRefs.value[firstPanel.id]?.focusInput()
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
  const firstPanel = panels.value[0]
  if (firstPanel && panelRefs.value[firstPanel.id]) {
    panelRefs.value[firstPanel.id]?.insertPromptReference(promptId)
  }
}

// Open a file in the app-level right workbench.
function openFileTab(filePath: string) {
  emit('open-file', filePath)
}

async function jumpToMessage(sessionId: string, messageId: string) {
  if (sessionsStore.currentSessionId !== sessionId) {
    await sessionsStore.switchSession(sessionId)
    await nextTick()
  }
  if (sessionsStore.currentSessionId !== sessionId) return false

  const panel = panels.value.find(item => item.sessionId === sessionId) || panels.value[0]
  if (!panel) return false

  panel.sessionId = sessionId
  await nextTick()

  const hasLoadedMessage = () => {
    return (chatStore.sessionMessages.get(sessionId) || []).some(message => message.id === messageId)
  }

  if (!hasLoadedMessage()) {
    const loaded = await chatStore.loadMessagesAround(sessionId, messageId)
    if (!loaded) return false
    await nextTick()
  }

  return panelRefs.value[panel.id]?.scrollToMessage?.(messageId) ?? false
}

// Expose methods
defineExpose({
  focusInput,
  insertPromptReference,
  openFileTab,
  jumpToMessage,
  splitPanel,
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

.chat-panels-splitter {
  display: flex;
  flex: 1;
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
