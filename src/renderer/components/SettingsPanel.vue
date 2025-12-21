<template>
  <div class="settings-overlay" @click.self="handleClose">
    <div class="settings-panel floating-hub">
    <header class="settings-header">
      <div class="header-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
        <h2>Settings</h2>
      </div>
      <button class="close-btn" @click="handleClose" title="Close settings">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </header>

    <!-- Unsaved Changes Dialog -->
    <UnsavedChangesDialog
      :visible="showUnsavedDialog"
      @discard="discardAndClose"
      @cancel="showUnsavedDialog = false"
      @save="saveAndClose"
    />

    <!-- Add/Edit Custom Provider Dialog -->
    <CustomProviderDialog
      :visible="showCustomProviderDialog"
      :is-editing="!!editingCustomProvider"
      :initial-data="customProviderFormData"
      :error="customProviderError"
      @close="closeCustomProviderDialog"
      @save="handleSaveCustomProvider"
      @delete="confirmDeleteCustomProvider"
    />

    <!-- Delete Confirmation Dialog -->
    <DeleteConfirmDialog
      :visible="showDeleteConfirmDialog"
      :provider-name="customProviderFormData.name"
      @cancel="showDeleteConfirmDialog = false"
      @confirm="deleteCustomProvider"
    />

    <!-- Tab Navigation -->
    <div class="tabs-nav">
      <button
        :class="['tab-btn', { active: activeTab === 'general' }]"
        @click="activeTab = 'general'"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
        General
      </button>
      <button
        :class="['tab-btn', { active: activeTab === 'ai' }]"
        @click="activeTab = 'ai'"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1H2a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2z"/>
          <circle cx="8" cy="14" r="1"/><circle cx="16" cy="14" r="1"/>
        </svg>
        AI Provider
      </button>
      <button
        :class="['tab-btn', { active: activeTab === 'tools' }]"
        @click="activeTab = 'tools'"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
        </svg>
        Tools
      </button>
      <button
        :class="['tab-btn', { active: activeTab === 'shortcuts' }]"
        @click="activeTab = 'shortcuts'"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="4" width="20" height="16" rx="2"/>
          <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>
        </svg>
        Shortcuts
      </button>
      <button
        :class="['tab-btn', { active: activeTab === 'mcp' }]"
        @click="activeTab = 'mcp'"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
        MCP
      </button>
      <button
        :class="['tab-btn', { active: activeTab === 'skills' }]"
        @click="activeTab = 'skills'"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        Skills
      </button>
    </div>

    <div class="settings-content">
      <!-- General Tab -->
      <GeneralSettingsTab
        v-show="activeTab === 'general'"
        :settings="localSettings"
        @update:settings="updateSettings"
      />

      <!-- AI Provider Tab -->
      <AIProviderTab
        v-show="activeTab === 'ai'"
        :settings="localSettings"
        :providers="providers"
        @update:settings="updateSettings"
        @add-custom-provider="openAddCustomProvider"
        @edit-custom-provider="openEditCustomProvider"
      />

      <!-- Tools Tab -->
      <ToolsSettingsTab
        v-show="activeTab === 'tools'"
        :settings="localSettings"
        :tools="availableTools"
        @update:settings="updateSettings"
      />

      <!-- Shortcuts Tab -->
      <ShortcutsSettingsTab
        v-show="activeTab === 'shortcuts'"
        :settings="localSettings"
        @update:settings="updateSettings"
      />

      <!-- MCP Tab -->
      <div v-show="activeTab === 'mcp'" class="tab-content">
        <MCPSettingsPanel
          :settings="localSettings.mcp || { enabled: true, servers: [] }"
          @update:settings="handleMCPSettingsUpdate"
        />
      </div>

      <!-- Skills Tab -->
      <div v-show="activeTab === 'skills'" class="tab-content">
        <SkillsSettingsPanel
          :settings="localSettings.skills || { enableSkills: true, skills: {} }"
          @update:settings="handleSkillsSettingsUpdate"
        />
      </div>
    </div>

    <SettingsFooter
      :has-unsaved-changes="hasUnsavedChanges"
      :is-saving="isSaving"
      :show-save-success="showSaveSuccess"
      @save="saveSettings"
      @cancel="handleClose"
    />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, toRaw, onMounted, computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import type { AppSettings, AIProvider, ProviderInfo, CustomProviderConfig, ToolDefinition } from '@/types'
import { AIProvider as AIProviderEnum } from '../../shared/ipc'
import { v4 as uuidv4 } from 'uuid'

// Import settings components
import CustomProviderDialog, { type CustomProviderForm } from './settings/CustomProviderDialog.vue'
import UnsavedChangesDialog from './settings/UnsavedChangesDialog.vue'
import DeleteConfirmDialog from './settings/DeleteConfirmDialog.vue'
import MCPSettingsPanel from './settings/MCPSettingsPanel.vue'
import SkillsSettingsPanel from './settings/SkillsSettingsPanel.vue'
import GeneralSettingsTab from './settings/GeneralSettingsTab.vue'
import AIProviderTab from './settings/AIProviderTab.vue'
import ToolsSettingsTab from './settings/ToolsSettingsTab.vue'
import ShortcutsSettingsTab from './settings/ShortcutsSettingsTab.vue'
import SettingsFooter from './settings/SettingsFooter.vue'

const emit = defineEmits<{
  close: []
}>()

const settingsStore = useSettingsStore()

// Active tab
const activeTab = ref<'general' | 'ai' | 'tools' | 'shortcuts' | 'mcp' | 'skills'>('general')

// Deep clone settings, ensuring providers object exists
const localSettings = ref<AppSettings>(
  JSON.parse(JSON.stringify(toRaw(settingsStore.settings))) as AppSettings
)

// Initialize settings structure
initializeSettings()

function initializeSettings() {
  // Ensure providers object exists (for migration from old settings)
  if (!localSettings.value.ai.providers) {
    localSettings.value.ai.providers = {
      [AIProviderEnum.OpenAI]: { apiKey: '', model: 'gpt-4', selectedModels: ['gpt-4'] },
      [AIProviderEnum.Claude]: { apiKey: '', model: 'claude-sonnet-4-5-20250929', selectedModels: ['claude-sonnet-4-5-20250929'] },
      [AIProviderEnum.DeepSeek]: { apiKey: '', model: 'deepseek-chat', selectedModels: ['deepseek-chat', 'deepseek-reasoner'] },
      [AIProviderEnum.Kimi]: { apiKey: '', model: 'moonshot-v1-8k', selectedModels: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] },
      [AIProviderEnum.Zhipu]: { apiKey: '', model: 'glm-4-flash', selectedModels: ['glm-4-flash', 'glm-4-plus', 'glm-4'] },
      [AIProviderEnum.Custom]: { apiKey: '', baseUrl: '', model: '', selectedModels: [] },
    }
  }

  // Ensure all built-in providers have config
  const defaultProviderConfigs: Record<string, { apiKey: string; model: string; selectedModels: string[]; baseUrl?: string }> = {
    [AIProviderEnum.OpenAI]: { apiKey: '', model: 'gpt-4', selectedModels: ['gpt-4', 'gpt-4o', 'gpt-3.5-turbo'] },
    [AIProviderEnum.Claude]: { apiKey: '', model: 'claude-sonnet-4-5-20250929', selectedModels: ['claude-sonnet-4-5-20250929', 'claude-3-5-haiku-20241022'] },
    [AIProviderEnum.DeepSeek]: { apiKey: '', model: 'deepseek-chat', selectedModels: ['deepseek-chat', 'deepseek-reasoner'] },
    [AIProviderEnum.Kimi]: { apiKey: '', model: 'moonshot-v1-8k', selectedModels: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] },
    [AIProviderEnum.Zhipu]: { apiKey: '', model: 'glm-4-flash', selectedModels: ['glm-4-flash', 'glm-4-plus', 'glm-4'] },
    [AIProviderEnum.Custom]: { apiKey: '', baseUrl: '', model: '', selectedModels: [] },
  }

  for (const [providerId, defaultConfig] of Object.entries(defaultProviderConfigs)) {
    if (!localSettings.value.ai.providers[providerId]) {
      localSettings.value.ai.providers[providerId] = { ...defaultConfig }
    }
  }

  // Ensure selectedModels exists for each provider
  for (const providerKey of Object.keys(localSettings.value.ai.providers)) {
    const provider = localSettings.value.ai.providers[providerKey as AIProvider]
    if (!provider.selectedModels) {
      provider.selectedModels = provider.model ? [provider.model] : []
    }
  }

  // Ensure general settings exist
  if (!localSettings.value.general) {
    localSettings.value.general = {
      animationSpeed: 0.25,
      sendShortcut: 'enter',
    }
  } else if (!localSettings.value.general.sendShortcut) {
    localSettings.value.general.sendShortcut = 'enter'
  }

  // Ensure customProviders array exists
  if (!localSettings.value.ai.customProviders) {
    localSettings.value.ai.customProviders = []
  }

  // Ensure tools settings exist
  if (!localSettings.value.tools) {
    localSettings.value.tools = {
      enableToolCalls: true,
      tools: {},
    }
  }

  // Ensure MCP settings exist
  if (!localSettings.value.mcp) {
    localSettings.value.mcp = {
      enabled: true,
      servers: [],
    }
  }

  // Ensure Skills settings exist
  if (!localSettings.value.skills) {
    localSettings.value.skills = {
      enableSkills: true,
      skills: {},
    }
  }
}

// State
const isSaving = ref(false)
const showSaveSuccess = ref(false)
const showUnsavedDialog = ref(false)

// Custom provider dialog state
const showCustomProviderDialog = ref(false)
const editingCustomProvider = ref<string | null>(null)
const showDeleteConfirmDialog = ref(false)
const customProviderError = ref('')
const customProviderFormData = ref<CustomProviderForm>({
  name: '',
  description: '',
  apiType: 'openai',
  baseUrl: '',
  apiKey: '',
  model: '',
})

// Tools state
const availableTools = ref<ToolDefinition[]>([])

// Store original settings for comparison
const originalSettings = ref<string>(JSON.stringify(localSettings.value))

// Computed: check if there are unsaved changes
const hasUnsavedChanges = computed(() => {
  return JSON.stringify(localSettings.value) !== originalSettings.value
})

// Get providers from settings store
const providers = computed<ProviderInfo[]>(() => {
  if (settingsStore.availableProviders.length > 0) {
    return settingsStore.availableProviders
  }
  // Fallback providers (shown while loading)
  return [
    { id: 'openai', name: 'OpenAI', icon: 'openai', description: 'GPT-4, GPT-3.5 and other OpenAI models', defaultBaseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini', supportsCustomBaseUrl: true, requiresApiKey: true },
    { id: 'claude', name: 'Claude', icon: 'claude', description: 'Claude 3.5, Claude 3 and other Anthropic models', defaultBaseUrl: 'https://api.anthropic.com/v1', defaultModel: 'claude-3-5-sonnet-20241022', supportsCustomBaseUrl: true, requiresApiKey: true },
    { id: 'deepseek', name: 'DeepSeek', icon: 'deepseek', description: 'DeepSeek-V3, DeepSeek-R1 and other DeepSeek models', defaultBaseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat', supportsCustomBaseUrl: true, requiresApiKey: true },
    { id: 'kimi', name: 'Kimi', icon: 'kimi', description: 'Moonshot AI Kimi models with long context support', defaultBaseUrl: 'https://api.moonshot.cn/v1', defaultModel: 'moonshot-v1-8k', supportsCustomBaseUrl: true, requiresApiKey: true },
    { id: 'zhipu', name: '智谱 GLM', icon: 'zhipu', description: 'GLM-4, GLM-3 and other Zhipu AI models', defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-4-flash', supportsCustomBaseUrl: true, requiresApiKey: true },
    { id: 'custom', name: 'Custom', icon: 'custom', description: 'OpenAI-compatible API endpoint', defaultBaseUrl: '', defaultModel: '', supportsCustomBaseUrl: true, requiresApiKey: true },
  ]
})

// Update settings from child components
function updateSettings(newSettings: AppSettings) {
  localSettings.value = newSettings
}

// Handle MCP settings update (MCP changes are saved directly to backend via IPC)
function handleMCPSettingsUpdate(mcpSettings: { enabled: boolean; servers: any[] }) {
  localSettings.value.mcp = mcpSettings
  // Update originalSettings since MCP changes are already saved to backend
  originalSettings.value = JSON.stringify(localSettings.value)
}

// Handle Skills settings update (Skills changes are saved directly to backend via IPC)
function handleSkillsSettingsUpdate(skillsSettings: { enableSkills: boolean; skills: Record<string, { enabled: boolean }> }) {
  localSettings.value.skills = skillsSettings
  // Update originalSettings since Skills changes are already saved to backend
  originalSettings.value = JSON.stringify(localSettings.value)
}

// Load available tools
async function loadAvailableTools() {
  try {
    const response = await window.electronAPI.getTools()
    if (response.success && response.tools) {
      availableTools.value = response.tools
    }
  } catch (error) {
    console.error('Failed to load tools:', error)
  }
}

// Custom provider dialog functions
function openAddCustomProvider() {
  editingCustomProvider.value = null
  customProviderError.value = ''
  customProviderFormData.value = {
    name: '',
    description: '',
    apiType: 'openai',
    baseUrl: '',
    apiKey: '',
    model: '',
  }
  showCustomProviderDialog.value = true
}

function openEditCustomProvider(providerId: string) {
  const provider = settingsStore.getCustomProvider(providerId)
  if (!provider) return

  editingCustomProvider.value = providerId
  customProviderError.value = ''
  customProviderFormData.value = {
    name: provider.name,
    description: provider.description || '',
    apiType: provider.apiType,
    baseUrl: provider.baseUrl || '',
    apiKey: provider.apiKey,
    model: provider.model,
  }
  showCustomProviderDialog.value = true
}

function closeCustomProviderDialog() {
  showCustomProviderDialog.value = false
  editingCustomProvider.value = null
  customProviderError.value = ''
}

async function handleSaveCustomProvider(formData: CustomProviderForm) {
  if (!formData.name.trim()) {
    customProviderError.value = 'Provider name is required'
    return
  }
  if (!formData.baseUrl.trim()) {
    customProviderError.value = 'Base URL is required'
    return
  }

  try {
    if (editingCustomProvider.value) {
      const updates = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        apiType: formData.apiType,
        baseUrl: formData.baseUrl.trim(),
        apiKey: formData.apiKey,
        model: formData.model.trim(),
      }
      settingsStore.updateCustomProvider(editingCustomProvider.value, updates)

      // Also update localSettings.ai.customProviders to keep in sync
      const providerId = editingCustomProvider.value
      const customIndex = localSettings.value.ai.customProviders?.findIndex(p => p.id === providerId) ?? -1
      if (customIndex !== -1 && localSettings.value.ai.customProviders) {
        Object.assign(localSettings.value.ai.customProviders[customIndex], updates)
      }

      if (localSettings.value.ai.providers[providerId]) {
        localSettings.value.ai.providers[providerId].apiKey = formData.apiKey
        localSettings.value.ai.providers[providerId].baseUrl = formData.baseUrl.trim()
        localSettings.value.ai.providers[providerId].model = formData.model.trim()
      }
    } else {
      const newProviderId = `custom-${uuidv4().slice(0, 8)}`
      const newProvider: CustomProviderConfig = {
        id: newProviderId,
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        apiType: formData.apiType,
        baseUrl: formData.baseUrl.trim(),
        apiKey: formData.apiKey,
        model: formData.model.trim(),
        selectedModels: formData.model.trim() ? [formData.model.trim()] : [],
      }
      settingsStore.addCustomProvider(newProvider)

      // Also update localSettings to keep in sync
      if (!localSettings.value.ai.customProviders) {
        localSettings.value.ai.customProviders = []
      }
      localSettings.value.ai.customProviders.push(newProvider)

      localSettings.value.ai.providers[newProviderId] = {
        apiKey: newProvider.apiKey,
        baseUrl: newProvider.baseUrl,
        model: newProvider.model,
        selectedModels: newProvider.selectedModels,
      }
    }

    await saveSettings()
    closeCustomProviderDialog()
  } catch (err: any) {
    customProviderError.value = err.message || 'Failed to save provider'
  }
}

function confirmDeleteCustomProvider() {
  showDeleteConfirmDialog.value = true
}

async function deleteCustomProvider() {
  if (!editingCustomProvider.value) return

  const providerId = editingCustomProvider.value
  settingsStore.deleteCustomProvider(providerId)

  // Also update localSettings to keep in sync
  if (localSettings.value.ai.customProviders) {
    localSettings.value.ai.customProviders = localSettings.value.ai.customProviders.filter(p => p.id !== providerId)
  }
  delete localSettings.value.ai.providers[providerId]

  // If this was the active provider, switch to a built-in one
  if (localSettings.value.ai.provider === providerId) {
    localSettings.value.ai.provider = 'openai' as any
  }

  await saveSettings()
  showDeleteConfirmDialog.value = false
  closeCustomProviderDialog()
}

// Save/Close functions
async function saveSettings() {
  isSaving.value = true
  try {
    await settingsStore.saveSettings(localSettings.value)
    originalSettings.value = JSON.stringify(localSettings.value)
    showSaveSuccess.value = true
    setTimeout(() => {
      showSaveSuccess.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to save settings:', err)
  } finally {
    isSaving.value = false
  }
}

function handleClose() {
  if (hasUnsavedChanges.value) {
    showUnsavedDialog.value = true
  } else {
    emit('close')
  }
}

function discardAndClose() {
  showUnsavedDialog.value = false
  emit('close')
}

async function saveAndClose() {
  await saveSettings()
  showUnsavedDialog.value = false
  emit('close')
}

onMounted(async () => {
  await loadAvailableTools()
})
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  backdrop-filter: blur(8px);
  padding: 20px;
}

.settings-panel.floating-hub {
  position: relative;
  width: min(680px, 100%);
  height: min(720px, 85vh);
  background: var(--bg);
  border-radius: 24px;
  border: 1px solid var(--border);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  backdrop-filter: blur(25px);
  -webkit-backdrop-filter: blur(25px);
  animation: modalPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  user-select: none;
}

/* Allow selection for paths and code elements */
.settings-panel.floating-hub :deep(code),
.settings-panel.floating-hub :deep(.group-path),
.settings-panel.floating-hub :deep(input),
.settings-panel.floating-hub :deep(textarea) {
  user-select: text;
}

@keyframes modalPop {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.03);
}

html[data-theme='light'] .settings-header {
  background: rgba(0, 0, 0, 0.02);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text);
}

.header-title h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.close-btn {
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

.close-btn:hover {
  background: var(--hover);
  color: var(--text);
}

/* Tab Navigation */
.tabs-nav {
  display: flex;
  gap: 2px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.02);
}

html[data-theme='light'] .tabs-nav {
  background: rgba(0, 0, 0, 0.01);
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.tab-btn.active {
  background: rgba(59, 130, 246, 0.15);
  color: var(--accent);
}

.tab-btn svg {
  flex-shrink: 0;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  scrollbar-width: thin;
}

.tab-content {
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Responsive styles */
@media (max-width: 768px) {
  .settings-panel {
    width: 100%;
  }

  .settings-header {
    padding: 14px 16px;
  }

  .tabs-nav {
    padding: 10px 16px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .tabs-nav::-webkit-scrollbar {
    display: none;
  }

  .tab-btn {
    padding: 8px 12px;
    font-size: 13px;
    white-space: nowrap;
  }

  .settings-content {
    padding: 16px;
  }
}

@media (max-width: 480px) {
  .settings-header {
    padding: 12px 14px;
  }

  .header-title h2 {
    font-size: 16px;
  }

  .tabs-nav {
    padding: 8px 12px;
    gap: 2px;
  }

  .tab-btn {
    padding: 6px 10px;
    font-size: 12px;
    gap: 6px;
  }

  .tab-btn svg {
    width: 14px;
    height: 14px;
  }

  .settings-content {
    padding: 12px;
  }
}
</style>
