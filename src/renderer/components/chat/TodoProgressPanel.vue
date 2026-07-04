<template>
  <section
    class="todo-progress-panel"
    aria-label="AI todo progress"
  >
    <div class="todo-progress-head">
      <div class="todo-progress-title">
        <ListChecks
          :size="14"
          :stroke-width="2.2"
          aria-hidden="true"
        />
        <span>{{ documentTitle }}</span>
      </div>
      <span
        v-if="totalCount > 0"
        class="todo-progress-count"
      >
        {{ doneCount }}/{{ totalCount }}
      </span>
    </div>

    <div
      v-if="loading && !snapshot"
      class="todo-progress-state"
    >
      Loading
    </div>

    <div
      v-else-if="error"
      class="todo-progress-state is-error"
    >
      {{ error }}
    </div>

    <div
      v-else-if="!todoDocument || totalCount === 0"
      class="todo-progress-state todo-progress-empty"
    >
      No AI todo yet
    </div>

    <template v-else>
      <div class="todo-progress-meter">
        <span
          class="todo-progress-meter-fill"
          :style="{ width: `${progressPercent}%` }"
        />
      </div>

      <div
        v-if="currentTask"
        class="todo-progress-current"
      >
        <span class="todo-progress-current-label">Current</span>
        <span class="todo-progress-current-text">{{ currentTask.text }}</span>
      </div>

      <div
        v-else
        class="todo-progress-current is-complete"
      >
        <CheckCircle2
          :size="14"
          :stroke-width="2.2"
          aria-hidden="true"
        />
        <span>All tasks complete</span>
      </div>

      <div class="todo-progress-sections">
        <section
          v-for="section in sections"
          :key="section.title"
          class="todo-progress-section"
        >
          <div class="todo-progress-section-head">
            <span class="todo-progress-section-title">{{ section.title }}</span>
            <span class="todo-progress-section-count">
              {{ doneInSection(section) }}/{{ section.tasks.length }}
            </span>
          </div>
          <div class="todo-progress-tasks">
            <div
              v-for="task in section.tasks"
              :key="`${section.title}-${task.lineIndex}`"
              class="todo-progress-task"
              :class="{ done: task.done }"
            >
              <CheckCircle2
                v-if="task.done"
                :size="13"
                :stroke-width="2.2"
                aria-hidden="true"
              />
              <Circle
                v-else
                :size="13"
                :stroke-width="2"
                aria-hidden="true"
              />
              <span>{{ task.text }}</span>
            </div>
          </div>
        </section>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { CheckCircle2, Circle, ListChecks } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { TaskSection } from './todo-plan-utils'
import type { TodoPlanChangedPayload, TodoPlanDocument, TodoPlanSnapshot } from '@/types'
import { groupTasksBySection, parseTasks, titleFromMarkdown } from './todo-plan-utils'
import { platformApi } from '@/platform'

const props = withDefaults(defineProps<{
  sessionId?: string
  workingDirectory?: string
}>(), {
  sessionId: undefined,
  workingDirectory: undefined,
})

const snapshot = ref<TodoPlanSnapshot | null>(null)
const loading = ref(false)
const error = ref('')
let cleanupChanged: (() => void) | null = null

const effectiveWorkingDirectory = computed(() => props.workingDirectory || '')
const todoDocument = computed<TodoPlanDocument | null>(() => snapshot.value?.workspaceAiTodo ?? null)
const documentTitle = computed(() => {
  const document = todoDocument.value
  if (!document) return 'AI Todo'
  return titleFromMarkdown(document.content, document.title || 'AI Todo')
})
const tasks = computed(() => parseTasks(todoDocument.value?.content || ''))
const sections = computed(() => groupTasksBySection(tasks.value))
const totalCount = computed(() => tasks.value.length)
const doneCount = computed(() => tasks.value.filter(task => task.done).length)
const currentTask = computed(() => tasks.value.find(task => !task.done) || null)
const progressPercent = computed(() => {
  if (totalCount.value === 0) return 0
  return Math.round((doneCount.value / totalCount.value) * 100)
})

function doneInSection(section: TaskSection) {
  return section.tasks.filter(task => task.done).length
}

function applyDocument(document: TodoPlanDocument) {
  snapshot.value = {
    directory: snapshot.value?.directory || '',
    userNotes: snapshot.value?.userNotes || [],
    workspaceAiTodo: document,
  }
}

function shouldRefreshChanged(data: TodoPlanChangedPayload) {
  if (data.scope === 'global-user' || data.scope === 'all') return true
  if (data.scope === 'workspace-ai-todo') {
    return (data.workingDirectory || '') === effectiveWorkingDirectory.value
  }
  return false
}

async function loadSnapshot() {
  loading.value = true
  error.value = ''
  try {
    const response = await platformApi.getTodoPlan({
      sessionId: props.sessionId,
      workingDirectory: effectiveWorkingDirectory.value || undefined,
    })
    if (!response.success) {
      error.value = response.error || 'Unable to load todo'
      snapshot.value = null
      return
    }
    snapshot.value = response.snapshot || null
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to load todo'
    snapshot.value = null
  } finally {
    loading.value = false
  }
}

watch(
  [() => props.sessionId, effectiveWorkingDirectory],
  () => {
    loadSnapshot()
  },
)

onMounted(() => {
  loadSnapshot()
  cleanupChanged = platformApi.onTodoPlanChanged((data) => {
    if (!shouldRefreshChanged(data)) return
    if (data.scope === 'workspace-ai-todo' && data.document) {
      applyDocument(data.document)
      return
    }
    loadSnapshot()
  })
})

onUnmounted(() => {
  cleanupChanged?.()
})
</script>

<style scoped>
.todo-progress-panel {
  --todo-progress-rule: color-mix(in srgb, var(--ui-border-default-border, var(--border)) 54%, transparent);
  --todo-progress-muted: var(--ui-text-muted-fg, var(--text-muted, var(--muted)));
  --todo-progress-accent: var(--ui-accent-primary-fg, var(--accent));

  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  color: var(--ui-text-primary-fg, var(--text));
}

.todo-progress-head,
.todo-progress-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.todo-progress-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  color: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 88%, var(--todo-progress-muted));
  font-size: 12px;
  font-weight: 650;
}

.todo-progress-title span,
.todo-progress-section-title,
.todo-progress-current-text,
.todo-progress-task span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-progress-count,
.todo-progress-section-count {
  flex: 0 0 auto;
  color: var(--todo-progress-muted);
  font-size: 11px;
  font-weight: 650;
}

.todo-progress-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 92px;
  border: 1px dashed var(--todo-progress-rule);
  border-radius: 8px;
  color: var(--todo-progress-muted);
  font-size: 12px;
}

.todo-progress-state.is-error {
  color: color-mix(in srgb, var(--ui-danger-fg, #c2410c) 84%, var(--ui-text-primary-fg, var(--text)));
}

.todo-progress-meter {
  position: relative;
  flex: 0 0 auto;
  height: 5px;
  margin: 12px 0;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 12%, transparent);
}

.todo-progress-meter-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: color-mix(in srgb, var(--todo-progress-accent) 72%, var(--ui-status-success-fg, var(--todo-progress-accent)) 28%);
}

.todo-progress-current {
  display: grid;
  gap: 4px;
  padding: 9px 10px;
  border: 1px solid var(--todo-progress-rule);
  border-radius: 8px;
  background: color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated, var(--bg))) 58%, transparent);
}

.todo-progress-current.is-complete {
  display: flex;
  align-items: center;
  color: color-mix(in srgb, var(--todo-progress-accent) 74%, var(--ui-status-success-fg, var(--todo-progress-accent)) 26%);
  font-size: 12px;
  font-weight: 650;
}

.todo-progress-current-label {
  color: var(--todo-progress-muted);
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
}

.todo-progress-current-text {
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 12px;
  line-height: 1.35;
}

.todo-progress-sections {
  display: grid;
  flex: 1 1 auto;
  gap: 12px;
  min-height: 0;
  margin-top: 12px;
  overflow: auto;
  padding-right: 2px;
}

.todo-progress-section {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.todo-progress-section-title {
  color: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 82%, var(--todo-progress-muted));
  font-size: 11.5px;
  font-weight: 650;
}

.todo-progress-tasks {
  display: grid;
  gap: 5px;
}

.todo-progress-task {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  min-height: 18px;
  color: color-mix(in srgb, var(--ui-text-secondary-fg, var(--text-secondary, var(--text))) 90%, var(--todo-progress-muted));
  font-size: 11.5px;
  line-height: 1.3;
}

.todo-progress-task.done {
  color: var(--todo-progress-muted);
}

.todo-progress-task.done span {
  text-decoration: line-through;
  text-decoration-thickness: 1px;
  text-decoration-color: color-mix(in srgb, currentColor 48%, transparent);
}
</style>
