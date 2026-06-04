<template>
  <div class="settings-empty-state">
    <div
      v-if="$slots.icon"
      class="settings-empty-icon"
    >
      <slot name="icon" />
    </div>
    <div class="settings-empty-copy">
      <div class="settings-empty-title">
        {{ title }}
      </div>
      <p
        v-if="description"
        class="settings-empty-description"
      >
        {{ description }}
      </p>
    </div>
    <div
      v-if="$slots.actions"
      class="settings-empty-actions"
    >
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<style scoped>
.settings-empty-state {
  display: grid;
  place-items: center;
  gap: 10px;
  min-height: 180px;
  padding: 24px;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--text-muted)));
  text-align: center;
}

.settings-empty-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--settings-rule-soft, var(--ui-border-default-border, var(--border)));
  border-radius: 8px;
  color: var(--settings-ink-3, var(--ui-text-muted-fg, var(--text-muted)));
  background: var(--settings-paper-2, var(--ui-surface-app-bg, var(--bg)));
}

.settings-empty-title {
  color: var(--settings-ink-2, var(--ui-text-primary-fg, var(--text-primary)));
  font-size: 13px;
  font-weight: 650;
}

.settings-empty-description {
  max-width: 360px;
  margin: 5px 0 0;
  font-size: 12px;
  line-height: 1.45;
}

.settings-empty-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
</style>
