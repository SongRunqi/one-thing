<template>
  <div class="tab-content">
    <SettingsSection
      title="Channels"
      description="Connect IM channels to onething sessions."
    >
      <SettingsGroup>
        <SettingRow
          label="WeChat"
          description="Incoming WeChat messages are routed through the normal onething session runtime."
        >
          <label class="native-toggle">
            <input
              type="checkbox"
              :checked="wechatEnabled"
              @change="setWechatEnabled(checked($event))"
            >
          </label>
        </SettingRow>

        <SettingRow
          layout="stack"
          label="Runtime"
          :description="runtimeDescription"
        >
          <div class="channel-status">
            <span
              class="status-pill"
              :class="statusTone"
            >
              {{ statusLabel }}
            </span>
            <span
              v-if="status?.wechat.accountId"
              class="account-label"
            >
              {{ status.wechat.accountId }}
            </span>
          </div>

          <div class="channel-actions">
            <Button
              unstyled
              class="channel-action primary"
              native-type="button"
              :disabled="isStarting || isRunning"
              @click="startWechat"
            >
              <Play class="action-icon" />
              <span>{{ isStarting ? 'Starting' : 'Start' }}</span>
            </Button>
            <Button
              unstyled
              class="channel-action"
              native-type="button"
              :disabled="!isRunning && !isStarting"
              @click="stopGateway"
            >
              <Power class="action-icon" />
              <span>Stop</span>
            </Button>
            <Button
              unstyled
              class="channel-action"
              native-type="button"
              :disabled="isBusy"
              @click="logoutWechat"
            >
              <LogOut class="action-icon" />
              <span>Re-scan</span>
            </Button>
            <Button
              unstyled
              class="icon-action"
              native-type="button"
              :disabled="isBusy"
              title="Refresh status"
              @click="loadStatus"
            >
              <RefreshCw class="action-icon" />
            </Button>
          </div>

          <p
            v-if="statusMessage"
            class="channel-message"
            :class="{ error: Boolean(status?.wechat.lastError || status?.lastError) }"
          >
            {{ statusMessage }}
          </p>
        </SettingRow>

        <SettingRow
          v-if="qrUrl"
          layout="stack"
          label="WeChat login"
          description="Scan the iLink login code with WeChat."
        >
          <div class="qr-login-row">
            <div class="qr-code-box">
              <img
                v-if="qrDataUrl"
                class="qr-code-image"
                :src="qrDataUrl"
                alt="WeChat login QR code"
              >
              <RefreshCw
                v-else
                class="qr-code-placeholder"
              />
            </div>
            <div class="qr-url-row">
              <input
                class="form-input qr-url-input"
                readonly
                :value="qrUrl"
              >
              <Button
                unstyled
                class="icon-action"
                native-type="button"
                title="Copy login URL"
                @click="copyQrUrl"
              >
                <Copy class="action-icon" />
              </Button>
              <Button
                unstyled
                class="icon-action"
                native-type="button"
                title="Open login URL"
                @click="openQrUrl"
              >
                <ExternalLink class="action-icon" />
              </Button>
            </div>
          </div>
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>

    <SettingsSection
      title="Sessions"
      description="Gateway chats use stable session IDs and appear with the rest of your chat history."
    >
      <SettingsGroup>
        <SettingRow
          label="Session name"
          description="New WeChat contacts are created as WeChat - user_id in the normal session list."
        >
          <span class="session-pattern">gateway:wechat:*</span>
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Copy,
  ExternalLink,
  LogOut,
  Play,
  Power,
  RefreshCw,
} from 'lucide-vue-next'
import { toDataURL } from 'qrcode'
import type { AppSettings, GatewayStatus } from '@/types'
import {
  SettingRow,
  SettingsGroup,
  SettingsSection,
} from './settings-primitives'
import { platformApi } from '@/platform'

const props = defineProps<{
  settings: AppSettings
}>()

const emit = defineEmits<{
  'update:settings': [settings: AppSettings]
}>()

const status = ref<GatewayStatus | null>(null)
const isBusy = ref(false)
const transientMessage = ref('')
const qrDataUrl = ref('')
let refreshTimer: ReturnType<typeof setInterval> | undefined
let qrRenderId = 0

const wechatEnabled = computed(() => props.settings.channels?.wechat?.enabled === true)
const isStarting = computed(() => status.value?.starting === true)
const isRunning = computed(() => status.value?.wechat.running === true || status.value?.running === true)
const qrUrl = computed(() => status.value?.wechat.qrUrl || '')

const statusLabel = computed(() => {
  const current = status.value
  if (!current) return wechatEnabled.value ? 'Unknown' : 'Off'
  if (current.wechat.lastError || current.lastError) return 'Error'
  if (current.starting && current.wechat.loginStatus === 'waiting-for-scan') return 'Waiting for scan'
  if (current.starting) return 'Starting'
  if (current.wechat.running) return current.wechat.loggedIn ? 'Running' : 'Waiting for login'
  if (current.wechat.loggedIn) return current.wechat.running ? 'Running' : 'Logged in'
  if (!wechatEnabled.value) return 'Off'
  if (current.wechat.loginStatus === 'expired') return 'Expired'
  if (current.wechat.loginStatus === 'scanned') return 'Scanned'
  return 'Idle'
})

const statusTone = computed(() => {
  if (status.value?.wechat.lastError || status.value?.lastError) return 'error'
  if (status.value?.wechat.loggedIn || status.value?.wechat.running) return 'success'
  if (status.value?.starting || qrUrl.value) return 'pending'
  if (!wechatEnabled.value) return 'muted'
  return 'muted'
})

const runtimeDescription = computed(() => {
  if (status.value?.wechat.running) return 'WeChat is running inside the Electron gateway runtime.'
  if (!wechatEnabled.value) return 'Start will enable WeChat and request a login URL.'
  if (qrUrl.value) return 'Scan or open the current iLink login URL.'
  if (status.value?.wechat.loggedIn) return 'WeChat login is available for incoming messages.'
  return 'Start the runtime to request a WeChat login URL.'
})

const statusMessage = computed(() => {
  if (transientMessage.value) return transientMessage.value
  const error = status.value?.wechat.lastError || status.value?.lastError
  if (error) return error
  if (qrUrl.value) return 'A login URL is ready.'
  return ''
})

watch(qrUrl, async value => {
  const renderId = ++qrRenderId
  qrDataUrl.value = ''
  if (!value) return

  try {
    const dataUrl = await toDataURL(value, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 208,
      color: {
        dark: 'black',
        light: 'white',
      },
    })
    if (renderId === qrRenderId) qrDataUrl.value = dataUrl
  } catch (error) {
    console.error('[ChannelsSettings] Failed to render WeChat QR code:', error)
  }
})

onMounted(() => {
  void loadStatus()
  refreshTimer = setInterval(() => {
    void loadStatus()
  }, 2_000)
})

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})

function checked(event: Event): boolean {
  return (event.target as HTMLInputElement).checked
}

function setWechatEnabled(enabled: boolean): void {
  emit('update:settings', {
    ...props.settings,
    channels: {
      ...props.settings.channels,
      wechat: {
        ...props.settings.channels?.wechat,
        enabled,
      },
    },
  })
}

async function loadStatus(): Promise<void> {
  const response = await platformApi.gatewayGetStatus()
  if (response.success && response.status) {
    status.value = response.status
  }
}

async function startWechat(): Promise<void> {
  if (!wechatEnabled.value) {
    setWechatEnabled(true)
  }
  await runGatewayAction(async () => platformApi.gatewayStart({ channel: 'wechat' }))
}

async function stopGateway(): Promise<void> {
  await runGatewayAction(async () => platformApi.gatewayStop())
}

async function logoutWechat(): Promise<void> {
  await runGatewayAction(async () => platformApi.gatewayWechatLogout())
}

async function runGatewayAction(
  action: () => Promise<{ success: boolean; status?: GatewayStatus; error?: string }>,
): Promise<void> {
  isBusy.value = true
  transientMessage.value = ''
  try {
    const response = await action()
    if (response.status) status.value = response.status
    if (!response.success) transientMessage.value = response.error || 'Gateway request failed.'
  } finally {
    isBusy.value = false
  }
}

async function copyQrUrl(): Promise<void> {
  if (!qrUrl.value) return
  const result = await platformApi.writeClipboardText(qrUrl.value)
  if (!result.success) {
    transientMessage.value = result.error || 'Failed to copy login URL.'
    return
  }
  transientMessage.value = 'Login URL copied.'
  setTimeout(() => {
    if (transientMessage.value === 'Login URL copied.') transientMessage.value = ''
  }, 1500)
}

async function openQrUrl(): Promise<void> {
  if (!qrUrl.value) return
  const result = await platformApi.openExternal(qrUrl.value)
  if (!result.success) {
    transientMessage.value = 'Failed to open login URL.'
  }
}
</script>

<style scoped>
.channel-status {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 9px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 999px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-size: var(--type-meta-size);
  line-height: 1;
  white-space: nowrap;
}

.status-pill.success {
  border-color: var(--ui-status-success-border, var(--ui-border-default-border, var(--border)));
  color: var(--ui-status-success-fg, var(--ui-text-primary-fg, var(--text-primary)));
}

.status-pill.pending {
  border-color: var(--ui-status-warning-border, var(--ui-border-default-border, var(--border)));
  color: var(--ui-status-warning-fg, var(--ui-text-primary-fg, var(--text-primary)));
}

.status-pill.error {
  border-color: var(--ui-status-danger-border, var(--ui-border-default-border, var(--border)));
  color: var(--ui-status-danger-fg, var(--ui-text-primary-fg, var(--text-primary)));
}

.account-label {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-size: var(--type-meta-size);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.channel-actions,
.qr-login-row,
.qr-url-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.qr-login-row {
  align-items: flex-start;
}

.channel-actions {
  flex-wrap: wrap;
}

.channel-action,
.icon-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 30px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 7px;
  color: var(--ui-text-primary-fg, var(--text-primary));
  background: var(--ui-surface-muted-bg, var(--bg-secondary));
  font-size: var(--type-meta-size);
}

.channel-action {
  padding: 0 10px;
}

.channel-action.primary {
  border-color: var(--ui-action-primary-border, var(--ui-border-selected-border, var(--border)));
  color: var(--ui-action-primary-bg, var(--ui-accent-primary-fg, var(--accent)));
}

.icon-action {
  width: 32px;
  padding: 0;
}

.channel-action:disabled,
.icon-action:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.action-icon {
  width: 15px;
  height: 15px;
}

.channel-message {
  margin: 0;
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-size: var(--type-meta-size);
}

.channel-message.error {
  color: var(--ui-status-danger-fg, var(--ui-text-primary-fg, var(--text-primary)));
}

.qr-code-box {
  display: grid;
  flex: 0 0 auto;
  width: 128px;
  height: 128px;
  place-items: center;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
}

.qr-code-image {
  width: 112px;
  height: 112px;
  object-fit: contain;
}

.qr-code-placeholder {
  width: 28px;
  height: 28px;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.qr-url-row {
  flex: 1 1 auto;
}

.qr-url-input {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
}

.session-pattern {
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-family: var(--font-mono, monospace);
  font-size: 12px;
}

@media (max-width: 720px) {
  .qr-login-row {
    flex-direction: column;
  }

  .qr-url-row {
    align-items: stretch;
    flex-wrap: wrap;
    width: 100%;
  }

  .qr-url-input {
    flex-basis: 100%;
  }
}
</style>
