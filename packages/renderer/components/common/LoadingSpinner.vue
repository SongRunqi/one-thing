<template>
  <div
    class="loading-spinner-root"
    role="status"
    aria-live="polite"
    :aria-label="statusLabel"
  >
    <span
      class="loading-spinner-ring"
      :style="spinnerStyle"
      aria-hidden="true"
    />
    <span
      v-if="label"
      class="loading-spinner-label"
    >
      {{ label }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, type StyleValue } from 'vue'

const props = withDefaults(defineProps<{
  label?: string
  size?: number
  thickness?: number
}>(), {
  label: '',
  size: 26,
  thickness: 2,
})

const spinnerStyle = computed<StyleValue>(() => ({
  '--loading-spinner-size': `${props.size}px`,
  '--loading-spinner-thickness': `${props.thickness}px`,
}))

const statusLabel = computed(() => props.label || 'Loading')
</script>

<style scoped>
.loading-spinner-root {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--ui-text-muted-fg);
  text-align: center;
}

.loading-spinner-ring {
  width: var(--loading-spinner-size);
  height: var(--loading-spinner-size);
  border: var(--loading-spinner-thickness) solid color-mix(in srgb, var(--ui-border-default-border) 78%, transparent);
  border-top-color: var(--ui-accent-primary-fg);
  border-right-color: color-mix(in srgb, var(--ui-accent-primary-fg) 54%, transparent);
  border-radius: 999px;
  animation: loading-spinner-spin 0.8s linear infinite;
}

.loading-spinner-label {
  color: var(--ui-text-muted-fg);
  font-size: 13px;
  line-height: 1.4;
}

@keyframes loading-spinner-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .loading-spinner-ring {
    animation: loading-spinner-pulse 1.4s ease-in-out infinite;
  }
}

@keyframes loading-spinner-pulse {
  0%,
  100% {
    opacity: 0.45;
  }

  50% {
    opacity: 1;
  }
}
</style>
