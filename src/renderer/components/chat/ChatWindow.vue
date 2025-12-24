<template>
  <main class="chat">
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
          :messages="chatStore.messages"
          :is-loading="chatStore.isLoading"
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
import { computed, ref } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useSessionsStore } from '@/stores/sessions'
import { useAgentsStore } from '@/stores/agents'
import MessageList from './MessageList.vue'
import InputBox from './InputBox.vue'
import SettingsPanel from '../SettingsPanel.vue'
import AgentSettingsPanel from '../AgentSettingsPanel.vue'
import AgentWelcomePage from './AgentWelcomePage.vue'

interface Props {
  showSettings?: boolean
  showAgentSettings?: boolean
}

withDefaults(defineProps<Props>(), {
  showSettings: false,
  showAgentSettings: false,
})

const emit = defineEmits<{
  closeSettings: []
  openSettings: []
  closeAgentSettings: []
  openAgentSettings: []
}>()

const chatStore = useChatStore()
const sessionsStore = useSessionsStore()
const agentsStore = useAgentsStore()

const currentSession = computed(() => sessionsStore.currentSession)

// Show agent welcome page when agent is selected and no messages in chat
const showAgentWelcome = computed(() => {
  return agentsStore.selectedAgent && chatStore.messages.length === 0
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

async function handleSendMessage(message: string) {
  if (!currentSession.value) return

  const session = currentSession.value

  // Send message using streaming
  const result = await chatStore.sendMessageStream(session.id, message)

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
  position: relative; /* For overlay positioning */
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
