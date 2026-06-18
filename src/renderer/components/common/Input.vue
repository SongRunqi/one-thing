<template>
  <div
    ref="rootRef"
    v-bind="$attrs"
    class="app-input"
    :class="inputClasses"
  >
    <template v-if="isTextarea">
      <div class="app-input-textarea-wrap">
        <textarea
          :id="id"
          ref="textareaRef"
          class="app-input-textarea"
          :class="inputClass"
          :style="resolvedTextareaStyle"
          :value="displayValue"
          :name="name"
          :rows="rows"
          :maxlength="maxlength"
          :minlength="minlength"
          :placeholder="placeholder"
          :disabled="disabled"
          :readonly="readonly"
          :autofocus="autofocus"
          :tabindex="tabindex"
          :aria-label="ariaLabel"
          :aria-invalid="ariaInvalid"
          :aria-describedby="ariaDescribedby"
          :spellcheck="spellcheck"
          @input="handleInput"
          @change="handleChange"
          @focus="handleFocus"
          @blur="handleBlur"
          @keydown="handleKeydown"
          @compositionstart="handleCompositionStart"
          @compositionupdate="handleCompositionUpdate"
          @compositionend="handleCompositionEnd"
        />

        <button
          v-if="showClear"
          class="app-input-clear app-input-clear--textarea"
          type="button"
          :aria-label="clearAriaLabel"
          @click.prevent="clear"
        >
          <component
            :is="resolvedClearIcon"
            class="app-input-action-icon"
            :size="15"
            :stroke-width="2"
            aria-hidden="true"
          />
        </button>

        <span
          v-if="showLimitCount"
          class="app-input-count app-input-count--textarea"
        >
          {{ textLength }} / {{ maxLengthNumber }}
        </span>
      </div>
    </template>

    <template v-else>
      <div
        v-if="$slots.prepend"
        class="app-input-group app-input-group--prepend"
      >
        <slot name="prepend" />
      </div>

      <div class="app-input-control">
        <span
          v-if="hasPrefix"
          class="app-input-prefix"
        >
          <component
            :is="resolvedPrefixIcon"
            v-if="resolvedPrefixIcon"
            class="app-input-affix-icon"
            :size="affixIconSize"
            :stroke-width="1.9"
            aria-hidden="true"
          />
          <slot
            v-else
            name="prefix"
          />
        </span>

        <input
          :id="id"
          ref="inputRef"
          class="app-input-inner"
          :class="inputClass"
          :style="inputStyle"
          :type="resolvedInputType"
          :value="displayValue"
          :name="name"
          :maxlength="maxlength"
          :minlength="minlength"
          :placeholder="placeholder"
          :disabled="disabled"
          :readonly="readonly"
          :autocomplete="autocomplete"
          :autofocus="autofocus"
          :inputmode="inputmode"
          :tabindex="tabindex"
          :aria-label="ariaLabel"
          :aria-invalid="ariaInvalid"
          :aria-describedby="ariaDescribedby"
          :spellcheck="spellcheck"
          @input="handleInput"
          @change="handleChange"
          @focus="handleFocus"
          @blur="handleBlur"
          @keydown="handleKeydown"
          @compositionstart="handleCompositionStart"
          @compositionupdate="handleCompositionUpdate"
          @compositionend="handleCompositionEnd"
        >

        <span
          v-if="hasSuffix"
          class="app-input-suffix"
        >
          <slot name="suffix" />

          <component
            :is="resolvedSuffixIcon"
            v-if="resolvedSuffixIcon"
            class="app-input-affix-icon"
            :size="affixIconSize"
            :stroke-width="1.9"
            aria-hidden="true"
          />

          <span
            v-if="showLimitCount"
            class="app-input-count"
          >
            {{ textLength }} / {{ maxLengthNumber }}
          </span>

          <button
            v-if="showPasswordToggle"
            class="app-input-action"
            type="button"
            :aria-label="passwordVisible ? hidePasswordAriaLabel : showPasswordAriaLabel"
            @click.prevent="togglePasswordVisible"
          >
            <slot
              v-if="$slots['password-icon']"
              name="password-icon"
              :visible="passwordVisible"
            />
            <component
              :is="passwordVisible ? EyeOff : Eye"
              v-else
              class="app-input-action-icon"
              :size="15"
              :stroke-width="2"
              aria-hidden="true"
            />
          </button>

          <button
            v-if="showClear"
            class="app-input-action app-input-clear"
            type="button"
            :aria-label="clearAriaLabel"
            @click.prevent="clear"
          >
            <component
              :is="resolvedClearIcon"
              class="app-input-action-icon"
              :size="15"
              :stroke-width="2"
              aria-hidden="true"
            />
          </button>
        </span>
      </div>

      <div
        v-if="$slots.append"
        class="app-input-group app-input-group--append"
      >
        <slot name="append" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import {
  CircleX,
  Eye,
  EyeOff,
} from 'lucide-vue-next'
import {
  computed,
  nextTick,
  onMounted,
  ref,
  toRaw,
  useSlots,
  watch,
  type CSSProperties,
  type StyleValue,
} from 'vue'
import type {
  InputAutosize,
  InputFormatter,
  InputIcon,
  InputMode,
  InputModelValue,
  InputNativeType,
  InputParser,
  InputResize,
  InputSize,
  InputStyle,
} from './input'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<{
  modelValue?: InputModelValue
  type?: InputNativeType | 'textarea'
  size?: InputSize
  disabled?: boolean
  readonly?: boolean
  clearable?: boolean
  showPassword?: boolean
  showWordLimit?: boolean
  placeholder?: string
  id?: string
  name?: string
  autocomplete?: string
  autofocus?: boolean
  inputmode?: InputMode
  tabindex?: string | number
  maxlength?: string | number
  minlength?: string | number
  rows?: number
  autosize?: InputAutosize
  resize?: InputResize
  formatter?: InputFormatter
  parser?: InputParser
  prefixIcon?: InputIcon
  suffixIcon?: InputIcon
  clearIcon?: InputIcon
  inputStyle?: InputStyle
  inputClass?: string
  ariaLabel?: string
  ariaInvalid?: boolean | 'true' | 'false'
  ariaDescribedby?: string
  spellcheck?: boolean | 'true' | 'false'
  validateEvent?: boolean
  clearAriaLabel?: string
  showPasswordAriaLabel?: string
  hidePasswordAriaLabel?: string
}>(), {
  modelValue: '',
  type: 'text',
  size: 'default',
  disabled: false,
  readonly: false,
  clearable: false,
  showPassword: false,
  showWordLimit: false,
  placeholder: '',
  id: undefined,
  name: undefined,
  autocomplete: 'off',
  autofocus: false,
  inputmode: undefined,
  tabindex: undefined,
  maxlength: undefined,
  minlength: undefined,
  rows: 2,
  autosize: false,
  resize: 'vertical',
  formatter: undefined,
  parser: undefined,
  prefixIcon: undefined,
  suffixIcon: undefined,
  clearIcon: undefined,
  inputStyle: undefined,
  inputClass: '',
  ariaLabel: undefined,
  ariaInvalid: undefined,
  ariaDescribedby: undefined,
  spellcheck: undefined,
  validateEvent: true,
  clearAriaLabel: 'Clear input',
  showPasswordAriaLabel: 'Show password',
  hidePasswordAriaLabel: 'Hide password',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  input: [value: string]
  change: [value: string]
  focus: [event: FocusEvent]
  blur: [event: FocusEvent]
  clear: []
  keydown: [event: KeyboardEvent]
  compositionstart: [event: CompositionEvent]
  compositionupdate: [event: CompositionEvent]
  compositionend: [event: CompositionEvent]
}>()

const slots = useSlots()
const rootRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const focused = ref(false)
const isComposing = ref(false)
const passwordVisible = ref(false)
const textareaHeight = ref('')
const textareaOverflowY = ref<CSSProperties['overflowY']>()

const isTextarea = computed(() => props.type === 'textarea')
const normalizedValue = computed(() => props.modelValue === null || props.modelValue === undefined
  ? ''
  : String(props.modelValue))

const displayValue = computed(() => {
  const value = normalizedValue.value
  return props.formatter ? props.formatter(value) : value
})

const textLength = computed(() => normalizedValue.value.length)
const maxLengthNumber = computed(() => {
  const value = Number(props.maxlength)
  return Number.isFinite(value) && value >= 0 ? value : undefined
})
const showLimitCount = computed(() => props.showWordLimit && maxLengthNumber.value !== undefined)
const showClear = computed(() =>
  props.clearable &&
  !props.disabled &&
  !props.readonly &&
  textLength.value > 0
)

const showPasswordToggle = computed(() =>
  props.showPassword &&
  props.type === 'password' &&
  !props.disabled
)
const resolvedInputType = computed<InputNativeType>(() => {
  if (showPasswordToggle.value) {
    return passwordVisible.value ? 'text' : 'password'
  }
  return props.type === 'textarea' ? 'text' : props.type
})

const resolvedPrefixIcon = computed(() => props.prefixIcon ? toRaw(props.prefixIcon) : undefined)
const resolvedSuffixIcon = computed(() => props.suffixIcon ? toRaw(props.suffixIcon) : undefined)
const resolvedClearIcon = computed(() => props.clearIcon ? toRaw(props.clearIcon) : CircleX)

const hasPrefix = computed(() => !isTextarea.value && Boolean(resolvedPrefixIcon.value || slots.prefix))
const hasSuffix = computed(() => !isTextarea.value && Boolean(
  slots.suffix ||
  resolvedSuffixIcon.value ||
  showLimitCount.value ||
  showPasswordToggle.value ||
  showClear.value
))

const affixIconSize = computed(() => {
  if (props.size === 'large') return 17
  if (props.size === 'small') return 13
  return 15
})

const inputClasses = computed(() => [
  `app-input--${props.size}`,
  {
    'is-disabled': props.disabled,
    'is-readonly': props.readonly,
    'is-focused': focused.value,
    'is-textarea': isTextarea.value,
    'has-prefix': hasPrefix.value,
    'has-suffix': hasSuffix.value,
    'is-group': Boolean(slots.prepend || slots.append) && !isTextarea.value,
    'is-group-prepend': Boolean(slots.prepend) && !isTextarea.value,
    'is-group-append': Boolean(slots.append) && !isTextarea.value,
  },
])

const textareaStyle = computed<StyleValue>(() => {
  const autosizeStyle: CSSProperties = {
    resize: props.autosize ? 'none' : props.resize,
  }

  if (textareaHeight.value) {
    autosizeStyle.height = textareaHeight.value
  }

  if (textareaOverflowY.value) {
    autosizeStyle.overflowY = textareaOverflowY.value
  }

  return mergeStyle(props.inputStyle, autosizeStyle)
})

const resolvedTextareaStyle = textareaStyle
const nativeRef = computed(() => inputRef.value ?? textareaRef.value)

watch(
  () => [displayValue.value, props.autosize, props.rows, props.type],
  () => {
    if (!isTextarea.value || !props.autosize) return
    void nextTick(resizeTextarea)
  },
  { immediate: true },
)

onMounted(() => {
  if (isTextarea.value && props.autosize) {
    resizeTextarea()
  }
})

function handleInput(event: Event) {
  if (isComposing.value) return
  emitInputValue((event.target as HTMLInputElement | HTMLTextAreaElement).value)
}

function handleChange(event: Event) {
  const value = parseValue((event.target as HTMLInputElement | HTMLTextAreaElement).value)
  emit('change', value)
}

function handleFocus(event: FocusEvent) {
  focused.value = true
  emit('focus', event)
}

function handleBlur(event: FocusEvent) {
  focused.value = false
  emit('blur', event)
}

function handleKeydown(event: KeyboardEvent) {
  emit('keydown', event)
}

function handleCompositionStart(event: CompositionEvent) {
  isComposing.value = true
  emit('compositionstart', event)
}

function handleCompositionUpdate(event: CompositionEvent) {
  emit('compositionupdate', event)
}

function handleCompositionEnd(event: CompositionEvent) {
  isComposing.value = false
  emit('compositionend', event)
  emitInputValue((event.target as HTMLInputElement | HTMLTextAreaElement).value)
}

function emitInputValue(value: string) {
  const parsedValue = parseValue(value)
  emit('update:modelValue', parsedValue)
  emit('input', parsedValue)

  if (isTextarea.value && props.autosize) {
    void nextTick(resizeTextarea)
  }
}

function parseValue(value: string) {
  return props.parser ? props.parser(value) : value
}

function clear() {
  if (props.disabled || props.readonly) return

  emit('update:modelValue', '')
  emit('input', '')
  emit('change', '')
  emit('clear')

  void nextTick(() => {
    focus()
    if (isTextarea.value && props.autosize) resizeTextarea()
  })
}

function togglePasswordVisible() {
  if (!showPasswordToggle.value) return
  passwordVisible.value = !passwordVisible.value
  void nextTick(focus)
}

function focus(options?: FocusOptions) {
  if (props.disabled) return
  nativeRef.value?.focus(options)
}

function blur() {
  nativeRef.value?.blur()
}

function select() {
  nativeRef.value?.select()
}

function resizeTextarea() {
  const textarea = textareaRef.value
  if (!textarea || !isTextarea.value || !props.autosize) return

  const previousHeight = textarea.style.height
  textarea.style.height = 'auto'

  const style = window.getComputedStyle(textarea)
  const lineHeight = parsePixelValue(style.lineHeight, 20)
  const padding = parsePixelValue(style.paddingTop) + parsePixelValue(style.paddingBottom)
  const border = parsePixelValue(style.borderTopWidth) + parsePixelValue(style.borderBottomWidth)
  const rowHeight = lineHeight
  const config = typeof props.autosize === 'object' ? props.autosize : {}
  const minRows = Math.max(config.minRows ?? props.rows, 1)
  const minHeight = Math.ceil(rowHeight * minRows + padding + border)
  const maxHeight = config.maxRows
    ? Math.ceil(rowHeight * Math.max(config.maxRows, minRows) + padding + border)
    : Number.POSITIVE_INFINITY
  const measuredHeight = Math.max(textarea.scrollHeight, minHeight)
  const resolvedHeight = Math.min(measuredHeight, maxHeight)

  textareaHeight.value = `${resolvedHeight}px`
  textareaOverflowY.value = Number.isFinite(maxHeight) && measuredHeight > maxHeight ? 'auto' : 'hidden'
  textarea.style.height = previousHeight
}

function parsePixelValue(value: string, fallback = 0) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function mergeStyle(base: StyleValue | undefined, extra: CSSProperties): StyleValue {
  if (!base) return extra
  if (Array.isArray(base)) return [...base, extra]
  return [base, extra]
}

defineExpose({
  blur,
  clear,
  focus,
  input: inputRef,
  isComposing,
  passwordVisible,
  ref: nativeRef,
  resizeTextarea,
  select,
  textarea: textareaRef,
  textareaStyle,
})
</script>

<style scoped>
.app-input {
  position: relative;
  display: inline-flex;
  width: 100%;
  min-width: 0;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 13px;
  line-height: 1.4;
  vertical-align: middle;
}

.app-input--small {
  font-size: 12px;
}

.app-input--large {
  font-size: 14px;
}

.app-input-control,
.app-input-textarea-wrap {
  position: relative;
  display: flex;
  width: 100%;
  min-width: 0;
  border: 1px solid var(--ui-border-default-border, var(--border));
  background: var(--ui-surface-input-bg, var(--bg-input, var(--bg)));
  color: var(--ui-text-primary-fg, var(--text));
  transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
}

.app-input-control {
  align-items: center;
  min-height: 34px;
  gap: 7px;
  padding: 0 10px;
  border-radius: 8px;
}

.app-input-textarea-wrap {
  border-radius: 8px;
}

.app-input--small .app-input-control {
  min-height: 30px;
  gap: 6px;
  padding: 0 8px;
  border-radius: 7px;
}

.app-input--large .app-input-control {
  min-height: 38px;
  padding: 0 11px;
}

.app-input-control:hover,
.app-input-textarea-wrap:hover,
.app-input.is-focused .app-input-control,
.app-input.is-focused .app-input-textarea-wrap {
  border-color: var(--ui-border-focus-border, var(--ui-accent-primary-fg, var(--accent)));
  background: var(--ui-surface-elevated-bg, var(--bg-elevated, var(--bg)));
}

.app-input.is-focused .app-input-control,
.app-input.is-focused .app-input-textarea-wrap {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 24%, transparent);
}

.app-input.is-disabled {
  opacity: 0.58;
}

.app-input.is-disabled .app-input-control,
.app-input.is-disabled .app-input-textarea-wrap {
  cursor: default;
}

.app-input-inner,
.app-input-textarea {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  font: inherit;
}

.app-input-inner {
  flex: 1 1 auto;
  height: 100%;
  min-height: 28px;
  padding: 0;
}

.app-input--small .app-input-inner {
  min-height: 24px;
}

.app-input--large .app-input-inner {
  min-height: 32px;
}

.app-input-textarea {
  min-height: 64px;
  padding: 8px 10px;
  line-height: 1.45;
}

.app-input--small .app-input-textarea {
  min-height: 56px;
  padding: 7px 9px;
}

.app-input--large .app-input-textarea {
  min-height: 74px;
  padding: 9px 11px;
}

.app-input-inner::placeholder,
.app-input-textarea::placeholder {
  color: var(--ui-text-muted-fg, var(--muted));
}

.app-input-inner:disabled,
.app-input-textarea:disabled,
.app-input-inner:read-only,
.app-input-textarea:read-only {
  cursor: default;
}

.app-input-prefix,
.app-input-suffix {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  color: var(--ui-text-muted-fg, var(--muted));
}

.app-input-prefix {
  gap: 5px;
}

.app-input-suffix {
  min-width: 0;
  gap: 4px;
}

.app-input-affix-icon,
.app-input-action-icon {
  flex: 0 0 auto;
}

.app-input-action,
.app-input-clear {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
}

.app-input-action:hover,
.app-input-clear:hover {
  color: var(--ui-text-primary-fg, var(--text));
  background: var(--ui-state-hover-bg, var(--hover));
}

.app-input-clear--textarea {
  position: absolute;
  top: 6px;
  right: 6px;
}

.app-input-count {
  flex: 0 0 auto;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
}

.app-input-count--textarea {
  position: absolute;
  right: 9px;
  bottom: 7px;
  padding: 2px 4px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--ui-surface-input-bg, var(--bg-input, var(--bg))) 86%, transparent);
}

.app-input-group {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  min-height: 34px;
  padding: 0 11px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  background: var(--ui-surface-muted-bg, var(--bg-soft, var(--hover)));
  color: var(--ui-text-secondary-fg, var(--text-secondary, var(--text)));
  font-size: 12px;
  white-space: nowrap;
}

.app-input--small .app-input-group {
  min-height: 30px;
  padding: 0 9px;
}

.app-input--large .app-input-group {
  min-height: 38px;
  padding: 0 12px;
  font-size: 13px;
}

.app-input-group--prepend {
  border-right: 0;
  border-radius: 8px 0 0 8px;
}

.app-input-group--append {
  border-left: 0;
  border-radius: 0 8px 8px 0;
}

.app-input.is-group-prepend .app-input-control {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.app-input.is-group-append .app-input-control {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.app-input.is-group-prepend.is-group-append .app-input-control {
  border-radius: 0;
}

.app-input.is-group .app-input-control:hover,
.app-input.is-group.is-focused .app-input-control {
  z-index: 1;
}
</style>
