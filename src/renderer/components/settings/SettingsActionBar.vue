<template>
  <footer class="settings-action-bar">
    <div
      v-if="$slots.status"
      class="settings-action-status"
    >
      <slot name="status" />
    </div>
    <div class="settings-action-controls">
      <slot />
    </div>
  </footer>
</template>

<style scoped>
.settings-action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-top: 1px solid var(--settings-rule-soft, var(--ui-border-default-border, var(--border)));
  background: color-mix(in srgb, var(--settings-paper-2, var(--ui-surface-app-bg, var(--bg))) 72%, transparent);
}

.settings-action-status {
  min-width: 0;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--text-muted)));
  font-size: 12px;
  line-height: 1.35;
}

.settings-action-controls {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-left: auto;
  flex-shrink: 0;
}
</style>
