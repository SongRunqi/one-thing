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
  color: var(--settings-ink-2, var(--type-body-strong-color, var(--ui-text-primary-fg, var(--text-primary))));
  font-size: var(--type-body-strong-size);
  font-weight: var(--type-body-strong-weight);
  line-height: var(--type-body-strong-line-height);
}

.settings-field-value {
  margin-left: auto;
  color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
  font-size: var(--type-meta-size);
  font-weight: var(--type-body-strong-weight);
}

.settings-field-hint {
  margin: 7px 0 0;
  color: var(--settings-ink-4, var(--type-caption-muted-color, var(--ui-text-muted-fg, var(--text-muted))));
  font-size: var(--type-caption-muted-size);
  line-height: var(--type-caption-muted-line-height);
}
</style>
