<template>
  <div class="tab-content">
    <!-- Provider Selection -->
    <section class="settings-section">
      <h3 class="section-title">Embedding Provider</h3>
      <p class="section-description">
        Select the embedding provider for memory semantic search. OpenAI provides higher quality embeddings but requires an API key.
      </p>

      <div class="provider-cards">
        <div
          :class="['provider-card', { active: localSettings.provider === 'openai' }]"
          @click="updateProvider('openai')"
        >
          <div class="provider-icon openai">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.5963 3.8558L13.1038 8.364l2.0201-1.1685a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.4018-.6814zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997z"/>
            </svg>
          </div>
          <div class="provider-info">
            <span class="provider-name">OpenAI</span>
            <span class="provider-desc">Higher quality, requires API key</span>
          </div>
          <div class="provider-check" v-if="localSettings.provider === 'openai'">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
        </div>

        <div
          :class="['provider-card', { active: localSettings.provider === 'local' }]"
          @click="updateProvider('local')"
        >
          <div class="provider-icon local">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          </div>
          <div class="provider-info">
            <span class="provider-name">Local</span>
            <span class="provider-desc">Runs offline, no API key needed</span>
          </div>
          <div class="provider-check" v-if="localSettings.provider === 'local'">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
        </div>
      </div>
    </section>

    <!-- OpenAI Settings -->
    <section class="settings-section" v-if="localSettings.provider === 'openai'">
      <h3 class="section-title">OpenAI Embedding Settings</h3>

      <!-- Info: Uses OpenAI Provider settings -->
      <div class="info-box info-success">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <span>Automatically uses your OpenAI Provider API Key and Base URL from AI settings</span>
      </div>

      <div class="form-group">
        <label class="form-label">Model</label>
        <select
          class="form-select"
          :value="localSettings.openai?.model || 'text-embedding-3-small'"
          @change="updateOpenAIModel(($event.target as HTMLSelectElement).value)"
        >
          <option value="text-embedding-3-small">text-embedding-3-small (Recommended)</option>
          <option value="text-embedding-3-large">text-embedding-3-large (Higher quality)</option>
          <option value="text-embedding-ada-002">text-embedding-ada-002 (Legacy)</option>
        </select>
        <p class="form-hint">text-embedding-3-small offers a good balance of quality and cost</p>
      </div>

      <div class="form-group">
        <label class="form-label">Dimensions</label>
        <select
          class="form-select"
          :value="localSettings.openai?.dimensions || 384"
          @change="updateOpenAIDimensions(Number(($event.target as HTMLSelectElement).value))"
        >
          <option :value="256">256 (Smallest, fastest)</option>
          <option :value="384">384 (Balanced, recommended)</option>
          <option :value="512">512 (Better quality)</option>
          <option :value="1024">1024 (High quality)</option>
          <option :value="1536">1536 (Maximum quality)</option>
        </select>
        <p class="form-hint">Lower dimensions = faster & cheaper. 384 is recommended for most use cases.</p>
      </div>

      <!-- Advanced Settings (collapsible) -->
      <div class="advanced-toggle" @click="showAdvanced = !showAdvanced">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          :class="{ rotated: showAdvanced }"
        >
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <span>Advanced Settings</span>
      </div>

      <div v-if="showAdvanced" class="advanced-settings">
        <div class="form-group">
          <label class="form-label">
            Custom API Key
            <span class="label-hint">(Override)</span>
          </label>
          <input
            type="password"
            class="form-input"
            :value="localSettings.openai?.apiKey || ''"
            @input="updateOpenAIApiKey(($event.target as HTMLInputElement).value)"
            placeholder="Leave empty to use OpenAI provider key"
          />
          <p class="form-hint">Only set this if you want to use a different API key for embeddings</p>
        </div>

        <div class="form-group">
          <label class="form-label">
            Custom Base URL
            <span class="label-hint">(Override)</span>
          </label>
          <input
            type="text"
            class="form-input"
            :value="localSettings.openai?.baseUrl || ''"
            @input="updateOpenAIBaseUrl(($event.target as HTMLInputElement).value)"
            placeholder="Leave empty to use OpenAI provider base URL"
          />
          <p class="form-hint">Only set this if you want to use a different endpoint for embeddings</p>
        </div>
      </div>
    </section>

    <!-- Local Settings -->
    <section class="settings-section" v-if="localSettings.provider === 'local'">
      <h3 class="section-title">Local Embedding Settings</h3>

      <div class="form-group">
        <label class="form-label">Model</label>
        <select
          class="form-select"
          :value="localSettings.local?.model || 'all-MiniLM-L6-v2'"
          @change="updateLocalModel(($event.target as HTMLSelectElement).value)"
        >
          <option value="all-MiniLM-L6-v2">all-MiniLM-L6-v2 (384 dims, fastest)</option>
        </select>
        <p class="form-hint">Local model runs entirely on your device without sending data to any server</p>
      </div>

      <div class="info-box">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16v-4"/>
          <path d="M12 8h.01"/>
        </svg>
        <span>The local model will be downloaded automatically on first use (~23MB)</span>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { EmbeddingSettings } from '@/types'

const props = defineProps<{
  settings: EmbeddingSettings
}>()

const emit = defineEmits<{
  'update:settings': [settings: EmbeddingSettings]
}>()

// Local copy of settings
const localSettings = ref<EmbeddingSettings>({ ...props.settings })

// UI state
const showAdvanced = ref(false)

// Watch for external changes
watch(() => props.settings, (newSettings) => {
  localSettings.value = { ...newSettings }
}, { deep: true })

function emitUpdate() {
  emit('update:settings', { ...localSettings.value })
}

function updateProvider(provider: 'openai' | 'local') {
  localSettings.value.provider = provider
  emitUpdate()
}

function updateOpenAIModel(model: string) {
  if (!localSettings.value.openai) {
    localSettings.value.openai = { model: 'text-embedding-3-small' }
  }
  localSettings.value.openai.model = model
  emitUpdate()
}

function updateOpenAIDimensions(dimensions: number) {
  if (!localSettings.value.openai) {
    localSettings.value.openai = { model: 'text-embedding-3-small' }
  }
  localSettings.value.openai.dimensions = dimensions
  emitUpdate()
}

function updateOpenAIApiKey(apiKey: string) {
  if (!localSettings.value.openai) {
    localSettings.value.openai = { model: 'text-embedding-3-small' }
  }
  localSettings.value.openai.apiKey = apiKey || undefined
  emitUpdate()
}

function updateOpenAIBaseUrl(baseUrl: string) {
  if (!localSettings.value.openai) {
    localSettings.value.openai = { model: 'text-embedding-3-small' }
  }
  localSettings.value.openai.baseUrl = baseUrl || undefined
  emitUpdate()
}

function updateLocalModel(model: string) {
  if (!localSettings.value.local) {
    localSettings.value.local = { model: 'all-MiniLM-L6-v2' }
  }
  localSettings.value.local.model = model
  emitUpdate()
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

.section-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 0 0 8px 0;
  opacity: 0.8;
}

.section-description {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0 0 16px 0;
  line-height: 1.5;
}

/* Provider Cards */
.provider-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.provider-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  background: transparent;
}

.provider-card:hover {
  border-color: rgba(var(--accent-rgb), 0.4);
  background: var(--hover);
}

.provider-card.active {
  border-color: var(--accent);
  background: rgba(var(--accent-rgb), 0.08);
}

.provider-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.provider-icon.openai {
  background: linear-gradient(135deg, #10a37f 0%, #0d8c6d 100%);
  color: white;
}

.provider-icon.local {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: white;
}

.provider-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.provider-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.provider-desc {
  font-size: 12px;
  color: var(--text-muted);
}

.provider-check {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
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
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.label-hint {
  font-weight: 400;
  color: var(--text-muted);
  font-size: 12px;
}

.form-input,
.form-select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text-primary);
  font-size: 13px;
  transition: all 0.15s ease;
}

.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.1);
}

.form-input::placeholder {
  color: var(--text-muted);
  opacity: 0.7;
}

.form-select {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e");
  background-position: right 8px center;
  background-repeat: no-repeat;
  background-size: 20px;
  padding-right: 36px;
}

.form-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin: 6px 0 0 0;
  line-height: 1.4;
}

/* Info Box */
.info-box {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  background: rgba(var(--accent-rgb), 0.08);
  border: 1px solid rgba(var(--accent-rgb), 0.2);
  border-radius: 10px;
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.5;
  margin-bottom: 16px;
}

.info-box svg {
  flex-shrink: 0;
  color: var(--accent);
  margin-top: 1px;
}

.info-box.info-success {
  background: rgba(16, 185, 129, 0.08);
  border-color: rgba(16, 185, 129, 0.2);
}

.info-box.info-success svg {
  color: #10b981;
}

/* Advanced Toggle */
.advanced-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  transition: color 0.15s ease;
  user-select: none;
}

.advanced-toggle:hover {
  color: var(--text-primary);
}

.advanced-toggle svg {
  transition: transform 0.2s ease;
}

.advanced-toggle svg.rotated {
  transform: rotate(90deg);
}

.advanced-settings {
  padding-left: 22px;
  border-left: 2px solid var(--border);
  margin-top: 8px;
  animation: slideDown 0.15s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Responsive */
@media (max-width: 480px) {
  .provider-card {
    padding: 12px 14px;
    gap: 12px;
  }

  .provider-icon {
    width: 40px;
    height: 40px;
  }

  .provider-name {
    font-size: 13px;
  }

  .provider-desc {
    font-size: 11px;
  }
}
</style>
