<template>
  <label
    class="app-checkbox"
    :class="checkboxClasses"
  >
    <input
      :id="id"
      ref="inputRef"
      class="app-checkbox-input"
      type="checkbox"
      :name="name"
      :checked="isChecked"
      :disabled="disabled"
      :aria-label="ariaLabel"
      :aria-describedby="describedBy"
      :tabindex="tabindex"
      @change="handleChange"
      @focus="emit('focus', $event)"
      @blur="emit('blur', $event)"
    >
    <span
      class="app-checkbox-mark"
      aria-hidden="true"
    />
    <span
      v-if="hasContent"
      class="app-checkbox-body"
    >
      <span class="app-checkbox-label">
        <slot>{{ label }}</slot>
      </span>
      <span
        v-if="description || $slots.description"
        :id="describedBy"
        class="app-checkbox-description"
      >
        <slot name="description">{{ description }}</slot>
      </span>
    </span>
  </label>
</template>

<script setup lang="ts">
/**
 * Checkbox — the 画线风 multi-select mark (docs/design/ui-system.md §1).
 *
 * Not a box that fills with colour: a hanging rule that **thickens and inks up**
 * when on, the same register as `RoomSettingsDialog`'s member lines and the
 * agent tool rows. `indeterminate` is the thick rule without the ink — "some of
 * these", stated in the same stroke.
 *
 * Why a real `<input type="checkbox">` under a drawn mark, rather than a
 * `<button role="checkbox">`: Space, the label-click target, form association
 * and the whole `:checked` / `:disabled` / `:focus-visible` state machine come
 * free and cannot drift from what a screen reader expects. The input is
 * transparent and sits exactly on the mark, so it stays hit-testable and
 * focusable — `visibility: hidden` / `display: none` would take the keyboard
 * with it. The drawn mark is its `+` sibling, which is why every visual state
 * can be expressed in CSS with no class bookkeeping.
 *
 * Class names are `app-checkbox*` on purpose. `.checkbox` / `.form-check` would
 * be a new tie with whatever global rule exists tomorrow (ui-system.md §1: a
 * scoped single-class selector and a global two-class one are both (0,2,0), and
 * the winner is decided by injection order).
 */
import { computed, ref, watch } from 'vue'
import type { CheckboxSize, CheckboxValue } from './checkbox'

let checkboxIdCounter = 0

const props = withDefaults(defineProps<{
  /** `v-model`. With `trueValue`/`falseValue` it can carry any pair of values. */
  modelValue?: CheckboxValue
  /** Mixed state. Visual + `input.indeterminate`; `modelValue` stays untouched. */
  indeterminate?: boolean
  disabled?: boolean
  /** Text label; the default slot wins when both are given. */
  label?: string
  /** Second line under the label, wired up as `aria-describedby`. */
  description?: string
  trueValue?: CheckboxValue
  falseValue?: CheckboxValue
  size?: CheckboxSize
  id?: string
  name?: string
  ariaLabel?: string
  tabindex?: string | number
}>(), {
  modelValue: false,
  indeterminate: false,
  disabled: false,
  label: undefined,
  description: undefined,
  trueValue: true,
  falseValue: false,
  size: 'default',
  id: undefined,
  name: undefined,
  ariaLabel: undefined,
  tabindex: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: CheckboxValue]
  change: [value: CheckboxValue]
  focus: [event: FocusEvent]
  blur: [event: FocusEvent]
}>()

const slots = defineSlots<{
  default?: () => unknown
  description?: () => unknown
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const describedBy = `app-checkbox-desc-${++checkboxIdCounter}`

const isChecked = computed(() => props.modelValue === props.trueValue)
const hasContent = computed(() => Boolean(props.label || props.description || slots.default || slots.description))

const checkboxClasses = computed(() => [
  `app-checkbox--${props.size}`,
  {
    'is-checked': isChecked.value,
    'is-indeterminate': props.indeterminate && !isChecked.value,
    'is-disabled': props.disabled,
  },
])

// `indeterminate` has no HTML attribute — it is a DOM property only, so the
// template cannot bind it and it has to be re-applied after every re-render
// that could have recreated the node.
watch(
  [inputRef, () => props.indeterminate],
  ([element, indeterminate]) => {
    if (element) element.indeterminate = Boolean(indeterminate)
  },
  { immediate: true, flush: 'post' },
)

function handleChange(event: Event) {
  const next = (event.target as HTMLInputElement).checked ? props.trueValue : props.falseValue
  emit('update:modelValue', next)
  emit('change', next)
}

function focus(options?: Parameters<HTMLInputElement['focus']>[0]) {
  inputRef.value?.focus(options)
}

defineExpose({ focus })
</script>

<style scoped>
.app-checkbox {
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

.app-checkbox--small {
  font-size: 12px;
}

.app-checkbox.is-disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

/* Transparent, not hidden: it keeps the hit area and the focus stop, and it is
   the `:checked` / `:focus-visible` source for every rule below. */
.app-checkbox-input {
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

/* The mark is one rule, drawn at the label's first-line height so a wrapping
   label keeps its tick on the first line instead of floating to the middle. */
.app-checkbox-mark {
  position: relative;
  flex: 0 0 auto;
  width: 12px;
  height: 1.45em;
}

.app-checkbox-mark::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 7px;
  height: 1px;
  background: var(--ui-border-strong-border, var(--border-strong, var(--border)));
  transform: translateY(-50%);
  transition:
    width var(--duration-fast) var(--ease-default),
    height var(--duration-fast) var(--ease-default),
    background-color var(--duration-fast) var(--ease-default);
}

.app-checkbox:hover:not(.is-disabled) .app-checkbox-mark::before {
  background: var(--ui-text-muted-fg, var(--text-muted, var(--muted)));
}

/* Mixed: the rule thickens but stays ink-grey — "some", not "yes". */
.app-checkbox.is-indeterminate .app-checkbox-mark::before {
  width: 10px;
  height: 2px;
  background: var(--ui-text-muted-fg, var(--text-muted, var(--muted)));
}

.app-checkbox.is-checked .app-checkbox-mark::before {
  width: 10px;
  height: 2px;
  background: var(--ui-accent-primary-fg, var(--accent));
}

/* Same recipe as `Dialog.vue`'s text buttons; P4 swaps both for `.u-focus-ring`.
   One line on purpose — `shadow-literal-floating` reads line by line. */
.app-checkbox-input:focus-visible + .app-checkbox-mark {
  border-radius: var(--radius-xs);
  box-shadow: 0 0 0 2px var(--ui-surface-app-bg, var(--bg-app)), 0 0 0 4px var(--ui-state-focus-ring, var(--ui-accent-primary-fg, var(--accent)));
}

.app-checkbox-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 1px;
}

.app-checkbox.is-checked .app-checkbox-label {
  color: var(--ui-text-primary-fg, var(--text));
}

.app-checkbox-description {
  color: var(--ui-text-faint-fg, var(--text-faint, var(--muted)));
  font-size: 11px;
  line-height: 1.4;
}

@media (prefers-reduced-motion: reduce) {
  .app-checkbox-mark::before {
    transition: none;
  }
}
</style>
