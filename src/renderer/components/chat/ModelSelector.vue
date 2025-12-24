<template>
  <div class="model-selector" ref="selectorRef">
    <button class="model-selector-btn" @click="toggleDropdown" :title="currentModel || 'Select model'">
      <!-- Provider icon -->
      <span class="provider-icon" :class="currentProvider">
        <ProviderIcon :provider="currentProvider" :size="18" />
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
import ProviderIcon from '../settings/ProviderIcon.vue'

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

.provider-icon {
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
