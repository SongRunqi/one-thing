<template>
  <section
    v-if="open"
    class="problems-panel"
  >
    <header>
      <span>Problems</span>
      <button @click="$emit('close')">
        <X :size="13" />
      </button>
    </header>
    <div
      v-if="problems.length === 0"
      class="empty"
    >
      No problems
    </div>
    <button
      v-for="(problem, index) in problems"
      :key="`${problem.filePath}-${index}`"
      class="problem-row"
      @click="$emit('openProblem', problem.filePath, problem.line || 1)"
    >
      <span :class="['severity', problem.severity]" />
      <span class="message">{{ problem.message }}</span>
      <span class="location">{{ problem.filePath }}{{ problem.line ? `:${problem.line}` : '' }}</span>
    </button>
  </section>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next'

defineProps<{
  open: boolean
  problems: Array<{ filePath: string; message: string; severity: 'error' | 'warning'; line?: number }>
}>()

defineEmits<{
  close: []
  openProblem: [path: string, line: number]
}>()
</script>

<style scoped>
.problems-panel {
  height: 150px;
  border-top: 1px solid var(--border);
  background: var(--bg-panel);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

header {
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

header button {
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.empty {
  padding: 16px;
  color: var(--muted);
  font-size: 12px;
}

.problem-row {
  height: 28px;
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) minmax(120px, 240px);
  gap: 8px;
  align-items: center;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  padding: 0 10px;
}

.problem-row:hover {
  background: var(--hover);
}

.severity {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.severity.error {
  background: #ef4444;
}

.severity.warning {
  background: #f59e0b;
}

.message,
.location {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.location {
  color: var(--muted);
}
</style>
