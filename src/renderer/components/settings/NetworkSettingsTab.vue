<template>
  <div class="tab-content">
    <section class="settings-section">
      <h3 class="section-title">
        Network Proxy
      </h3>

      <div class="settings-card">
        <div class="card-row">
          <label class="toggle-row">
            <span>
              <span class="toggle-title">Enable global proxy</span>
              <span class="toggle-desc">Route AI requests, model refresh, web search, and login token requests through one proxy.</span>
            </span>
            <input
              type="checkbox"
              :checked="proxy.enabled"
              @change="updateProxy({ enabled: ($event.target as HTMLInputElement).checked })"
            >
          </label>
        </div>

        <div class="card-row">
          <div class="form-group">
            <label class="form-label">Proxy URL</label>
            <input
              class="form-input"
              :value="proxy.url"
              placeholder="http://127.0.0.1:7890 or socks5://127.0.0.1:7890"
              spellcheck="false"
              @input="updateProxy({ url: ($event.target as HTMLInputElement).value })"
            >
            <p class="form-hint">
              Supports http, https, and socks5 proxies. Authentication can be included in the URL.
            </p>
          </div>
        </div>

        <div class="card-row">
          <div class="form-group">
            <label class="form-label">Bypass Rules</label>
            <input
              class="form-input"
              :value="proxy.bypassRules || ''"
              placeholder="localhost;127.0.0.1;::1;*.local"
              spellcheck="false"
              @input="updateProxy({ bypassRules: ($event.target as HTMLInputElement).value })"
            >
            <p class="form-hint">
              Separate hosts with semicolons or commas. Add a host here, such as api.deepseek.com, when that service should use direct connection.
            </p>
          </div>
        </div>

        <div class="card-row">
          <button
            class="test-btn"
            type="button"
            :disabled="isTesting || !proxy.enabled"
            @click="testProxy"
          >
            {{ isTesting ? 'Testing...' : 'Test Proxy' }}
          </button>
          <span
            v-if="testMessage"
            :class="['test-result', testStatus]"
          >
            {{ testMessage }}
          </span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRaw } from 'vue'
import type { AppSettings, ProxySettings } from '@/types'

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
  color: var(--text-muted);
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

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.toggle-title {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.toggle-desc,
.form-hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-muted);
}

.form-group {
  margin: 0;
}

.form-label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.form-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--input-bg, var(--bg-primary));
  color: var(--text-primary);
  font-size: 13px;
}

.test-btn {
  padding: 7px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--button-bg, rgba(128, 128, 128, 0.08));
  color: var(--text-primary);
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
  color: var(--success, #22a06b);
}

.test-result.error {
  color: var(--danger, #d94848);
}
</style>
