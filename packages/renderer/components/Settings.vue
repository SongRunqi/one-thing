<template>
  <div class="settings-overlay">
    <div class="settings-modal">
      <div class="settings-header">
        <h3>Settings</h3>
        <Button
          unstyled
          class="close-button"
          @click="$emit('close')"
        >
          ✕
        </Button>
      </div>

      <div class="settings-content">
        <div class="setting-group">
          <label>AI Provider</label>
          <select
            v-model="localSettings.ai.provider"
            class="input-field"
          >
            <option value="openai">
              OpenAI (GPT)
            </option>
            <option value="claude">
              Claude (Anthropic)
            </option>
            <option value="custom">
              Custom API
            </option>
          </select>
        </div>

        <div class="setting-group">
          <label>API Key</label>
          <input
            v-model="localSettings.ai.providers[localSettings.ai.provider].apiKey"
            type="password"
            class="input-field"
            placeholder="Enter your API key"
          >
        </div>

        <div class="setting-group">
          <label>Model</label>
          <input
            v-model="localSettings.ai.providers[localSettings.ai.provider].model"
            type="text"
            class="input-field"
            placeholder="e.g., gpt-3.5-turbo"
          >
        </div>

        <div
          v-if="localSettings.ai.provider === 'custom'"
          class="setting-group"
        >
          <label>Custom API URL</label>
          <input
            v-model="localSettings.ai.providers[localSettings.ai.provider].baseUrl"
            type="text"
            class="input-field"
            placeholder="https://api.example.com/chat"
          >
        </div>

        <div class="setting-group">
          <label>Temperature: {{ localSettings.ai.temperature.toFixed(1) }}</label>
          <input
            v-model.number="localSettings.ai.temperature"
            type="range"
            min="0"
            max="2"
            step="0.1"
            class="slider"
          >
          <p class="help-text">
            Controls randomness (0=deterministic, 2=very random)
          </p>
        </div>

        <div class="setting-group">
          <label>Theme</label>
          <select
            v-model="localSettings.theme"
            class="input-field"
          >
            <option value="light">
              Light
            </option>
            <option value="dark">
              Dark
            </option>
          </select>
        </div>
      </div>

      <div class="settings-footer">
        <Button
          unstyled
          class="cancel-button"
          @click="$emit('close')"
        >
          Cancel
        </Button>
        <Button
          unstyled
          class="save-button"
          @click="saveSettings"
        >
          Save Settings
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { ref, toRaw } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import type { AppSettings } from '@/types'

const settingsStore = useSettingsStore()
const localSettings = ref<AppSettings>(
  JSON.parse(JSON.stringify(toRaw(settingsStore.settings))) as AppSettings
)

async function saveSettings() {
  await settingsStore.saveSettings(localSettings.value)
  alert('Settings saved successfully!')
}
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
}

.settings-modal {
  background: var(--ui-surface-sidebar-bg, var(--panel-2));
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 16px;
  box-shadow: var(--shadow);
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid var(--ui-border-default-border, var(--border));
}

.settings-header h3 {
  margin: 0;
  font-size: 20px;
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.close-button {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--ui-text-muted-fg, var(--text-muted));
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-button:hover {
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.setting-group {
  margin-bottom: 20px;
}

.setting-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--ui-text-primary-fg, var(--text-primary));
  font-size: 14px;
}

.input-field,
.slider {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 12px;
  font-size: 14px;
  font-family: inherit;
  background: rgba(255, 255, 255, 0.04);
}

.input-field:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 35%, transparent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 12%, transparent);
}

.slider {
  padding: 0;
  height: 6px;
  cursor: pointer;
}

.help-text {
  margin: 8px 0 0 0;
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.settings-footer {
  display: flex;
  gap: 12px;
  padding: 20px;
  border-top: 1px solid var(--ui-border-default-border, var(--border));
  background: rgba(255, 255, 255, 0.03);
}

.cancel-button,
.save-button {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  font-size: 14px;
  transition: all 0.2s;
}

.cancel-button {
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text-primary));
  border: 1px solid var(--ui-border-default-border, var(--border));
}

.cancel-button:hover {
  background: var(--ui-state-hover-bg, var(--hover));
}

.save-button {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 22%, transparent);
  color: var(--ui-text-primary-fg, var(--text-primary));
  border: 1px solid color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 30%, transparent);
}

.save-button:hover {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 30%, transparent);
}
</style>
