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

    <!-- Typography -->
    <section class="settings-section">
      <h3 class="section-title">
        Typography
      </h3>
      <div class="settings-card">
        <!-- Font Size -->
        <div class="card-row">
          <div class="form-group">
            <label class="form-label">
              Font Size
              <span class="label-value">{{ currentFontSize }}px</span>
            </label>
            <input
              type="range"
              class="form-slider"
              :min="12"
              :max="20"
              :step="1"
              :value="currentFontSize"
              @input="updateFontSize(Number(($event.target as HTMLInputElement).value))"
            >
            <div class="slider-labels">
              <span>12</span>
              <span>16</span>
              <span>20</span>
            </div>
          </div>
        </div>

        <!-- English Font -->
        <div class="card-row">
          <div class="form-group">
            <label class="form-label">English Font</label>
            <div class="font-options">
              <button
                v-for="font in enFonts"
                :key="font.id"
                :class="['font-option', { active: currentFontEn === font.id }]"
                @click="updateFontEn(font.id)"
              >
                <span
                  class="font-preview"
                  :style="{ fontFamily: font.family }"
                >
                  {{ font.preview || 'Aa' }}
                </span>
                <span class="font-name">{{ font.name }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Chinese Font -->
        <div class="card-row">
          <div class="form-group">
            <label class="form-label">中文字体</label>
            <div class="font-options">
              <button
                v-for="font in zhFonts"
                :key="font.id"
                :class="['font-option', { active: currentFontZh === font.id }]"
                @click="updateFontZh(font.id)"
              >
                <span
                  class="font-preview"
                  :style="{ fontFamily: font.family }"
                >
                  {{ font.preview || '你好' }}
                </span>
                <span class="font-name">{{ font.name }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="settings-section">
      <h3 class="section-title">
        Daily Notes
      </h3>
      <div class="settings-card">
        <div class="card-row">
          <label class="toggle-row">
            <span>
              <span class="toggle-title">Enable Search Everywhere daily notes</span>
              <span class="toggle-desc">Adds the Daily tab and today shortcut.</span>
            </span>
            <input
              type="checkbox"
              :checked="dailyNotes.enabled !== false"
              @change="updateDailyNotes({ enabled: ($event.target as HTMLInputElement).checked })"
            >
          </label>
        </div>

        <div class="card-row">
          <div class="form-group">
            <label class="form-label">Source Directory</label>
            <div class="segmented-control">
              <button
                :class="['segment-btn', { active: (dailyNotes.directoryMode || 'personal') === 'personal' }]"
                type="button"
                @click="updateDailyNotes({ directoryMode: 'personal' })"
              >
                Personal note dir
              </button>
              <button
                :class="['segment-btn', { active: dailyNotes.directoryMode === 'custom' }]"
                type="button"
                @click="updateDailyNotes({ directoryMode: 'custom' })"
              >
                Custom directory
              </button>
            </div>
          </div>

          <div
            v-if="dailyNotes.directoryMode === 'custom'"
            class="directory-field"
          >
            <input
              class="form-input"
              :value="dailyNotes.customDirectory || ''"
              placeholder="/path/to/daily-notes"
              spellcheck="false"
              @input="updateDailyNotes({ customDirectory: ($event.target as HTMLInputElement).value })"
            >
            <button
              class="secondary-btn"
              type="button"
              @click="chooseDailyNoteDirectory"
            >
              Choose
            </button>
          </div>
        </div>

        <div class="card-row">
          <label class="toggle-row">
            <span>
              <span class="toggle-title">Use Obsidian Daily Notes config</span>
              <span class="toggle-desc">Reads .obsidian/daily-notes.json when available.</span>
            </span>
            <input
              type="checkbox"
              :checked="dailyNotes.useObsidianConfig !== false"
              @change="updateDailyNotes({ useObsidianConfig: ($event.target as HTMLInputElement).checked })"
            >
          </label>
        </div>

        <div class="card-row">
          <div class="form-group">
            <label class="form-label">Fallback Date Format</label>
            <input
              class="form-input"
              :value="dailyNotes.format || 'YYYY-MM-DD'"
              placeholder="YYYY-MM-DD"
              spellcheck="false"
              @input="updateDailyNotes({ format: ($event.target as HTMLInputElement).value })"
            >
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AppSettings } from '@/types'
import type { DailyNoteSettings } from '@shared/ipc/settings'
import ThemeSelectorPanel from './ThemeSelectorPanel.vue'
import { getFontsByLang, DEFAULT_FONT_EN, DEFAULT_FONT_ZH } from '@shared/fonts'

const props = defineProps<{
  settings: AppSettings
}>()

const emit = defineEmits<{
  'update:settings': [settings: AppSettings]
}>()


// Available fonts by language
const enFonts = getFontsByLang('en')
const zhFonts = getFontsByLang('zh')

const currentFontSize = computed(() => props.settings.chat?.chatFontSize ?? 14)
const currentFontEn = computed(() => props.settings.chat?.chatFontEn ?? DEFAULT_FONT_EN)
const currentFontZh = computed(() => props.settings.chat?.chatFontZh ?? DEFAULT_FONT_ZH)
const dailyNotes = computed<DailyNoteSettings>(() => ({
  enabled: true,
  directoryMode: 'personal',
  customDirectory: '',
  useObsidianConfig: true,
  format: 'YYYY-MM-DD',
  ...props.settings.general.dailyNotes,
}))

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

function updateFontSize(size: number) {
  emit('update:settings', {
    ...props.settings,
    chat: {
      ...props.settings.chat!,
      chatFontSize: size,
    },
  })
}

function updateFontEn(fontId: string) {
  emit('update:settings', {
    ...props.settings,
    chat: {
      ...props.settings.chat!,
      chatFontEn: fontId,
    },
  })
}

function updateFontZh(fontId: string) {
  emit('update:settings', {
    ...props.settings,
    chat: {
      ...props.settings.chat!,
      chatFontZh: fontId,
    },
  })
}

function updateDailyNotes(patch: Partial<DailyNoteSettings>) {
  emit('update:settings', {
    ...props.settings,
    general: {
      ...props.settings.general,
      dailyNotes: {
        ...dailyNotes.value,
        ...patch,
      },
    },
  })
}

async function chooseDailyNoteDirectory() {
  const result = await window.electronAPI.showOpenDialog({
    title: 'Choose Daily Notes Directory',
    properties: ['openDirectory'],
    defaultPath: dailyNotes.value.customDirectory || undefined,
  })
  if (!result.canceled && result.filePaths[0]) {
    updateDailyNotes({
      directoryMode: 'custom',
      customDirectory: result.filePaths[0],
    })
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

/* macOS-style card group */
.settings-card {
  border: 1px solid var(--settings-rule, var(--border));
  background: var(--settings-paper, var(--bg-panel));
  border-radius: 12px;
  overflow: hidden;
}

.card-row {
  padding: 12px 14px;
  border-bottom: 1px solid var(--settings-rule-soft, var(--border-subtle));
}

.card-row:last-child {
  border-bottom: none;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: var(--type-caption-size);
  font-weight: var(--font-weight-bold);
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
  font-size: var(--type-label-size);
  font-weight: var(--type-label-weight);
  color: var(--text-primary);
  margin-bottom: 8px;
}

.form-input {
  width: 100%;
  min-height: 34px;
  border: 1px solid var(--settings-rule, var(--border-subtle));
  border-radius: 8px;
  background: var(--settings-paper-2, var(--bg));
  color: var(--text-primary);
  font-size: var(--type-body-size);
  padding: 7px 10px;
  outline: none;
}

.form-input:focus {
  border-color: var(--settings-accent, var(--accent));
  box-shadow: 0 0 0 2px var(--settings-accent-soft, rgba(var(--accent-rgb), 0.12));
}

.segmented-control {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--settings-rule, var(--border-subtle));
  border-radius: 8px;
  background: var(--settings-paper-2, var(--bg));
}

.segment-btn {
  min-height: 30px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-size: var(--type-label-size);
  cursor: pointer;
}

.segment-btn:hover {
  color: var(--text-primary);
  background: var(--hover);
}

.segment-btn.active {
  color: var(--text-primary);
  background: var(--settings-paper, var(--bg-panel));
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

.segment-btn:focus-visible {
  outline: 2px solid var(--settings-accent, var(--accent));
  outline-offset: 2px;
}

.directory-field {
  display: flex;
  gap: 8px;
  align-items: center;
}

.directory-field .form-input {
  flex: 1;
  min-width: 0;
}

.secondary-btn {
  flex-shrink: 0;
  min-height: 34px;
  border: 1px solid var(--settings-rule, var(--border-subtle));
  border-radius: 8px;
  background: var(--settings-paper, transparent);
  color: var(--text-primary);
  padding: 0 12px;
  font-size: var(--type-label-size);
  cursor: pointer;
}

.secondary-btn:hover {
  border-color: var(--settings-accent, var(--accent));
  background: var(--settings-paper-2, var(--hover));
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.toggle-title,
.toggle-desc {
  display: block;
}

.toggle-title {
  font-size: var(--type-body-size);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.toggle-desc {
  margin-top: 2px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.toggle-row input {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}

.label-value {
  margin-left: auto;
  color: var(--accent);
  font-weight: var(--font-weight-semibold);
}

/* Theme Cards */
.theme-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  border: 0;
  background: transparent;
  overflow: visible;
}

.theme-card {
  border: 1px solid var(--settings-rule, var(--border));
  border-radius: 12px;
  background: var(--settings-paper, transparent);
  padding: 0;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
  overflow: hidden;
}

.theme-card:hover {
  border-color: var(--settings-accent, var(--accent));
  transform: translateY(-1px);
}

.theme-card.active {
  border-color: var(--settings-accent, var(--accent));
  box-shadow: 0 0 0 3px var(--settings-accent-soft, rgba(var(--accent-rgb), 0.14));
}

.theme-card span {
  display: block;
  padding: 10px 12px 11px;
  border-top: 1px solid var(--settings-rule-soft, rgba(128, 128, 128, 0.08));
  font-size: var(--type-label-size);
  font-weight: var(--type-label-weight);
}

.theme-preview {
  height: 104px;
  border-radius: 0;
  margin-bottom: 0;
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
  border: 1px solid var(--settings-rule, var(--border));
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}

.color-theme-btn:hover {
  border-color: var(--theme-main);
  background: var(--settings-paper-2, var(--bg-hover));
}

.color-theme-btn.active {
  border-color: var(--theme-main);
  background: color-mix(in srgb, var(--theme-main) 10%, var(--settings-paper));
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
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--settings-paper) 72%, transparent), 0 2px 8px rgba(0, 0, 0, 0.3);
}

.color-name {
  font-size: var(--font-size-sm);
  font-weight: var(--type-label-weight);
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
  font-size: var(--type-caption-size);
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
  font-size: var(--type-body-size);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin-bottom: 2px;
}

.radio-desc {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

/* Responsive */
@media (max-width: 480px) {
  .theme-cards {
    grid-template-columns: 1fr;
  }

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

/* Font Options */
.font-options {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(136px, 1fr));
  gap: 10px;
}

.font-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--settings-rule, var(--border-subtle));
  border-radius: 9px;
  background: var(--settings-paper, transparent);
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}

.font-option:hover {
  background: var(--settings-paper-2, var(--hover));
  border-color: var(--settings-accent, var(--border-default));
}

.font-option.active {
  border-color: var(--settings-accent, var(--accent));
  background: color-mix(in srgb, var(--settings-accent, var(--accent)) 8%, transparent);
}

.font-preview {
  font-size: var(--type-body-size);
  color: var(--text-primary);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.font-name {
  font-size: var(--type-caption-size);
  color: var(--text-muted);
  white-space: nowrap;
}

.font-tag {
  font-size: 10px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-faint);
  background: var(--settings-paper-2, var(--bg-hover));
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
}

</style>
