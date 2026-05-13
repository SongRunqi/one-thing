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
  width: 100vw;
  height: 100vh;
  position: relative;
  overflow: hidden;
  background: var(--bg-app, var(--bg));
}

:deep(.todo-plan-panel) {
  position: absolute;
  inset: 0;
  width: 100vw;
  height: 100vh !important;
  min-height: 0;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  backdrop-filter: none;
}

:deep(.todo-plan-panel.collapsed) {
  inset: 12px auto auto 12px;
}
</style>
