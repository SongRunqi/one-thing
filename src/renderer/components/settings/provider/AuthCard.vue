<template>
  <div class="auth-card">
    <div class="auth-main">
      <div class="auth-icon">
        <ProviderIcon
          :provider="providerId"
          :size="18"
        />
      </div>
      <div class="auth-copy">
        <div class="auth-title-row">
          <span class="auth-title">{{ providerName }}</span>
          <span
            class="auth-state"
            :class="stateClass"
          >{{ stateLabel }}</span>
        </div>
        <div class="auth-subtitle">
          {{ subtitle }}
        </div>
      </div>
      <button
        v-if="oauthStatus.isLoggedIn"
        class="auth-button secondary"
        type="button"
        @click="$emit('logout')"
      >
        Disconnect
      </button>
      <button
        v-else
        class="auth-button"
        type="button"
        :disabled="isLoading"
        @click="$emit('start-login')"
      >
        {{ isLoading ? 'Connecting...' : `Login with ${providerName}` }}
      </button>
    </div>

    <div
      v-if="deviceFlowInfo"
      class="auth-panel"
    >
      <span class="panel-label">Device code</span>
      <a
        :href="deviceFlowInfo.verificationUri"
        target="_blank"
        class="panel-link"
      >
        {{ deviceFlowInfo.verificationUri }}
      </a>
      <span class="device-code">{{ deviceFlowInfo.userCode }}</span>
      <span class="panel-hint">Waiting for authorization...</span>
    </div>

    <div
      v-if="codeEntryInfo"
      class="auth-panel"
    >
      <span class="panel-hint">{{ codeEntryInfo.instructions }}</span>
      <div class="code-entry-form">
        <input
          :value="manualCode"
          type="text"
          class="code-input"
          placeholder="Paste authorization code here..."
          @input="$emit('update:manualCode', ($event.target as HTMLInputElement).value)"
          @keydown.enter="$emit('submit-code')"
        >
        <button
          class="auth-button"
          type="button"
          :disabled="!manualCode.trim() || isSubmittingCode"
          @click="$emit('submit-code')"
        >
          {{ isSubmittingCode ? 'Verifying...' : 'Submit' }}
        </button>
      </div>
      <span
        v-if="codeEntryError"
        class="auth-error"
      >
        {{ codeEntryError }}
      </span>
    </div>

    <div
      v-if="oauthStatus.lastError && !codeEntryError"
      class="auth-error"
    >
      {{ oauthStatus.lastError }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ProviderIcon from '../ProviderIcon.vue'
import type { OAuthStatus, DeviceFlowInfo, CodeEntryInfo } from './useProviderAuth'

const props = defineProps<{
  providerId: string
  providerName: string
  oauthStatus: OAuthStatus
  isLoading: boolean
  deviceFlowInfo: DeviceFlowInfo | null
  codeEntryInfo: CodeEntryInfo | null
  manualCode: string
  isSubmittingCode: boolean
  codeEntryError: string
}>()

defineEmits<{
  (e: 'start-login'): void
  (e: 'logout'): void
  (e: 'update:manualCode', value: string): void
  (e: 'submit-code'): void
}>()

const stateLabel = computed(() => {
  if (props.oauthStatus.isLoggedIn) return 'Connected'
  if (props.oauthStatus.isExpired) return 'Expired'
  if (props.isLoading) return 'Connecting'
  return 'Signed out'
})

const stateClass = computed(() => {
  if (props.oauthStatus.isLoggedIn) return 'connected'
  if (props.oauthStatus.isExpired || props.oauthStatus.lastError) return 'error'
  if (props.isLoading) return 'pending'
  return 'idle'
})

const subtitle = computed(() => {
  const account = props.oauthStatus.account
  if (props.oauthStatus.isLoggedIn && account) {
    const identity = account.email || account.id || 'Subscription account'
    return account.planType ? `${identity} · ${account.planType}` : identity
  }
  if (props.deviceFlowInfo) return 'Open the verification page and enter the code below.'
  if (props.codeEntryInfo) return 'Complete authorization in your browser, then paste the code.'
  if (props.oauthStatus.isExpired) return 'Reconnect to refresh this subscription login.'
  return 'Connect a subscription account for this provider.'
})
</script>

<style scoped>
.auth-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  border-radius: 8px;
  background: var(--settings-paper, var(--ui-surface-app-bg, var(--bg)));
}

.auth-main {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.auth-icon {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  border-radius: 8px;
  background: var(--settings-paper-2, var(--ui-surface-sidebar-bg, var(--panel-2)));
  color: var(--settings-ink-2, var(--ui-text-secondary-fg, var(--text-secondary)));
}

.auth-copy {
  min-width: 0;
}

.auth-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.auth-title {
  font-size: 14px;
  font-weight: 620;
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
}

.auth-state {
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 11px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  color: var(--settings-ink-3, var(--ui-text-secondary-fg, var(--text-secondary)));
}

.auth-state.connected {
  color: var(--ui-status-success-fg, var(--text-success, var(--color-success)));
}

.auth-state.error {
  color: var(--ui-status-danger-fg, var(--text-error, var(--color-error)));
}

.auth-state.pending {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.auth-subtitle,
.panel-hint,
.panel-label {
  margin-top: 3px;
  font-size: 12px;
  color: var(--settings-ink-3, var(--ui-text-secondary-fg, var(--text-secondary)));
  overflow-wrap: anywhere;
}

.auth-button {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  border-radius: 7px;
  background: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  color: var(--settings-paper, var(--ui-surface-app-bg, var(--bg)));
  font: inherit;
  font-size: 13px;
  font-weight: 560;
  cursor: pointer;
}

.auth-button.secondary {
  background: transparent;
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
}

.auth-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.auth-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--settings-rule-soft, var(--ui-border-subtle-border, var(--border-subtle)));
  border-radius: 8px;
  background: var(--settings-paper-2, var(--ui-surface-sidebar-bg, var(--panel-2)));
}

.panel-link {
  font-size: 12px;
  color: var(--ui-accent-primary-fg, var(--accent));
  overflow-wrap: anywhere;
}

.device-code {
  align-self: flex-start;
  padding: 7px 10px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  border-radius: 7px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 18px;
  letter-spacing: 0;
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  background: var(--settings-paper, var(--ui-surface-app-bg, var(--bg)));
}

.code-entry-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.code-input {
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  border-radius: 7px;
  background: var(--settings-paper, var(--ui-surface-app-bg, var(--bg)));
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  font: inherit;
  font-size: 13px;
}

.auth-error {
  font-size: 12px;
  color: var(--ui-status-danger-fg, var(--text-error, var(--color-error)));
  overflow-wrap: anywhere;
}
</style>

