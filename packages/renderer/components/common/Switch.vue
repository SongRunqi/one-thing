<template>
  <span
    class="app-switch"
    :class="switchClasses"
    :style="switchStyle"
  >
    <span
      v-if="showOutsideInactive"
      class="app-switch-label app-switch-label--inactive"
      :class="{ 'is-active': !isChecked }"
    >
      <component
        :is="resolvedInactiveIcon"
        v-if="resolvedInactiveIcon"
        class="app-switch-label-icon"
        :size="labelIconSize"
        :stroke-width="2"
        aria-hidden="true"
      />
      <slot
        v-else-if="$slots.inactive"
        name="inactive"
      />
      <span v-else>{{ inactiveText }}</span>
    </span>

    <button
      :id="id"
      ref="buttonRef"
      class="app-switch-core"
      type="button"
      role="switch"
      :tabindex="tabindex"
      :aria-checked="isChecked"
      :aria-label="resolvedAriaLabel"
      :aria-disabled="isNativeDisabled ? 'true' : undefined"
      :aria-busy="isBusy ? 'true' : undefined"
      :disabled="isNativeDisabled"
      @click="handleToggle"
    >
      <span
        class="app-switch-inner"
        aria-hidden="true"
      >
        <span
          v-if="hasInlinePrompt"
          class="app-switch-inline-content"
          :class="{ 'is-icon': Boolean(inlineIcon) }"
        >
          <component
            :is="inlineIcon"
            v-if="inlineIcon"
            class="app-switch-inline-icon"
            :size="inlineIconSize"
            :stroke-width="2"
          />
          <slot
            v-else-if="inlineSlotName"
            :name="inlineSlotName"
          />
          <span
            v-else-if="inlineText"
            class="app-switch-inline-text"
          >
            {{ inlineText }}
          </span>
        </span>
      </span>

      <span
        class="app-switch-action"
        aria-hidden="true"
      >
        <span
          v-if="isBusy"
          class="app-switch-spinner"
        />
        <slot
          v-else-if="actionSlotName"
          :name="actionSlotName"
        />
        <component
          :is="actionIcon"
          v-else-if="actionIcon"
          class="app-switch-action-icon"
          :size="actionIconSize"
          :stroke-width="2"
        />
      </span>
    </button>

    <input
      v-if="name"
      type="hidden"
      :name="name"
      :value="String(modelValue)"
    >

    <span
      v-if="showOutsideActive"
      class="app-switch-label app-switch-label--active"
      :class="{ 'is-active': isChecked }"
    >
      <component
        :is="resolvedActiveIcon"
        v-if="resolvedActiveIcon"
        class="app-switch-label-icon"
        :size="labelIconSize"
        :stroke-width="2"
        aria-hidden="true"
      />
      <slot
        v-else-if="$slots.active"
        name="active"
      />
      <span v-else>{{ activeText }}</span>
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed, ref, toRaw, useSlots, type StyleValue } from 'vue'
import type {
  SwitchBeforeChange,
  SwitchIcon,
  SwitchSize,
  SwitchValue,
} from './switch'

const props = withDefaults(defineProps<{
  modelValue?: SwitchValue
  disabled?: boolean
  loading?: boolean
  size?: SwitchSize
  width?: number | string
  inlinePrompt?: boolean
  activeIcon?: SwitchIcon
  inactiveIcon?: SwitchIcon
  activeActionIcon?: SwitchIcon
  inactiveActionIcon?: SwitchIcon
  activeText?: string
  inactiveText?: string
  activeValue?: SwitchValue
  inactiveValue?: SwitchValue
  name?: string
  validateEvent?: boolean
  beforeChange?: SwitchBeforeChange
  id?: string
  tabindex?: string | number
  ariaLabel?: string
  activeColor?: string
  inactiveColor?: string
  borderColor?: string
  label?: string
}>(), {
  modelValue: false,
  disabled: false,
  loading: false,
  size: '',
  width: undefined,
  inlinePrompt: false,
  activeIcon: undefined,
  inactiveIcon: undefined,
  activeActionIcon: undefined,
  inactiveActionIcon: undefined,
  activeText: '',
  inactiveText: '',
  activeValue: true,
  inactiveValue: false,
  name: '',
  validateEvent: true,
  beforeChange: undefined,
  id: undefined,
  tabindex: undefined,
  ariaLabel: undefined,
  activeColor: '',
  inactiveColor: '',
  borderColor: '',
  label: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: SwitchValue]
  change: [value: SwitchValue]
}>()

const slots = useSlots()
const buttonRef = ref<HTMLButtonElement | null>(null)
const isBeforeChangePending = ref(false)

const resolvedSize = computed<Exclude<SwitchSize, ''>>(() => props.size || 'default')
const isChecked = computed(() => props.modelValue === props.activeValue)
const isBusy = computed(() => props.loading || isBeforeChangePending.value)
const isNativeDisabled = computed(() => props.disabled || isBusy.value)

const resolvedActiveIcon = computed(() => normalizeIcon(props.activeIcon))
const resolvedInactiveIcon = computed(() => normalizeIcon(props.inactiveIcon))
const resolvedActiveActionIcon = computed(() => normalizeIcon(props.activeActionIcon))
const resolvedInactiveActionIcon = computed(() => normalizeIcon(props.inactiveActionIcon))

const hasActiveContent = computed(() => Boolean(resolvedActiveIcon.value || slots.active || props.activeText))
const hasInactiveContent = computed(() => Boolean(resolvedInactiveIcon.value || slots.inactive || props.inactiveText))
const showOutsideActive = computed(() => !props.inlinePrompt && hasActiveContent.value)
const showOutsideInactive = computed(() => !props.inlinePrompt && hasInactiveContent.value)

const inlineIcon = computed(() => isChecked.value ? resolvedActiveIcon.value : resolvedInactiveIcon.value)
const inlineSlotName = computed<'active' | 'inactive' | undefined>(() => {
  if (inlineIcon.value) return undefined
  if (isChecked.value && slots.active) return 'active'
  if (!isChecked.value && slots.inactive) return 'inactive'
  return undefined
})
const inlineText = computed(() => {
  if (inlineIcon.value || inlineSlotName.value) return ''
  return firstTextCharacter(isChecked.value ? props.activeText : props.inactiveText)
})
const hasInlinePrompt = computed(() => props.inlinePrompt && Boolean(inlineIcon.value || inlineSlotName.value || inlineText.value))

const actionSlotName = computed<'active-action' | 'inactive-action' | undefined>(() => {
  if (isChecked.value && slots['active-action']) return 'active-action'
  if (!isChecked.value && slots['inactive-action']) return 'inactive-action'
  return undefined
})
const actionIcon = computed(() => isChecked.value ? resolvedActiveActionIcon.value : resolvedInactiveActionIcon.value)

const defaultWidth = computed(() => {
  if (resolvedSize.value === 'large') return '50px'
  if (resolvedSize.value === 'small') return '32px'
  return '40px'
})

const labelIconSize = computed(() => {
  if (resolvedSize.value === 'large') return 16
  if (resolvedSize.value === 'small') return 12
  return 14
})

const inlineIconSize = computed(() => {
  if (resolvedSize.value === 'large') return 14
  if (resolvedSize.value === 'small') return 10
  return 12
})

const actionIconSize = computed(() => {
  if (resolvedSize.value === 'large') return 14
  if (resolvedSize.value === 'small') return 10
  return 12
})

const switchClasses = computed(() => [
  `app-switch--${resolvedSize.value}`,
  {
    'is-checked': isChecked.value,
    'is-disabled': props.disabled,
    'is-loading': isBusy.value,
    'is-inline-prompt': props.inlinePrompt,
    'has-outside-label': showOutsideActive.value || showOutsideInactive.value,
  },
])

const switchStyle = computed<StyleValue>(() => {
  const style: Record<string, string> = {
    '--app-switch-width': normalizeCssSize(props.width, defaultWidth.value),
  }

  if (props.activeColor) {
    style['--app-switch-on-color'] = props.activeColor
  }

  if (props.inactiveColor) {
    style['--app-switch-off-color'] = props.inactiveColor
  }

  if (props.borderColor) {
    style['--app-switch-border-color'] = props.borderColor
  }

  return style
})

const resolvedAriaLabel = computed(() => {
  return props.ariaLabel
    || props.label
    || (isChecked.value ? props.activeText : props.inactiveText)
    || 'Switch'
})

async function handleToggle(event: MouseEvent) {
  event.preventDefault()

  if (isNativeDisabled.value) return

  const nextValue = isChecked.value ? props.inactiveValue : props.activeValue

  if (props.beforeChange) {
    isBeforeChangePending.value = true

    try {
      const canChange = await props.beforeChange()
      if (canChange === false) return
    } catch {
      return
    } finally {
      isBeforeChangePending.value = false
    }
  }

  emit('update:modelValue', nextValue)
  emit('change', nextValue)
}

function normalizeIcon(icon: SwitchIcon | undefined): SwitchIcon | undefined {
  if (!icon) return undefined
  return typeof icon === 'string' ? icon : toRaw(icon)
}

function normalizeCssSize(value: number | string | undefined, fallback: string): string {
  if (value === undefined || value === '') return fallback
  if (typeof value === 'number') return `${value}px`
  return /^\d+(\.\d+)?$/.test(value) ? `${value}px` : value
}

function firstTextCharacter(value: string): string {
  return Array.from(value.trim())[0] ?? ''
}

function focus(options?: Parameters<HTMLButtonElement['focus']>[0]) {
  buttonRef.value?.focus(options)
}

defineExpose({
  focus,
})
</script>

<style scoped>
.app-switch {
  --app-switch-on-color: var(--el-switch-on-color, var(--ui-accent-primary-fg, var(--accent)));
  --app-switch-off-color: var(--el-switch-off-color, color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 36%, transparent));
  --app-switch-border-color: var(--el-switch-border-color, color-mix(in srgb, var(--ui-border-default-border, var(--border)) 72%, transparent));
  --app-switch-action-bg: var(--ui-surface-elevated-bg, var(--bg-elevated, #fff));
  --app-switch-inline-fg: var(--ui-action-primary-fg, #fff);
  --app-switch-focus-ring: color-mix(in srgb, var(--app-switch-on-color) 42%, transparent);
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  gap: 8px;
  color: var(--ui-text-secondary-fg, var(--text-secondary, var(--text)));
  vertical-align: middle;
}

.app-switch--large {
  --app-switch-height: 28px;
  --app-switch-action-size: 22px;
  --app-switch-font-size: 13px;
}

.app-switch--default {
  --app-switch-height: 24px;
  --app-switch-action-size: 18px;
  --app-switch-font-size: 12px;
}

.app-switch--small {
  --app-switch-height: 20px;
  --app-switch-action-size: 14px;
  --app-switch-font-size: 11px;
}

.app-switch-core {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  width: var(--app-switch-width);
  min-width: var(--app-switch-width);
  height: var(--app-switch-height);
  min-height: var(--app-switch-height);
  padding: 0;
  border: 1px solid var(--app-switch-border-color);
  border-radius: 999px;
  color: var(--ui-text-muted-fg, var(--muted));
  background: var(--app-switch-off-color);
  cursor: pointer;
  outline: none;
  box-sizing: border-box;
  appearance: none;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    opacity 0.18s ease;
}

.app-switch-core:focus-visible {
  box-shadow: 0 0 0 3px var(--app-switch-focus-ring);
}

.app-switch.is-checked .app-switch-core {
  border-color: color-mix(in srgb, var(--app-switch-on-color) 86%, var(--app-switch-border-color));
  background: var(--app-switch-on-color);
}

.app-switch.is-disabled .app-switch-core,
.app-switch.is-loading .app-switch-core {
  cursor: default;
  opacity: 0.58;
}

.app-switch-inner {
  position: absolute;
  inset: 0 calc(var(--app-switch-action-size) + 5px) 0 7px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  overflow: hidden;
  pointer-events: none;
}

.app-switch.is-checked .app-switch-inner {
  inset: 0 7px 0 calc(var(--app-switch-action-size) + 5px);
  justify-content: flex-start;
}

.app-switch-inline-content {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  color: var(--app-switch-inline-fg);
  font-size: var(--app-switch-font-size);
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.app-switch-inline-icon {
  flex: 0 0 auto;
}

.app-switch-inline-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.app-switch-action {
  position: absolute;
  top: 50%;
  left: 2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--app-switch-action-size);
  height: var(--app-switch-action-size);
  border-radius: 999px;
  color: var(--ui-text-muted-fg, var(--muted));
  background: var(--app-switch-action-bg);
  box-shadow:
    0 1px 3px rgba(15, 23, 42, 0.18),
    0 1px 1px rgba(15, 23, 42, 0.08);
  transform: translate(0, -50%);
  transition:
    color 0.18s ease,
    transform 0.18s ease,
    box-shadow 0.18s ease;
  pointer-events: none;
}

.app-switch.is-checked .app-switch-action {
  color: var(--app-switch-on-color);
  transform: translate(calc(var(--app-switch-width) - var(--app-switch-action-size) - 4px), -50%);
}

.app-switch-action-icon {
  flex: 0 0 auto;
}

.app-switch-spinner {
  width: 58%;
  height: 58%;
  border: 2px solid color-mix(in srgb, currentColor 22%, transparent);
  border-top-color: currentColor;
  border-radius: 999px;
  box-sizing: border-box;
  animation: app-switch-spin 0.75s linear infinite;
}

.app-switch-label {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: min(18rem, 44vw);
  gap: 5px;
  overflow: hidden;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: var(--app-switch-font-size);
  font-weight: 600;
  line-height: 1.25;
  white-space: nowrap;
  text-overflow: ellipsis;
  transition: color 0.18s ease;
}

.app-switch-label.is-active {
  color: var(--ui-text-primary-fg, var(--text));
}

.app-switch-label--active.is-active {
  color: var(--app-switch-on-color);
}

.app-switch-label-icon {
  flex: 0 0 auto;
}

@keyframes app-switch-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-switch-core,
  .app-switch-action,
  .app-switch-label {
    transition: none;
  }

  .app-switch-spinner {
    animation: app-switch-pulse 1.4s ease-in-out infinite;
  }
}

@keyframes app-switch-pulse {
  0%,
  100% {
    opacity: 0.45;
  }

  50% {
    opacity: 1;
  }
}
</style>
