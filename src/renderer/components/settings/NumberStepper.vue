<template>
  <div
    class="number-stepper"
    :class="[`number-stepper-${size}`, { disabled }]"
  >
    <button
      class="stepper-btn"
      type="button"
      :aria-label="`Decrease ${ariaLabel || 'value'}`"
      :disabled="disabled || !canDecrease"
      @click="stepBy(-1)"
    >
      -
    </button>
    <span class="stepper-value">
      <input
        class="stepper-input"
        type="number"
        inputmode="decimal"
        :aria-label="ariaLabel || 'value'"
        :value="draftValue"
        :min="min"
        :max="max"
        :step="step"
        :disabled="disabled"
        @input="draftValue = ($event.target as HTMLInputElement).value"
        @change="commitDraft"
        @blur="commitDraft"
        @keydown.enter.prevent="commitDraft"
      >
      <span
        v-if="suffix"
        class="stepper-suffix"
      >{{ suffix }}</span>
    </span>
    <button
      class="stepper-btn"
      type="button"
      :aria-label="`Increase ${ariaLabel || 'value'}`"
      :disabled="disabled || !canIncrease"
      @click="stepBy(1)"
    >
      +
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: number
  min?: number
  max?: number
  step?: number
  values?: number[]
  suffix?: string
  disabled?: boolean
  ariaLabel?: string
  size?: 'regular' | 'compact'
}>(), {
  min: undefined,
  max: undefined,
  step: 1,
  values: () => [],
  suffix: '',
  disabled: false,
  ariaLabel: '',
  size: 'regular',
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const steppedValues = computed(() =>
  props.values?.length
    ? Array.from(new Set(props.values)).sort((a, b) => a - b)
    : []
)

const draftValue = ref(String(props.modelValue))

watch(() => props.modelValue, value => {
  draftValue.value = String(value)
})

const canDecrease = computed(() => nextValue(-1) !== props.modelValue)
const canIncrease = computed(() => nextValue(1) !== props.modelValue)

function clamp(value: number) {
  const min = props.min ?? Number.NEGATIVE_INFINITY
  const max = props.max ?? Number.POSITIVE_INFINITY
  return Math.max(min, Math.min(max, value))
}

function decimalPlaces(value: number) {
  const [, decimal = ''] = String(value).split('.')
  return decimal.length
}

function normalize(value: number) {
  const precision = decimalPlaces(props.step)
  return precision > 0 ? Number(value.toFixed(precision)) : Math.round(value)
}

function nextValue(direction: -1 | 1) {
  if (steppedValues.value.length > 0) {
    if (direction < 0) {
      for (let index = steppedValues.value.length - 1; index >= 0; index -= 1) {
        const value = steppedValues.value[index]
        if (value < props.modelValue) return value
      }
      return props.modelValue
    }
    return steppedValues.value.find(value => value > props.modelValue) ?? props.modelValue
  }

  return normalize(clamp(props.modelValue + props.step * direction))
}

function stepBy(direction: -1 | 1) {
  if (props.disabled) return
  emit('update:modelValue', nextValue(direction))
}

function commitDraft() {
  if (props.disabled) return
  const parsed = Number(draftValue.value)
  if (!Number.isFinite(parsed)) {
    draftValue.value = String(props.modelValue)
    return
  }
  const next = normalize(clamp(parsed))
  draftValue.value = String(next)
  if (next !== props.modelValue) {
    emit('update:modelValue', next)
  }
}
</script>

<style scoped>
.number-stepper {
  flex-shrink: 0;
  justify-self: end;
  display: inline-grid;
  grid-template-columns: 36px minmax(58px, auto) 36px;
  min-height: 30px;
  border: 1px solid var(--settings-rule, var(--ui-border-subtle-border, var(--border-subtle)));
  border-radius: 6px;
  overflow: hidden;
  background: var(--settings-paper-2, var(--ui-surface-app-bg, var(--bg)));
}

.number-stepper:focus-within {
  border-color: color-mix(in srgb, var(--settings-accent, var(--ui-accent-primary-fg, var(--accent))) 52%, var(--settings-rule, var(--ui-border-subtle-border, var(--border-subtle))));
  box-shadow: 0 0 0 2px var(--settings-accent-soft, color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 12%, transparent));
}

.number-stepper-compact {
  grid-template-columns: 20px minmax(44px, auto) 20px;
  min-height: 22px;
  border-radius: 5px;
}

.number-stepper.disabled {
  opacity: 0.58;
}

.stepper-btn {
  border: 0;
  background: transparent;
  color: var(--settings-ink-2, var(--ui-text-primary-fg, var(--text-primary)));
  font: inherit;
  font-size: 17px;
  cursor: pointer;
}

.stepper-btn:not(:last-child) {
  border-right: 1px solid var(--settings-rule, var(--ui-border-subtle-border, var(--border-subtle)));
}

.stepper-btn:last-child {
  border-left: 1px solid var(--settings-rule, var(--ui-border-subtle-border, var(--border-subtle)));
}

.stepper-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.stepper-btn:hover:not(:disabled) {
  background: var(--ui-state-hover-bg, var(--hover));
}

.number-stepper-compact .stepper-btn {
  font-size: 13px;
}

.stepper-value {
  display: inline-grid;
  grid-template-columns: minmax(34px, auto) auto;
  align-items: center;
  justify-content: center;
  min-width: 58px;
  padding: 0 7px;
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text-primary)));
  font-size: 15px;
  font-weight: 650;
  white-space: nowrap;
}

.number-stepper-compact .stepper-value {
  min-width: 44px;
  padding: 0 3px;
  font-size: 11px;
  font-family: var(--font-mono, 'SF Mono', monospace);
}

.stepper-input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: none;
  box-shadow: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-variant-numeric: tabular-nums;
  text-align: center;
  -moz-appearance: textfield;
  appearance: textfield;
}

.stepper-input:focus,
.stepper-input:focus-visible {
  outline: none;
  box-shadow: none;
}

.stepper-input::-webkit-outer-spin-button,
.stepper-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.stepper-input:disabled {
  cursor: not-allowed;
}

.stepper-suffix {
  margin-left: 1px;
  color: var(--settings-ink-3, var(--ui-text-secondary-fg, var(--text-secondary)));
  font-size: 0.82em;
}
</style>
