<template>
  <div
    :class="groupClasses"
    role="group"
    :aria-orientation="vertical ? 'vertical' : undefined"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed, provide } from 'vue'
import {
  buttonGroupContextKey,
  type ButtonSize,
  type ButtonType,
} from './button'

const props = withDefaults(defineProps<{
  type?: ButtonType
  size?: ButtonSize
  plain?: boolean
  round?: boolean
  dashed?: boolean
  circle?: boolean
  text?: boolean
  disabled?: boolean
  color?: string
  textColor?: string
  vertical?: boolean
  attached?: boolean
}>(), {
  type: undefined,
  size: undefined,
  plain: false,
  round: false,
  dashed: false,
  circle: false,
  text: false,
  disabled: false,
  color: undefined,
  textColor: undefined,
  vertical: false,
  attached: true,
})

provide(buttonGroupContextKey, {
  type: computed(() => props.type),
  size: computed(() => props.size),
  plain: computed(() => props.plain),
  round: computed(() => props.round),
  dashed: computed(() => props.dashed),
  circle: computed(() => props.circle),
  text: computed(() => props.text),
  disabled: computed(() => props.disabled),
  color: computed(() => props.color),
  textColor: computed(() => props.textColor),
})

const groupClasses = computed(() => [
  'button-group',
  props.vertical ? 'button-group--vertical' : 'button-group--horizontal',
  {
    'is-attached': props.attached,
    'is-loose': !props.attached,
  },
])
</script>

<style scoped>
.button-group {
  display: inline-flex;
  align-items: stretch;
  vertical-align: middle;
}

.button-group--horizontal {
  flex-direction: row;
}

.button-group--vertical {
  flex-direction: column;
}

.button-group.is-loose {
  gap: 6px;
}

.button-group.is-attached :deep(.app-button) {
  position: relative;
  border-radius: 0;
}

.button-group.is-attached :deep(.app-button:hover),
.button-group.is-attached :deep(.app-button:focus-visible) {
  z-index: 1;
}

.button-group--horizontal.is-attached :deep(.app-button + .app-button) {
  margin-left: -1px;
}

.button-group--horizontal.is-attached :deep(.app-button:first-child) {
  border-top-left-radius: var(--app-button-radius, 7px);
  border-bottom-left-radius: var(--app-button-radius, 7px);
}

.button-group--horizontal.is-attached :deep(.app-button:last-child) {
  border-top-right-radius: var(--app-button-radius, 7px);
  border-bottom-right-radius: var(--app-button-radius, 7px);
}

.button-group--horizontal.is-attached :deep(.app-button.is-round:first-child) {
  border-top-left-radius: 999px;
  border-bottom-left-radius: 999px;
}

.button-group--horizontal.is-attached :deep(.app-button.is-round:last-child) {
  border-top-right-radius: 999px;
  border-bottom-right-radius: 999px;
}

.button-group--vertical.is-attached :deep(.app-button + .app-button) {
  margin-top: -1px;
}

.button-group--vertical.is-attached :deep(.app-button:first-child) {
  border-top-left-radius: var(--app-button-radius, 7px);
  border-top-right-radius: var(--app-button-radius, 7px);
}

.button-group--vertical.is-attached :deep(.app-button:last-child) {
  border-bottom-right-radius: var(--app-button-radius, 7px);
  border-bottom-left-radius: var(--app-button-radius, 7px);
}

.button-group--vertical.is-attached :deep(.app-button.is-round:first-child) {
  border-top-left-radius: 999px;
  border-top-right-radius: 999px;
}

.button-group--vertical.is-attached :deep(.app-button.is-round:last-child) {
  border-bottom-right-radius: 999px;
  border-bottom-left-radius: 999px;
}

.button-group.is-attached :deep(.app-button:only-child) {
  border-radius: var(--app-button-radius, 7px);
}

.button-group.is-attached :deep(.app-button.is-round:only-child) {
  border-radius: 999px;
}

.button-group.is-attached :deep(.app-button.is-circle:only-child) {
  border-radius: 50%;
}
</style>
