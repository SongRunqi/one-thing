<template>
  <component
    :is="props.as"
    class="border-box"
    :class="{ 'is-interactive': props.interactive }"
    :style="borderStyle"
  >
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed, type StyleValue } from 'vue'
import { createBorderBoxStyle, type BorderBoxProps } from './border'

defineOptions({
  name: 'BorderBox',
})

const props = withDefaults(defineProps<BorderBoxProps>(), {
  as: 'div',
  borderStyle: 'solid',
  radius: 'md',
  radiusValue: undefined,
  shadow: 'none',
  shadowValue: undefined,
  hoverShadowValue: undefined,
  tone: 'default',
  surface: 'transparent',
  background: undefined,
  hoverBackground: undefined,
  borderColor: undefined,
  hoverBorderColor: undefined,
  focusRingColor: undefined,
  width: 1,
  padding: 0,
  interactive: false,
})

const borderStyle = computed<StyleValue>(() => createBorderBoxStyle(props))
</script>

<style scoped>
.border-box {
  box-sizing: border-box;
  min-width: 0;
  border:
    var(--border-box-border-width, 1px)
    var(--border-box-border-style, solid)
    var(--border-box-border-color, var(--ui-border-default-border, var(--border)));
  border-radius: var(--border-box-border-radius, var(--radius-md));
  background: var(--border-box-background, transparent);
  box-shadow: var(--border-box-shadow, none);
  padding: var(--border-box-padding, 0);
  color: var(--ui-text-primary-fg, var(--text));
  transition:
    border-color var(--duration-fast, 0.15s) var(--ease-default, ease),
    background var(--duration-fast, 0.15s) var(--ease-default, ease),
    box-shadow var(--duration-fast, 0.15s) var(--ease-default, ease);
}

.border-box.is-interactive {
  cursor: pointer;
}

.border-box.is-interactive:hover {
  border-color: var(--border-box-hover-border-color, var(--border-box-border-color, var(--ui-border-default-border, var(--border))));
  background: var(--border-box-hover-background, var(--border-box-background, transparent));
  box-shadow: var(--border-box-hover-shadow, var(--border-box-shadow, none));
}

.border-box.is-interactive:focus-visible {
  outline: none;
  box-shadow:
    var(--border-box-shadow, none),
    0 0 0 2px var(--ui-surface-app-bg, var(--bg-app)),
    0 0 0 4px var(--border-box-focus-ring-color, var(--ui-border-focus-ring, var(--ui-accent-primary-fg, var(--accent))));
}
</style>
