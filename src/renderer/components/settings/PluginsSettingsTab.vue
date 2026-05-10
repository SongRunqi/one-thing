<template>
  <div class="tab-content">
    <section class="settings-section">
      <h3 class="section-title">
        Installed Plugins
      </h3>
      <p class="section-desc">
        Plugins extend onething with custom tools, commands, and event handlers.
        Plugins live in <code>~/.onething/plugins/</code>
      </p>

      <!-- Loading -->
      <div
        v-if="loading"
        class="loading-row"
      >
        <div class="spinner" />
        <span>Loading plugins...</span>
      </div>

      <!-- Error -->
      <div
        v-else-if="error"
        class="error-state"
      >
        <span>{{ error }}</span>
        <button
          class="btn-sm"
          @click="loadPlugins"
        >
          Retry
        </button>
      </div>

      <!-- Empty -->
      <div
        v-else-if="plugins.length === 0"
        class="empty-state"
      >
        <p>No plugins installed.</p>
        <p class="hint">
          Create a plugin in <code>~/.onething/plugins/&lt;name&gt;/plugin-entry.js</code>
          or symlink <code>sample-plugins/</code> directories, then click <strong>Refresh</strong>.
        </p>
        <button
          class="btn-sm"
          @click="refreshPlugins"
        >
          🔄 Refresh
        </button>
      </div>

      <!-- Plugin list -->
      <div
        v-else
        class="settings-card plugin-list"
      >
        <div class="plugin-list-header">
          <span class="plugin-count">{{ plugins.length }} plugin{{ plugins.length > 1 ? 's' : '' }}</span>
          <button
            class="btn-sm refresh-btn"
            @click="refreshPlugins"
          >
            🔄 Refresh
          </button>
        </div>
        <div
          v-for="plugin in plugins"
          :key="plugin.id"
          class="plugin-item"
          :class="{ disabled: !plugin.enabled }"
        >
          <div class="plugin-body">
            <div class="plugin-header">
              <div class="plugin-name-row">
                <span class="plugin-name">{{ plugin.name }}</span>
                <span class="plugin-version">v{{ plugin.version }}</span>
                <span
                  class="status-badge"
                  :class="plugin.loaded ? 'loaded' : plugin.error ? 'error' : 'stopped'"
                >
                  {{ plugin.loaded ? 'Active' : plugin.error ? 'Error' : 'Disabled' }}
                </span>
              </div>
              <p
                v-if="plugin.description"
                class="plugin-desc"
              >
                {{ plugin.description }}
              </p>
              <p
                v-if="plugin.error"
                class="plugin-error"
              >
                {{ plugin.error }}
              </p>
              <div class="plugin-meta">
                <span
                  v-if="plugin.author"
                  class="meta-tag"
                >by {{ plugin.author }}</span>
                <span
                  v-if="plugin.source === 'builtin'"
                  class="meta-tag builtin"
                >Built-in</span>
                <span
                  v-if="plugin.needsInstall"
                  class="meta-tag needs-install"
                >⚠️ npm install needed</span>
                <span
                  v-if="plugin.commands.length"
                  class="meta-tag"
                >
                  {{ plugin.commands.length }} command{{ plugin.commands.length > 1 ? 's' : '' }}
                  <span class="cmd-list">({{ plugin.commands.join(', ') }})</span>
                </span>
                <span
                  class="meta-tag path"
                  :title="plugin.dirPath"
                >{{ plugin.id }}</span>
              </div>
            </div>
          </div>

          <div class="plugin-toggle">
            <label
              class="toggle"
              :title="plugin.enabled ? 'Disable plugin' : 'Enable plugin'"
            >
              <input
                type="checkbox"
                :checked="plugin.enabled"
                @change="togglePlugin(plugin)"
              >
              <span class="toggle-slider" />
            </label>
          </div>
        </div>
      </div>
    </section>

    <!-- How to install -->
    <section class="settings-section">
      <h3 class="section-title">
        How to Install
      </h3>
      <div class="settings-card">
        <div class="card-row">
          <ol class="install-steps">
            <li>Copy the plugin folder to <code>~/.onething/plugins/</code></li>
            <li>Open this settings page and click <strong>🔄 Refresh</strong></li>
            <li>If the plugin has a <code>package.json</code>, dependencies are auto-installed on first load</li>
          </ol>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface PluginInfo {
  id: string
  source?: 'builtin' | 'user'
  name: string
  version: string
  description: string
  author: string
  loaded: boolean
  enabled: boolean
  commands: string[]
  error: string
  dirPath: string
  needsInstall: boolean
}

const plugins = ref<PluginInfo[]>([])
const loading = ref(true)
const error = ref('')

const samplePluginsPath = ref('~/data/code/start-electron')

const emit = defineEmits<{
  'plugins-changed': []
}>()

async function loadPlugins() {
  loading.value = true
  error.value = ''
  try {
    const result = await window.electronAPI.getPlugins()
    if (result?.success) {
      plugins.value = result.plugins || []
    } else {
      error.value = result?.error || 'Failed to load plugins'
    }
  } catch (e: any) {
    error.value = e.message || 'Unknown error'
  } finally {
    loading.value = false
  }
}

async function togglePlugin(plugin: PluginInfo) {
  const wasEnabled = plugin.enabled
  try {
    if (wasEnabled) {
      const result = await window.electronAPI.disablePlugin(plugin.id)
      if (result?.success) {
        plugin.enabled = false
        plugin.loaded = false
        plugin.commands = []
        plugin.error = ''
        emit('plugins-changed')
      } else {
        console.error('Failed to disable plugin:', result?.error)
      }
    } else {
      const result = await window.electronAPI.enablePlugin(plugin.id)
      if (result?.success) {
        plugin.enabled = true
        // Reload list to get updated state
        await loadPlugins()
        emit('plugins-changed')
      } else {
        console.error('Failed to enable plugin:', result?.error)
      }
    }
  } catch (e: any) {
    console.error('Toggle plugin error:', e)
  }
}

async function refreshPlugins() {
  try {
    const result = await window.electronAPI.refreshPlugins()
    if (!result?.success) {
      console.error('Failed to refresh plugins:', result?.error)
    }
  } catch (e: any) {
    console.error('Refresh plugins error:', e)
  }
  await loadPlugins()
  emit('plugins-changed')
}

onMounted(() => {
  loadPlugins()
})
</script>

<style scoped>
.tab-content {
  max-width: 720px;
}

.settings-section {
  margin-bottom: 28px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 4px;
}

.section-desc {
  font-size: 12px;
  color: var(--text-secondary, var(--muted));
  margin: 0 0 14px;
  line-height: 1.5;
}

.section-desc code {
  background: rgba(128, 128, 128, 0.12);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 11px;
}

.settings-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.card-row {
  padding: 16px;
}

/* ── Plugin list ── */
.plugin-list {
  display: flex;
  flex-direction: column;
}

.plugin-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  background: rgba(128, 128, 128, 0.04);
}

.plugin-count {
  font-size: 11px;
  color: var(--text-secondary, var(--muted));
  font-weight: 500;
}

.refresh-btn {
  margin-top: 0 !important;
  padding: 3px 10px;
  font-size: 11px;
}

.plugin-item {
  display: flex;
  align-items: flex-start;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  transition: opacity 0.15s;
}

.plugin-item:last-child {
  border-bottom: none;
}

.plugin-item.disabled {
  opacity: 0.55;
}

.plugin-body {
  flex: 1;
  min-width: 0;
}

.plugin-toggle {
  flex-shrink: 0;
  margin-left: 14px;
  margin-top: 4px;
}

.plugin-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.plugin-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.plugin-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.plugin-version {
  font-size: 11px;
  color: var(--text-secondary, var(--muted));
  font-family: monospace;
}

.status-badge {
  font-size: 10px;
  font-weight: 500;
  padding: 1px 7px;
  border-radius: 10px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.status-badge.loaded {
  background: rgba(52, 211, 153, 0.15);
  color: #34d399;
}

.status-badge.error {
  background: rgba(248, 113, 113, 0.15);
  color: #f87171;
}

.status-badge.stopped {
  background: rgba(128, 128, 128, 0.2);
  color: var(--text-secondary, var(--muted));
}

.plugin-desc {
  font-size: 12px;
  color: var(--text-secondary, var(--muted));
  margin: 0;
  line-height: 1.45;
}

.plugin-error {
  font-size: 11px;
  color: #f87171;
  margin: 0;
  line-height: 1.4;
}

.plugin-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
}

.meta-tag {
  font-size: 10px;
  color: var(--text-secondary, var(--muted));
  font-family: monospace;
}

.meta-tag.path {
  opacity: 0.5;
}

.meta-tag.needs-install {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.12);
  padding: 1px 5px;
  border-radius: 3px;
}

.meta-tag.builtin {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  padding: 1px 5px;
  border-radius: 3px;
}

.cmd-list {
  opacity: 0.7;
}

/* ── Toggle ── */
.toggle {
  position: relative;
  display: inline-block;
  width: 38px;
  height: 22px;
  cursor: pointer;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  inset: 0;
  background: rgba(128, 128, 128, 0.3);
  border-radius: 22px;
  transition: background 0.2s;
}

.toggle-slider::after {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  left: 3px;
  top: 3px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s;
}

.toggle input:checked + .toggle-slider {
  background: var(--accent);
}

.toggle input:checked + .toggle-slider::after {
  transform: translateX(16px);
}

/* ── Empty/Loading/Error ── */
.empty-state,
.loading-row,
.error-state {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-secondary, var(--muted));
  font-size: 13px;
}

.empty-state .hint {
  font-size: 12px;
  margin-top: 8px;
  line-height: 1.6;
}

.empty-state .hint code,
.pre code {
  background: rgba(128, 128, 128, 0.12);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 11px;
}

.loading-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(128, 128, 128, 0.2);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.btn-sm {
  margin-top: 8px;
  padding: 4px 12px;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}

.btn-sm:hover {
  background: rgba(128, 128, 128, 0.1);
}

.code-block {
  background: rgba(0, 0, 0, 0.15);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px 14px;
  font-size: 11px;
  line-height: 1.6;
  margin: 8px 0 0;
  overflow-x: auto;
  white-space: pre;
  color: var(--text-secondary, var(--muted));
}

.install-steps {
  margin: 0;
  padding-left: 18px;
  line-height: 1.8;
  color: var(--text-secondary, var(--muted));
  font-size: 12px;
}

.install-steps code {
  background: rgba(128, 128, 128, 0.12);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 11px;
}
</style>
