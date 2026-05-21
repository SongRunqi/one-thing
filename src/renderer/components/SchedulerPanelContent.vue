<template>
  <div class="tasks-panel">
    <header class="tasks-header">
      <div class="header-copy">
        <h2>Tasks</h2>
        <p>{{ tasks.length }} scheduled task{{ tasks.length === 1 ? '' : 's' }}</p>
      </div>
      <div class="header-actions">
        <button
          class="icon-btn"
          type="button"
          title="Refresh"
          :disabled="loading"
          @click="() => loadAll()"
        >
          <RefreshCw
            :size="16"
            :class="{ spinning: loading }"
          />
        </button>
        <button
          class="primary-btn compact"
          type="button"
          @click="startCreate"
        >
          <Plus :size="15" />
          <span>New</span>
        </button>
      </div>
    </header>

    <div
      v-if="error"
      class="notice error"
    >
      {{ error }}
    </div>

    <section
      v-if="editing"
      class="editor-section"
    >
      <div class="section-title">
        <strong>{{ editingId ? 'Edit task' : 'Create task' }}</strong>
        <button
          class="text-btn"
          type="button"
          @click="cancelEdit"
        >
          Cancel
        </button>
      </div>

      <label>
        <span>Name</span>
        <input
          v-model="form.name"
          class="field"
          type="text"
          placeholder="Morning news brief"
        >
      </label>

      <label>
        <span>Agent</span>
        <select
          v-model="form.agentId"
          class="field"
        >
          <option
            v-for="agent in agentsStore.agents"
            :key="agent.id"
            :value="agent.id"
          >
            {{ agent.name }}
          </option>
        </select>
      </label>

      <label>
        <span>Task</span>
        <textarea
          v-model="form.prompt"
          class="field textarea"
          placeholder="Check the morning AI news and summarize the top 5 items with links."
        />
      </label>

      <div class="schedule-grid">
        <label>
          <span>Schedule</span>
          <select
            v-model="form.scheduleMode"
            class="field"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="interval">Interval</option>
            <option value="cron">Cron</option>
          </select>
        </label>

        <label v-if="form.scheduleMode === 'daily' || form.scheduleMode === 'weekly'">
          <span>Time</span>
          <input
            v-model="form.time"
            class="field"
            type="time"
          >
        </label>

        <label v-if="form.scheduleMode === 'weekly'">
          <span>Day</span>
          <select
            v-model="form.dayOfWeek"
            class="field"
          >
            <option value="1">Monday</option>
            <option value="2">Tuesday</option>
            <option value="3">Wednesday</option>
            <option value="4">Thursday</option>
            <option value="5">Friday</option>
            <option value="6">Saturday</option>
            <option value="0">Sunday</option>
          </select>
        </label>

        <label v-if="form.scheduleMode === 'interval'">
          <span>Every minutes</span>
          <input
            v-model.number="form.intervalMinutes"
            class="field"
            type="number"
            min="1"
            step="1"
          >
        </label>

        <label v-if="form.scheduleMode === 'cron'">
          <span>Cron</span>
          <input
            v-model="form.cron"
            class="field"
            type="text"
            placeholder="0 9 * * *"
          >
        </label>

        <label v-if="form.scheduleMode !== 'interval'">
          <span>Timezone</span>
          <input
            v-model="form.timezone"
            class="field"
            type="text"
            placeholder="System"
          >
        </label>
      </div>

      <label>
        <span>Working directory</span>
        <input
          v-model="form.workingDirectory"
          class="field"
          type="text"
          placeholder="Optional"
        >
      </label>

      <label class="checkbox-row">
        <input
          v-model="form.enabled"
          type="checkbox"
        >
        <span>Enabled</span>
      </label>

      <button
        class="primary-btn"
        type="button"
        :disabled="saving"
        @click="saveTask"
      >
        <Save :size="15" />
        <span>{{ saving ? 'Saving...' : 'Save task' }}</span>
      </button>
    </section>

    <div class="tasks-layout">
      <section class="task-list">
        <div class="list-heading">
          <span>Scheduled</span>
          <span>{{ tasks.length }}</span>
        </div>
        <button
          v-for="task in tasks"
          :key="task.id"
          type="button"
          class="task-row"
          :class="{ active: selectedTaskId === task.id }"
          @click="selectTask(task.id)"
        >
          <span class="task-icon">
            <Bot
              v-if="task.kind === 'agent'"
              :size="15"
            />
            <Sparkles
              v-else
              :size="15"
            />
          </span>
          <span class="task-row-main">
            <span class="task-title">
              <strong>{{ task.name || task.id }}</strong>
            </span>
            <span class="task-meta">{{ formatSchedule(task.schedule) }}</span>
            <span class="task-preview">{{ task.promptPreview || task.pluginId || task.id }}</span>
            <span class="task-foot">
              <span>{{ formatTaskLastRun(task) }}</span>
              <span>{{ taskOwnerLabel(task) }}</span>
            </span>
          </span>
          <span
            class="status-pill"
            :class="{ off: !task.enabled, running: task.inFlight }"
          >
            {{ task.inFlight ? 'running' : task.enabled ? 'on' : 'off' }}
          </span>
        </button>
        <div
          v-if="!loading && tasks.length === 0"
          class="empty-state"
        >
          <CalendarClock :size="42" />
          <span>No scheduled tasks yet</span>
        </div>
      </section>

      <section
        v-if="selectedTask"
        class="task-detail"
      >
        <div class="detail-head">
          <div>
            <div class="detail-kicker">
              <span>{{ selectedTask.kind === 'agent' ? 'Agent task' : 'Plugin task' }}</span>
              <span v-if="selectedTask.readonly">Read only</span>
              <span v-else>User task</span>
            </div>
            <h3>{{ selectedTask.name || selectedTask.id }}</h3>
            <p>{{ selectedTask.id }}</p>
          </div>
          <div class="detail-actions">
            <button
              class="icon-btn"
              type="button"
              title="Run now"
              :disabled="actionId === selectedTask.id || selectedTask.inFlight"
              @click="runNow(selectedTask.id)"
            >
              <Play :size="15" />
            </button>
            <button
              class="icon-btn"
              type="button"
              :title="selectedTask.enabled ? 'Disable' : 'Enable'"
              :disabled="actionId === selectedTask.id"
              @click="setEnabled(selectedTask.id, !selectedTask.enabled)"
            >
              <Power :size="15" />
            </button>
            <button
              v-if="!selectedTask.readonly"
              class="icon-btn"
              type="button"
              title="Edit"
              @click="startEdit(selectedTask)"
            >
              <Pencil :size="15" />
            </button>
            <button
              v-if="!selectedTask.readonly"
              class="icon-btn danger"
              type="button"
              title="Delete"
              @click="deleteTask(selectedTask.id)"
            >
              <Trash2 :size="15" />
            </button>
          </div>
        </div>

        <div class="metric-grid">
          <span><small>Next</small><strong :title="formatMaybeDate(selectedTask.nextRunAt)">{{ formatShortDate(selectedTask.nextRunAt) }}</strong></span>
          <span><small>Last</small><strong :title="formatMaybeDate(selectedTask.lastRunAt)">{{ formatShortDate(selectedTask.lastRunAt) }}</strong></span>
          <span><small>Health</small><strong>{{ taskHealthLabel(selectedTask) }}</strong></span>
          <span><small>Owner</small><strong>{{ taskOwnerLabel(selectedTask) }}</strong></span>
        </div>

        <p
          v-if="selectedTask.promptPreview || selectedTask.prompt"
          class="detail-prompt"
        >
          {{ selectedTask.promptPreview || selectedTask.prompt }}
        </p>

        <section class="history-section">
          <button
            class="history-toggle"
            type="button"
            @click="toggleHistory"
          >
            <span>
              <strong>Run history</strong>
              <small>{{ historySummary }}</small>
            </span>
            <span>{{ historyOpen ? 'Hide' : 'Show' }}</span>
          </button>

          <div
            v-if="historyOpen"
            class="history-drawer"
          >
            <div class="section-title">
              <strong>Recent runs</strong>
              <button
                class="text-btn"
                type="button"
                :disabled="runsLoading"
                @click="loadRuns(selectedTask.id)"
              >
                Refresh
              </button>
            </div>

            <div class="runs-list">
              <div
                v-if="runsLoading"
                class="notice"
              >
                Loading run history...
              </div>
              <button
                v-for="run in runs"
                :key="run.runId || `${run.taskId}-${run.startedAt}`"
                class="run-row"
                :class="[{ active: selectedRun?.runId === run.runId }, run.status]"
                type="button"
                @click="selectedRun = selectedRun?.runId === run.runId ? null : run"
              >
                <span>
                  <strong>{{ run.status }}</strong>
                  <small :title="formatMaybeDate(run.startedAt)">{{ formatShortDate(run.startedAt) }} · {{ formatDuration(run.durationMs) }}</small>
                </span>
                <span
                  class="status-dot"
                  :class="run.status"
                />
              </button>
              <div
                v-if="!runsLoading && runs.length === 0"
                class="notice"
              >
                No run history yet.
              </div>
            </div>
          </div>
        </section>

        <article
          v-if="historyOpen && selectedRun"
          class="run-detail"
        >
          <div class="section-title">
            <strong>Run detail</strong>
            <button
              v-if="selectedRun.sessionId"
              class="text-btn"
              type="button"
              @click="openRunSession(selectedRun.sessionId)"
            >
              Open session
            </button>
          </div>
          <p
            v-if="selectedRun.error"
            class="notice error"
          >
            {{ selectedRun.error }}
          </p>
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
            <strong>Tools</strong>
            <div
              v-for="tool in selectedRun.toolCalls"
              :key="tool.id"
              class="trace-row"
            >
              <span>{{ tool.toolName }}</span>
              <small>{{ tool.status }} · {{ formatDuration(tool.durationMs) }}</small>
              <code>{{ tool.argumentsPreview }}</code>
            </div>
          </div>

          <div class="subsection">
            <strong>Timeline</strong>
            <div
              v-for="item in selectedRun.timeline || []"
              :key="item.id"
              class="trace-row"
            >
              <span>{{ item.title }}</span>
              <small :title="formatMaybeDate(item.timestamp)">{{ formatShortDate(item.timestamp) }}{{ item.status ? ` · ${item.status}` : '' }}</small>
              <code v-if="item.detail">{{ item.detail }}</code>
            </div>
          </div>
        </article>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAgentsStore } from '@/stores/agents'
import type {
  SchedulerRunDetailDTO,
  SchedulerSchedule,
  SchedulerTaskSnapshotDTO,
} from '@/types'
import {
  Bot,
  CalendarClock,
  Pencil,
  Play,
  Plus,
  Power,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-vue-next'

const agentsStore = useAgentsStore()

const tasks = ref<SchedulerTaskSnapshotDTO[]>([])
const runs = ref<SchedulerRunDetailDTO[]>([])
const selectedTaskId = ref('')
const selectedRun = ref<SchedulerRunDetailDTO | null>(null)
const historyOpen = ref(false)
const loading = ref(false)
const runsLoading = ref(false)
const saving = ref(false)
const actionId = ref('')
const error = ref('')
const editing = ref(false)
const editingId = ref('')

const defaultTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''

const form = ref({
  name: '',
  prompt: '',
  agentId: 'default',
  enabled: true,
  scheduleMode: 'daily' as 'daily' | 'weekly' | 'interval' | 'cron',
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

const historySummary = computed(() => {
  const task = selectedTask.value
  if (!task) return 'No task selected'
  const total = task.runCount || runs.value.length
  if (!total) return 'No runs yet'
  return `${total} run${total === 1 ? '' : 's'} · ${formatTaskLastRun(task)}`
})

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
    const response = editingId.value
      ? await window.electronAPI.updateSchedulerTask({ id: editingId.value, ...payload })
      : await window.electronAPI.createSchedulerTask(payload)
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
    const response = await window.electronAPI.listSchedulerTasks()
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
    const response = await window.electronAPI.listSchedulerRuns({ taskId, limit: 50 })
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
    const response = await window.electronAPI.runSchedulerTaskNow({ id: taskId, force: true })
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
    const response = await window.electronAPI.setSchedulerTaskEnabled({ id: taskId, enabled })
    if (!response.success) throw new Error(response.error || 'Failed to update task')
    await loadAll(taskId)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    actionId.value = ''
  }
}

async function deleteTask(taskId: string): Promise<void> {
  if (!confirm('Delete this scheduled task? Existing run history will stay on disk.')) return
  error.value = ''
  try {
    const response = await window.electronAPI.deleteSchedulerTask({ id: taskId })
    if (!response.success) throw new Error(response.error || 'Failed to delete task')
    await loadAll('')
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function openRunSession(sessionId: string): Promise<void> {
  await window.electronAPI.updateSessionArchived(sessionId, false, null)
  await window.electronAPI.switchSession(sessionId)
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

function taskHealthLabel(task: SchedulerTaskSnapshotDTO): string {
  const total = task.successCount + task.failureCount
  if (!total) return 'No runs'
  if (task.failureCount === 0) return 'All clear'
  return `${task.successCount}/${total} ok`
}

function taskOwnerLabel(task: SchedulerTaskSnapshotDTO): string {
  if (task.kind === 'plugin') return task.pluginId || 'Plugin'
  const agent = agentsStore.agents.find(item => item.id === task.agentId)
  return agent?.name || task.agentId || 'Agent'
}

onMounted(async () => {
  await agentsStore.loadAgents().catch(() => undefined)
  resetForm()
  await loadAll()
})
</script>

<style scoped>
.tasks-panel {
  height: 100%;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 6px 20px;
  overflow-x: hidden;
  overflow-y: auto;
  color: var(--text);
}

.tasks-panel,
.tasks-panel * {
  box-sizing: border-box;
}

.tasks-header,
.header-actions,
.section-title,
.task-title,
.detail-kicker {
  display: flex;
  align-items: center;
}

.tasks-header {
  justify-content: space-between;
  gap: 12px;
  padding: 0 2px 2px;
}

.header-copy {
  min-width: 0;
}

.header-actions {
  flex-shrink: 0;
  gap: 8px;
}

.tasks-header h2,
.detail-head h3 {
  margin: 0;
  line-height: 1.18;
  overflow-wrap: anywhere;
}

.tasks-header h2 {
  font-size: 18px;
}

.detail-head h3 {
  font-size: 17px;
}

.tasks-header p,
.detail-head p,
.task-meta,
.task-preview,
.run-row small,
.trace-row small,
label span {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
}

.tasks-header p {
  margin-top: 3px;
}

.icon-btn,
.primary-btn,
.text-btn {
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text);
  cursor: pointer;
}

.icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    opacity 0.15s ease;
}

.icon-btn:hover:not(:disabled),
.primary-btn:hover:not(:disabled) {
  background: var(--hover);
}

.icon-btn:disabled,
.primary-btn:disabled,
.text-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.icon-btn.danger {
  color: var(--danger, #ef4444);
}

.primary-btn {
  min-height: 32px;
  border-radius: 7px;
  padding: 0 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 650;
}

.primary-btn.compact {
  padding: 0 10px;
}

.editor-section > .primary-btn {
  width: 100%;
}

.text-btn {
  border: 0;
  background: transparent;
  color: var(--accent, #4f7cff);
  padding: 4px 2px;
  font-size: 12px;
}

.tasks-layout {
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.task-list,
.task-detail,
.editor-section {
  min-width: 0;
  max-width: 100%;
}

.task-list {
  display: grid;
  gap: 3px;
  padding: 2px;
}

.list-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 6px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.task-row {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: start;
  gap: 9px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  padding: 9px 8px;
  text-align: left;
  cursor: pointer;
  box-shadow: inset 0 0 0 0 transparent;
  transition:
    background 0.15s ease,
    box-shadow 0.15s ease;
}

.task-row:hover {
  background: color-mix(in srgb, var(--text) 5%, transparent);
}

.task-row.active {
  background: var(--active);
  box-shadow: inset 3px 0 0 var(--accent, #4f7cff);
}

.task-icon {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  background: color-mix(in srgb, var(--text) 5%, transparent);
}

.task-row.active .task-icon {
  color: var(--accent, #4f7cff);
  background: color-mix(in srgb, var(--accent, #4f7cff) 13%, transparent);
}

.task-row-main {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.task-title {
  min-width: 0;
}

.task-title strong {
  min-width: 0;
  font-size: 13px;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.task-preview {
  display: -webkit-box;
  overflow: hidden;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.35;
}

.task-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin-top: 2px;
  color: var(--text-muted);
  font-size: 11px;
}

.task-foot span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-foot span + span {
  position: relative;
  padding-left: 8px;
}

.task-foot span + span::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--text-muted) 58%, transparent);
  transform: translateY(-50%);
}

.status-pill {
  flex-shrink: 0;
  border-radius: 999px;
  padding: 2px 7px 3px;
  background: color-mix(in srgb, #22c55e 14%, transparent);
  color: #16a34a;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
}

.status-pill.off {
  background: color-mix(in srgb, var(--text-muted) 13%, transparent);
  color: var(--text-muted);
}

.status-pill.running {
  background: color-mix(in srgb, #f59e0b 16%, transparent);
  color: #d97706;
}

.task-detail,
.editor-section {
  display: grid;
  gap: 13px;
  align-content: start;
}

.editor-section {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-elevated);
  padding: 12px;
}

.task-detail {
  padding: 14px 2px 0;
  border-top: 1px solid var(--border);
}

.detail-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 11px;
}

.detail-head > div:first-child {
  min-width: 0;
  display: grid;
  gap: 5px;
  padding: 0 2px;
}

.detail-head p {
  overflow-wrap: anywhere;
}

.detail-kicker {
  gap: 6px;
  flex-wrap: wrap;
}

.detail-kicker span {
  min-height: 20px;
  display: inline-flex;
  align-items: center;
  padding: 0 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text) 6%, transparent);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 650;
}

.detail-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(44px, 1fr));
  gap: 8px;
}

.detail-actions .icon-btn {
  width: 100%;
  height: 34px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-elevated);
}

.metric-grid span {
  min-width: 0;
  min-height: 55px;
  padding: 8px 9px;
  display: grid;
  gap: 4px;
  align-content: start;
}

.metric-grid span:nth-child(odd) {
  border-right: 1px solid var(--border);
}

.metric-grid span:nth-child(n + 3) {
  border-top: 1px solid var(--border);
}

.metric-grid small {
  color: var(--text-muted);
}

.metric-grid strong {
  font-size: 12px;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.detail-prompt {
  margin: 0;
  border-left: 2px solid color-mix(in srgb, var(--accent, #4f7cff) 50%, var(--border));
  padding: 1px 0 1px 10px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

label {
  display: grid;
  gap: 6px;
}

.field {
  min-width: 0;
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--bg);
  color: var(--text);
  padding: 8px 9px;
  font-size: 13px;
}

.field:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--accent, #4f7cff) 55%, var(--border));
}

.textarea {
  min-height: 90px;
  resize: vertical;
}

.schedule-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  gap: 10px;
}

.checkbox-row {
  grid-template-columns: auto 1fr;
  align-items: center;
}

.section-title {
  justify-content: space-between;
  gap: 10px;
}

.section-title strong,
.subsection > strong {
  font-size: 13px;
}

.history-section {
  display: grid;
  gap: 9px;
}

.history-toggle {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent, #4f7cff) 7%, transparent);
  color: var(--text);
  padding: 10px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}

.history-toggle:hover {
  background: color-mix(in srgb, var(--accent, #4f7cff) 11%, transparent);
}

.history-toggle > span:first-child {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.history-toggle strong {
  font-size: 13px;
}

.history-toggle small {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-toggle > span:last-child {
  color: var(--accent, #4f7cff);
  font-size: 12px;
  font-weight: 700;
}

.history-drawer {
  display: grid;
  gap: 8px;
  padding: 0 2px;
}

.runs-list,
.run-detail,
.subsection {
  display: grid;
  gap: 8px;
}

.runs-list {
  position: relative;
}

.run-row {
  min-width: 0;
  max-width: 100%;
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr);
  align-items: start;
  gap: 9px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text);
  padding: 8px 6px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}

.run-row:hover {
  background: color-mix(in srgb, var(--text) 5%, transparent);
}

.run-row.active {
  background: var(--active);
}

.run-row strong {
  text-transform: capitalize;
  font-size: 13px;
}

.run-row span:first-child {
  min-width: 0;
  display: grid;
  gap: 3px;
  order: 2;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);
  margin-top: 5px;
  order: 1;
}

.status-dot.succeeded {
  background: #22c55e;
}

.status-dot.failed,
.status-dot.blocked {
  background: #ef4444;
}

.status-dot.running {
  background: #f59e0b;
}

.run-detail {
  border-top: 1px solid var(--border);
  padding-top: 10px;
}

.trace-row {
  min-width: 0;
  max-width: 100%;
  display: grid;
  gap: 4px;
  border-left: 2px solid color-mix(in srgb, var(--text-muted) 22%, transparent);
  background: transparent;
  color: var(--text);
  padding: 3px 0 3px 10px;
}

.result-preview,
.notice {
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--bg-elevated);
  padding: 9px;
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.notice.error {
  border-color: color-mix(in srgb, #ef4444 42%, var(--border));
  color: #ef4444;
}

.trace-row code {
  min-width: 0;
  max-height: 96px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.45;
}

.empty-state {
  min-height: 180px;
  display: grid;
  place-items: center;
  gap: 10px;
  color: var(--text-muted);
}

.spinning {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
