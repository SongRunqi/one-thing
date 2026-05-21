<template>
  <div class="tab-content">
    <!-- Tabs -->
    <SettingsSection title="Tabs">
      <SettingsGroup>
        <SettingRow layout="stack">
          <SettingsField
            label="Max Open Tabs"
            :value="currentMaxTabs"
          >
            <input
              type="range"
              class="form-slider"
              :min="3"
              :max="30"
              :step="1"
              :value="currentMaxTabs"
              @input="updateGeneral('maxTabs', Number(($event.target as HTMLInputElement).value))"
            >
            <div class="slider-labels">
              <span>3</span>
              <span>15</span>
              <span>30</span>
            </div>
          </SettingsField>
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>

    <!-- Text Editor -->
    <SettingsSection title="Text Editor">
      <SettingsGroup>
        <SettingRow layout="stack">
          <SettingsField
            label="Tab Size"
            :value="currentEditor.tabSize"
          >
            <input
              type="range"
              class="form-slider"
              :min="1"
              :max="8"
              :step="1"
              :value="currentEditor.tabSize"
              @input="updateEditor({ tabSize: Number(($event.target as HTMLInputElement).value) })"
            >
            <div class="slider-labels">
              <span>1</span>
              <span>4</span>
              <span>8</span>
            </div>
          </SettingsField>
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

        <SettingRow layout="stack">
          <SettingsField
            label="Soft Wrap Column"
            :value="`${currentEditor.softWrapColumn}ch`"
          >
            <input
              type="range"
              class="form-slider"
              :min="40"
              :max="200"
              :step="4"
              :value="currentEditor.softWrapColumn"
              @input="updateEditor({ softWrapColumn: Number(($event.target as HTMLInputElement).value) })"
            >
            <div class="slider-labels">
              <span>40</span>
              <span>88</span>
              <span>200</span>
            </div>
          </SettingsField>
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

        <SettingRow layout="stack">
          <SettingsField
            label="Composer Height"
            :value="`${currentEditor.composerMaxHeight}px`"
          >
            <input
              type="range"
              class="form-slider"
              :min="80"
              :max="640"
              :step="20"
              :value="currentEditor.composerMaxHeight"
              @input="updateEditor({ composerMaxHeight: Number(($event.target as HTMLInputElement).value) })"
            >
            <div class="slider-labels">
              <span>80px</span>
              <span>360px</span>
              <span>640px</span>
            </div>
          </SettingsField>
        </SettingRow>

        <SettingRow layout="stack">
          <SettingsField label="Note Attachment Folder">
            <input
              class="form-input"
              :value="currentEditor.markdownNoteAttachmentDirectory"
              placeholder="Required for non-Obsidian note roots"
              spellcheck="false"
              @input="updateEditor({ markdownNoteAttachmentDirectory: ($event.target as HTMLInputElement).value })"
            >
          </SettingsField>
        </SettingRow>

        <SettingRow layout="stack">
          <SettingsField label="Project Attachment Folder">
            <input
              class="form-input"
              :value="currentEditor.markdownProjectAttachmentDirectory"
              placeholder="Default: project root"
              spellcheck="false"
              @input="updateEditor({ markdownProjectAttachmentDirectory: ($event.target as HTMLInputElement).value })"
            >
          </SettingsField>
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>

    <!-- File Preview -->
    <SettingsSection title="File Preview">
      <SettingsGroup>
        <SettingRow layout="stack">
          <SettingsField
            label="Preview Size Limit"
            :value="`${currentMaxFilePreviewKB}KB`"
          >
            <input
              type="range"
              class="form-slider"
              :min="64"
              :max="1024"
              :step="64"
              :value="currentMaxFilePreviewKB"
              @input="updateGeneral('maxFilePreviewKB', Number(($event.target as HTMLInputElement).value))"
            >
            <div class="slider-labels">
              <span>64KB</span>
              <span>512KB</span>
              <span>1MB</span>
            </div>
          </SettingsField>
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
  SettingsField,
  SettingsGroup,
  SettingsSection,
} from './settings-primitives'

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
  color: var(--text-muted);
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
  color: var(--text-primary);
  margin-bottom: 8px;
}

.label-value {
  margin-left: auto;
  color: var(--accent);
  font-weight: var(--font-weight-semibold);
}

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

.form-input {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 7px;
  outline: 0;
  color: var(--text-primary);
  background: var(--bg-input, var(--bg));
  font: inherit;
}

.form-input:focus {
  border-color: var(--accent);
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: var(--type-caption-size);
  color: var(--text-muted);
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: var(--type-label-size);
  font-weight: var(--type-label-weight);
  color: var(--text-primary);
  cursor: pointer;
}

.toggle-row input {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}
</style>
