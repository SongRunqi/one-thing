<template>
  <div
    ref="rootRef"
    class="app-mention"
    :class="mentionClasses"
    @keydown="handleKeydown"
    @focusin="handleFocusIn"
    @focusout="handleFocusOut"
  >
    <textarea
      v-if="type === 'textarea'"
      :id="id"
      ref="textareaRef"
      v-model="innerValue"
      class="app-mention-input app-mention-textarea"
      :name="name"
      :rows="rows"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :aria-label="ariaLabel || placeholder"
      :aria-expanded="dropdownVisible"
      :aria-controls="listboxId"
      :autocomplete="autocomplete"
      @focus="handleFocusIn"
      @input="handleInput"
      @click="refreshTriggerFromInput"
      @keyup="refreshTriggerFromInput"
    />
    <input
      v-else
      :id="id"
      ref="inputRef"
      v-model="innerValue"
      class="app-mention-input"
      type="text"
      :name="name"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :aria-label="ariaLabel || placeholder"
      :aria-expanded="dropdownVisible"
      :aria-controls="listboxId"
      :autocomplete="autocomplete"
      @focus="handleFocusIn"
      @input="handleInput"
      @click="refreshTriggerFromInput"
      @keyup="refreshTriggerFromInput"
    >

    <Teleport
      to="body"
      :disabled="!componentProps.teleported"
    >
      <Transition name="app-mention-dropdown">
        <div
          v-if="dropdownVisible"
          :id="listboxId"
          :ref="setDropdownEl"
          class="app-mention-dropdown"
          :class="popperClass"
          :data-placement="componentProps.teleported ? (layer.placement.value ?? undefined) : undefined"
          :style="dropdownStyle"
          role="listbox"
        >
          <div
            v-if="$slots.header"
            class="app-mention-dropdown-extra app-mention-dropdown-header"
          >
            <slot name="header" />
          </div>

          <div
            v-if="loading"
            class="app-mention-empty app-mention-loading"
          >
            <slot name="loading">
              {{ loadingText }}
            </slot>
          </div>

          <template v-else-if="filteredOptions.length > 0">
            <button
              v-for="(option, index) in filteredOptions"
              :key="option.key"
              class="app-mention-option"
              type="button"
              role="option"
              :class="{ highlighted: highlightedIndex === index }"
              :data-mention-index="index"
              :aria-selected="highlightedIndex === index"
              :disabled="option.disabled"
              @mouseenter="highlightedIndex = index"
              @mousedown.prevent
              @click="selectOption(option)"
            >
              <slot
                name="label"
                :item="option.raw"
                :option="option"
                :label="option.label"
                :value="option.value"
                :index="index"
              >
                <span class="app-mention-option-label">{{ option.label }}</span>
              </slot>
            </button>
          </template>

          <div
            v-else
            class="app-mention-empty"
          >
            {{ emptyText }}
          </div>

          <div
            v-if="$slots.footer"
            class="app-mention-dropdown-extra app-mention-dropdown-footer"
          >
            <slot name="footer" />
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onUnmounted,
  ref,
  toRefs,
  watch,
  type CSSProperties,
  type StyleValue,
} from 'vue'
import { popEscLayer, pushEscLayer } from '@/composables/floating/esc-stack'
import {
  useFloatingLayer,
  type FloatingZLayer,
} from '@/composables/floating/useFloatingLayer'
import type {
  MentionCheckIsWhole,
  MentionFilterOption,
  MentionNormalizedOption,
  MentionOptionLike,
  MentionOptionProps,
  MentionTrigger,
} from './mention'

interface MentionProps {
  modelValue?: string
  options?: MentionOptionLike[]
  props?: MentionOptionProps
  type?: 'text' | 'textarea'
  prefix?: string | string[]
  split?: string
  filterOption?: MentionFilterOption
  placement?: 'top' | 'bottom'
  offset?: number
  /**
   * Drive the panel through the one positioning kernel
   * (`composables/floating/useFloatingLayer`): `position: fixed` + Teleport to
   * body, with flip and viewport clamping. Default ON — an @-mention list hangs
   * off a caret that is usually near the bottom of a composer, which is exactly
   * the case the old `position: absolute` panel could not survive.
   * Pass `false` to keep the panel inside the caller's DOM (a caller that
   * reaches it with `:deep()` needs that).
   */
  teleported?: boolean
  /** Flip to the opposite side when the requested one has no room (teleported only). */
  flip?: boolean
  /** Keep the panel inside the viewport (teleported only). */
  clamp?: boolean
  /**
   * z-index stop (docs/design/ui-system.md §3). Default `dropdown` + 20.
   * **Inside a Dialog pass `z-layer="modal"`** — the dropdown stop is 120 and
   * loses to the modal overlay's 600.
   */
  zLayer?: FloatingZLayer
  zOffset?: number
  /** Full z-index expression, when neither a stop nor an offset says it. */
  baseZ?: string
  whole?: boolean
  checkIsWhole?: MentionCheckIsWhole
  loading?: boolean
  loadingText?: string
  emptyText?: string
  popperClass?: string
  popperStyle?: StyleValue
  placeholder?: string
  disabled?: boolean
  readonly?: boolean
  rows?: number
  id?: string
  name?: string
  autocomplete?: string
  ariaLabel?: string
}

let mentionIdCounter = 0

const componentProps = withDefaults(defineProps<MentionProps>(), {
  modelValue: '',
  options: () => [],
  props: () => ({}),
  type: 'text',
  prefix: '@',
  split: ' ',
  filterOption: undefined,
  placement: 'bottom',
  offset: 6,
  teleported: true,
  flip: true,
  clamp: true,
  zLayer: 'dropdown',
  zOffset: 20,
  baseZ: undefined,
  whole: false,
  checkIsWhole: undefined,
  loading: false,
  loadingText: 'Loading',
  emptyText: 'No data',
  popperClass: undefined,
  popperStyle: undefined,
  placeholder: '',
  disabled: false,
  readonly: false,
  rows: 3,
  id: undefined,
  name: undefined,
  autocomplete: 'off',
  ariaLabel: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  input: [value: string]
  change: [value: string]
  search: [pattern: string, prefix: string]
  select: [item: MentionOptionLike, prefix: string]
  'whole-remove': [pattern: string, prefix: string]
  focus: [event: FocusEvent]
  blur: [event: FocusEvent]
}>()

const {
  type,
  placeholder,
  disabled,
  readonly,
  rows,
  id,
  name,
  autocomplete,
  ariaLabel,
  loading,
  loadingText,
  emptyText,
  popperClass,
} = toRefs(componentProps)

const rootRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const innerValue = ref(componentProps.modelValue || '')
const activeTrigger = ref<MentionTrigger | null>(null)
/** Set by `dismissDropdown`; see the note in `refreshTriggerFromInput`. */
const dismissedTriggerKey = ref<string | null>(null)
/** True between "text replaced" and "caret restored" — see the same function. */
let suppressTriggerRefresh = false
const isFocused = ref(false)
const highlightedIndex = ref(0)
const lastSearchKey = ref('')
const valueOnFocus = ref(innerValue.value)
const listboxId = `app-mention-listbox-${++mentionIdCounter}`
/** Measured from the control on every (re)placement — see `handlePositioned`. */
const anchorWidth = ref(0)
const availableHeight = ref(0)

const mentionClasses = computed(() => ({
  'is-focused': isFocused.value,
  'is-disabled': componentProps.disabled,
  'is-readonly': componentProps.readonly,
  'is-textarea': componentProps.type === 'textarea',
  'is-open': dropdownVisible.value,
}))

const optionKeys = computed(() => ({
  value: componentProps.props.value || 'value',
  label: componentProps.props.label || 'label',
  disabled: componentProps.props.disabled || 'disabled',
}))

const normalizedPrefixes = computed(() => {
  const prefixes = Array.isArray(componentProps.prefix)
    ? componentProps.prefix
    : [componentProps.prefix]

  return prefixes
    .filter(prefix => typeof prefix === 'string' && prefix.length === 1)
    .filter((prefix, index, array) => array.indexOf(prefix) === index)
})

const normalizedSplit = computed(() =>
  typeof componentProps.split === 'string' && componentProps.split.length === 1
    ? componentProps.split
    : ' '
)

const normalizedOptions = computed<MentionNormalizedOption[]>(() =>
  componentProps.options.map((raw, index) => normalizeOption(raw, index))
)

const filteredOptions = computed(() => {
  const trigger = activeTrigger.value
  if (!trigger) return []

  const pattern = trigger.pattern
  const filter = componentProps.filterOption

  return normalizedOptions.value.filter(option => {
    if (filter === false) return true
    if (typeof filter === 'function') return filter(pattern, option)
    if (!pattern) return true

    const query = pattern.toLowerCase()
    return (
      option.label.toLowerCase().includes(query) ||
      option.value.toLowerCase().includes(query)
    )
  })
})

const selectableOptions = computed(() =>
  filteredOptions.value.filter(option => !option.disabled)
)

const dropdownVisible = computed(() =>
  isFocused.value &&
  Boolean(activeTrigger.value) &&
  !componentProps.disabled &&
  !componentProps.readonly
)

/**
 * The panel goes through the one positioning kernel (ui-system.md §1: business
 * components do not write floating mechanics). What that buys over the
 * `position: absolute` + `calc(100% + offset)` it replaces: flip when the caret
 * sits near the bottom of the viewport, viewport clamping at the sides, and
 * scroll/resize tracking.
 *
 * The anchor is the control itself in BOTH modes, teleported or not: the kernel
 * also arbitrates outside-clicks, and `eventHitsLayer` has to know that a click
 * on the input is not "outside" (with a null anchor, focusing the input would
 * dismiss the list the input just opened).
 *
 * `closeOn.esc` is ON and the token is pushed on the shared Esc stack — the
 * kernel's capture-phase listener is the only thing that can beat an enclosing
 * Dialog to the key, and the stack is what tells the Dialog to stand down.
 */
const layer = useFloatingLayer({
  anchor: () => rootRef.value,
  placement: () => (componentProps.placement === 'top' ? 'top-start' : 'bottom-start'),
  offset: () => componentProps.offset,
  flip: () => componentProps.flip,
  clamp: () => componentProps.clamp,
  zLayer: () => componentProps.zLayer,
  zOffset: () => componentProps.zOffset,
  baseZ: () => componentProps.baseZ,
  closeOn: () => ({ esc: true, outside: true }),
  onPositioned: handlePositioned,
  // Closing is expressed as "there is no active trigger any more" — that is the
  // single source of `dropdownVisible`, so anything else would leave the two
  // disagreeing about whether the list is up. It has to LATCH, though: see
  // `dismissDropdown`.
  onRequestClose: () => dismissDropdown(),
})

const escToken = Symbol('mention')

watch(dropdownVisible, visible => {
  if (visible) {
    // Seeded before the kernel measures: a panel that has not yet been told its
    // minimum width gets measured at content width and then jumps.
    anchorWidth.value = Math.round(rootRef.value?.getBoundingClientRect().width ?? 0)
    pushEscLayer(escToken)
    layer.show()
    return
  }
  popEscLayer(escToken)
  layer.hide()
}, { immediate: true })

function setDropdownEl(el: unknown) {
  dropdownRef.value = el instanceof HTMLElement ? el : null
  layer.setFloatingEl(el)
}

function handlePositioned(position: { placement: string }) {
  const rect = rootRef.value?.getBoundingClientRect()
  if (!rect) return

  const width = Math.round(rect.width)
  if (width !== anchorWidth.value) anchorWidth.value = width

  const gap = componentProps.offset + 8
  const space = position.placement.startsWith('top')
    ? rect.top - gap
    : window.innerHeight - rect.bottom - gap
  const next = Math.round(Math.min(268, Math.max(96, space)))
  if (Math.abs(next - availableHeight.value) > 1) availableHeight.value = next
}

const dropdownStyle = computed<StyleValue>(() => {
  const style: CSSProperties = {}

  if (componentProps.teleported) {
    Object.assign(style, layer.floatingStyle.value)
    if (anchorWidth.value > 0) style.minWidth = `${anchorWidth.value}px`
    if (availableHeight.value > 0) style.maxHeight = `${availableHeight.value}px`
  } else if (componentProps.placement === 'top') {
    style.bottom = `calc(100% + ${componentProps.offset}px)`
  } else {
    style.top = `calc(100% + ${componentProps.offset}px)`
  }

  if (typeof componentProps.popperStyle === 'string') {
    return [style, componentProps.popperStyle]
  }

  if (Array.isArray(componentProps.popperStyle)) {
    return [style, ...componentProps.popperStyle]
  }

  return {
    ...style,
    ...(componentProps.popperStyle || {}),
  }
})

watch(
  () => componentProps.modelValue,
  value => {
    innerValue.value = value || ''
    refreshTriggerFromInput()
  }
)

watch(filteredOptions, () => {
  if (highlightedIndex.value >= filteredOptions.value.length) {
    highlightedIndex.value = Math.max(filteredOptions.value.length - 1, 0)
  }

  if (!selectableOptions.value.some(option => option === filteredOptions.value[highlightedIndex.value])) {
    highlightedIndex.value = Math.max(filteredOptions.value.findIndex(option => !option.disabled), 0)
  }
})

watch(activeTrigger, trigger => {
  if (!trigger) {
    lastSearchKey.value = ''
    return
  }

  if (!isFocused.value) return

  const searchKey = `${trigger.prefix}:${trigger.pattern}`
  if (searchKey === lastSearchKey.value) return

  lastSearchKey.value = searchKey
  emit('search', trigger.pattern, trigger.prefix)
})

function normalizeOption(raw: MentionOptionLike, index: number): MentionNormalizedOption {
  if (typeof raw === 'string') {
    return {
      key: `mention-${index}-${raw}`,
      value: raw,
      label: raw,
      disabled: false,
      raw,
    }
  }

  const value = stringifyOption(raw[optionKeys.value.value])
  const label = stringifyOption(raw[optionKeys.value.label] ?? value)

  return {
    key: `mention-${index}-${value}`,
    value,
    label,
    disabled: Boolean(raw[optionKeys.value.disabled]),
    raw,
  }
}

function handleInput(event: Event) {
  const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value
  updateValue(value)
  refreshTriggerFromInput()
}

function handleKeydown(event: KeyboardEvent) {
  if (componentProps.disabled || componentProps.readonly) return

  if (event.key === 'Backspace' && handleWholeBackspace()) {
    event.preventDefault()
    return
  }

  if (!dropdownVisible.value) return

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      moveHighlight(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      moveHighlight(-1)
      break
    case 'Enter':
    case 'Tab':
      if (highlightedOption.value) {
        event.preventDefault()
        selectOption(highlightedOption.value)
      }
      break
    // Escape is NOT handled here: the kernel owns it (`closeOn.esc`) on a
    // window capture listener, which stops the event before this bubble-phase
    // handler could ever run — and the Esc stack is what keeps an enclosing
    // Dialog from closing along with the list.
  }
}

const highlightedOption = computed(() => {
  const option = filteredOptions.value[highlightedIndex.value]
  return option && !option.disabled ? option : selectableOptions.value[0] || null
})

function moveHighlight(delta: 1 | -1) {
  const options = filteredOptions.value
  if (options.length === 0) return

  let next = highlightedIndex.value
  for (let step = 0; step < options.length; step += 1) {
    next = (next + delta + options.length) % options.length
    if (!options[next].disabled) break
  }

  highlightedIndex.value = next
  scrollHighlightedIntoView()
}

function selectOption(option: MentionNormalizedOption) {
  const trigger = activeTrigger.value
  if (!trigger || option.disabled) return

  const replacement = `${trigger.prefix}${option.value}${normalizedSplit.value}`
  const nextValue = [
    innerValue.value.slice(0, trigger.start),
    replacement,
    innerValue.value.slice(trigger.end),
  ].join('')
  const nextCursor = trigger.start + replacement.length

  suppressTriggerRefresh = true
  updateValue(nextValue)
  activeTrigger.value = null
  emit('select', option.raw, trigger.prefix)

  nextTick(() => {
    focus()
    setSelection(nextCursor, nextCursor)
    suppressTriggerRefresh = false
    refreshTriggerFromInput()
  })
}

function handleWholeBackspace() {
  const input = inputElement()
  if (!input || (!componentProps.whole && !componentProps.checkIsWhole)) return false
  if (input.selectionStart !== input.selectionEnd) return false

  const cursor = input.selectionStart ?? innerValue.value.length
  const removable = findWholeMentionBeforeCursor(innerValue.value, cursor)
  if (!removable) return false

  const nextValue = innerValue.value.slice(0, removable.start) + innerValue.value.slice(removable.end)
  updateValue(nextValue)
  emit('whole-remove', removable.pattern, removable.prefix)

  nextTick(() => {
    setSelection(removable.start, removable.start)
    refreshTriggerFromInput()
  })

  return true
}

function findWholeMentionBeforeCursor(value: string, cursor: number) {
  if (cursor <= 0) return null

  const split = normalizedSplit.value
  const end = value[cursor - 1] === split ? cursor - 1 : cursor
  if (end <= 0) return null

  const boundary = Math.max(
    value.lastIndexOf(split, end - 1),
    value.lastIndexOf('\n', end - 1),
    value.lastIndexOf('\t', end - 1)
  )
  const start = boundary + 1
  const prefix = normalizedPrefixes.value.find(item => value[start] === item)
  if (!prefix) return null

  const pattern = value.slice(start + prefix.length, end)
  if (!pattern) return null

  const passesCheck = componentProps.checkIsWhole
    ? componentProps.checkIsWhole(pattern, prefix)
    : componentProps.whole

  if (!passesCheck) return null

  return {
    start,
    end: value[cursor - 1] === split ? cursor : end,
    pattern,
    prefix,
  }
}

function refreshTriggerFromInput() {
  if (componentProps.disabled || componentProps.readonly) {
    activeTrigger.value = null
    return
  }

  // Mid-insertion the text is already the new one while the caret is still the
  // old one — recomputing against that pair invents a trigger that the user
  // never typed ("@Jeremy " read at caret 3 looks like an open `@Je`), and the
  // list pops straight back up over the mention it just completed. The caret is
  // restored on the next tick; the authoritative recompute happens there.
  if (suppressTriggerRefresh) return

  const input = inputElement()
  const cursor = input?.selectionStart ?? innerValue.value.length
  const trigger = findActiveTrigger(innerValue.value, cursor)

  // A dismissed list must STAY dismissed. The trigger is derived from the text,
  // and the text does not change when you press Escape — so the very next
  // `keyup` (the Escape key coming back up, which is also wired to this
  // function) recomputed the same trigger and put the list straight back up.
  // The latch is keyed on the trigger's exact content, so typing one more
  // character is a NEW question and re-opens the list, which is what an
  // autocomplete is expected to do.
  if (trigger && triggerKey(trigger) === dismissedTriggerKey.value) {
    activeTrigger.value = null
    return
  }
  dismissedTriggerKey.value = null

  activeTrigger.value = trigger
  if (trigger) highlightedIndex.value = Math.max(filteredOptions.value.findIndex(option => !option.disabled), 0)
}

function triggerKey(trigger: MentionTrigger) {
  return `${trigger.prefix}:${trigger.start}:${trigger.pattern}`
}

/** Close and remember it, so `refreshTriggerFromInput` cannot undo it. */
function dismissDropdown() {
  const trigger = activeTrigger.value
  dismissedTriggerKey.value = trigger ? triggerKey(trigger) : null
  activeTrigger.value = null
}

function findActiveTrigger(value: string, cursor: number): MentionTrigger | null {
  if (cursor < 0) return null

  const prefixes = normalizedPrefixes.value
  if (prefixes.length === 0) return null

  const split = normalizedSplit.value
  const beforeCursor = value.slice(0, cursor)
  const boundary = Math.max(
    beforeCursor.lastIndexOf(split),
    beforeCursor.lastIndexOf('\n'),
    beforeCursor.lastIndexOf('\t')
  )

  for (let index = cursor - 1; index > boundary; index -= 1) {
    const prefix = prefixes.find(item => value[index] === item)
    if (!prefix) continue

    const pattern = value.slice(index + prefix.length, cursor)
    if (pattern.includes(split) || pattern.includes('\n') || pattern.includes('\t')) return null

    return {
      prefix,
      pattern,
      start: index,
      end: cursor,
    }
  }

  return null
}

function updateValue(value: string) {
  innerValue.value = value
  emit('update:modelValue', value)
  emit('input', value)
}

function handleFocusIn(event: FocusEvent) {
  if (!isFocused.value) {
    isFocused.value = true
    valueOnFocus.value = innerValue.value
    emit('focus', event)
  }

  refreshTriggerFromInput()
}

function handleFocusOut(event: FocusEvent) {
  requestAnimationFrame(() => {
    if (rootRef.value?.contains(document.activeElement)) return
    isFocused.value = false
    activeTrigger.value = null
    if (innerValue.value !== valueOnFocus.value) {
      emit('change', innerValue.value)
    }
    emit('blur', event)
  })
}

function inputElement() {
  return componentProps.type === 'textarea' ? textareaRef.value : inputRef.value
}

function focus() {
  inputElement()?.focus()
}

function blur() {
  inputElement()?.blur()
}

function setSelection(start: number, end: number) {
  inputElement()?.setSelectionRange(start, end)
}

function scrollHighlightedIntoView() {
  nextTick(() => {
    const item = dropdownRef.value?.querySelector<HTMLElement>(`[data-mention-index="${highlightedIndex.value}"]`)
    item?.scrollIntoView({ block: 'nearest' })
  })
}

function stringifyOption(value: unknown) {
  if (value === undefined || value === null) return ''
  return String(value)
}

// Outside-click used to be a private `document` listener that asked
// `rootRef.contains(target)`. Teleported, the panel is no longer inside the
// root, so that question answers "outside" for every click on an option — the
// list would unmount on pointerdown and the click never reach the option. The
// kernel's `eventHitsLayer` asks about the anchor AND the layer, which is the
// question that was always meant.
//
// A panel torn down while open must not leave its token wedged on top of the
// stack — Escape would go dead app-wide.
onUnmounted(() => popEscLayer(escToken))

defineExpose({
  blur,
  focus,
  input: inputRef,
  textarea: textareaRef,
  dropdownVisible,
})
</script>

<style scoped>
.app-mention {
  position: relative;
  display: inline-flex;
  width: 100%;
  min-width: 0;
  color: var(--ui-text-primary-fg);
  font-size: 13px;
}

.app-mention-input {
  width: 100%;
  min-width: 0;
  min-height: 34px;
  padding: 7px 10px;
  border: 1px solid var(--ui-border-default-border);
  border-radius: 8px;
  outline: none;
  background: var(--ui-surface-input-bg);
  color: var(--ui-text-primary-fg);
  font: inherit;
  line-height: 18px;
  transition: border-color var(--duration-normal) var(--ease-default), box-shadow var(--duration-normal) var(--ease-default), background var(--duration-normal) var(--ease-default);
}

.app-mention-textarea {
  resize: vertical;
}

.app-mention-input:hover,
.app-mention.is-focused .app-mention-input {
  border-color: var(--ui-border-focus-border, var(--ui-accent-primary-fg));
  background: var(--ui-surface-elevated-bg);
}

.app-mention.is-focused .app-mention-input {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-accent-primary-fg) 24%, transparent);
}

.app-mention-input::placeholder {
  color: var(--ui-text-muted-fg);
}

.app-mention.is-disabled,
.app-mention.is-readonly {
  opacity: 0.62;
}

/* `position: absolute` is the non-teleported fallback only; in the default
   teleported mode the kernel writes `position: fixed` + top/left inline, and an
   inline declaration always wins. Scoped styles still reach the panel after the
   Teleport — Vue stamps the scope id on the element, not on its parent. */
.app-mention-dropdown {
  position: absolute;
  z-index: calc(var(--z-dropdown) + 20);
  left: 0;
  min-width: 100%;
  max-width: min(360px, calc(100vw - 24px));
  max-height: 268px;
  overflow: auto;
  padding: 5px;
  border: 1px solid var(--ui-border-default-border);
  border-radius: 8px;
  background: var(--ui-surface-elevated-bg);
  box-shadow: var(--shadow-floating);
}

/* Same row language as `Select.vue`'s option: 31px, 8px gap, 6px radius,
   secondary ink that goes primary under the pointer.
 *
 * Deliberately WITHOUT `margin-block: 2px`. The 2px breathing gap
 * (ui-system.md §1) exists so a persistent `selected` slab and a transient
 * `hover` slab stay readable when they sit on adjacent rows; a mention list has
 * no persistent state at all — `highlighted` is the pointer/keyboard cursor and
 * only ever one row carries it, so two coloured rows can never be adjacent.
 * Same judgment, same reason, as `Dropdown.vue`: menus are tight by convention.
 */
.app-mention-option {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 31px;
  gap: 8px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-secondary-fg);
  text-align: left;
  cursor: pointer;
}

.app-mention-option:hover,
.app-mention-option.highlighted {
  color: var(--ui-text-primary-fg);
  background: var(--ui-state-hover-bg);
}

.app-mention-option:disabled {
  opacity: 0.48;
  cursor: default;
}

.app-mention-option-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-mention-empty,
.app-mention-dropdown-extra {
  padding: 9px 10px;
  color: var(--ui-text-muted-fg);
  font-size: 12px;
}

.app-mention-dropdown-header {
  border-bottom: 1px solid var(--ui-border-subtle-border, var(--border-muted));
}

.app-mention-dropdown-footer {
  border-top: 1px solid var(--ui-border-subtle-border, var(--border-muted));
}

.app-mention-dropdown-enter-active,
.app-mention-dropdown-leave-active {
  transition: opacity var(--duration-fast) var(--ease-default), transform var(--duration-fast) var(--ease-default);
}

.app-mention-dropdown-enter-from,
.app-mention-dropdown-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}
</style>
