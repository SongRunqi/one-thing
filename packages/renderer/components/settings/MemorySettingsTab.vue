<template>
  <div class="tab-content memory-settings-tab">
    <SettingsSection
      title="Basics"
      description="Choose where memory lives and whether it participates in chat."
    >
      <SettingsGroup>
        <SettingRow
          label="Enable Memory"
          description="Use saved notes and daily captures during conversations."
        >
          <label class="native-toggle">
            <input
              type="checkbox"
              :checked="memory.enabled !== false"
              @change="updateMemory({ enabled: ($event.target as HTMLInputElement).checked })"
            >
          </label>
        </SettingRow>

        <SettingRow
          label="Directory"
          description="The memory workspace. AI note dir follows the configured note directory; custom uses a dedicated folder."
          layout="stack"
        >
          <div class="memory-directory-control">
            <div class="segmented-control">
              <Button
                unstyled
                :class="['segment-btn', { active: memory.directoryMode === 'ai-note-dir' }]"
                native-type="button"
                @click="updateMemory({ directoryMode: 'ai-note-dir' })"
              >
                AI note dir
              </Button>
              <Button
                unstyled
                :class="['segment-btn', { active: memory.directoryMode === 'custom' }]"
                native-type="button"
                @click="updateMemory({ directoryMode: 'custom' })"
              >
                Custom
              </Button>
            </div>
            <div
              v-if="memory.directoryMode === 'custom'"
              class="directory-field"
            >
              <input
                class="form-input"
                :value="memory.customDirectory"
                placeholder="/path/to/memory"
                spellcheck="false"
                @input="updateMemory({ customDirectory: ($event.target as HTMLInputElement).value })"
              >
              <Button
                unstyled
                class="secondary-btn"
                native-type="button"
                @click="chooseMemoryDirectory"
              >
                Choose
              </Button>
            </div>
          </div>
        </SettingRow>

        <SettingRow
          label="Prompt cap"
          description="Maximum characters from bootstrap memory added to the prompt."
        >
          <InputNumber
            :model-value="memory.bootstrapMaxChars"
            :min="1000"
            :max="50000"
            :step="1000"
            aria-label="memory prompt cap"
            @update:model-value="value => updateMemory({ bootstrapMaxChars: value })"
          />
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>

    <SettingsSection
      title="Capture"
      description="Extract daily-note bullets after assistant replies."
    >
      <SettingsGroup>
        <SettingRow
          label="Mode"
          description="Auto captures daily notes after replies. Explicit only waits for clear remember intent."
        >
          <select
            class="form-select"
            :value="captureMode"
            :disabled="memoryDisabled"
            @change="updateCaptureMode(($event.target as HTMLSelectElement).value)"
          >
            <option value="auto">
              Auto
            </option>
            <option value="explicit-only">
              Explicit only
            </option>
            <option value="off">
              Off
            </option>
          </select>
        </SettingRow>

        <div class="settings-grid-row">
          <SettingRow
            label="Input chars"
            description="Maximum conversation text sent to capture."
          >
            <InputNumber
              :model-value="memory.capture.maxInputChars"
              :min="1000"
              :max="50000"
              :step="1000"
              :disabled="memoryDisabled || memory.capture.mode === 'off'"
              aria-label="capture input chars"
              @update:model-value="value => updateCapture({ maxInputChars: value })"
            />
          </SettingRow>
          <SettingRow
            label="Timeout"
            description="Maximum capture time."
          >
            <InputNumber
              :model-value="memory.capture.timeoutMs"
              :min="1000"
              :max="60000"
              :step="1000"
              suffix="ms"
              :disabled="memoryDisabled || memory.capture.mode === 'off'"
              aria-label="capture timeout"
              @update:model-value="value => updateCapture({ timeoutMs: value })"
            />
          </SettingRow>
        </div>
      </SettingsGroup>
    </SettingsSection>

    <SettingsSection
      title="Review"
      description="Periodically distills quiet conversations into SOUL.md."
    >
      <SettingsGroup>
        <SettingRow
          label="Enable review"
          description="Runs after a conversation goes idle once enough new user messages accumulated."
        >
          <label class="native-toggle">
            <input
              type="checkbox"
              :checked="memory.review.enabled !== false"
              :disabled="memoryDisabled"
              @change="updateReview({ enabled: ($event.target as HTMLInputElement).checked })"
            >
          </label>
        </SettingRow>

        <SettingRow
          label="Interval"
          description="Minimum user messages between reviews."
        >
          <InputNumber
            :model-value="memory.review.interval"
            :min="1"
            :max="200"
            :disabled="memoryDisabled || memory.review.enabled === false"
            aria-label="review interval"
            @update:model-value="value => updateReview({ interval: value })"
          />
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>

    <SettingsSection
      title="Diagnostics"
      description="Controls retained diagnostics; the Memory panel now shows health instead of raw logs."
    >
      <SettingsGroup>
        <SettingRow
          label="Enable diagnostics"
          description="Record memory operation diagnostics on disk."
        >
          <label class="native-toggle">
            <input
              type="checkbox"
              :checked="memory.logging.enabled !== false"
              :disabled="memoryDisabled"
              @change="updateLogging({ enabled: ($event.target as HTMLInputElement).checked })"
            >
          </label>
        </SettingRow>

        <SettingRow
          label="Level"
          description="Minimum diagnostic detail recorded."
        >
          <select
            class="form-select"
            :value="memory.logging.level"
            :disabled="memoryDisabled || memory.logging.enabled === false"
            @change="updateLogging({ level: ($event.target as HTMLSelectElement).value as SoulMemoryLoggingSettings['level'] })"
          >
            <option value="debug">
              Debug
            </option>
            <option value="info">
              Info
            </option>
            <option value="warn">
              Warn
            </option>
            <option value="error">
              Error
            </option>
          </select>
        </SettingRow>

        <div class="settings-grid-row">
          <SettingRow
            label="Retention"
            description="Days of diagnostic files to keep."
          >
            <InputNumber
              :model-value="memory.logging.retentionDays"
              :min="1"
              :max="90"
              suffix="d"
              :disabled="memoryDisabled || memory.logging.enabled === false"
              aria-label="memory log retention"
              @update:model-value="value => updateLogging({ retentionDays: value })"
            />
          </SettingRow>
          <SettingRow
            label="Preview chars"
            description="Maximum request/response preview size."
          >
            <InputNumber
              :model-value="memory.logging.maxPreviewChars"
              :min="120"
              :max="4000"
              :step="20"
              :disabled="memoryDisabled || memory.logging.enabled === false"
              aria-label="memory log preview chars"
              @update:model-value="value => updateLogging({ maxPreviewChars: value })"
            />
          </SettingRow>
        </div>

        <SettingRow
          label="Include HTTP error body"
          description="Store provider error body previews when memory calls fail."
        >
          <label class="native-toggle">
            <input
              type="checkbox"
              :checked="memory.logging.includeHttpErrorBody !== false"
              :disabled="memoryDisabled || memory.logging.enabled === false"
              @change="updateLogging({ includeHttpErrorBody: ($event.target as HTMLInputElement).checked })"
            >
          </label>
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { computed } from 'vue'
import type { AppSettings } from '@/types'
import type {
  SoulMemoryCaptureSettings,
  SoulMemoryLoggingSettings,
  SoulMemoryReviewSettings,
  SoulMemorySettings,
} from '@shared/ipc/settings'
import { normalizeSoulMemorySettings } from '@shared/defaults/settings'
import InputNumber from '@/components/common/InputNumber.vue'
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

type NormalizedSoulMemorySettings = Omit<
  Required<SoulMemorySettings>,
  | 'capture'
  | 'logging'
  | 'review'
> & {
  capture: Required<SoulMemoryCaptureSettings>
  logging: Required<SoulMemoryLoggingSettings>
  review: Required<SoulMemoryReviewSettings>
}

const memory = computed<NormalizedSoulMemorySettings>(() =>
  normalizeSoulMemorySettings(props.settings.general.soulMemory) as NormalizedSoulMemorySettings,
)
const memoryDisabled = computed(() => memory.value.enabled === false)
const captureMode = computed(() => memory.value.capture.mode)

function updateMemory(patch: Partial<SoulMemorySettings>): void {
  const nextMemory = normalizeSoulMemorySettings({
    ...memory.value,
    ...patch,
  })
  emit('update:settings', {
    ...props.settings,
    general: {
      ...props.settings.general,
      soulMemory: nextMemory,
    },
  })
}

function updateCapture(patch: Partial<SoulMemoryCaptureSettings>): void {
  updateMemory({ capture: { ...memory.value.capture, ...patch } })
}

function updateCaptureMode(mode: string): void {
  updateCapture({ mode: mode as SoulMemoryCaptureSettings['mode'] })
}

function updateReview(patch: Partial<SoulMemoryReviewSettings>): void {
  updateMemory({ review: { ...memory.value.review, ...patch } })
}

function updateLogging(patch: Partial<SoulMemoryLoggingSettings>): void {
  updateMemory({ logging: { ...memory.value.logging, ...patch } })
}

async function chooseMemoryDirectory(): Promise<void> {
  const result = await platformApi.showOpenDialog({
    title: 'Choose Memory Directory',
    properties: ['openDirectory'],
    defaultPath: memory.value.customDirectory || undefined,
  })
  if (!result.canceled && result.filePaths[0]) {
    updateMemory({
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

.memory-settings-tab {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.memory-directory-control {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.memory-directory-control .segmented-control {
  width: fit-content;
  max-width: 100%;
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(92px, 1fr));
}

.memory-directory-control .segment-btn {
  min-width: 0;
  padding-inline: 12px;
  white-space: nowrap;
}

.directory-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  width: 100%;
}

.settings-grid-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-bottom: 1px solid var(--settings-rule-soft, var(--ui-border-default-border, var(--border)));
}

.settings-grid-row :deep(.setting-row) {
  border-bottom: 0;
}

/* Half-width cells: the default head grid reserves up to 420px for the
   control column and crushes the label into vertical letter-wrap. Let the
   control take only its intrinsic width instead. */
.settings-grid-row :deep(.setting-row-head) {
  grid-template-columns: minmax(0, 1fr) auto;
}

.settings-grid-row :deep(.setting-row:first-child) {
  border-right: 1px solid var(--settings-rule-soft, var(--ui-border-default-border, var(--border)));
}

@media (max-width: 760px) {
  .settings-grid-row {
    grid-template-columns: 1fr;
  }

  .settings-grid-row :deep(.setting-row:first-child) {
    border-right: 0;
    border-bottom: 1px solid var(--settings-rule-soft, var(--ui-border-default-border, var(--border)));
  }

  .directory-field {
    grid-template-columns: 1fr;
  }
}
</style>
