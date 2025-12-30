<template>
  <main class="chat">
    <!-- Chat Header -->
    <ChatHeader
      :session-name="currentSession?.name || 'New chat'"
      :working-directory="currentSession?.workingDirectory || null"
      :session-agent="sessionAgent"
      :agents="agentsStore.agents"
      :is-branch-session="isBranchSession"
      :show-sidebar-toggle="showSidebarToggle"
      :show-split-button="canClose !== undefined"
      :can-close="!!canClose"
      @toggle-sidebar="emit('toggleSidebar')"
      @open-directory-picker="openWorkingDirectoryPicker"
      @update-title="handleUpdateTitle"
      @select-agent="selectAgent"
      @go-to-parent="goToParentSession"
      @split="emit('split')"
      @close="emit('close')"
    />

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
          @split-with-branch="(sessionId) => emit('splitWithBranch', sessionId)"
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
import { computed, ref } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { useAgentsStore } from '@/stores/agents'
import { useChatSession } from '@/composables/useChatSession'
import MessageList from './MessageList.vue'
import InputBox from './InputBox.vue'
import ChatHeader from './ChatHeader.vue'
import SettingsPanel from '../SettingsPanel.vue'
import AgentSettingsPanel from '../AgentSettingsPanel.vue'
import AgentWelcomePage from './AgentWelcomePage.vue'

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
  splitWithBranch: [sessionId: string]
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

// Check if current session is a branch
const isBranchSession = computed(() => !!currentSession.value?.parentSessionId)

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

// Handle title update from ChatHeader
async function handleUpdateTitle(title: string) {
  if (!currentSession.value) return
  await sessionsStore.renameSession(currentSession.value.id, title)
}

// Handle agent selection from ChatHeader
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
  /* Prevent flicker during sidebar toggle */
  contain: layout style;
}

html[data-theme='light'] .chat {
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.06),
    0 8px 24px rgba(0, 0, 0, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(0, 0, 0, 0.08);
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
