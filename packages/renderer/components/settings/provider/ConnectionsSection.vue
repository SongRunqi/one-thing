<template>
  <section class="conn-section">
    <div class="section-header-row">
      <h3 class="section-label">
        Connections
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

    <div class="conn-rows">
      <div
        v-for="card in connCards"
        :key="card.key"
        class="conn-row-block"
      >
        <div
          :class="['conn-row', { active: expandedKey === card.key }]"
          role="button"
          tabindex="0"
          :aria-expanded="expandedKey === card.key"
          @click="toggleCard(card)"
          @keydown.enter.prevent="toggleCard(card)"
          @keydown.space.prevent="toggleCard(card)"
        >
          <span class="conn-icon-tile">
            <ProviderIcon
              :provider="card.iconId"
              :size="16"
            />
            <span
              class="conn-status-dot"
              :class="isCardConnected(card) ? 'on' : 'off'"
            />
          </span>

          <span class="conn-main">
            <span class="conn-title">
              <span class="conn-name">{{ card.label }}</span>
              <span
                v-if="!card.family && card.members[0].requiresOAuth"
                class="conn-pill"
              >subscription</span>
              <span
                v-if="!card.family && providerSettings.isUserCustomProvider(card.members[0].id)"
                class="conn-pill"
              >custom</span>
            </span>
            <span class="conn-summary">{{ cardSummary(card) }}</span>
          </span>

          <Button
            unstyled
            class="conn-action"
            native-type="button"
            :aria-label="`${expandedKey === card.key ? 'Collapse' : 'Expand'} ${card.label} settings`"
            @click.stop="toggleCard(card)"
          >
            Manage models
            <ChevronDown
              class="conn-action-icon"
              :class="{ expanded: expandedKey === card.key }"
              :size="13"
            />
          </Button>

          <Button
            v-if="!card.family && providerSettings.isUserCustomProvider(card.members[0].id)"
            unstyled
            class="conn-action"
            native-type="button"
            title="Edit provider"
            @click.stop="$emit('edit-custom-provider', card.members[0].id)"
          >
            Edit
          </Button>

          <Switch
            :model-value="isCardEnabled(card)"
            size="small"
            :aria-label="`${card.label} enabled`"
            @click.stop
            @change="toggleCardEnabled(card)"
          />
        </div>

        <Transition name="conn-detail">
          <div
            v-if="expandedKey === card.key && isViewingMember(card)"
            class="conn-detail"
            @click.stop
          >
            <!-- Family card: switch between the API and subscription channels.
                 Everything below keys off viewingProvider, so flipping the
                 channel re-scopes credentials and the model catalog. -->
            <div
              v-if="card.members.length > 1"
              class="channel-tabs"
              role="tablist"
              :aria-label="`${card.label} channels`"
            >
              <button
                v-for="member in card.members"
                :key="member.id"
                type="button"
                class="channel-tab"
                :class="{ active: providerSettings.viewingProvider.value === member.id }"
                role="tab"
                :aria-selected="providerSettings.viewingProvider.value === member.id"
                @click="switchChannel(member.id)"
              >
                {{ channelLabel(card, member) }}
                <span
                  v-if="isConnected(member.id)"
                  class="channel-tab-check"
                >✓</span>
              </button>
            </div>
            <!-- OAuth Provider Login -->
            <div
              v-if="providerSettings.isOAuthProvider.value"
              class="oauth-config-stack"
            >
              <AuthCard
                :provider-id="providerSettings.viewingProvider.value"
                :provider-name="activeMember(card).name"
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
                    class="conn-pill"
                    :class="providerSettings.currentACPAgentState.value?.status === 'connected' ? 'green' : providerSettings.currentACPAgentState.value?.status === 'error' ? 'red' : ''"
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
                <span class="row-note is-error">{{ providerSettings.currentACPAgentState.value.error }}</span>
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
                    <option value="allow">
                      Allow
                    </option>
                    <option value="reject">
                      Reject
                    </option>
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

            <!-- Local agent provider: no credentials, drives a local CLI -->
            <div
              v-else-if="isLocalAgentProvider(activeMember(card).id)"
              class="settings-group"
            >
              <div class="settings-row">
                <span class="row-label">Connection</span>
                <span class="row-note">Local CLI agent — uses your existing CLI login; no API key needed.</span>
              </div>
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
                    <span v-if="providerSettings.currentProviderEnvKeyPreview.value">
                      · {{ providerSettings.currentProviderEnvKeyPreview.value }}
                    </span>
                  </span>
                </span>
                <Input
                  :model-value="providerApiKeyInputValue(activeMember(card).id)"
                  type="password"
                  show-password
                  class="row-input"
                  :placeholder="providerApiKeyPlaceholder(activeMember(card).id, activeMember(card).name)"
                  :spellcheck="false"
                  aria-label="API key"
                  @update:model-value="providerSettings.updateProviderApiKey"
                />
              </div>
              <div class="settings-row">
                <span class="row-label">Base URL</span>
                <Input
                  :model-value="settings.ai.providers?.[activeMember(card).id]?.baseUrl"
                  type="text"
                  class="row-input"
                  :placeholder="providerSettings.getDefaultBaseUrl()"
                  :spellcheck="false"
                  aria-label="Base URL"
                  @update:model-value="providerSettings.updateProviderBaseUrl"
                />
              </div>
              <div
                v-if="providerSettings.isZhipuProvider.value"
                class="settings-row"
              >
                <span class="row-label">API mode</span>
                <select
                  class="row-select"
                  :value="providerSettings.currentZhipuApiMode.value"
                  aria-label="Zhipu API mode"
                  @change="providerSettings.updateZhipuApiMode(($event.target as HTMLSelectElement).value)"
                >
                  <option value="standard">
                    Standard
                  </option>
                  <option value="coding-plan">
                    Coding Plan
                  </option>
                </select>
              </div>
              <template v-if="providerSettings.isQwenProvider.value">
                <div class="settings-row">
                  <span class="row-label">版本</span>
                  <Select
                    class="row-select"
                    size="small"
                    :model-value="providerSettings.currentQwenRegion.value"
                    :options="QWEN_REGION_OPTIONS"
                    aria-label="Qwen region"
                    @update:model-value="providerSettings.updateQwenRegion(String($event))"
                  />
                </div>
                <div class="settings-row">
                  <span class="row-label">计费方式</span>
                  <Select
                    class="row-select"
                    size="small"
                    :model-value="providerSettings.currentQwenApiMode.value"
                    :options="QWEN_API_MODE_OPTIONS"
                    aria-label="Qwen API mode"
                    @update:model-value="providerSettings.updateQwenApiMode(String($event))"
                  />
                </div>
                <p class="row-note">
                  订阅用户必须选对档位。用通用 Key 和地址调用会走按量计费，在订阅之外额外扣钱。
                </p>
              </template>
            </div>

            <!-- Model catalog for this provider: checked models feed the ledger above -->
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
              :context-lengths="providerSettings.currentProviderContextLengths.value"
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
              @update-context-length="providerSettings.updateModelContextLength"
              @update-capability="providerSettings.updateModelCapability"
              @reset-capabilities="providerSettings.resetModelCapabilities"
              @select-active="providerSettings.setActiveModel"
            />
          </div>
        </Transition>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ChevronDown, Terminal } from 'lucide-vue-next'
import Button from '@/components/common/Button.vue'
import Input from '@/components/common/Input.vue'
import Select from '@/components/common/Select.vue'
import Switch from '@/components/common/Switch.vue'

const QWEN_REGION_OPTIONS = [
  { value: 'cn', label: '国内版' },
  { value: 'intl', label: '海外版 (QwenCloud)' },
]

const QWEN_API_MODE_OPTIONS = [
  { value: 'standard', label: 'API 按量付费 (sk-ws-)' },
  { value: 'token-plan', label: 'Token Plan 订阅 (sk-sp-)' },
  { value: 'coding-plan', label: 'Coding Plan 订阅 (sk-sp-)' },
]
import type { AppSettings, ProviderInfo } from '@/types'
import { providerFamilyOf, type ProviderFamily } from '@shared/provider-families'
import ProviderIcon from '../ProviderIcon.vue'
import AuthCard from './AuthCard.vue'
import ProviderUsageCard from './ProviderUsageCard.vue'
import ProviderModels from './ProviderModels.vue'
import { useProviderSettings } from './useProviderSettings'
import { useProviderUsage } from './useProviderUsage'

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

onMounted(() => {
  providerSettings.initialize()
})

onUnmounted(() => {
  providerSettings.cleanup()
})

const expandedKey = ref<string | null>(null)
const SERVER_REDACTED_SECRET = '__onething_server_secret_set__'

function isRedactedServerSecret(value: unknown): boolean {
  return value === SERVER_REDACTED_SECRET
}

/**
 * One row per vendor: family members (API + subscription channels of the same
 * vendor) collapse into a single card at the first member's list position.
 * Routing, billing, and persistence still see two providers — the merge is
 * purely presentational (see @shared/provider-families.ts).
 */
interface ConnCard {
  key: string
  label: string
  iconId: string
  members: ProviderInfo[]
  family: ProviderFamily | null
}

const connCards = computed<ConnCard[]>(() => {
  const cards: ConnCard[] = []
  const seen = new Set<string>()
  for (const provider of props.providers) {
    if (seen.has(provider.id)) continue
    const family = providerFamilyOf(provider.id)
    if (family) {
      const members = [family.apiProviderId, family.subscriptionProviderId]
        .map(id => props.providers.find(p => p.id === id))
        .filter((p): p is ProviderInfo => Boolean(p))
      if (members.length > 1) {
        for (const member of members) seen.add(member.id)
        cards.push({
          key: family.id,
          label: family.label,
          iconId: family.apiProviderId,
          members,
          family,
        })
        continue
      }
    }
    seen.add(provider.id)
    cards.push({
      key: provider.id,
      label: provider.name,
      iconId: provider.id,
      members: [provider],
      family: null,
    })
  }
  return cards
})

function channelLabel(card: ConnCard, member: ProviderInfo): string {
  if (!card.family) return member.name
  return member.requiresOAuth ? card.family.subscriptionTag : 'API'
}

function isCardConnected(card: ConnCard): boolean {
  return card.members.some(member => isConnected(member.id))
}

function isCardEnabled(card: ConnCard): boolean {
  return card.members.some(member => providerSettings.isProviderEnabled(member.id))
}

function toggleCardEnabled(card: ConnCard) {
  providerSettings.setProvidersEnabled(
    card.members.map(member => member.id),
    !isCardEnabled(card),
  )
}

function cardSummary(card: ConnCard): string {
  if (!card.family) return connectionSummary(card.members[0].id)
  return card.members
    .map(member => `${channelLabel(card, member)} ${isConnected(member.id) ? '✓' : '—'}`)
    .join(' · ')
}

function isViewingMember(card: ConnCard): boolean {
  return card.members.some(member => member.id === providerSettings.viewingProvider.value)
}

function activeMember(card: ConnCard): ProviderInfo {
  return (
    card.members.find(member => member.id === providerSettings.viewingProvider.value) ??
    card.members[0]
  )
}

async function toggleCard(card: ConnCard) {
  if (expandedKey.value === card.key) {
    expandedKey.value = null
    return
  }
  const target =
    card.members.find(member => member.id === providerSettings.viewingProvider.value) ??
    card.members.find(member => isConnected(member.id)) ??
    card.members[0]
  await providerSettings.switchViewingProvider(target.id)
  expandedKey.value = card.key
}

async function switchChannel(memberId: string) {
  if (providerSettings.viewingProvider.value === memberId) return
  await providerSettings.switchViewingProvider(memberId)
}

/** Credential-free local agent providers (claude-code-agent, …): the CLI
 * carries its own login, so the card never asks for an API key. */
function isLocalAgentProvider(providerId: string): boolean {
  if (providerId === 'acp') return false
  const provider = props.providers.find(p => p.id === providerId)
  return Boolean(provider && provider.requiresApiKey === false && !provider.requiresOAuth)
}

function isConnected(providerId: string): boolean {
  const config = props.settings.ai.providers?.[providerId]
  const provider = props.providers.find(p => p.id === providerId)
  if (providerId === 'acp' || isLocalAgentProvider(providerId)) return true
  if (provider?.requiresOAuth) {
    return Boolean(config?.oauthToken) || (config?.selectedModels?.length ?? 0) > 0
  }
  if (config?.apiKey?.trim()) return true
  if (providerSettings.providerUsesEnvApiKey(providerId)) return true
  return Boolean(config?.baseUrl)
}

function connectionSummary(providerId: string): string {
  const config = props.settings.ai.providers?.[providerId]
  const provider = props.providers.find(p => p.id === providerId)
  const key = config?.apiKey?.trim()
  const envStatus = providerSettings.getProviderEnvStatus(providerId)
  const envVar = envStatus?.resolvedEnvVar
  const envPreview = envStatus?.keyPreview

  if (providerId === 'acp' || isLocalAgentProvider(providerId)) return 'Local agent'
  if (provider?.requiresOAuth) return 'Subscription · OAuth'
  if (isRedactedServerSecret(key)) return 'Key saved'
  if (providerSettings.providerUsesEnvApiKey(providerId)) {
    if (!envVar) return 'Env missing'
    return envPreview ? `Env ${envVar} · ${envPreview}` : `Env ${envVar}`
  }
  if (key) {
    const head = key.slice(0, Math.min(6, key.length))
    const tail = key.length > 10 ? key.slice(-4) : ''
    return tail ? `${head}••••${tail}` : `${head}••••`
  }
  if (config?.baseUrl) return 'Base URL set'
  return 'Not connected — expand to set up'
}

function providerApiKeyInputValue(providerId: string): string {
  const key = props.settings.ai.providers?.[providerId]?.apiKey || ''
  return isRedactedServerSecret(key) ? '' : key
}

function providerApiKeyPlaceholder(providerId: string, providerName: string): string {
  const key = props.settings.ai.providers?.[providerId]?.apiKey
  if (isRedactedServerSecret(key)) {
    return 'Existing key is saved on the server. Enter a new key to replace it.'
  }
  return `Enter ${providerName} key...`
}
</script>

<style scoped>
.conn-section {
  min-width: 0;
}

.section-header-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
}

.section-header-row .section-label {
  flex: 1;
  margin: 0;
}

/* Layout only — the settings :deep() layer draws .primary-action as an accent-outlined block. */
.primary-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font: inherit;
  cursor: pointer;
}

.conn-rows {
  border-top: 2px solid var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  min-width: 0;
}

.conn-row-block + .conn-row-block {
  border-top: 1px solid var(--settings-rule-soft, var(--ui-border-subtle-border, var(--border-subtle)));
}

.conn-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 54px;
  padding: 10px 2px;
  cursor: pointer;
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  transition: background var(--duration-fast) var(--ease-default);
}

.conn-row:hover {
  background: color-mix(in srgb, var(--settings-ink, var(--ui-text-primary-fg, var(--text))) 4%, transparent);
}

.conn-row:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--settings-ink, var(--ui-text-primary-fg, var(--text))) 24%, transparent);
  outline-offset: -2px;
}

.conn-icon-tile {
  position: relative;
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  color: var(--settings-ink-2, var(--ui-text-secondary-fg, var(--text-secondary)));
}

/* Status dot: hollow ring when off, filled dot when connected (paper halo masks the tile edge). */
.conn-status-dot {
  position: absolute;
  right: -4px;
  bottom: -4px;
  width: 8px;
  height: 8px;
  border: 1px solid var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  border-radius: 50%;
  background: var(--settings-paper, var(--ui-surface-app-bg, var(--bg)));
  box-shadow: 0 0 0 2px var(--settings-paper, var(--ui-surface-app-bg, var(--bg)));
}

.conn-status-dot.on {
  border-color: var(--ui-status-success-fg, var(--text-success, var(--color-success)));
  background: var(--ui-status-success-fg, var(--text-success, var(--color-success)));
}

.conn-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.conn-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.conn-name {
  overflow: hidden;
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  font-size: 13.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conn-pill {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  border-radius: 999px;
  background: transparent;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  line-height: 1.5;
  padding: 0 8px 1px;
  white-space: nowrap;
}

.conn-pill.green {
  border-color: var(--ui-status-success-border, var(--ui-status-success-fg, var(--text-success, var(--color-success))));
  color: var(--ui-status-success-fg, var(--text-success, var(--color-success)));
}

.conn-pill.red {
  border-color: var(--ui-status-danger-border, var(--ui-status-danger-fg, var(--color-danger, #b3403a)));
  color: var(--ui-status-danger-fg, var(--color-danger, #b3403a));
}

.conn-summary {
  overflow: hidden;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Row actions as text: mono rhythm, hover pulls an accent underline. */
.conn-action,
.mini-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: var(--settings-ink-3, var(--ui-text-muted-fg, var(--text-muted)));
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-default);
}

.conn-action:hover,
.mini-action:hover {
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
}

.conn-action:focus-visible,
.mini-action:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--settings-ink, var(--ui-text-primary-fg, var(--text))) 24%, transparent);
  outline-offset: 2px;
}

.conn-action-icon {
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  transition: transform var(--duration-fast) var(--ease-default);
}

.conn-action-icon.expanded {
  transform: rotate(180deg);
}

.conn-detail {
  padding: 12px 0 18px 16px;
  border-top: 1px dashed var(--settings-rule-soft, var(--ui-border-subtle-border, var(--border-subtle)));
}

/* Family channel switcher: mono text tabs on a hairline, active gets the accent underline. */
.channel-tabs {
  display: flex;
  gap: 20px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--settings-rule-soft, var(--ui-border-subtle-border, var(--border-subtle)));
}

.channel-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-bottom: -1px;
  padding: 2px 0 7px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--settings-ink-3, var(--ui-text-muted-fg, var(--text-muted)));
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-default), border-color var(--duration-fast) var(--ease-default);
}

.channel-tab:hover {
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
}

.channel-tab.active {
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  border-bottom-color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
}

.channel-tab:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--settings-ink, var(--ui-text-primary-fg, var(--text))) 24%, transparent);
  outline-offset: 2px;
}

.channel-tab-check {
  color: var(--ui-status-success-fg, var(--text-success, var(--color-success)));
}

.conn-detail-enter-active,
.conn-detail-leave-active {
  overflow: hidden;
  transition: opacity var(--duration-normal) var(--ease-default), max-height var(--duration-normal) var(--ease-default), transform var(--duration-normal) var(--ease-default);
}

.conn-detail-enter-from,
.conn-detail-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-6px);
}

.conn-detail-enter-to,
.conn-detail-leave-from {
  max-height: 2400px;
  opacity: 1;
  transform: translateY(0);
}

.oauth-config-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 14px;
}

/* .settings-group chrome (border/fill/radius) is zeroed by the settings :deep() layer. */
.settings-row {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) minmax(0, 2fr);
  align-items: center;
  gap: 24px;
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
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 1px 7px 2px;
  border: 1px solid var(--ui-status-success-border, var(--ui-status-success-fg, var(--text-success, var(--color-success))));
  border-radius: 999px;
  background: transparent;
  color: var(--ui-status-success-fg, var(--text-success, var(--color-success)));
  font-family: var(--font-mono, monospace);
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
  min-width: 0;
  padding: 0 10px;
  font: inherit;
  font-size: 13px;
}
/* Full-width note under the two selects it warns about. Deliberately NOT a
   settings-row: the row grid's control column inherits single-line ellipsis,
   which silently truncated this sentence mid-word. */
.row-note {
  overflow: visible;
  margin: 0;
  color: var(--settings-ink-3, var(--ui-text-secondary-fg));
  font-size: 12px;
  line-height: 1.5;
  text-overflow: clip;
  white-space: normal;
}

.acp-connection-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.row-note {
  min-width: 0;
  overflow: hidden;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-note.is-error {
  color: var(--ui-status-danger-fg, var(--color-danger, #b3403a));
}

.settings-row.compact-toggle-row {
  min-height: 44px;
  padding: 8px 0;
}

.row-input :deep(.app-input-control) {
  min-height: 32px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  border-radius: 0;
  background: transparent;
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  box-shadow: none;
}

.row-input :deep(.app-input-inner) {
  font-size: 13px;
  text-align: left;
}

.row-input.is-focused :deep(.app-input-control) {
  border-color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  box-shadow: none;
}

.row-input :deep(.app-input-inner::placeholder) {
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
}

/*
 * common/Switch (.app-switch) is shared with non-settings surfaces (SchedulerPanelContent),
 * so its pill visuals are overridden here instead of in Switch.vue.
 * Ledger toggle: dashed rail + hollow ring when off; solid accent rail + filled dot when on.
 */
:deep(.app-switch .app-switch-core) {
  border: 0;
  border-radius: 0;
  background: transparent;
}

:deep(.app-switch .app-switch-core)::after {
  content: '';
  position: absolute;
  left: 1px;
  right: 1px;
  top: 50%;
  height: 0;
  border-top: 1px dashed var(--settings-rule, var(--ui-border-default-border, var(--border)));
  transition: border-color var(--duration-fast) var(--ease-default);
}

:deep(.app-switch.is-checked .app-switch-core) {
  border: 0;
  background: transparent;
}

:deep(.app-switch.is-checked .app-switch-core)::after {
  border-top-style: solid;
  border-top-color: color-mix(in srgb, var(--settings-accent, var(--ui-accent-primary-fg, var(--accent))) 65%, transparent);
}

:deep(.app-switch .app-switch-action) {
  left: 1px;
  width: 10px;
  height: 10px;
  border: 1px solid var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  border-radius: 50%;
  background: var(--settings-paper, var(--ui-surface-app-bg, var(--bg)));
  box-shadow: none;
  overflow: hidden;
  z-index: 1;
}

:deep(.app-switch.is-checked .app-switch-action) {
  border-color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  background: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  color: var(--settings-paper, var(--ui-surface-app-bg, var(--bg)));
  transform: translate(calc(var(--app-switch-width) - 14px), -50%);
}

:deep(.app-switch .app-switch-core:focus-visible) {
  box-shadow: none;
  outline: 2px solid color-mix(in srgb, var(--settings-ink, var(--ui-text-primary-fg, var(--text))) 24%, transparent);
  outline-offset: 2px;
}
</style>
