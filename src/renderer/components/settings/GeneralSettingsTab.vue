<template>
  <div class="tab-content">
    <!-- Mode (Light/Dark/System) -->
    <section class="settings-section">
      <h3 class="section-title">Mode</h3>

      <div class="theme-cards">
        <div
          :class="['theme-card', { active: settings.theme === 'system' }]"
          @click="updateTheme('system')"
        >
          <div class="theme-preview system">
            <div class="preview-half light">
              <div class="preview-sidebar"></div>
              <div class="preview-content">
                <div class="preview-line"></div>
              </div>
            </div>
            <div class="preview-half dark">
              <div class="preview-sidebar"></div>
              <div class="preview-content">
                <div class="preview-line"></div>
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
            <div class="preview-sidebar"></div>
            <div class="preview-content">
              <div class="preview-line"></div>
              <div class="preview-line short"></div>
            </div>
          </div>
          <span>Light</span>
        </div>
        <div
          :class="['theme-card', { active: settings.theme === 'dark' }]"
          @click="updateTheme('dark')"
        >
          <div class="theme-preview dark">
            <div class="preview-sidebar"></div>
            <div class="preview-content">
              <div class="preview-line"></div>
              <div class="preview-line short"></div>
            </div>
          </div>
          <span>Dark</span>
        </div>
      </div>
    </section>

    <!-- Theme Selection -->
    <section class="settings-section">
      <h3 class="section-title">Theme</h3>
      <ThemeSelectorPanel @themeChange="handleThemeChange" />
    </section>

    <!-- Accent Color -->
    <section class="settings-section">
      <h3 class="section-title">Accent Color</h3>

      <div class="color-theme-grid">
        <button
          v-for="color in colorThemes"
          :key="color.id"
          :class="['color-theme-btn', { active: currentColorTheme === color.id }]"
          :style="{ '--theme-main': color.main, '--theme-sub': color.sub }"
          @click="updateColorTheme(color.id)"
          :title="color.name"
        >
          <div class="color-dots">
            <span class="color-dot main" title="Main (300)"></span>
            <span class="color-dot sub" title="Sub (100)"></span>
          </div>
          <span class="color-name">{{ color.name }}</span>
        </button>
      </div>
    </section>

    <!-- Message Display Density -->
    <section class="settings-section">
      <h3 class="section-title">Message Display</h3>

      <div class="density-cards">
        <div
          :class="['density-card', { active: currentDensity === 'compact' }]"
          @click="updateDensity('compact')"
        >
          <div class="density-preview compact">
            <div class="density-line"></div>
            <div class="density-line short"></div>
            <div class="density-line"></div>
            <div class="density-line short"></div>
          </div>
          <span>Compact</span>
        </div>
        <div
          :class="['density-card', { active: currentDensity === 'comfortable' }]"
          @click="updateDensity('comfortable')"
        >
          <div class="density-preview comfortable">
            <div class="density-line"></div>
            <div class="density-line short"></div>
            <div class="density-line"></div>
          </div>
          <span>Comfortable</span>
        </div>
        <div
          :class="['density-card', { active: currentDensity === 'spacious' }]"
          @click="updateDensity('spacious')"
        >
          <div class="density-preview spacious">
            <div class="density-line"></div>
            <div class="density-line short"></div>
          </div>
          <span>Spacious</span>
        </div>
      </div>

      <!-- Line Height Slider -->
      <div class="form-group" style="margin-top: 16px;">
        <label class="form-label">
          Line Height
          <span class="label-value">{{ currentLineHeight.toFixed(1) }}</span>
        </label>
        <input
          :value="currentLineHeight"
          @input="updateLineHeight(($event.target as HTMLInputElement).valueAsNumber)"
          type="range"
          min="1.2"
          max="2.2"
          step="0.1"
          class="form-slider"
        />
        <div class="slider-labels">
          <span>Compact</span>
          <span>Spacious</span>
        </div>
      </div>
    </section>

    <!-- Animation -->
    <section class="settings-section">
      <h3 class="section-title">Animation</h3>

      <div class="form-group">
        <label class="form-label">
          Expand/Collapse Speed
          <span class="label-value">{{ settings.general.animationSpeed.toFixed(2) }}s</span>
        </label>
        <input
          :value="settings.general.animationSpeed"
          @input="updateAnimationSpeed(($event.target as HTMLInputElement).valueAsNumber)"
          type="range"
          min="0.05"
          max="0.5"
          step="0.05"
          class="form-slider"
        />
        <div class="slider-labels">
          <span>Fast</span>
          <span>Slow</span>
        </div>
      </div>
    </section>

  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AppSettings, ColorTheme } from '@/types'
import type { MessageListDensity } from '../../../shared/ipc'
import ThemeSelectorPanel from './ThemeSelectorPanel.vue'

const props = defineProps<{
  settings: AppSettings
}>()

const emit = defineEmits<{
  'update:settings': [settings: AppSettings]
}>()

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
