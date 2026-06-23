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
        <Button
          unstyled
          class="primary-action"
          native-type="button"
          @click="$emit('add-custom-provider')"
        >
          <span>+</span>
          Add provider
        </Button>
      </div>

      <div class="provider-rows">
        <div
          v-for="provider in providers"
          :key="provider.id"
          class="provider-row-block"
        >
          <div
            :class="['provider-row', { active: isProviderExpanded(provider.id) }]"
            role="button"
            tabindex="0"
            :aria-expanded="isProviderExpanded(provider.id)"
            @click="toggleProviderDetail(provider.id)"
            @keydown.enter.prevent="toggleProviderDetail(provider.id)"
            @keydown.space.prevent="toggleProviderDetail(provider.id)"
          >
            <span class="provider-icon-tile">
              <ProviderIcon
                :provider="provider.id"
                :size="18"
              />
              <span
                class="provider-status-dot"
                :class="providerSettings.isProviderEnabled(provider.id) ? 'active' : 'off'"
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
            <Button
              unstyled
              class="provider-configure"
              native-type="button"
              :aria-label="`${isProviderExpanded(provider.id) ? 'Collapse' : 'Expand'} ${provider.name} settings`"
              @click.stop="toggleProviderDetail(provider.id)"
            >
              Configure
              <ChevronDown
                class="provider-configure-icon"
                :class="{ expanded: isProviderExpanded(provider.id) }"
                :size="14"
              />
            </Button>
            <Button
              v-if="providerSettings.isUserCustomProvider(provider.id)"
              unstyled
              class="provider-row-edit"
              native-type="button"
              title="Edit provider"
              @click.stop="$emit('edit-custom-provider', provider.id)"
            >
              Edit
            </Button>
          </div>

          <Transition name="provider-config">
            <div
              v-if="isProviderExpanded(provider.id) && providerSettings.viewingProvider.value === provider.id"
              class="provider-inline-detail"
              @click.stop
            >
              <main class="provider-detail">
                <!-- Provider Header -->
                <div class="detail-header">
                  <h2 class="detail-title">
                    {{ providerSettings.currentProviderName.value }}
                  </h2>
                  <Switch
                    :model-value="providerSettings.isProviderEnabled(providerSettings.viewingProvider.value)"
                    size="small"
                    class="detail-enable-switch"
                    aria-label="Provider enabled"
                    @change="providerSettings.toggleProviderEnabled(providerSettings.viewingProvider.value)"
                  />
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

                  <!-- ACP Agent Configuration -->
                  <div
                    v-else-if="providerSettings.isACPProvider?.value"
                    class="settings-group"
                  >
                    <div class="settings-row">
                      <span class="row-label">Connection</span>
                      <div class="acp-connection-row">
                        <span
                          class="provider-pill"
                          :class="providerSettings.currentACPAgentState.value?.status === 'connected' ? 'green' : providerSettings.currentACPAgentState.value?.status === 'error' ? 'red' : 'mute'"
                        >
                          {{ providerSettings.currentACPAgentState.value?.status || 'disconnected' }}
                        </span>
                        <Button
                          unstyled
                          class="mini-action"
                          native-type="button"
                          @click="providerSettings.connectACPAgent"
                        >
                          Connect
                        </Button>
                        <Button
                          unstyled
                          class="mini-action"
                          native-type="button"
                          @click="providerSettings.disconnectACPAgent"
                        >
                          Disconnect
                        </Button>
                        <Button
                          unstyled
                          class="mini-action"
                          native-type="button"
                          @click="providerSettings.refreshACPAgent"
                        >
                          Refresh
                        </Button>
                      </div>
                    </div>
                    <div
                      v-if="providerSettings.currentACPAgentState.value?.error"
                      class="settings-row"
                    >
                      <span class="row-label">Error</span>
                      <span class="row-note error-note">{{ providerSettings.currentACPAgentState.value.error }}</span>
                    </div>
                    <template v-if="providerSettings.currentACPAgent.value">
                      <div class="settings-row">
                        <span class="row-label">Command</span>
                        <Input
                          :model-value="providerSettings.currentACPAgent.value.command"
                          type="text"
                          class="row-input"
                          :spellcheck="false"
                          aria-label="ACP command"
                          @update:model-value="providerSettings.updateACPAgent({ command: String($event) })"
                        />
                      </div>
                      <div class="settings-row">
                        <span class="row-label">Arguments</span>
                        <Input
                          :model-value="(providerSettings.currentACPAgent.value.args || []).join(' ')"
                          type="text"
                          class="row-input"
                          :spellcheck="false"
                          aria-label="ACP command arguments"
                          @update:model-value="providerSettings.updateACPArgs(String($event))"
                        />
                      </div>
                      <div class="settings-row">
                        <span class="row-label">Working dir</span>
                        <Input
                          :model-value="providerSettings.currentACPAgent.value.cwd || ''"
                          type="text"
                          class="row-input"
                          :spellcheck="false"
                          aria-label="ACP working directory"
                          @update:model-value="providerSettings.updateACPAgent({ cwd: String($event) })"
                        />
                      </div>
                      <div class="settings-row">
                        <span class="row-label">Permission</span>
                        <select
                          class="row-select"
                          :value="providerSettings.currentACPAgent.value.permissionMode || 'allow'"
                          aria-label="ACP permission mode"
                          @change="providerSettings.updateACPAgent({ permissionMode: (($event.target as HTMLSelectElement).value === 'reject' ? 'reject' : 'allow') })"
                        >
                          <option value="allow">Allow</option>
                          <option value="reject">Reject</option>
                        </select>
                      </div>
                      <div class="settings-row compact-toggle-row">
                        <span class="row-label">Client FS</span>
                        <Switch
                          :model-value="providerSettings.currentACPAgent.value.allowFileSystemAccess === true"
                          size="small"
                          aria-label="ACP file system access"
                          @change="providerSettings.updateACPAgent({ allowFileSystemAccess: Boolean($event) })"
                        />
                      </div>
                      <div class="settings-row compact-toggle-row">
                        <span class="row-label">Client terminal</span>
                        <Switch
                          :model-value="providerSettings.currentACPAgent.value.allowTerminalAccess === true"
                          size="small"
                          aria-label="ACP terminal access"
                          @change="providerSettings.updateACPAgent({ allowTerminalAccess: Boolean($event) })"
                        />
                      </div>
                    </template>
                  </div>

                  <!-- Traditional API Key Input -->
                  <div
                    v-else
                    class="settings-group"
                  >
                    <div class="settings-row">
                      <span class="row-label api-key-label">
                        API Key
                        <span
                          v-if="providerSettings.currentProviderUsesEnvApiKey.value"
                          class="env-detected-badge"
                        >
                          <Terminal :size="12" />
                          Env {{ providerSettings.currentProviderEnvVarName.value }}
                        </span>
                      </span>
                      <Input
                        :model-value="settings.ai.providers?.[providerSettings.viewingProvider.value]?.apiKey"
                        type="password"
                        show-password
                        class="row-input"
                        :placeholder="`Enter ${providerSettings.currentProviderName.value} key...`"
                        :spellcheck="false"
                        aria-label="API key"
                        @update:model-value="providerSettings.updateProviderApiKey"
                      />
                    </div>
                    <div class="settings-row">
                      <span class="row-label">Base URL</span>
                      <Input
                        :model-value="settings.ai.providers?.[providerSettings.viewingProvider.value]?.baseUrl"
                        type="text"
                        class="row-input"
                        :placeholder="providerSettings.getDefaultBaseUrl()"
                        :spellcheck="false"
                        aria-label="Base URL"
                        @update:model-value="providerSettings.updateProviderBaseUrl"
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
                    <Button
                      v-else
                      unstyled
                      class="section-reset"
                      native-type="button"
                      @click="providerSettings.resetProviderTemperature"
                    >
                      Reset
                    </Button>
                  </h3>
                  <div
                    class="settings-group"
                    :class="{ 'is-disabled': !providerSettings.activeModelSupportsTemperature.value }"
                  >
                    <div class="stepper-row">
                      <InputNumber
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
                    <Button
                      v-else
                      unstyled
                      class="section-reset"
                      native-type="button"
                      @click="providerSettings.resetActiveModelMaxOutput"
                    >
                      Reset
                    </Button>
                  </h3>
                  <div
                    class="settings-group"
                    :class="{ 'is-disabled': !providerSettings.activeModelMaxLimit.value }"
                  >
                    <div class="stepper-row">
                      <InputNumber
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
          </Transition>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { ref, onMounted, onUnmounted } from 'vue'
import { ChevronDown, Terminal } from 'lucide-vue-next'
import type { AppSettings, ProviderInfo } from '@/types'
import Input from '@/components/common/Input.vue'
import GlobalDefaultSelector from './GlobalDefaultSelector.vue'
import ProviderIcon from '../ProviderIcon.vue'
import AuthCard from './AuthCard.vue'
import ProviderUsageCard from './ProviderUsageCard.vue'
import ProviderModels from './ProviderModels.vue'
import { useProviderSettings } from './useProviderSettings'
import { useProviderUsage } from './useProviderUsage'
import InputNumber from '@/components/common/InputNumber.vue'
import Switch from '@/components/common/Switch.vue'

const props = defineProps<{
  settings: AppSettings
  providers: ProviderInfo[]
}>()

const emit = defineEmits<{
  'update:settings': [settings: AppSettings]
  'add-custom-provider': []
  'edit-custom-provider': [providerId: string]
}>()

const providerSettings = useProviderSettings(props, (event, value) => emit(event, value))
const providerUsage = useProviderUsage(providerSettings.viewingProvider, providerSettings.oauthStatus)
const expandedProviderId = ref<string | null>(props.settings.ai.provider)

function isProviderExpanded(providerId: string): boolean {
  return expandedProviderId.value === providerId
}

async function toggleProviderDetail(providerId: string) {
  if (expandedProviderId.value === providerId) {
    expandedProviderId.value = null
    return
  }

  await providerSettings.switchViewingProvider(providerId)
  expandedProviderId.value = providerId
}

function providerModelLabel(providerId: string): string {
  const config = props.settings.ai.providers?.[providerId]
  const model = config?.model || config?.selectedModels?.[0]
  return model ? providerSettings.getModelName(model) : 'No model selected'
}

function providerKeyPreview(providerId: string): string {
  const config = props.settings.ai.providers?.[providerId]
  const provider = props.providers.find(p => p.id === providerId)
  const key = config?.apiKey?.trim()
  const envStatus = providerSettings.getProviderEnvStatus(providerId)
  const envVar = envStatus?.resolvedEnvVar

  if (providerId === 'acp') return 'Local agent'
  if (provider?.requiresOAuth) return 'Subscription'
  if (providerSettings.providerUsesEnvApiKey(providerId)) {
    return envVar ? `Env ${envVar}` : 'Env missing'
  }
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
  border: 1px solid var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  border-radius: 7px;
  background: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  color: var(--settings-paper, var(--ui-surface-app-bg, var(--bg)));
  font: inherit;
  font-size: 13px;
  font-weight: 560;
  cursor: pointer;
}

.provider-rows {
  padding: 8px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  border-radius: 10px;
  background: var(--settings-paper, var(--ui-surface-app-bg, var(--bg)));
  overflow: visible;
}

.provider-row-block {
  position: relative;
  border-radius: 10px;
  transition: background 0.16s ease, box-shadow 0.16s ease;
}

.provider-row-block + .provider-row-block {
  margin-top: 8px;
}

.provider-row-block + .provider-row-block::before {
  content: '';
  position: absolute;
  top: -4px;
  left: 12px;
  right: 12px;
  height: 1px;
  background: var(--settings-rule-soft, var(--ui-border-subtle-border, var(--border-subtle)));
}

.provider-row-block:has(.provider-row.active) {
  background: color-mix(in srgb, var(--settings-paper-2, var(--ui-surface-sidebar-bg, var(--panel-2))) 48%, transparent);
  box-shadow: inset 0 0 0 1px var(--settings-rule-soft, var(--ui-border-subtle-border, var(--border-subtle)));
}

.provider-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(132px, auto) auto auto auto;
  align-items: center;
  gap: 16px;
  width: 100%;
  min-height: 64px;
  padding: 13px 14px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: background 0.16s ease, box-shadow 0.16s ease;
}

.provider-row:hover {
  background: color-mix(in srgb, var(--settings-paper-2, var(--ui-surface-sidebar-bg, var(--panel-2))) 58%, transparent);
}

.provider-row.active {
  background: transparent;
}

.provider-row:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted))) 70%, transparent);
}

.provider-icon-tile {
  position: relative;
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  border-radius: 9px;
  background: var(--settings-paper-2, var(--ui-surface-sidebar-bg, var(--panel-2)));
  color: var(--settings-ink-2, var(--ui-text-secondary-fg, var(--text-secondary)));
}

.provider-status-dot {
  position: absolute;
  right: -3px;
  bottom: -3px;
  width: 10px;
  height: 10px;
  border: 2px solid var(--settings-paper, var(--ui-surface-app-bg, var(--bg)));
  border-radius: 999px;
  background: var(--settings-ink-5, var(--ui-text-muted-fg, var(--muted)));
}

.provider-status-dot.active {
  background: var(--ui-status-success-fg, var(--text-success, var(--color-success)));
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
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  font-size: 14px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.provider-row-model,
.provider-key-preview {
  overflow: hidden;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.provider-key-preview {
  color: var(--settings-ink-3, var(--ui-text-muted-fg, var(--text-muted)));
}

.provider-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  border-radius: 999px;
  background: transparent;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  font-weight: 560;
  letter-spacing: 0;
  line-height: 1.4;
  padding: 2px 7px;
  white-space: nowrap;
}

.provider-pill.blue {
  border-color: color-mix(in srgb, var(--settings-accent, var(--ui-accent-primary-fg, var(--accent))) 32%, transparent);
  background: var(--settings-accent-tint, color-mix(in srgb, var(--settings-accent, var(--ui-accent-primary-fg, var(--accent))) 12%, var(--settings-paper)));
  color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
}

.provider-pill.green {
  border-color: var(--ui-status-success-border, var(--text-success, var(--color-success)));
  background: var(--ui-status-success-bg, var(--settings-paper));
  color: var(--ui-status-success-fg, var(--text-success, var(--color-success)));
}

.provider-pill.red {
  border-color: var(--ui-status-error-border, var(--color-danger, #d84c4c));
  background: var(--ui-status-error-bg, var(--settings-paper));
  color: var(--ui-status-error-fg, var(--color-danger, #d84c4c));
}

.provider-configure,
.provider-row-edit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  border-radius: 7px;
  background: var(--settings-paper, var(--ui-surface-app-bg, var(--bg)));
  color: var(--settings-ink-2, var(--ui-text-secondary-fg, var(--text-secondary)));
  font-size: 13px;
  font-weight: 560;
  white-space: nowrap;
  cursor: pointer;
}

.provider-configure {
  min-width: 112px;
}

.provider-configure-icon {
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  transition: transform 0.16s ease;
}

.provider-configure-icon.expanded {
  transform: rotate(180deg);
}

.provider-row-edit {
  cursor: pointer;
}

.provider-row-edit:hover,
.provider-configure:hover,
.provider-row:hover .provider-configure {
  border-color: var(--settings-rule-strong, var(--settings-ink-4, var(--ui-border-default-border, var(--border))));
  background: color-mix(in srgb, var(--settings-paper-2, var(--ui-surface-sidebar-bg, var(--panel-2))) 48%, var(--settings-paper, transparent));
}

.provider-row-edit:focus-visible,
.provider-configure:focus-visible {
  outline: none;
  border-color: var(--settings-rule-strong, var(--settings-ink-4, var(--ui-border-default-border, var(--border))));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted))) 26%, transparent);
}

.provider-inline-detail {
  margin: 0 10px;
  padding: 14px 6px 16px;
  border-top: 1px solid var(--settings-rule-soft, var(--ui-border-subtle-border, var(--border-subtle)));
  background: transparent;
}

.provider-config-enter-active,
.provider-config-leave-active {
  overflow: hidden;
  transition: opacity 0.18s ease, max-height 0.22s ease, transform 0.18s ease;
}

.provider-config-enter-from,
.provider-config-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-6px);
}

.provider-config-enter-to,
.provider-config-leave-from {
  max-height: 2400px;
  opacity: 1;
  transform: translateY(0);
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
  margin-bottom: 18px;
}

.detail-title {
  font-size: 18px;
  font-weight: 650;
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  margin: 0;
  letter-spacing: 0;
}

.detail-section {
  margin-bottom: 24px;
}

.section-label {
  font-size: 10.5px;
  font-weight: 650;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 12px 2px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.section-value {
  margin-left: auto;
  color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  text-transform: none;
  letter-spacing: 0.03em;
}

.section-value.muted {
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
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

.section-hint {
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  font-size: 11px;
}

.section-reset {
  margin-left: 4px;
  border: none;
  background: transparent;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  font-size: 11px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}

.section-reset:hover {
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  background: var(--settings-paper-2, rgba(128, 128, 128, 0.1));
}

.settings-group {
  border: 1px solid var(--settings-rule, rgba(128, 128, 128, 0.1));
  background: var(--settings-paper, color-mix(in srgb, var(--settings-paper-2, transparent) 44%, transparent));
  border-radius: 8px;
  overflow: hidden;
}

.settings-row {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) minmax(240px, 420px);
  align-items: center;
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
  color: var(--settings-ink-2, var(--ui-text-primary-fg, var(--text)));
  flex-shrink: 0;
  font-weight: 520;
}

.api-key-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.env-detected-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 2px 6px;
  border: 1px solid var(--ui-status-success-border, var(--text-success, var(--color-success)));
  border-radius: 999px;
  background: var(--ui-status-success-bg, var(--settings-paper));
  color: var(--ui-status-success-fg, var(--text-success, var(--color-success)));
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10.5px;
  font-weight: 560;
  line-height: 1.3;
  white-space: nowrap;
}

.row-input {
  width: 100%;
  min-width: 0;
}

.row-select {
  width: 100%;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid var(--settings-rule, var(--ui-border-subtle-border, var(--border-subtle)));
  border-radius: 7px;
  background: var(--settings-paper-2, var(--ui-surface-input-bg, var(--bg-input, var(--bg))));
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  font: inherit;
  font-size: 13px;
}

.acp-connection-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.mini-action {
  min-height: 28px;
  padding: 0 9px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  border-radius: 7px;
  background: var(--settings-paper-2, var(--ui-surface-sidebar-bg, var(--panel-2)));
  color: var(--settings-ink-2, var(--ui-text-secondary-fg, var(--text-secondary)));
  font-size: 12px;
  font-weight: 560;
  cursor: pointer;
}

.mini-action:hover {
  border-color: var(--settings-rule-strong, var(--settings-ink-4, var(--ui-border-default-border, var(--border))));
}

.row-note {
  min-width: 0;
  overflow: hidden;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.error-note {
  color: var(--ui-status-error-fg, var(--color-danger, #d84c4c));
}

.compact-toggle-row {
  min-height: 44px;
}

.row-input :deep(.app-input-control) {
  min-height: 34px;
  border-color: var(--settings-rule, var(--ui-border-subtle-border, var(--border-subtle)));
  border-radius: 7px;
  background: var(--settings-paper-2, var(--ui-surface-input-bg, var(--bg-input, var(--bg))));
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  box-shadow: none;
}

.row-input :deep(.app-input-inner) {
  font-size: 13px;
  text-align: left;
}

.row-input.is-focused :deep(.app-input-control) {
  border-color: var(--settings-rule-strong, var(--settings-rule, var(--ui-border-default-border, var(--border))));
  box-shadow: none;
}

.row-input :deep(.app-input-inner::placeholder) {
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
}

.stepper-row {
  padding: 16px 16px 14px;
}

.stepper-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stepper-labels {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
  font-size: 11px;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  gap: 8px;
}

.stepper-labels code {
  font-family: var(--font-mono, 'SF Mono', monospace);
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(128, 128, 128, 0.1);
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}
</style>
