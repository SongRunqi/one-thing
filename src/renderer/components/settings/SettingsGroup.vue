<template>
  <div class="settings-group">
    <slot />
  </div>
</template>

<style scoped>
.settings-group {
  border: 1px solid var(--settings-rule-soft, var(--ui-border-default-border, var(--border)));
  border-radius: 8px;
  background: var(--settings-paper-3, var(--ui-surface-panel-bg, var(--panel)));
  overflow: hidden;
}
</style>
