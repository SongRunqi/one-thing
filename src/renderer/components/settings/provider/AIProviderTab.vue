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
        <!-- Provider Header -->
        <div class="detail-header">
          <h2 class="detail-title">{{ providerSettings.currentProviderName.value }}</h2>
          <label class="enable-toggle">
            <input
              type="checkbox"
              :checked="providerSettings.isProviderEnabled(providerSettings.viewingProvider.value)"
              @change="providerSettings.toggleProviderEnabled(providerSettings.viewingProvider.value)"
            />
            <span class="toggle-switch"></span>
          </label>
        </div>

        <!-- API Configuration -->
        <section class="detail-section">
          <h3 class="section-label">API Configuration</h3>

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
          <div v-else class="settings-group">
            <div class="settings-row">
              <span class="row-label">API Key</span>
              <div class="row-input-wrap">
                <input
                  :value="settings.ai.providers[providerSettings.viewingProvider.value]?.apiKey"
                  @input="providerSettings.updateProviderApiKey(($event.target as HTMLInputElement).value)"
                  :type="showApiKey ? 'text' : 'password'"
                  class="row-input"
                  :placeholder="`Enter ${providerSettings.currentProviderName.value} key...`"
                />
                <button class="input-toggle" @click="showApiKey = !showApiKey" type="button">
                  <svg v-if="showApiKey" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                  <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                </button>
              </div>
            </div>
            <div class="settings-row">
              <span class="row-label">Base URL</span>
              <input
                :value="settings.ai.providers[providerSettings.viewingProvider.value]?.baseUrl"
                @input="providerSettings.updateProviderBaseUrl(($event.target as HTMLInputElement).value)"
                type="text"
                class="row-input"
                :placeholder="providerSettings.getDefaultBaseUrl()"
              />
            </div>
          </div>
        </section>

        <!-- Models Section -->
        <ProviderModels
          :models="providerSettings.availableModels.value"
          :filtered-models="providerSettings.filteredModels.value"
          :selected-count="providerSettings.currentSelectedModels.value.length"
          :selected-models-list="providerSettings.currentSelectedModels.value"
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
          <h3 class="section-label">
            Temperature
            <span class="section-value">{{ settings.ai.temperature.toFixed(1) }}</span>
          </h3>
          <div class="settings-group">
            <div class="slider-row">
              <input
                :value="settings.ai.temperature"
                @input="providerSettings.updateTemperature(($event.target as HTMLInputElement).valueAsNumber)"
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

const showApiKey = ref(false)

const providerSettings = useProviderSettings(props, (event, value) => emit(event, value))

onMounted(() => {
  providerSettings.initialize()
})

onUnmounted(() => {
  providerSettings.cleanup()
})
</script>

<style scoped>
.provider-tab-wrapper {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.provider-tab {
  display: flex;
  gap: 0;
}

/* ── Detail Panel ── */
.provider-detail {
  flex: 1;
  padding: 0 4px;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.detail-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}

/* ── Toggle ── */
.enable-toggle {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.enable-toggle input { display: none; }

.toggle-switch {
  width: 36px;
  height: 20px;
  background: var(--border);
  border-radius: 10px;
  position: relative;
  transition: background 0.2s ease;
}

.toggle-switch::after {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform 0.2s ease;
  box-shadow: 0 1px 2px rgba(0,0,0,0.2);
}

.enable-toggle input:checked + .toggle-switch {
  background: var(--accent);
}

.enable-toggle input:checked + .toggle-switch::after {
  transform: translateX(16px);
}

/* ── Sections ── */
.detail-section {
  margin-bottom: 20px;
}

.section-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 8px 2px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-value {
  margin-left: auto;
  color: var(--accent);
  font-weight: 600;
}

/* ── Settings Group (macOS 分组容器) ── */
.settings-group {
  background: rgba(128, 128, 128, 0.06);
  border-radius: 10px;
  overflow: hidden;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;
  padding: 6px 14px;
  gap: 12px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.1);
}

.settings-row:last-child {
  border-bottom: none;
}

.row-label {
  font-size: 13px;
  color: var(--text);
  flex-shrink: 0;
}

.row-input-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
}

.row-input {
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  text-align: right;
}

.row-input:focus {
  outline: none;
  background: rgba(128, 128, 128, 0.08);
}

.row-input::placeholder {
  color: var(--muted);
}

.input-toggle {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.input-toggle:hover {
  color: var(--text);
}

/* ── Slider ── */
.slider-row {
  padding: 12px 14px;
}

.form-slider {
  width: 100%;
  height: 4px;
  border-radius: 2px;
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
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 11px;
  color: var(--muted);
}
</style>
