<template>
  <div class="tab-content">
    <!-- Mode (Light/Dark/System) -->
    <SettingsSection title="Mode">
      <SettingsGroup>
        <SettingRow
          label="Theme Mode"
          description="Choose a fixed appearance or follow the system setting."
        >
          <select
            class="form-select prefer-select"
            :value="settings.theme"
            @change="updateTheme(($event.target as HTMLSelectElement).value as 'light' | 'dark' | 'system')"
          >
            <option value="system">
              System
            </option>
            <option value="light">
              Light
            </option>
            <option value="dark">
              Dark
            </option>
          </select>
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>

    <!-- Theme Selection -->
    <SettingsSection title="Theme">
      <ThemeSelectorPanel @theme-change="handleThemeChange" />
    </SettingsSection>

    <!-- Typography -->
    <SettingsSection title="Typography">
      <SettingsGroup>
        <SettingRow
          label="Interface Density"
          description="Controls UI text scale and line height outside the chat message density setting."
        >
          <div class="segmented-control typography-density-control">
            <Button
              unstyled
              :class="['segment-btn', { active: currentTypographyDensity === 'compact' }]"
              native-type="button"
              @click="updateTypographyDensity('compact')"
            >
              Compact
            </Button>
            <Button
              unstyled
              :class="['segment-btn', { active: currentTypographyDensity === 'comfortable' }]"
              native-type="button"
              @click="updateTypographyDensity('comfortable')"
            >
              Comfortable
            </Button>
          </div>
        </SettingRow>

        <!-- Font Size -->
        <SettingRow description="Font size for chat text.">
          <template #label>
            <span class="setting-title-row">
              <span>Font Size</span>
              <Button
                unstyled
                class="reset-inline"
                native-type="button"
                title="Reset font size"
                @click="updateFontSize(defaultFontSize)"
              >
                <RotateCcw :size="14" />
              </Button>
            </span>
          </template>
          <InputNumber
            :model-value="currentFontSize"
            :min="minFontSize"
            :max="maxFontSize"
            aria-label="font size"
            @update:model-value="updateFontSize"
          />
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>

    <SettingsSection title="Context Compact">
      <SettingsGroup>
        <SettingRow
          label="Enable automatic compact"
          description="Summarizes older chat history before the context limit. Memory writes during compact are controlled separately in Memory settings."
        >
          <label class="native-toggle">
            <input
              type="checkbox"
              :checked="contextCompactEnabled"
              @change="updateContextCompactEnabled(($event.target as HTMLInputElement).checked)"
            >
          </label>
        </SettingRow>

        <SettingRow
          label="Auto compact threshold"
          description="Compact older chat history when context usage reaches this percentage."
        >
          <InputNumber
            :model-value="contextCompactThreshold"
            :min="50"
            :max="100"
            :step="5"
            suffix="%"
            :disabled="!contextCompactEnabled"
            aria-label="auto compact threshold"
            @update:model-value="updateContextCompactThreshold"
          />
        </SettingRow>

        <SettingRow
          label="Keep recent turns"
          description="Keep this many recent turns verbatim before summarizing older context."
        >
          <InputNumber
            :model-value="contextCompactKeepRecentTurns"
            :min="1"
            :max="20"
            :disabled="!contextCompactEnabled"
            aria-label="recent turns to keep"
            @update:model-value="updateContextCompactKeepRecentTurns"
          />
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>

    <!-- English Font -->
    <SettingsSection title="Fonts">
      <SettingsGroup>
        <SettingRow
          label="English Font"
          description="Primary Latin text face."
        >
          <select
            class="form-select font-select"
            :value="currentFontEn"
            @change="updateFontEn(($event.target as HTMLSelectElement).value)"
          >
            <option
              v-for="font in enFonts"
              :key="font.id"
              :value="font.id"
              :style="{ fontFamily: font.family }"
            >
              {{ font.name }}
            </option>
          </select>
        </SettingRow>

        <!-- Chinese Font -->
        <SettingRow
          label="中文字体"
          description="Primary CJK text face."
        >
          <select
            class="form-select font-select"
            :value="currentFontZh"
            @change="updateFontZh(($event.target as HTMLSelectElement).value)"
          >
            <option
              v-for="font in zhFonts"
              :key="font.id"
              :value="font.id"
              :style="{ fontFamily: font.family }"
            >
              {{ font.name }}
            </option>
          </select>
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>

    <SettingsSection title="Daily Notes">
      <SettingsGroup>
        <SettingRow
          label="Enable Search Everywhere daily notes"
          description="Adds the Daily tab and today shortcut."
        >
          <label class="native-toggle">
            <input
              type="checkbox"
              :checked="dailyNotes.enabled !== false"
              @change="updateDailyNotes({ enabled: ($event.target as HTMLInputElement).checked })"
            >
          </label>
        </SettingRow>

        <SettingRow
          label="Source Directory"
          description="Choose where daily note files are read from."
        >
          <div class="segmented-control">
            <Button
              unstyled
              :class="['segment-btn', { active: (dailyNotes.directoryMode || 'personal') === 'personal' }]"
              native-type="button"
              @click="updateDailyNotes({ directoryMode: 'personal' })"
            >
              Personal note dir
            </Button>
            <Button
              unstyled
              :class="['segment-btn', { active: dailyNotes.directoryMode === 'custom' }]"
              native-type="button"
              @click="updateDailyNotes({ directoryMode: 'custom' })"
            >
              Custom directory
            </Button>
          </div>
        </SettingRow>

        <SettingRow
          v-if="dailyNotes.directoryMode === 'custom'"
          label="Custom Directory"
          description="Folder containing daily note files."
        >
          <div
            class="directory-field"
          >
            <input
              class="form-input"
              :value="dailyNotes.customDirectory || ''"
              placeholder="/path/to/daily-notes"
              spellcheck="false"
              @input="updateDailyNotes({ customDirectory: ($event.target as HTMLInputElement).value })"
            >
            <Button
              unstyled
              class="secondary-btn"
              native-type="button"
              :disabled="!canChooseLocalDirectory"
              @click="chooseDailyNoteDirectory"
            >
              Choose
            </Button>
          </div>
        </SettingRow>

        <SettingRow
          label="Use Obsidian Daily Notes config"
          description="Reads .obsidian/daily-notes.json when available."
        >
          <label class="native-toggle">
            <input
              type="checkbox"
              :checked="dailyNotes.useObsidianConfig !== false"
              @change="updateDailyNotes({ useObsidianConfig: ($event.target as HTMLInputElement).checked })"
            >
          </label>
        </SettingRow>

        <SettingRow
          label="Fallback Date Format"
          description="Used when Obsidian daily note config is unavailable."
        >
          <input
            class="form-input"
            :value="dailyNotes.format || 'YYYY-MM-DD'"
            placeholder="YYYY-MM-DD"
            spellcheck="false"
            @input="updateDailyNotes({ format: ($event.target as HTMLInputElement).value })"
          >
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>

    <SettingsSection title="Todo / Plan">
      <SettingsGroup>
        <SettingRow
          label="Enable todo card"
          description="Shows the markdown todo and plan card in chat."
        >
          <label class="native-toggle">
            <input
              type="checkbox"
              :checked="todoPlan.enabled !== false"
              @change="updateTodoPlan({ enabled: ($event.target as HTMLInputElement).checked })"
            >
          </label>
        </SettingRow>

        <SettingRow
          label="Markdown Directory"
          description="Folder where todo and plan markdown files are stored."
        >
          <div class="directory-field">
            <input
              class="form-input"
              :value="todoPlan.directory || ''"
              placeholder="Default: ~/.onething/todo-plan"
              spellcheck="false"
              @input="updateTodoPlan({ directory: ($event.target as HTMLInputElement).value })"
            >
            <Button
              unstyled
              class="secondary-btn"
              native-type="button"
              :disabled="!canChooseLocalDirectory"
              @click="chooseTodoPlanDirectory"
            >
              Choose
            </Button>
          </div>
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { computed } from 'vue'
import { RotateCcw } from 'lucide-vue-next'
import type { AppSettings, TypographyDensity } from '@/types'
import type { DailyNoteSettings } from '@shared/ipc/settings'
import type { TodoPlanSettings } from '@shared/ipc/todo-plan'
import InputNumber from '@/components/common/InputNumber.vue'
import ThemeSelectorPanel from './ThemeSelectorPanel.vue'
import { getFontsByLang, DEFAULT_FONT_EN, DEFAULT_FONT_ZH } from '@shared/fonts'
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


// Available fonts by language
const enFonts = getFontsByLang('en')
const zhFonts = getFontsByLang('zh')
const minFontSize = 12
const maxFontSize = 20
const defaultFontSize = 15

const currentFontSize = computed(() => props.settings.chat?.chatFontSize ?? defaultFontSize)
const currentTypographyDensity = computed<TypographyDensity>(() => (
  props.settings.general.typographyDensity === 'comfortable' ? 'comfortable' : 'compact'
))
const currentFontEn = computed(() => props.settings.chat?.chatFontEn ?? DEFAULT_FONT_EN)
const currentFontZh = computed(() => props.settings.chat?.chatFontZh ?? DEFAULT_FONT_ZH)
const contextCompactEnabled = computed(() => props.settings.chat?.contextCompactEnabled !== false)
const contextCompactThreshold = computed(() => props.settings.chat?.contextCompactThreshold ?? 85)
const contextCompactKeepRecentTurns = computed(() => props.settings.chat?.contextCompactKeepRecentTurns ?? 6)
const canChooseLocalDirectory = computed(() => platformApi.capabilities.localFileSystem)
const dailyNotes = computed<DailyNoteSettings>(() => ({
  enabled: true,
  directoryMode: 'personal',
  customDirectory: '',
  useObsidianConfig: true,
  format: 'YYYY-MM-DD',
  ...props.settings.general.dailyNotes,
}))
const todoPlan = computed<TodoPlanSettings>(() => ({
  enabled: true,
  directory: '',
  cardHeight: 360,
  pinned: false,
  docked: false,
  ...props.settings.general.todoPlan,
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
      chatFontSize: Math.max(minFontSize, Math.min(maxFontSize, size)),
    },
  })
}

function updateTypographyDensity(typographyDensity: TypographyDensity) {
  emit('update:settings', {
    ...props.settings,
    general: {
      ...props.settings.general,
      typographyDensity,
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

function updateContextCompactEnabled(enabled: boolean) {
  emit('update:settings', {
    ...props.settings,
    chat: {
      ...props.settings.chat!,
      contextCompactEnabled: enabled,
    },
  })
}

function updateContextCompactThreshold(threshold: number) {
  emit('update:settings', {
    ...props.settings,
    chat: {
      ...props.settings.chat!,
      contextCompactThreshold: Math.max(50, Math.min(100, threshold)),
    },
  })
}

function updateContextCompactKeepRecentTurns(turns: number) {
  emit('update:settings', {
    ...props.settings,
    chat: {
      ...props.settings.chat!,
      contextCompactKeepRecentTurns: Math.max(1, Math.min(20, turns)),
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

function updateTodoPlan(patch: Partial<TodoPlanSettings>) {
  emit('update:settings', {
    ...props.settings,
    general: {
      ...props.settings.general,
      todoPlan: {
        ...todoPlan.value,
        ...patch,
      },
    },
  })
}

async function chooseDailyNoteDirectory() {
  if (!canChooseLocalDirectory.value) return
  const result = await platformApi.showOpenDialog({
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

async function chooseTodoPlanDirectory() {
  if (!canChooseLocalDirectory.value) return
  const result = await platformApi.showOpenDialog({
    title: 'Choose Todo / Plan Directory',
    properties: ['openDirectory'],
    defaultPath: todoPlan.value.directory || undefined,
  })
  if (!result.canceled && result.filePaths[0]) {
    updateTodoPlan({ directory: result.filePaths[0] })
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
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  background: var(--settings-paper, var(--ui-surface-panel-bg, var(--bg-panel)));
  border-radius: 12px;
  overflow: hidden;
}

.card-row {
  padding: 12px 14px;
  border-bottom: 1px solid var(--settings-rule-soft, var(--ui-border-subtle-border, var(--border-subtle)));
}

.card-row:last-child {
  border-bottom: none;
}

.setting-control-row {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) auto;
  align-items: center;
  column-gap: 32px;
}

.setting-copy {
  min-width: 0;
  max-width: 620px;
}

.setting-title-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.reset-inline {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--text-muted)));
  cursor: pointer;
}

.reset-inline:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text-primary)));
}

.app-input-number {
  flex-shrink: 0;
  justify-self: end;
}

.prefer-select {
  width: 176px;
  min-width: 154px;
  max-width: 100%;
  flex-shrink: 0;
  justify-self: end;
}

.font-select {
  width: 320px;
  min-width: 220px;
  max-width: 100%;
  justify-self: end;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: var(--type-caption-size);
  font-weight: var(--font-weight-bold);
  color: var(--ui-text-muted-fg, var(--text-muted));
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
  line-height: var(--type-label-line-height);
  color: var(--ui-text-primary-fg, var(--text-primary));
  margin-bottom: 8px;
}

.form-input {
  width: 100%;
  min-height: 34px;
  border: 1px solid var(--settings-rule, var(--ui-border-subtle-border, var(--border-subtle)));
  border-radius: 8px;
  background: var(--settings-paper-2, var(--ui-surface-app-bg, var(--bg)));
  color: var(--ui-text-primary-fg, var(--text-primary));
  font-size: var(--type-body-size);
  line-height: var(--type-body-line-height);
  padding: 7px 10px;
  outline: none;
}

.form-select {
  width: 100%;
  min-height: 34px;
  border: 1px solid var(--settings-rule, var(--ui-border-subtle-border, var(--border-subtle)));
  border-radius: 8px;
  background: var(--settings-paper-2, var(--ui-surface-app-bg, var(--bg)));
  color: var(--ui-text-primary-fg, var(--text-primary));
  font-size: var(--type-body-size);
  line-height: var(--type-body-line-height);
  padding: 7px 10px;
  outline: none;
}

.form-select.prefer-select {
  width: 176px;
  min-width: 154px;
  max-width: 100%;
  justify-self: end;
}

.form-select.font-select {
  width: 320px;
  min-width: 220px;
  max-width: 100%;
  justify-self: end;
}

.form-select:focus {
  border-color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  box-shadow: 0 0 0 2px var(--settings-accent-soft, color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 12%, transparent));
}

.form-input:focus {
  border-color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  box-shadow: 0 0 0 2px var(--settings-accent-soft, color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 12%, transparent));
}

.segmented-control {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px;
  width: 100%;
  padding: 2px;
  border: 1px solid var(--settings-rule, var(--ui-border-subtle-border, var(--border-subtle)));
  border-radius: 8px;
  background: var(--settings-paper-2, var(--ui-surface-app-bg, var(--bg)));
}

.typography-density-control {
  width: 320px;
  max-width: 100%;
  justify-self: end;
}

.segment-btn {
  min-height: 30px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-size: var(--type-label-size);
  line-height: var(--type-label-line-height);
  cursor: pointer;
}

.segment-btn:hover {
  color: var(--ui-text-primary-fg, var(--text-primary));
  background: var(--ui-state-hover-bg, var(--hover));
}

.segment-btn.active {
  color: var(--ui-text-primary-fg, var(--text-primary));
  background: var(--settings-paper, var(--ui-surface-panel-bg, var(--bg-panel)));
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

.segment-btn:focus-visible {
  outline: 2px solid var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  outline-offset: 2px;
}

.directory-field {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
}

.directory-field .form-input {
  flex: 1;
  min-width: 0;
}

.secondary-btn {
  flex-shrink: 0;
  min-height: 34px;
  border: 1px solid var(--settings-rule, var(--ui-border-subtle-border, var(--border-subtle)));
  border-radius: 8px;
  background: var(--settings-paper, transparent);
  color: var(--ui-text-primary-fg, var(--text-primary));
  padding: 0 12px;
  font-size: var(--type-label-size);
  line-height: var(--type-label-line-height);
  cursor: pointer;
}

.secondary-btn:hover {
  border-color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  background: var(--settings-paper-2, var(--ui-state-hover-bg, var(--hover)));
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
  line-height: var(--type-body-line-height);
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.toggle-desc {
  margin-top: 2px;
  font-size: var(--font-size-sm);
  line-height: var(--type-meta-line-height);
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.toggle-row input {
  width: 16px;
  height: 16px;
  accent-color: var(--ui-accent-primary-fg, var(--accent));
}

.native-toggle input {
  width: 16px;
  height: 16px;
  accent-color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
}

.label-value {
  margin-left: auto;
  color: var(--ui-accent-primary-fg, var(--accent));
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
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  border-radius: 12px;
  background: var(--settings-paper, transparent);
  padding: 0;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
  overflow: hidden;
}

.theme-card:hover {
  border-color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  transform: translateY(-1px);
}

.theme-card.active {
  border-color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  box-shadow: 0 0 0 3px var(--settings-accent-soft, color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 14%, transparent));
}

.theme-card span {
  display: block;
  padding: 10px 12px 11px;
  border-top: 1px solid var(--settings-rule-soft, rgba(128, 128, 128, 0.08));
  font-size: var(--type-label-size);
  font-weight: var(--type-label-weight);
  line-height: var(--type-label-line-height);
}

.theme-preview {
  height: 104px;
  border-radius: 0;
  margin-bottom: 0;
  display: flex;
  overflow: hidden;
}

.theme-preview.light {
  background: var(--ui-surface-preview-light-bg);
}

.theme-preview.dark {
  background: var(--ui-surface-preview-dark-bg);
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
  background: var(--ui-surface-preview-light-bg);
}

.preview-half.dark {
  background: var(--ui-surface-preview-dark-bg);
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
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}

.color-theme-btn:hover {
  border-color: var(--theme-main);
  background: var(--settings-paper-2, var(--ui-state-hover-bg, var(--bg-hover)));
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
  color: var(--ui-text-primary-fg, var(--text-primary));
}

/* Slider */
.form-slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--ui-border-default-border, var(--border));
  cursor: pointer;
  -webkit-appearance: none;
}

.form-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--ui-accent-primary-fg, var(--accent));
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: var(--type-caption-size);
  color: var(--ui-text-muted-fg, var(--text-muted));
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
  border-bottom: 1px solid var(--ui-border-default-border, var(--border));
}

.radio-item:last-child {
  border-bottom: none;
}

.radio-item:hover {
  background: var(--ui-state-hover-bg, var(--hover));
}

.radio-item.active {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 5%, transparent);
}

.radio-item input {
  position: absolute;
  opacity: 0;
}

.radio-label {
  font-size: var(--type-body-size);
  font-weight: var(--font-weight-semibold);
  color: var(--ui-text-primary-fg, var(--text-primary));
  margin-bottom: 2px;
}

.radio-desc {
  font-size: var(--font-size-sm);
  color: var(--ui-text-muted-fg, var(--text-muted));
}

/* Responsive */
@media (max-width: 480px) {
  .theme-cards {
    grid-template-columns: 1fr;
  }

  .setting-control-row {
    grid-template-columns: 1fr;
    align-items: stretch;
    row-gap: 10px;
  }

  .setting-copy {
    max-width: none;
  }

  .app-input-number {
    justify-self: start;
  }

  .form-select.prefer-select {
    width: 100%;
    justify-self: stretch;
  }

  .form-select.font-select {
    width: 100%;
    min-width: 0;
    justify-self: stretch;
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
  border: 1px solid var(--settings-rule, var(--ui-border-subtle-border, var(--border-subtle)));
  border-radius: 9px;
  background: var(--settings-paper, transparent);
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}

.font-option:hover {
  background: var(--settings-paper-2, var(--ui-state-hover-bg, var(--hover)));
  border-color: var(--settings-accent, var(--ui-border-default-border, var(--border-default)));
}

.font-option.active {
  border-color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  background: color-mix(in srgb, var(--settings-accent, var(--ui-accent-primary-fg, var(--accent))) 8%, transparent);
}

.font-preview {
  font-size: var(--type-body-size);
  color: var(--ui-text-primary-fg, var(--text-primary));
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.font-name {
  font-size: var(--type-caption-size);
  color: var(--ui-text-muted-fg, var(--text-muted));
  white-space: nowrap;
}

.font-tag {
  font-size: var(--type-micro-size);
  font-weight: var(--font-weight-semibold);
  line-height: var(--type-micro-line-height);
  color: var(--ui-text-faint-fg, var(--text-faint));
  background: var(--settings-paper-2, var(--ui-state-hover-bg, var(--bg-hover)));
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
}

</style>
