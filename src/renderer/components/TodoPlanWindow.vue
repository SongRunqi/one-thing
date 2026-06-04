<template>
  <main class="todo-plan-window">
    <TodoPlanPanel standalone />
  </main>
</template>

<script setup lang="ts">
import TodoPlanPanel from './chat/TodoPlanPanel.vue'
</script>

<style scoped>
.todo-plan-window {
  --todo-window-radius: 22px;
  --todo-window-bg: color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated, var(--panel))) 92%, var(--ui-surface-note-bg) 8%);

  width: 100vw;
  height: 100vh;
  position: relative;
  overflow: hidden;
  border-radius: var(--todo-window-radius);
  background: var(--todo-window-bg);
  isolation: isolate;
}

:deep(.todo-plan-panel) {
  position: absolute;
  inset: 0;
  width: 100vw;
  height: 100vh !important;
  min-height: 0;
  border: 0;
  border-radius: var(--todo-window-radius);
  background: var(--todo-window-bg);
  box-shadow: none;
  backdrop-filter: none;
}

:deep(.todo-plan-panel.collapsed) {
  inset: 12px auto auto 12px;
}
</style>
