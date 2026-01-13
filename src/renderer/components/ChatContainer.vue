<template>
  <div :class="['chat-container-wrapper', { 'sidebar-collapsed': sidebarCollapsed }]">
    <!-- Hover trigger for floating sidebar -->
    <div
      v-if="showHoverTrigger"
      class="sidebar-hover-trigger"
      @mouseenter="$emit('show-floating-sidebar')"
      @mouseleave="$emit('hide-floating-sidebar')"
    ></div>

    <!-- Memory Editor View (full-screen mode) -->
    <div v-if="selectedMemoryFilePath" class="chat-panels">
      <div class="full-page-container">
        <MemoryEditor
          :file-path="selectedMemoryFilePath"
          @close="$emit('close-memory-file')"
        />
      </div>
    </div>

    <!-- Create/Edit Agent Page (full-screen mode) -->
    <div v-else-if="showAgentCreate || editingAgent" class="chat-panels">
      <div class="full-page-container">
        <CreateAgentPage
          :agent="editingAgent"
          @created="handleAgentCreated"
          @saved="handleAgentSaved"
          @close="$emit('close-agent-create')"
        />
      </div>
    </div>

    <div v-else class="chat-panels">
      <!-- Empty state when no sessions -->
      <div v-if="!sessionsStore.currentSessionId" class="empty-state">
        <div class="empty-state-content">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <h3>No Active Chat</h3>
          <p>Start a new conversation to begin</p>
          <button class="new-chat-btn" @click="createNewSession">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            New Chat
          </button>
        </div>
      </div>
      <!-- Chat panels when session exists -->
      <ChatWindow
        v-else
        v-for="(panel, index) in panels"
        :key="panel.id"
        :ref="el => setPanelRef(panel.id, el)"
        :session-id="panel.sessionId"
        :can-close="panels.length > 1"
        :style="{ flex: panel.flex }"
        :show-settings="index === 0 && showSettings"
        :show-agent-settings="index === 0 && showAgentSettings"
        :show-sidebar-toggle="index === 0 && sidebarCollapsed && !sidebarFloating && !mediaPanelOpen"
        @close="closePanel(panel.id)"
        @split="openSessionPicker(panel.id)"
        @equalize="equalizeAllPanels"
        @split-with-branch="(sessionId) => splitPanel(panel.id, sessionId)"
        @close-settings="$emit('close-settings')"
        @open-settings="$emit('open-settings')"
        @close-agent-settings="$emit('close-agent-settings')"
        @open-agent-settings="$emit('open-agent-settings')"
        @toggle-sidebar="$emit('toggle-sidebar')"
      />
      <!-- Panel resizer -->
      <div
        v-for="(panel, index) in panels.slice(0, -1)"
        :key="'resizer-' + panel.id"
        class="panel-resizer"
        :style="{ left: getResizerPosition(index) }"
        @mousedown="startResize($event, index)"
      />

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
      <div v-if="showSessionPicker" class="session-picker-overlay" @click.self="closeSessionPicker">
        <div class="session-picker-dialog">
          <div class="session-picker-header">
            <h3>Select Session for Split View</h3>
            <button class="close-btn" @click="closeSessionPicker">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="session-picker-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              ref="sessionSearchInput"
              v-model="sessionSearchQuery"
              type="text"
              placeholder="Search sessions..."
              @keydown.escape="closeSessionPicker"
            />
          </div>
          <div class="session-picker-list">
            <!-- New Chat option (only show when not searching) -->
            <button
              v-if="!sessionSearchQuery.trim()"
              class="session-picker-item new-chat-item"
              @click="createNewChatForSplit"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              <span class="session-name">New Chat</span>
              <span class="new-badge">Create</span>
            </button>

            <!-- Existing sessions -->
            <button
              v-for="session in filteredSessions"
              :key="session.id"
              class="session-picker-item"
              :class="{ current: session.id === sessionsStore.currentSessionId }"
              @click="selectSessionForSplit(session.id)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <span class="session-name">{{ session.name || 'New chat' }}</span>
              <span v-if="session.id === sessionsStore.currentSessionId" class="current-badge">Current</span>
            </button>
            <div v-if="filteredSessions.length === 0" class="no-sessions">
              No sessions found
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import ChatWindow from '@/components/chat/ChatWindow.vue'
import CreateAgentPage from '@/components/agent/CreateAgentPage.vue'
import MemoryEditor from '@/components/MemoryEditor.vue'
import DiffOverlay from '@/components/chat/DiffOverlay.vue'
import type { CustomAgent } from '@/types'

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
  flex: number
}

const props = defineProps<{
  showSettings?: boolean
  showAgentSettings?: boolean
  sidebarCollapsed?: boolean
  sidebarFloating?: boolean
  showHoverTrigger?: boolean
  mediaPanelOpen?: boolean
  showAgentCreate?: boolean
  editingAgent?: CustomAgent | null
  selectedMemoryFilePath?: string | null
  showDiffOverlay?: boolean
  diffOverlayData?: DiffOverlayData | null
}>()

const emit = defineEmits<{
  'close-settings': []
  'open-settings': []
  'close-agent-settings': []
  'open-agent-settings': []
  'toggle-sidebar': []
  'show-floating-sidebar': []
  'hide-floating-sidebar': []
  'close-agent-create': []
  'agent-created': [agent: CustomAgent]
  'agent-saved': [agent: CustomAgent]
  'close-memory-file': []
  'close-diff-overlay': []
}>()

// Handle agent creation
function handleAgentCreated(agent: CustomAgent) {
  emit('agent-created', agent)
}

// Handle agent save (edit mode)
function handleAgentSaved(agent: CustomAgent) {
  emit('agent-saved', agent)
}

const sessionsStore = useSessionsStore()

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
    flex: 1
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

  // Halve the flex of current panel
  panels.value[index].flex = panels.value[index].flex / 2

  // Insert new panel after current
  const newPanel: Panel = {
    id: `panel-${Date.now()}`,
    sessionId: sessionId,
    flex: panels.value[index].flex
  }
  panels.value.splice(index + 1, 0, newPanel)
}

// Close panel
function closePanel(panelId: string) {
  if (panels.value.length <= 1) return

  const index = panels.value.findIndex(p => p.id === panelId)
  if (index === -1) return

  // Give flex to adjacent panel
  const removedFlex = panels.value[index].flex
  const targetIndex = index === 0 ? 1 : index - 1
  panels.value[targetIndex].flex += removedFlex

  panels.value.splice(index, 1)
}

// Resizing state
const isResizing = ref(false)
const resizeIndex = ref(-1)
const startX = ref(0)
const startFlexes = ref<number[]>([])

function getResizerPosition(index: number): string {
  let totalFlex = 0
  for (let i = 0; i <= index; i++) {
    totalFlex += panels.value[i].flex
  }
  const totalFlexAll = panels.value.reduce((sum, p) => sum + p.flex, 0)
  return `calc(${(totalFlex / totalFlexAll) * 100}% - 2px)`
}

function startResize(event: MouseEvent, index: number) {
  isResizing.value = true
  resizeIndex.value = index
  startX.value = event.clientX
  startFlexes.value = panels.value.map(p => p.flex)

  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function handleResize(event: MouseEvent) {
  if (!isResizing.value || resizeIndex.value === -1) return

  const container = document.querySelector('.chat-panels')
  if (!container) return

  const containerWidth = container.clientWidth
  const deltaX = event.clientX - startX.value
  const deltaFlex = (deltaX / containerWidth) * startFlexes.value.reduce((a, b) => a + b, 0)

  const leftPanel = panels.value[resizeIndex.value]
  const rightPanel = panels.value[resizeIndex.value + 1]

  const newLeftFlex = startFlexes.value[resizeIndex.value] + deltaFlex
  const newRightFlex = startFlexes.value[resizeIndex.value + 1] - deltaFlex

  // Minimum flex value
  const minFlex = 0.2

  if (newLeftFlex >= minFlex && newRightFlex >= minFlex) {
    leftPanel.flex = newLeftFlex
    rightPanel.flex = newRightFlex
  }
}

function stopResize() {
  isResizing.value = false
  resizeIndex.value = -1
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

// Equalize all panels - set equal flex values
function equalizeAllPanels() {
  if (panels.value.length <= 1) return

  const equalFlex = 1 / panels.value.length
  panels.value.forEach(panel => {
    panel.flex = equalFlex
  })
}

// Create new session from empty state
async function createNewSession() {
  await sessionsStore.createSession('New Chat')
}

// Focus input of first panel
function focusInput() {
  const firstPanel = panels.value[0]
  if (firstPanel && panelRefs.value[firstPanel.id]) {
    panelRefs.value[firstPanel.id]?.focusInput()
  }
}

// Expose methods
defineExpose({
  focusInput
})

onUnmounted(() => {
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
})
</script>

<style scoped>
.chat-container-wrapper {
  flex: 1;
  padding: 12px;
  padding-left: 0px;
  /* Slightly darker base for "surface" effect */
  background: var(--bg-sunken, color-mix(in srgb, var(--bg) 95%, black));
  -webkit-app-region: drag;
  min-width: 0;
  display: flex;
  position: relative;
}

.chat-container-wrapper.sidebar-collapsed {
  padding-left: 12px;
}

/* Hover trigger for floating sidebar */
.sidebar-hover-trigger {
  position: absolute;
  left: 0;
  top: 0;
  width: 12px;
  height: 100%;
  -webkit-app-region: no-drag;
  cursor: pointer;
  z-index: 10;
}

.chat-panels {
  flex: 1;
  display: flex;
  height: 100%;
  gap: 8px;
  -webkit-app-region: no-drag;
  position: relative;
  overflow: hidden;
  /* Ensure proper border-radius clipping for child panels */
  border-radius: var(--radius-lg);
}

.panel-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 4px;
  background: transparent;
  cursor: col-resize;
  z-index: 10;
  transition: background 0.15s ease;
}

.panel-resizer:hover,
.panel-resizer:active {
  background: var(--accent);
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
  background: var(--panel);
  border-radius: 12px;
  border: 1px solid var(--border);
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
  border-bottom: 1px solid var(--border);
}

.session-picker-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
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
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.session-picker-header .close-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.session-picker-search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.session-picker-search svg {
  color: var(--muted);
  flex-shrink: 0;
}

.session-picker-search input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: var(--text);
  outline: none;
}

.session-picker-search input::placeholder {
  color: var(--muted);
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
  color: var(--text);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: all 0.12s ease;
}

.session-picker-item:hover {
  background: var(--hover);
}

.session-picker-item.current {
  background: rgba(var(--accent-rgb), 0.1);
}

.session-picker-item svg {
  color: var(--muted);
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
  background: var(--accent);
  color: white;
  border-radius: 4px;
  flex-shrink: 0;
}

.session-picker-item.new-chat-item {
  border-bottom: 1px solid var(--border);
  margin-bottom: 4px;
  padding-bottom: 10px;
}

.session-picker-item.new-chat-item svg {
  color: var(--accent);
}

.session-picker-item.new-chat-item:hover {
  background: rgba(var(--accent-rgb), 0.1);
}

.session-picker-item .new-badge {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--accent);
  color: white;
  border-radius: 4px;
  flex-shrink: 0;
}

.no-sessions {
  padding: 20px;
  text-align: center;
  color: var(--muted);
  font-size: 14px;
}

/* Full page container for CreateAgent, etc. */
.full-page-container {
  flex: 1;
  display: flex;
  background: var(--bg-panel, var(--bg-elevated, var(--bg-chat)));
  border-radius: var(--radius-lg);
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.15),
    0 8px 16px rgba(0, 0, 0, 0.2),
    0 20px 40px rgba(0, 0, 0, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

/* Empty state when no sessions */
.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-panel, var(--bg-elevated, var(--bg-chat)));
  border-radius: var(--radius-lg);
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.15),
    0 8px 16px rgba(0, 0, 0, 0.2),
    0 20px 40px rgba(0, 0, 0, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.empty-state-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--muted);
  text-align: center;
}

.empty-state-content svg {
  opacity: 0.5;
}

.empty-state-content h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
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
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.new-chat-btn:hover {
  background: var(--accent-hover, var(--accent));
  transform: translateY(-1px);
}
</style>
