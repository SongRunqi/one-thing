<template>
  <main class="chat">
    <!-- Settings Panel -->
    <SettingsPanel v-if="showSettings" @close="emit('closeSettings')" />

    <!-- Chat View -->
    <template v-else>
      <MessageList :messages="chatStore.messages" :is-loading="chatStore.isLoading" @set-quoted-text="handleSetQuotedText" @regenerate="handleRegenerate" />

      <div class="composer">
        <InputBox ref="inputBoxRef" @send-message="handleSendMessage" @stop-generation="handleStopGeneration" @open-tool-settings="handleOpenToolSettings" :is-loading="chatStore.isLoading" />
      </div>
    </template>
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
</script>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  background: var(--bg);
}

.composer {
  padding: 12px 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.12) 55%, rgba(0, 0, 0, 0.22) 100%);
}

html[data-theme='light'] .composer {
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0) 0%, rgba(0, 0, 0, 0.02) 55%, rgba(0, 0, 0, 0.04) 100%);
}
</style>
