<template>
  <div class="settings-overlay">
    <div class="settings-modal">
      <div class="settings-header">
        <h3>Settings</h3>
        <button class="close-button" @click="$emit('close')">✕</button>
      </div>

      <div class="settings-content">
        <div class="setting-group">
          <label>AI Provider</label>
          <select
            v-model="localSettings.ai.provider"
            class="input-field"
          >
            <option value="openai">OpenAI (GPT)</option>
            <option value="claude">Claude (Anthropic)</option>
            <option value="custom">Custom API</option>
          </select>
        </div>

        <div class="setting-group">
          <label>API Key</label>
          <input
            v-model="localSettings.ai.providers[localSettings.ai.provider].apiKey"
            type="password"
            class="input-field"
            placeholder="Enter your API key"
          />
        </div>

        <div class="setting-group">
          <label>Model</label>
          <input
            v-model="localSettings.ai.providers[localSettings.ai.provider].model"
            type="text"
            class="input-field"
            placeholder="e.g., gpt-3.5-turbo"
          />
        </div>

        <div v-if="localSettings.ai.provider === 'custom'" class="setting-group">
          <label>Custom API URL</label>
          <input
            v-model="localSettings.ai.providers[localSettings.ai.provider].baseUrl"
            type="text"
            class="input-field"
            placeholder="https://api.example.com/chat"
          />
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
          />
          <p class="help-text">Controls randomness (0=deterministic, 2=very random)</p>
        </div>

        <div class="setting-group">
          <label>Theme</label>
          <select
            v-model="localSettings.theme"
            class="input-field"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </div>

      <div class="settings-footer">
        <button class="cancel-button" @click="$emit('close')">Cancel</button>
        <button class="save-button" @click="saveSettings">Save Settings</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
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
  z-index: 1000;
}

.settings-modal {
  background: var(--panel-2);
  border: 1px solid var(--border);
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
  border-bottom: 1px solid var(--border);
}

.settings-header h3 {
  margin: 0;
  font-size: 20px;
  color: var(--text);
}

.close-button {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--muted);
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-button:hover {
  color: var(--text);
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
  color: var(--text);
  font-size: 14px;
}

.input-field,
.slider {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  font-size: 14px;
  font-family: inherit;
  background: rgba(255, 255, 255, 0.04);
}

.input-field:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.35);
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12);
}

.slider {
  padding: 0;
  height: 6px;
  cursor: pointer;
}

.help-text {
  margin: 8px 0 0 0;
  font-size: 12px;
  color: var(--muted);
}

.settings-footer {
  display: flex;
  gap: 12px;
  padding: 20px;
  border-top: 1px solid var(--border);
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
  color: var(--text);
  border: 1px solid var(--border);
}

.cancel-button:hover {
  background: var(--hover);
}

.save-button {
  background: rgba(59, 130, 246, 0.22);
  color: var(--text);
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.save-button:hover {
  background: rgba(59, 130, 246, 0.3);
}
</style>
