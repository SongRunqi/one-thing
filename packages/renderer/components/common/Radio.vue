<template>
  <label
    class="app-radio"
    :class="radioClasses"
  >
    <input
      :id="id"
      ref="inputRef"
      class="app-radio-input"
      type="radio"
      :name="resolvedName"
      :checked="isChecked"
      :disabled="isDisabled"
      :aria-label="ariaLabel"
      :aria-describedby="describedBy"
      :tabindex="tabindex"
      @change="handleChange"
      @focus="emit('focus', $event)"
      @blur="emit('blur', $event)"
    >
    <span
      class="app-radio-mark"
      aria-hidden="true"
    />
    <span
      v-if="hasContent"
      class="app-radio-body"
    >
      <span class="app-radio-label">
        <slot>{{ label }}</slot>
      </span>
      <span
        v-if="description || $slots.description"
        :id="describedBy"
        class="app-radio-description"
      >
        <slot name="description">{{ description }}</slot>
      </span>
    </span>
  </label>
</template>

<script setup lang="ts">
/**
 * Radio — one of a set, in the same 画线风 register as `Checkbox.vue`.
 *
 * The two marks are deliberately different shapes: a checkbox is a **rule**
 * that thickens, a radio is a **ring** that takes ink. Exclusivity has to be
 * legible before the user reads any label, and two identical marks with
 * different behaviour is exactly the kind of tie this system exists to avoid.
 * The ring/dot is the same figure the settings ink-toggle uses for its knob.
 *
 * Real `<input type="radio">` under the drawn mark for the same reasons as
 * Checkbox — plus one that is radio-specific: arrow-key roving between members
 * of a `name` group is browser behaviour, and no hand-rolled `role="radio"`
 * implementation in this repo has ever reproduced it correctly.
 */
import { computed, inject, ref } from 'vue'
import { radioGroupKey, type RadioSize } from './radio'

let radioIdCounter = 0

const props = withDefaults(defineProps<{
  /** Standalone `v-model`. Ignored when the radio sits inside a `RadioGroup`. */
  modelValue?: unknown
  /** The value this radio stands for. */
  value?: unknown
  disabled?: boolean
  label?: string
  description?: string
  size?: RadioSize
  id?: string
  /** Native group name. A `RadioGroup` supplies one; standalone sets need it. */
  name?: string
  ariaLabel?: string
  tabindex?: string | number
}>(), {
  modelValue: undefined,
  value: undefined,
  disabled: false,
  label: undefined,
  description: undefined,
  size: undefined,
  id: undefined,
  name: undefined,
  ariaLabel: undefined,
  tabindex: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
  change: [value: unknown]
  focus: [event: FocusEvent]
  blur: [event: FocusEvent]
}>()

const slots = defineSlots<{
  default?: () => unknown
  description?: () => unknown
}>()

const group = inject(radioGroupKey, null)
const inputRef = ref<HTMLInputElement | null>(null)
const uid = ++radioIdCounter
const describedBy = `app-radio-desc-${uid}`

const resolvedName = computed(() => props.name ?? group?.name() ?? `app-radio-${uid}`)
const resolvedSize = computed<RadioSize>(() => props.size ?? group?.size() ?? 'default')
const isDisabled = computed(() => props.disabled || Boolean(group?.disabled()))
const isChecked = computed(() => (group ? group.value() : props.modelValue) === props.value)
const hasContent = computed(() => Boolean(props.label || props.description || slots.default || slots.description))

const radioClasses = computed(() => [
  `app-radio--${resolvedSize.value}`,
  {
    'is-checked': isChecked.value,
    'is-disabled': isDisabled.value,
  },
])

function handleChange() {
  if (isDisabled.value) return
  if (group) group.select(props.value)
  else emit('update:modelValue', props.value)
  emit('change', props.value)
}

function focus(options?: Parameters<HTMLInputElement['focus']>[0]) {
  inputRef.value?.focus(options)
}

defineExpose({ focus })
</script>

<style scoped>
.app-radio {
  position: relative;
  display: inline-flex;
  align-items: flex-start;
  min-width: 0;
  gap: 8px;
  color: var(--ui-text-secondary-fg, var(--text-secondary, var(--text)));
  font-size: 13px;
  line-height: 1.45;
  cursor: pointer;
}

.app-radio--small {
  font-size: 12px;
}

.app-radio.is-disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.app-radio-input {
  position: absolute;
  left: 0;
  top: 0;
  width: 12px;
  height: 1.45em;
  margin: 0;
  padding: 0;
  border: 0;
  opacity: 0;
  appearance: none;
  cursor: inherit;
}

.app-radio-mark {
  position: relative;
  flex: 0 0 auto;
  width: 12px;
  height: 1.45em;
}

/* Hollow ring off, inked ring + dot on — the settings toggle's knob, reused. */
.app-radio-mark::before {
  content: '';
  position: absolute;
  left: 1px;
  top: 50%;
  width: 10px;
  height: 10px;
  border: 1px solid var(--ui-border-strong-border, var(--border-strong, var(--border)));
  border-radius: var(--radius-full);
  background: transparent;
  box-sizing: border-box;
  transform: translateY(-50%);
  transition:
    border-color var(--duration-fast) var(--ease-default),
    background-color var(--duration-fast) var(--ease-default);
}

.app-radio-mark::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 50%;
  width: 4px;
  height: 4px;
  border-radius: var(--radius-full);
  background: var(--ui-accent-primary-fg, var(--accent));
  opacity: 0;
  transform: translateY(-50%) scale(0.4);
  transition:
    opacity var(--duration-fast) var(--ease-default),
    transform var(--duration-fast) var(--ease-default);
}

.app-radio:hover:not(.is-disabled) .app-radio-mark::before {
  border-color: var(--ui-text-muted-fg, var(--text-muted, var(--muted)));
}

.app-radio.is-checked .app-radio-mark::before {
  border-color: var(--ui-accent-primary-fg, var(--accent));
}

.app-radio.is-checked .app-radio-mark::after {
  opacity: 1;
  transform: translateY(-50%) scale(1);
}

/* Same recipe as `Dialog.vue`'s text buttons; P4 swaps both for `.u-focus-ring`.
   One line on purpose — `shadow-literal-floating` reads line by line. */
.app-radio-input:focus-visible + .app-radio-mark {
  border-radius: var(--radius-xs);
  box-shadow: 0 0 0 2px var(--ui-surface-app-bg, var(--bg-app)), 0 0 0 4px var(--ui-state-focus-ring, var(--ui-accent-primary-fg, var(--accent)));
}

.app-radio-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 1px;
}

.app-radio.is-checked .app-radio-label {
  color: var(--ui-text-primary-fg, var(--text));
}

.app-radio-description {
  color: var(--ui-text-faint-fg, var(--text-faint, var(--muted)));
  font-size: 11px;
  line-height: 1.4;
}

@media (prefers-reduced-motion: reduce) {
  .app-radio-mark::before,
  .app-radio-mark::after {
    transition: none;
  }
}
</style>
