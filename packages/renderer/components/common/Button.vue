<template>
  <BorderBox
    ref="buttonRef"
    as="button"
    :class="buttonClasses"
    :style="buttonStyle"
    :border-style="resolvedBorderStyle"
    :border-color="resolvedBorderColor"
    :hover-border-color="resolvedHoverBorderColor"
    :background="resolvedBackground"
    :hover-background="resolvedHoverBackground"
    :radius-value="resolvedBorderRadius"
    :shadow-value="resolvedShadow"
    :hover-shadow-value="resolvedHoverShadow"
    :focus-ring-color="resolvedFocusRingColor"
    :width="resolvedBorderWidth"
    :padding="resolvedPadding"
    :unstyled="isUnstyled"
    :interactive="!isDisabled"
    :type="nativeButtonType"
    :disabled="isDisabled"
    :aria-disabled="isDisabled ? 'true' : undefined"
    :aria-busy="isLoading ? 'true' : undefined"
    @click="handleClick"
  >
    <span class="app-button-content">
      <span
        v-if="isLoading"
        class="app-button-spinner"
        aria-hidden="true"
      />
      <component
        :is="resolvedIcon"
        v-else-if="resolvedIcon"
        class="app-button-icon"
        :size="iconSize"
        :stroke-width="1.9"
        aria-hidden="true"
      />
      <span
        v-else-if="$slots.icon"
        class="app-button-icon app-button-slotted-icon"
        aria-hidden="true"
      >
        <slot name="icon" />
      </span>

      <span
        v-if="showLabel"
        class="app-button-label"
      >
        <template v-if="isLoading && loadingText">{{ loadingText }}</template>
        <slot v-else />
      </span>
    </span>
  </BorderBox>
</template>

<script setup lang="ts">
import { computed, inject, ref, toRaw, useSlots, type Component, type StyleValue } from 'vue'
import BorderBox from './BorderBox.vue'
import {
  buttonGroupContextKey,
  type ButtonNativeType,
  type ButtonSize,
  type ButtonType,
} from './button'
import type { BorderLineStyle } from './border'

const props = withDefaults(defineProps<{
  type?: ButtonType
  nativeType?: ButtonNativeType
  size?: ButtonSize
  plain?: boolean
  round?: boolean
  dashed?: boolean
  circle?: boolean
  disabled?: boolean
  text?: boolean
  icon?: Component
  loading?: boolean
  loadingText?: string
  color?: string
  textColor?: string
  unstyled?: boolean
}>(), {
  type: undefined,
  nativeType: 'button',
  size: undefined,
  plain: false,
  round: false,
  dashed: false,
  circle: false,
  disabled: false,
  text: false,
  icon: undefined,
  loading: false,
  loadingText: '',
  color: undefined,
  textColor: undefined,
  unstyled: false,
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const slots = useSlots()
const group = inject(buttonGroupContextKey, null)
const buttonRef = ref<HTMLElement | { $el?: HTMLElement } | null>(null)

const resolvedType = computed<ButtonType>(() => props.type ?? group?.type.value ?? 'default')
const resolvedSize = computed<ButtonSize>(() => props.size ?? group?.size.value ?? 'default')
const isPlain = computed(() => props.plain || group?.plain.value || false)
const isRound = computed(() => props.round || group?.round.value || false)
const isDashed = computed(() => props.dashed || group?.dashed.value || false)
const isCircle = computed(() => props.circle || group?.circle.value || false)
const isText = computed(() => props.text || group?.text.value || false)
const isUnstyled = computed(() => props.unstyled)
const isLoading = computed(() => props.loading)
const isDisabled = computed(() => props.disabled || group?.disabled.value || isLoading.value || false)
const resolvedColor = computed(() => props.color ?? group?.color.value)
const resolvedTextColor = computed(() => props.textColor ?? group?.textColor.value)
const nativeButtonType = computed(() => props.nativeType)
const resolvedIcon = computed(() => props.icon ? toRaw(props.icon) : undefined)
const resolvedBorderStyle = computed<BorderLineStyle>(() => isDashed.value && !isText.value ? 'dashed' : 'solid')
/**
 * `unstyled` means the caller owns the whole look, so the button hands BorderBox
 * nothing to paint with — not even a transparent value. A transparent value is
 * still a declaration, and a declaration on this root element competes with the
 * caller's own scoped rule; `.border-box.is-interactive:hover` even out-weighs a
 * caller's `.card:hover`, which is how one caller's border came to disappear on
 * hover. Withdrawing beats winning.
 */
const paintOrNone = (value: string) => (isUnstyled.value ? undefined : value)
const resolvedBorderColor = computed(() => paintOrNone('var(--app-button-border)'))
const resolvedHoverBorderColor = computed(() => paintOrNone('var(--app-button-hover-border)'))
const resolvedBackground = computed(() => paintOrNone('var(--app-button-fill)'))
const resolvedHoverBackground = computed(() => paintOrNone('var(--app-button-hover-fill)'))
const resolvedShadow = computed(() => paintOrNone('var(--app-button-shadow)'))
const resolvedHoverShadow = computed(() => paintOrNone('var(--app-button-hover-shadow)'))
const resolvedFocusRingColor = computed(() => 'color-mix(in srgb, var(--app-button-tone) 58%, transparent)')
const resolvedBorderWidth = computed(() => (isText.value || isUnstyled.value) ? 0 : 1)
const resolvedPadding = computed(() => '0 var(--app-button-effective-padding-x)')
const resolvedBorderRadius = computed(() => {
  if (isUnstyled.value) return '0'
  if (isCircle.value) return '50%'
  if (isRound.value) return '999px'
  if (resolvedSize.value === 'small') return '6px'
  if (resolvedSize.value === 'large') return '8px'
  return '7px'
})

const showLabel = computed(() => Boolean(slots.default) || Boolean(isLoading.value && props.loadingText))
const isIconOnly = computed(() => !showLabel.value && (Boolean(resolvedIcon.value) || Boolean(slots.icon) || isLoading.value))

const iconSize = computed(() => {
  if (resolvedSize.value === 'large') return 18
  if (resolvedSize.value === 'small') return 14
  return 16
})

const buttonClasses = computed(() => [
  'app-button',
  `app-button--${resolvedType.value}`,
  `app-button--${resolvedSize.value}`,
  {
    'is-plain': isPlain.value,
    'is-round': isRound.value,
    'is-dashed': isDashed.value,
    'is-circle': isCircle.value,
    'is-disabled': isDisabled.value,
    'is-text': isText.value,
    'is-unstyled': isUnstyled.value,
    'is-loading': isLoading.value,
    'is-icon-only': isIconOnly.value,
    'has-custom-color': Boolean(resolvedColor.value),
  },
])

const buttonStyle = computed<StyleValue>(() => {
  const style: Record<string, string> = {}

  if (resolvedColor.value) {
    style['--app-button-custom-color'] = resolvedColor.value
  }

  if (resolvedTextColor.value) {
    style['--app-button-custom-fg'] = resolvedTextColor.value
  }

  return style
})

function handleClick(event: MouseEvent) {
  if (isDisabled.value) {
    event.preventDefault()
    event.stopImmediatePropagation()
    return
  }

  emit('click', event)
}

function buttonElement(): HTMLButtonElement | null {
  const current = buttonRef.value
  if (!current) return null
  const element = current instanceof HTMLElement ? current : current.$el
  return element instanceof HTMLButtonElement ? element : null
}

function focus(options?: Parameters<HTMLElement['focus']>[0]) {
  buttonElement()?.focus(options)
}

function blur() {
  buttonElement()?.blur()
}

function getBoundingClientRect(): DOMRect {
  return buttonElement()?.getBoundingClientRect() ?? new DOMRect()
}

function contains(node: Node | null): boolean {
  const element = buttonElement()
  return Boolean(element && node && element.contains(node))
}

defineExpose({
  blur,
  contains,
  focus,
  getBoundingClientRect,
})
</script>

<style scoped>
/*
 * Layout skeleton is unconditional; everything whose OWNERSHIP a consumer could
 * plausibly claim — box metrics, colour, typography, paint transition — is gated
 * on `:where(:not(.is-unstyled))`, exactly as `BorderBox.vue` gates its paint.
 *
 * Why (ui-system.md §1, "同一族的第二种变体"): `<Button unstyled class="x">` puts
 * the consumer's `.x[data-v-consumer]` (0,2,0) on the same element as this file's
 * `.app-button[data-v-button]` (0,2,0). A tie is not a win — it is decided by
 * stylesheet injection order, and injection order gets reshuffled every time a
 * component is added or HMR re-inserts a chunk. That is the SEND-pill incident's
 * mechanism, and `color` / `font-size` / `text-align` / `white-space` / `height`
 * were all still exposed to it here.
 *
 * `:where()` contributes ZERO specificity, so every STYLED consumer's standing in
 * the cascade is bit-for-bit what it was — the gate cannot flip an existing tie.
 * What changes is only the `unstyled` case: the rules stop matching, so the
 * consumer holds these properties outright instead of winning a coin toss.
 * `.app-button.is-unstyled` keeps its `--app-button-*` overrides (custom
 * properties are nobody else's namespace, and `.is-icon-only`'s
 * `width: var(--app-button-height)` still reads them), but its property-level
 * `inherit` counter-writes are gone: there is no longer anything to counter.
 */
.app-button {
  --app-button-tone: var(--ui-text-secondary-fg);
  --app-button-fill: var(--ui-action-secondary-bg, var(--ui-state-hover-bg));
  --app-button-fg: var(--ui-action-secondary-fg, var(--ui-text-primary-fg));
  --app-button-border: var(--ui-border-default-border);
  --app-button-hover-fill: var(--ui-surface-elevated-bg);
  --app-button-hover-fg: var(--ui-text-primary-fg);
  --app-button-hover-border: var(--ui-border-focus-border, var(--ui-accent-primary-fg));
  --app-button-contrast: var(--ui-action-primary-fg);
  --app-button-border-style: solid;
  --app-button-height: 32px;
  --app-button-min-width: 72px;
  --app-button-padding-x: 13px;
  --app-button-effective-padding-x: var(--app-button-padding-x);
  --app-button-gap: 7px;
  --app-button-radius: 7px;
  --app-button-font-size: 13px;
  --app-button-spinner-size: 14px;
  --app-button-spinner-thickness: 1.8px;
  --app-button-shadow: var(--ui-action-secondary-shadow, inset 0 1px 1px rgba(255, 255, 255, 0.02));
  --app-button-hover-shadow: var(--ui-action-secondary-hover-shadow, 0 3px 9px rgba(0, 0, 0, 0.08));

  display: inline-flex;
  align-items: center;
  /* Not gated: `.app-button-content` is declared `justify-content: inherit`, so
     this is Button's own internal mechanism, not a claim on the consumer's box. */
  justify-content: center;
  position: relative;
  flex: 0 0 auto;
  gap: var(--app-button-gap);
  appearance: none;
  cursor: pointer;
  user-select: none;
  vertical-align: middle;
}

.app-button:where(:not(.is-unstyled)) {
  min-width: var(--app-button-min-width);
  height: var(--app-button-height);
  min-height: var(--app-button-height);
  color: var(--app-button-fg);
  font: inherit;
  font-size: var(--app-button-font-size);
  font-weight: 650;
  line-height: 1;
  letter-spacing: 0;
  text-align: center;
  text-decoration: none;
  white-space: nowrap;
  transition:
    background var(--duration-normal) var(--ease-default),
    border-color var(--duration-normal) var(--ease-default),
    box-shadow var(--duration-normal) var(--ease-default),
    color var(--duration-normal) var(--ease-default),
    opacity var(--duration-normal) var(--ease-default),
    transform var(--duration-fast) var(--ease-default);
}

.app-button--small {
  --app-button-height: 28px;
  --app-button-min-width: 60px;
  --app-button-padding-x: 10px;
  --app-button-gap: 6px;
  --app-button-radius: 6px;
  --app-button-font-size: 12px;
  --app-button-spinner-size: 12px;
  --app-button-spinner-thickness: 1.6px;
}

.app-button--large {
  --app-button-height: 38px;
  --app-button-min-width: 84px;
  --app-button-padding-x: 16px;
  --app-button-gap: 8px;
  --app-button-radius: 8px;
  --app-button-font-size: 14px;
  --app-button-spinner-size: 16px;
  --app-button-spinner-thickness: 2px;
}

.app-button--primary {
  --app-button-tone: var(--ui-accent-primary-fg);
  --app-button-fill: var(--ui-action-primary-bg, var(--ui-accent-primary-fg));
  --app-button-fg: var(--ui-action-primary-fg);
  --app-button-border: var(--ui-action-primary-border, transparent);
  --app-button-hover-fill: var(--ui-action-primary-hover-bg, color-mix(in srgb, var(--app-button-tone) 86%, var(--ui-text-primary-fg) 14%));
  --app-button-hover-fg: var(--ui-action-primary-hover-fg, var(--ui-action-primary-fg));
  --app-button-hover-border: var(--ui-action-primary-hover-border, var(--app-button-tone));
}

.app-button--success {
  --app-button-tone: var(--ui-status-success-fg, var(--color-success));
  --app-button-fill: var(--app-button-tone);
  --app-button-fg: var(--ui-status-success-on-fg);
  --app-button-border: var(--app-button-tone);
  --app-button-hover-fill: color-mix(in srgb, var(--app-button-tone) 84%, var(--ui-text-primary-fg) 16%);
  --app-button-hover-fg: var(--ui-status-success-on-fg);
  --app-button-hover-border: var(--app-button-hover-fill);
}

.app-button--warning {
  --app-button-tone: var(--ui-status-warning-fg, var(--color-warning));
  --app-button-fill: var(--app-button-tone);
  --app-button-fg: var(--ui-status-warning-on-fg);
  --app-button-border: var(--app-button-tone);
  --app-button-hover-fill: color-mix(in srgb, var(--app-button-tone) 82%, var(--ui-text-primary-fg) 18%);
  --app-button-hover-fg: var(--ui-status-warning-on-fg);
  --app-button-hover-border: var(--app-button-hover-fill);
  --app-button-contrast: var(--ui-status-warning-on-fg);
}

.app-button--danger {
  --app-button-tone: var(--ui-status-danger-fg, var(--color-danger));
  --app-button-fill: var(--app-button-tone);
  --app-button-fg: var(--ui-status-danger-on-fg);
  --app-button-border: var(--app-button-tone);
  --app-button-hover-fill: color-mix(in srgb, var(--app-button-tone) 84%, var(--ui-text-primary-fg) 16%);
  --app-button-hover-fg: var(--ui-status-danger-on-fg);
  --app-button-hover-border: var(--app-button-hover-fill);
}

.app-button--info {
  --app-button-tone: var(--ui-status-info-fg, var(--color-info));
  --app-button-fill: var(--app-button-tone);
  --app-button-fg: var(--ui-status-info-on-fg);
  --app-button-border: var(--app-button-tone);
  --app-button-hover-fill: color-mix(in srgb, var(--app-button-tone) 82%, var(--ui-text-primary-fg) 18%);
  --app-button-hover-fg: var(--ui-status-info-on-fg);
  --app-button-hover-border: var(--app-button-hover-fill);
  --app-button-contrast: var(--ui-status-info-on-fg);
}

.app-button.has-custom-color {
  --app-button-tone: var(--app-button-custom-color);
  --app-button-fill: var(--app-button-custom-color);
  --app-button-fg: var(--app-button-custom-fg, var(--ui-action-primary-fg));
  --app-button-border: var(--app-button-custom-color);
  --app-button-hover-fill: color-mix(in srgb, var(--app-button-custom-color) 84%, var(--ui-text-primary-fg) 16%);
  --app-button-hover-fg: var(--app-button-custom-fg, var(--ui-action-primary-fg));
  --app-button-hover-border: var(--app-button-hover-fill);
  --app-button-contrast: var(--app-button-custom-fg, var(--ui-action-primary-fg));
}

/* (0,3,0) — a consumer's own `.x:hover` is (0,2,0) and loses outright, so an
   unstyled button used to repaint its text on hover over the consumer's head.
   Same gate, same zero specificity cost. */
.app-button:where(:not(.is-unstyled)):hover:not(:disabled) {
  color: var(--app-button-hover-fg);
}

.app-button:active:not(:disabled) .app-button-content {
  transform: translateY(1px);
}

.app-button:focus-visible {
  outline: none;
}

.app-button.is-plain:not(.app-button--default),
.app-button.has-custom-color.is-plain {
  --app-button-border: color-mix(in srgb, var(--app-button-tone) 42%, transparent);
  --app-button-fill: color-mix(in srgb, var(--app-button-tone) 10%, transparent);
  --app-button-hover-border: var(--app-button-tone);
  --app-button-hover-fill: var(--app-button-tone);
  --app-button-hover-fg: var(--app-button-contrast);

  color: var(--app-button-tone);
}

.app-button.is-plain:not(.app-button--default):hover:not(:disabled),
.app-button.has-custom-color.is-plain:hover:not(:disabled) {
  color: var(--app-button-contrast);
}

.app-button--default.is-plain:not(.has-custom-color) {
  --app-button-border: var(--ui-border-default-border);
  --app-button-fill: transparent;
  --app-button-hover-border: var(--ui-border-focus-border, var(--ui-accent-primary-fg));
  --app-button-hover-fill: var(--ui-state-hover-bg);
  --app-button-hover-fg: var(--ui-text-primary-fg);

  color: var(--ui-text-secondary-fg);
}

.app-button--default.is-plain:not(.has-custom-color):hover:not(:disabled) {
  color: var(--ui-text-primary-fg);
}

.app-button.is-dashed:not(.is-text) {
  --app-button-border-style: dashed;
  --app-button-border: color-mix(in srgb, var(--app-button-tone) 58%, transparent);
  --app-button-fill: transparent;
  --app-button-hover-border: var(--app-button-tone);
  --app-button-hover-fill: color-mix(in srgb, var(--app-button-tone) 10%, transparent);

  color: var(--app-button-tone);
}

.app-button--default.is-dashed:not(.is-text):not(.has-custom-color) {
  --app-button-border: color-mix(in srgb, var(--ui-border-default-border) 82%, var(--ui-text-secondary-fg));

  color: var(--ui-text-secondary-fg);
}

.app-button.is-dashed:not(.is-text):hover:not(:disabled) {
  color: var(--app-button-tone);
}

.app-button.is-text {
  --app-button-effective-padding-x: calc(var(--app-button-padding-x) * 0.55);
  --app-button-border: transparent;
  --app-button-fill: transparent;
  --app-button-hover-border: transparent;
  --app-button-hover-fill: color-mix(in srgb, var(--app-button-tone) 10%, transparent);
  --app-button-shadow: none;
  --app-button-hover-shadow: none;

  min-width: 0;
  color: var(--app-button-tone);
}

.app-button.is-unstyled {
  --app-button-fill: transparent;
  --app-button-hover-fill: transparent;
  --app-button-border: transparent;
  --app-button-hover-border: transparent;
  --app-button-shadow: none;
  --app-button-hover-shadow: none;
  --app-button-effective-padding-x: 0;
  --app-button-height: auto;
  --app-button-min-width: 0;
  --app-button-gap: 0;
  --app-button-font-size: inherit;
}

.app-button--default.is-text:not(.has-custom-color) {
  --app-button-hover-fill: var(--ui-state-hover-bg);
  --app-button-hover-fg: var(--ui-text-primary-fg);

  color: var(--ui-text-secondary-fg);
}

.app-button.is-text:hover:not(:disabled) {
  color: var(--app-button-tone);
}

.app-button--default.is-text:not(.has-custom-color):hover:not(:disabled) {
  color: var(--ui-text-primary-fg);
}

.app-button.is-round {
  --app-button-radius: 999px;
}

.app-button.is-circle,
.app-button.is-icon-only {
  --app-button-effective-padding-x: 0;

  width: var(--app-button-height);
  min-width: var(--app-button-height);
}

.app-button.is-circle {
  --app-button-radius: 50%;
}

.app-button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.app-button-content {
  display: inline-flex;
  align-items: center;
  justify-content: inherit;
  gap: var(--app-button-gap);
  width: 100%;
  min-width: 0;
  max-width: 100%;
  transform: translateY(0);
  transition: transform var(--duration-fast) var(--ease-default);
}

.app-button.is-unstyled .app-button-content {
  display: contents;
}

.app-button.is-unstyled .app-button-label {
  display: contents;
}

.app-button-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-button-icon,
.app-button-spinner {
  flex: 0 0 auto;
}

.app-button-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.app-button-slotted-icon {
  width: 1em;
  height: 1em;
}

.app-button-slotted-icon :deep(svg) {
  width: 100%;
  height: 100%;
}

.app-button-spinner {
  width: var(--app-button-spinner-size);
  height: var(--app-button-spinner-size);
  border: var(--app-button-spinner-thickness) solid color-mix(in srgb, currentColor 25%, transparent);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: app-button-spin 0.72s linear infinite;
}

@keyframes app-button-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-button,
  .app-button-content,
  .app-button-spinner {
    transition: none;
    animation-duration: 1.4s;
  }
}
</style>
