<template>
  <Transition name="drop-overlay">
    <div
      v-if="active"
      class="drop-overlay"
      aria-hidden="true"
    >
      <div class="drop-overlay-frame">
        <Upload
          class="drop-overlay-icon"
          :size="16"
          :stroke-width="1.75"
        />
        <span class="drop-overlay-label">{{ label }}</span>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { Upload } from 'lucide-vue-next'

withDefaults(defineProps<{
  active: boolean
  label?: string
}>(), {
  label: 'DROP TO ATTACH',
})
</script>

<style scoped>
/* Sits above the composer without displacing it — the layout must not shift
   under the cursor mid-drag, or the drop target moves out from under it. */
.drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: var(--radius-sm, 6px);
  /* Pointer-transparent so dragover keeps firing on the zone underneath;
     an interactive overlay would strobe the enter/leave counter. */
  pointer-events: none;
  background: color-mix(in srgb, var(--ui-surface-chat-bg) 82%, transparent);
  backdrop-filter: blur(1px);
}

.drop-overlay-frame {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 100%;
  justify-content: center;
  border: 1px dashed color-mix(in srgb, var(--ui-border-strong-border) 70%, transparent);
  border-radius: var(--radius-xs, 4px);
  color: var(--ui-text-muted-fg);
}

.drop-overlay-icon {
  flex-shrink: 0;
}

.drop-overlay-label {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 2px;
  user-select: none;
}

.drop-overlay-enter-active,
.drop-overlay-leave-active {
  transition: opacity var(--duration-fast) var(--ease-default);
}

.drop-overlay-enter-from,
.drop-overlay-leave-to {
  opacity: 0;
}
</style>
