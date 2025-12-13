<template>
  <div class="settings-panel">
    <header class="settings-header">
      <div class="header-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
        <h2>Settings</h2>
      </div>
      <button class="close-btn" @click="$emit('close')" title="Close settings">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </header>

    <div class="settings-content">
      <!-- Provider Section -->
      <section class="settings-section">
        <h3 class="section-title">AI Provider</h3>

        <div class="provider-cards">
          <div
            v-for="provider in providers"
            :key="provider.id"
            :class="['provider-card', { active: localSettings.ai.provider === provider.id }]"
            @click="selectProvider(provider.id)"
          >
            <div class="provider-icon">{{ provider.icon }}</div>
            <div class="provider-info">
              <div class="provider-name">{{ provider.name }}</div>
              <div class="provider-desc">{{ provider.description }}</div>
            </div>
            <div v-if="localSettings.ai.provider === provider.id" class="provider-check">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
          </div>
        </div>
      </section>

      <!-- API Configuration -->
      <section class="settings-section">
        <h3 class="section-title">API Configuration</h3>

        <div class="form-group">
          <label class="form-label">
            API Key
            <span class="label-hint">Required</span>
          </label>
          <div class="input-wrapper">
            <input
              v-model="localSettings.ai.apiKey"
              :type="showApiKey ? 'text' : 'password'"
              class="form-input"
              placeholder="Enter your API key..."
            />
            <button class="input-action" @click="showApiKey = !showApiKey" type="button">
              <svg v-if="showApiKey" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
              <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Base URL</label>
          <input
            v-model="localSettings.ai.customApiUrl"
            type="text"
            class="form-input"
            :placeholder="getDefaultBaseUrl()"
          />
          <p class="form-hint">Leave empty to use default endpoint</p>
        </div>
      </section>

      <!-- Model Selection -->
      <section class="settings-section">
        <h3 class="section-title">
          Model
          <button
            class="refresh-btn"
            @click="fetchModels"
            :disabled="isLoadingModels || !localSettings.ai.apiKey"
            title="Fetch available models"
          >
            <svg
              :class="{ spinning: isLoadingModels }"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M23 4v6h-6M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            {{ isLoadingModels ? 'Loading...' : 'Fetch Models' }}
          </button>
        </h3>

        <div v-if="modelError" class="error-message">
          {{ modelError }}
        </div>

        <div v-if="availableModels.length > 0" class="model-grid">
          <div
            v-for="model in availableModels"
            :key="model.id"
            :class="['model-card', { active: localSettings.ai.model === model.id }]"
            @click="selectModel(model.id)"
          >
            <div class="model-name">{{ model.name || model.id }}</div>
            <div v-if="model.description" class="model-desc">{{ model.description }}</div>
          </div>
        </div>

        <div v-else class="form-group">
          <input
            v-model="localSettings.ai.model"
            type="text"
            class="form-input"
            placeholder="e.g., gpt-4, claude-3-opus"
          />
          <p class="form-hint">Enter model name or fetch available models with your API key</p>
        </div>
      </section>

      <!-- Advanced Settings -->
      <section class="settings-section">
        <h3 class="section-title">Advanced</h3>

        <div class="form-group">
          <label class="form-label">
            Temperature
            <span class="label-value">{{ localSettings.ai.temperature.toFixed(1) }}</span>
          </label>
          <input
            v-model.number="localSettings.ai.temperature"
            type="range"
            min="0"
            max="2"
            step="0.1"
            class="form-slider"
          />
          <div class="slider-labels">
            <span>Precise</span>
            <span>Creative</span>
          </div>
        </div>
      </section>

      <!-- Appearance -->
      <section class="settings-section">
        <h3 class="section-title">Appearance</h3>

        <div class="theme-cards">
          <div
            :class="['theme-card', { active: localSettings.theme === 'light' }]"
            @click="localSettings.theme = 'light'"
          >
            <div class="theme-preview light">
              <div class="preview-sidebar"></div>
              <div class="preview-content">
                <div class="preview-line"></div>
                <div class="preview-line short"></div>
              </div>
            </div>
            <span>Light</span>
          </div>
          <div
            :class="['theme-card', { active: localSettings.theme === 'dark' }]"
            @click="localSettings.theme = 'dark'"
          >
            <div class="theme-preview dark">
              <div class="preview-sidebar"></div>
              <div class="preview-content">
                <div class="preview-line"></div>
                <div class="preview-line short"></div>
              </div>
            </div>
            <span>Dark</span>
          </div>
        </div>
      </section>
    </div>

    <footer class="settings-footer">
      <button class="btn secondary" @click="$emit('close')">Cancel</button>
      <button class="btn primary" @click="saveSettings" :disabled="isSaving">
        <span v-if="isSaving">Saving...</span>
        <span v-else>Save Changes</span>
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, toRaw, onMounted } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import type { AppSettings, AIProvider } from '@/types'

interface ProviderOption {
  id: AIProvider
  name: string
  icon: string
  description: string
}

interface ModelInfo {
  id: string
  name?: string
  description?: string
}

const emit = defineEmits<{
  close: []
}>()

const settingsStore = useSettingsStore()

const localSettings = ref<AppSettings>(
  JSON.parse(JSON.stringify(toRaw(settingsStore.settings))) as AppSettings
)

const showApiKey = ref(false)
const isSaving = ref(false)
const isLoadingModels = ref(false)
const modelError = ref('')
const availableModels = ref<ModelInfo[]>([])

const providers: ProviderOption[] = [
  {
    id: 'openai' as AIProvider,
    name: 'OpenAI',
    icon: '🤖',
    description: 'GPT-4, GPT-3.5 Turbo',
  },
  {
    id: 'claude' as AIProvider,
    name: 'Anthropic',
    icon: '🧠',
    description: 'Claude 3 Opus, Sonnet, Haiku',
  },
  {
    id: 'custom' as AIProvider,
    name: 'Custom',
    icon: '⚙️',
    description: 'OpenAI-compatible API',
  },
]

function getDefaultBaseUrl(): string {
  switch (localSettings.value.ai.provider) {
    case 'openai':
      return 'https://api.openai.com/v1'
    case 'claude':
      return 'https://api.anthropic.com/v1'
    default:
      return 'https://api.example.com/v1'
  }
}

function selectProvider(provider: AIProvider) {
  localSettings.value.ai.provider = provider
  availableModels.value = []
  modelError.value = ''

  // Set default model for provider
  switch (provider) {
    case 'openai':
      localSettings.value.ai.model = 'gpt-4'
      break
    case 'claude':
      localSettings.value.ai.model = 'claude-3-opus-20240229'
      break
    default:
      localSettings.value.ai.model = ''
  }
}

function selectModel(modelId: string) {
  localSettings.value.ai.model = modelId
}

async function fetchModels() {
  if (!localSettings.value.ai.apiKey) {
    modelError.value = 'Please enter an API key first'
    return
  }

  isLoadingModels.value = true
  modelError.value = ''
  availableModels.value = []

  try {
    const provider = localSettings.value.ai.provider
    const apiKey = localSettings.value.ai.apiKey
    const baseUrl = localSettings.value.ai.customApiUrl || getDefaultBaseUrl()

    let models: ModelInfo[] = []

    if (provider === 'openai' || provider === 'custom') {
      const response = await fetch(`${baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      models = (data.data || [])
        .filter((m: any) => m.id.includes('gpt') || m.id.includes('text') || provider === 'custom')
        .map((m: any) => ({
          id: m.id,
          name: m.id,
        }))
        .sort((a: ModelInfo, b: ModelInfo) => a.id.localeCompare(b.id))
    } else if (provider === 'claude') {
      // Anthropic doesn't have a models endpoint, use predefined list
      models = [
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: 'Most capable' },
        { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', description: 'Balanced' },
        { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: 'Fast & efficient' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Latest' },
      ]
    }

    availableModels.value = models

    if (models.length === 0) {
      modelError.value = 'No models found'
    }
  } catch (err: any) {
    modelError.value = err.message || 'Failed to fetch models'
  } finally {
    isLoadingModels.value = false
  }
}

async function saveSettings() {
  isSaving.value = true
  try {
    await settingsStore.saveSettings(localSettings.value)
    emit('close')
  } catch (err) {
    console.error('Failed to save settings:', err)
  } finally {
    isSaving.value = false
  }
}

onMounted(() => {
  // Pre-populate models for Claude since it doesn't have an API
  if (localSettings.value.ai.provider === 'claude') {
    availableModels.value = [
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: 'Most capable' },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', description: 'Balanced' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: 'Fast & efficient' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Latest' },
    ]
  }
})
</script>

<style scoped>
.settings-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.08);
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
  font-size: 18px;
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

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.settings-section {
  margin-bottom: 32px;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 16px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* Provider Cards */
.provider-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.provider-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  background: var(--panel-2);
}

.provider-card:hover {
  border-color: rgba(255, 255, 255, 0.15);
  background: var(--hover);
}

.provider-card.active {
  border-color: var(--accent);
  background: rgba(16, 163, 127, 0.1);
}

.provider-icon {
  font-size: 24px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
}

.provider-info {
  flex: 1;
}

.provider-name {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 2px;
}

.provider-desc {
  font-size: 12px;
  color: var(--muted);
}

.provider-check {
  color: var(--accent);
}

/* Form Elements */
.form-group {
  margin-bottom: 16px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 8px;
}

.label-hint {
  font-size: 11px;
  color: var(--muted);
  font-weight: 400;
}

.label-value {
  margin-left: auto;
  color: var(--accent);
  font-weight: 600;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.form-input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 14px;
  font-family: inherit;
  background: var(--panel-2);
  color: var(--text);
  transition: all 0.15s ease;
}

.input-wrapper .form-input {
  padding-right: 44px;
}

.form-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(16, 163, 127, 0.1);
}

.form-input::placeholder {
  color: var(--muted);
}

.input-action {
  position: absolute;
  right: 8px;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.input-action:hover {
  background: var(--hover);
  color: var(--text);
}

.form-hint {
  margin: 8px 0 0 0;
  font-size: 12px;
  color: var(--muted);
}

.form-slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--border);
  cursor: pointer;
  -webkit-appearance: none;
}

.form-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
  border: 2px solid var(--bg);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 11px;
  color: var(--muted);
}

/* Refresh Button */
.refresh-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.refresh-btn:hover:not(:disabled) {
  background: var(--hover);
  border-color: rgba(255, 255, 255, 0.15);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.refresh-btn svg.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Model Grid */
.model-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
}

.model-card {
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  background: var(--panel-2);
}

.model-card:hover {
  border-color: rgba(255, 255, 255, 0.15);
  background: var(--hover);
}

.model-card.active {
  border-color: var(--accent);
  background: rgba(16, 163, 127, 0.1);
}

.model-name {
  font-size: 13px;
  font-weight: 500;
}

.model-desc {
  font-size: 11px;
  color: var(--muted);
  margin-top: 2px;
}

.error-message {
  padding: 10px 14px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  color: #ef4444;
  font-size: 13px;
  margin-bottom: 12px;
}

/* Theme Cards */
.theme-cards {
  display: flex;
  gap: 12px;
}

.theme-card {
  flex: 1;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: center;
}

.theme-card:hover {
  border-color: rgba(255, 255, 255, 0.15);
}

.theme-card.active {
  border-color: var(--accent);
  background: rgba(16, 163, 127, 0.1);
}

.theme-card span {
  font-size: 13px;
  font-weight: 500;
}

.theme-preview {
  height: 60px;
  border-radius: 8px;
  margin-bottom: 10px;
  display: flex;
  overflow: hidden;
  border: 1px solid var(--border);
}

.theme-preview.light {
  background: #ffffff;
}

.theme-preview.dark {
  background: #0f1117;
}

.preview-sidebar {
  width: 30%;
  background: rgba(128, 128, 128, 0.15);
}

.preview-content {
  flex: 1;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  justify-content: center;
}

.preview-line {
  height: 6px;
  border-radius: 3px;
  background: rgba(128, 128, 128, 0.2);
}

.preview-line.short {
  width: 60%;
}

/* Footer */
.settings-footer {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.05);
}

.btn {
  flex: 1;
  padding: 12px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn.secondary {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text);
}

.btn.secondary:hover {
  background: var(--hover);
}

.btn.primary {
  background: var(--accent);
  border: none;
  color: white;
}

.btn.primary:hover:not(:disabled) {
  background: #0d8a6a;
}

.btn.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
