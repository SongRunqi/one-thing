<template>
  <div class="settings-section">
    <div class="settings-group">
      <h3 class="group-title">Execution Limits</h3>

      <div class="setting-row">
        <div class="setting-info">
          <label class="setting-label">Max Tool Calls</label>
          <span class="setting-hint">Maximum number of tool calls per execution</span>
        </div>
        <input
          :value="maxToolCalls"
          @input="$emit('update:maxToolCalls', parseInt(($event.target as HTMLInputElement).value) || 20)"
          type="number"
          min="1"
          max="100"
          class="setting-input"
        />
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <label class="setting-label">Timeout</label>
          <span class="setting-hint">Maximum execution time ({{ formatTime(timeoutMs) }})</span>
        </div>
        <input
          :value="timeoutMs"
          @input="$emit('update:timeoutMs', parseInt(($event.target as HTMLInputElement).value) || 120000)"
          type="number"
          min="1000"
          max="600000"
          step="1000"
          class="setting-input"
        />
      </div>
    </div>

    <div class="settings-group">
      <h3 class="group-title">Built-in Tools</h3>

      <div class="builtin-toggle">
        <div class="toggle-info">
          <Blocks :size="18" :stroke-width="2" />
          <div class="toggle-text">
            <span class="toggle-title">Allow Built-in Tools</span>
            <span class="toggle-desc">Enable access to standard tools like file operations and web search</span>
          </div>
        </div>
        <div
          class="toggle-switch"
          :class="{ active: allowBuiltinTools }"
          @click="$emit('update:allowBuiltinTools', !allowBuiltinTools)"
        />
      </div>

      <!-- Built-in Tools Selector -->
      <div v-if="allowBuiltinTools" class="tools-selector">
        <p class="selector-hint">Select which built-in tools this agent can use:</p>
        <div class="tools-toggle-list">
          <div
            v-for="tool in availableBuiltinTools"
            :key="tool.id"
            class="tool-toggle-item"
            :class="{ enabled: allowedBuiltinTools.includes(tool.id) }"
            @click="toggleBuiltinTool(tool.id)"
          >
            <div class="tool-toggle-info">
              <span class="tool-toggle-name">{{ tool.name }}</span>
              <span class="tool-toggle-desc">{{ tool.description }}</span>
            </div>
            <div class="mini-toggle" :class="{ active: allowedBuiltinTools.includes(tool.id) }" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Blocks } from 'lucide-vue-next'

interface Props {
  maxToolCalls: number
  timeoutMs: number
  allowBuiltinTools: boolean
  allowedBuiltinTools: string[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:maxToolCalls': [value: number]
  'update:timeoutMs': [value: number]
  'update:allowBuiltinTools': [value: boolean]
  'update:allowedBuiltinTools': [value: string[]]
}>()

// Available built-in tools (loaded from backend)
const availableBuiltinTools = ref<Array<{ id: string; name: string; description: string }>>([])

// Load available built-in tools on mount
onMounted(async () => {
  try {
    availableBuiltinTools.value = await window.electronAPI.getAvailableBuiltinTools()
  } catch (error) {
    console.error('[SettingsSection] Failed to load builtin tools:', error)
  }
})

// Toggle a builtin tool in the allowedBuiltinTools list
function toggleBuiltinTool(toolId: string) {
  const newList = [...props.allowedBuiltinTools]
  const index = newList.indexOf(toolId)

  if (index === -1) {
    newList.push(toolId)
  } else {
    newList.splice(index, 1)
  }

  emit('update:allowedBuiltinTools', newList)
}

// Format time for display
function formatTime(ms: number): string {
  if (ms < 60000) {
    return `${Math.round(ms / 1000)}s`
  }
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.round((ms % 60000) / 1000)
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}
</script>

<style scoped>
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.settings-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.group-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  background: var(--hover);
  border-radius: 10px;
  border: 1px solid var(--border);
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.setting-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.setting-hint {
  font-size: 12px;
  color: var(--muted);
}

.setting-input {
  width: 100px;
  padding: 8px 12px;
  font-size: 14px;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  text-align: right;
}

.setting-input:focus {
  outline: none;
  border-color: var(--accent);
}

/* Built-in Toggle */
.builtin-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px;
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: 10px;
}

.toggle-info {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--muted);
}

.toggle-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.toggle-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.toggle-desc {
  font-size: 12px;
  color: var(--muted);
}

/* Toggle Switch */
.toggle-switch {
  width: 44px;
  height: 24px;
  background: var(--border);
  border-radius: 12px;
  position: relative;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.toggle-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 10px;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.toggle-switch.active {
  background: var(--accent);
}

.toggle-switch.active::after {
  transform: translateX(20px);
}

/* Tools Selector */
.tools-selector {
  padding: 16px;
  background: var(--hover);
  border-radius: 10px;
  border: 1px solid var(--border);
}

.selector-hint {
  font-size: 12px;
  color: var(--muted);
  margin: 0 0 12px;
}

.tools-toggle-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tool-toggle-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tool-toggle-item:hover {
  border-color: var(--muted);
}

.tool-toggle-item.enabled {
  background: rgba(var(--accent-rgb), 0.05);
  border-color: rgba(var(--accent-rgb), 0.3);
}

.tool-toggle-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.tool-toggle-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.tool-toggle-desc {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Mini Toggle */
.mini-toggle {
  width: 36px;
  height: 20px;
  background: var(--border);
  border-radius: 10px;
  position: relative;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.mini-toggle::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 8px;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.mini-toggle.active {
  background: var(--accent);
}

.mini-toggle.active::after {
  transform: translateX(16px);
}
</style>
