<template>
  <div class="model-selector" ref="selectorRef">
    <button class="model-selector-btn" @click="toggleDropdown" :title="currentModel || 'Select model'">
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
        <!-- DeepSeek icon -->
        <svg v-else-if="currentProvider === 'deepseek'" width="18" height="18" viewBox="0 0 512 509.64" fill="currentColor">
          <path d="M440.898 139.167c-4.001-1.961-5.723 1.776-8.062 3.673-.801.612-1.479 1.407-2.154 2.141-5.848 6.246-12.681 10.349-21.607 9.859-13.048-.734-24.192 3.368-34.04 13.348-2.093-12.307-9.048-19.658-19.635-24.37-5.54-2.449-11.141-4.9-15.02-10.227-2.708-3.795-3.447-8.021-4.801-12.185-.861-2.509-1.725-5.082-4.618-5.512-3.139-.49-4.372 2.142-5.601 4.349-4.925 9.002-6.833 18.921-6.647 28.962.432 22.597 9.972 40.597 28.932 53.397 2.154 1.47 2.707 2.939 2.032 5.082-1.293 4.41-2.832 8.695-4.186 13.105-.862 2.817-2.157 3.429-5.172 2.205-10.402-4.346-19.391-10.778-27.332-18.553-13.481-13.044-25.668-27.434-40.873-38.702a177.614 177.614 0 00-10.834-7.409c-15.512-15.063 2.032-27.434 6.094-28.902 4.247-1.532 1.478-6.797-12.251-6.736-13.727.061-26.285 4.653-42.288 10.777-2.34.92-4.801 1.593-7.326 2.142-14.527-2.756-29.608-3.368-45.367-1.593-29.671 3.305-53.368 17.329-70.788 41.272-20.928 28.785-25.854 61.482-19.821 95.59 6.34 35.943 24.683 65.704 52.876 88.974 29.239 24.123 62.911 35.943 101.32 33.677 23.329-1.346 49.307-4.468 78.607-29.27 7.387 3.673 15.142 5.144 28.008 6.246 9.911.92 19.452-.49 26.839-2.019 11.573-2.449 10.773-13.166 6.586-15.124-33.915-15.797-26.47-9.368-33.24-14.573 17.235-20.39 43.213-41.577 53.369-110.222.8-5.448.121-8.877 0-13.287-.061-2.692.553-3.734 3.632-4.041 8.494-.981 16.742-3.305 24.314-7.471 21.975-12.002 30.84-31.719 32.933-55.355.307-3.612-.061-7.348-3.879-9.245v-.003z"/>
        </svg>
        <!-- OpenRouter icon -->
        <svg v-else-if="currentProvider === 'openrouter'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
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
        v-if="showDropdown"
        class="model-dropdown"
        :style="dropdownPosition"
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
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { AIProvider } from '../../../shared/ipc'

const settingsStore = useSettingsStore()

const showDropdown = ref(false)
const selectorRef = ref<HTMLElement | null>(null)
const dropdownPosition = ref<{ top?: string; bottom?: string; left: string }>({ bottom: '0px', left: '0px' })
const expandedProviders = ref<Set<string>>(new Set([settingsStore.settings?.ai?.provider || 'claude']))

const currentProvider = computed(() => settingsStore.settings?.ai?.provider || 'claude')
const currentModel = computed(() => settingsStore.settings?.ai?.providers?.[currentProvider.value]?.model || '')

const availableProviders = computed(() => {
  const settings = settingsStore.settings
  if (!settings?.ai?.providers) return []

  // Built-in providers
  const builtInProviders = [
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
      key: AIProvider.OpenRouter,
      name: 'OpenRouter',
      selectedModels: settings.ai.providers[AIProvider.OpenRouter]?.selectedModels || [],
    },
  ].filter(p => {
    const config = settings.ai.providers[p.key]
    return config?.enabled !== false
  })

  // Custom providers from settings
  const customProviders = (settings.ai.customProviders || []).map(cp => ({
    key: cp.id,
    name: cp.name,
    selectedModels: settings.ai.providers[cp.id]?.selectedModels || cp.selectedModels || [],
  }))

  return [...builtInProviders, ...customProviders]
})

function toggleDropdown() {
  if (!showDropdown.value && selectorRef.value) {
    const rect = selectorRef.value.getBoundingClientRect()
    const panelWidth = 240

    let left = rect.left + (rect.width / 2) - (panelWidth / 2)
    const bottom = window.innerHeight - rect.top + 4

    if (left < 8) {
      left = 8
    }
    if (left + panelWidth > window.innerWidth - 8) {
      left = window.innerWidth - panelWidth - 8
    }

    dropdownPosition.value = {
      bottom: `${bottom}px`,
      left: `${left}px`
    }
  }
  showDropdown.value = !showDropdown.value

  if (showDropdown.value) {
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
    toggleProviderExpanded(providerKey)
  } else {
    selectProvider(providerKey as AIProvider)
    showDropdown.value = false
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
  showDropdown.value = false
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (showDropdown.value && selectorRef.value && !selectorRef.value.contains(target)) {
    const dropdown = document.querySelector('.model-dropdown')
    if (!dropdown?.contains(target)) {
      showDropdown.value = false
    }
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.model-selector {
  position: relative;
}

.model-selector-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--border);
  background: var(--hover);
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text);
  transition: background 0.2s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  height: 34px;
}

.model-selector-btn:hover {
  background: var(--active);
  border-color: var(--accent);
  transform: translateY(-1px);
}

.model-selector-btn:active {
  transform: scale(0.97);
}

html[data-theme='light'] .model-selector-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

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

.provider-icon.openrouter {
  color: #6366f1;
}

.provider-icon.kimi,
.provider-icon.zhipu,
.provider-icon.custom {
  color: var(--text);
}

.model-text {
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-dropdown {
  position: fixed;
  width: 240px;
  max-height: 320px;
  overflow-y: auto;
  background: var(--bg-elevated);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow);
  z-index: 9999;
  padding: 6px;
  animation: menuSlideUp 0.15s ease-out;
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

.provider-header .provider-name {
  font-weight: 600;
  letter-spacing: 0.2px;
}

.provider-header.active {
  background: rgba(var(--accent-rgb), 0.1);
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
  padding-left: 12px;
  border-left: 1px solid rgba(255, 255, 255, 0.06);
  margin-left: 21px;
  margin-top: 4px;
  margin-bottom: 8px;
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
  background: rgba(var(--accent-rgb), 0.15);
  color: var(--accent);
  font-weight: 600;
  box-shadow: inset 0 0 0 1px rgba(var(--accent-rgb), 0.2);
}

.model-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
