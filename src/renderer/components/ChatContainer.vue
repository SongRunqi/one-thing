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
            :show-sidebar-toggle="sidebarCollapsed && !sidebarFloating"
            :media-panel-open="mediaPanelOpen"
            :is-inspector-open="isInspectorOpen"
            :reserve-sidebar-actions="reserveSidebarActions"
            :layout-transitioning="layoutTransitioning"
            @close="closePanel(panel.id)"
            @split="openSessionPicker(panel.id)"
            @equalize="equalizeAllPanels"
            @split-with-branch="(sessionId) => splitPanel(panel.id, sessionId)"
            @close-settings="$emit('close-settings')"
            @open-settings="$emit('open-settings')"
            @toggle-sidebar="$emit('toggle-sidebar')"
            @open-search="$emit('open-search')"
            @create-new-chat="$emit('create-new-chat')"
            @toggle-inspector="$emit('toggle-inspector')"
            @open-file="$emit('open-file', $event)"
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

    <!-- Session Picker Dialog -->
    <Teleport to="body">
      <div
        v-if="showSessionPicker"
        class="session-picker-overlay"
        @click.self="closeSessionPicker"
      >
        <div class="session-picker-dialog">
          <div class="session-picker-header">
            <h3>Select Session for Split View</h3>
            <Button
              unstyled
              class="close-btn"
              @click="closeSessionPicker"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </Button>
          </div>
          <div class="session-picker-search">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle
                cx="11"
                cy="11"
                r="8"
              />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              ref="sessionSearchInput"
              v-model="sessionSearchQuery"
              type="text"
              placeholder="Search sessions..."
              @keydown.escape="closeSessionPicker"
            >
          </div>
          <div class="session-picker-list">
            <!-- New Chat option (only show when not searching) -->
            <Button
              v-if="!sessionSearchQuery.trim()"
              unstyled
              class="session-picker-item new-chat-item"
              @click="createNewChatForSplit"
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
              <span class="session-name">New Chat</span>
              <span class="new-badge">Create</span>
            </Button>

            <!-- Existing sessions -->
            <Button
              v-for="session in filteredSessions"
              :key="session.id"
              unstyled
              class="session-picker-item"
              :class="{ current: session.id === sessionsStore.currentSessionId }"
              @click="selectSessionForSplit(session.id)"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span class="session-name">{{ session.name || 'New chat' }}</span>
              <span
                v-if="session.id === sessionsStore.currentSessionId"
                class="current-badge"
              >Current</span>
            </Button>
            <div
              v-if="filteredSessions.length === 0"
              class="no-sessions"
            >
              No sessions found
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { ref, computed, watch, nextTick } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { useChatStore } from '@/stores/chat'
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

// Session picker state
const showSessionPicker = ref(false)
const sessionSearchQuery = ref('')
const sessionSearchInput = ref<HTMLInputElement | null>(null)
const splitFromPanelId = ref<string | null>(null)

// Filtered sessions for picker
const filteredSessions = computed(() => {
  const sessions = sessionsStore.sessions
  if (!sessionSearchQuery.value.trim()) {
    return sessions.slice(0, 20)
  }
  const query = sessionSearchQuery.value.toLowerCase()
  return sessions.filter(s =>
    (s.name || '').toLowerCase().includes(query)
  ).slice(0, 20)
})

// Open session picker
function openSessionPicker(panelId: string) {
  splitFromPanelId.value = panelId
  sessionSearchQuery.value = ''
  showSessionPicker.value = true
  nextTick(() => {
    sessionSearchInput.value?.focus()
  })
}

// Close session picker
function closeSessionPicker() {
  showSessionPicker.value = false
  splitFromPanelId.value = null
  sessionSearchQuery.value = ''
}

// Select session and create split
function selectSessionForSplit(sessionId: string) {
  if (!splitFromPanelId.value) return
  splitPanel(splitFromPanelId.value, sessionId)
  closeSessionPicker()
}

// Create new chat for split view
async function createNewChatForSplit() {
  if (!splitFromPanelId.value) return

  // Create new session without switching to it
  const newSession = await sessionsStore.createSessionWithoutSwitch('New Chat')
  if (newSession) {
    splitPanel(splitFromPanelId.value, newSession.id)
  }
  closeSessionPicker()
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
}

// Focus input of first panel
function focusInput() {
  const firstPanel = panels.value[0]
  if (firstPanel && panelRefs.value[firstPanel.id]) {
    panelRefs.value[firstPanel.id]?.focusInput()
  }
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

/* Session Picker Dialog */
.session-picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 100px;
  z-index: 1000;
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.session-picker-dialog {
  width: 400px;
  max-height: 500px;
  background: var(--ui-surface-panel-bg, var(--panel));
  border-radius: 12px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: slideDown 0.2s cubic-bezier(0.32, 0.72, 0, 1);
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.session-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--ui-border-default-border, var(--border));
}

.session-picker-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--ui-text-primary-fg, var(--text));
}

.session-picker-header .close-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
  transition: all 0.15s ease;
}

.session-picker-header .close-btn:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.session-picker-search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--ui-border-default-border, var(--border));
}

.session-picker-search svg {
  color: var(--ui-text-muted-fg, var(--muted));
  flex-shrink: 0;
}

.session-picker-search input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: var(--ui-text-primary-fg, var(--text));
  outline: none;
}

.session-picker-search input::placeholder {
  color: var(--ui-text-muted-fg, var(--muted));
}

.session-picker-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.session-picker-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: all 0.12s ease;
}

.session-picker-item:hover {
  background: var(--ui-state-hover-bg, var(--hover));
}

.session-picker-item.current {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 10%, transparent);
}

.session-picker-item svg {
  color: var(--ui-text-muted-fg, var(--muted));
  flex-shrink: 0;
}

.session-picker-item .session-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-picker-item .current-badge {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--ui-accent-primary-fg, var(--accent));
  color: white;
  border-radius: 4px;
  flex-shrink: 0;
}

.session-picker-item.new-chat-item {
  border-bottom: 1px solid var(--ui-border-default-border, var(--border));
  margin-bottom: 4px;
  padding-bottom: 10px;
}

.session-picker-item.new-chat-item svg {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.session-picker-item.new-chat-item:hover {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 10%, transparent);
}

.session-picker-item .new-badge {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--ui-accent-primary-fg, var(--accent));
  color: white;
  border-radius: 4px;
  flex-shrink: 0;
}

.no-sessions {
  padding: 20px;
  text-align: center;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 14px;
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
