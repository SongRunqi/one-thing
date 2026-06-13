<template>
  <div
    ref="rootRef"
    class="app-slider"
    :class="sliderClasses"
    :style="sliderStyle"
  >
    <div class="app-slider-main">
      <div
        ref="railRef"
        class="app-slider-rail"
        :aria-disabled="disabled ? 'true' : undefined"
        @pointerdown="handleRailPointerDown"
        @mousedown="handleRailMouseDown"
      >
        <div
          class="app-slider-track"
          :style="trackStyle"
        />

        <span
          v-for="stop in stops"
          :key="`stop-${stop.value}`"
          class="app-slider-stop"
          :class="{ 'is-active': stop.active }"
          :style="stop.style"
          aria-hidden="true"
        />

        <span
          v-for="mark in normalizedMarks"
          :key="`mark-${mark.value}`"
          class="app-slider-mark"
          :style="mark.positionStyle"
        >
          <span
            class="app-slider-mark-dot"
            aria-hidden="true"
          />
          <span
            class="app-slider-mark-label"
            :style="mark.style"
          >
            <slot
              name="mark"
              :mark="mark"
            >
              {{ mark.label }}
            </slot>
          </span>
        </span>

        <span
          v-for="thumb in thumbs"
          :key="thumb.index"
          class="app-slider-thumb-wrap"
          :class="{ 'is-active': thumb.index === activeThumbIndex }"
          :style="thumb.style"
          @pointerdown.stop="handleThumbPointerDown(thumb.index, $event)"
          @mousedown.stop="handleThumbMouseDown(thumb.index, $event)"
          @mouseenter="hoveredThumbIndex = thumb.index"
          @mouseleave="hoveredThumbIndex = null"
        >
          <span
            v-if="shouldRenderTooltip(thumb.index)"
            :class="tooltipClasses(thumb.index)"
            role="tooltip"
          >
            {{ formatTooltipValue(thumb.value) }}
          </span>

          <button
            :id="thumb.id"
            :ref="element => setThumbRef(element, thumb.index)"
            class="app-slider-thumb"
            type="button"
            role="slider"
            :tabindex="disabled ? -1 : 0"
            :disabled="disabled"
            :aria-label="thumb.ariaLabel"
            :aria-orientation="vertical ? 'vertical' : 'horizontal'"
            :aria-valuemin="thumb.ariaMin"
            :aria-valuemax="thumb.ariaMax"
            :aria-valuenow="thumb.value"
            :aria-valuetext="thumb.valueText"
            :aria-disabled="disabled ? 'true' : undefined"
            @focus="focusedThumbIndex = thumb.index"
            @blur="focusedThumbIndex = null"
            @keydown="handleThumbKeydown(thumb.index, $event)"
          />
        </span>
      </div>
    </div>

    <div
      v-if="showInput && !range"
      class="app-slider-input"
      :class="[
        `app-slider-input--${inputSize}`,
        { 'has-controls': showInputControls },
      ]"
    >
      <button
        v-if="showInputControls"
        class="app-slider-input-button"
        type="button"
        :disabled="disabled || !canDecrease"
        :aria-label="`Decrease ${resolvedAriaLabel}`"
        @click="stepInput(-1)"
      >
        -
      </button>
      <input
        ref="inputRef"
        class="app-slider-input-field"
        type="number"
        inputmode="decimal"
        :value="inputDraft"
        :min="resolvedMin"
        :max="resolvedMax"
        :step="inputStep"
        :disabled="disabled"
        :aria-label="resolvedAriaLabel"
        @input="handleInputDraft"
        @change="commitInputDraft(true)"
        @blur="commitInputDraft(true)"
        @keydown.enter.prevent="commitInputDraft(true)"
      >
      <button
        v-if="showInputControls"
        class="app-slider-input-button"
        type="button"
        :disabled="disabled || !canIncrease"
        :aria-label="`Increase ${resolvedAriaLabel}`"
        @click="stepInput(1)"
      >
        +
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  ref,
  watch,
  type ComponentPublicInstance,
  type CSSProperties,
  type StyleValue,
} from 'vue'
import type {
  SliderFormatTooltip,
  SliderFormatValueText,
  SliderMark,
  SliderMarkLabel,
  SliderMarks,
  SliderModelValue,
  SliderPlacement,
  SliderSize,
  SliderStep,
} from './slider'

const props = withDefaults(defineProps<{
  modelValue: SliderModelValue
  min?: number
  max?: number
  disabled?: boolean
  step?: SliderStep
  showInput?: boolean
  showInputControls?: boolean
  size?: SliderSize
  inputSize?: SliderSize
  showStops?: boolean
  showTooltip?: boolean
  formatTooltip?: SliderFormatTooltip
  range?: boolean
  vertical?: boolean
  height?: string
  ariaLabel?: string
  rangeStartLabel?: string
  rangeEndLabel?: string
  formatValueText?: SliderFormatValueText
  debounce?: number
  tooltipClass?: string
  placement?: SliderPlacement
  marks?: SliderMarks
  validateEvent?: boolean
  persistent?: boolean
  label?: string
  id?: string | [string, string]
}>(), {
  min: 0,
  max: 100,
  disabled: false,
  step: 1,
  showInput: false,
  showInputControls: true,
  size: 'default',
  inputSize: 'default',
  showStops: false,
  showTooltip: true,
  formatTooltip: undefined,
  range: false,
  vertical: false,
  height: '200px',
  ariaLabel: '',
  rangeStartLabel: '',
  rangeEndLabel: '',
  formatValueText: undefined,
  debounce: 300,
  tooltipClass: '',
  placement: 'top',
  marks: () => ({}),
  validateEvent: true,
  persistent: true,
  label: '',
  id: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: SliderModelValue]
  input: [value: SliderModelValue]
  change: [value: SliderModelValue]
}>()

interface NormalizedMark {
  value: number
  percent: number
  label: SliderMarkLabel
  style?: StyleValue
  positionStyle: CSSProperties
}

interface Stop {
  value: number
  active: boolean
  style: CSSProperties
}

const rootRef = ref<HTMLElement | null>(null)
const railRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const thumbRefs = ref<Array<HTMLButtonElement | null>>([])
const innerValues = ref<[number, number]>([0, 0])
const inputDraft = ref('0')
const activeThumbIndex = ref<number | null>(null)
const hoveredThumbIndex = ref<number | null>(null)
const focusedThumbIndex = ref<number | null>(null)

let cleanupDragListeners: (() => void) | null = null
let dragStartModelValue: SliderModelValue | null = null
let lastPointerDownAt = 0
let inputDebounceTimer: ReturnType<typeof setTimeout> | null = null

const resolvedMin = computed(() => Number.isFinite(props.min) ? props.min : 0)
const resolvedMax = computed(() => {
  const max = Number.isFinite(props.max) ? props.max : 100
  return Math.max(resolvedMin.value, max)
})
const resolvedAriaLabel = computed(() => props.ariaLabel || props.label || 'slider value')
const numericStep = computed(() => {
  return typeof props.step === 'number' && Number.isFinite(props.step) && props.step > 0
    ? props.step
    : 1
})
const precision = computed(() => {
  const values = [resolvedMin.value, resolvedMax.value]
  if (typeof props.step === 'number') values.push(props.step)
  normalizedMarks.value.forEach(mark => values.push(mark.value))
  return Math.min(12, Math.max(...values.map(decimalPlaces)))
})
const inputStep = computed(() => props.step === 'mark' ? numericStep.value : numericStep.value)

const normalizedMarks = computed<NormalizedMark[]>(() => {
  const marks: NormalizedMark[] = []

  Object.entries(props.marks ?? {}).forEach(([key, rawMark]) => {
    const value = Number(key)
    if (!Number.isFinite(value)) return
    if (value < resolvedMin.value || value > resolvedMax.value) return

    const mark = normalizeMark(rawMark, key)
    const normalizedMark: NormalizedMark = {
      value,
      percent: valueToPercent(value),
      label: mark.label,
      positionStyle: positionStyle(valueToPercent(value)),
    }

    if (mark.style !== undefined) {
      normalizedMark.style = mark.style
    }

    marks.push(normalizedMark)
  })

  return marks.sort((a, b) => a.value - b.value)
})

const markStepValues = computed(() => normalizedMarks.value.map(mark => mark.value))

watch(
  () => [
    props.modelValue,
    props.range,
    props.step,
    props.min,
    props.max,
    props.marks,
  ] as const,
  () => {
    const normalized = normalizeModelValue(props.modelValue)
    innerValues.value = normalized
    syncInputDraft(normalized[0])
  },
  { immediate: true, deep: true }
)

const sliderClasses = computed(() => [
  `app-slider--${props.size}`,
  {
    'is-disabled': props.disabled,
    'is-dragging': activeThumbIndex.value !== null,
    'is-range': props.range,
    'is-vertical': props.vertical,
    'has-input': props.showInput && !props.range,
    'has-marks': normalizedMarks.value.length > 0,
  },
])

const sliderStyle = computed<CSSProperties>(() => ({
  '--app-slider-height': props.height,
}))

const trackStyle = computed<CSSProperties>(() => {
  const [startValue, endValue] = props.range
    ? innerValues.value
    : [resolvedMin.value, innerValues.value[0]]
  const start = valueToPercent(startValue)
  const end = valueToPercent(endValue)
  const size = Math.max(0, end - start)

  if (props.vertical) {
    return {
      bottom: `${start}%`,
      height: `${size}%`,
    }
  }

  return {
    left: `${start}%`,
    width: `${size}%`,
  }
})

const thumbs = computed(() => {
  const values = props.range ? innerValues.value : [innerValues.value[0]]
  return values.map((value, index) => {
    const percent = valueToPercent(value)
    return {
      index,
      value,
      style: positionStyle(percent),
      id: thumbId(index),
      ariaLabel: thumbAriaLabel(index),
      ariaMin: props.range && index === 1 ? innerValues.value[0] : resolvedMin.value,
      ariaMax: props.range && index === 0 ? innerValues.value[1] : resolvedMax.value,
      valueText: props.formatValueText?.(value, index) ?? String(value),
    }
  })
})

const stops = computed<Stop[]>(() => {
  if (!props.showStops || props.step === 'mark') return []

  const min = resolvedMin.value
  const max = resolvedMax.value
  const step = numericStep.value
  const count = Math.floor((max - min) / step)
  if (count <= 1 || count > 500) return []

  const [start, end] = props.range ? innerValues.value : [resolvedMin.value, innerValues.value[0]]
  const items: Stop[] = []
  for (let index = 1; index < count; index += 1) {
    const value = roundToPrecision(min + step * index)
    const percent = valueToPercent(value)
    items.push({
      value,
      active: value >= start && value <= end,
      style: positionStyle(percent),
    })
  }
  return items
})

const canDecrease = computed(() => nextValueByStep(innerValues.value[0], -1) !== innerValues.value[0])
const canIncrease = computed(() => nextValueByStep(innerValues.value[0], 1) !== innerValues.value[0])

function normalizeMark(rawMark: SliderMarks[number], fallback: string): SliderMark & { label: SliderMarkLabel } {
  if (rawMark && typeof rawMark === 'object' && !Array.isArray(rawMark)) {
    return {
      label: rawMark.label ?? fallback,
      style: rawMark.style,
    }
  }

  return {
    label: typeof rawMark === 'string' || typeof rawMark === 'number'
      ? rawMark
      : fallback,
  }
}

function normalizeModelValue(modelValue: SliderModelValue): [number, number] {
  if (props.range) {
    const rawValues = Array.isArray(modelValue) ? modelValue : [modelValue, modelValue]
    const start = normalizeValue(Number(rawValues[0]))
    const end = normalizeValue(Number(rawValues[1]))
    return start <= end ? [start, end] : [end, start]
  }

  const rawValue = Array.isArray(modelValue) ? modelValue[0] : modelValue
  const value = normalizeValue(Number(rawValue))
  return [value, value]
}

function normalizeValues(values: [number, number]): [number, number] {
  const start = normalizeValue(values[0])
  const end = normalizeValue(values[1])
  return props.range
    ? (start <= end ? [start, end] : [end, start])
    : [start, start]
}

function normalizeValue(value: number): number {
  const clamped = clamp(Number.isFinite(value) ? value : resolvedMin.value)

  if (props.step === 'mark') {
    const marks = markStepValues.value
    if (marks.length === 0) return roundToPrecision(clamped)
    return nearestValue(clamped, marks)
  }

  const step = numericStep.value
  const stepped = resolvedMin.value + Math.round((clamped - resolvedMin.value) / step) * step
  return clamp(roundToPrecision(stepped))
}

function nextValueByStep(value: number, direction: -1 | 1, multiplier = 1): number {
  if (props.step === 'mark') {
    const marks = markStepValues.value
    if (marks.length === 0) return value
    if (direction < 0) {
      for (let index = marks.length - 1; index >= 0; index -= 1) {
        if (marks[index] < value) return marks[index]
      }
      return value
    }
    return marks.find(mark => mark > value) ?? value
  }

  return normalizeValue(value + numericStep.value * direction * multiplier)
}

function clamp(value: number): number {
  return Math.min(resolvedMax.value, Math.max(resolvedMin.value, value))
}

function decimalPlaces(value: number): number {
  const text = String(value)
  if (text.includes('e-')) {
    const [, exponent] = text.split('e-')
    return Number(exponent) || 0
  }
  return text.includes('.') ? text.split('.')[1].length : 0
}

function roundToPrecision(value: number): number {
  return Number(value.toFixed(precision.value))
}

function nearestValue(value: number, values: number[]): number {
  return values.reduce((nearest, candidate) => {
    return Math.abs(candidate - value) < Math.abs(nearest - value) ? candidate : nearest
  }, values[0])
}

function valueToPercent(value: number): number {
  const span = resolvedMax.value - resolvedMin.value
  if (span <= 0) return 0
  return ((clamp(value) - resolvedMin.value) / span) * 100
}

function percentToValue(percent: number): number {
  const value = resolvedMin.value + (clampPercent(percent) / 100) * (resolvedMax.value - resolvedMin.value)
  return normalizeValue(value)
}

function clampPercent(percent: number): number {
  return Math.max(0, Math.min(100, percent))
}

function positionStyle(percent: number): CSSProperties {
  if (props.vertical) {
    return { bottom: `${clampPercent(percent)}%` }
  }
  return { left: `${clampPercent(percent)}%` }
}

function thumbId(index: number): string | undefined {
  if (Array.isArray(props.id)) return props.id[index]
  if (props.id && !props.range) return props.id
  if (props.id) return `${props.id}-${index === 0 ? 'start' : 'end'}`
  return undefined
}

function thumbAriaLabel(index: number): string {
  if (!props.range) return resolvedAriaLabel.value
  if (index === 0) return props.rangeStartLabel || `${resolvedAriaLabel.value} start`
  return props.rangeEndLabel || `${resolvedAriaLabel.value} end`
}

function toModelValue(values: [number, number]): SliderModelValue {
  return props.range ? [values[0], values[1]] : values[0]
}

function modelValuesEqual(left: SliderModelValue, right: SliderModelValue): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left[0] === right[0]
      && left[1] === right[1]
  }
  return left === right
}

function syncInputDraft(value: number) {
  if (inputRef.value && document.activeElement === inputRef.value) return
  inputDraft.value = String(value)
}

function commitValues(values: [number, number], emitChange = false) {
  const normalized = normalizeValues(values)
  const previous = toModelValue(innerValues.value)
  const next = toModelValue(normalized)

  innerValues.value = normalized
  syncInputDraft(normalized[0])

  if (modelValuesEqual(previous, next)) return

  emit('update:modelValue', next)
  emit('input', next)
  if (emitChange) emit('change', next)
}

function setThumbValue(index: number, rawValue: number, emitChange = false) {
  const nextValues: [number, number] = [...innerValues.value]
  const value = normalizeValue(rawValue)

  if (props.range) {
    if (index === 0) {
      nextValues[0] = Math.min(value, nextValues[1])
    } else {
      nextValues[1] = Math.max(value, nextValues[0])
    }
  } else {
    nextValues[0] = value
    nextValues[1] = value
  }

  commitValues(nextValues, emitChange)
}

function clientEventToValue(event: MouseEvent | PointerEvent): number {
  const rail = railRef.value
  if (!rail) return innerValues.value[activeThumbIndex.value ?? 0]

  const rect = rail.getBoundingClientRect()
  if (props.vertical) {
    if (rect.height <= 0) return innerValues.value[activeThumbIndex.value ?? 0]
    return percentToValue(((rect.bottom - event.clientY) / rect.height) * 100)
  }

  if (rect.width <= 0) return innerValues.value[activeThumbIndex.value ?? 0]
  return percentToValue(((event.clientX - rect.left) / rect.width) * 100)
}

function nearestThumbIndex(value: number): number {
  if (!props.range) return 0
  const [start, end] = innerValues.value
  return Math.abs(value - start) <= Math.abs(value - end) ? 0 : 1
}

function handleRailPointerDown(event: PointerEvent) {
  lastPointerDownAt = Date.now()
  handleRailStart(event, 'pointer')
}

function handleRailMouseDown(event: MouseEvent) {
  if (Date.now() - lastPointerDownAt < 350) return
  handleRailStart(event, 'mouse')
}

function handleRailStart(event: MouseEvent | PointerEvent, mode: 'mouse' | 'pointer') {
  if (props.disabled || !isMainButton(event)) return
  const value = clientEventToValue(event)
  const index = nearestThumbIndex(value)
  beginDrag(index, event, mode)
  setThumbValue(index, value)
}

function handleThumbPointerDown(index: number, event: PointerEvent) {
  lastPointerDownAt = Date.now()
  beginDrag(index, event, 'pointer')
}

function handleThumbMouseDown(index: number, event: MouseEvent) {
  if (Date.now() - lastPointerDownAt < 350) return
  beginDrag(index, event, 'mouse')
}

function beginDrag(index: number, event: MouseEvent | PointerEvent, mode: 'mouse' | 'pointer') {
  if (props.disabled || !isMainButton(event)) return

  event.preventDefault()
  activeThumbIndex.value = index
  dragStartModelValue = toModelValue(innerValues.value)
  focus(index)
  cleanupDrag()

  const moveType = mode === 'pointer' ? 'pointermove' : 'mousemove'
  const endType = mode === 'pointer' ? 'pointerup' : 'mouseup'
  const cancelType = mode === 'pointer' ? 'pointercancel' : 'mouseleave'

  const handleMove = (moveEvent: Event) => {
    if (!isClientEvent(moveEvent)) return
    moveEvent.preventDefault()
    setThumbValue(index, clientEventToValue(moveEvent))
  }

  const handleEnd = (endEvent: Event) => {
    if (isClientEvent(endEvent)) {
      setThumbValue(index, clientEventToValue(endEvent))
    }
    finishDrag()
  }

  document.addEventListener(moveType, handleMove, { passive: false })
  document.addEventListener(endType, handleEnd, { once: true })
  document.addEventListener(cancelType, handleEnd, { once: true })

  cleanupDragListeners = () => {
    document.removeEventListener(moveType, handleMove)
    document.removeEventListener(endType, handleEnd)
    document.removeEventListener(cancelType, handleEnd)
  }
}

function finishDrag() {
  cleanupDrag()
  const next = toModelValue(innerValues.value)
  if (dragStartModelValue !== null && !modelValuesEqual(dragStartModelValue, next)) {
    emit('change', next)
  }
  dragStartModelValue = null
  activeThumbIndex.value = null
}

function cleanupDrag() {
  cleanupDragListeners?.()
  cleanupDragListeners = null
}

function isMainButton(event: MouseEvent | PointerEvent): boolean {
  return event.button === undefined || event.button === 0
}

function isClientEvent(event: Event): event is MouseEvent | PointerEvent {
  return 'clientX' in event && 'clientY' in event
}

function handleThumbKeydown(index: number, event: KeyboardEvent) {
  if (props.disabled) return

  const value = innerValues.value[index]
  let nextValue: number | null = null

  switch (event.key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      nextValue = nextValueByStep(value, -1)
      break
    case 'ArrowRight':
    case 'ArrowUp':
      nextValue = nextValueByStep(value, 1)
      break
    case 'PageDown':
      nextValue = nextValueByStep(value, -1, 10)
      break
    case 'PageUp':
      nextValue = nextValueByStep(value, 1, 10)
      break
    case 'Home':
      nextValue = props.step === 'mark' && markStepValues.value.length > 0
        ? markStepValues.value[0]
        : resolvedMin.value
      break
    case 'End':
      nextValue = props.step === 'mark' && markStepValues.value.length > 0
        ? markStepValues.value[markStepValues.value.length - 1]
        : resolvedMax.value
      break
    default:
      return
  }

  event.preventDefault()
  setThumbValue(index, nextValue, true)
}

function handleInputDraft(event: Event) {
  inputDraft.value = (event.target as HTMLInputElement).value
  if (props.debounce <= 0) return

  if (inputDebounceTimer) clearTimeout(inputDebounceTimer)
  inputDebounceTimer = setTimeout(() => {
    commitInputDraft(true)
  }, props.debounce)
}

function commitInputDraft(emitChange: boolean) {
  if (props.disabled) return
  if (inputDebounceTimer) {
    clearTimeout(inputDebounceTimer)
    inputDebounceTimer = null
  }

  const parsed = Number(inputDraft.value)
  if (!Number.isFinite(parsed)) {
    syncInputDraft(innerValues.value[0])
    return
  }

  setThumbValue(0, parsed, emitChange)
}

function stepInput(direction: -1 | 1) {
  if (props.disabled) return
  setThumbValue(0, nextValueByStep(innerValues.value[0], direction), true)
}

function formatTooltipValue(value: number): string | number {
  return props.formatTooltip ? props.formatTooltip(value) : value
}

function tooltipVisible(index: number): boolean {
  return props.showTooltip
    && !props.disabled
    && (
      activeThumbIndex.value === index
      || hoveredThumbIndex.value === index
      || focusedThumbIndex.value === index
    )
}

function shouldRenderTooltip(index: number): boolean {
  return props.showTooltip && (props.persistent || tooltipVisible(index))
}

function tooltipClasses(index: number) {
  return [
    'app-slider-tooltip',
    `app-slider-tooltip--${props.placement}`,
    props.tooltipClass,
    { 'is-visible': tooltipVisible(index) },
  ]
}

function setThumbRef(element: Element | ComponentPublicInstance | null, index: number) {
  thumbRefs.value[index] = element instanceof HTMLButtonElement ? element : null
}

function focus(index = 0, options?: Parameters<HTMLElement['focus']>[0]) {
  thumbRefs.value[index]?.focus(options)
}

function blur(index = 0) {
  thumbRefs.value[index]?.blur()
}

function setPosition(percent: number, index = activeThumbIndex.value ?? 0) {
  setThumbValue(index, percentToValue(percent), true)
}

function resetSize() {
  rootRef.value?.getBoundingClientRect()
}

onBeforeUnmount(() => {
  cleanupDrag()
  if (inputDebounceTimer) clearTimeout(inputDebounceTimer)
})

defineExpose({
  blur,
  focus,
  resetSize,
  setPosition,
})
</script>

<style scoped>
.app-slider {
  --app-slider-track-size: 6px;
  --app-slider-thumb-size: 16px;
  --app-slider-hit-size: 32px;
  --app-slider-track-bg: var(--ui-surface-input-bg, color-mix(in srgb, var(--ui-border-default-border, var(--border)) 72%, transparent));
  --app-slider-track-active-bg: var(--ui-accent-primary-fg, var(--accent));
  --app-slider-thumb-bg: var(--ui-surface-elevated-bg, var(--bg-elevated, var(--bg)));
  --app-slider-thumb-border: var(--ui-accent-primary-fg, var(--accent));
  --app-slider-thumb-shadow: 0 2px 7px rgba(0, 0, 0, 0.16);
  --app-slider-stop-bg: var(--ui-surface-app-bg, var(--bg));
  --app-slider-mark-fg: var(--ui-text-muted-fg, var(--text-muted));

  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  gap: 14px;
  color: var(--ui-text-primary-fg, var(--text));
  font-family: var(--type-label-font, var(--font-body));
  font-size: var(--type-label-size, 13px);
  line-height: var(--type-leading-control, 1.3);
}

.app-slider--small {
  --app-slider-track-size: 4px;
  --app-slider-thumb-size: 14px;
  --app-slider-hit-size: 28px;
}

.app-slider--large {
  --app-slider-track-size: 7px;
  --app-slider-thumb-size: 18px;
  --app-slider-hit-size: 36px;
}

.app-slider-main {
  flex: 1 1 auto;
  min-width: 0;
  padding: 16px 0;
}

.app-slider-rail {
  position: relative;
  width: 100%;
  height: var(--app-slider-track-size);
  border-radius: var(--radius-full, 9999px);
  background: var(--app-slider-track-bg);
  cursor: pointer;
}

.app-slider-track {
  position: absolute;
  top: 0;
  height: 100%;
  border-radius: inherit;
  background: var(--app-slider-track-active-bg);
}

.app-slider-stop,
.app-slider-mark {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
}

.app-slider-stop {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--app-slider-stop-bg);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--app-slider-track-bg) 72%, transparent);
  pointer-events: none;
  z-index: 1;
}

.app-slider-stop.is-active {
  background: color-mix(in srgb, var(--app-slider-track-active-bg) 30%, var(--app-slider-stop-bg));
}

.app-slider-mark {
  z-index: 1;
  pointer-events: none;
}

.app-slider-mark-dot {
  display: block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ui-surface-app-bg, var(--bg));
  border: 1px solid var(--app-slider-track-active-bg);
}

.app-slider-mark-label {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  color: var(--app-slider-mark-fg);
  font-size: var(--type-caption-size, 11px);
  white-space: nowrap;
  pointer-events: auto;
}

.app-slider-thumb-wrap {
  position: absolute;
  top: 50%;
  width: var(--app-slider-hit-size);
  height: var(--app-slider-hit-size);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transform: translate(-50%, -50%);
  z-index: 3;
}

.app-slider-thumb {
  width: var(--app-slider-thumb-size);
  height: var(--app-slider-thumb-size);
  padding: 0;
  border: 2px solid var(--app-slider-thumb-border);
  border-radius: 50%;
  background: var(--app-slider-thumb-bg);
  box-shadow: var(--app-slider-thumb-shadow);
  cursor: grab;
  transition:
    transform var(--duration-fast, 0.15s) var(--ease-default, ease),
    box-shadow var(--duration-fast, 0.15s) var(--ease-default, ease),
    border-color var(--duration-fast, 0.15s) var(--ease-default, ease);
}

.app-slider-thumb:hover,
.app-slider-thumb:focus-visible,
.app-slider-thumb-wrap.is-active .app-slider-thumb {
  transform: scale(1.12);
  box-shadow:
    var(--app-slider-thumb-shadow),
    0 0 0 5px color-mix(in srgb, var(--app-slider-thumb-border) 14%, transparent);
  outline: none;
}

.app-slider-thumb:active {
  cursor: grabbing;
}

.app-slider-tooltip {
  position: absolute;
  z-index: var(--z-tooltip, 700);
  padding: 5px 8px;
  border-radius: 6px;
  border: 0.5px solid var(--ui-surface-tooltip-border, color-mix(in srgb, white 14%, transparent));
  background: var(--ui-surface-tooltip-bg, rgba(24, 24, 27, 0.95));
  color: var(--ui-surface-tooltip-fg, var(--ui-text-inverse-fg, #fff));
  box-shadow: var(--ui-surface-tooltip-shadow, 0 2px 8px rgba(0, 0, 0, 0.25));
  font-size: var(--type-caption-size, 11px);
  font-weight: var(--type-caption-weight, 500);
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition:
    opacity var(--duration-fast, 0.15s) var(--ease-default, ease),
    transform var(--duration-fast, 0.15s) var(--ease-default, ease);
}

.app-slider-tooltip.is-visible {
  opacity: 1;
}

.app-slider-tooltip--top {
  bottom: calc(100% + 7px);
  left: 50%;
  transform: translate(-50%, 4px);
}

.app-slider-tooltip--top.is-visible {
  transform: translate(-50%, 0);
}

.app-slider-tooltip--bottom {
  top: calc(100% + 7px);
  left: 50%;
  transform: translate(-50%, -4px);
}

.app-slider-tooltip--bottom.is-visible {
  transform: translate(-50%, 0);
}

.app-slider-tooltip--left {
  right: calc(100% + 7px);
  top: 50%;
  transform: translate(4px, -50%);
}

.app-slider-tooltip--left.is-visible {
  transform: translate(0, -50%);
}

.app-slider-tooltip--right {
  left: calc(100% + 7px);
  top: 50%;
  transform: translate(-4px, -50%);
}

.app-slider-tooltip--right.is-visible {
  transform: translate(0, -50%);
}

.app-slider-input {
  flex: 0 0 auto;
  display: inline-grid;
  grid-template-columns: minmax(58px, 76px);
  min-height: 30px;
  border: 1px solid var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
  border-radius: 6px;
  overflow: hidden;
  background: var(--ui-surface-input-bg, var(--bg));
}

.app-slider-input.has-controls {
  grid-template-columns: 30px minmax(58px, 76px) 30px;
}

.app-slider-input--small {
  min-height: 26px;
  grid-template-columns: minmax(50px, 66px);
}

.app-slider-input--small.has-controls {
  grid-template-columns: 26px minmax(50px, 66px) 26px;
}

.app-slider-input--large {
  min-height: 34px;
  grid-template-columns: minmax(64px, 86px);
}

.app-slider-input--large.has-controls {
  grid-template-columns: 34px minmax(64px, 86px) 34px;
}

.app-slider-input:focus-within {
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 55%, var(--ui-border-subtle-border, var(--border)));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 13%, transparent);
}

.app-slider-input-button,
.app-slider-input-field {
  min-width: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-variant-numeric: tabular-nums;
}

.app-slider-input-button {
  cursor: pointer;
  font-size: 15px;
}

.app-slider-input-button:not(:disabled):hover {
  background: var(--ui-state-hover-bg, var(--hover));
}

.app-slider-input-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.app-slider-input-button:first-child {
  border-right: 1px solid var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
}

.app-slider-input-button:last-child {
  border-left: 1px solid var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
}

.app-slider-input-field {
  width: 100%;
  padding: 0 8px;
  text-align: center;
  outline: none;
  -moz-appearance: textfield;
  appearance: textfield;
}

.app-slider-input-field::-webkit-outer-spin-button,
.app-slider-input-field::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.app-slider.is-disabled {
  opacity: 0.55;
}

.app-slider.is-disabled .app-slider-rail,
.app-slider.is-disabled .app-slider-thumb {
  cursor: not-allowed;
}

.app-slider.is-vertical {
  flex-direction: column;
  align-items: center;
  width: max-content;
  height: var(--app-slider-height);
}

.app-slider.is-vertical .app-slider-main {
  width: var(--app-slider-hit-size);
  height: 100%;
  padding: 0;
  display: flex;
  justify-content: center;
}

.app-slider.is-vertical .app-slider-rail {
  width: var(--app-slider-track-size);
  height: 100%;
}

.app-slider.is-vertical .app-slider-track {
  left: 0;
  width: 100%;
  top: auto;
}

.app-slider.is-vertical .app-slider-thumb-wrap {
  left: 50%;
  top: auto;
  transform: translate(-50%, 50%);
}

.app-slider.is-vertical .app-slider-stop,
.app-slider.is-vertical .app-slider-mark {
  left: 50%;
  top: auto;
  transform: translate(-50%, 50%);
}

.app-slider.is-vertical .app-slider-mark-label {
  top: 50%;
  left: 14px;
  transform: translateY(-50%);
}

.app-slider.is-vertical.has-input {
  height: auto;
  min-height: var(--app-slider-height);
}
</style>
