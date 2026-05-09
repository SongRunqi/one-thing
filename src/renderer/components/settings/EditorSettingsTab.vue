<template>
  <div class="tab-content">
    <!-- Tabs -->
    <section class="settings-section">
      <h3 class="section-title">Tabs</h3>
      <div class="settings-card">
        <div class="card-row">
          <div class="form-group">
            <label class="form-label">
              Max Open Tabs
              <span class="label-value">{{ currentMaxTabs }}</span>
            </label>
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
          </div>
        </div>
      </div>
    </section>

    <!-- File Preview -->
    <section class="settings-section">
      <h3 class="section-title">File Preview</h3>
      <div class="settings-card">
        <div class="card-row">
          <div class="form-group">
            <label class="form-label">
              Preview Size Limit
              <span class="label-value">{{ currentMaxFilePreviewKB }}KB</span>
            </label>
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
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AppSettings } from '@/types'

const props = defineProps<{
  settings: AppSettings
}>()

const emit = defineEmits<{
  'update:settings': [settings: AppSettings]
}>()

const currentMaxTabs = computed(() => props.settings.general.maxTabs ?? 15)
const currentMaxFilePreviewKB = computed(() => props.settings.general.maxFilePreviewKB ?? 256)

function updateGeneral(key: string, value: number) {
  emit('update:settings', {
    ...props.settings,
    general: {
      ...props.settings.general,
      [key]: value,
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

.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: var(--type-caption-size);
  color: var(--text-muted);
}
</style>
