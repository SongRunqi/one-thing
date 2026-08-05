<template>
  <div
    ref="rootRef"
    class="app-input-otp"
    :class="otpClasses"
    role="group"
    :aria-label="ariaLabel"
    @focusout="handleFocusOut"
  >
    <template
      v-for="index in fieldCount"
      :key="`otp-${index - 1}`"
    >
      <input
        :id="inputId(index - 1)"
        :ref="element => setInputRef(element, index - 1)"
        class="app-input-otp-field"
        :type="mask ? 'password' : 'text'"
        :value="chars[index - 1] || ''"
        :inputmode="inputmode"
        :autocomplete="index === 1 ? autocomplete : 'off'"
        :name="index === 1 ? name : undefined"
        :maxlength="length"
        :disabled="disabled"
        :readonly="readonly"
        :aria-label="fieldLabel(index - 1)"
        @input="handleInput(index - 1, $event)"
        @paste="handlePaste(index - 1, $event)"
        @keydown="handleKeydown(index - 1, $event)"
        @focus="handleFocus(index - 1, $event)"
      >

      <span
        v-if="index < fieldCount && shouldRenderSeparator(index - 1)"
        class="app-input-otp-separator"
        aria-hidden="true"
      >
        <slot
          name="separator"
          :index="index - 1"
        >
          <RenderContent :content="resolveSeparator(index - 1)" />
        </slot>
      </span>
    </template>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  defineComponent,
  nextTick,
  ref,
  watch,
  type ComponentPublicInstance,
  type PropType,
  type VNodeChild,
} from 'vue'
import type {
  InputOtpModelValue,
  InputOtpInputMode,
  InputOtpSeparator,
  InputOtpSize,
  InputOtpType,
  InputOtpValidator,
} from './input-otp'

const RenderContent = defineComponent({
  name: 'RenderContent',
  props: {
    content: {
      type: null as unknown as PropType<VNodeChild>,
      default: '',
    },
  },
  setup(props) {
    return () => props.content
  },
})

const props = withDefaults(defineProps<{
  modelValue?: InputOtpModelValue
  length?: number
  validator?: InputOtpValidator
  inputmode?: InputOtpInputMode
  type?: InputOtpType
  size?: InputOtpSize
  mask?: boolean
  disabled?: boolean
  readonly?: boolean
  separator?: InputOtpSeparator
  validateEvent?: boolean
  id?: string
  name?: string
  autocomplete?: string
  ariaLabel?: string
}>(), {
  modelValue: '',
  length: 6,
  validator: () => true,
  inputmode: undefined,
  type: 'outlined',
  size: 'default',
  mask: false,
  disabled: false,
  readonly: false,
  separator: undefined,
  validateEvent: true,
  id: undefined,
  name: undefined,
  autocomplete: 'one-time-code',
  ariaLabel: 'One-time password',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  change: [value: string]
  finish: [value: string]
  focus: [event: FocusEvent]
  blur: [event: FocusEvent]
}>()

const rootRef = ref<HTMLElement | null>(null)
const inputRefs = ref<HTMLInputElement[]>([])
const resolvedLength = computed(() => Math.max(1, Math.floor(props.length || 1)))
const innerValue = ref(normalizeModelValue(props.modelValue))
const valueOnFocus = ref(innerValue.value)
const groupFocused = ref(false)
const chars = computed(() => {
  const valueChars = Array.from(innerValue.value)
  return Array.from({ length: resolvedLength.value }, (_, index) => valueChars[index] || '')
})

const fieldCount = computed(() => resolvedLength.value)

const otpClasses = computed(() => [
  `app-input-otp--${props.type}`,
  `app-input-otp--${props.size}`,
  {
    'is-disabled': props.disabled,
    'is-readonly': props.readonly,
    'is-masked': props.mask,
  },
])

watch(
  () => props.modelValue,
  value => {
    innerValue.value = normalizeModelValue(value)
  }
)

watch(resolvedLength, () => {
  if (innerValue.value.length > resolvedLength.value) {
    emitValue(innerValue.value.slice(0, resolvedLength.value))
  }
})

function setInputRef(element: Element | ComponentPublicInstance | null, index: number) {
  if (element instanceof HTMLInputElement) {
    inputRefs.value[index] = element
  }
}

function handleInput(index: number, event: Event) {
  if (props.disabled || props.readonly) return

  const target = event.target as HTMLInputElement
  const inserted = normalizeInsertedValue(target.value)

  if (inserted.length === 0) {
    target.value = chars.value[index] || ''
    return
  }

  writeChars(index, inserted)
}

function handlePaste(index: number, event: ClipboardEvent) {
  if (props.disabled || props.readonly) return

  const text = event.clipboardData?.getData('text') || ''
  const inserted = normalizeInsertedValue(text)
  if (!inserted) return

  event.preventDefault()
  writeChars(index, inserted)
}

function handleKeydown(index: number, event: KeyboardEvent) {
  if (props.disabled || props.readonly) return

  switch (event.key) {
    case 'Backspace':
      event.preventDefault()
      if (chars.value[index]) {
        clearAt(index)
        focusIndex(index)
      } else if (index > 0) {
        clearAt(index - 1)
        focusIndex(index - 1)
      }
      break
    case 'Delete':
      event.preventDefault()
      clearAt(index)
      focusIndex(index)
      break
    case 'ArrowLeft':
      event.preventDefault()
      focusIndex(index - 1)
      break
    case 'ArrowRight':
      event.preventDefault()
      focusIndex(index + 1)
      break
    case 'Home':
      event.preventDefault()
      focusIndex(0)
      break
    case 'End':
      event.preventDefault()
      focusIndex(resolvedLength.value - 1)
      break
  }
}

function handleFocus(index: number, event: FocusEvent) {
  if (!groupFocused.value) {
    groupFocused.value = true
    valueOnFocus.value = innerValue.value
    emit('focus', event)
  }

  nextTick(() => {
    inputRefs.value[index]?.select()
  })
}

function handleFocusOut(event: FocusEvent) {
  requestAnimationFrame(() => {
    if (rootRef.value?.contains(document.activeElement)) return

    groupFocused.value = false

    if (innerValue.value !== valueOnFocus.value) {
      emit('change', innerValue.value)
    }

    emit('blur', event)
  })
}

function writeChars(index: number, inserted: string) {
  const nextChars = [...chars.value]
  let cursor = index

  for (const char of Array.from(inserted)) {
    if (cursor >= resolvedLength.value) break
    nextChars[cursor] = char
    cursor += 1
  }

  const nextValue = nextChars.join('').slice(0, resolvedLength.value)
  emitValue(nextValue)
  focusIndex(Math.min(cursor, resolvedLength.value - 1))
}

function clearAt(index: number) {
  const nextChars = [...chars.value]
  nextChars[index] = ''
  emitValue(nextChars.join(''))
}

function emitValue(value: string) {
  const normalized = value.slice(0, resolvedLength.value)
  innerValue.value = normalized
  emit('update:modelValue', normalized)

  if (normalized.length === resolvedLength.value && Array.from(normalized).every(Boolean)) {
    emit('finish', normalized)
  }
}

function normalizeInsertedValue(value: string) {
  return Array.from(value).filter(char => props.validator(char)).join('')
}

function normalizeModelValue(value: InputOtpModelValue) {
  if (value === undefined || value === null) return ''
  return Array.from(String(value)).filter(char => props.validator(char)).join('').slice(0, resolvedLength.value)
}

function focusIndex(index: number) {
  const boundedIndex = Math.min(Math.max(index, 0), resolvedLength.value - 1)
  nextTick(() => {
    inputRefs.value[boundedIndex]?.focus()
    inputRefs.value[boundedIndex]?.select()
  })
}

function focus(index = 0) {
  if (props.disabled) return
  focusIndex(index)
}

function blur() {
  inputRefs.value.forEach(input => input?.blur())
}

function inputId(index: number) {
  if (!props.id) return undefined
  return index === 0 ? props.id : `${props.id}-${index + 1}`
}

function fieldLabel(index: number) {
  const label = props.ariaLabel || 'One-time password'
  return `${label} digit ${index + 1}`
}

function resolveSeparator(index: number): VNodeChild {
  if (typeof props.separator === 'function') {
    return props.separator(index)
  }

  return props.separator || ''
}

function shouldRenderSeparator(index: number) {
  if (props.separator === undefined) return false
  const separator = resolveSeparator(index)
  return separator !== '' && separator !== null && separator !== undefined && separator !== false
}

defineExpose({
  blur,
  focus,
  inputRefs,
})
</script>

<style scoped>
.app-input-otp {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 8px;
  color: var(--ui-text-primary-fg);
}

.app-input-otp-field {
  width: var(--app-input-otp-size);
  height: var(--app-input-otp-size);
  flex: 0 0 var(--app-input-otp-size);
  border: 1px solid var(--ui-border-default-border);
  border-radius: 8px;
  outline: none;
  background: var(--ui-surface-input-bg);
  color: var(--ui-text-primary-fg);
  font: inherit;
  font-size: var(--app-input-otp-font-size);
  font-weight: 650;
  line-height: 1;
  text-align: center;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
}

.app-input-otp--small {
  --app-input-otp-size: 30px;
  --app-input-otp-font-size: 13px;
  gap: 6px;
}

.app-input-otp--default {
  --app-input-otp-size: 36px;
  --app-input-otp-font-size: 15px;
}

.app-input-otp--large {
  --app-input-otp-size: 42px;
  --app-input-otp-font-size: 17px;
  gap: 9px;
}

.app-input-otp-field:hover,
input.app-input-otp-field:focus {
  border-color: var(--ui-border-focus-border, var(--ui-accent-primary-fg));
  background: var(--ui-surface-elevated-bg);
}

input.app-input-otp-field:focus {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-accent-primary-fg) 24%, transparent);
}

.app-input-otp--filled .app-input-otp-field {
  border-color: transparent;
  background: var(--ui-state-hover-bg);
}

.app-input-otp--filled .app-input-otp-field:hover,
.app-input-otp--filled input.app-input-otp-field:focus {
  border-color: var(--ui-border-focus-border, var(--ui-accent-primary-fg));
}

.app-input-otp--underlined .app-input-otp-field {
  border-width: 0 0 1px;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.app-input-otp--underlined input.app-input-otp-field:focus {
  box-shadow: 0 1px 0 var(--ui-border-focus-border, var(--ui-accent-primary-fg));
}

.app-input-otp.is-disabled,
.app-input-otp.is-readonly {
  opacity: 0.62;
}

.app-input-otp-field:disabled {
  cursor: default;
}

.app-input-otp-separator {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  min-width: 6px;
  color: var(--ui-text-muted-fg);
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
}
</style>
