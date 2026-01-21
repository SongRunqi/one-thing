<template>
  <div class="provider-tab-wrapper">
    <!-- Global Default Selector -->
    <GlobalDefaultSelector
      :enabled-providers="providerSettings.enabledProviders.value"
      :current-provider="settings.ai.provider"
      :current-model="providerSettings.defaultProviderModel.value"
      :selected-models="providerSettings.defaultProviderSelectedModels.value"
      :get-model-name="providerSettings.getModelName"
      @update:provider="providerSettings.setDefaultProvider"
      @update:model="providerSettings.setDefaultModel"
    />

    <!-- Main Content -->
    <div class="provider-tab">
      <!-- Left: Provider List -->
      <ProviderList
        :providers="providers"
        :viewing-provider="providerSettings.viewingProvider.value"
        :is-provider-enabled="providerSettings.isProviderEnabled"
        :is-user-custom-provider="providerSettings.isUserCustomProvider"
        @switch="providerSettings.switchViewingProvider"
        @edit="(id) => $emit('edit-custom-provider', id)"
        @add="$emit('add-custom-provider')"
      />

      <!-- Right: Provider Detail -->
      <main class="provider-detail">
        <!-- Header -->
        <div class="detail-header">
          <h2 class="detail-title">
            {{ providerSettings.currentProviderName.value }}
          </h2>
          <div class="header-actions">
            <label
              class="enable-toggle"
              :title="providerSettings.isProviderEnabled(providerSettings.viewingProvider.value) ? 'Enabled in chat' : 'Disabled in chat'"
            >
              <input
                type="checkbox"
                :checked="providerSettings.isProviderEnabled(providerSettings.viewingProvider.value)"
                @change="providerSettings.toggleProviderEnabled(providerSettings.viewingProvider.value)"
              >
              <span class="toggle-switch" />
              <span class="toggle-text">{{ providerSettings.isProviderEnabled(providerSettings.viewingProvider.value) ? 'Enabled' : 'Disabled' }}</span>
            </label>
          </div>
        </div>

        <!-- API Configuration -->
        <section class="detail-section">
          <h3 class="section-title">
            API Configuration
          </h3>

          <!-- OAuth Provider Login -->
          <ProviderOAuth
            v-if="providerSettings.isOAuthProvider.value"
            :provider-id="providerSettings.viewingProvider.value"
            :provider-name="providerSettings.currentProviderName.value"
            :oauth-status="providerSettings.oauthStatus.value"
            :is-loading="providerSettings.isOAuthLoading.value"
            :device-flow-info="providerSettings.deviceFlowInfo.value"
            :code-entry-info="providerSettings.codeEntryInfo.value"
            :manual-code="providerSettings.manualCode.value"
            :is-submitting-code="providerSettings.isSubmittingCode.value"
            :code-entry-error="providerSettings.codeEntryError.value"
            @start-login="providerSettings.startOAuthLogin"
            @logout="providerSettings.logoutOAuth"
            @update:manual-code="providerSettings.manualCode.value = $event"
            @submit-code="providerSettings.submitManualCode"
          />

          <!-- Traditional API Key Input -->
          <template v-else>
            <div class="form-group">
              <label class="form-label">API Key</label>
              <div class="input-wrapper">
                <input
                  :value="settings.ai.providers[providerSettings.viewingProvider.value]?.apiKey"
                  :type="showApiKey ? 'text' : 'password'"
                  class="form-input"
                  :placeholder="`Enter your ${providerSettings.currentProviderName.value} API key...`"
                  @input="providerSettings.updateProviderApiKey(($event.target as HTMLInputElement).value)"
                >
                <button
                  class="input-action"
                  type="button"
                  @click="showApiKey = !showApiKey"
                >
                  <svg
                    v-if="showApiKey"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                    <line
                      x1="1"
                      y1="1"
                      x2="23"
                      y2="23"
                    />
                  </svg>
                  <svg
                    v-else
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle
                      cx="12"
                      cy="12"
                      r="3"
                    />
                  </svg>
                </button>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Base URL <span class="label-hint">(Optional)</span></label>
              <input
                :value="settings.ai.providers[providerSettings.viewingProvider.value]?.baseUrl"
                type="text"
                class="form-input"
                :placeholder="providerSettings.getDefaultBaseUrl()"
                @input="providerSettings.updateProviderBaseUrl(($event.target as HTMLInputElement).value)"
              >
            </div>
          </template>
        </section>

        <!-- Models Section -->
        <ProviderModels
          :models="providerSettings.availableModels.value"
          :filtered-models="providerSettings.filteredModels.value"
          :selected-count="providerSettings.currentSelectedModels.value.length"
          :search-query="providerSettings.modelSearchQuery.value"
          :new-model-input="providerSettings.newModelInput.value"
          :is-loading="providerSettings.isLoadingModels.value"
          :error="providerSettings.modelError.value"
          :is-model-selected="providerSettings.isModelSelected"
          :has-vision="providerSettings.hasVision"
          :has-image-generation="providerSettings.hasImageGeneration"
          :has-tools="providerSettings.hasTools"
          :has-reasoning="providerSettings.hasReasoning"
          :format-context-length="providerSettings.formatContextLength"
          @refresh="providerSettings.fetchModels(true)"
          @toggle="providerSettings.toggleModelSelection"
          @update:search-query="providerSettings.modelSearchQuery.value = $event"
          @update:new-model-input="providerSettings.newModelInput.value = $event"
          @add-custom="providerSettings.addCustomModel"
        />

        <!-- Temperature Section -->
        <section class="detail-section">
          <h3 class="section-title">
            Temperature
            <span class="temp-value">{{ settings.ai.temperature.toFixed(1) }}</span>
          </h3>
          <input
            :value="settings.ai.temperature"
            type="range"
            min="0"
            max="2"
            step="0.1"
            class="form-slider"
            @input="providerSettings.updateTemperature(($event.target as HTMLInputElement).valueAsNumber)"
          >
          <div class="slider-labels">
            <span>Precise</span>
            <span>Creative</span>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { AppSettings, ProviderInfo } from '@/types'
import GlobalDefaultSelector from './GlobalDefaultSelector.vue'
import ProviderList from './ProviderList.vue'
import ProviderOAuth from './ProviderOAuth.vue'
import ProviderModels from './ProviderModels.vue'
import { useProviderSettings } from './useProviderSettings'

const props = defineProps<{
  settings: AppSettings
  providers: ProviderInfo[]
}>()

const emit = defineEmits<{
  'update:settings': [settings: AppSettings]
  'add-custom-provider': []
  'edit-custom-provider': [providerId: string]
}>()

// Local state
const showApiKey = ref(false)

// Use provider settings composable
const providerSettings = useProviderSettings(props, (event, value) => emit(event, value))

onMounted(() => {
  providerSettings.initialize()
})

onUnmounted(() => {
  providerSettings.cleanup()
})
</script>

<style scoped>
/* Wrapper for the entire tab */
.provider-tab-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
  overflow: hidden;
}

/* Main Content */
.provider-tab {
  display: flex;
  gap: 16px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* Right: Provider Detail */
.provider-detail {
  flex: 1;
  background: var(--bg);
  padding: 16px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.detail-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.enable-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.enable-toggle input {
  display: none;
}

.toggle-switch {
  width: 32px;
  height: 18px;
  background: var(--border);
  border-radius: 9px;
  position: relative;
  transition: background 0.2s ease;
}

.toggle-switch::after {
  content: '';
  position: absolute;
  width: 14px;
  height: 14px;
  background: white;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform 0.2s ease;
}

.enable-toggle input:checked + .toggle-switch {
  background: var(--accent);
}

.enable-toggle input:checked + .toggle-switch::after {
  transform: translateX(14px);
}

.toggle-text {
  font-size: 12px;
  color: var(--text-muted);
}

/* Detail Sections */
.detail-section {
  margin-bottom: 20px;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 8px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.temp-value {
  margin-left: auto;
  color: var(--accent);
  font-weight: 600;
}

/* Form Elements */
.form-group {
  margin-bottom: 12px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.label-hint {
  font-weight: 400;
  opacity: 0.7;
}

.form-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--hover);
  color: var(--text-primary);
  font-size: 13px;
  transition: all 0.15s ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.form-input::placeholder {
  color: var(--text-muted);
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-wrapper .form-input {
  padding-right: 40px;
}

.input-action {
  position: absolute;
  right: 8px;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.input-action:hover {
  background: var(--hover);
  color: var(--text-primary);
}

/* Slider */
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
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-muted);
}
</style>
