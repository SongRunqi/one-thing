<template>
  <div class="tab-content">
    <SettingsSection
      title="Network Proxy"
      description="Route outbound app traffic through a shared proxy when needed."
    >
      <SettingsGroup>
        <SettingRow
          label="Enable global proxy"
          description="Route AI requests, model refresh, web search, and login token requests through one proxy."
        >
          <label class="native-toggle">
            <input
              type="checkbox"
              :checked="proxy.enabled"
              @change="updateProxy({ enabled: ($event.target as HTMLInputElement).checked })"
            >
          </label>
        </SettingRow>

        <SettingRow
          label="Proxy URL"
          description="Supports http, https, and socks5 proxies. Authentication can be included in the URL."
        >
          <input
            class="form-input"
            :value="proxy.url"
            placeholder="http://127.0.0.1:7890 or socks5://127.0.0.1:7890"
            spellcheck="false"
            @input="updateProxy({ url: ($event.target as HTMLInputElement).value })"
          >
        </SettingRow>

        <SettingRow
          label="Bypass Rules"
          description="Separate hosts with semicolons or commas. Add a host here when that service should use direct connection."
        >
          <input
            class="form-input"
            :value="proxy.bypassRules || ''"
            placeholder="localhost;127.0.0.1;::1;*.local"
            spellcheck="false"
            @input="updateProxy({ bypassRules: ($event.target as HTMLInputElement).value })"
          >
        </SettingRow>

        <SettingRow>
          <Button
            unstyled
            class="test-btn"
            native-type="button"
            :disabled="isTesting || !proxy.enabled"
            @click="testProxy"
          >
            {{ isTesting ? 'Testing...' : 'Test Proxy' }}
          </Button>
          <span
            v-if="testMessage"
            :class="['test-result', testStatus]"
          >
            {{ testMessage }}
          </span>
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { computed, ref, toRaw } from 'vue'
import type { AppSettings, ProxySettings } from '@/types'
import {
  SettingRow,
  SettingsGroup,
  SettingsSection,
} from './settings-primitives'

const props = defineProps<{
  settings: AppSettings
}>()

const emit = defineEmits<{
  'update:settings': [settings: AppSettings]
}>()

const isTesting = ref(false)
const testMessage = ref('')
const testStatus = ref<'success' | 'error'>('success')

const proxy = computed<ProxySettings>(() => props.settings.network?.proxy ?? {
  enabled: false,
  url: '',
  bypassRules: 'localhost;127.0.0.1;::1;*.local',
})

function updateProxy(updates: Partial<ProxySettings>) {
  testMessage.value = ''
  emit('update:settings', {
    ...props.settings,
    network: {
      ...props.settings.network,
      proxy: {
        ...proxy.value,
        ...updates,
      },
    },
  })
}

async function testProxy() {
  isTesting.value = true
  testMessage.value = ''
  try {
    const plainProxy = JSON.parse(JSON.stringify(toRaw(proxy.value))) as ProxySettings
    const response = await window.electronAPI.testProxy(plainProxy)
    if (response.success) {
      testStatus.value = 'success'
      testMessage.value = 'Proxy connection succeeded.'
    } else {
      testStatus.value = 'error'
      testMessage.value = response.error || 'Proxy connection failed.'
    }
  } catch (error: any) {
    testStatus.value = 'error'
    testMessage.value = error.message || 'Proxy connection failed.'
  } finally {
    isTesting.value = false
  }
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

.section-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--ui-text-muted-fg, var(--text-muted));
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 0 0 12px 0;
  opacity: 0.8;
}

.settings-card {
  background: rgba(128, 128, 128, 0.06);
  border-radius: 10px;
  overflow: hidden;
}

.card-row {
  padding: 12px 14px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.08);
}

.card-row:last-child {
  border-bottom: none;
}

.form-hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.native-toggle input {
  width: 16px;
  height: 16px;
  accent-color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
}

.form-group {
  margin: 0;
}

.form-label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.form-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 6px;
  background: var(--ui-surface-input-bg, var(--input-bg, var(--bg-primary)));
  color: var(--ui-text-primary-fg, var(--text-primary));
  font-size: 13px;
}

.form-hint.error {
  color: var(--ui-status-danger-fg, var(--danger, #d94848));
}

.test-btn {
  padding: 7px 12px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 6px;
  background: var(--ui-action-secondary-bg, var(--button-bg, rgba(128, 128, 128, 0.08)));
  color: var(--ui-text-primary-fg, var(--text-primary));
  font-size: 13px;
  cursor: pointer;
}

.test-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.test-result {
  margin-left: 10px;
  font-size: 12px;
}

.test-result.success {
  color: var(--ui-status-success-fg, var(--success, #22a06b));
}

.test-result.error {
  color: var(--ui-status-danger-fg, var(--danger, #d94848));
}
</style>
