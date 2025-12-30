<template>
  <div class="oauth-section">
    <template v-if="!oauthStatus.isLoggedIn">
      <button class="oauth-login-btn" @click="$emit('start-login')" :disabled="isLoading">
        <ProviderIcon :provider="providerId" :size="18" />
        <span>{{ isLoading ? 'Connecting...' : `Login with ${providerName}` }}</span>
      </button>

      <!-- Device Flow Code Display (for GitHub Copilot) -->
      <div v-if="deviceFlowInfo" class="device-flow-info">
        <p>Enter this code at:</p>
        <a :href="deviceFlowInfo.verificationUri" target="_blank" class="device-flow-link">
          {{ deviceFlowInfo.verificationUri }}
        </a>
        <div class="device-code">{{ deviceFlowInfo.userCode }}</div>
        <p class="device-flow-hint">Waiting for authorization...</p>
      </div>

      <!-- Manual Code Entry (for Claude Code) -->
      <div v-if="codeEntryInfo" class="code-entry-info">
        <p>{{ codeEntryInfo.instructions }}</p>
        <div class="code-entry-form">
          <input
            :value="manualCode"
            type="text"
            class="form-input code-input"
            placeholder="Paste authorization code here..."
            @input="$emit('update:manualCode', ($event.target as HTMLInputElement).value)"
            @keydown.enter="$emit('submit-code')"
          />
          <button
            class="submit-code-btn"
            @click="$emit('submit-code')"
            :disabled="!manualCode.trim() || isSubmittingCode"
          >
            {{ isSubmittingCode ? 'Verifying...' : 'Submit' }}
          </button>
        </div>
        <p v-if="codeEntryError" class="code-entry-error">{{ codeEntryError }}</p>
      </div>
    </template>

    <template v-else>
      <div class="oauth-logged-in">
        <div class="oauth-status">
          <svg class="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          <span>Connected to {{ providerName }}</span>
        </div>
        <button class="oauth-logout-btn" @click="$emit('logout')">
          Disconnect
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import ProviderIcon from '../ProviderIcon.vue'
import type { OAuthStatus, DeviceFlowInfo, CodeEntryInfo } from './useProviderSettings'

interface Props {
  providerId: string
  providerName: string
  oauthStatus: OAuthStatus
  isLoading: boolean
  deviceFlowInfo: DeviceFlowInfo | null
  codeEntryInfo: CodeEntryInfo | null
  manualCode: string
  isSubmittingCode: boolean
  codeEntryError: string
}

interface Emits {
  (e: 'start-login'): void
  (e: 'logout'): void
  (e: 'update:manualCode', value: string): void
  (e: 'submit-code'): void
}

defineProps<Props>()
defineEmits<Emits>()
</script>

<style scoped>
/* OAuth Section */
.oauth-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.oauth-login-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--hover);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.oauth-login-btn:hover:not(:disabled) {
  border-color: var(--accent);
  background: rgba(59, 130, 246, 0.1);
}

.oauth-login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.device-flow-info,
.code-entry-info {
  padding: 16px;
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: 8px;
  text-align: center;
}

.device-flow-info p,
.code-entry-info p {
  margin: 0 0 8px 0;
  font-size: 13px;
  color: var(--text-muted);
}

.device-flow-link {
  color: var(--accent);
  text-decoration: none;
  font-size: 13px;
}

.device-flow-link:hover {
  text-decoration: underline;
}

.device-code {
  margin: 12px 0;
  padding: 12px 20px;
  background: var(--bg-elevated);
  border-radius: 6px;
  font-size: 20px;
  font-weight: 700;
  font-family: monospace;
  letter-spacing: 0.1em;
  color: var(--accent);
}

.device-flow-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin: 0;
}

.code-entry-form {
  display: flex;
  gap: 8px;
  margin-top: 12px;
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

.code-entry-form .code-input {
  flex: 1;
  font-family: monospace;
  text-align: center;
}

.submit-code-btn {
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.submit-code-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.submit-code-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.code-entry-error {
  margin-top: 8px;
  padding: 8px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 4px;
  color: #ef4444;
  font-size: 12px;
}

.oauth-logged-in {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.2);
  border-radius: 8px;
}

.oauth-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #22c55e;
}

.check-icon {
  color: #22c55e;
}

.oauth-logout-btn {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.oauth-logout-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}
</style>
