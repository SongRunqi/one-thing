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

    <Transition name="app-mention-dropdown">
      <div
        v-if="dropdownVisible"
        :id="listboxId"
        ref="dropdownRef"
        class="app-mention-dropdown"
        :class="popperClass"
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
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  toRefs,
  watch,
  type StyleValue,
} from 'vue'
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
const isFocused = ref(false)
const highlightedIndex = ref(0)
const lastSearchKey = ref('')
const valueOnFocus = ref(innerValue.value)
const listboxId = `app-mention-listbox-${++mentionIdCounter}`

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

const dropdownStyle = computed<StyleValue>(() => {
  const style: Record<string, string> = componentProps.placement === 'top'
    ? { bottom: `calc(100% + ${componentProps.offset}px)` }
    : { top: `calc(100% + ${componentProps.offset}px)` }

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
    case 'Escape':
      event.preventDefault()
      activeTrigger.value = null
      break
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

  updateValue(nextValue)
  activeTrigger.value = null
  emit('select', option.raw, trigger.prefix)

  nextTick(() => {
    focus()
    setSelection(nextCursor, nextCursor)
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

  const input = inputElement()
  const cursor = input?.selectionStart ?? innerValue.value.length
  const trigger = findActiveTrigger(innerValue.value, cursor)

  activeTrigger.value = trigger
  if (trigger) highlightedIndex.value = Math.max(filteredOptions.value.findIndex(option => !option.disabled), 0)
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

function handlePointerDown(event: PointerEvent) {
  if (!rootRef.value?.contains(event.target as Node)) {
    activeTrigger.value = null
  }
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

onMounted(() => {
  document.addEventListener('pointerdown', handlePointerDown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', handlePointerDown)
})

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
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 13px;
}

.app-mention-input {
  width: 100%;
  min-width: 0;
  min-height: 34px;
  padding: 7px 10px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  outline: none;
  background: var(--ui-surface-input-bg, var(--bg-input, var(--bg)));
  color: var(--ui-text-primary-fg, var(--text));
  font: inherit;
  line-height: 18px;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
}

.app-mention-textarea {
  resize: vertical;
}

.app-mention-input:hover,
.app-mention.is-focused .app-mention-input {
  border-color: var(--ui-border-focus-border, var(--ui-accent-primary-fg, var(--accent)));
  background: var(--ui-surface-elevated-bg, var(--bg-elevated, var(--bg)));
}

.app-mention.is-focused .app-mention-input {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 24%, transparent);
}

.app-mention-input::placeholder {
  color: var(--ui-text-muted-fg, var(--muted));
}

.app-mention.is-disabled,
.app-mention.is-readonly {
  opacity: 0.62;
}

.app-mention-dropdown {
  position: absolute;
  z-index: calc(var(--z-dropdown, 100) + 20);
  left: 0;
  min-width: 100%;
  max-width: min(360px, calc(100vw - 24px));
  max-height: 268px;
  overflow: auto;
  padding: 5px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated, var(--bg)));
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.18);
}

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
  color: var(--ui-text-secondary-fg, var(--text-secondary, var(--text)));
  text-align: left;
  cursor: pointer;
}

.app-mention-option:hover,
.app-mention-option.highlighted {
  color: var(--ui-text-primary-fg, var(--text));
  background: var(--ui-state-hover-bg, var(--hover));
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
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 12px;
}

.app-mention-dropdown-header {
  border-bottom: 1px solid var(--ui-border-subtle-border, var(--border-muted, var(--border)));
}

.app-mention-dropdown-footer {
  border-top: 1px solid var(--ui-border-subtle-border, var(--border-muted, var(--border)));
}

.app-mention-dropdown-enter-active,
.app-mention-dropdown-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.app-mention-dropdown-enter-from,
.app-mention-dropdown-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}
</style>
