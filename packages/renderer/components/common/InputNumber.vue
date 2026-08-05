<template>
  <div
    ref="rootRef"
    class="app-input-number"
    :class="inputNumberClasses"
    @dragstart.prevent
  >
    <button
      v-if="controls"
      class="app-input-number-control app-input-number-decrease"
      type="button"
      :disabled="decreaseDisabled"
      :aria-label="decreaseAriaLabel"
      @click="decrease"
      @keydown.enter.prevent="decrease"
    >
      <slot name="decrease-icon">
        <ChevronDown
          v-if="controlsAtRight"
          :size="controlIconSize"
          :stroke-width="2.1"
          aria-hidden="true"
        />
        <Minus
          v-else
          :size="controlIconSize"
          :stroke-width="2.1"
          aria-hidden="true"
        />
      </slot>
    </button>

    <div class="app-input-number-input-wrap">
      <span
        v-if="$slots.prefix"
        class="app-input-number-affix app-input-number-prefix"
      >
        <slot name="prefix" />
      </span>

      <input
        :id="id"
        ref="inputRef"
        class="app-input-number-input"
        role="spinbutton"
        :type="inputType"
        :value="displayValue"
        :step="numericStep"
        :min="resolvedMin"
        :max="resolvedMax"
        :name="name"
        :placeholder="placeholder"
        :readonly="readonly"
        :disabled="isDisabled"
        :aria-label="resolvedAriaLabel"
        :aria-valuemin="resolvedMin"
        :aria-valuemax="resolvedMax"
        :aria-valuenow="ariaValueNow"
        :aria-disabled="isDisabled ? 'true' : undefined"
        :inputmode="inputmode"
        :tabindex="tabindex"
        @keydown="handleKeydown"
        @focus="handleFocus"
        @blur="handleBlur"
        @input="handleInput"
        @change="handleInputChange"
        @wheel="handleWheel"
      >

      <span
        v-if="$slots.suffix || suffix"
        class="app-input-number-affix app-input-number-suffix"
      >
        <slot name="suffix">
          {{ suffix }}
        </slot>
      </span>
    </div>

    <button
      v-if="controls"
      class="app-input-number-control app-input-number-increase"
      type="button"
      :disabled="increaseDisabled"
      :aria-label="increaseAriaLabel"
      @click="increase"
      @keydown.enter.prevent="increase"
    >
      <slot name="increase-icon">
        <ChevronUp
          v-if="controlsAtRight"
          :size="controlIconSize"
          :stroke-width="2.1"
          aria-hidden="true"
        />
        <Plus
          v-else
          :size="controlIconSize"
          :stroke-width="2.1"
          aria-hidden="true"
        />
      </slot>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ChevronDown, ChevronUp, Minus, Plus } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import type {
  InputNumberAlign,
  InputNumberControlsPosition,
  InputNumberFormatter,
  InputNumberInputMode,
  InputNumberModelValue,
  InputNumberParser,
  InputNumberSize,
  InputNumberStepValues,
  InputNumberValueOnClear,
} from './input-number'

const props = withDefaults(defineProps<{
  id?: string
  modelValue?: InputNumberModelValue
  min?: number
  max?: number
  step?: number
  values?: InputNumberStepValues
  stepStrictly?: boolean
  precision?: number
  size?: InputNumberSize
  readonly?: boolean
  disabled?: boolean
  controls?: boolean
  controlsPosition?: InputNumberControlsPosition
  name?: string
  ariaLabel?: string
  label?: string
  placeholder?: string
  suffix?: string
  valueOnClear?: InputNumberValueOnClear
  validateEvent?: boolean
  inputmode?: InputNumberInputMode
  align?: InputNumberAlign
  disabledScientific?: boolean
  tabindex?: string | number
  formatter?: InputNumberFormatter
  parser?: InputNumberParser
}>(), {
  id: undefined,
  modelValue: undefined,
  min: Number.MIN_SAFE_INTEGER,
  max: Number.MAX_SAFE_INTEGER,
  step: 1,
  values: () => [],
  stepStrictly: false,
  precision: undefined,
  size: 'default',
  readonly: false,
  disabled: false,
  controls: true,
  controlsPosition: '',
  name: undefined,
  ariaLabel: undefined,
  label: undefined,
  placeholder: undefined,
  suffix: '',
  valueOnClear: null,
  validateEvent: true,
  inputmode: undefined,
  align: 'center',
  disabledScientific: false,
  tabindex: 0,
  formatter: undefined,
  parser: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
  input: [value: number | null]
  change: [value: number | null, oldValue: number | null]
  focus: [event: FocusEvent]
  blur: [event: FocusEvent]
}>()

const rootRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const currentValue = ref<number | null>(null)
const userInput = ref<string | null>(null)
const changeBaseValue = ref<number | null>(currentValue.value)

const isDisabled = computed(() => props.disabled)
const isReadonly = computed(() => props.readonly)
const controlsAtRight = computed(() => props.controls && props.controlsPosition === 'right')
const inputType = computed(() => props.formatter ? 'text' : 'number')
const resolvedMin = computed(() => Number.isFinite(props.min) ? props.min : Number.MIN_SAFE_INTEGER)
const resolvedMax = computed(() => {
  const max = Number.isFinite(props.max) ? props.max : Number.MAX_SAFE_INTEGER
  return Math.max(resolvedMin.value, max)
})
const numericStep = computed(() => Number.isFinite(props.step) && props.step > 0 ? props.step : 1)
const steppedValues = computed(() => {
  return Array.from(new Set(props.values ?? []))
    .filter(value => Number.isFinite(value))
    .sort((left, right) => left - right)
})
const explicitPrecision = computed(() => {
  return isNonNegativeInteger(props.precision) ? props.precision : undefined
})
const numPrecision = computed(() => {
  const stepPrecision = getPrecision(numericStep.value)
  if (explicitPrecision.value !== undefined) return explicitPrecision.value
  return Math.max(getPrecision(currentValue.value), stepPrecision)
})
const resolvedAriaLabel = computed(() => props.ariaLabel || props.label || props.placeholder || 'number input')
const decreaseAriaLabel = computed(() => `Decrease ${resolvedAriaLabel.value}`)
const increaseAriaLabel = computed(() => `Increase ${resolvedAriaLabel.value}`)
const canDecrease = computed(() => nextControlValue(-1) !== currentValue.value)
const canIncrease = computed(() => nextControlValue(1) !== currentValue.value)
const decreaseDisabled = computed(() => isDisabled.value || isReadonly.value || !canDecrease.value)
const increaseDisabled = computed(() => isDisabled.value || isReadonly.value || !canIncrease.value)
const ariaValueNow = computed(() => typeof currentValue.value === 'number' ? currentValue.value : undefined)
const controlIconSize = computed(() => {
  if (props.size === 'large') return 16
  if (props.size === 'small') return 12
  return 14
})

const displayValue = computed(() => {
  if (userInput.value !== null) return userInput.value
  const value = currentValue.value
  if (value === null || Number.isNaN(value)) {
    return props.formatter?.('') ?? ''
  }

  const text = explicitPrecision.value !== undefined
    ? value.toFixed(explicitPrecision.value)
    : String(value)

  return props.formatter ? props.formatter(text) : text
})

const inputNumberClasses = computed(() => [
  `app-input-number--${props.size}`,
  `is-${props.align}`,
  {
    'is-disabled': isDisabled.value,
    'is-readonly': isReadonly.value,
    'is-without-controls': !props.controls,
    'is-controls-right': controlsAtRight.value,
  },
])

watch(
  () => [
    props.modelValue,
    props.min,
    props.max,
    props.step,
    props.values,
    props.stepStrictly,
    props.precision,
    props.valueOnClear,
  ] as const,
  ([modelValue]) => {
    const next = verifyValue(modelValue)
    currentValue.value = next
    if (userInput.value === null) changeBaseValue.value = next
  },
  { immediate: true }
)

function verifyValue(value: InputNumberModelValue | string): number | null {
  if (value === null || value === undefined) return null

  let next: number
  if (value === '') {
    const clearValue = resolveValueOnClear()
    if (clearValue === null) return null
    next = clearValue
  } else {
    const parsed = parseNumericValue(value)
    if (parsed === null) return null
    next = parsed
  }

  if (props.stepStrictly) {
    next = toPrecision(
      Math.round(toPrecision(next / numericStep.value)) * numericStep.value,
      explicitPrecision.value
    )
  }

  if (explicitPrecision.value !== undefined) {
    next = toPrecision(next, explicitPrecision.value)
  }

  return clamp(next)
}

function resolveValueOnClear(): number | null {
  if (props.valueOnClear === 'min') return resolvedMin.value
  if (props.valueOnClear === 'max') return resolvedMax.value
  if (typeof props.valueOnClear === 'number' && Number.isFinite(props.valueOnClear)) {
    return props.valueOnClear
  }
  return null
}

function parseNumericValue(value: number | string): number | null {
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value
  }

  const parsedValue = props.parser ? props.parser(value) : value
  const parsed = Number.parseFloat(String(parsedValue))
  return Number.isNaN(parsed) ? null : parsed
}

function clamp(value: number): number {
  return Math.min(resolvedMax.value, Math.max(resolvedMin.value, value))
}

function getPrecision(value: number | null | undefined): number {
  if (value === null || value === undefined || Number.isNaN(value)) return 0
  const text = String(value)
  if (text.includes('e-')) {
    const [, exponent] = text.split('e-')
    return Number(exponent) || 0
  }
  return text.includes('.') ? text.split('.')[1].length : 0
}

function toPrecision(value: number, precision = numPrecision.value): number {
  if (precision <= 0) return Math.round(value)
  return Number.parseFloat(Number(value).toFixed(precision))
}

function isNonNegativeInteger(value: number | undefined): value is number {
  return typeof value === 'number' && value >= 0 && Number.isInteger(value)
}

function valuesEqual(left: number | null, right: number | null): boolean {
  return left === right || (Number.isNaN(left) && Number.isNaN(right))
}

function emitValue(next: number | null, options: { emitInput?: boolean; emitChange?: boolean } = {}) {
  const previous = changeBaseValue.value
  currentValue.value = next

  if (next !== null) emit('update:modelValue', next)
  if (options.emitInput) emit('input', next)

  if (options.emitChange && !valuesEqual(next, previous)) {
    emit('change', next, previous)
    changeBaseValue.value = next
  }
}

function setCurrentValue(value: InputNumberModelValue | string, options: { emitInput?: boolean; emitChange?: boolean } = {}) {
  const next = verifyValue(value)
  userInput.value = null
  emitValue(next, options)
}

function ensurePrecision(value: number, coefficient: 1 | -1 = 1): number {
  const stepped = value + numericStep.value * coefficient
  return toPrecision(stepped)
}

function nextControlValue(direction: 1 | -1): number | null {
  const value = typeof currentValue.value === 'number' ? currentValue.value : 0

  if (steppedValues.value.length > 0) {
    if (direction < 0) {
      for (let index = steppedValues.value.length - 1; index >= 0; index -= 1) {
        if (steppedValues.value[index] < value) return steppedValues.value[index]
      }
      return currentValue.value
    }

    return steppedValues.value.find(candidate => candidate > value) ?? currentValue.value
  }

  return verifyValue(ensurePrecision(value, direction))
}

function increase() {
  if (increaseDisabled.value) return
  setCurrentValue(nextControlValue(1), { emitInput: true, emitChange: true })
}

function decrease() {
  if (decreaseDisabled.value) return
  setCurrentValue(nextControlValue(-1), { emitInput: true, emitChange: true })
}

function handleKeydown(event: KeyboardEvent) {
  if (props.disabledScientific && (event.key === 'e' || event.key === 'E')) {
    event.preventDefault()
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    increase()
    return
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    decrease()
  }
}

function handleInput(event: Event) {
  if (isDisabled.value || isReadonly.value) return
  const value = (event.target as HTMLInputElement).value
  userInput.value = value
  const next = value === '' ? null : parseNumericValue(value)
  currentValue.value = next
  emit('input', next)
  if (next !== null) emit('update:modelValue', next)
}

function handleInputChange(event: Event) {
  if (isDisabled.value || isReadonly.value) return
  setCurrentValue((event.target as HTMLInputElement).value, { emitChange: true })
}

function handleFocus(event: FocusEvent) {
  changeBaseValue.value = currentValue.value
  emit('focus', event)
}

function handleBlur(event: FocusEvent) {
  userInput.value = null
  emit('blur', event)
}

function handleWheel(event: WheelEvent) {
  if (document.activeElement === event.target) event.preventDefault()
}

function focus(options?: Parameters<HTMLElement['focus']>[0]) {
  inputRef.value?.focus(options)
}

function blur() {
  inputRef.value?.blur()
}

defineExpose({
  blur,
  focus,
})
</script>

<style scoped>
.app-input-number {
  --app-input-number-height: 32px;
  --app-input-number-control-width: 32px;
  --app-input-number-padding-x: 10px;
  --app-input-number-radius: 7px;
  --app-input-number-font-size: 13px;
  --app-input-number-bg: var(--ui-surface-input-bg, var(--ui-surface-app-bg));
  --app-input-number-fg: var(--ui-text-primary-fg);
  --app-input-number-muted-fg: var(--ui-text-muted-fg);
  --app-input-number-border: var(--ui-border-subtle-border);
  --app-input-number-hover-bg: var(--ui-state-hover-bg);
  --app-input-number-focus: var(--ui-accent-primary-fg);

  display: inline-grid;
  grid-template-areas: "decrease input increase";
  grid-template-columns: var(--app-input-number-control-width) minmax(0, 1fr) var(--app-input-number-control-width);
  min-width: 150px;
  min-height: var(--app-input-number-height);
  border: 1px solid var(--app-input-number-border);
  border-radius: var(--app-input-number-radius);
  overflow: hidden;
  background: var(--app-input-number-bg);
  color: var(--app-input-number-fg);
  font-family: var(--type-label-font, var(--font-body));
  font-size: var(--app-input-number-font-size);
  line-height: 1;
  vertical-align: middle;
  transition:
    border-color var(--duration-fast) var(--ease-default),
    box-shadow var(--duration-fast) var(--ease-default),
    opacity var(--duration-fast) var(--ease-default);
}

.app-input-number--small {
  --app-input-number-height: 28px;
  --app-input-number-control-width: 28px;
  --app-input-number-padding-x: 8px;
  --app-input-number-radius: 6px;
  --app-input-number-font-size: 12px;

  min-width: 128px;
}

.app-input-number--large {
  --app-input-number-height: 38px;
  --app-input-number-control-width: 38px;
  --app-input-number-padding-x: 12px;
  --app-input-number-radius: 8px;
  --app-input-number-font-size: 14px;

  min-width: 170px;
}

.app-input-number.is-without-controls {
  grid-template-areas: "input";
  grid-template-columns: minmax(0, 1fr);
}

.app-input-number.is-controls-right {
  grid-template-areas:
    "input increase"
    "input decrease";
  grid-template-columns: minmax(0, 1fr) var(--app-input-number-control-width);
  grid-template-rows: 1fr 1fr;
}

.app-input-number:focus-within {
  border-color: color-mix(in srgb, var(--app-input-number-focus) 55%, var(--app-input-number-border));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--app-input-number-focus) 13%, transparent);
}

.app-input-number.is-disabled {
  opacity: 0.58;
}

.app-input-number-control {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
  border: 0;
  background: transparent;
  color: var(--app-input-number-muted-fg);
  font: inherit;
  cursor: pointer;
  transition:
    background var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default),
    opacity var(--duration-fast) var(--ease-default);
}

.app-input-number-control:not(:disabled):hover {
  background: var(--app-input-number-hover-bg);
  color: var(--app-input-number-fg);
}

.app-input-number-control:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.app-input-number-decrease {
  grid-area: decrease;
  border-right: 1px solid var(--app-input-number-border);
}

.app-input-number-increase {
  grid-area: increase;
  border-left: 1px solid var(--app-input-number-border);
}

.app-input-number.is-controls-right .app-input-number-decrease {
  border-top: 1px solid var(--app-input-number-border);
  border-right: 0;
}

.app-input-number.is-controls-right .app-input-number-increase {
  border-left: 1px solid var(--app-input-number-border);
}

.app-input-number-input-wrap {
  grid-area: input;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  min-width: 0;
}

.app-input-number-affix {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  color: var(--app-input-number-muted-fg);
  font-size: 0.92em;
  white-space: nowrap;
}

.app-input-number-prefix {
  padding-left: var(--app-input-number-padding-x);
}

.app-input-number-suffix {
  padding-right: var(--app-input-number-padding-x);
}

.app-input-number-input {
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: calc(var(--app-input-number-height) - 2px);
  border: 0;
  outline: none;
  box-shadow: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-variant-numeric: tabular-nums;
  line-height: normal;
  padding: 0 var(--app-input-number-padding-x);
  -moz-appearance: textfield;
  appearance: textfield;
}

.app-input-number.is-left .app-input-number-input {
  text-align: left;
}

.app-input-number.is-center .app-input-number-input {
  text-align: center;
}

.app-input-number.is-right .app-input-number-input {
  text-align: right;
}

.app-input-number-input:disabled,
.app-input-number-input:read-only {
  cursor: not-allowed;
}

input.app-input-number-input:focus,
.app-input-number-input:focus-visible {
  outline: none;
  box-shadow: none;
}

.app-input-number-input::placeholder {
  color: var(--app-input-number-muted-fg);
}

.app-input-number-input::-webkit-outer-spin-button,
.app-input-number-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
</style>
