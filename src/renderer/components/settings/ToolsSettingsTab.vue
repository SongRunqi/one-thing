<template>
  <div class="tab-content">
    <!-- Enable Tool Calls -->
    <SettingsSection
      title="Tool Settings"
      description="Control which built-in capabilities the assistant may use during conversations."
    >
      <SettingsGroup>
        <SettingRow
          label="Enable Tool Calls"
          description="Allow AI to use tools during conversations."
        >
          <label class="toggle">
            <input
              type="checkbox"
              :checked="settings.tools.enableToolCalls"
              @change="updateEnableToolCalls(($event.target as HTMLInputElement).checked)"
            >
            <span class="toggle-slider" />
          </label>
        </SettingRow>

        <SettingRow
          label="Permission Mode"
          description="Control when tool calls ask for confirmation. Normal asks before edits and non-read-only commands; Auto Accept Edits runs file edits automatically; Dangerously Allow All runs tools without confirmation."
        >
          <select
            class="form-input mode-select"
            :value="settings.tools.permissionMode || 'normal'"
            :disabled="!settings.tools.enableToolCalls"
            @change="updatePermissionMode(($event.target as HTMLSelectElement).value as PermissionMode)"
          >
            <option value="normal">
              Normal
            </option>
            <option value="auto-accept-edits">
              Auto Accept Edits
            </option>
            <option value="dangerously-allow-all">
              Dangerously Allow All
            </option>
          </select>
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>

    <SettingsSection
      title="Tool Call Model"
      description="Choose the already-configured provider and model used for lightweight AI utility calls, including automatic chat naming."
    >
      <SettingsGroup>
        <SettingRow
          label="Tool Call Provider"
          description="Only providers with selected models are shown."
        >
          <select
            class="form-input model-setting-select"
            :value="selectedToolCallProvider"
            :disabled="configuredProviders.length === 0"
            @change="updateToolCallProvider(($event.target as HTMLSelectElement).value)"
          >
            <option
              v-if="configuredProviders.length === 0"
              value=""
            >
              No configured providers
            </option>
            <option
              v-for="provider in configuredProviders"
              :key="provider.id"
              :value="provider.id"
            >
              {{ provider.name }}
            </option>
          </select>
        </SettingRow>

        <SettingRow
          label="Model"
          :description="toolCallModelHint"
        >
          <select
            class="form-input model-setting-select"
            :value="selectedToolCallModel"
            :disabled="selectedToolCallModels.length === 0"
            @change="updateToolCallModel(($event.target as HTMLSelectElement).value)"
          >
            <option
              v-if="selectedToolCallModels.length === 0"
              value=""
            >
              No selected models
            </option>
            <option
              v-for="model in selectedToolCallModels"
              :key="model"
              :value="model"
            >
              {{ getModelName(model) }}
            </option>
          </select>
        </SettingRow>

        <SettingRow
          label="Think Mode"
          description="Independent from the chat Think control. Disabled by default for fast utility calls."
        >
          <label class="toggle">
            <input
              type="checkbox"
              :checked="toolCallThinkingEnabled"
              :disabled="!selectedToolCallModel"
              @change="updateToolCallThinking(($event.target as HTMLInputElement).checked)"
            >
            <span class="toggle-slider" />
          </label>
        </SettingRow>

        <SettingRow
          label="Thinking Effort"
          description="Used only when Tool Call Think Mode is enabled."
        >
          <select
            class="form-input model-setting-select"
            :value="selectedToolCallThinkingEffort"
            :disabled="!toolCallThinkingEnabled || !selectedToolCallModel"
            @change="updateToolCallThinkingEffort(($event.target as HTMLSelectElement).value as ThinkingEffort)"
          >
            <option
              v-for="option in thinkingEffortOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>

    <!-- Available Tools -->
    <SettingsSection
      v-if="settings.tools.enableToolCalls"
      title="Available Tools"
    >
      <SettingsEmptyState
        v-if="displayTools.length === 0"
        title="No tools available"
        description="Built-in tools will appear here when the main process exposes them."
      />

      <SettingsGroup
        v-else
        class="tools-list"
      >
        <SettingRow
          v-for="tool in displayTools"
          :key="tool.id"
          class="tool-item"
        >
          <template #label>
            <span class="tool-name">{{ tool.name }}</span>
            <span :class="['tool-category', tool.category]">{{ tool.category }}</span>
          </template>
          <div class="tool-controls">
            <label
              class="toggle small"
              :title="getToolEnabled(tool.id) ? 'Enabled' : 'Disabled'"
            >
              <input
                type="checkbox"
                :checked="getToolEnabled(tool.id)"
                @change="setToolEnabled(tool.id, ($event.target as HTMLInputElement).checked)"
              >
              <span class="toggle-slider" />
            </label>
          </div>
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>

    <!-- Web Search Settings -->
    <SettingsSection
      v-if="settings.tools.enableToolCalls && hasWebSearchTool"
      title="Web Search"
      description="Configure credentials for external search tools."
    >
      <SettingsGroup>
        <SettingRow
          label="Brave Search API Key"
          description="Get your free API key at brave.com/search/api (2,000 queries/month free)."
        >
          <input
            type="password"
            class="form-input"
            :value="settings.tools.webSearch?.braveApiKey || ''"
            placeholder="Enter your Brave Search API key"
            @input="updateBraveApiKey(($event.target as HTMLInputElement).value)"
          >
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>

    <!-- Bash Tool Settings -->
    <BashSettingsPanel
      v-if="settings.tools.enableToolCalls && hasBashTool"
      :settings="settings"
      @update:settings="$emit('update:settings', $event)"
    />

    <BackgroundJobsPanel v-if="settings.tools.enableToolCalls && hasBashTool" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AppSettings, ToolDefinition } from '@/types'
import type { ThinkingEffort } from '@shared/ipc/providers'
import type { PermissionMode, WebSearchSettings } from '@shared/ipc/tools'
import { useSettingsStore } from '@/stores/settings'
import BashSettingsPanel from './BashSettingsPanel.vue'
import BackgroundJobsPanel from './BackgroundJobsPanel.vue'
import {
  SettingRow,
  SettingsEmptyState,
  SettingsGroup,
  SettingsSection,
} from './settings-primitives'

const props = defineProps<{
  settings: AppSettings
  tools: ToolDefinition[]
}>()

const emit = defineEmits<{
  'update:settings': [settings: AppSettings]
}>()

const settingsStore = useSettingsStore()

const thinkingEffortOptions: Array<{ value: ThinkingEffort; label: string }> = [
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'X High' },
  { value: 'max', label: 'Max' },
]

const displayTools = computed(() => {
  return props.tools
})

const configuredProviders = computed(() => {
  return settingsStore.availableProviders.filter(provider => {
    const config = props.settings.ai.providers[provider.id]
    return config?.enabled !== false && getProviderModelIds(provider.id).length > 0
  })
})

const selectedToolCallProvider = computed(() => {
  const configured = props.settings.tools.toolCallModel?.providerId
  if (configured && configuredProviders.value.some(provider => provider.id === configured)) {
    return configured
  }

  const defaultProvider = props.settings.ai.provider
  if (configuredProviders.value.some(provider => provider.id === defaultProvider)) {
    return defaultProvider
  }

  return configuredProviders.value[0]?.id || ''
})

const selectedToolCallModels = computed(() => {
  return getProviderModelIds(selectedToolCallProvider.value)
})

const selectedToolCallModel = computed(() => {
  const configured = props.settings.tools.toolCallModel?.model
  if (configured && selectedToolCallModels.value.includes(configured)) {
    return configured
  }

  const providerConfig = props.settings.ai.providers[selectedToolCallProvider.value]
  if (providerConfig?.model && selectedToolCallModels.value.includes(providerConfig.model)) {
    return providerConfig.model
  }

  return selectedToolCallModels.value[0] || ''
})

const toolCallModelHint = computed(() => {
  if (!selectedToolCallProvider.value) return 'Select models in Providers before choosing a tool call model.'
  if (selectedToolCallModels.value.length === 0) return 'This provider has no selected models.'
  return 'Used asynchronously for chat naming, memory background tasks, and Memory Dreaming.'
})

const toolCallThinkingEnabled = computed(() => {
  return props.settings.tools.toolCallModel?.thinking === true
})

const selectedToolCallThinkingEffort = computed<ThinkingEffort>(() => {
  const effort = props.settings.tools.toolCallModel?.thinkingEffort
  return normalizeThinkingEffort(effort) ?? 'medium'
})

// Check if bash tool is available
const hasBashTool = computed(() => {
  return props.tools.some(tool => tool.id === 'bash')
})

// Check if web search tool is available
const hasWebSearchTool = computed(() => {
  return props.tools.some(tool => tool.id === 'web_search')
})

function updateEnableToolCalls(enabled: boolean) {
  emit('update:settings', {
    ...props.settings,
    tools: { ...props.settings.tools, enableToolCalls: enabled }
  })
}

function updatePermissionMode(permissionMode: PermissionMode) {
  emit('update:settings', {
    ...props.settings,
    tools: { ...props.settings.tools, permissionMode }
  })
}

function getProviderModelIds(providerId: string): string[] {
  if (!providerId) return []
  const config = props.settings.ai.providers[providerId]
  if (!config) return []
  if (config.selectedModels?.length) return config.selectedModels
  return config.model ? [config.model] : []
}

function getModelName(modelId: string): string {
  return settingsStore.getModelDisplayName(modelId) || modelId
}

function normalizeThinkingEffort(value: unknown): ThinkingEffort | null {
  return thinkingEffortOptions.some(option => option.value === value)
    ? value as ThinkingEffort
    : null
}

function updateToolCallProvider(providerId: string) {
  const modelIds = getProviderModelIds(providerId)
  const providerConfig = props.settings.ai.providers[providerId]
  const model = providerConfig?.model && modelIds.includes(providerConfig.model)
    ? providerConfig.model
    : modelIds[0] || ''

  emit('update:settings', {
    ...props.settings,
    tools: {
      ...props.settings.tools,
      toolCallModel: {
        ...props.settings.tools.toolCallModel,
        providerId,
        model,
      },
    },
  })
}

function updateToolCallModel(model: string) {
  emit('update:settings', {
    ...props.settings,
    tools: {
      ...props.settings.tools,
      toolCallModel: {
        ...props.settings.tools.toolCallModel,
        providerId: selectedToolCallProvider.value,
        model,
      },
    },
  })
}

function updateToolCallThinking(thinking: boolean) {
  emit('update:settings', {
    ...props.settings,
    tools: {
      ...props.settings.tools,
      toolCallModel: {
        ...props.settings.tools.toolCallModel,
        providerId: selectedToolCallProvider.value,
        model: selectedToolCallModel.value,
        thinking,
        thinkingEffort: selectedToolCallThinkingEffort.value,
      },
    },
  })
}

function updateToolCallThinkingEffort(thinkingEffort: ThinkingEffort) {
  emit('update:settings', {
    ...props.settings,
    tools: {
      ...props.settings.tools,
      toolCallModel: {
        ...props.settings.tools.toolCallModel,
        providerId: selectedToolCallProvider.value,
        model: selectedToolCallModel.value,
        thinkingEffort,
      },
    },
  })
}

function getToolEnabled(toolId: string): boolean {
  const tool = props.tools.find(item => item.id === toolId)
  return props.settings.tools.tools[toolId]?.enabled ?? tool?.enabled ?? true
}

function setToolEnabled(toolId: string, enabled: boolean) {
  const tools = { ...props.settings.tools.tools }
  tools[toolId] = { ...tools[toolId], enabled }
  emit('update:settings', {
    ...props.settings,
    tools: { ...props.settings.tools, tools }
  })
}

function updateBraveApiKey(apiKey: string) {
  const webSearch: WebSearchSettings = {
    enabled: props.settings.tools.webSearch?.enabled ?? true,
    ...props.settings.tools.webSearch,
    braveApiKey: apiKey.trim() || undefined
  }
  emit('update:settings', {
    ...props.settings,
    tools: { ...props.settings.tools, webSearch }
  })
}
</script>

<style scoped>
.tab-content {
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.settings-section {
  margin-bottom: 28px;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.settings-card {
  background: rgba(128, 128, 128, 0.06);
  border-radius: 10px;
  overflow: hidden;
}

.card-row {
  padding: 12px 14px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.08);
}

.card-row:last-child {
  border-bottom: none;
}

.section-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--ui-text-muted-fg, var(--text-muted));
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 0 0 12px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  opacity: 0.8;
}

.form-group {
  margin-bottom: 16px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.form-hint {
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  margin-top: 4px;
}

/* Toggle */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.toggle {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.toggle.small {
  width: 36px;
  height: 20px;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--ui-surface-sidebar-bg, var(--panel-2));
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 24px;
  transition: 0.15s;
}

.toggle-slider::before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 2px;
  bottom: 2px;
  background-color: var(--ui-text-primary-fg, var(--text-primary));
  border-radius: 50%;
  transition: 0.15s;
}

.toggle.small .toggle-slider::before {
  height: 14px;
  width: 14px;
}

.toggle input:checked + .toggle-slider {
  background-color: var(--ui-accent-primary-fg, var(--accent));
  border-color: var(--ui-accent-primary-fg, var(--accent));
}

.toggle input:checked + .toggle-slider::before {
  transform: translateX(20px);
  background-color: white;
}

.toggle.small input:checked + .toggle-slider::before {
  transform: translateX(16px);
}

.toggle input:disabled + .toggle-slider {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Empty State */
.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

/* Tools List */
.tools-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tool-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.tool-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.tool-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.tool-category {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 12%, transparent);
  color: var(--ui-accent-primary-fg, var(--accent));
}

.tool-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.control-label {
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  min-width: 80px;
}

/* Form Input */
.form-input {
  width: 100%;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--ui-text-primary-fg, var(--text-primary));
  background-color: var(--ui-surface-panel-bg, var(--panel));
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  transition: all 0.15s ease;
}

.form-input:hover {
  border-color: var(--ui-accent-primary-fg, var(--accent));
  background-color: var(--ui-surface-sidebar-bg, var(--panel-2));
}

.form-input:focus {
  outline: none;
  border-color: var(--ui-accent-primary-fg, var(--accent));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 15%, transparent);
}

.form-input::placeholder {
  color: var(--ui-text-muted-fg, var(--text-muted));
  opacity: 0.6;
}

.mode-select {
  max-width: 220px;
}

.model-setting-select {
  min-width: 220px;
  max-width: min(360px, 100%);
}

/* Link */
.link {
  color: var(--ui-accent-primary-fg, var(--accent));
  text-decoration: none;
}

.link:hover {
  text-decoration: underline;
}

/* Responsive */
@media (max-width: 480px) {
  .tool-item {
    padding: 12px;
  }
}
</style>
