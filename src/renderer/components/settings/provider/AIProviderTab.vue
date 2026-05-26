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

    <section class="providers-overview">
      <div class="section-header-row">
        <h3 class="section-label">
          Providers
        </h3>
        <button
          class="primary-action"
          type="button"
          @click="$emit('add-custom-provider')"
        >
          <span>+</span>
          Add provider
        </button>
      </div>

      <div class="provider-rows">
        <div
          v-for="provider in providers"
          :key="provider.id"
          :class="['provider-row', { active: providerSettings.viewingProvider.value === provider.id }]"
          role="button"
          tabindex="0"
          @click="providerSettings.switchViewingProvider(provider.id)"
          @keydown.enter.prevent="providerSettings.switchViewingProvider(provider.id)"
          @keydown.space.prevent="providerSettings.switchViewingProvider(provider.id)"
        >
          <span class="provider-icon-tile">
            <ProviderIcon
              :provider="provider.id"
              :size="18"
            />
            <span
              class="provider-status-dot"
              :class="providerStatus(provider.id)"
            />
          </span>

          <span class="provider-row-main">
            <span class="provider-row-title">
              <span class="provider-name">{{ provider.name }}</span>
              <span
                v-if="settings.ai.provider === provider.id"
                class="provider-pill blue"
              >Default</span>
              <span
                v-if="providerSettings.isUserCustomProvider(provider.id)"
                class="provider-pill"
              >Custom</span>
            </span>
            <span class="provider-row-model">{{ providerModelLabel(provider.id) }}</span>
          </span>

          <span class="provider-key-preview">{{ providerKeyPreview(provider.id) }}</span>
          <span
            class="provider-pill"
            :class="providerSettings.isProviderEnabled(provider.id) ? 'green' : 'mute'"
          >
            {{ providerSettings.isProviderEnabled(provider.id) ? 'active' : 'off' }}
          </span>
          <span class="provider-configure">
            Configure
          </span>
          <button
            v-if="providerSettings.isUserCustomProvider(provider.id)"
            class="provider-row-edit"
            type="button"
            title="Edit provider"
            @click.stop="$emit('edit-custom-provider', provider.id)"
          >
            Edit
          </button>
        </div>
      </div>
    </section>

    <!-- Selected Provider Detail -->
    <div class="provider-tab">
      <main class="provider-detail">
        <!-- Provider Header -->
        <div class="detail-header">
          <h2 class="detail-title">
            {{ providerSettings.currentProviderName.value }}
          </h2>
          <label class="enable-toggle">
            <input
              type="checkbox"
              :checked="providerSettings.isProviderEnabled(providerSettings.viewingProvider.value)"
              @change="providerSettings.toggleProviderEnabled(providerSettings.viewingProvider.value)"
            >
            <span class="toggle-switch" />
          </label>
        </div>

        <!-- API Configuration -->
        <section class="detail-section">
          <h3 class="section-label">
            API Configuration
          </h3>

          <!-- OAuth Provider Login -->
          <div
            v-if="providerSettings.isOAuthProvider.value"
            class="oauth-config-stack"
          >
            <AuthCard
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

            <ProviderUsageCard
              v-if="providerUsage.shouldShow.value"
              :response="providerUsage.response.value"
              :is-loading="providerUsage.isLoading.value"
              :error="providerUsage.error.value"
              @refresh="providerUsage.refresh(true)"
            />
          </div>

          <!-- Traditional API Key Input -->
          <div
            v-else
            class="settings-group"
          >
            <div class="settings-row">
              <span class="row-label">API Key</span>
              <div class="row-input-wrap">
                <input
                  :value="settings.ai.providers?.[providerSettings.viewingProvider.value]?.apiKey"
                  :type="showApiKey ? 'text' : 'password'"
                  class="row-input"
                  :placeholder="`Enter ${providerSettings.currentProviderName.value} key...`"
                  @input="providerSettings.updateProviderApiKey(($event.target as HTMLInputElement).value)"
                >
                <button
                  class="input-toggle"
                  type="button"
                  @click="showApiKey = !showApiKey"
                >
                  <svg
                    v-if="showApiKey"
                    width="14"
                    height="14"
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
                    width="14"
                    height="14"
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
            <div class="settings-row">
              <span class="row-label">Base URL</span>
              <input
                :value="settings.ai.providers?.[providerSettings.viewingProvider.value]?.baseUrl"
                type="text"
                class="row-input"
                :placeholder="providerSettings.getDefaultBaseUrl()"
                @input="providerSettings.updateProviderBaseUrl(($event.target as HTMLInputElement).value)"
              >
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
          :max-outputs="providerSettings.currentProviderMaxOutputs.value"
          :model-capabilities="providerSettings.currentProviderModelCapabilities.value"
          :rename-model="providerSettings.renameModel"
          :active-model-id="providerSettings.activeModelId.value"
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
          @update-max-output="providerSettings.updateModelMaxOutput"
          @update-capability="providerSettings.updateModelCapability"
          @reset-capabilities="providerSettings.resetModelCapabilities"
          @select-active="providerSettings.setActiveModel"
        />

        <!-- Temperature Section (per-provider, falls back to global default when unset).
             Disabled when the active model rejects `temperature` (e.g. reasoning models). -->
        <section class="detail-section">
          <h3 class="section-label">
            Temperature
            <span
              class="section-value"
              :class="{ muted: !providerSettings.activeModelSupportsTemperature.value }"
            >{{ providerSettings.currentTemperature.value.toFixed(1) }}</span>
            <span
              v-if="!providerSettings.activeModelSupportsTemperature.value"
              class="section-hint"
            >not supported by this model</span>
            <span
              v-else-if="!providerSettings.hasProviderTemperatureOverride.value"
              class="section-hint"
            >(default)</span>
            <button
              v-else
              class="section-reset"
              type="button"
              @click="providerSettings.resetProviderTemperature"
            >
              Reset
            </button>
          </h3>
          <div
            class="settings-group"
            :class="{ 'is-disabled': !providerSettings.activeModelSupportsTemperature.value }"
          >
            <div class="stepper-row">
              <NumberStepper
                :model-value="providerSettings.currentTemperature.value"
                :min="0"
                :max="2"
                :step="0.1"
                :disabled="!providerSettings.activeModelSupportsTemperature.value"
                aria-label="temperature"
                @update:model-value="providerSettings.updateProviderTemperature"
              />
              <div class="stepper-labels">
                <span>Precise</span>
                <span v-if="providerSettings.activeModelId.value">
                  for <code>{{ providerSettings.activeModelId.value }}</code>
                </span>
                <span>Creative</span>
              </div>
            </div>
          </div>
        </section>

        <!-- Max Output Tokens — slider configures the override for the active model.
             Mirrors the Temperature section's structure (default hint + Reset button). -->
        <section class="detail-section">
          <h3 class="section-label">
            Max Output
            <span
              class="section-value"
              :class="{ muted: !providerSettings.activeModelMaxLimit.value }"
            >{{ providerSettings.activeModelMaxOutput.value.toLocaleString() }}</span>
            <span
              v-if="!providerSettings.activeModelId.value"
              class="section-hint"
            >no model selected</span>
            <span
              v-else-if="!providerSettings.activeModelMaxLimit.value"
              class="section-hint"
            >no limit data for this model</span>
            <span
              v-else-if="!providerSettings.hasActiveModelMaxOverride.value"
              class="section-hint"
            >(half of {{ providerSettings.activeModelMaxLimit.value.toLocaleString() }})</span>
            <button
              v-else
              class="section-reset"
              type="button"
              @click="providerSettings.resetActiveModelMaxOutput"
            >
              Reset
            </button>
          </h3>
          <div
            class="settings-group"
            :class="{ 'is-disabled': !providerSettings.activeModelMaxLimit.value }"
          >
            <div class="stepper-row">
              <NumberStepper
                :model-value="providerSettings.activeModelMaxOutput.value"
                :min="1"
                :max="Math.max(1, providerSettings.activeModelMaxLimit.value)"
                :step="providerSettings.activeModelMaxOutputStep.value"
                :disabled="!providerSettings.activeModelMaxLimit.value"
                aria-label="max output tokens"
                @update:model-value="providerSettings.updateActiveModelMaxOutput"
              />
              <div class="stepper-labels">
                <span>1</span>
                <span v-if="providerSettings.activeModelId.value">
                  for <code>{{ providerSettings.activeModelId.value }}</code>
                </span>
                <span>{{ providerSettings.activeModelMaxLimit.value
                  ? providerSettings.formatContextLength(providerSettings.activeModelMaxLimit.value)
                  : '—' }}</span>
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
import ProviderIcon from '../ProviderIcon.vue'
import AuthCard from './AuthCard.vue'
import ProviderUsageCard from './ProviderUsageCard.vue'
import ProviderModels from './ProviderModels.vue'
import { useProviderSettings } from './useProviderSettings'
import { useProviderUsage } from './useProviderUsage'
import NumberStepper from '../NumberStepper.vue'

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
const providerUsage = useProviderUsage(providerSettings.viewingProvider, providerSettings.oauthStatus)

function providerModelLabel(providerId: string): string {
  const config = props.settings.ai.providers?.[providerId]
  const model = config?.model || config?.selectedModels?.[0]
  return model ? providerSettings.getModelName(model) : 'No model selected'
}

function providerStatus(providerId: string): 'active' | 'off' {
  return providerSettings.isProviderEnabled(providerId) ? 'active' : 'off'
}

function providerKeyPreview(providerId: string): string {
  const config = props.settings.ai.providers?.[providerId]
  const provider = props.providers.find(p => p.id === providerId)
  const key = config?.apiKey?.trim()

  if (provider?.requiresOAuth) return 'Subscription'
  if (key) {
    const head = key.slice(0, Math.min(6, key.length))
    const tail = key.length > 10 ? key.slice(-4) : ''
    return tail ? `${head}••••${tail}` : `${head}••••`
  }

  if (config?.baseUrl) return 'Base URL set'
  return 'Not connected'
}

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
  gap: 24px;
  min-width: 0;
}

.providers-overview {
  min-width: 0;
}

.section-header-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.section-header-row .section-label {
  flex: 1;
  margin-bottom: 0;
}

.primary-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: 1px solid var(--settings-ink, var(--text));
  border-radius: 7px;
  background: var(--settings-ink, var(--text));
  color: var(--settings-paper, var(--bg));
  font: inherit;
  font-size: 13px;
  font-weight: 560;
  cursor: pointer;
}

.provider-rows {
  border: 1px solid var(--settings-rule, var(--border));
  border-radius: 12px;
  background: var(--settings-paper, var(--bg));
  overflow: hidden;
}

.provider-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(132px, auto) auto auto auto;
  align-items: center;
  gap: 16px;
  width: 100%;
  min-height: 64px;
  padding: 14px 16px;
  border: 0;
  border-top: 1px solid var(--settings-rule-soft, var(--border-subtle));
  background: transparent;
  color: var(--settings-ink, var(--text));
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.provider-row:first-child {
  border-top: 0;
}

.provider-row:hover,
.provider-row.active {
  background: var(--settings-paper-2, var(--panel-2));
}

.provider-icon-tile {
  position: relative;
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--settings-rule, var(--border));
  border-radius: 9px;
  background: var(--settings-paper-2, var(--panel-2));
  color: var(--settings-ink-2, var(--text-secondary));
}

.provider-status-dot {
  position: absolute;
  right: -3px;
  bottom: -3px;
  width: 10px;
  height: 10px;
  border: 2px solid var(--settings-paper, var(--bg));
  border-radius: 999px;
  background: var(--settings-ink-5, var(--muted));
}

.provider-status-dot.active {
  background: var(--text-success, var(--color-success));
}

.provider-row-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.provider-row-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.provider-name {
  overflow: hidden;
  color: var(--settings-ink, var(--text));
  font-size: 14px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.provider-row-model,
.provider-key-preview {
  overflow: hidden;
  color: var(--settings-ink-4, var(--muted));
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.provider-key-preview {
  color: var(--settings-ink-3, var(--text-muted));
}

.provider-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--settings-rule, var(--border));
  border-radius: 999px;
  background: transparent;
  color: var(--settings-ink-4, var(--muted));
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10px;
  font-weight: 560;
  letter-spacing: 0.04em;
  line-height: 1.4;
  padding: 2px 7px;
  text-transform: uppercase;
  white-space: nowrap;
}

.provider-pill.blue {
  border-color: color-mix(in srgb, var(--settings-accent, var(--accent)) 32%, transparent);
  background: var(--settings-accent-tint, color-mix(in srgb, var(--settings-accent, var(--accent)) 12%, var(--settings-paper)));
  color: var(--settings-accent, var(--accent));
}

.provider-pill.green {
  border-color: color-mix(in srgb, var(--text-success, var(--color-success)) 32%, transparent);
  background: color-mix(in srgb, var(--text-success, var(--color-success)) 12%, var(--settings-paper));
  color: var(--text-success, var(--color-success));
}

.provider-configure,
.provider-row-edit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid var(--settings-rule, var(--border));
  border-radius: 7px;
  background: var(--settings-paper, var(--bg));
  color: var(--settings-ink-2, var(--text-secondary));
  font-size: 13px;
  font-weight: 560;
  white-space: nowrap;
}

.provider-row-edit {
  cursor: pointer;
}

.provider-row-edit:hover,
.provider-row:hover .provider-configure {
  border-color: var(--settings-accent, var(--accent));
}

.provider-tab {
  min-width: 0;
}

.provider-detail {
  flex: 1;
  min-width: 0;
  padding: 0;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.detail-title {
  font-size: 24px;
  font-weight: 650;
  color: var(--settings-ink, var(--text));
  margin: 0;
  letter-spacing: 0;
}

.enable-toggle {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.enable-toggle input { display: none; }

.toggle-switch {
  width: 36px;
  height: 20px;
  border: 1px solid var(--settings-rule, var(--border));
  background: var(--settings-paper, var(--border));
  border-radius: 10px;
  position: relative;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.toggle-switch::after {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  background: var(--settings-ink-3, var(--muted));
  border-radius: 50%;
  top: 1px;
  left: 1px;
  transition: transform 0.2s ease;
  box-shadow: 0 1px 2px rgba(0,0,0,0.2);
}

.enable-toggle input:checked + .toggle-switch {
  border-color: var(--settings-accent, var(--accent));
  background: var(--settings-accent, var(--accent));
}

.enable-toggle input:checked + .toggle-switch::after {
  background: var(--settings-paper, var(--bg));
  transform: translateX(16px);
}

.detail-section {
  margin-bottom: 24px;
}

.section-label {
  font-size: 10.5px;
  font-weight: 650;
  color: var(--settings-ink-4, var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 12px 2px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.section-value {
  margin-left: auto;
  color: var(--settings-accent, var(--accent));
  font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  text-transform: none;
  letter-spacing: 0.03em;
}

.section-value.muted {
  color: var(--settings-ink-4, var(--muted));
}

.settings-group.is-disabled {
  opacity: 0.5;
  pointer-events: none;
}

.oauth-config-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-slider:disabled {
  cursor: not-allowed;
}

.section-hint {
  color: var(--settings-ink-4, var(--muted));
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  font-size: 11px;
}

.section-reset {
  margin-left: 4px;
  border: none;
  background: transparent;
  color: var(--settings-ink-4, var(--muted));
  font-size: 11px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}

.section-reset:hover {
  color: var(--settings-ink, var(--text));
  background: var(--settings-paper-2, rgba(128, 128, 128, 0.1));
}

.settings-group {
  border: 1px solid var(--settings-rule, rgba(128, 128, 128, 0.1));
  background: var(--settings-paper, color-mix(in srgb, var(--settings-paper-2, transparent) 44%, transparent));
  border-radius: 12px;
  overflow: hidden;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 54px;
  padding: 0 16px;
  gap: 24px;
  border-bottom: 1px solid var(--settings-rule-soft, rgba(128, 128, 128, 0.1));
}

.settings-row:last-child {
  border-bottom: none;
}

.row-label {
  font-size: 14px;
  color: var(--settings-ink-2, var(--text));
  flex-shrink: 0;
  font-weight: 520;
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
  padding: 7px 10px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--settings-ink, var(--text));
  font-size: 13px;
  text-align: right;
}

.row-input:focus {
  outline: none;
  background: var(--settings-paper-2, rgba(128, 128, 128, 0.08));
}

.row-input::placeholder {
  color: var(--settings-ink-4, var(--muted));
}

.row-select {
  -webkit-appearance: none;
  appearance: none;
  padding-right: 8px;
  cursor: pointer;
}

.network-group {
  margin-top: 10px;
}

.input-toggle {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: var(--settings-ink-4, var(--muted));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.input-toggle:hover {
  color: var(--settings-ink, var(--text));
}

.stepper-row,
.slider-row {
  padding: 16px 16px 14px;
}

.stepper-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--settings-rule, var(--border));
  cursor: pointer;
  -webkit-appearance: none;
}

.form-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--settings-accent, var(--accent));
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.stepper-labels,
.slider-labels {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
  font-size: 11px;
  color: var(--settings-ink-4, var(--muted));
  gap: 8px;
}

.stepper-labels code,
.slider-labels code {
  font-family: var(--font-mono, 'SF Mono', monospace);
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(128, 128, 128, 0.1);
  color: var(--settings-ink, var(--text));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}
</style>
