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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="9" y1="3" x2="9" y2="21"/>
          </svg>
        </button>

        <!-- Agent avatar or chat icon -->
        <template v-if="sessionAgent">
          <span v-if="sessionAgent.avatar.type === 'emoji'" class="chat-header-avatar">
            {{ sessionAgent.avatar.value }}
          </span>
          <img
            v-else
            :src="'file://' + sessionAgent.avatar.value"
            class="chat-header-avatar-img"
            alt=""
          />
        </template>
        <svg v-else class="chat-header-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>

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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="12" y1="3" x2="12" y2="21"/>
          </svg>
        </button>

        <!-- Close button (for multi-panel) -->
        <button
          v-if="canClose"
          class="chat-header-btn close-btn"
          title="Close panel"
          @click="emit('close')"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </header>

    <!-- Agent Welcome Page (when agent selected and no messages) -->
    <AgentWelcomePage
      v-if="showAgentWelcome && agentsStore.selectedAgent"
      :agent="agentsStore.selectedAgent"
      @start-chat="handleStartAgentChat"
      @open-settings="emit('openAgentSettings')"
    />

    <!-- Chat View (when not showing agent welcome) -->
    <div v-else class="chat-container">
      <div class="chat-main">
        <MessageList
          :messages="panelMessages"
          :is-loading="isPrimaryPanel ? chatStore.isLoading : isLoadingLocal"
          @set-quoted-text="handleSetQuotedText"
          @set-input-text="handleSetInputText"
          @regenerate="handleRegenerate"
          @edit-and-resend="handleEditAndResend"
        />

        <div class="composer">
          <InputBox ref="inputBoxRef" @send-message="handleSendMessage" @stop-generation="handleStopGeneration" @open-tool-settings="handleOpenToolSettings" :is-loading="isRegenerating || chatStore.isCurrentSessionGenerating" />
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
import { computed, ref, nextTick, watch, onMounted } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useSessionsStore } from '@/stores/sessions'
import { useAgentsStore } from '@/stores/agents'
import MessageList from './MessageList.vue'
import InputBox from './InputBox.vue'
import SettingsPanel from '../SettingsPanel.vue'
import AgentSettingsPanel from '../AgentSettingsPanel.vue'
import AgentWelcomePage from './AgentWelcomePage.vue'
import type { ChatMessage } from '@/types'

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

const chatStore = useChatStore()
const sessionsStore = useSessionsStore()
const agentsStore = useAgentsStore()

// Local messages for secondary panels (when sessionId differs from current)
const localMessages = ref<ChatMessage[]>([])
const isLoadingLocal = ref(false)

// Check if this panel shows the current session (primary panel)
const isPrimaryPanel = computed(() => {
  return !props.sessionId || props.sessionId === sessionsStore.currentSessionId
})

// Get the session for this panel
const currentSession = computed(() => {
  if (isPrimaryPanel.value) {
    return sessionsStore.currentSession
  }
  return sessionsStore.sessions.find(s => s.id === props.sessionId) || null
})

// Get messages for this panel
const panelMessages = computed(() => {
  if (isPrimaryPanel.value) {
    return chatStore.messages
  }
  return localMessages.value
})

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

// Load messages for secondary panel
async function loadSessionMessages(sessionId: string) {
  if (!sessionId || isPrimaryPanel.value) return

  isLoadingLocal.value = true
  try {
    const response = await window.electronAPI.getChatHistory(sessionId)
    if (response.success && response.messages) {
      localMessages.value = response.messages
    }
  } catch (error) {
    console.error('Failed to load session messages:', error)
  } finally {
    isLoadingLocal.value = false
  }
}

// Watch for sessionId changes to load messages
watch(() => props.sessionId, (newSessionId) => {
  if (newSessionId && !isPrimaryPanel.value) {
    loadSessionMessages(newSessionId)
  }
}, { immediate: true })

// Also reload when sessions change (in case messages were updated)
watch(() => sessionsStore.currentSessionId, () => {
  if (props.sessionId && !isPrimaryPanel.value) {
    loadSessionMessages(props.sessionId)
  }
})

// Go back to parent session
async function goToParentSession() {
  if (currentSession.value?.parentSessionId) {
    await sessionsStore.switchSession(currentSession.value.parentSessionId)
  }
}

// Title editing state
const isEditingTitle = ref(false)
const editingTitleValue = ref('')
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

// Show agent welcome page when agent is selected and no messages in chat
const showAgentWelcome = computed(() => {
  return agentsStore.selectedAgent && panelMessages.value.length === 0
})

// Input box ref for setting quoted text
const inputBoxRef = ref<InstanceType<typeof InputBox> | null>(null)

// Local state for immediate stop button response during regenerate/editAndResend
const isRegenerating = ref(false)

// Handle open tool settings from InputBox
function handleOpenToolSettings() {
  emit('openSettings')
}

// Handle starting a new chat with the selected agent
async function handleStartAgentChat() {
  if (!agentsStore.selectedAgent) return
  // Create a new session with this agent
  await sessionsStore.createSession('', agentsStore.selectedAgent.id)
  // Clear the selected agent so we see the chat view
  agentsStore.selectAgent(null)
}

async function handleSendMessage(message: string, attachments?: import('@/types').MessageAttachment[]) {
  if (!currentSession.value) return

  const session = currentSession.value

  // Send message using streaming (with optional attachments)
  const result = await chatStore.sendMessageStream(session.id, message, attachments)

  // If backend returned a new session name, update local sessions store
  if (typeof result === 'string') {
    // Update the session name in sessions store
    const sessionInStore = sessionsStore.sessions.find(s => s.id === session.id)
    if (sessionInStore) {
      sessionInStore.name = result
    }
  }
}

async function handleStopGeneration() {
  await chatStore.stopGeneration()
}

function handleSetQuotedText(text: string) {
  // Set quoted text in the input box
  if (inputBoxRef.value) {
    inputBoxRef.value.setQuotedText(text)
  }
}

async function handleRegenerate(messageId: string) {
  if (!currentSession.value) return
  isRegenerating.value = true  // Immediate response for stop button
  try {
    await chatStore.regenerate(currentSession.value.id, messageId)
  } finally {
    isRegenerating.value = false
  }
}

async function handleEditAndResend(messageId: string, newContent: string) {
  if (!currentSession.value) return
  isRegenerating.value = true  // Immediate response for stop button
  try {
    await chatStore.editAndResend(currentSession.value.id, messageId, newContent)
  } finally {
    isRegenerating.value = false
  }
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
  flex: 1;
  min-width: 0;
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
}

.chat-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  position: relative;
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
