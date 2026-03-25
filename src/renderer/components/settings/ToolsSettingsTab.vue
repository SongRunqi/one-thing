<template>
  <div class="tab-content">
    <!-- Enable Tool Calls -->
    <section class="settings-section">
      <h3 class="section-title">
        Tool Settings
      </h3>

      <div class="settings-card">
        <div class="card-row">
          <div class="toggle-row">
            <div>
              <label class="form-label">Enable Tool Calls</label>
              <p class="form-hint">
                Allow AI to use tools during conversations
              </p>
            </div>
            <label class="toggle">
              <input
                type="checkbox"
                :checked="settings.tools.enableToolCalls"
                @change="updateEnableToolCalls(($event.target as HTMLInputElement).checked)"
              >
              <span class="toggle-slider" />
            </label>
          </div>
        </div>
      </div>
    </section>

    <!-- Available Tools -->
    <section
      v-if="settings.tools.enableToolCalls"
      class="settings-section"
    >
      <h3 class="section-title">
        Available Tools
      </h3>

      <div
        v-if="displayTools.length === 0"
        class="empty-state"
      >
        <p>No tools available</p>
      </div>

      <div
        v-else
        class="settings-card tools-list"
      >
        <div
          v-for="tool in displayTools"
          :key="tool.id"
          class="card-row tool-item"
        >
          <div class="tool-info">
            <span class="tool-name">{{ tool.name }}</span>
            <span :class="['tool-category', tool.category]">{{ tool.category }}</span>
          </div>
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
        </div>
      </div>
    </section>

    <!-- Web Search Settings -->
    <section
      v-if="settings.tools.enableToolCalls && hasWebSearchTool"
      class="settings-section"
    >
      <h3 class="section-title">
        Web Search
      </h3>
      
      <div class="form-group">
        <label class="form-label">Brave Search API Key</label>
        <input
          type="password"
          class="form-input"
          :value="settings.tools.webSearch?.braveApiKey || ''"
          placeholder="Enter your Brave Search API key"
          @input="updateBraveApiKey(($event.target as HTMLInputElement).value)"
        >
        <p class="form-hint">
          Get your free API key at 
          <a
            href="https://brave.com/search/api/"
            target="_blank"
            class="link"
          >brave.com/search/api</a>
          (2,000 queries/month free)
        </p>
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
import type { WebSearchSettings } from '@shared/ipc/tools'
import BashSettingsPanel from './BashSettingsPanel.vue'

const props = defineProps<{
  settings: AppSettings
  tools: ToolDefinition[]
}>()

const emit = defineEmits<{
  'update:settings': [settings: AppSettings]
}>()

const displayTools = computed(() => {
  return props.tools
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
  color: var(--text-primary);
}

.tool-category {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(59, 130, 246, 0.12);
  color: var(--accent);
}

.tool-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.control-label {
  font-size: 12px;
  color: var(--text-muted);
  min-width: 80px;
}

/* Form Input */
.form-input {
  width: 100%;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  background-color: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  transition: all 0.15s ease;
}

.form-input:hover {
  border-color: var(--accent);
  background-color: var(--panel-2);
}

.form-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.form-input::placeholder {
  color: var(--text-muted);
  opacity: 0.6;
}

/* Link */
.link {
  color: var(--accent);
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
