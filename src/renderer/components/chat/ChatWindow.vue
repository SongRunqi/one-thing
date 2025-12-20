<template>
  <main class="chat">
    <!-- Chat View (Always rendered) -->
    <div class="chat-container">
      <MessageList 
        :messages="chatStore.messages" 
        :is-loading="chatStore.isLoading" 
        @set-quoted-text="handleSetQuotedText" 
        @set-input-text="handleSetInputText"
        @regenerate="handleRegenerate" 
      />

      <div class="composer">
        <InputBox ref="inputBoxRef" @send-message="handleSendMessage" @stop-generation="handleStopGeneration" @open-tool-settings="handleOpenToolSettings" :is-loading="chatStore.isLoading" />
      </div>
    </div>

    <!-- Settings Panel overlay -->
    <Transition name="settings-fade">
      <SettingsPanel v-if="showSettings" @close="emit('closeSettings')" />
    </Transition>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useSessionsStore } from '@/stores/sessions'
import MessageList from './MessageList.vue'
import InputBox from './InputBox.vue'
import SettingsPanel from '../SettingsPanel.vue'

interface Props {
  showSettings?: boolean
}

withDefaults(defineProps<Props>(), {
  showSettings: false,
})

const emit = defineEmits<{
  closeSettings: []
  openSettings: []
}>()

const chatStore = useChatStore()
const sessionsStore = useSessionsStore()

const currentSession = computed(() => sessionsStore.currentSession)

// Input box ref for setting quoted text
const inputBoxRef = ref<InstanceType<typeof InputBox> | null>(null)

// Handle open tool settings from InputBox
function handleOpenToolSettings() {
  emit('openSettings')
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
  await chatStore.regenerate(currentSession.value.id, messageId)
}

function handleSetInputText(text: string) {
  if (inputBoxRef.value) {
    inputBoxRef.value.setMessageInput(text)
  }
}
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
  flex-direction: column;
  flex: 1;
  min-width: 0;
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
