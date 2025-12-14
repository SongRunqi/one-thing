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

          <!-- Model/Provider Selector -->
          <div class="model-selector" @click="toggleModelDropdown">
            <div class="model-selector-content">
              <span class="model-name">{{ currentModel }}</span>
              <svg class="dropdown-arrow" :class="{ open: showModelDropdown }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>

            <!-- Dropdown Menu -->
            <div v-if="showModelDropdown" class="model-dropdown" @click.stop>
              <div class="dropdown-section">
                <div class="dropdown-label">Provider</div>
                <div class="dropdown-options">
                  <button
                    v-for="p in providers"
                    :key="p.value"
                    :class="['dropdown-option', { active: currentProvider === p.value }]"
                    @click="selectProvider(p.value)"
                  >
                    {{ p.label }}
                  </button>
                </div>
              </div>
              <div class="dropdown-section">
                <div class="dropdown-label">Model</div>
                <input
                  v-model="modelInput"
                  class="model-input"
                  placeholder="Enter model name..."
                  @keyup.enter="saveModel"
                  @blur="saveModel"
                />
                <div class="model-presets">
                  <button
                    v-for="preset in modelPresets"
                    :key="preset"
                    class="preset-btn"
                    @click="selectModel(preset)"
                  >
                    {{ preset }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="header-center">
          <div class="chat-session">{{ currentSession?.name || 'New chat' }}</div>
        </div>

        <div class="chat-actions">
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
      </div>
    </template>
  </main>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
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

// Model selector state
const showModelDropdown = ref(false)
const modelInput = ref('')

const providers = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'claude', label: 'Claude' },
  { value: 'custom', label: 'Custom' },
]

const modelPresetsByProvider: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  claude: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
  custom: [],
}

const currentProvider = computed(() => settingsStore.settings.ai.provider)
const currentModel = computed(() => settingsStore.settings.ai.model || 'Select model')
const modelPresets = computed(() => modelPresetsByProvider[currentProvider.value] || [])

// Sync model input with current model
watch(currentModel, (val) => {
  modelInput.value = val === 'Select model' ? '' : val
}, { immediate: true })

function toggleModelDropdown() {
  showModelDropdown.value = !showModelDropdown.value
}

function closeDropdown() {
  showModelDropdown.value = false
}

async function selectProvider(provider: string) {
  const newSettings = {
    ...settingsStore.settings,
    ai: {
      ...settingsStore.settings.ai,
      provider: provider as 'openai' | 'claude' | 'custom',
    },
  }
  await settingsStore.saveSettings(newSettings)
}

async function selectModel(model: string) {
  modelInput.value = model
  await saveModel()
}

async function saveModel() {
  if (!modelInput.value.trim()) return
  const newSettings = {
    ...settingsStore.settings,
    ai: {
      ...settingsStore.settings.ai,
      model: modelInput.value.trim(),
    },
  }
  await settingsStore.saveSettings(newSettings)
}

// Close dropdown when clicking outside
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.model-selector')) {
    closeDropdown()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
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

.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
  min-width: 0;
}

.chat-session {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text);
}

/* Model Selector */
.model-selector {
  position: relative;
  cursor: pointer;
}

.model-selector-content {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--hover);
  transition: all 0.15s ease;
}

.model-selector-content:hover {
  background: rgba(255, 255, 255, 0.12);
}

html[data-theme='light'] .model-selector-content:hover {
  background: rgba(0, 0, 0, 0.08);
}

.model-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dropdown-arrow {
  color: var(--muted);
  transition: transform 0.2s ease;
}

.dropdown-arrow.open {
  transform: rotate(180deg);
}

.model-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 260px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  z-index: 100;
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

.dropdown-section {
  padding: 6px 4px;
}

.dropdown-section:not(:last-child) {
  border-bottom: 1px solid var(--border);
  margin-bottom: 6px;
  padding-bottom: 10px;
}

.dropdown-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

.dropdown-options {
  display: flex;
  gap: 4px;
}

.dropdown-option {
  flex: 1;
  padding: 6px 10px;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  transition: all 0.15s ease;
}

.dropdown-option:hover {
  background: var(--hover);
}

.dropdown-option.active {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.model-input {
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  outline: none;
  transition: border-color 0.15s ease;
}

.model-input:focus {
  border-color: var(--accent);
}

.model-input::placeholder {
  color: var(--muted);
}

.model-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.preset-btn {
  padding: 4px 8px;
  font-size: 11px;
  border: none;
  border-radius: 4px;
  background: var(--hover);
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.preset-btn:hover {
  background: rgba(16, 163, 127, 0.15);
  color: var(--accent);
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
</style>
