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
import type { CheckboxSize, CheckboxValue, CheckboxVariant } from './checkbox'

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
  /** `rule` (hanging tick, default) or `box` (bordered square) — see `checkbox.ts`. */
  variant?: CheckboxVariant
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
  variant: 'rule',
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
  `app-checkbox--${props.variant}`,
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
  color: var(--ui-text-secondary-fg);
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
  background: var(--ui-border-strong-border);
  transform: translateY(-50%);
  transition:
    width var(--duration-fast) var(--ease-default),
    height var(--duration-fast) var(--ease-default),
    background-color var(--duration-fast) var(--ease-default);
}

/*
 * The three state rules below are the `rule` register's paint, and they are
 * WITHDRAWN for the box register rather than overridden by it.
 *
 * Overriding was the first attempt and it silently lost: `.app-checkbox.is-checked
 * .app-checkbox-mark` is (0,3,0) — two classes on the ancestor — while the box's
 * `.app-checkbox--box .app-checkbox-mark` is only (0,2,0), so the hairline's
 * `width: 10px; height: 2px; background: accent` kept flattening the tick into a
 * single diagonal stroke. `:where()` contributes ZERO specificity, so each rule
 * below still weighs exactly what it weighed for the rule register — it simply
 * stops matching a box (ui-system.md §1: withdrawing beats winning).
 */
.app-checkbox:where(:not(.app-checkbox--box)):hover:not(.is-disabled) .app-checkbox-mark::before {
  background: var(--ui-text-muted-fg);
}

/* Mixed: the rule thickens but stays ink-grey — "some", not "yes". */
.app-checkbox:where(:not(.app-checkbox--box)).is-indeterminate .app-checkbox-mark::before {
  width: 10px;
  height: 2px;
  background: var(--ui-text-muted-fg);
}

.app-checkbox:where(:not(.app-checkbox--box)).is-checked .app-checkbox-mark::before {
  width: 10px;
  height: 2px;
  background: var(--ui-accent-primary-fg);
}

/* Same recipe as `Dialog.vue`'s text buttons; P4 swaps both for `.u-focus-ring`.
   One line on purpose — `shadow-literal-floating` reads line by line. */
.app-checkbox-input:focus-visible + .app-checkbox-mark {
  border-radius: var(--radius-xs);
  box-shadow: var(--ui-focus-ring-shadow);
}

.app-checkbox-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 1px;
}

.app-checkbox.is-checked .app-checkbox-label {
  color: var(--ui-text-primary-fg);
}

.app-checkbox-description {
  color: var(--ui-text-faint-fg);
  font-size: 11px;
  line-height: 1.4;
}

/* ── box register ─────────────────────────────────────────────────────────────
 * A bordered square that fills and ticks, for label-less dense rows (a table's
 * selection column). P3-B's finding: with no label beside it the 7px hanging
 * rule reads as a divider or a stray hairline, and the row stops announcing
 * that it can be selected at all — so this register exists to match the
 * legibility of the native `accent-color` square it replaces, not to be a
 * second taste option.
 *
 * The rule register's three STATE rules are withdrawn from a box with
 * `:where(:not(.app-checkbox--box))` (see them above) rather than out-weighed
 * here: `.app-checkbox.is-checked .app-checkbox-mark` is (0,3,0) and would beat
 * anything the box could say at (0,2,0). The register's BASE `::before`
 * (0,1,0) needs no gate — every property it sets is re-stated below at (0,2,0).
 */
.app-checkbox--box {
  --app-checkbox-box-size: 15px;

  /* The rule register hangs its tick at the label's first-line height
     (`1.45em`, `flex-start`). A box has no label to align to and lives in a
     row whose cell content is already centred, so it centres on its own axis
     — that is the "cell align center vs 1.45em flex-start" mismatch, settled
     on the component side so no table has to reach in with a `:deep()`. */
  align-items: center;
}

.app-checkbox--box.app-checkbox--small {
  --app-checkbox-box-size: 13px;
}

.app-checkbox--box .app-checkbox-input {
  width: var(--app-checkbox-box-size);
  height: var(--app-checkbox-box-size);
}

.app-checkbox--box .app-checkbox-mark {
  width: var(--app-checkbox-box-size);
  height: var(--app-checkbox-box-size);
  border: 1px solid var(--ui-border-strong-border);
  border-radius: var(--radius-xs);
  background: var(--ui-surface-input-bg);
  transition:
    border-color var(--duration-fast) var(--ease-default),
    background-color var(--duration-fast) var(--ease-default);
}

/* The tick: two borders of a rotated box. Drawn at rest and revealed, so the
   check grows into place instead of popping. */
.app-checkbox--box .app-checkbox-mark::before {
  top: 50%;
  left: 50%;
  /* Two borders of a box rotated 45°: the long arm is the right edge, the short
     arm the bottom one. The 1:1.75 ratio is what keeps it reading as a check
     rather than a slash at 15px — a narrower box hides the short arm inside the
     corner overlap (first draft did exactly that). */
  width: calc(var(--app-checkbox-box-size) * 0.36);
  height: calc(var(--app-checkbox-box-size) * 0.63);
  border: solid var(--ui-action-primary-fg);
  border-width: 0 2px 2px 0;
  border-radius: 0;
  background: none;
  opacity: 0;
  transform: translate(-50%, -62%) rotate(45deg) scale(0.55);
  transition:
    opacity var(--duration-fast) var(--ease-default),
    transform var(--duration-fast) var(--ease-default);
}

.app-checkbox--box:hover:not(.is-disabled) .app-checkbox-mark {
  border-color: var(--ui-text-muted-fg);
}

.app-checkbox--box.is-checked .app-checkbox-mark {
  border-color: var(--ui-accent-primary-fg);
  background: var(--ui-accent-primary-fg);
}

.app-checkbox--box.is-checked .app-checkbox-mark::before {
  opacity: 1;
  transform: translate(-50%, -62%) rotate(45deg) scale(1);
}

/* Selected rows keep their hover feedback (ui-system.md §1): one notch deeper
   on the checked fill, mixed toward the opposite tone so it reads in both
   light and dark. */
.app-checkbox--box.is-checked:hover:not(.is-disabled) .app-checkbox-mark {
  background: color-mix(in srgb, var(--ui-accent-primary-fg) 88%, var(--ui-text-primary-fg));
}

/* Mixed: a dash inside the box, ink-grey — "some", same sentence as the rule
   register's thickened hairline. */
.app-checkbox--box.is-indeterminate .app-checkbox-mark {
  border-color: var(--ui-text-muted-fg);
}

.app-checkbox--box.is-indeterminate .app-checkbox-mark::before {
  width: calc(var(--app-checkbox-box-size) * 0.5);
  height: 2px;
  border: 0;
  background: var(--ui-text-muted-fg);
  opacity: 1;
  transform: translate(-50%, -50%);
}

/* (0,2,0) + later than the box register's own (0,2,0) transitions — a bare
   `.app-checkbox-mark` here would lose to `.app-checkbox--box .app-checkbox-mark`
   and reduced-motion would silently stop applying to the box. */
@media (prefers-reduced-motion: reduce) {
  .app-checkbox .app-checkbox-mark,
  .app-checkbox .app-checkbox-mark::before {
    transition: none;
  }
}
</style>
