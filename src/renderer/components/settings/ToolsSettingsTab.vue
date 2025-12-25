<template>
  <div class="tab-content">
    <!-- Enable Tool Calls -->
    <section class="settings-section">
      <h3 class="section-title">Tool Settings</h3>

      <div class="form-group">
        <div class="toggle-row">
          <label class="form-label">Enable Tool Calls</label>
          <label class="toggle">
            <input
              type="checkbox"
              :checked="settings.tools.enableToolCalls"
              @change="updateEnableToolCalls(($event.target as HTMLInputElement).checked)"
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <p class="form-hint">Allow AI to use tools during conversations</p>
      </div>

      <!-- Tool Agent Configuration -->
      <div class="form-group tool-agent-config" v-if="settings.tools.enableToolCalls">
        <label class="form-label">Tool Agent Configuration</label>
        <p class="form-hint" style="margin-bottom: 12px;">
          Configure which provider and model the Tool Agent uses. Use a cheaper model for lower cost.
        </p>
        <div class="selector-row">
          <div class="selector-item">
            <label class="selector-label">Provider</label>
            <select
              class="form-select"
              :value="settings.tools.toolAgentSettings?.providerId || ''"
              @change="updateToolAgentProvider(($event.target as HTMLSelectElement).value)"
            >
              <option value="">Same as main</option>
              <option
                v-for="providerId in availableProviders"
                :key="providerId"
                :value="providerId"
              >
                {{ getProviderDisplayName(providerId) }}
              </option>
            </select>
          </div>
          <div class="selector-item">
            <label class="selector-label">Model</label>
            <select
              class="form-select"
              :value="settings.tools.toolAgentSettings?.model || ''"
              @change="updateToolAgentModel(($event.target as HTMLSelectElement).value)"
            >
              <option value="">{{ toolAgentModelPlaceholder }}</option>
              <option
                v-for="model in toolAgentAvailableModels"
                :key="model"
                :value="model"
              >
                {{ model }}
              </option>
            </select>
          </div>
        </div>
      </div>
    </section>

    <!-- Available Tools -->
    <section class="settings-section" v-if="settings.tools.enableToolCalls">
      <h3 class="section-title">Available Tools</h3>

      <div v-if="displayTools.length === 0" class="empty-state">
        <p>No tools available</p>
      </div>

      <div v-else class="tools-list">
        <div
          v-for="tool in displayTools"
          :key="tool.id"
          class="tool-item"
        >
          <div class="tool-info">
            <div class="tool-header">
              <span class="tool-name">{{ tool.name }}</span>
              <span :class="['tool-category', tool.category]">{{ tool.category }}</span>
            </div>
            <p class="tool-description">{{ tool.description }}</p>
          </div>
          <div class="tool-controls">
            <div class="toggle-row">
              <span class="control-label">Enabled</span>
              <label class="toggle small">
                <input
                  type="checkbox"
                  :checked="getToolEnabled(tool.id)"
                  @change="setToolEnabled(tool.id, ($event.target as HTMLInputElement).checked)"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div class="toggle-row">
              <span class="control-label">Auto Execute</span>
              <label class="toggle small">
                <input
                  type="checkbox"
                  :checked="getToolAutoExecute(tool.id)"
                  @change="setToolAutoExecute(tool.id, ($event.target as HTMLInputElement).checked)"
                  :disabled="!getToolEnabled(tool.id)"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Bash Tool Settings -->
    <BashSettingsPanel
      v-if="settings.tools.enableToolCalls && hasBashTool"
      :settings="settings"
      @update:settings="$emit('update:settings', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AppSettings, ToolDefinition } from '@/types'
import BashSettingsPanel from './BashSettingsPanel.vue'

const props = defineProps<{
  settings: AppSettings
  tools: ToolDefinition[]
}>()

const emit = defineEmits<{
  'update:settings': [settings: AppSettings]
}>()

// Filter out internal tools (like delegate) from display
const displayTools = computed(() => {
  return props.tools.filter(tool => tool.id !== 'delegate')
})

// Check if bash tool is available
const hasBashTool = computed(() => {
  return props.tools.some(tool => tool.id === 'bash')
})

// Available providers for Tool Agent
const availableProviders = computed(() => {
  return Object.keys(props.settings.ai.providers).filter(id => {
    const config = props.settings.ai.providers[id]
    return config && config.apiKey // Only show configured providers
  })
})

// Provider display names
const providerDisplayNames: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  zhipu: 'Zhipu AI',
  openrouter: 'OpenRouter',
  ollama: 'Ollama',
}

function getProviderDisplayName(providerId: string): string {
  return providerDisplayNames[providerId] || providerId
}

// Available models for Tool Agent based on selected provider
const toolAgentAvailableModels = computed(() => {
  const providerId = props.settings.tools.toolAgentSettings?.providerId || props.settings.ai.provider
  const config = props.settings.ai.providers[providerId]
  return config?.selectedModels || []
})

// Model placeholder based on selected provider
const toolAgentModelPlaceholder = computed(() => {
  const providerId = props.settings.tools.toolAgentSettings?.providerId
  if (providerId) {
    const config = props.settings.ai.providers[providerId]
    return config?.model ? `Default: ${config.model}` : 'Select model'
  }
  return 'Same as main conversation'
})

function updateEnableToolCalls(enabled: boolean) {
  emit('update:settings', {
    ...props.settings,
    tools: { ...props.settings.tools, enableToolCalls: enabled }
  })
}

function updateToolAgentProvider(providerId: string) {
  const toolAgentSettings = {
    ...props.settings.tools.toolAgentSettings,
    providerId: providerId || undefined
  }
  emit('update:settings', {
    ...props.settings,
    tools: { ...props.settings.tools, toolAgentSettings }
  })
}

function updateToolAgentModel(model: string) {
  const toolAgentSettings = {
    ...props.settings.tools.toolAgentSettings,
    model: model.trim() || undefined
  }
  emit('update:settings', {
    ...props.settings,
    tools: { ...props.settings.tools, toolAgentSettings }
  })
}

function getToolEnabled(toolId: string): boolean {
  return props.settings.tools.tools[toolId]?.enabled ?? true
}

function setToolEnabled(toolId: string, enabled: boolean) {
  const tools = { ...props.settings.tools.tools }
  tools[toolId] = { ...tools[toolId], enabled }
  emit('update:settings', {
    ...props.settings,
    tools: { ...props.settings.tools, tools }
  })
}

function getToolAutoExecute(toolId: string): boolean {
  return props.settings.tools.tools[toolId]?.autoExecute ?? false
}

function setToolAutoExecute(toolId: string, autoExecute: boolean) {
  const tools = { ...props.settings.tools.tools }
  tools[toolId] = { ...tools[toolId], autoExecute }
  emit('update:settings', {
    ...props.settings,
    tools: { ...props.settings.tools, tools }
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
  margin-bottom: 32px;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
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
  color: var(--text-primary);
}

.form-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
}

/* Tool Agent Config */
.tool-agent-config {
  background: var(--hover);
  border-radius: 10px;
  padding: 16px;
  border: 1px solid var(--border);
}

.selector-row {
  display: flex;
  gap: 12px;
}

.selector-item {
  flex: 1;
  min-width: 0;
}

.selector-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 6px;
}

.form-select {
  width: 100%;
  padding: 10px 32px 10px 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  background-color: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}

.form-select:hover {
  border-color: var(--accent);
  background-color: var(--panel-2);
}

.form-select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.form-select option {
  padding: 8px;
  background: var(--panel);
  color: var(--text-primary);
}

@media (max-width: 480px) {
  .selector-row {
    flex-direction: column;
    gap: 16px;
  }
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
  background-color: var(--panel-2);
  border: 1px solid var(--border);
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
  background-color: var(--text-primary);
  border-radius: 50%;
  transition: 0.15s;
}

.toggle.small .toggle-slider::before {
  height: 14px;
  width: 14px;
}

.toggle input:checked + .toggle-slider {
  background-color: var(--accent);
  border-color: var(--accent);
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
  color: var(--text-muted);
  background: var(--hover);
  border-radius: 8px;
}

/* Tools List */
.tools-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tool-item {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  background: var(--hover);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.tool-info {
  flex: 1;
  min-width: 0;
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.tool-name {
  font-weight: 500;
  color: var(--text-primary);
}

.tool-category {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(59, 130, 246, 0.15);
  color: var(--accent);
}

.tool-category.custom {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.tool-description {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
  line-height: 1.4;
}

.tool-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.tool-controls .toggle-row {
  gap: 8px;
}

.control-label {
  font-size: 12px;
  color: var(--text-muted);
  min-width: 80px;
}

/* Responsive */
@media (max-width: 480px) {
  .tool-item {
    padding: 12px;
    border-radius: 10px;
  }
}
</style>
