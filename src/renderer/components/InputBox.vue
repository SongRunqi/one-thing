<template>
  <div class="composer-wrapper">
    <!-- Quoted text context (shown above input when text is referenced) -->
    <div v-if="quotedText" class="quoted-context">
      <div class="quoted-bar"></div>
      <div class="quoted-content-wrapper">
        <div class="quoted-text">{{ quotedText }}</div>
        <button class="remove-quote-btn" @click="clearQuotedText" title="Remove">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>

    <div class="composer" :class="{ focused: isFocused }">
      <!-- Input area - full width -->
      <div class="input-area">
        <textarea
          ref="textareaRef"
          v-model="messageInput"
          class="composer-input"
          placeholder="Ask anything..."
          @keydown="handleKeyDown"
          @focus="isFocused = true"
          @blur="isFocused = false"
          @input="adjustHeight"
          :disabled="isLoading"
          rows="1"
        />
      </div>

      <!-- Bottom toolbar -->
      <div class="composer-toolbar">
        <!-- Left side: attach and tools -->
        <div class="toolbar-left">
          <button class="toolbar-btn" title="Attach file" @click="handleAttach">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          </button>

          <!-- Tools button with dropdown -->
          <div class="tools-dropdown" ref="toolsDropdownRef">
            <button
              class="toolbar-btn tools-btn"
              :class="{ active: toolsEnabled }"
              :title="toolsEnabled ? 'Tools enabled' : 'Tools disabled'"
              @click="toggleToolsPanel"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
              </svg>
              <span v-if="toolsEnabled" class="tools-status-dot"></span>
            </button>

            <!-- Tools dropdown menu -->
            <Teleport to="body">
              <div
                v-if="showToolsPanel"
                class="tools-menu"
                :style="toolsPanelPosition"
                @click.stop
              >
                <!-- Master toggle -->
                <div class="tools-menu-header">
                  <div class="tools-menu-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                    </svg>
                    <span>Tools</span>
                  </div>
                  <label class="tools-toggle">
                    <input
                      type="checkbox"
                      :checked="toolsEnabled"
                      @change="toggleTools"
                    />
                    <span class="tools-toggle-slider"></span>
                  </label>
                </div>

                <!-- Tool list -->
                <div class="tools-menu-list">
                  <div
                    v-for="tool in availableTools"
                    :key="tool.id"
                    class="tool-item"
                    :class="{ disabled: !toolsEnabled }"
                  >
                    <span class="tool-name">{{ tool.name || tool.id }}</span>
                    <label class="tool-item-toggle">
                      <input
                        type="checkbox"
                        :checked="isToolEnabled(tool.id)"
                        :disabled="!toolsEnabled"
                        @change="toggleToolEnabled(tool.id)"
                      />
                      <span class="tool-item-toggle-slider"></span>
                    </label>
                  </div>
                  <div v-if="availableTools.length === 0" class="tools-empty">
                    No tools available
                  </div>
                </div>

                <!-- Settings link -->
                <button class="tools-menu-settings" @click="openToolSettings">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                  <span>Advanced Settings</span>
                </button>
              </div>
            </Teleport>
          </div>

          <!-- Model selector - right after tools -->
          <div class="model-selector" ref="modelSelectorRef">
            <button class="model-selector-btn" @click="toggleModelDropdown" :title="currentModel || 'Select model'">
              <!-- Provider icon -->
              <span class="provider-icon" :class="currentProvider">
                <!-- OpenAI icon -->
                <svg v-if="currentProvider === 'openai'" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364l2.0201-1.1638a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.4043-.6813zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/>
                </svg>
                <!-- Claude/Anthropic icon -->
                <svg v-else-if="currentProvider === 'claude'" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16.6 3H7.4C5 3 3 5 3 7.4v9.2C3 19 5 21 7.4 21h9.2c2.4 0 4.4-2 4.4-4.4V7.4C21 5 19 3 16.6 3zm-4.5 14.1c-3.4 0-6.1-2.8-6.1-6.1s2.8-6.1 6.1-6.1 6.1 2.8 6.1 6.1-2.7 6.1-6.1 6.1z"/>
                </svg>
                <!-- DeepSeek official icon -->
                <svg v-else-if="currentProvider === 'deepseek'" width="18" height="18" viewBox="0 0 512 509.64" fill="currentColor">
                  <path d="M440.898 139.167c-4.001-1.961-5.723 1.776-8.062 3.673-.801.612-1.479 1.407-2.154 2.141-5.848 6.246-12.681 10.349-21.607 9.859-13.048-.734-24.192 3.368-34.04 13.348-2.093-12.307-9.048-19.658-19.635-24.37-5.54-2.449-11.141-4.9-15.02-10.227-2.708-3.795-3.447-8.021-4.801-12.185-.861-2.509-1.725-5.082-4.618-5.512-3.139-.49-4.372 2.142-5.601 4.349-4.925 9.002-6.833 18.921-6.647 28.962.432 22.597 9.972 40.597 28.932 53.397 2.154 1.47 2.707 2.939 2.032 5.082-1.293 4.41-2.832 8.695-4.186 13.105-.862 2.817-2.157 3.429-5.172 2.205-10.402-4.346-19.391-10.778-27.332-18.553-13.481-13.044-25.668-27.434-40.873-38.702a177.614 177.614 0 00-10.834-7.409c-15.512-15.063 2.032-27.434 6.094-28.902 4.247-1.532 1.478-6.797-12.251-6.736-13.727.061-26.285 4.653-42.288 10.777-2.34.92-4.801 1.593-7.326 2.142-14.527-2.756-29.608-3.368-45.367-1.593-29.671 3.305-53.368 17.329-70.788 41.272-20.928 28.785-25.854 61.482-19.821 95.59 6.34 35.943 24.683 65.704 52.876 88.974 29.239 24.123 62.911 35.943 101.32 33.677 23.329-1.346 49.307-4.468 78.607-29.27 7.387 3.673 15.142 5.144 28.008 6.246 9.911.92 19.452-.49 26.839-2.019 11.573-2.449 10.773-13.166 6.586-15.124-33.915-15.797-26.47-9.368-33.24-14.573 17.235-20.39 43.213-41.577 53.369-110.222.8-5.448.121-8.877 0-13.287-.061-2.692.553-3.734 3.632-4.041 8.494-.981 16.742-3.305 24.314-7.471 21.975-12.002 30.84-31.719 32.933-55.355.307-3.612-.061-7.348-3.879-9.245v-.003zM249.4 351.89c-32.872-25.838-48.814-34.352-55.4-33.984-6.155.368-5.048 7.41-3.694 12.002 1.415 4.532 3.264 7.654 5.848 11.634 1.785 2.634 3.017 6.551-1.784 9.493-10.587 6.55-28.993-2.205-29.856-2.635-21.421-12.614-39.334-29.269-51.954-52.047-12.187-21.924-19.267-45.435-20.435-70.542-.308-6.061 1.478-8.207 7.509-9.307 7.94-1.471 16.127-1.778 24.068-.615 33.547 4.9 62.108 19.902 86.054 43.66 13.666 13.531 24.007 29.699 34.658 45.496 11.326 16.778 23.514 32.761 39.026 45.865 5.479 4.592 9.848 8.083 14.035 10.656-12.62 1.407-33.673 1.714-48.075-9.676zm15.899-102.519c.521-2.111 2.421-3.658 4.722-3.658a4.74 4.74 0 011.661.305c.678.246 1.293.614 1.786 1.163.861.859 1.354 2.083 1.354 3.368 0 2.695-2.154 4.837-4.862 4.837a4.748 4.748 0 01-4.738-4.034 5.01 5.01 0 01.077-1.981zm47.208 26.915c-2.606.996-5.2 1.778-7.707 1.88-4.679.244-9.787-1.654-12.556-3.981-4.308-3.612-7.386-5.631-8.679-11.941-.554-2.695-.247-6.858.246-9.246 1.108-5.144-.124-8.451-3.754-11.451-2.954-2.449-6.711-3.122-10.834-3.122-1.539 0-2.954-.673-4.001-1.224-1.724-.856-3.139-3-1.785-5.634.432-.856 2.525-2.939 3.018-3.305 5.6-3.185 12.065-2.144 18.034.244 5.54 2.266 9.727 6.429 15.759 12.307 6.155 7.102 7.263 9.063 10.773 14.39 2.771 4.163 5.294 8.451 7.018 13.348.877 2.561.071 4.74-2.341 6.277-.981.625-2.109 1.044-3.191 1.458z"/>
                </svg>
                <!-- Generic AI icon for other providers -->
                <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 6v6l4 2"/>
                </svg>
              </span>
              <!-- Model name -->
              <span class="model-text">{{ currentModel || 'Select model' }}</span>
            </button>

            <!-- Model dropdown menu -->
            <Teleport to="body">
              <div
                v-if="showModelDropdown"
                class="model-dropdown"
                :style="modelDropdownPosition"
                @click.stop
              >
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
                  </div>
                  <div v-if="provider.selectedModels.length > 0 && expandedProviders.has(provider.key)" class="model-list">
                    <div
                      v-for="model in provider.selectedModels"
                      :key="model"
                      class="model-item"
                      :class="{ active: provider.key === currentProvider && model === currentModel }"
                      @click="selectModel(provider.key, model)"
                    >
                      <span class="model-name">{{ model }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Teleport>
          </div>
        </div>

        <!-- Right side: send/stop button -->
        <div class="toolbar-right">
          <button
            v-if="isLoading"
            class="send-btn stop-btn"
            @click="stopGeneration"
            title="Stop generation"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
          <button
            v-else
            class="send-btn"
            @click="sendMessage"
            :disabled="!canSend"
            title="Send message"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { AIProvider } from '../../shared/ipc'

interface ToolDefinition {
  id: string
  name: string
  description?: string
}

interface Props {
  isLoading?: boolean
  maxChars?: number
}

interface Emits {
  (e: 'sendMessage', message: string): void
  (e: 'stopGeneration'): void
  (e: 'toolsEnabledChange', enabled: boolean): void
  (e: 'openToolSettings'): void
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
  maxChars: 4000,
})

const emit = defineEmits<Emits>()
const settingsStore = useSettingsStore()

const messageInput = ref('')
const quotedText = ref('')
const isFocused = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

// Tools panel state
const showToolsPanel = ref(false)
const toolsDropdownRef = ref<HTMLElement | null>(null)
const toolsPanelPosition = ref<{ top: string; left: string }>({ top: '0px', left: '0px' })
const availableTools = ref<ToolDefinition[]>([])

// Tools toggle state - synced with settings
const toolsEnabled = ref(settingsStore.settings?.tools?.enableToolCalls ?? true)

// Model selector state
const showModelDropdown = ref(false)
const modelSelectorRef = ref<HTMLElement | null>(null)
const modelDropdownPosition = ref<{ top: string; left: string }>({ top: '0px', left: '0px' })
const expandedProviders = ref<Set<string>>(new Set([settingsStore.settings?.ai?.provider || 'claude']))

const providerNames: Record<string, string> = {
  openai: 'OpenAI',
  claude: 'Anthropic',
  deepseek: 'DeepSeek',
  kimi: 'Kimi',
  zhipu: 'Zhipu',
  custom: 'Custom',
}

const currentProvider = computed(() => settingsStore.settings?.ai?.provider || 'claude')
const currentModel = computed(() => settingsStore.settings?.ai?.providers?.[currentProvider.value]?.model || '')

const currentModelDisplay = computed(() => {
  const provider = currentProvider.value
  const model = currentModel.value

  const providerName = providerNames[provider] || provider
  const modelShort = model || 'No model'

  return `${providerName} - ${modelShort}`
})

const availableProviders = computed(() => {
  const settings = settingsStore.settings
  if (!settings?.ai?.providers) return []

  return [
    {
      key: AIProvider.OpenAI,
      name: 'OpenAI',
      selectedModels: settings.ai.providers[AIProvider.OpenAI]?.selectedModels || [],
    },
    {
      key: AIProvider.Claude,
      name: 'Anthropic',
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
      name: 'Zhipu',
      selectedModels: settings.ai.providers[AIProvider.Zhipu]?.selectedModels || [],
    },
    {
      key: AIProvider.Custom,
      name: 'Custom',
      selectedModels: settings.ai.providers[AIProvider.Custom]?.selectedModels || [],
    },
  ].filter(p => {
    const config = settings.ai.providers[p.key]
    return config?.enabled !== false
  })
})

function toggleModelDropdown() {
  if (!showModelDropdown.value && modelSelectorRef.value) {
    const rect = modelSelectorRef.value.getBoundingClientRect()
    const panelWidth = 240

    // Position panel centered horizontally, above the button using bottom positioning
    let left = rect.left + (rect.width / 2) - (panelWidth / 2)
    const bottom = window.innerHeight - rect.top + 4

    // Ensure panel doesn't go off screen horizontally
    if (left < 8) {
      left = 8
    }
    if (left + panelWidth > window.innerWidth - 8) {
      left = window.innerWidth - panelWidth - 8
    }

    modelDropdownPosition.value = {
      bottom: `${bottom}px`,
      left: `${left}px`
    }
  }
  showModelDropdown.value = !showModelDropdown.value

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
  expandedProviders.value = new Set(expandedProviders.value)
}

function handleProviderClick(providerKey: string, hasModels: boolean) {
  if (hasModels) {
    // Only toggle expand/collapse, don't switch provider
    toggleProviderExpanded(providerKey)
  } else {
    // No models available, switch provider directly
    selectProvider(providerKey as AIProvider)
    showModelDropdown.value = false
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
  showModelDropdown.value = false
}

// Watch for settings changes
watch(() => settingsStore.settings?.tools?.enableToolCalls, (newValue) => {
  if (newValue !== undefined) {
    toolsEnabled.value = newValue
  }
})

function toggleTools() {
  toolsEnabled.value = !toolsEnabled.value
  // Update settings store
  if (settingsStore.settings?.tools) {
    settingsStore.settings.tools.enableToolCalls = toolsEnabled.value
    settingsStore.saveSettings(settingsStore.settings)
  }
  emit('toolsEnabledChange', toolsEnabled.value)
}

// Load available tools
async function loadAvailableTools() {
  try {
    const response = await window.electronAPI.getTools()
    if (response.success && response.tools) {
      availableTools.value = response.tools.map((tool: any) => ({
        id: tool.id,
        name: tool.name || tool.id,
        description: tool.description
      }))
    }
  } catch (error) {
    console.error('Failed to load tools:', error)
  }
}

// Toggle tools panel
function toggleToolsPanel() {
  if (!showToolsPanel.value && toolsDropdownRef.value) {
    const rect = toolsDropdownRef.value.getBoundingClientRect()
    const panelWidth = 260

    // Position panel above the button using bottom positioning
    let left = rect.left
    const bottom = window.innerHeight - rect.top + 4

    // Ensure panel doesn't go off screen horizontally
    if (left + panelWidth > window.innerWidth - 8) {
      left = window.innerWidth - panelWidth - 8
    }

    toolsPanelPosition.value = {
      bottom: `${bottom}px`,
      left: `${left}px`
    }
  }
  showToolsPanel.value = !showToolsPanel.value

  // Load tools when opening panel
  if (showToolsPanel.value) {
    loadAvailableTools()
  }
}

// Check if a tool is enabled
function isToolEnabled(toolId: string): boolean {
  const toolSettings = settingsStore.settings?.tools?.tools?.[toolId]
  return toolSettings?.enabled ?? true
}

// Toggle individual tool enabled state
function toggleToolEnabled(toolId: string) {
  if (settingsStore.settings?.tools) {
    if (!settingsStore.settings.tools.tools) {
      settingsStore.settings.tools.tools = {}
    }
    const current = settingsStore.settings.tools.tools[toolId]
    settingsStore.settings.tools.tools[toolId] = {
      ...current,
      enabled: !(current?.enabled ?? true)
    }
    settingsStore.saveSettings(settingsStore.settings)
  }
}

// Open tool settings
function openToolSettings() {
  showToolsPanel.value = false
  emit('openToolSettings')
}

// Close panel when clicking outside
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  // Close tools panel
  if (!target.closest('.tools-dropdown') && !target.closest('.tools-menu')) {
    showToolsPanel.value = false
  }
  // Close model dropdown
  if (!target.closest('.model-selector') && !target.closest('.model-dropdown')) {
    showModelDropdown.value = false
  }
}

const canSend = computed(() => {
  return (
    messageInput.value.trim().length > 0 &&
    !props.isLoading
  )
})

function handleKeyDown(e: KeyboardEvent) {
  // Ctrl/Cmd + Enter to send
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    sendMessage()
    return
  }

  // Shift + Enter for new line (default behavior)
  if (e.shiftKey && e.key === 'Enter') {
    return // Allow default
  }

  // Plain Enter to send (optional, can be disabled)
  // Uncomment if you want Enter to send:
  // if (e.key === 'Enter' && !e.shiftKey) {
  //   e.preventDefault()
  //   sendMessage()
  // }
}

function sendMessage() {
  if (canSend.value) {
    let fullMessage = messageInput.value

    // If there's quoted text, prepend it to the message with markdown quote format
    if (quotedText.value) {
      // Format: > quoted text (each line prefixed with >)
      // Then a blank line, then the user's question
      const quotedLines = quotedText.value.split('\n').map(line => `> ${line}`).join('\n')
      fullMessage = `${quotedLines}\n\n${messageInput.value}`
    }

    emit('sendMessage', fullMessage)
    messageInput.value = ''
    quotedText.value = ''
    nextTick(() => {
      adjustHeight()
    })
  }
}

function stopGeneration() {
  emit('stopGeneration')
}

function adjustHeight() {
  const textarea = textareaRef.value
  if (!textarea) return

  // Reset height to auto to get the correct scrollHeight
  textarea.style.height = 'auto'

  // Calculate new height (min 24px, max 200px)
  const newHeight = Math.min(Math.max(textarea.scrollHeight, 24), 200)
  textarea.style.height = `${newHeight}px`
}

function handleAttach() {
  // Placeholder for file attachment functionality
  console.log('Attach file clicked')
}

function setQuotedText(text: string) {
  quotedText.value = text
  // Focus on the input after setting quoted text
  nextTick(() => {
    textareaRef.value?.focus()
  })
}

function clearQuotedText() {
  quotedText.value = ''
}

// Expose methods to parent component
defineExpose({
  setQuotedText,
  clearQuotedText,
})

onMounted(() => {
  adjustHeight()
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.composer-wrapper {
  width: min(860px, 100%);
  margin: 0 auto;
}

/* Quoted text context */
.quoted-context {
  display: flex;
  gap: 10px;
  padding: 12px 14px;
  margin-bottom: 8px;
  background: rgba(120, 120, 128, 0.06);
  border-radius: 12px;
  position: relative;
  animation: slideInDown 0.2s ease-out;
}

@keyframes slideInDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.quoted-bar {
  width: 3px;
  background: linear-gradient(to bottom, rgba(59, 130, 246, 0.6), rgba(59, 130, 246, 0.3));
  border-radius: 2px;
  flex-shrink: 0;
}

.quoted-content-wrapper {
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

.quoted-text {
  flex: 1;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text);
  opacity: 0.75;
  max-height: 80px;
  overflow-y: auto;
  min-width: 0;
  word-wrap: break-word;
  white-space: pre-wrap;
}

/* Custom scrollbar for quoted text */
.quoted-text::-webkit-scrollbar {
  width: 3px;
}

.quoted-text::-webkit-scrollbar-track {
  background: transparent;
}

.quoted-text::-webkit-scrollbar-thumb {
  background: rgba(120, 120, 128, 0.3);
  border-radius: 2px;
}

.remove-quote-btn {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.15s ease;
  flex-shrink: 0;
  opacity: 0.6;
}

.remove-quote-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
  opacity: 1;
}

/* Main composer container */
.composer {
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.04) 0%,
    rgba(255, 255, 255, 0.02) 100%
  );
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.04),
    0 4px 24px rgba(0, 0, 0, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.composer.focused {
  border-color: rgba(59, 130, 246, 0.35);
  box-shadow:
    0 0 0 1px rgba(59, 130, 246, 0.15),
    0 4px 32px rgba(0, 0, 0, 0.2),
    0 0 20px rgba(59, 130, 246, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

/* Light theme */
html[data-theme='light'] .composer {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.95) 0%,
    rgba(250, 250, 250, 0.9) 100%
  );
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.04),
    0 4px 24px rgba(0, 0, 0, 0.06);
}

html[data-theme='light'] .composer.focused {
  border-color: rgba(59, 130, 246, 0.4);
  box-shadow:
    0 0 0 1px rgba(59, 130, 246, 0.1),
    0 4px 32px rgba(0, 0, 0, 0.08),
    0 0 20px rgba(59, 130, 246, 0.05);
}

/* Input area */
.input-area {
  padding: 16px 20px 8px 20px;
}

.composer-input {
  width: 100%;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 15px;
  resize: none;
  min-height: 28px;
  max-height: 200px;
  line-height: 1.6;
  color: var(--text);
  font-family: inherit;
  overflow-y: auto;
}

.composer-input::placeholder {
  color: var(--muted);
}

.composer-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Custom scrollbar for textarea */
.composer-input::-webkit-scrollbar {
  width: 4px;
}

.composer-input::-webkit-scrollbar-track {
  background: transparent;
}

.composer-input::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

/* Bottom toolbar */
.composer-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
}

.toolbar-left,
.toolbar-right,
.toolbar-center {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-center {
  flex: 1;
  justify-content: center;
}

.toolbar-right {
  gap: 12px;
}

/* Toolbar buttons */
.toolbar-btn {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  flex-shrink: 0;
  position: relative;
}

.toolbar-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}

html[data-theme='light'] .toolbar-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Tools button active state */
.tools-btn.active {
  color: var(--accent);
  background: rgba(59, 130, 246, 0.12);
}

.tools-btn.active:hover {
  background: rgba(59, 130, 246, 0.18);
}

/* Tools status dot */
.tools-status-dot {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 6px;
  height: 6px;
  background: var(--accent);
  border-radius: 50%;
  animation: pulse-dot 2s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.85); }
}

/* Tools dropdown container */
.tools-dropdown {
  position: relative;
}

/* Send button */
.send-btn {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

.send-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  transform: translateY(-1px) scale(1.02);
  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.4);
}

.send-btn:active:not(:disabled) {
  transform: scale(0.96);
  box-shadow: 0 1px 4px rgba(59, 130, 246, 0.2);
}

.send-btn:disabled {
  background: rgba(255, 255, 255, 0.08);
  color: var(--muted);
  cursor: not-allowed;
  box-shadow: none;
}

html[data-theme='light'] .send-btn:disabled {
  background: rgba(0, 0, 0, 0.06);
}

/* Stop button variant */
.send-btn.stop-btn {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
}

.send-btn.stop-btn:hover {
  background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
  transform: translateY(-1px) scale(1.02);
  box-shadow: 0 4px 16px rgba(239, 68, 68, 0.4);
}

.send-btn.stop-btn:active {
  transform: scale(0.96);
  box-shadow: 0 1px 4px rgba(239, 68, 68, 0.2);
}

.loading-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Tools dropdown menu */
.tools-menu {
  position: fixed;
  width: 260px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow:
    0 8px 40px rgba(0, 0, 0, 0.35),
    0 0 0 1px rgba(255, 255, 255, 0.05);
  z-index: 9999;
  overflow: hidden;
  animation: menuSlideUp 0.15s ease-out;
}

@keyframes menuSlideIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes menuSlideUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

html[data-theme='light'] .tools-menu {
  box-shadow:
    0 8px 40px rgba(0, 0, 0, 0.12),
    0 0 0 1px rgba(0, 0, 0, 0.05);
}

/* Tools menu header with master toggle */
.tools-menu-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}

.tools-menu-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  color: var(--text);
}

.tools-menu-title svg {
  color: var(--muted);
}

/* Toggle switch (master) */
.tools-toggle {
  position: relative;
  display: inline-block;
  cursor: pointer;
}

.tools-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.tools-toggle-slider {
  display: block;
  width: 40px;
  height: 22px;
  background: rgba(120, 120, 128, 0.32);
  border-radius: 11px;
  position: relative;
  transition: background 0.25s ease;
}

.tools-toggle-slider::after {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  background: white;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform 0.25s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.tools-toggle input:checked + .tools-toggle-slider {
  background: var(--accent);
}

.tools-toggle input:checked + .tools-toggle-slider::after {
  transform: translateX(18px);
}

/* Tools menu list */
.tools-menu-list {
  max-height: 200px;
  overflow-y: auto;
  padding: 8px;
}

.tool-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 10px;
  border-radius: 8px;
  margin-bottom: 2px;
  transition: background 0.15s;
}

.tool-item:last-child {
  margin-bottom: 0;
}

.tool-item:hover {
  background: var(--hover);
}

.tool-item.disabled {
  opacity: 0.5;
}

.tool-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.tools-empty {
  padding: 20px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}

/* Mini toggle (for individual tools) */
.tool-item-toggle {
  position: relative;
  display: inline-block;
  cursor: pointer;
}

.tool-item-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.tool-item-toggle input:disabled {
  cursor: not-allowed;
}

.tool-item-toggle-slider {
  display: block;
  width: 36px;
  height: 20px;
  background: rgba(120, 120, 128, 0.32);
  border-radius: 10px;
  position: relative;
  transition: background 0.25s ease;
}

.tool-item-toggle-slider::after {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform 0.25s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.tool-item-toggle input:checked + .tool-item-toggle-slider {
  background: var(--accent);
}

.tool-item-toggle input:checked + .tool-item-toggle-slider::after {
  transform: translateX(16px);
}

.tool-item-toggle input:disabled + .tool-item-toggle-slider {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Tools menu settings button */
.tools-menu-settings {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px 14px;
  border-top: 1px solid var(--border);
  background: transparent;
  border-left: none;
  border-right: none;
  border-bottom: none;
  color: var(--accent);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.tools-menu-settings:hover {
  background: rgba(59, 130, 246, 0.08);
}

/* Model selector */
.model-selector {
  position: relative;
}

.model-selector-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--muted);
  transition: all 0.15s ease;
  height: 34px;
}

.model-selector-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}

html[data-theme='light'] .model-selector-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

/* Provider icon */
.provider-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.provider-icon.openai {
  color: #10a37f;
}

.provider-icon.claude {
  color: #d97706;
}

.provider-icon.deepseek {
  color: #4D6BFE;
}

.provider-icon.kimi,
.provider-icon.zhipu,
.provider-icon.custom {
  color: var(--muted);
}

.model-selector-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}

html[data-theme='light'] .model-selector-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

.model-text {
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dropdown-chevron {
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.dropdown-chevron.open {
  transform: rotate(180deg);
}

/* Model dropdown menu */
.model-dropdown {
  position: fixed;
  width: 240px;
  max-height: 320px;
  overflow-y: auto;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow:
    0 8px 40px rgba(0, 0, 0, 0.35),
    0 0 0 1px rgba(255, 255, 255, 0.05);
  z-index: 9999;
  padding: 6px;
  animation: menuSlideUp 0.15s ease-out;
}

html[data-theme='light'] .model-dropdown {
  box-shadow:
    0 8px 40px rgba(0, 0, 0, 0.12),
    0 0 0 1px rgba(0, 0, 0, 0.05);
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
  background: rgba(59, 130, 246, 0.1);
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
  background: rgba(59, 130, 246, 0.1);
  color: var(--accent);
}

.model-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
