<template>
  <div class="tab-content">
    <!-- Temperature -->
    <section class="settings-section">
      <h3 class="section-title">Temperature</h3>
      <p class="section-desc">控制模型输出的随机性。较低的值使输出更确定，较高的值使输出更随机和创造性。</p>

      <div class="form-group">
        <label class="form-label">
          Temperature
          <span class="label-value">{{ chatSettings.temperature.toFixed(2) }}</span>
        </label>
        <input
          :value="chatSettings.temperature"
          @input="updateTemperature(($event.target as HTMLInputElement).valueAsNumber)"
          type="range"
          min="0"
          max="2"
          step="0.05"
          class="form-slider"
        />
        <div class="slider-labels">
          <span>精确 (0)</span>
          <span>平衡 (1)</span>
          <span>创意 (2)</span>
        </div>
      </div>

      <!-- Temperature presets -->
      <div class="preset-buttons">
        <button
          v-for="preset in temperaturePresets"
          :key="preset.value"
          :class="['preset-btn', { active: Math.abs(chatSettings.temperature - preset.value) < 0.01 }]"
          @click="updateTemperature(preset.value)"
        >
          {{ preset.label }}
        </button>
      </div>
    </section>

    <!-- Max Tokens -->
    <section class="settings-section">
      <h3 class="section-title">Max Output Tokens</h3>
      <p class="section-desc">模型生成的最大 token 数量。较大的值允许更长的回复，但可能会增加响应时间和成本。</p>

      <div class="form-group">
        <label class="form-label">
          Max Tokens
          <span class="label-value">{{ formatNumber(chatSettings.maxTokens) }}</span>
        </label>
        <input
          :value="chatSettings.maxTokens"
          @input="updateMaxTokens(($event.target as HTMLInputElement).valueAsNumber)"
          type="range"
          min="256"
          max="32768"
          step="256"
          class="form-slider"
        />
        <div class="slider-labels">
          <span>256</span>
          <span>16K</span>
          <span>32K</span>
        </div>
      </div>

      <!-- Max tokens presets -->
      <div class="preset-buttons">
        <button
          v-for="preset in maxTokensPresets"
          :key="preset.value"
          :class="['preset-btn', { active: chatSettings.maxTokens === preset.value }]"
          @click="updateMaxTokens(preset.value)"
        >
          {{ preset.label }}
        </button>
      </div>

      <!-- Direct input -->
      <div class="number-input-group">
        <label class="input-label">自定义值</label>
        <input
          type="number"
          :value="chatSettings.maxTokens"
          @input="updateMaxTokens(Number(($event.target as HTMLInputElement).value))"
          min="256"
          max="128000"
          class="number-input"
        />
      </div>
    </section>

    <!-- Branch Settings -->
    <section class="settings-section">
      <h3 class="section-title">Branch Settings</h3>
      <p class="section-desc">控制分支会话的创建行为。</p>

      <div class="toggle-row">
        <div class="toggle-info">
          <span class="toggle-label">分屏打开分支</span>
          <span class="toggle-desc">创建分支时在分屏中打开，而不是切换到新会话</span>
        </div>
        <button
          :class="['toggle-switch', { active: chatSettings.branchOpenInSplitScreen }]"
          @click="updateBranchOpenInSplitScreen(!chatSettings.branchOpenInSplitScreen)"
        >
          <span class="toggle-knob"></span>
        </button>
      </div>
    </section>

    <!-- Advanced Settings (collapsed by default) -->
    <section class="settings-section">
      <button class="advanced-toggle" @click="showAdvanced = !showAdvanced">
        <svg :class="['toggle-icon', { rotated: showAdvanced }]" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
        <h3 class="section-title inline">高级设置</h3>
      </button>

      <Transition name="slide">
        <div v-if="showAdvanced" class="advanced-content">
          <!-- Top P -->
          <div class="form-group">
            <label class="form-label">
              Top P (Nucleus Sampling)
              <span class="label-value">{{ (chatSettings.topP ?? 1).toFixed(2) }}</span>
            </label>
            <p class="field-desc">控制采样的多样性。较低的值限制选择概率最高的 token。</p>
            <input
              :value="chatSettings.topP ?? 1"
              @input="updateTopP(($event.target as HTMLInputElement).valueAsNumber)"
              type="range"
              min="0"
              max="1"
              step="0.05"
              class="form-slider"
            />
            <div class="slider-labels">
              <span>0</span>
              <span>1</span>
            </div>
          </div>

          <!-- Presence Penalty -->
          <div class="form-group">
            <label class="form-label">
              Presence Penalty
              <span class="label-value">{{ (chatSettings.presencePenalty ?? 0).toFixed(2) }}</span>
            </label>
            <p class="field-desc">增加讨论新话题的可能性。正值鼓励模型谈论新内容。</p>
            <input
              :value="chatSettings.presencePenalty ?? 0"
              @input="updatePresencePenalty(($event.target as HTMLInputElement).valueAsNumber)"
              type="range"
              min="-2"
              max="2"
              step="0.1"
              class="form-slider"
            />
            <div class="slider-labels">
              <span>-2</span>
              <span>0</span>
              <span>2</span>
            </div>
          </div>

          <!-- Frequency Penalty -->
          <div class="form-group">
            <label class="form-label">
              Frequency Penalty
              <span class="label-value">{{ (chatSettings.frequencyPenalty ?? 0).toFixed(2) }}</span>
            </label>
            <p class="field-desc">减少重复相同词语的可能性。正值使模型更少重复已说过的内容。</p>
            <input
              :value="chatSettings.frequencyPenalty ?? 0"
              @input="updateFrequencyPenalty(($event.target as HTMLInputElement).valueAsNumber)"
              type="range"
              min="-2"
              max="2"
              step="0.1"
              class="form-slider"
            />
            <div class="slider-labels">
              <span>-2</span>
              <span>0</span>
              <span>2</span>
            </div>
          </div>
        </div>
      </Transition>
    </section>

    <!-- Reset to defaults -->
    <section class="settings-section">
      <button class="reset-btn" @click="resetToDefaults">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
        </svg>
        恢复默认设置
      </button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { AppSettings, ChatSettings } from '@/types'

const props = defineProps<{
  settings: AppSettings
}>()

const emit = defineEmits<{
  'update:settings': [settings: AppSettings]
}>()

const showAdvanced = ref(false)

// Default values
const defaults: ChatSettings = {
  temperature: 0.7,
  maxTokens: 4096,
  topP: 1,
  presencePenalty: 0,
  frequencyPenalty: 0,
  branchOpenInSplitScreen: true,
}

// Get current chat settings with defaults
const chatSettings = computed<ChatSettings>(() => ({
  temperature: props.settings.chat?.temperature ?? defaults.temperature,
  maxTokens: props.settings.chat?.maxTokens ?? defaults.maxTokens,
  topP: props.settings.chat?.topP ?? defaults.topP,
  presencePenalty: props.settings.chat?.presencePenalty ?? defaults.presencePenalty,
  frequencyPenalty: props.settings.chat?.frequencyPenalty ?? defaults.frequencyPenalty,
  branchOpenInSplitScreen: props.settings.chat?.branchOpenInSplitScreen ?? defaults.branchOpenInSplitScreen,
}))

// Presets
const temperaturePresets = [
  { label: '精确', value: 0 },
  { label: '低', value: 0.3 },
  { label: '平衡', value: 0.7 },
  { label: '高', value: 1.0 },
  { label: '创意', value: 1.5 },
]

const maxTokensPresets = [
  { label: '1K', value: 1024 },
  { label: '2K', value: 2048 },
  { label: '4K', value: 4096 },
  { label: '8K', value: 8192 },
  { label: '16K', value: 16384 },
  { label: '32K', value: 32768 },
]

function formatNumber(num: number): string {
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`
  }
  return String(num)
}

function updateChatSettings(updates: Partial<ChatSettings>) {
  emit('update:settings', {
    ...props.settings,
    chat: {
      ...chatSettings.value,
      ...updates,
    }
  })
}

function updateTemperature(value: number) {
  updateChatSettings({ temperature: Math.max(0, Math.min(2, value)) })
}

function updateMaxTokens(value: number) {
  updateChatSettings({ maxTokens: Math.max(256, Math.min(128000, value)) })
}

function updateTopP(value: number) {
  updateChatSettings({ topP: Math.max(0, Math.min(1, value)) })
}

function updatePresencePenalty(value: number) {
  updateChatSettings({ presencePenalty: Math.max(-2, Math.min(2, value)) })
}

function updateFrequencyPenalty(value: number) {
  updateChatSettings({ frequencyPenalty: Math.max(-2, Math.min(2, value)) })
}

function updateBranchOpenInSplitScreen(value: boolean) {
  updateChatSettings({ branchOpenInSplitScreen: value })
}

function resetToDefaults() {
  emit('update:settings', {
    ...props.settings,
    chat: { ...defaults }
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
  margin: 0 0 8px 0;
  opacity: 0.8;
}

.section-title.inline {
  display: inline;
  margin: 0;
}

.section-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 16px 0;
  line-height: 1.5;
}

.form-group {
  margin-bottom: 20px;
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
  font-family: var(--font-mono);
}

.field-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0 0 8px 0;
  line-height: 1.4;
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
  transition: transform 0.15s ease;
}

.form-slider::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-muted);
}

/* Preset buttons */
.preset-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.preset-btn {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.preset-btn:hover {
  border-color: var(--accent);
  color: var(--text-primary);
}

.preset-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

/* Number input */
.number-input-group {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

.input-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.number-input {
  width: 120px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 14px;
  font-family: var(--font-mono);
}

.number-input:focus {
  outline: none;
  border-color: var(--accent);
}

/* Advanced toggle */
.advanced-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-secondary);
  transition: color 0.15s ease;
}

.advanced-toggle:hover {
  color: var(--text-primary);
}

.toggle-icon {
  transition: transform 0.2s ease;
}

.toggle-icon.rotated {
  transform: rotate(180deg);
}

.advanced-content {
  padding-top: 16px;
}

/* Reset button */
.reset-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.reset-btn:hover {
  border-color: var(--accent);
  color: var(--text-primary);
}

/* Slide animation */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
}

.slide-enter-to,
.slide-leave-from {
  max-height: 500px;
}

/* Toggle row for boolean settings */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
}

.toggle-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.toggle-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.toggle-desc {
  font-size: 12px;
  color: var(--text-muted);
}

.toggle-switch {
  position: relative;
  width: 44px;
  height: 24px;
  border: none;
  border-radius: 12px;
  background: var(--border);
  cursor: pointer;
  transition: background 0.2s ease;
  flex-shrink: 0;
}

.toggle-switch.active {
  background: var(--accent);
}

.toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s ease;
}

.toggle-switch.active .toggle-knob {
  transform: translateX(20px);
}
</style>
