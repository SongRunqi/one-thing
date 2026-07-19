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

    <SettingsSection title="Agent Turns">
      <SettingsGroup>
        <SettingRow
          label="Max turns per run"
          description="Model round-trips allowed before a response is cut off (finishReason 'max_turns'). Raise this for tool-heavy tasks that need many steps in a row."
        >
          <InputNumber
            :model-value="maxTurns"
            :min="1"
            :max="500"
            aria-label="max turns per run"
            @update:model-value="updateMaxTurns"
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
const maxTurns = computed(() => props.settings.chat?.maxTurns ?? 100)
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

function updateMaxTurns(turns: number) {
  emit('update:settings', {
    ...props.settings,
    chat: {
      ...props.settings.chat!,
      maxTurns: Math.max(1, Math.min(500, Math.round(turns))),
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
/*
 * General tab — ledger 画线风.
 * Row/input/toggle/button visuals come from the SettingsPage :deep() layer;
 * only layout and tab-specific line-work live here.
 */
.tab-content {
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.setting-title-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.reset-inline {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--text-muted)));
  cursor: pointer;
  transition: color 0.12s ease;
}

.reset-inline:hover {
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text-primary)));
}

.app-input-number {
  flex-shrink: 0;
}

.form-select {
  min-width: 0;
  padding: 6px 10px;
}

.form-select.prefer-select {
  width: 100%;
  max-width: 176px;
  min-width: 0;
}

.form-select.font-select {
  width: 100%;
  max-width: 320px;
  min-width: 0;
}

/* Segmented control: one ruled box; the active segment is marked by an
   accent underline (a line, not a filled pill). */
.segmented-control {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  width: 100%;
  max-width: 320px;
  min-width: 0;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  border-radius: 0;
  background: transparent;
}

.segment-btn {
  min-height: 30px;
  min-width: 0;
  padding-inline: 12px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--settings-ink-3, var(--ui-text-muted-fg, var(--text-muted)));
  font-size: var(--type-label-size);
  line-height: var(--type-label-line-height);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: color 0.12s ease;
}

.segment-btn + .segment-btn {
  border-left: 1px solid var(--settings-rule-soft, var(--ui-border-subtle-border, var(--border-subtle)));
}

.segment-btn:hover {
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text-primary)));
  background: transparent;
}

.segment-btn.active {
  color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  background: transparent;
  box-shadow: inset 0 -2px 0 var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
}

.directory-field {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  min-width: 0;
}

.directory-field .form-input {
  flex: 1;
  min-width: 0;
}

.form-input {
  width: 100%;
  min-width: 0;
  padding: 6px 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.secondary-btn {
  flex-shrink: 0;
  min-height: 32px;
  padding: 0 12px;
  cursor: pointer;
}

/* Disabled = dashed line + faint ink, not an opacity veil. */
.secondary-btn:disabled {
  border-style: dashed;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--text-muted)));
  cursor: not-allowed;
}
</style>
