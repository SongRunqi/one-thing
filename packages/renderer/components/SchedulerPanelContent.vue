<template>
  <div class="tasks-panel">
    <header class="tasks-header">
      <h2>Tasks</h2>
      <div class="header-actions">
        <button
          class="text-action"
          type="button"
          title="Refresh"
          :disabled="loading"
          @click="() => loadAll()"
        >
          {{ loading ? 'loading…' : 'refresh' }}
        </button>
        <button
          class="text-action is-primary"
          type="button"
          title="Create a scheduled task"
          @click="startCreate"
        >
          + new task
        </button>
      </div>
    </header>

    <ErrorNote
      v-if="error"
      class="ledger-error"
      :message="error"
    />

    <div
      class="tasks-layout"
      :class="{ 'detail-active': taskDetailActive }"
    >
      <section class="task-list">
        <div class="task-ledger">
          <div class="task-list-title group-header">
            <span>All Tasks</span>
          </div>
          <div class="task-rows">
            <div
              v-for="task in tasks"
              :key="task.id"
              class="task-row"
              :class="{ 'is-active': selectedTaskId === task.id, 'is-off': !task.enabled }"
              role="button"
              tabindex="0"
              @click="selectTask(task.id)"
              @keydown.enter.prevent="selectTask(task.id)"
              @keydown.space.prevent="selectTask(task.id)"
            >
              <span class="task-line">
                <span
                  class="task-name"
                  :title="task.name || task.id"
                >{{ task.name || task.id }}</span>
                <span :class="['task-status', taskStatusClass(task)]">{{ taskStatusLabel(task) }}</span>
                <span
                  class="task-toggle"
                  @click.stop
                  @keydown.stop
                >
                  <button
                    class="enable-dot"
                    type="button"
                    role="switch"
                    :class="{ 'is-on': task.enabled }"
                    :aria-checked="task.enabled"
                    :disabled="actionId === task.id || task.inFlight"
                    :aria-label="`${task.name || task.id} ${task.enabled ? 'enabled' : 'disabled'}`"
                    :title="task.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'"
                    @click="toggleTaskEnabled(task, !task.enabled)"
                  />
                </span>
              </span>
              <span class="task-sub">
                <span
                  class="task-schedule"
                  :title="formatSchedule(task.schedule)"
                >{{ formatSchedule(task.schedule) }}</span>
                <span class="task-lastrun">{{ formatTaskLastRun(task) }}</span>
                <span
                  class="task-owner"
                  :title="taskOwnerLabel(task)"
                >{{ taskOwnerLabel(task) }}</span>
              </span>
              <span
                class="task-preview"
                :title="task.promptPreview || task.pluginId || task.id"
              >{{ task.promptPreview || task.pluginId || task.id }}</span>
            </div>
          </div>
          <p
            v-if="loading && tasks.length === 0"
            class="ledger-note"
          >
            loading scheduled tasks…
          </p>
          <p
            v-else-if="!loading && tasks.length === 0"
            class="ledger-note"
          >
            no scheduled tasks yet
          </p>
        </div>
      </section>

      <section
        v-if="selectedTask"
        class="task-detail"
      >
        <div class="detail-header-nav">
          <button
            class="text-action"
            type="button"
            title="Back to list"
            @click="taskDetailActive = false"
          >
            back
          </button>
          <span class="detail-nav-title">Task Details</span>
        </div>

        <section class="task-detail-head">
          <div class="task-overview">
            <span class="overview-kicker">{{ selectedTask.kind === 'agent' ? 'Agent task' : 'Plugin task' }}{{ selectedTask.readonly ? ' · Read only' : '' }}</span>
            <h3 :title="selectedTask.name || selectedTask.id">
              {{ selectedTask.name || selectedTask.id }}
            </h3>
            <p
              v-if="selectedTask.promptPreview || selectedTask.prompt"
              class="overview-prompt"
            >
              {{ selectedTask.promptPreview || selectedTask.prompt }}
            </p>
          </div>

          <div class="overview-actions">
            <button
              class="text-action"
              type="button"
              title="Run now"
              :disabled="actionId === selectedTask.id || selectedTask.inFlight"
              @click="runNow(selectedTask.id)"
            >
              run now
            </button>
            <button
              v-if="!selectedTask.readonly"
              class="text-action"
              type="button"
              title="Edit"
              @click="startEdit(selectedTask)"
            >
              edit
            </button>
            <button
              v-if="!selectedTask.readonly"
              class="text-action is-danger"
              type="button"
              title="Delete"
              @click="deleteTask(selectedTask.id)"
            >
              delete
            </button>
          </div>
        </section>

        <div class="detail-ledger">
          <section class="detail-summary-strip">
            <div class="meta-line">
              <span class="meta-label">Status</span>
              <strong :class="['meta-value', 'summary-status', taskStatusClass(selectedTask)]">{{ taskStatusLabel(selectedTask) }}</strong>
            </div>
            <div class="meta-line">
              <span class="meta-label">Next Run</span>
              <strong
                class="meta-value"
                :title="formatMaybeDate(selectedTask.nextRunAt)"
              >{{ formatShortDate(selectedTask.nextRunAt) }}</strong>
            </div>
            <div class="meta-line">
              <span class="meta-label">Runs</span>
              <strong class="meta-value">{{ taskRunCountLabel(selectedTask) }}</strong>
            </div>
          </section>

          <section class="runtime-section">
            <h4 class="group-header">
              <span>Runtime</span>
              <span
                class="group-value"
                :title="formatSchedule(selectedTask.schedule)"
              >{{ formatSchedule(selectedTask.schedule) }}</span>
            </h4>

            <dl class="runtime-grid">
              <div class="meta-line">
                <dt class="meta-label">
                  Next Run
                </dt>
                <dd
                  class="meta-value"
                  :title="formatMaybeDate(selectedTask.nextRunAt)"
                >
                  {{ formatShortDate(selectedTask.nextRunAt) }}
                </dd>
              </div>
              <div class="meta-line">
                <dt class="meta-label">
                  Last Run
                </dt>
                <dd
                  class="meta-value"
                  :title="formatMaybeDate(selectedTask.lastRunAt)"
                >
                  {{ formatShortDate(selectedTask.lastRunAt) }}
                </dd>
              </div>
              <div class="meta-line">
                <dt class="meta-label">
                  Runs
                </dt>
                <dd class="meta-value">
                  {{ taskRunCountLabel(selectedTask) }}
                </dd>
              </div>
              <div class="meta-line">
                <dt class="meta-label">
                  Owner
                </dt>
                <dd
                  class="meta-value"
                  :title="taskOwnerLabel(selectedTask)"
                >
                  {{ taskOwnerLabel(selectedTask) }}
                </dd>
              </div>
            </dl>
          </section>

          <section class="history-section">
            <button
              class="history-toggle group-header"
              type="button"
              @click="toggleHistory"
            >
              <span>Run history</span>
              <span class="toggle-state">{{ historyOpen ? 'hide' : 'show' }}</span>
            </button>

            <div
              v-if="historyOpen"
              class="history-drawer"
            >
              <div class="section-title">
                <span>Recent runs</span>
                <button
                  class="text-action"
                  type="button"
                  :disabled="runsLoading"
                  @click="loadRuns(selectedTask.id)"
                >
                  refresh
                </button>
              </div>

              <p
                v-if="runsLoading"
                class="ledger-note"
              >
                loading run history…
              </p>
              <p
                v-else-if="runs.length === 0"
                class="ledger-note"
              >
                no run history yet
              </p>
              <div
                v-else
                class="runs-ledger"
              >
                <button
                  v-for="run in runs"
                  :key="run.runId || `${run.taskId}-${run.startedAt}`"
                  class="run-row"
                  :class="{ 'is-active': selectedRun?.runId === run.runId }"
                  type="button"
                  @click="selectedRun = selectedRun?.runId === run.runId ? null : run"
                >
                  <span :class="['run-status', run.status]">{{ run.status }}</span>
                  <span
                    class="run-date"
                    :title="formatMaybeDate(run.startedAt)"
                  >{{ formatShortDate(run.startedAt) }}</span>
                  <span class="run-duration">{{ formatDuration(run.durationMs) }}</span>
                </button>
              </div>
            </div>
          </section>

          <article
            v-if="historyOpen && selectedRun"
            class="run-detail"
          >
            <div class="section-title">
              <span>Run detail</span>
              <button
                v-if="selectedRun.sessionId"
                class="text-action"
                type="button"
                @click="openRunSession(selectedRun.sessionId)"
              >
                open session
              </button>
            </div>
            <ErrorNote
              v-if="selectedRun.error"
              class="ledger-error"
              :message="selectedRun.error"
            />
            <p
              v-if="selectedRun.resultPreview"
              class="result-preview"
            >
              {{ selectedRun.resultPreview }}
            </p>

            <div
              v-if="selectedRun.toolCalls?.length"
              class="subsection"
            >
              <span class="subsection-title">Tools</span>
              <div
                v-for="tool in selectedRun.toolCalls"
                :key="tool.id"
                class="trace-row"
              >
                <span class="trace-title">{{ tool.toolName }}</span>
                <small>{{ tool.status }} · {{ formatDuration(tool.durationMs) }}</small>
                <code>{{ tool.argumentsPreview }}</code>
              </div>
            </div>

            <div class="subsection">
              <span class="subsection-title">Timeline</span>
              <div
                v-for="item in selectedRun.timeline || []"
                :key="item.id"
                class="trace-row"
              >
                <span class="trace-title">{{ item.title }}</span>
                <small :title="formatMaybeDate(item.timestamp)">{{ formatShortDate(item.timestamp) }}{{ item.status ? ` · ${item.status}` : '' }}</small>
                <code v-if="item.detail">{{ item.detail }}</code>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>

    <Dialog
      :open="editing"
      variant="paper"
      :width="480"
      :title="editingId ? 'Edit task' : 'Create task'"
      :auto-focus="false"
      :style="taskEditorVars"
      @update:open="value => { if (!value) cancelEdit() }"
    >
      <template #header-extra>
        <button
          class="text-action"
          type="button"
          title="Close"
          :disabled="saving"
          @click="cancelEdit"
        >
          close
        </button>
      </template>

      <div
        ref="editorDialogRef"
        class="task-editor-body"
      >
        <label>
          <span>Name</span>
          <input
            v-model="form.name"
            class="field"
            type="text"
            aria-label="Task name"
            placeholder="Morning news brief"
          >
        </label>

        <div class="editor-field">
          <span>Agent</span>
          <!-- 定时任务的执行者是一个激活目标(agent-domain-model.md §3.2):
               已退休的 agent 不能被选中,否则到点了那条任务只会空转。
               kind 不在这里筛 —— service agent 有自己的后台日程。 -->
          <Select
            v-bind="SHEET_SELECT"
            :model-value="form.agentId"
            :options="agentOptions"
            aria-label="Task agent"
            @update:model-value="form.agentId = String($event ?? '')"
          />
        </div>

        <label>
          <span>Task</span>
          <textarea
            v-model="form.prompt"
            class="field textarea"
            aria-label="Task prompt"
            placeholder="Check the morning AI news and summarize the top 5 items with links."
          />
        </label>

        <div class="schedule-grid">
          <div class="editor-field">
            <span>Schedule</span>
            <Select
              v-bind="SHEET_SELECT"
              :model-value="form.scheduleMode"
              :options="SCHEDULE_MODE_OPTIONS"
              aria-label="Task schedule"
              @update:model-value="form.scheduleMode = String($event ?? '') as ScheduleMode"
            />
          </div>

          <label v-if="form.scheduleMode === 'daily' || form.scheduleMode === 'weekly'">
            <span>Time</span>
            <input
              v-model="form.time"
              class="field"
              type="time"
              aria-label="Task time"
            >
          </label>

          <div
            v-if="form.scheduleMode === 'weekly'"
            class="editor-field"
          >
            <span>Day</span>
            <Select
              v-bind="SHEET_SELECT"
              :model-value="form.dayOfWeek"
              :options="DAY_OF_WEEK_OPTIONS"
              aria-label="Task day"
              @update:model-value="form.dayOfWeek = String($event ?? '')"
            />
          </div>

          <label v-if="form.scheduleMode === 'interval'">
            <span>Every minutes</span>
            <input
              v-model.number="form.intervalMinutes"
              class="field"
              type="number"
              aria-label="Task interval minutes"
              min="1"
              step="1"
            >
          </label>

          <label v-if="form.scheduleMode === 'cron'">
            <span>Cron</span>
            <input
              v-model="form.cron"
              class="field is-mono"
              type="text"
              aria-label="Task cron"
              placeholder="0 9 * * *"
            >
          </label>

          <label v-if="form.scheduleMode !== 'interval'">
            <span>Timezone</span>
            <input
              v-model="form.timezone"
              class="field"
              type="text"
              aria-label="Task timezone"
              placeholder="System"
            >
          </label>
        </div>

        <label>
          <span>Working directory</span>
          <input
            v-model="form.workingDirectory"
            class="field is-mono"
            type="text"
            aria-label="Task working directory"
            placeholder="Optional"
          >
        </label>

        <div class="checkbox-row">
          <Switch
            variant="ledger"
            :model-value="form.enabled"
            aria-label="Enabled"
            @update:model-value="form.enabled = Boolean($event)"
          />
          <span>Enabled</span>
        </div>
      </div>

      <template #actions>
        <button
          class="text-action"
          type="button"
          :disabled="saving"
          @click="cancelEdit"
        >
          cancel
        </button>
        <button
          class="text-action is-primary"
          type="button"
          :disabled="saving"
          @click="saveTask"
        >
          {{ saving ? 'saving…' : editingId ? 'save changes' : 'create task' }}
        </button>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, watch, type CSSProperties } from 'vue'
import { useAgentsStore } from '@/stores/agents'
import Dialog from '@/components/common/Dialog.vue'
import ErrorNote from '@/components/common/ErrorNote.vue'
import Select from '@/components/common/Select.vue'
import type { SelectOptionLike } from '@/components/common/select'
import Switch from '@/components/common/Switch.vue'
import { useConfirm } from '@/composables/useConfirm'

/** The editor fills the viewport height it is given, like the old dialog did. */
const taskEditorVars: CSSProperties = {
  '--app-dialog-max-height': 'calc(100% - 40px)',
  '--app-dialog-body-display': 'flex',
  // The scroll (and its custom scrollbar skin) stays on `.task-editor-body`,
  // so Dialog's body is a plain flex shell with no padding of its own.
  '--app-dialog-body-padding': '0',
  '--app-dialog-body-overflow': 'hidden',
} as CSSProperties
import type {
  SchedulerRunDetailDTO,
  SchedulerSchedule,
  SchedulerTaskSnapshotDTO,
} from '@/types'
import { platformApi } from '@/platform'

const agentsStore = useAgentsStore()
const { confirm } = useConfirm()
const TASK_LOAD_TIMEOUT_MS = 10000

const props = withDefaults(defineProps<{
  active?: boolean
}>(), {
  active: true,
})

function getSchedulerApi() {
  return platformApi
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId)
  })
}

// shallowRef: the run/task DTOs carry recursive JsonValue payloads, and
// UnwrapRef over that recursion blows vue-tsc's instantiation depth (TS2589).
// All assignments below replace the whole value, so shallow reactivity is
// equivalent here.
const tasks = shallowRef<SchedulerTaskSnapshotDTO[]>([])
const runs = shallowRef<SchedulerRunDetailDTO[]>([])
const selectedTaskId = ref('')
const selectedRun = shallowRef<SchedulerRunDetailDTO | null>(null)
const historyOpen = ref(false)
const loading = ref(false)
const runsLoading = ref(false)
const saving = ref(false)
const actionId = ref('')
const error = ref('')
const editing = ref(false)
const editingId = ref('')
const editorDialogRef = ref<HTMLElement | null>(null)
const initialized = ref(false)

const defaultTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''

const taskDetailActive = ref(false)

type ScheduleMode = 'daily' | 'weekly' | 'interval' | 'cron'

/**
 * One spelling of "a dropdown in the task editor".
 *
 * `z-layer="modal"` is load-bearing: the editor is a Dialog at `--z-modal`, so
 * a panel left on the default dropdown stop opens *behind* the sheet it belongs
 * to. `teleported` then keeps it out of `.task-editor-body`'s scroll box.
 */
const SHEET_SELECT = {
  variant: 'underline',
  size: 'small',
  teleported: true,
  fitInputWidth: true,
  zLayer: 'modal',
} as const

const SCHEDULE_MODE_OPTIONS: SelectOptionLike[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'interval', label: 'Interval' },
  { value: 'cron', label: 'Cron' },
]

const DAY_OF_WEEK_OPTIONS: SelectOptionLike[] = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '0', label: 'Sunday' },
]

const agentOptions = computed<SelectOptionLike[]>(() =>
  agentsStore.activeAgents.map(agent => ({ value: agent.id, label: agent.name })),
)

const form = ref({
  name: '',
  prompt: '',
  agentId: 'default',
  enabled: true,
  scheduleMode: 'daily' as ScheduleMode,
  time: '09:00',
  dayOfWeek: '1',
  intervalMinutes: 60,
  cron: '0 9 * * *',
  timezone: defaultTimezone,
  workingDirectory: '',
})

const selectedTask = computed(() =>
  tasks.value.find(task => task.id === selectedTaskId.value) || null
)

function resetForm(): void {
  form.value = {
    name: '',
    prompt: '',
    agentId: agentsStore.defaultAgent?.id || 'default',
    enabled: true,
    scheduleMode: 'daily',
    time: '09:00',
    dayOfWeek: '1',
    intervalMinutes: 60,
    cron: '0 9 * * *',
    timezone: defaultTimezone,
    workingDirectory: '',
  }
}

function startCreate(): void {
  resetForm()
  editingId.value = ''
  editing.value = true
  historyOpen.value = false
  selectedRun.value = null
  taskDetailActive.value = true
}

function startEdit(task: SchedulerTaskSnapshotDTO): void {
  editingId.value = task.id
  form.value.name = task.name || ''
  form.value.prompt = task.prompt || task.promptPreview || ''
  form.value.agentId = task.agentId || 'default'
  form.value.enabled = task.enabled
  form.value.workingDirectory = task.workingDirectory || ''
  applyScheduleToForm(task.schedule)
  editing.value = true
}

function cancelEdit(): void {
  if (saving.value) return
  editing.value = false
  editingId.value = ''
}

function applyScheduleToForm(schedule?: SchedulerSchedule): void {
  if (!schedule) return
  if (schedule.kind === 'interval') {
    form.value.scheduleMode = 'interval'
    form.value.intervalMinutes = Math.max(1, Math.round(schedule.everyMs / 60000))
    return
  }
  if (schedule.kind === 'cron') {
    const fields = schedule.expr.split(/\s+/)
    form.value.timezone = schedule.timezone || defaultTimezone
    if (fields.length === 5 && fields[2] === '*' && fields[3] === '*') {
      form.value.time = `${fields[1].padStart(2, '0')}:${fields[0].padStart(2, '0')}`
      if (fields[4] === '*') {
        form.value.scheduleMode = 'daily'
        return
      }
      form.value.scheduleMode = 'weekly'
      form.value.dayOfWeek = fields[4]
      return
    }
    form.value.scheduleMode = 'cron'
    form.value.cron = schedule.expr
  }
}

function buildSchedule(): SchedulerSchedule {
  if (form.value.scheduleMode === 'interval') {
    return { kind: 'interval', everyMs: Math.max(1, form.value.intervalMinutes) * 60000 }
  }
  if (form.value.scheduleMode === 'cron') {
    return {
      kind: 'cron',
      expr: form.value.cron.trim(),
      ...(form.value.timezone.trim() ? { timezone: form.value.timezone.trim() } : {}),
    }
  }
  const [hour = '9', minute = '0'] = form.value.time.split(':')
  const day = form.value.scheduleMode === 'weekly' ? form.value.dayOfWeek : '*'
  return {
    kind: 'cron',
    expr: `${Number(minute)} ${Number(hour)} * * ${day}`,
    ...(form.value.timezone.trim() ? { timezone: form.value.timezone.trim() } : {}),
  }
}

async function saveTask(): Promise<void> {
  saving.value = true
  error.value = ''
  try {
    const payload = {
      name: form.value.name,
      prompt: form.value.prompt,
      agentId: form.value.agentId,
      enabled: form.value.enabled,
      schedule: buildSchedule(),
      workingDirectory: form.value.workingDirectory.trim() || undefined,
    }
    const schedulerApi = getSchedulerApi()
    const response = editingId.value
      ? await schedulerApi.updateSchedulerTask({ id: editingId.value, ...payload })
      : await schedulerApi.createSchedulerTask(payload)
    if (!response.success || !response.task) throw new Error(response.error || 'Failed to save scheduled task')
    editing.value = false
    editingId.value = ''
    await loadAll(response.task.id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}

async function loadAll(nextSelectedId = selectedTaskId.value): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const response = await withTimeout(
      getSchedulerApi().listSchedulerTasks(),
      TASK_LOAD_TIMEOUT_MS,
      'Loading scheduled tasks timed out. Please refresh again.',
    )
    if (!response.success || !response.tasks) throw new Error(response.error || 'Failed to load scheduled tasks')
    tasks.value = response.tasks.sort((a, b) => Number(a.readonly) - Number(b.readonly) || (a.name || a.id).localeCompare(b.name || b.id))
    selectedTaskId.value = tasks.value.find(task => task.id === nextSelectedId)?.id || tasks.value[0]?.id || ''
    if (selectedTaskId.value && historyOpen.value) {
      await loadRuns(selectedTaskId.value)
    } else {
      runs.value = []
      selectedRun.value = null
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

async function loadRuns(taskId: string): Promise<void> {
  runsLoading.value = true
  selectedRun.value = null
  runs.value = []
  try {
    const response = await getSchedulerApi().listSchedulerRuns({ taskId, limit: 50 })
    if (!response.success || !response.runs) throw new Error(response.error || 'Failed to load run history')
    runs.value = response.runs
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    runsLoading.value = false
  }
}

async function selectTask(taskId: string): Promise<void> {
  selectedTaskId.value = taskId
  historyOpen.value = false
  selectedRun.value = null
  runs.value = []
  taskDetailActive.value = true
}

async function toggleHistory(): Promise<void> {
  historyOpen.value = !historyOpen.value
  selectedRun.value = null
  if (historyOpen.value && selectedTaskId.value && runs.value.length === 0) {
    await loadRuns(selectedTaskId.value)
  }
}

async function runNow(taskId: string): Promise<void> {
  actionId.value = taskId
  error.value = ''
  try {
    const response = await getSchedulerApi().runSchedulerTaskNow({ id: taskId, force: true })
    if (!response.success) throw new Error(response.error || 'Failed to run task')
    await loadAll(taskId)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    actionId.value = ''
  }
}

async function setEnabled(taskId: string, enabled: boolean): Promise<void> {
  actionId.value = taskId
  error.value = ''
  try {
    const response = await getSchedulerApi().setSchedulerTaskEnabled({ id: taskId, enabled })
    if (!response.success) throw new Error(response.error || 'Failed to update task')
    await loadAll(taskId)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    actionId.value = ''
  }
}

async function toggleTaskEnabled(task: SchedulerTaskSnapshotDTO, value: unknown): Promise<void> {
  await setEnabled(task.id, value === true)
}

async function deleteTask(taskId: string): Promise<void> {
  const accepted = await confirm({
    title: 'Delete task',
    message: 'Delete this scheduled task? Existing run history will stay on disk.',
    danger: true,
    confirmText: 'delete',
    variant: 'paper',
  })
  if (!accepted) return
  error.value = ''
  try {
    const response = await getSchedulerApi().deleteSchedulerTask({ id: taskId })
    if (!response.success) throw new Error(response.error || 'Failed to delete task')
    await loadAll('')
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function openRunSession(sessionId: string): Promise<void> {
  const schedulerApi = getSchedulerApi()
  await schedulerApi.updateSessionArchived(sessionId, false, null)
  await schedulerApi.switchSession(sessionId)
}

function formatSchedule(schedule?: SchedulerSchedule): string {
  if (!schedule) return 'No schedule'
  if (schedule.kind === 'interval') return `Every ${Math.round(schedule.everyMs / 60000)} min`
  if (schedule.kind === 'at') return `At ${formatMaybeDate(schedule.atMs)}`
  const fields = schedule.expr.split(/\s+/)
  if (fields.length === 5 && fields[2] === '*' && fields[3] === '*') {
    const time = `${fields[1].padStart(2, '0')}:${fields[0].padStart(2, '0')}`
    if (fields[4] === '*') return `Daily ${time}`
    return `Weekly ${time}`
  }
  return schedule.expr
}

function formatMaybeDate(value?: number): string {
  if (!value) return 'Never'
  return new Date(value).toLocaleString()
}

function formatShortDate(value?: number): string {
  if (!value) return 'Never'
  return new Date(value).toLocaleString([], {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDuration(value?: number): string {
  if (!value) return '0s'
  if (value < 1000) return `${value}ms`
  if (value < 60000) return `${(value / 1000).toFixed(1)}s`
  return `${Math.round(value / 60000)}m`
}

function formatTaskLastRun(task: SchedulerTaskSnapshotDTO): string {
  if (!task.lastRunAt) return 'Not run yet'
  const latest = task.recentRuns?.[0]
  const status = latest
    ? latest.ok ? 'Succeeded' : latest.skipped ? 'Skipped' : 'Failed'
    : task.lastErrorAt === task.lastRunAt ? 'Failed' : 'Ran'
  return `${status} ${formatShortDate(task.lastRunAt)}`
}

function taskRunCountLabel(task: SchedulerTaskSnapshotDTO): string {
  const total = task.successCount + task.failureCount
  if (!total) return 'No runs yet'
  if (!task.failureCount) return `${total} total`
  return `${total} total · ${task.failureCount} failed`
}

function taskLastRunFailed(task: SchedulerTaskSnapshotDTO): boolean {
  return (
    (typeof task.lastRunAt === 'number' && task.lastErrorAt === task.lastRunAt) ||
    task.recentRuns?.[0]?.ok === false
  )
}

function taskStatusLabel(task: SchedulerTaskSnapshotDTO): string {
  if (task.inFlight) return 'Running'
  if (!task.enabled) return 'Disabled'
  if (taskLastRunFailed(task)) return 'Failed'
  if (task.successCount + task.failureCount > 0) return 'Healthy'
  return 'Scheduled'
}

function taskStatusClass(task: SchedulerTaskSnapshotDTO): string {
  if (task.inFlight) return 'running'
  if (!task.enabled) return 'disabled'
  if (taskLastRunFailed(task)) return 'failed'
  if (task.successCount + task.failureCount > 0) return 'healthy'
  return 'scheduled'
}

function taskOwnerLabel(task: SchedulerTaskSnapshotDTO): string {
  if (task.kind === 'plugin') return task.pluginId || 'Plugin'
  // 域模型 M4:署名走 displayAgent —— 一条老任务指着已退休/已删的 agent 时显示
  // 墓碑「已注销」,而不是把一串 id 印在账页上。
  if (!task.agentId) return 'Agent'
  return agentsStore.displayAgent(task.agentId).name
}

watch(editing, async (isEditing) => {
  if (!isEditing) return
  await nextTick()
  const firstField = editorDialogRef.value?.querySelector<HTMLElement>('input, textarea, select, button')
  firstField?.focus()
})

onMounted(async () => {
  await agentsStore.loadAgents().catch(() => undefined)
  resetForm()
  initialized.value = true
  if (props.active) await loadAll()
})

watch(
  () => props.active,
  async (active, wasActive) => {
    if (!active || !initialized.value || active === wasActive) return
    await loadAll()
  },
  { flush: 'post' },
)
</script>

<style scoped>
/*
 * Tasks ledger — 画线风.
 * No background fills, no radii: state lives in the line.
 * One vertical ink rule carries the task register and the detail sheet.
 */
.tasks-panel {
  height: 100%;
  width: 100%;
  min-width: 0;
  max-width: none;
  box-sizing: border-box;
  container-type: inline-size;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0;
  padding: 16px 16px 20px;
  overflow-x: hidden;
  overflow-y: auto;
  background: var(--ui-surface-chat-bg, var(--ui-surface-app-bg, var(--bg)));
  color: var(--ui-text-primary-fg, var(--text-primary));
  scrollbar-width: thin;
  animation: ledger-fade 0.15s ease;
}

@keyframes ledger-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.tasks-panel,
.tasks-panel * {
  box-sizing: border-box;
}

/* Thin scrollbars, unchanged scroll containers */
.tasks-panel::-webkit-scrollbar,
.task-list::-webkit-scrollbar,
.task-detail::-webkit-scrollbar,
.runs-ledger::-webkit-scrollbar,
.task-editor-body::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.tasks-panel::-webkit-scrollbar-track,
.task-list::-webkit-scrollbar-track,
.task-detail::-webkit-scrollbar-track,
.runs-ledger::-webkit-scrollbar-track,
.task-editor-body::-webkit-scrollbar-track {
  background: transparent;
}

.tasks-panel::-webkit-scrollbar-thumb,
.task-list::-webkit-scrollbar-thumb,
.task-detail::-webkit-scrollbar-thumb,
.runs-ledger::-webkit-scrollbar-thumb,
.task-editor-body::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted)) 18%, transparent);
}

.tasks-panel::-webkit-scrollbar-thumb:hover,
.task-list::-webkit-scrollbar-thumb:hover,
.task-detail::-webkit-scrollbar-thumb:hover,
.runs-ledger::-webkit-scrollbar-thumb:hover,
.task-editor-body::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted)) 32%, transparent);
}

/* ---- header ---- */
.tasks-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  flex-shrink: 0;
  min-width: 0;
  padding: 0 0 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 45%, transparent);
}

.tasks-header h2 {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-display, var(--font-serif, serif));
  font-size: 16px;
  font-weight: var(--font-weight-semibold, 600);
  line-height: 1.2;
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.header-actions {
  display: flex;
  align-items: baseline;
  gap: 16px;
  flex-shrink: 0;
}

/* ---- shared ledger controls ---- */
.text-action {
  appearance: none;
  background: transparent;
  border: none;
  padding: 0;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.12s ease;
}

.text-action:hover:not(:disabled) {
  color: var(--ui-text-primary-fg, var(--text-primary));
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--ui-accent-primary-fg, var(--accent));
}

.text-action.is-primary {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.text-action.is-danger:hover:not(:disabled) {
  color: var(--ui-status-danger-fg, var(--text-error, #b3403a));
  text-decoration-color: var(--ui-status-danger-fg, var(--text-error, #b3403a));
}

.text-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* Ink-dot toggle: solid accent ring with a center dot when on, dashed empty ring when off */
.enable-dot {
  appearance: none;
  flex-shrink: 0;
  width: 13px;
  height: 13px;
  padding: 0;
  border-radius: 50%;
  border: 1px dashed var(--ui-border-default-border, var(--border));
  background: transparent;
  cursor: pointer;
  position: relative;
  transition: border-color 0.12s ease;
}

/* Enlarged hit area for the 13px dot */
.enable-dot::before {
  content: '';
  position: absolute;
  inset: -6px;
}

.enable-dot.is-on {
  border-style: solid;
  border-color: var(--ui-accent-primary-fg, var(--accent));
}

.enable-dot.is-on::after {
  content: '';
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: var(--ui-accent-primary-fg, var(--accent));
}

.enable-dot:hover:not(:disabled) {
  border-color: var(--ui-accent-primary-fg, var(--accent));
}

.enable-dot:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.text-action:focus-visible,
.enable-dot:focus-visible,
.history-toggle:focus-visible,
.task-row:focus-visible,
.run-row:focus-visible {
  outline: 1px solid var(--ui-accent-primary-fg, var(--accent));
  outline-offset: 2px;
}

/* ---- errors and notes ---- */
/* positioning only — visuals come from ErrorNote */
.ledger-error {
  margin: 0;
  flex-shrink: 0;
}

.ledger-note {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

/* ---- split layout ---- */
.tasks-layout {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(210px, 0.38fr) minmax(0, 1fr);
  align-items: stretch;
  gap: clamp(16px, 3cqw, 32px);
  position: relative;
  overflow: hidden;
}

.task-list {
  min-width: 0;
  height: 100%;
  overflow-y: auto;
  padding: 4px 6px 16px 0;
  scrollbar-width: thin;
}

.task-detail {
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 4px 4px 24px 0;
  scrollbar-width: thin;
}

/* ---- the ledger rule ---- */
.task-ledger,
.detail-ledger {
  position: relative;
  padding-left: 16px;
}

.task-ledger::before,
.detail-ledger::before {
  content: '';
  position: absolute;
  left: 3px;
  top: 6px;
  bottom: 6px;
  width: 1px;
  background: color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 72%, transparent);
}

.detail-ledger {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

/* ---- group headers: a longer, heavier tick marks the heading ---- */
.group-header {
  position: relative;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: var(--font-weight-semibold, 600);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.group-header::before {
  content: '';
  position: absolute;
  left: -16px;
  top: 50%;
  width: 10px;
  height: 2px;
  background: var(--ui-border-strong-border, var(--border-strong, var(--border)));
}

.group-header h4,
.group-header h5 {
  margin: 0;
  font-family: inherit;
  font-size: inherit;
  font-weight: inherit;
  letter-spacing: inherit;
  color: inherit;
}

.group-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  font-weight: var(--font-weight-normal, 400);
  letter-spacing: normal;
  text-transform: none;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.task-list-title {
  margin-bottom: 4px;
}

/* ---- task rows (register numbering) ---- */
.task-rows {
  counter-reset: task-row;
  display: flex;
  flex-direction: column;
}

.task-row {
  position: relative;
  counter-increment: task-row;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 30px;
  padding: 6px 0;
  border-top: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--border-subtle, var(--border))) 32%, transparent);
  cursor: pointer;
}

.task-row:first-child {
  border-top: none;
}

/* Tick hanging the row on the rule */
.task-row::before {
  content: '';
  position: absolute;
  left: -13px;
  top: 15px;
  width: 7px;
  height: 1px;
  background: var(--ui-border-strong-border, var(--border-strong, var(--border)));
  transition: width 0.12s ease, height 0.12s ease, background-color 0.12s ease;
}

.task-row:hover::before,
.task-row:focus-visible::before {
  width: 12px;
  background: var(--ui-text-muted-fg, var(--text-muted));
}

.task-row.is-active::before {
  width: 14px;
  height: 2px;
  background: var(--ui-accent-primary-fg, var(--accent));
}

.task-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

/* Register number */
.task-line::before {
  content: counter(task-row, decimal-leading-zero);
  flex-shrink: 0;
  min-width: 16px;
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  color: var(--ui-text-faint-fg, var(--muted));
}

.task-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.task-row.is-active .task-name {
  font-weight: var(--font-weight-medium, 500);
}

.task-status {
  flex-shrink: 0;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.task-status.healthy,
.summary-status.healthy {
  color: var(--ui-status-success-fg, var(--color-success));
}

.task-status.failed,
.summary-status.failed {
  color: var(--ui-status-danger-fg, var(--text-error, #b3403a));
}

.task-status.running,
.summary-status.running {
  color: var(--ui-status-warning-fg, var(--color-warning));
}

.task-status.scheduled,
.summary-status.scheduled {
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.task-status.disabled,
.summary-status.disabled {
  color: var(--ui-text-faint-fg, var(--muted));
}

/* Toggle hidden until hover; stays visible when off or selected */
.task-toggle {
  flex-shrink: 0;
  align-self: center;
  display: inline-flex;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.task-row:hover .task-toggle,
.task-row:focus-within .task-toggle,
.task-row.is-off .task-toggle,
.task-row.is-active .task-toggle {
  opacity: 1;
}

.task-sub {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
  padding-left: 24px;
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 10.5px;
  color: var(--ui-text-faint-fg, var(--muted));
}

.task-schedule,
.task-lastrun,
.task-owner {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-schedule {
  flex-shrink: 0;
  max-width: 55%;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.task-preview {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-left: 24px;
  font-size: 11.5px;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.task-row:hover .task-preview {
  color: var(--ui-text-primary-fg, var(--text-primary));
}

/* Disabled task: faint strike-through */
.task-row.is-off .task-name,
.task-row.is-off .task-preview {
  color: var(--ui-text-faint-fg, var(--muted));
  text-decoration: line-through;
  text-decoration-color: color-mix(in srgb, var(--ui-text-faint-fg, var(--muted)) 60%, transparent);
}

/* ---- detail: back nav (stacked mode only) ---- */
.detail-header-nav {
  display: none;
}

.detail-nav-title {
  font-size: 12px;
  font-weight: var(--font-weight-semibold, 600);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ui-text-primary-fg, var(--text-primary));
}

/* ---- detail head ---- */
.task-detail-head {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 20px;
}

.task-overview {
  flex: 1 1 240px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.overview-kicker {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ui-text-faint-fg, var(--muted));
}

.task-overview h3 {
  margin: 0;
  min-width: 0;
  font-family: var(--font-display, var(--font-serif, serif));
  font-size: 17px;
  font-weight: var(--font-weight-semibold, 600);
  line-height: 1.25;
  color: var(--ui-text-primary-fg, var(--text-primary));
  overflow-wrap: anywhere;
}

.overview-prompt {
  margin: 0;
  max-width: 720px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--ui-text-muted-fg, var(--text-muted));
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.overview-actions {
  flex-shrink: 0;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 14px;
  padding-top: 2px;
}

/* ---- metadata lines (summary + runtime) ---- */
.detail-summary-strip,
.runtime-grid {
  margin: 0;
  display: flex;
  flex-direction: column;
}

.meta-line {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
  min-height: 26px;
  padding: 4px 0;
  border-top: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--border-subtle, var(--border))) 32%, transparent);
}

.meta-line:first-child {
  border-top: none;
}

.meta-line::before {
  content: '';
  position: absolute;
  left: -13px;
  top: 50%;
  width: 7px;
  height: 1px;
  background: var(--ui-border-strong-border, var(--border-strong, var(--border)));
  transition: width 0.12s ease, background-color 0.12s ease;
}

.meta-line:hover::before {
  width: 12px;
  background: var(--ui-text-muted-fg, var(--text-muted));
}

.meta-label {
  flex-shrink: 0;
  min-width: 72px;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ui-text-faint-fg, var(--muted));
}

.meta-value {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  font-weight: var(--font-weight-normal, 400);
  color: var(--ui-text-primary-fg, var(--text-primary));
}

/* ---- history ---- */
.history-toggle {
  appearance: none;
  display: flex;
  width: 100%;
  background: transparent;
  border: none;
  padding: 0;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.toggle-state {
  flex-shrink: 0;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: var(--font-weight-normal, 400);
  letter-spacing: normal;
  text-transform: none;
  color: var(--ui-text-muted-fg, var(--text-muted));
  transition: color 0.12s ease;
}

.history-toggle:hover .toggle-state {
  color: var(--ui-text-primary-fg, var(--text-primary));
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--ui-accent-primary-fg, var(--accent));
}

.history-drawer {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.section-title > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: var(--font-weight-medium, 500);
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.runs-ledger {
  display: flex;
  flex-direction: column;
  max-height: 320px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.run-row {
  appearance: none;
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 12px;
  width: 100%;
  min-width: 0;
  min-height: 28px;
  padding: 5px 0;
  background: transparent;
  border: none;
  border-top: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--border-subtle, var(--border))) 32%, transparent);
  text-align: left;
  cursor: pointer;
}

.run-row:first-child {
  border-top: none;
}

.run-row::before {
  content: '';
  position: absolute;
  left: -13px;
  top: 50%;
  width: 7px;
  height: 1px;
  background: var(--ui-border-strong-border, var(--border-strong, var(--border)));
  transition: width 0.12s ease, height 0.12s ease, background-color 0.12s ease;
}

.run-row:hover::before {
  width: 12px;
  background: var(--ui-text-muted-fg, var(--text-muted));
}

.run-row.is-active::before {
  width: 14px;
  height: 2px;
  background: var(--ui-accent-primary-fg, var(--accent));
}

.run-status {
  flex-shrink: 0;
  min-width: 68px;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.run-status.succeeded {
  color: var(--ui-status-success-fg, var(--color-success));
}

.run-status.failed,
.run-status.blocked {
  color: var(--ui-status-danger-fg, var(--text-error, #b3403a));
}

.run-status.running {
  color: var(--ui-status-warning-fg, var(--color-warning));
}

.run-date {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.run-row.is-active .run-date,
.run-row:hover .run-date {
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.run-duration {
  flex-shrink: 0;
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  color: var(--ui-text-faint-fg, var(--muted));
}

/* ---- run detail ---- */
.run-detail {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

/* Result excerpt held by a left rule, no filled block */
.result-preview {
  margin: 0;
  padding: 2px 0 2px 10px;
  border-left: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 55%, transparent);
  font-size: 12px;
  line-height: 1.55;
  color: var(--ui-text-muted-fg, var(--text-muted));
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 220px;
  overflow-y: auto;
}

.subsection {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.subsection-title {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ui-text-faint-fg, var(--muted));
}

.trace-row {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 0 2px 10px;
  border-left: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 55%, transparent);
}

.trace-title {
  font-size: 12px;
  color: var(--ui-text-primary-fg, var(--text-primary));
  overflow-wrap: anywhere;
}

.trace-row small {
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 10.5px;
  color: var(--ui-text-faint-fg, var(--muted));
}

.trace-row code {
  min-width: 0;
  max-height: 96px;
  overflow-y: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  line-height: 1.5;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

/* ---- underline inputs: the line is the control ---- */
.field {
  appearance: none;
  min-width: 0;
  width: 100%;
  background: transparent;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 70%, transparent);
  border-radius: 0;
  padding: 3px 0 4px;
  font-size: 12px;
  color: var(--ui-text-primary-fg, var(--text-primary));
  transition: border-color 0.12s ease;
}

.field:hover:not(:disabled),
.field:focus {
  outline: none;
  border-bottom-color: var(--ui-accent-primary-fg, var(--accent));
}

.field::placeholder {
  color: var(--ui-text-faint-fg, var(--muted));
}

.field.is-mono {
  font-family: var(--font-mono, monospace);
  font-size: 11.5px;
}


.textarea {
  min-height: 90px;
  line-height: 1.5;
  resize: vertical;
}

/* ---- task editor: the paper shell is `Dialog variant="paper"` since P2 ---- */
.task-editor-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 18px 8px;
  scrollbar-width: thin;
}

/* `.editor-field` is the same column as a `<label>`, for the rows whose control
   is a component (Select/Switch) rather than a labelable element — wrapping one
   in a <label> would make the caption click the component's first inner input. */
.task-editor-body label,
.task-editor-body .editor-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.task-editor-body label > span,
.task-editor-body .editor-field > span {
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.schedule-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 140px), 1fr));
  gap: 14px 18px;
  min-width: 0;
}

/* P3: the ink-dot the old `input[type=checkbox]` was restyled into is exactly
   `<Switch variant="ledger">`, which draws (and focuses) itself. Row only. */
.checkbox-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.checkbox-row > span {
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

/* ---- narrow containers: stacked list/detail with slide ---- */
@container (max-width: 520px) {
  .tasks-layout {
    display: block;
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .task-list,
  .task-detail {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .task-list {
    transform: translateX(0);
    z-index: 1;
  }

  .task-detail {
    transform: translateX(100%);
    z-index: 2;
    padding: 4px 2px 24px 0;
    background: var(--ui-surface-chat-bg, var(--ui-surface-app-bg, var(--bg)));
  }

  .detail-active .task-list {
    transform: translateX(-20%);
  }

  .detail-active .task-detail {
    transform: translateX(0);
  }

  .detail-header-nav {
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-shrink: 0;
    padding: 2px 0 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--border-subtle, var(--border))) 32%, transparent);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tasks-panel {
    animation: none;
  }

  .task-list,
  .task-detail {
    transition: none;
  }
}
</style>
