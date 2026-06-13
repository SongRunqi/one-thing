<template>
  <Button
    unstyled
    class="allow-button"
    native-type="button"
    title="Allow (Enter)"
    @click="emit('confirm', 'once')"
  >
    Allow
  </Button>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
type PermissionResponse = 'once'

const emit = defineEmits<{
  confirm: [response: PermissionResponse]
}>()
</script>

<style scoped>
.allow-button {
  height: 26px;
  padding: 0 10px;
  border-radius: var(--radius-sm, 8px);
  font-size: var(--font-size-sm, 12px);
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--ui-status-success-border, var(--border-success)) 28%, transparent);
  background: color-mix(in srgb, var(--ui-status-success-fg, var(--color-success)) 9%, transparent);
  color: var(--ui-status-success-fg, var(--text-success));
  transition: all var(--duration-fast, 0.15s) var(--ease-default, ease);
}

.allow-button:hover {
  background: color-mix(in srgb, var(--ui-status-success-fg, var(--color-success)) 14%, transparent);
  border-color: color-mix(in srgb, var(--ui-status-success-border, var(--border-success)) 42%, transparent);
}

.allow-button:active {
  transform: scale(0.97);
}
</style>
