<template>
  <main class="chat">
    <!-- Chat Header -->
    <ChatHeader
      :session-name="currentSession?.name || 'New chat'"
      :working-directory="currentSession?.workingDirectory || null"
      :session-agent="sessionAgent"
      :agents="customAgentsStore.customAgents"
      :is-branch-session="isBranchSession"
      :show-sidebar-toggle="showSidebarToggle"
      :show-split-button="canClose !== undefined"
      :can-close="!!canClose"
      :is-right-sidebar-open="rightSidebarStore.isOpen"
      @toggle-sidebar="emit('toggleSidebar')"
      @toggle-right-sidebar="rightSidebarStore.toggle()"
      @open-directory-picker="openWorkingDirectoryPicker"
      @update-title="handleUpdateTitle"
      @select-agent="selectAgent"
      @go-to-parent="goToParentSession"
      @split="emit('split')"
      @equalize="emit('equalize')"
      @close="emit('close')"
    />

    <!-- Chat View -->
    <div class="chat-container">
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

        <!-- v-memo prevents unnecessary re-renders during tool_input_delta streaming -->
        <div
          v-memo="[isGenerating, effectiveSessionId]"
          class="composer"
        >
          <InputBox
            ref="inputBoxRef"
            :is-loading="isGenerating"
            :session-id="effectiveSessionId"
            @send-message="handleSendMessage"
            @stop-generation="handleStopGeneration"
            @open-tool-settings="handleOpenToolSettings"
          />
        </div>
      </div>
    </div>

    <!-- Settings Panel overlay -->
    <Transition name="settings-fade">
      <SettingsPanel
        v-if="showSettings"
        @close="emit('closeSettings')"
      />
    </Transition>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { useCustomAgentsStore } from '@/stores/custom-agents'
import { useRightSidebarStore } from '@/stores/right-sidebar'
import { useChatSession } from '@/composables/useChatSession'
import MessageList from './MessageList.vue'
import InputBox from './InputBox.vue'
import ChatHeader from './ChatHeader.vue'
import SettingsPanel from '../SettingsPanel.vue'
import type { CustomAgent } from '@/types'

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
  equalize: []
  splitWithBranch: [sessionId: string]
  toggleSidebar: []
}>()

const sessionsStore = useSessionsStore()
const customAgentsStore = useCustomAgentsStore()
const rightSidebarStore = useRightSidebarStore()

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

// Messages for this panel — UIMessage[] unified data source
const panelMessages = computed(() => messages.value)

// Get the agent for current session
const sessionAgent = computed(() => {
  const agentId = currentSession.value?.agentId
  if (!agentId) return null
  return customAgentsStore.customAgents.find(a => a.id === agentId) || null
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

// Input box ref for setting quoted text
const inputBoxRef = ref<InstanceType<typeof InputBox> | null>(null)

// Handle open tool settings from InputBox - opens settings in new window
function handleOpenToolSettings() {
  window.electronAPI.openSettingsWindow()
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
  /* Use lighter background to appear "on top" of the base */
  background: var(--bg-panel, var(--bg-elevated, var(--bg-chat)));
  /* Add subtle inner glow at top for raised effect */
  position: relative;
  border-radius: var(--radius-lg);
  overflow: hidden;
  /* "Placed on surface" shadow - more prominent */
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.15),
    0 8px 16px rgba(0, 0, 0, 0.2),
    0 20px 40px rgba(0, 0, 0, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  border: none;
  /* Prevent flicker during sidebar toggle */
  contain: layout style;
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
