<template>
  <div class="tab-content">
    <!-- Appearance -->
    <section class="settings-section">
      <h3 class="section-title">Appearance</h3>

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

    <!-- Base Theme -->
    <section class="settings-section">
      <h3 class="section-title">Base Theme</h3>

      <div class="base-theme-grid">
        <button
          v-for="theme in baseThemes"
          :key="theme.id"
          :class="['base-theme-btn', { active: currentBaseTheme === theme.id }]"
          @click="updateBaseTheme(theme.id)"
          :title="theme.name"
        >
          <div class="base-theme-preview" :style="{ '--preview-bg': theme.darkBg, '--preview-panel': theme.darkPanel, '--preview-accent': theme.accent }">
            <div class="preview-sidebar-mini"></div>
            <div class="preview-content-mini">
              <div class="preview-line-mini"></div>
              <div class="preview-line-mini accent"></div>
            </div>
          </div>
          <span class="base-theme-name">{{ theme.name }}</span>
          <span class="base-theme-desc">{{ theme.desc }}</span>
        </button>
      </div>
    </section>

    <!-- Accent Color -->
    <section class="settings-section">
      <h3 class="section-title">Accent Color</h3>

      <div class="color-theme-grid">
        <button
          v-for="color in colorThemes"
          :key="color.id"
          :class="['color-theme-btn', { active: currentColorTheme === color.id }]"
          :style="{ '--theme-color': color.value, '--theme-color-rgb': color.rgb }"
          @click="updateColorTheme(color.id)"
          :title="color.name"
        >
          <span class="color-dot"></span>
          <span class="color-name">{{ color.name }}</span>
        </button>
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

    <!-- Shortcuts -->
    <section class="settings-section">
      <h3 class="section-title">Shortcuts</h3>
      <div class="form-group">
        <label class="form-label">Send Message Shortcut</label>
        <div class="radio-group">
          <label class="radio-item" :class="{ active: settings.general.sendShortcut === 'enter' }">
            <input
              type="radio"
              :checked="settings.general.sendShortcut === 'enter'"
              @change="updateSendShortcut('enter')"
            />
            <span class="radio-label">Enter</span>
            <span class="radio-desc">Use Enter to send, Shift+Enter for new line</span>
          </label>
          <label class="radio-item" :class="{ active: settings.general.sendShortcut === 'ctrl-enter' }">
            <input
              type="radio"
              :checked="settings.general.sendShortcut === 'ctrl-enter'"
              @change="updateSendShortcut('ctrl-enter')"
            />
            <span class="radio-label">Ctrl + Enter</span>
            <span class="radio-desc">Both Ctrl+Enter and Cmd+Enter will send</span>
          </label>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AppSettings, ColorTheme, BaseTheme } from '@/types'

const props = defineProps<{
  settings: AppSettings
}>()

const emit = defineEmits<{
  'update:settings': [settings: AppSettings]
}>()

// Base theme definitions
const baseThemes = [
  // Original themes
  { id: 'obsidian' as BaseTheme, name: 'Obsidian', desc: 'Neutral gray', darkBg: '#111214', darkPanel: '#1b1c1f', accent: '#357aff' },
  { id: 'ocean' as BaseTheme, name: 'Ocean', desc: 'Deep blue', darkBg: '#0d1117', darkPanel: '#161b22', accent: '#58a6ff' },
  { id: 'forest' as BaseTheme, name: 'Forest', desc: 'Natural green', darkBg: '#0f1512', darkPanel: '#171f1a', accent: '#34d399' },
  { id: 'rose' as BaseTheme, name: 'Rose', desc: 'Elegant pink', darkBg: '#15111a', darkPanel: '#201a26', accent: '#ec4899' },
  { id: 'ember' as BaseTheme, name: 'Ember', desc: 'Warm earth', darkBg: '#161412', darkPanel: '#211e1a', accent: '#f97316' },
  // Classic themes
  { id: 'nord' as BaseTheme, name: 'Nord', desc: 'Arctic blue', darkBg: '#2e3440', darkPanel: '#434c5e', accent: '#88c0d0' },
  { id: 'dracula' as BaseTheme, name: 'Dracula', desc: 'Vampire purple', darkBg: '#21222c', darkPanel: '#2d303d', accent: '#bd93f9' },
  { id: 'tokyo' as BaseTheme, name: 'Tokyo Night', desc: 'City night', darkBg: '#1a1b26', darkPanel: '#24283b', accent: '#7aa2f7' },
  { id: 'catppuccin' as BaseTheme, name: 'Catppuccin', desc: 'Soothing pastel', darkBg: '#1e1e2e', darkPanel: '#28283d', accent: '#cba6f7' },
  { id: 'gruvbox' as BaseTheme, name: 'Gruvbox', desc: 'Retro warm', darkBg: '#1d2021', darkPanel: '#32302f', accent: '#fe8019' },
  { id: 'onedark' as BaseTheme, name: 'One Dark', desc: 'Atom editor', darkBg: '#21252b', darkPanel: '#2c323c', accent: '#61afef' },
  { id: 'github' as BaseTheme, name: 'GitHub', desc: 'GitHub Dark', darkBg: '#0d1117', darkPanel: '#21262d', accent: '#58a6ff' },
  { id: 'rosepine' as BaseTheme, name: 'Rosé Pine', desc: 'Elegant rose', darkBg: '#191724', darkPanel: '#26233a', accent: '#ebbcba' },
]

// Color theme definitions
const colorThemes = [
  { id: 'blue' as ColorTheme, name: 'Blue', value: '#357aff', rgb: '53, 122, 255' },
  { id: 'purple' as ColorTheme, name: 'Purple', value: '#8b5cf6', rgb: '139, 92, 246' },
  { id: 'green' as ColorTheme, name: 'Green', value: '#10b981', rgb: '16, 185, 129' },
  { id: 'orange' as ColorTheme, name: 'Orange', value: '#f97316', rgb: '249, 115, 22' },
  { id: 'pink' as ColorTheme, name: 'Pink', value: '#ec4899', rgb: '236, 72, 153' },
  { id: 'cyan' as ColorTheme, name: 'Cyan', value: '#06b6d4', rgb: '6, 182, 212' },
  { id: 'red' as ColorTheme, name: 'Red', value: '#ef4444', rgb: '239, 68, 68' },
]

const currentBaseTheme = computed(() => {
  return props.settings.general?.baseTheme || 'obsidian'
})

const currentColorTheme = computed(() => {
  return props.settings.general?.colorTheme || 'blue'
})

function updateTheme(theme: 'light' | 'dark' | 'system') {
  emit('update:settings', { ...props.settings, theme })
}

function updateColorTheme(colorTheme: ColorTheme) {
  emit('update:settings', {
    ...props.settings,
    general: { ...props.settings.general, colorTheme }
  })
}

function updateBaseTheme(baseTheme: BaseTheme) {
  emit('update:settings', {
    ...props.settings,
    general: { ...props.settings.general, baseTheme }
  })
}

function updateAnimationSpeed(speed: number) {
  emit('update:settings', {
    ...props.settings,
    general: { ...props.settings.general, animationSpeed: speed }
  })
}

function updateSendShortcut(shortcut: 'enter' | 'ctrl-enter' | 'cmd-enter') {
  emit('update:settings', {
    ...props.settings,
    general: { ...props.settings.general, sendShortcut: shortcut }
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
  color: var(--muted);
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
  color: var(--text);
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
  background: rgba(59, 130, 246, 0.1);
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

/* Base Theme Grid */
.base-theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 12px;
}

.base-theme-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 8px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}

.base-theme-btn:hover {
  border-color: var(--accent);
  background: var(--hover);
}

.base-theme-btn.active {
  border-color: var(--accent);
  background: rgba(var(--accent-rgb), 0.1);
}

.base-theme-preview {
  width: 100%;
  height: 48px;
  border-radius: 8px;
  background: var(--preview-bg);
  display: flex;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.preview-sidebar-mini {
  width: 28%;
  background: var(--preview-panel);
}

.preview-content-mini {
  flex: 1;
  padding: 8px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
}

.preview-line-mini {
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.15);
  width: 80%;
}

.preview-line-mini.accent {
  width: 50%;
  background: var(--preview-accent);
}

.base-theme-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}

.base-theme-desc {
  font-size: 10px;
  color: var(--muted);
  text-align: center;
}

/* Color Theme Grid */
.color-theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 10px;
}

.color-theme-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 8px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}

.color-theme-btn:hover {
  border-color: rgba(var(--theme-color-rgb), 0.4);
  background: rgba(var(--theme-color-rgb), 0.05);
}

.color-theme-btn.active {
  border-color: var(--theme-color);
  background: rgba(var(--theme-color-rgb), 0.1);
}

.color-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--theme-color);
  box-shadow: 0 2px 8px rgba(var(--theme-color-rgb), 0.3);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.color-theme-btn:hover .color-dot {
  transform: scale(1.1);
}

.color-theme-btn.active .color-dot {
  box-shadow: 0 0 0 3px rgba(var(--theme-color-rgb), 0.2), 0 2px 8px rgba(var(--theme-color-rgb), 0.4);
}

.color-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
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
  color: var(--muted);
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
  color: var(--text);
  margin-bottom: 2px;
}

.radio-desc {
  font-size: 12px;
  color: var(--muted);
}

/* Responsive */
@media (max-width: 480px) {
  .theme-cards {
    gap: 8px;
  }

  .theme-card {
    padding: 8px;
  }

  .theme-card span {
    font-size: 11px;
  }

  .theme-preview {
    height: 50px;
    border-radius: 6px;
  }

  .radio-item {
    padding: 10px 12px;
    border-radius: 10px;
  }

  .radio-label {
    font-size: 13px;
  }

  .radio-desc {
    font-size: 11px;
  }
}
</style>
