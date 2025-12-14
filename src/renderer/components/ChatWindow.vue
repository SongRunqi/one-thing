<template>
  <main class="chat">
    <!-- Settings Panel -->
    <SettingsPanel v-if="showSettings" @close="emit('closeSettings')" />

    <!-- Chat View -->
    <template v-else>
      <header class="chat-header">
        <div class="header-left">
          <!-- Sidebar toggle button (shown when collapsed) -->
          <button
            v-if="sidebarCollapsed"
            class="icon-btn sidebar-toggle"
            title="Open sidebar"
            @click="emit('toggleSidebar')"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="9" y1="3" x2="9" y2="21"/>
            </svg>
          </button>
          <div class="chat-title">
            <div class="chat-model">{{ currentModelDisplay }}</div>
            <div class="chat-session">{{ currentSession?.name || 'New chat' }}</div>
          </div>
        </div>
        <div class="chat-actions">
          <button class="icon-btn" title="Settings" @click="emit('openSettings')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
          </button>
          <button class="icon-btn" title="New chat" @click="createNewSession">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
        </div>
      </header>

      <MessageList :messages="chatStore.messages" :is-loading="chatStore.isLoading" />

      <div class="composer">
        <InputBox @send-message="handleSendMessage" :is-loading="chatStore.isLoading" />
        <div v-if="chatStore.error" class="error-banner">
          {{ chatStore.error }}
        </div>
      </div>
    </template>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useSessionsStore } from '@/stores/sessions'
import { useSettingsStore } from '@/stores/settings'
import MessageList from './MessageList.vue'
import InputBox from './InputBox.vue'
import SettingsPanel from './SettingsPanel.vue'

interface Props {
  showSettings?: boolean
  sidebarCollapsed?: boolean
}

withDefaults(defineProps<Props>(), {
  showSettings: false,
  sidebarCollapsed: false,
})

const emit = defineEmits<{
  closeSettings: []
  openSettings: []
  toggleSidebar: []
}>()

const chatStore = useChatStore()
const sessionsStore = useSessionsStore()
const settingsStore = useSettingsStore()

const currentSession = computed(() => sessionsStore.currentSession)

const currentModelDisplay = computed(() => {
  const settings = settingsStore.settings
  const provider = settings.ai.provider
  const providerConfig = settings.ai.providers[provider]
  const model = providerConfig?.model || ''

  const providerNames: Record<string, string> = {
    openai: 'OpenAI',
    claude: 'Claude',
    custom: 'Custom',
  }

  const providerName = providerNames[provider] || provider
  const modelShort = model.split('-').slice(0, 2).join('-') || model

  return `${providerName} / ${modelShort}`
})

// Generate title using AI
async function generateTitleWithAI(message: string, sessionId: string) {
  try {
    const response = await window.electronAPI.generateTitle(message)
    if (response.success && response.title) {
      await sessionsStore.renameSession(sessionId, response.title)
    }
  } catch (error) {
    console.error('Failed to generate title:', error)
  }
}

async function handleSendMessage(message: string) {
  if (!currentSession.value) return

  const session = currentSession.value
  // Check BEFORE sending - messages array is empty means this is the first message
  const isFirstMessage = chatStore.messages.length === 0
  // Check if session is untitled (empty, 'New Chat', or starts with 'Chat ' which is the default format)
  const isUntitledSession =
    !session.name || session.name === 'New Chat' || session.name === '' || session.name.startsWith('Chat ')
  const shouldAutoRename = isFirstMessage && isUntitledSession

  // Start sending the message
  const sendPromise = chatStore.sendMessage(session.id, message)

  // Generate title with AI in the background (don't block message sending)
  if (shouldAutoRename) {
    generateTitleWithAI(message, session.id)
  }

  await sendPromise
}

async function createNewSession() {
  await sessionsStore.createSession('')
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

.chat-header {
  height: 56px;
  padding: 10px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.08);
}

html[data-theme='light'] .chat-header {
  background: rgba(0, 0, 0, 0.02);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.sidebar-toggle {
  flex-shrink: 0;
}

.chat-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.chat-model {
  font-size: 12px;
  color: var(--muted);
}

.chat-session {
  font-size: 14px;
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: 10px;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.icon-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.composer {
  padding: 12px 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  border-top: 1px solid var(--border);
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.12) 55%, rgba(0, 0, 0, 0.22) 100%);
}

html[data-theme='light'] .composer {
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0) 0%, rgba(0, 0, 0, 0.02) 55%, rgba(0, 0, 0, 0.04) 100%);
}

.error-banner {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.12);
  color: rgba(255, 255, 255, 0.9);
  width: min(860px, 100%);
}

html[data-theme='light'] .error-banner {
  color: rgba(0, 0, 0, 0.8);
}
</style>
