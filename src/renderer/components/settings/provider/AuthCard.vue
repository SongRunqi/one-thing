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
      <Button
        v-if="oauthStatus.isLoggedIn"
        unstyled
        class="auth-button secondary"
        native-type="button"
        @click="$emit('logout')"
      >
        Disconnect
      </Button>
      <Button
        v-else
        unstyled
        class="auth-button"
        native-type="button"
        :disabled="isLoading"
        @click="$emit('start-login')"
      >
        {{ isLoading ? 'Connecting...' : `Login with ${providerName}` }}
      </Button>
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
        <Button
          unstyled
          class="auth-button"
          native-type="button"
          :disabled="!manualCode.trim() || isSubmittingCode"
          @click="$emit('submit-code')"
        >
          {{ isSubmittingCode ? 'Verifying...' : 'Submit' }}
        </Button>
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
import Button from '@/components/common/Button.vue'
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
/* Auth ledger: no card chrome — hairlines carry the structure. */
.auth-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0;
  border: 0;
  background: transparent;
  min-width: 0;
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
  background: transparent;
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

/* Status badge: outlined ring, transparent fill, state lives in the line + ink color. */
.auth-state {
  padding: 1px 7px 2px;
  border-radius: 999px;
  background: transparent;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  color: var(--settings-ink-3, var(--ui-text-secondary-fg, var(--text-secondary)));
}

.auth-state.connected {
  border-color: var(--ui-status-success-border, var(--ui-status-success-fg, var(--text-success, var(--color-success))));
  color: var(--ui-status-success-fg, var(--text-success, var(--color-success)));
}

.auth-state.error {
  border-color: var(--ui-status-danger-border, var(--ui-status-danger-fg, var(--text-error, var(--color-error))));
  color: var(--ui-status-danger-fg, var(--text-error, var(--color-error)));
}

.auth-state.pending {
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 65%, transparent);
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

/* Primary action: accent line + accent ink, never a filled block. */
.auth-button {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  border-radius: 0;
  background: transparent;
  color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  font: inherit;
  font-size: 13px;
  font-weight: 560;
  cursor: pointer;
  transition: box-shadow 0.12s ease;
}

.auth-button:hover:not(:disabled) {
  box-shadow: inset 0 -2px 0 var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
}

.auth-button.secondary {
  border-color: var(--settings-rule, var(--ui-border-default-border, var(--border)));
  background: transparent;
  color: var(--settings-ink-2, var(--ui-text-secondary-fg, var(--text-secondary)));
}

.auth-button.secondary:hover:not(:disabled) {
  border-color: var(--settings-ink-3, var(--ui-text-muted-fg, var(--text-muted)));
  box-shadow: none;
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
}

.auth-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* Sub-panel held by a left rule, no filled block. */
.auth-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0 4px 10px;
  border: 0;
  border-left: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  background: transparent;
  min-width: 0;
}

.panel-link {
  font-size: 12px;
  color: var(--ui-accent-primary-fg, var(--accent));
  overflow-wrap: anywhere;
}

.device-code {
  align-self: flex-start;
  max-width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 18px;
  letter-spacing: 0;
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  background: transparent;
  overflow-wrap: anywhere;
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
  border-radius: 0;
  background: transparent;
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  font: inherit;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: border-color 0.12s ease;
}

.code-input:focus {
  outline: none;
  border-color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
}

.code-input::placeholder {
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
}

.auth-error {
  padding: 2px 0 2px 8px;
  border-left: 2px solid var(--ui-status-danger-fg, var(--text-error, var(--color-error)));
  font-size: 12px;
  color: var(--ui-status-danger-fg, var(--text-error, var(--color-error)));
  overflow-wrap: anywhere;
}
</style>

