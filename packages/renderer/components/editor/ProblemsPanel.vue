<template>
  <section
    v-if="open"
    class="problems-panel"
  >
    <header>
      <span>Problems</span>
      <Button
        unstyled
        @click="$emit('close')"
      >
        <X :size="13" />
      </Button>
    </header>
    <div
      v-if="problems.length === 0"
      class="empty"
    >
      No problems
    </div>
    <Button
      v-for="(problem, index) in problems"
      :key="`${problem.filePath}-${index}`"
      unstyled
      class="problem-row"
      @click="$emit('openProblem', problem.filePath, problem.line || 1)"
    >
      <span :class="['severity', problem.severity]" />
      <span class="message">{{ problem.message }}</span>
      <span class="location">{{ problem.filePath }}{{ problem.line ? `:${problem.line}` : '' }}</span>
    </Button>
  </section>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
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
  border-top: 1px solid var(--ui-border-default-border);
  background: var(--ui-surface-panel-bg);
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
  border-bottom: 1px solid var(--ui-border-default-border);
  color: var(--ui-text-muted-fg);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

header button {
  border: none;
  background: transparent;
  color: var(--ui-text-muted-fg);
  cursor: pointer;
}

.empty {
  padding: 16px;
  color: var(--ui-text-muted-fg);
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
  color: var(--ui-text-primary-fg);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  padding: 0 10px;
}

.problem-row:hover {
  background: var(--ui-state-hover-bg);
}

.severity {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.severity.error {
  background: var(--ui-status-danger-fg);
}

.severity.warning {
  background: var(--ui-status-warning-fg);
}

.message,
.location {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.location {
  color: var(--ui-text-muted-fg);
}
</style>
