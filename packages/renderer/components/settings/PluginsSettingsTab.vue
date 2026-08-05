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
      <ErrorNote
        v-else-if="error"
        variant="block"
        :message="error"
      >
        <template #actions>
          <Button
            unstyled
            class="btn-sm"
            @click="loadPlugins"
          >
            Retry
          </Button>
        </template>
      </ErrorNote>

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
        <Button
          unstyled
          class="btn-sm"
          @click="refreshPlugins"
        >
          <RefreshCw :size="13" />
          <span>Refresh</span>
        </Button>
      </div>

      <!-- Plugin list -->
      <div
        v-else
        class="settings-card plugin-list"
      >
        <div class="plugin-list-header">
          <span class="plugin-count">{{ plugins.length }} plugin{{ plugins.length > 1 ? 's' : '' }}</span>
          <Button
            unstyled
            class="btn-sm refresh-btn"
            @click="refreshPlugins"
          >
            <RefreshCw :size="13" />
            <span>Refresh</span>
          </Button>
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
              <ErrorNote
                v-if="plugin.error"
                size="sm"
                :message="plugin.error"
              />
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
                <span class="meta-tag path">{{ plugin.id }}</span>
              </div>
            </div>
          </div>

          <div class="plugin-toggle">
            <Switch
              variant="ledger"
              :model-value="plugin.enabled"
              :aria-label="`Enable ${plugin.name}`"
              @update:model-value="togglePlugin(plugin)"
            />
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
            <li>Open this settings page and click <strong>Refresh</strong></li>
            <li>If the plugin has a <code>package.json</code>, dependencies are auto-installed on first load</li>
          </ol>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import ErrorNote from '@/components/common/ErrorNote.vue'
import Switch from '@/components/common/Switch.vue'
import { ref, onMounted } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import { platformApi } from '@/platform'

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
    const result = await platformApi.getPlugins()
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
      const result = await platformApi.disablePlugin(plugin.id)
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
      const result = await platformApi.enablePlugin(plugin.id)
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
    const result = await platformApi.refreshPlugins()
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
/*
 * Plugins ledger — 画线风.
 * No fills, no radii: rows hang on hairlines, badges are outlined rings.
 * Toggle visuals and .section-title/.settings-card chrome come from the
 * SettingsPage :deep() layer.
 */
.tab-content {
  max-width: 720px;
}

.settings-section {
  margin-bottom: 28px;
}

.section-desc {
  font-size: 12px;
  color: var(--settings-ink-3, var(--ui-text-muted-fg));
  margin: 0 0 14px;
  line-height: 1.5;
}

.section-desc code,
.empty-state .hint code,
.install-steps code {
  padding: 0;
  border-radius: 0;
  background: transparent;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--settings-ink-2, var(--ui-text-secondary-fg));
}

/* ── Plugin list: ledger rows, no card chrome ── */
.plugin-list {
  display: flex;
  flex-direction: column;
}

.plugin-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0 8px;
  border-bottom: 1px solid var(--settings-rule, var(--ui-border-default-border));
  background: transparent;
}

.plugin-count {
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  color: var(--settings-ink-3, var(--ui-text-muted-fg));
}

.refresh-btn {
  margin-top: 0 !important;
  padding: 2px 8px;
  font-size: 11px;
}

.plugin-item {
  display: flex;
  align-items: flex-start;
  padding: 12px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--settings-rule-soft, var(--ui-border-subtle-border, var(--ui-border-default-border))) 55%, transparent);
}

.plugin-item:last-child {
  border-bottom: none;
}

/* Disabled plugin: faint ink + strike-through, not an opacity veil. */
.plugin-item.disabled .plugin-name {
  color: var(--settings-ink-4, var(--ui-text-faint-fg, var(--ui-text-muted-fg)));
  text-decoration: line-through;
  text-decoration-color: color-mix(in srgb, var(--settings-ink-4, var(--ui-text-faint-fg, var(--ui-text-muted-fg))) 60%, transparent);
}

.plugin-item.disabled .plugin-desc {
  color: var(--settings-ink-4, var(--ui-text-faint-fg, var(--ui-text-muted-fg)));
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
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.plugin-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--settings-ink, var(--ui-text-primary-fg));
}

/* Badges: outlined rings, zero fill. */
.plugin-version {
  flex-shrink: 0;
  padding: 1px 7px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border));
  border-radius: 999px;
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  color: var(--settings-ink-3, var(--ui-text-muted-fg));
}

.status-badge {
  flex-shrink: 0;
  padding: 1px 7px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.status-badge.loaded {
  border-color: var(--ui-status-success-border, var(--ui-status-success-fg));
  color: var(--ui-status-success-fg);
}

.status-badge.error {
  border-color: var(--ui-status-danger-border, var(--ui-status-danger-fg));
  color: var(--ui-status-danger-fg);
}

.status-badge.stopped {
  border-style: dashed;
  border-color: var(--settings-rule, var(--ui-border-default-border));
  color: var(--settings-ink-4, var(--ui-text-faint-fg, var(--ui-text-muted-fg)));
}

.plugin-desc {
  font-size: 12px;
  color: var(--settings-ink-3, var(--ui-text-muted-fg));
  margin: 0;
  line-height: 1.45;
}

.plugin-meta {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
}

.meta-tag {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--settings-ink-3, var(--ui-text-muted-fg));
}

.meta-tag.path {
  color: var(--settings-ink-4, var(--ui-text-faint-fg, var(--ui-text-muted-fg)));
}

.meta-tag.needs-install {
  padding: 1px 7px;
  border: 1px solid var(--ui-status-warning-border, var(--ui-status-warning-fg));
  border-radius: 999px;
  background: transparent;
  color: var(--ui-status-warning-fg);
}

.meta-tag.builtin {
  padding: 1px 7px;
  border: 1px solid color-mix(in srgb, var(--settings-accent, var(--ui-accent-primary-fg)) 55%, transparent);
  border-radius: 999px;
  background: transparent;
  color: var(--settings-accent, var(--ui-accent-primary-fg));
}

.cmd-list {
  color: var(--settings-ink-4, var(--ui-text-faint-fg, var(--ui-text-muted-fg)));
}

/* ── Empty/Loading/Error ── */
.empty-state,
.loading-row {
  padding: 28px 16px;
  text-align: center;
  color: var(--settings-ink-3, var(--ui-text-muted-fg));
  font-size: 13px;
}

.empty-state {
  border: 1px dashed var(--settings-rule, var(--ui-border-default-border));
}

.empty-state p {
  margin: 0;
}

.empty-state .hint {
  font-size: 12px;
  margin-top: 8px;
  line-height: 1.6;
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
  border: 2px solid color-mix(in srgb, var(--settings-ink-4, var(--ui-text-faint-fg, var(--ui-text-muted-fg))) 30%, transparent);
  border-top-color: var(--settings-accent, var(--ui-accent-primary-fg));
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.btn-sm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 8px;
  padding: 3px 10px;
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  border: 1px solid var(--settings-rule, var(--ui-border-default-border));
  border-radius: 0;
  background: transparent;
  color: var(--settings-ink-2, var(--ui-text-secondary-fg, var(--ui-text-primary-fg)));
  cursor: pointer;
  transition: border-color 0.12s ease, color 0.12s ease;
}

.btn-sm:hover {
  background: transparent;
  border-color: var(--settings-ink-3, var(--ui-text-muted-fg));
  color: var(--settings-ink, var(--ui-text-primary-fg));
}

.install-steps {
  margin: 0;
  padding-left: 18px;
  line-height: 1.8;
  color: var(--settings-ink-3, var(--ui-text-muted-fg));
  font-size: 12px;
}
</style>
