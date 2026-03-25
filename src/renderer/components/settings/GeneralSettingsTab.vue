<template>
  <div class="tab-content">
    <!-- Mode (Light/Dark/System) -->
    <section class="settings-section">
      <h3 class="section-title">
        Mode
      </h3>

      <div class="settings-card theme-cards">
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
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AppSettings } from '@/types'
import ThemeSelectorPanel from './ThemeSelectorPanel.vue'

const props = defineProps<{
  settings: AppSettings
}>()

const emit = defineEmits<{
  'update:settings': [settings: AppSettings]
}>()


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

/* macOS-style card group */
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
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: center;
}

.theme-card:hover {
  background: var(--hover);
}

.theme-card.active {
  background: rgba(var(--accent-rgb), 0.08);
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
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  border-bottom: 1px solid var(--border);
}

.radio-item:last-child {
  border-bottom: none;
}

.radio-item:hover {
  background: var(--hover);
}

.radio-item.active {
  background: rgba(var(--accent-rgb), 0.05);
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
}

</style>
