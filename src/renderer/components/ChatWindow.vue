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
            <div class="model-selector" ref="modelSelectorRef">
              <button class="model-selector-btn" @click="toggleModelDropdown">
                <span class="model-text">{{ currentModelDisplay }}</span>
                <svg class="dropdown-chevron" :class="{ open: showModelDropdown }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              <div v-if="showModelDropdown" class="model-dropdown">
                <div v-for="provider in availableProviders" :key="provider.key" class="provider-group">
                  <div
                    class="provider-header"
                    :class="{ active: provider.key === currentProvider }"
                    @click="handleProviderClick(provider.key, provider.selectedModels.length > 0)"
                  >
                    <svg
                      v-if="provider.selectedModels.length > 0"
                      class="expand-chevron"
                      :class="{ expanded: expandedProviders.has(provider.key) }"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                    <span class="provider-name">{{ provider.name }}</span>
                    <span class="model-count" v-if="provider.selectedModels.length > 0">({{ provider.selectedModels.length }})</span>
                  </div>
                  <div v-if="provider.selectedModels.length > 0 && expandedProviders.has(provider.key)" class="model-list">
                    <div
                      v-for="model in provider.selectedModels"
                      :key="model"
                      class="model-item"
                      :class="{ active: provider.key === currentProvider && model === currentModel }"
                      @click="selectModel(provider.key, model)"
                    >
                      <span class="model-name">{{ formatModelName(model) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
      </div>
    </template>
  </main>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useSessionsStore } from '@/stores/sessions'
import { useSettingsStore } from '@/stores/settings'
import { AIProvider } from '../../shared/ipc'
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

// Model selector dropdown state
const showModelDropdown = ref(false)
const modelSelectorRef = ref<HTMLElement | null>(null)
// Track which providers are expanded (default: current provider expanded)
const expandedProviders = ref<Set<string>>(new Set([settingsStore.settings.ai.provider]))

const providerNames: Record<string, string> = {
  openai: 'OpenAI',
  claude: 'Claude',
  deepseek: 'DeepSeek',
  kimi: 'Kimi',
  zhipu: '智谱 GLM',
  custom: 'Custom',
}

const currentProvider = computed(() => settingsStore.settings.ai.provider)
const currentModel = computed(() => settingsStore.settings.ai.providers[currentProvider.value]?.model || '')

const currentModelDisplay = computed(() => {
  const provider = currentProvider.value
  const model = currentModel.value

  const providerName = providerNames[provider] || provider
  const modelShort = formatModelName(model)

  return `${providerName} / ${modelShort}`
})

const availableProviders = computed(() => {
  const settings = settingsStore.settings
  return [
    {
      key: AIProvider.OpenAI,
      name: 'OpenAI',
      selectedModels: settings.ai.providers[AIProvider.OpenAI]?.selectedModels || [],
    },
    {
      key: AIProvider.Claude,
      name: 'Claude',
      selectedModels: settings.ai.providers[AIProvider.Claude]?.selectedModels || [],
    },
    {
      key: AIProvider.DeepSeek,
      name: 'DeepSeek',
      selectedModels: settings.ai.providers[AIProvider.DeepSeek]?.selectedModels || [],
    },
    {
      key: AIProvider.Kimi,
      name: 'Kimi',
      selectedModels: settings.ai.providers[AIProvider.Kimi]?.selectedModels || [],
    },
    {
      key: AIProvider.Zhipu,
      name: '智谱 GLM',
      selectedModels: settings.ai.providers[AIProvider.Zhipu]?.selectedModels || [],
    },
    {
      key: AIProvider.Custom,
      name: 'Custom',
      selectedModels: settings.ai.providers[AIProvider.Custom]?.selectedModels || [],
    },
  ].filter(p => {
    const config = settings.ai.providers[p.key]
    // Filter by enabled flag (default to true if not set)
    return config?.enabled !== false
  })
})

function formatModelName(model: string): string {
  if (!model) return 'No model'
  return model
}

function toggleModelDropdown() {
  showModelDropdown.value = !showModelDropdown.value
  // Reset expanded state when opening dropdown - only expand current provider
  if (showModelDropdown.value) {
    expandedProviders.value = new Set([currentProvider.value])
  }
}

function toggleProviderExpanded(providerKey: string) {
  if (expandedProviders.value.has(providerKey)) {
    expandedProviders.value.delete(providerKey)
  } else {
    expandedProviders.value.add(providerKey)
  }
  // Trigger reactivity
  expandedProviders.value = new Set(expandedProviders.value)
}

function handleProviderClick(providerKey: string, hasModels: boolean) {
  // If provider has models, toggle expand/collapse
  if (hasModels) {
    toggleProviderExpanded(providerKey)
  }
  // Also select this provider
  selectProvider(providerKey)
}

function closeDropdown() {
  showModelDropdown.value = false
}

function handleClickOutside(event: MouseEvent) {
  if (modelSelectorRef.value && !modelSelectorRef.value.contains(event.target as Node)) {
    closeDropdown()
  }
}

async function selectProvider(provider: AIProvider) {
  settingsStore.updateAIProvider(provider)
  await settingsStore.saveSettings(settingsStore.settings)
}

async function selectModel(provider: AIProvider, model: string) {
  if (provider !== currentProvider.value) {
    settingsStore.updateAIProvider(provider)
  }
  settingsStore.updateModel(model, provider)
  await settingsStore.saveSettings(settingsStore.settings)
  closeDropdown()
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

async function handleSendMessage(message: string) {
  if (!currentSession.value) return

  const session = currentSession.value

  // Send message - backend will auto-rename session based on first message
  const result = await chatStore.sendMessage(session.id, message)

  // If backend returned a new session name, update local sessions store
  if (typeof result === 'string') {
    // Update the session name in sessions store
    const sessionInStore = sessionsStore.sessions.find(s => s.id === session.id)
    if (sessionInStore) {
      sessionInStore.name = result
    }
  }
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

.model-selector {
  position: relative;
}

.model-selector-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  margin: -2px -6px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  color: var(--muted);
  transition: all 0.15s ease;
}

.model-selector-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.model-text {
  white-space: nowrap;
}

.dropdown-chevron {
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.dropdown-chevron.open {
  transform: rotate(180deg);
}

.model-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: -6px;
  min-width: 220px;
  max-height: 320px;
  overflow-y: auto;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  padding: 6px;
  backdrop-filter: blur(12px);
}

html[data-theme='light'] .model-dropdown {
  background: var(--bg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.provider-group {
  margin-bottom: 4px;
}

.provider-group:last-child {
  margin-bottom: 0;
}

.provider-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  transition: background 0.15s ease;
  cursor: pointer;
}

.provider-header:hover {
  background: var(--hover);
}

.provider-header.active {
  background: rgba(16, 163, 127, 0.1);
}

.provider-header.active .provider-name {
  color: var(--accent);
}

.expand-chevron {
  transition: transform 0.2s ease;
}

.expand-chevron.expanded {
  transform: rotate(90deg);
}

.provider-name {
  flex: 1;
}

.model-count {
  font-size: 11px;
  font-weight: 400;
  color: var(--muted);
  margin-right: auto;
}

.model-list {
  padding-left: 8px;
  border-left: 2px solid var(--border);
  margin-left: 19px;
  margin-top: 2px;
  margin-bottom: 6px;
  animation: slideDown 0.15s ease;
  overflow: hidden;
}

@keyframes slideDown {
  from {
    opacity: 0;
    max-height: 0;
  }
  to {
    opacity: 1;
    max-height: 500px;
  }
}

.model-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  color: var(--muted);
  transition: all 0.15s ease;
}

.model-item:hover {
  background: var(--hover);
  color: var(--text);
}

.model-item.active {
  background: rgba(16, 163, 127, 0.15);
  color: var(--accent);
}

.model-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
</style>
