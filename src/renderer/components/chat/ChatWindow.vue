<template>
  <main class="chat">
    <!-- Chat Header / Title Bar -->
    <header class="chat-header">
      <div class="chat-header-left">
        <!-- Sidebar toggle button (when sidebar is hidden) -->
        <button
          v-if="showSidebarToggle"
          class="chat-header-btn sidebar-toggle-btn"
          title="Show sidebar"
          @click="emit('toggleSidebar')"
        >
          <PanelLeft :size="16" :stroke-width="2" />
        </button>

        <!-- Agent Selector (icon position) -->
        <button
          class="agent-icon-btn"
          :class="{ 'has-agent': sessionAgent }"
          @click="toggleAgentDropdown"
          title="Select agent"
        >
          <template v-if="sessionAgent">
            <span v-if="sessionAgent.avatar.type === 'emoji'" class="agent-icon-avatar">
              {{ sessionAgent.avatar.value }}
            </span>
            <img
              v-else
              :src="'file://' + sessionAgent.avatar.value"
              class="agent-icon-avatar-img"
              alt=""
            />
          </template>
          <MessageSquare v-else :size="16" :stroke-width="2" />
          <ChevronDown class="agent-icon-chevron" :size="10" :stroke-width="2.5" />
        </button>

        <!-- Agent Dropdown -->
        <Teleport to="body">
          <div
            v-if="showAgentDropdown"
            class="agent-dropdown-backdrop"
            @click="showAgentDropdown = false"
          ></div>
          <div
            v-if="showAgentDropdown"
            class="agent-dropdown"
            :style="agentDropdownStyle"
          >
            <div class="agent-dropdown-header">Select Agent</div>
            <div class="agent-dropdown-list">
              <!-- No Agent option -->
              <button
                class="agent-dropdown-item"
                :class="{ active: !sessionAgent }"
                @click="selectAgent(null)"
              >
                <div class="agent-dropdown-icon">
                  <MessageSquare :size="16" :stroke-width="2" />
                </div>
                <span class="agent-dropdown-name">No Agent</span>
              </button>
              <!-- Agent options -->
              <button
                v-for="agent in agentsStore.agents"
                :key="agent.id"
                class="agent-dropdown-item"
                :class="{ active: sessionAgent?.id === agent.id }"
                @click="selectAgent(agent.id)"
              >
                <span v-if="agent.avatar.type === 'emoji'" class="agent-dropdown-emoji">
                  {{ agent.avatar.value }}
                </span>
                <img
                  v-else
                  :src="'file://' + agent.avatar.value"
                  class="agent-dropdown-img"
                  alt=""
                />
                <span class="agent-dropdown-name">{{ agent.name }}</span>
              </button>
            </div>
          </div>
        </Teleport>

        <!-- Working Directory Button -->
        <button
          class="working-dir-btn"
          :class="{ 'has-dir': currentSession?.workingDirectory }"
          :title="currentSession?.workingDirectory || 'Set working directory'"
          @click="openWorkingDirectoryPicker"
        >
          <Folder :size="14" :stroke-width="2" />
          <span v-if="currentSession?.workingDirectory" class="working-dir-name">
            {{ workingDirName }}
          </span>
        </button>

        <!-- Title (editable) -->
        <input
          v-if="isEditingTitle"
          ref="titleInputRef"
          v-model="editingTitleValue"
          class="chat-header-title-input"
          @blur="saveTitle"
          @keydown.enter="saveTitle"
          @keydown.escape="cancelEditTitle"
        />
        <span
          v-else
          class="chat-header-title"
          @click="startEditTitle"
        >
          {{ currentSession?.name || 'New chat' }}
        </span>
      </div>

      <div class="chat-header-right">
        <!-- Back to parent (for branch sessions) -->
        <button
          v-if="isBranchSession"
          class="chat-header-btn back-btn"
          title="Back to parent chat"
          @click="goToParentSession"
        >
          <ArrowLeft :size="14" :stroke-width="2" />
        </button>

        <!-- Message count -->
        <span class="chat-header-meta">{{ messageCount }} msg</span>

        <!-- Split button -->
        <button
          v-if="canClose !== undefined"
          class="chat-header-btn"
          title="Split view"
          @click="emit('split')"
        >
          <Columns2 :size="14" :stroke-width="2" />
        </button>

        <!-- Close button (for multi-panel) -->
        <button
          v-if="canClose"
          class="chat-header-btn close-btn"
          title="Close panel"
          @click="emit('close')"
        >
          <X :size="14" :stroke-width="2" />
        </button>
      </div>
    </header>

    <!-- Agent Welcome Page (when session has agent and no messages) -->
    <AgentWelcomePage
      v-if="showAgentWelcome && sessionAgent"
      :agent="sessionAgent"
      @start-chat="handleStartAgentChat"
      @open-settings="emit('openAgentSettings')"
    />

    <!-- Chat View (when not showing agent welcome) -->
    <div v-else class="chat-container">
      <div class="chat-main">
        <MessageList
          :messages="panelMessages"
          :is-loading="isLoading"
          :session-id="effectiveSessionId"
          @set-quoted-text="handleSetQuotedText"
          @set-input-text="handleSetInputText"
          @regenerate="handleRegenerate"
          @edit-and-resend="handleEditAndResend"
        />

        <div class="composer">
          <InputBox ref="inputBoxRef" @send-message="handleSendMessage" @stop-generation="handleStopGeneration" @open-tool-settings="handleOpenToolSettings" :is-loading="isGenerating" :session-id="effectiveSessionId" />
        </div>
      </div>
    </div>

    <!-- Settings Panel overlay -->
    <Transition name="settings-fade">
      <SettingsPanel v-if="showSettings" @close="emit('closeSettings')" />
    </Transition>

    <!-- Agent Settings Panel overlay -->
    <Transition name="settings-fade">
      <AgentSettingsPanel
        v-if="showAgentSettings"
        :agent="agentsStore.selectedAgent"
        @close="emit('closeAgentSettings')"
      />
    </Transition>
  </main>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, watch, toRef } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { useAgentsStore } from '@/stores/agents'
import { useChatSession } from '@/composables/useChatSession'
import MessageList from './MessageList.vue'
import InputBox from './InputBox.vue'
import SettingsPanel from '../SettingsPanel.vue'
import AgentSettingsPanel from '../AgentSettingsPanel.vue'
import AgentWelcomePage from './AgentWelcomePage.vue'
import { PanelLeft, MessageSquare, ChevronDown, Folder, ArrowLeft, Columns2, X } from 'lucide-vue-next'

interface Props {
  showSettings?: boolean
  showAgentSettings?: boolean
  sessionId?: string
  canClose?: boolean
  showSidebarToggle?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showSettings: false,
  showAgentSettings: false,
  showSidebarToggle: false,
})

const emit = defineEmits<{
  closeSettings: []
  openSettings: []
  closeAgentSettings: []
  openAgentSettings: []
  close: []
  split: []
  toggleSidebar: []
}>()

const sessionsStore = useSessionsStore()
const agentsStore = useAgentsStore()

// Get effective session ID (props.sessionId or current session)
const effectiveSessionId = computed(() => props.sessionId || sessionsStore.currentSessionId)

// Use independent chat session state
const {
  messages,
  isLoading,
  isGenerating,
  sendMessage: chatSendMessage,
  regenerate: chatRegenerate,
  editAndResend: chatEditAndResend,
  stopGeneration: chatStopGeneration,
} = useChatSession(effectiveSessionId)

// Get the session for this panel
const currentSession = computed(() => {
  const sid = effectiveSessionId.value
  if (!sid) return null
  return sessionsStore.sessions.find(s => s.id === sid) || null
})

// Messages for this panel (from composable)
const panelMessages = computed(() => messages.value)

// Get the agent for current session
const sessionAgent = computed(() => {
  const agentId = currentSession.value?.agentId
  if (!agentId) return null
  return agentsStore.agents.find(a => a.id === agentId) || null
})

// Message count
const messageCount = computed(() => panelMessages.value.length)

// Check if current session is a branch
const isBranchSession = computed(() => !!currentSession.value?.parentSessionId)

// Get working directory name (last folder in path)
const workingDirName = computed(() => {
  const dir = currentSession.value?.workingDirectory
  if (!dir) return ''
  const parts = dir.replace(/\/$/, '').split('/')
  return parts[parts.length - 1] || dir
})

// Go back to parent session
async function goToParentSession() {
  if (currentSession.value?.parentSessionId) {
    await sessionsStore.switchSession(currentSession.value.parentSessionId)
  }
}

// Open folder picker to set working directory
async function openWorkingDirectoryPicker() {
  if (!currentSession.value) return

  const result = await window.electronAPI.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Working Directory',
    defaultPath: currentSession.value.workingDirectory || undefined,
  })

  if (!result.canceled && result.filePaths.length > 0) {
    await sessionsStore.updateSessionWorkingDirectory(currentSession.value.id, result.filePaths[0])
  }
}

// Title editing state
const isEditingTitle = ref(false)
const editingTitleValue = ref('')

// Agent selector state
const showAgentDropdown = ref(false)
const agentSelectorRef = ref<HTMLElement | null>(null)
const agentDropdownStyle = ref({})

function toggleAgentDropdown(event: MouseEvent) {
  showAgentDropdown.value = !showAgentDropdown.value
  if (showAgentDropdown.value) {
    const btn = event.currentTarget as HTMLElement
    const rect = btn.getBoundingClientRect()
    agentDropdownStyle.value = {
      top: `${rect.bottom + 4}px`,
      left: `${rect.left}px`,
      minWidth: `${Math.max(rect.width, 180)}px`
    }
  }
}

async function selectAgent(agentId: string | null) {
  const sessionId = currentSession.value?.id
  if (!sessionId) return

  try {
    await window.electronAPI.updateSessionAgent(sessionId, agentId)
    // Update local session data
    const session = sessionsStore.sessions.find(s => s.id === sessionId)
    if (session) {
      if (agentId) {
        session.agentId = agentId
      } else {
        delete session.agentId
      }
    }
  } catch (error) {
    console.error('Failed to update session agent:', error)
  }
  showAgentDropdown.value = false
}
const titleInputRef = ref<HTMLInputElement | null>(null)

function startEditTitle() {
  if (!currentSession.value) return
  editingTitleValue.value = currentSession.value.name || ''
  isEditingTitle.value = true
  nextTick(() => {
    titleInputRef.value?.focus()
    titleInputRef.value?.select()
  })
}

async function saveTitle() {
  if (!currentSession.value || !isEditingTitle.value) return
  const newName = editingTitleValue.value.trim()
  if (newName && newName !== currentSession.value.name) {
    await sessionsStore.renameSession(currentSession.value.id, newName)
  }
  isEditingTitle.value = false
}

function cancelEditTitle() {
  isEditingTitle.value = false
  editingTitleValue.value = ''
}

// Agent welcome page disabled - go straight to chat
const showAgentWelcome = computed(() => false)

// Input box ref for setting quoted text
const inputBoxRef = ref<InstanceType<typeof InputBox> | null>(null)

// Handle open tool settings from InputBox - opens settings in new window
function handleOpenToolSettings() {
  window.electronAPI.openSettingsWindow()
}

// Handle starting a new chat with the session's agent
async function handleStartAgentChat() {
  // Session already has the agent assigned, just focus the input
  inputBoxRef.value?.focus()
}

async function handleSendMessage(message: string, attachments?: import('@/types').MessageAttachment[]) {
  if (!currentSession.value) return
  await chatSendMessage(message, attachments)
}

async function handleStopGeneration() {
  await chatStopGeneration()
}

function handleSetQuotedText(text: string) {
  // Set quoted text in the input box
  if (inputBoxRef.value) {
    inputBoxRef.value.setQuotedText(text)
  }
}

async function handleRegenerate(messageId: string) {
  if (!currentSession.value) return
  await chatRegenerate(messageId)
}

async function handleEditAndResend(messageId: string, newContent: string) {
  if (!currentSession.value) return
  await chatEditAndResend(messageId, newContent)
}

function handleSetInputText(text: string) {
  if (inputBoxRef.value) {
    inputBoxRef.value.setMessageInput(text)
  }
}

// Focus the input box (for keyboard shortcuts)
function focusInput() {
  inputBoxRef.value?.focus()
}

// Expose methods for parent component
defineExpose({
  focusInput,
})
</script>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  background: var(--chat-canvas);
  position: relative;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.12),
    0 8px 24px rgba(0, 0, 0, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

html[data-theme='light'] .chat {
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.06),
    0 8px 24px rgba(0, 0, 0, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(0, 0, 0, 0.08);
}

/* Chat Header / Title Bar */
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  padding: 0 16px;
  background: rgba(var(--bg-rgb), 0.5);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  flex-shrink: 0;
  -webkit-app-region: drag;
}

.chat-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.chat-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-header-icon {
  flex-shrink: 0;
  color: var(--muted);
  opacity: 0.6;
}

.chat-header-avatar {
  font-size: 16px;
  line-height: 1;
  flex-shrink: 0;
}

.chat-header-avatar-img {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
}

.chat-header-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--accent-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: text;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.15s ease;
  -webkit-app-region: no-drag;
}

.chat-header-title:hover {
  background: rgba(255, 255, 255, 0.05);
}

html[data-theme='light'] .chat-header-title:hover {
  background: rgba(0, 0, 0, 0.04);
}

.chat-header-title-input {
  width: auto;
  min-width: 100px;
  max-width: 200px;
  padding: 4px 8px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: transparent;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  outline: none;
  -webkit-app-region: no-drag;
}

/* Working Directory Button */
.working-dir-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
  -webkit-app-region: no-drag;
  max-width: 180px;
}

.working-dir-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}

.working-dir-btn.has-dir {
  color: var(--accent);
}

html[data-theme='light'] .working-dir-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

.working-dir-name {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

/* Agent Icon Button */
.agent-icon-btn {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
  -webkit-app-region: no-drag;
}

.agent-icon-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}

.agent-icon-btn.has-agent {
  color: var(--text);
}

html[data-theme='light'] .agent-icon-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

.agent-icon-avatar {
  font-size: 16px;
  line-height: 1;
}

.agent-icon-avatar-img {
  width: 20px;
  height: 20px;
  border-radius: 5px;
  object-fit: cover;
}

.agent-icon-chevron {
  opacity: 0.4;
  flex-shrink: 0;
  margin-left: -1px;
}

/* Agent Dropdown */
.agent-dropdown-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9998;
}

.agent-dropdown {
  position: fixed;
  z-index: 9999;
  min-width: 200px;
  max-width: 280px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25), 0 2px 8px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  animation: dropdownFadeIn 0.15s ease;
}

@keyframes dropdownFadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

html[data-theme='light'] .agent-dropdown {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
}

.agent-dropdown-header {
  padding: 10px 14px;
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border);
}

.agent-dropdown-list {
  max-height: 280px;
  overflow-y: auto;
  padding: 6px;
}

.agent-dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}

.agent-dropdown-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

html[data-theme='light'] .agent-dropdown-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

.agent-dropdown-item.active {
  background: rgba(var(--accent-rgb), 0.12);
}

.agent-dropdown-item.active:hover {
  background: rgba(var(--accent-rgb), 0.18);
}

.agent-dropdown-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  color: var(--muted);
  flex-shrink: 0;
}

html[data-theme='light'] .agent-dropdown-icon {
  background: rgba(0, 0, 0, 0.04);
}

.agent-dropdown-emoji {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  flex-shrink: 0;
}

html[data-theme='light'] .agent-dropdown-emoji {
  background: rgba(0, 0, 0, 0.04);
}

.agent-dropdown-img {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}

.agent-dropdown-name {
  font-size: 13px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-header-meta {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
}

.chat-header-btn {
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

.chat-header-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}

html[data-theme='light'] .chat-header-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

.chat-header-btn.back-btn {
  color: var(--accent);
}

.chat-header-btn.close-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.chat-header-btn.sidebar-toggle-btn {
  color: var(--accent);
}

.chat-container {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-width: 0;
  /* Inherit parent's bottom border-radius for proper clipping */
  border-bottom-left-radius: var(--radius-lg);
  border-bottom-right-radius: var(--radius-lg);
  overflow: hidden;
}

.chat-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  position: relative;
  /* Inherit parent's bottom border-radius for proper clipping */
  border-bottom-left-radius: var(--radius-lg);
  border-bottom-right-radius: var(--radius-lg);
  overflow: hidden;
}

.composer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 0 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  background: transparent;
  pointer-events: none;
  z-index: 100;
}

.composer > :deep(*) {
  pointer-events: auto;
}



/* Settings Fade Transition */
.settings-fade-enter-active,
.settings-fade-leave-active {
  transition: all 0.3s ease;
}

.settings-fade-enter-from,
.settings-fade-leave-to {
  opacity: 0;
}

.settings-fade-enter-active :deep(.floating-hub) {
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.settings-fade-enter-from :deep(.floating-hub) {
  transform: scale(0.9) translateY(20px);
}
</style>
