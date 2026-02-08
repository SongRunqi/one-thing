<template>
  <div class="tab-content">
    <!-- Mode (Light/Dark/System) -->
    <section class="settings-section">
      <h3 class="section-title">
        Mode
      </h3>

      <div class="theme-cards">
        <div
          :class="['theme-card', { active: settings.theme === 'system' }]"
          @click="updateTheme('system')"
        >
          <div class="theme-preview system">
            <div class="preview-half light">
              <div class="preview-sidebar" />
              <div class="preview-content">
                <div class="preview-line" />
              </div>
            </div>
            <div class="preview-half dark">
              <div class="preview-sidebar" />
              <div class="preview-content">
                <div class="preview-line" />
              </div>
            </div>
          </div>
          <span>System</span>
        </div>
        <div
          :class="['theme-card', { active: settings.theme === 'light' }]"
          @click="updateTheme('light')"
        >
          <div class="theme-preview light">
            <div class="preview-sidebar" />
            <div class="preview-content">
              <div class="preview-line" />
              <div class="preview-line short" />
            </div>
          </div>
          <span>Light</span>
        </div>
        <div
          :class="['theme-card', { active: settings.theme === 'dark' }]"
          @click="updateTheme('dark')"
        >
          <div class="theme-preview dark">
            <div class="preview-sidebar" />
            <div class="preview-content">
              <div class="preview-line" />
              <div class="preview-line short" />
            </div>
          </div>
          <span>Dark</span>
        </div>
      </div>
    </section>

    <!-- Theme Selection -->
    <section class="settings-section">
      <h3 class="section-title">
        Theme
      </h3>
      <ThemeSelectorPanel @theme-change="handleThemeChange" />
    </section>

    <!-- Accent Color -->
    <section class="settings-section">
      <h3 class="section-title">
        Accent Color
      </h3>

      <div class="color-theme-grid">
        <button
          v-for="color in colorThemes"
          :key="color.id"
          :class="['color-theme-btn', { active: currentColorTheme === color.id }]"
          :style="{ '--theme-main': color.main, '--theme-sub': color.sub }"
          :title="color.name"
          @click="updateColorTheme(color.id)"
        >
          <div class="color-dots">
            <span
              class="color-dot main"
              title="Main (300)"
            />
            <span
              class="color-dot sub"
              title="Sub (100)"
            />
          </div>
          <span class="color-name">{{ color.name }}</span>
        </button>
      </div>
    </section>

    <!-- Message Display Density -->
    <section class="settings-section">
      <h3 class="section-title">
        Message Display
      </h3>

      <div class="density-cards">
        <div
          :class="['density-card', { active: currentDensity === 'compact' }]"
          @click="updateDensity('compact')"
        >
          <div class="density-preview compact">
            <div class="density-line" />
            <div class="density-line short" />
            <div class="density-line" />
            <div class="density-line short" />
          </div>
          <span>Compact</span>
        </div>
        <div
          :class="['density-card', { active: currentDensity === 'comfortable' }]"
          @click="updateDensity('comfortable')"
        >
          <div class="density-preview comfortable">
            <div class="density-line" />
            <div class="density-line short" />
            <div class="density-line" />
          </div>
          <span>Comfortable</span>
        </div>
        <div
          :class="['density-card', { active: currentDensity === 'spacious' }]"
          @click="updateDensity('spacious')"
        >
          <div class="density-preview spacious">
            <div class="density-line" />
            <div class="density-line short" />
          </div>
          <span>Spacious</span>
        </div>
      </div>

      <!-- Line Height Slider -->
      <div
        class="form-group"
        style="margin-top: 16px;"
      >
        <label class="form-label">
          Line Height
          <span class="label-value">{{ currentLineHeight.toFixed(1) }}</span>
        </label>
        <input
          :value="currentLineHeight"
          type="range"
          min="1.2"
          max="2.2"
          step="0.1"
          class="form-slider"
          @input="updateLineHeight(($event.target as HTMLInputElement).valueAsNumber)"
        >
        <div class="slider-labels">
          <span>Compact</span>
          <span>Spacious</span>
        </div>
      </div>
    </section>

    <!-- Animation -->
    <section class="settings-section">
      <h3 class="section-title">
        Animation
      </h3>

      <div class="form-group">
        <label class="form-label">
          Expand/Collapse Speed
          <span class="label-value">{{ settings.general.animationSpeed.toFixed(2) }}s</span>
        </label>
        <input
          :value="settings.general.animationSpeed"
          type="range"
          min="0.05"
          max="0.5"
          step="0.05"
          class="form-slider"
          @input="updateAnimationSpeed(($event.target as HTMLInputElement).valueAsNumber)"
        >
        <div class="slider-labels">
          <span>Fast</span>
          <span>Slow</span>
        </div>
      </div>
    </section>

    <!-- Updates -->
    <section class="settings-section">
      <h3 class="section-title">
        Updates
      </h3>

      <div class="update-info">
        <div class="update-version">
          <span class="version-label">当前版本</span>
          <span class="version-value">v{{ currentVersion }}</span>
        </div>
        <div class="update-status">
          <span
            v-if="checkingUpdate"
            class="status-text checking"
          >
            正在检查更新...
          </span>
          <span
            v-else-if="updateError"
            class="status-text error"
          >
            检查失败: {{ updateError }}
          </span>
          <span
            v-else-if="updateAvailable"
            class="status-text available"
          >
            🎉 发现新版本 {{ latestVersion }}
          </span>
          <span
            v-else-if="lastChecked"
            class="status-text up-to-date"
          >
            ✓ 已是最新版本 (上次检查: {{ formatLastChecked() }})
          </span>
          <span
            v-else
            class="status-text"
          >
            点击检查更新
          </span>
        </div>
      </div>

      <div class="update-actions">
        <button
          class="btn-check-update"
          :disabled="checkingUpdate"
          @click="handleCheckUpdate"
        >
          {{ checkingUpdate ? '检查中...' : '检查更新' }}
        </button>
        <button
          v-if="updateAvailable"
          class="btn-view-release"
          @click="handleViewRelease"
        >
          查看更新
        </button>
      </div>

      <div class="form-group">
        <label class="checkbox-label">
          <input
            :checked="settings.general?.autoCheckUpdates ?? true"
            type="checkbox"
            @change="updateAutoCheckUpdates(($event.target as HTMLInputElement).checked)"
          >
          <span>启动时自动检查更新</span>
        </label>
      </div>
    </section>

    <!-- Data Management -->
    <section class="settings-section">
      <h3 class="section-title">
        数据管理
      </h3>

      <div class="data-management-info">
        <p class="info-text">
          导出设置可用于备份或迁移到其他设备。出于安全考虑，API Key 不会被导出。
        </p>
      </div>

      <div class="data-actions">
        <button
          class="btn-export"
          :disabled="exportingSettings"
          @click="handleExportSettings"
        >
          {{ exportingSettings ? '导出中...' : '📤 导出设置' }}
        </button>
        <button
          class="btn-import"
          :disabled="importingSettings"
          @click="handleImportSettings"
        >
          {{ importingSettings ? '导入中...' : '📥 导入设置' }}
        </button>
      </div>

      <!-- Status messages -->
      <div
        v-if="importExportMessage"
        :class="['status-message', importExportMessageType]"
      >
        {{ importExportMessage }}
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import type { AppSettings, ColorTheme } from '@/types'
import type { MessageListDensity } from '../../../shared/ipc'
import ThemeSelectorPanel from './ThemeSelectorPanel.vue'

const props = defineProps<{
  settings: AppSettings
}>()

const emit = defineEmits<{
  'update:settings': [settings: AppSettings]
}>()

// Update state
const currentVersion = ref('')
const checkingUpdate = ref(false)
const updateAvailable = ref(false)
const latestVersion = ref('')
const updateError = ref('')
const lastChecked = ref<number | null>(null)

// Import/Export state
const exportingSettings = ref(false)
const importingSettings = ref(false)
const importExportMessage = ref('')
const importExportMessageType = ref<'success' | 'error'>('success')

let unsubscribeStatus: (() => void) | null = null
let messageTimeout: ReturnType<typeof setTimeout> | null = null

onMounted(async () => {
  // Get initial update status
  const status = await window.electronAPI.updaterGetStatus()
  currentVersion.value = status.currentVersion
  updateAvailable.value = status.available
  latestVersion.value = status.latestVersion || ''
  updateError.value = status.error || ''
  lastChecked.value = status.lastChecked || null
  checkingUpdate.value = status.checking

  // Listen for status changes
  unsubscribeStatus = window.electronAPI.onUpdaterStatusChange((status) => {
    checkingUpdate.value = status.checking
    updateAvailable.value = status.available
    latestVersion.value = status.latestVersion || ''
    updateError.value = status.error || ''
    lastChecked.value = status.lastChecked || null
  })
})

onUnmounted(() => {
  if (unsubscribeStatus) {
    unsubscribeStatus()
  }
  if (messageTimeout) {
    clearTimeout(messageTimeout)
  }
})

async function handleCheckUpdate() {
  await window.electronAPI.updaterCheck()
}

function handleViewRelease() {
  window.electronAPI.updaterOpenRelease()
}

function formatLastChecked(): string {
  if (!lastChecked.value) return ''
  const now = Date.now()
  const diff = now - lastChecked.value
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  return `${days} 天前`
}

// Color theme definitions with Flexoki 300 (main) and 100 (sub) shades
const colorThemes = [
  { id: 'blue' as ColorTheme, name: 'Blue', main: '#4385BE', sub: '#C1D9EC' },
  { id: 'purple' as ColorTheme, name: 'Purple', main: '#8B7EC8', sub: '#DCD3EC' },
  { id: 'green' as ColorTheme, name: 'Green', main: '#879A39', sub: '#DDE6C1' },
  { id: 'orange' as ColorTheme, name: 'Orange', main: '#EF9351', sub: '#FADBC5' },
  { id: 'pink' as ColorTheme, name: 'Pink', main: '#CE5D97', sub: '#F2D0E1' },
  { id: 'cyan' as ColorTheme, name: 'Cyan', main: '#3AA99F', sub: '#C1E5E3' },
  { id: 'red' as ColorTheme, name: 'Red', main: '#E67F75', sub: '#F7D6D1' },
]

const currentColorTheme = computed(() => {
  return props.settings.general?.colorTheme || 'blue'
})

const currentDensity = computed(() => {
  return props.settings.general?.messageListDensity || 'comfortable'
})

const currentLineHeight = computed(() => {
  return props.settings.general?.messageLineHeight ?? 1.6
})

function updateTheme(theme: 'light' | 'dark' | 'system') {
  emit('update:settings', { ...props.settings, theme })
}

// Handle theme change from ThemeSelectorPanel
// This syncs localSettings with themeStore to prevent overwrites
function handleThemeChange(darkThemeId: string, lightThemeId: string) {
  emit('update:settings', {
    ...props.settings,
    general: {
      ...props.settings.general,
      darkThemeId,
      lightThemeId,
    },
  })
}

function updateColorTheme(colorTheme: ColorTheme) {
  emit('update:settings', {
    ...props.settings,
    general: { ...props.settings.general, colorTheme }
  })
}

function updateAnimationSpeed(speed: number) {
  emit('update:settings', {
    ...props.settings,
    general: { ...props.settings.general, animationSpeed: speed }
  })
}

function updateDensity(density: MessageListDensity) {
  emit('update:settings', {
    ...props.settings,
    general: { ...props.settings.general, messageListDensity: density }
  })
}

function updateLineHeight(lineHeight: number) {
  emit('update:settings', {
    ...props.settings,
    general: { ...props.settings.general, messageLineHeight: lineHeight }
  })
}

function updateAutoCheckUpdates(autoCheckUpdates: boolean) {
  emit('update:settings', {
    ...props.settings,
    general: { ...props.settings.general, autoCheckUpdates }
  })
}

// Helper function to show status message
function showMessage(message: string, type: 'success' | 'error', durationMs = 5000) {
  importExportMessage.value = message
  importExportMessageType.value = type
  
  if (messageTimeout) {
    clearTimeout(messageTimeout)
  }
  
  messageTimeout = setTimeout(() => {
    importExportMessage.value = ''
  }, durationMs)
}

// Export settings
async function handleExportSettings() {
  try {
    exportingSettings.value = true
    importExportMessage.value = ''
    
    const result = await window.electronAPI.settingsExportWithDialog()
    
    if (result.success) {
      showMessage('✓ 设置已成功导出', 'success')
    } else if (result.error && result.error !== '用户取消') {
      showMessage(`✗ 导出失败: ${result.error}`, 'error')
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    showMessage(`✗ 导出失败: ${errorMessage}`, 'error')
  } finally {
    exportingSettings.value = false
  }
}

// Import settings
async function handleImportSettings() {
  try {
    // Confirm before importing
    const confirmed = confirm(
      '导入设置将覆盖当前配置（API Key 除外）。是否继续？'
    )
    
    if (!confirmed) {
      return
    }
    
    importingSettings.value = true
    importExportMessage.value = ''
    
    const result = await window.electronAPI.settingsImportWithDialog()
    
    if (result.success) {
      showMessage('✓ 设置已成功导入，部分更改需要重启应用后生效', 'success', 8000)
      
      // Reload settings in UI after a short delay
      setTimeout(async () => {
        const settingsResult = await window.electronAPI.getSettings()
        if (settingsResult.success && settingsResult.settings) {
          emit('update:settings', settingsResult.settings)
        }
      }, 500)
    } else if (result.error && result.error !== '用户取消') {
      showMessage(`✗ 导入失败: ${result.error}`, 'error')
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    showMessage(`✗ 导入失败: ${errorMessage}`, 'error')
  } finally {
    importingSettings.value = false
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
  margin-bottom: 32px;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 0 0 12px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  opacity: 0.8;
}

.form-group {
  margin-bottom: 16px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.label-value {
  margin-left: auto;
  color: var(--accent);
  font-weight: 600;
}

/* Theme Cards */
.theme-cards {
  display: flex;
  gap: 12px;
}

.theme-card {
  flex: 1;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: center;
}

.theme-card:hover {
  border-color: rgba(255, 255, 255, 0.15);
}

.theme-card.active {
  border-color: var(--accent);
  background: rgba(var(--accent-rgb), 0.1);
}

.theme-card span {
  font-size: 13px;
  font-weight: 500;
}

.theme-preview {
  height: 60px;
  border-radius: 8px;
  margin-bottom: 10px;
  display: flex;
  overflow: hidden;
}

.theme-preview.light {
  background: #ffffff;
}

.theme-preview.dark {
  background: #0f1117;
}

.theme-preview.system {
  background: transparent;
}

.preview-half {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.preview-half.light {
  background: #ffffff;
}

.preview-half.dark {
  background: #0f1117;
}

.preview-half .preview-sidebar {
  width: 30%;
  background: rgba(128, 128, 128, 0.15);
}

.preview-half .preview-content {
  flex: 1;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.preview-half .preview-line {
  height: 4px;
  border-radius: 2px;
  background: rgba(128, 128, 128, 0.2);
}

.preview-sidebar {
  width: 30%;
  background: rgba(128, 128, 128, 0.15);
}

.preview-content {
  flex: 1;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preview-line {
  height: 6px;
  border-radius: 3px;
  background: rgba(128, 128, 128, 0.2);
}

.preview-line.short {
  width: 60%;
}

/* Color Theme Grid */
.color-theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 10px;
}

.color-theme-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 14px 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}

.color-theme-btn:hover {
  border-color: var(--theme-main);
  background: rgba(255, 255, 255, 0.02);
}

.color-theme-btn.active {
  border-color: var(--theme-main);
  background: rgba(255, 255, 255, 0.05);
}

.color-dots {
  display: flex;
  gap: 6px;
  align-items: center;
}

.color-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.color-dot.main {
  background: var(--theme-main);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.color-dot.sub {
  background: var(--theme-sub);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.color-theme-btn:hover .color-dot {
  transform: scale(1.08);
}

.color-theme-btn.active .color-dot.main {
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.1), 0 2px 8px rgba(0, 0, 0, 0.3);
}

.color-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}

/* Slider */
.form-slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--border);
  cursor: pointer;
  -webkit-appearance: none;
}

.form-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-muted);
}

/* Density Cards */
.density-cards {
  display: flex;
  gap: 12px;
}

.density-card {
  flex: 1;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: center;
}

.density-card:hover {
  border-color: rgba(255, 255, 255, 0.15);
}

.density-card.active {
  border-color: var(--accent);
  background: rgba(var(--accent-rgb), 0.1);
}

.density-card span {
  font-size: 13px;
  font-weight: 500;
}

.density-preview {
  height: 48px;
  border-radius: 8px;
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 6px 10px;
  background: var(--panel);
  border: 1px solid var(--border);
}

.density-preview.compact {
  gap: 3px;
  padding: 4px 8px;
}

.density-preview.comfortable {
  gap: 6px;
  padding: 6px 10px;
}

.density-preview.spacious {
  gap: 10px;
  padding: 8px 12px;
}

.density-line {
  height: 4px;
  border-radius: 2px;
  background: var(--accent);
  opacity: 0.6;
}

.density-preview.compact .density-line {
  height: 3px;
}

.density-preview.spacious .density-line {
  height: 5px;
}

.density-line.short {
  width: 60%;
  opacity: 0.35;
}

/* Radio Group */
.radio-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}

.radio-item {
  display: flex;
  flex-direction: column;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  background: rgba(0, 0, 0, 0.02);
}

.radio-item:hover {
  background: var(--hover);
  border-color: rgba(59, 130, 246, 0.3);
}

.radio-item.active {
  background: rgba(59, 130, 246, 0.05);
  border-color: var(--accent);
}

.radio-item input {
  position: absolute;
  opacity: 0;
}

.radio-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.radio-desc {
  font-size: 12px;
  color: var(--text-muted);
}

/* Update Section */
.update-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  margin-bottom: 12px;
}

.update-version {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.version-label {
  font-size: 13px;
  color: var(--text-muted);
}

.version-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent);
}

.update-status {
  display: flex;
  align-items: center;
}

.status-text {
  font-size: 13px;
  color: var(--text-secondary);
}

.status-text.checking {
  color: var(--accent);
}

.status-text.error {
  color: #ef4444;
}

.status-text.available {
  color: #10b981;
  font-weight: 500;
}

.status-text.up-to-date {
  color: var(--text-muted);
}

.update-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.btn-check-update,
.btn-view-release {
  padding: 8px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-check-update:hover:not(:disabled),
.btn-view-release:hover {
  background: var(--hover);
  border-color: var(--accent);
}

.btn-check-update:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-view-release {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}

.btn-view-release:hover {
  opacity: 0.9;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  user-select: none;
}

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

/* Data Management Section */
.data-management-info {
  margin-bottom: 16px;
}

.info-text {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.6;
  margin: 0;
  padding: 12px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.data-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.btn-export,
.btn-import {
  flex: 1;
  padding: 10px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.btn-export:hover:not(:disabled),
.btn-import:hover:not(:disabled) {
  background: var(--hover);
  border-color: var(--accent);
  transform: translateY(-1px);
}

.btn-export:active:not(:disabled),
.btn-import:active:not(:disabled) {
  transform: translateY(0);
}

.btn-export:disabled,
.btn-import:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status-message {
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  animation: slideIn 0.2s ease;
}

.status-message.success {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #10b981;
}

.status-message.error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Responsive */
@media (max-width: 480px) {
  .color-theme-grid {
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  }

  .color-theme-btn {
    padding: 10px 8px;
  }

  .color-dot {
    width: 20px;
    height: 20px;
  }

  .data-actions {
    flex-direction: column;
  }

  .btn-export,
  .btn-import {
    width: 100%;
  }
}

</style>
