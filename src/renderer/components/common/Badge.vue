<template>
  <span
    :class="['badge', `tone-${tone}`, `size-${size}`]"
    :title="title || label"
  >
    <slot>{{ label }}</slot>
  </span>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  title?: string
  tone?: 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger' | 'muted'
  size?: 'xs' | 'sm'
}>(), {
  tone: 'neutral',
  size: 'xs',
})
</script>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  max-width: 100%;
  border: 1px solid transparent;
  border-radius: 5px;
  font-weight: 750;
  line-height: 1;
  white-space: nowrap;
  text-transform: uppercase;
}

.size-xs {
  min-height: 17px;
  padding: 0 5px;
  font-size: 9.5px;
}

.size-sm {
  min-height: 20px;
  padding: 0 7px;
  font-size: 10.5px;
}

.tone-neutral,
.tone-muted {
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 10%, transparent);
  border-color: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 16%, transparent);
  color: var(--ui-text-secondary-fg, var(--text-secondary));
}

.tone-accent {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 11%, transparent);
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 18%, transparent);
  color: var(--ui-accent-primary-fg, var(--accent));
}

.tone-info {
  background: color-mix(in srgb, var(--ui-status-info-fg, var(--color-info)) 12%, transparent);
  border-color: color-mix(in srgb, var(--ui-status-info-fg, var(--color-info)) 20%, transparent);
  color: var(--ui-status-info-fg, var(--color-info));
}

.tone-success {
  background: color-mix(in srgb, var(--ui-status-success-fg, #10b981) 11%, transparent);
  border-color: color-mix(in srgb, var(--ui-status-success-fg, #10b981) 18%, transparent);
  color: var(--ui-status-success-fg, #10b981);
}

.tone-warning {
  background: color-mix(in srgb, var(--ui-status-warning-fg, #f59e0b) 13%, transparent);
  border-color: color-mix(in srgb, var(--ui-status-warning-fg, #f59e0b) 22%, transparent);
  color: color-mix(in srgb, var(--ui-status-warning-fg, #f59e0b) 84%, var(--ui-text-primary-fg, var(--text)) 16%);
}

.tone-danger {
  background: color-mix(in srgb, var(--ui-status-danger-fg, #ef4444) 10%, transparent);
  border-color: color-mix(in srgb, var(--ui-status-danger-fg, #ef4444) 18%, transparent);
  color: var(--ui-status-danger-fg, #ef4444);
}
</style>
