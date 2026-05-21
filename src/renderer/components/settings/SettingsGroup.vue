<template>
  <div class="settings-group">
    <slot />
  </div>
</template>

<style scoped>
.settings-group {
  border: 1px solid var(--settings-rule-soft, var(--border));
  border-radius: 8px;
  background: var(--settings-paper-3, var(--panel));
  overflow: hidden;
}
</style>
