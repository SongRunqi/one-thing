<template>
  <div class="settings-field">
    <label
      v-if="label || value || $slots.label"
      class="settings-field-label"
    >
      <span>
        <slot name="label">{{ label }}</slot>
      </span>
      <span
        v-if="value"
        class="settings-field-value"
      >
        {{ value }}
      </span>
    </label>
    <slot />
    <p
      v-if="hint"
      class="settings-field-hint"
    >
      {{ hint }}
    </p>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label?: string
  value?: string | number
  hint?: string
}>()
</script>

<style scoped>
.settings-field {
  min-width: 0;
}

.settings-field-label {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  color: var(--settings-ink-2, var(--text-primary));
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
}

.settings-field-value {
  margin-left: auto;
  color: var(--settings-accent, var(--accent));
  font-size: 12px;
  font-weight: 650;
}

.settings-field-hint {
  margin: 7px 0 0;
  color: var(--settings-ink-4, var(--text-muted));
  font-size: 12px;
  line-height: 1.45;
}
</style>
