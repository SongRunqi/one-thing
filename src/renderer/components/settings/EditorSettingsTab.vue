<template>
  <div class="tab-content">
    <!-- Tabs -->
    <SettingsSection title="Tabs">
      <SettingsGroup>
        <SettingRow
          label="Max Open Tabs"
          description="Maximum number of tabs kept open in a panel."
        >
          <InputNumber
            :model-value="currentMaxTabs"
            :min="3"
            :max="30"
            aria-label="max open tabs"
            @update:model-value="updateGeneral('maxTabs', $event)"
          />
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>

    <!-- Text Editor -->
    <SettingsSection title="Text Editor">
      <SettingsGroup>
        <SettingRow
          label="Tab Size"
          description="Number of spaces used for each tab stop."
        >
          <InputNumber
            :model-value="currentEditor.tabSize"
            :min="1"
            :max="8"
            aria-label="tab size"
            @update:model-value="updateEditor({ tabSize: $event })"
          />
        </SettingRow>

        <SettingRow label="Line Wrapping">
          <label class="toggle-row">
            <input
              type="checkbox"
              :checked="currentEditor.lineWrapping"
              @change="updateEditor({ lineWrapping: ($event.target as HTMLInputElement).checked })"
            >
          </label>
        </SettingRow>

        <SettingRow
          label="Soft Wrap Column"
          description="Preferred text width before soft wrapping."
        >
          <InputNumber
            :model-value="currentEditor.softWrapColumn"
            :values="softWrapColumnOptionsWithCurrent"
            suffix="ch"
            aria-label="soft wrap column"
            @update:model-value="updateEditor({ softWrapColumn: $event })"
          />
        </SettingRow>

        <SettingRow label="Syntax Highlighting">
          <label class="toggle-row">
            <input
              type="checkbox"
              :checked="currentEditor.syntaxHighlighting"
              @change="updateEditor({ syntaxHighlighting: ($event.target as HTMLInputElement).checked })"
            >
          </label>
        </SettingRow>

        <SettingRow label="Completions">
          <label class="toggle-row">
            <input
              type="checkbox"
              :checked="currentEditor.completionEnabled"
              @change="updateEditor({ completionEnabled: ($event.target as HTMLInputElement).checked })"
            >
          </label>
        </SettingRow>

        <SettingRow
          label="Composer Height"
          description="Maximum height of the message composer."
        >
          <InputNumber
            :model-value="currentEditor.composerMaxHeight"
            :values="composerHeightOptionsWithCurrent"
            suffix="px"
            aria-label="composer height"
            @update:model-value="updateEditor({ composerMaxHeight: $event })"
          />
        </SettingRow>

        <SettingRow
          label="Note Attachment Folder"
          description="Required for non-Obsidian note roots."
        >
          <input
            class="form-input"
            :value="currentEditor.markdownNoteAttachmentDirectory"
            placeholder="Required for non-Obsidian note roots"
            spellcheck="false"
            @input="updateEditor({ markdownNoteAttachmentDirectory: ($event.target as HTMLInputElement).value })"
          >
        </SettingRow>

        <SettingRow
          label="Project Attachment Folder"
          description="Where project note attachments are written."
        >
          <input
            class="form-input"
            :value="currentEditor.markdownProjectAttachmentDirectory"
            placeholder="Default: project root"
            spellcheck="false"
            @input="updateEditor({ markdownProjectAttachmentDirectory: ($event.target as HTMLInputElement).value })"
          >
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>

    <!-- File Preview -->
    <SettingsSection title="File Preview">
      <SettingsGroup>
        <SettingRow
          label="Preview Size Limit"
          description="Maximum file size to render in the preview."
        >
          <InputNumber
            :model-value="currentMaxFilePreviewKB"
            :values="previewSizeOptionsWithCurrent"
            suffix="KB"
            aria-label="preview size limit"
            @update:model-value="updateGeneral('maxFilePreviewKB', $event)"
          />
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AppSettings, EditorSettings } from '@/types'
import {
  SettingRow,
  SettingsGroup,
  SettingsSection,
} from './settings-primitives'
import InputNumber from '@/components/common/InputNumber.vue'

const props = defineProps<{
  settings: AppSettings
}>()

const emit = defineEmits<{
  'update:settings': [settings: AppSettings]
}>()

const currentMaxTabs = computed(() => props.settings.general.maxTabs ?? 15)
const currentMaxFilePreviewKB = computed(() => props.settings.general.maxFilePreviewKB ?? 256)
const currentEditor = computed<Required<EditorSettings>>(() => ({
  tabSize: props.settings.general.editor?.tabSize ?? 2,
  lineWrapping: props.settings.general.editor?.lineWrapping ?? true,
  softWrapColumn: props.settings.general.editor?.softWrapColumn ?? 88,
  syntaxHighlighting: props.settings.general.editor?.syntaxHighlighting ?? true,
  completionEnabled: props.settings.general.editor?.completionEnabled ?? true,
  composerMaxHeight: props.settings.general.editor?.composerMaxHeight ?? 200,
  markdownNoteAttachmentDirectory: props.settings.general.editor?.markdownNoteAttachmentDirectory ?? '',
  markdownProjectAttachmentDirectory: props.settings.general.editor?.markdownProjectAttachmentDirectory ?? '',
}))

const softWrapColumnOptions = [40, 60, 72, 80, 88, 100, 120, 140, 160, 180, 200]
const composerHeightOptions = [80, 120, 160, 200, 240, 280, 320, 360, 400, 480, 560, 640]
const previewSizeOptions = [64, 128, 256, 384, 512, 768, 1024]

function withCurrentOption(options: number[], current: number): number[] {
  return Array.from(new Set([...options, current])).sort((a, b) => a - b)
}

const softWrapColumnOptionsWithCurrent = computed(() =>
  withCurrentOption(softWrapColumnOptions, currentEditor.value.softWrapColumn)
)
const composerHeightOptionsWithCurrent = computed(() =>
  withCurrentOption(composerHeightOptions, currentEditor.value.composerMaxHeight)
)
const previewSizeOptionsWithCurrent = computed(() =>
  withCurrentOption(previewSizeOptions, currentMaxFilePreviewKB.value)
)

function updateGeneral(key: string, value: number) {
  emit('update:settings', {
    ...props.settings,
    general: {
      ...props.settings.general,
      [key]: value,
    },
  })
}

function updateEditor(patch: EditorSettings) {
  emit('update:settings', {
    ...props.settings,
    general: {
      ...props.settings.general,
      editor: {
        ...currentEditor.value,
        ...patch,
      },
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

.card-row.compact {
  padding: 10px 14px;
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
  color: var(--ui-text-primary-fg, var(--text-primary));
  margin-bottom: 8px;
}

.label-value {
  margin-left: auto;
  color: var(--ui-accent-primary-fg, var(--accent));
  font-weight: var(--font-weight-semibold);
}

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

.form-input {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 7px;
  outline: 0;
  color: var(--ui-text-primary-fg, var(--text-primary));
  background: var(--ui-surface-input-bg, var(--bg-input, var(--bg)));
  font: inherit;
}

.form-select {
  min-height: 34px;
  padding: 0 34px 0 10px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  border-radius: 7px;
  outline: 0;
  color: var(--ui-text-primary-fg, var(--text-primary));
  background: var(--ui-surface-input-bg, var(--bg-input, var(--bg)));
  font: inherit;
}

.prefer-select {
  min-width: 154px;
}

.form-select:focus {
  border-color: var(--ui-accent-primary-fg, var(--accent));
}

.form-input:focus {
  border-color: var(--ui-accent-primary-fg, var(--accent));
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: var(--type-caption-size);
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: var(--type-label-size);
  font-weight: var(--type-label-weight);
  color: var(--ui-text-primary-fg, var(--text-primary));
  cursor: pointer;
}

.toggle-row input {
  width: 16px;
  height: 16px;
  accent-color: var(--ui-accent-primary-fg, var(--accent));
}
</style>
