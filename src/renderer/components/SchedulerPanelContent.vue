<template>
  <div class="tasks-panel">
    <header class="tasks-header">
      <div class="header-copy">
        <h2>Tasks</h2>
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
          <span>New Task</span>
        </button>
      </div>
    </header>

    <div
      v-if="error"
      class="notice error"
    >
      {{ error }}
    </div>

    <div class="tasks-layout">
      <section class="task-list">
        <div class="task-list-title">
          <span>All Tasks</span>
          <strong>{{ tasks.length }}</strong>
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
          <span :class="['status-badge', taskStatusClass(task)]">
            <span class="status-marker" />
            {{ taskStatusLabel(task) }}
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
        <section class="task-overview">
          <div class="overview-main">
            <span class="overview-kicker">{{ selectedTask.kind === 'agent' ? 'Agent task' : 'Plugin task' }}{{ selectedTask.readonly ? ' · Read only' : '' }}</span>
            <h3>{{ selectedTask.name || selectedTask.id }}</h3>
          </div>

          <p
            v-if="selectedTask.promptPreview || selectedTask.prompt"
            class="overview-prompt"
          >
            {{ selectedTask.promptPreview || selectedTask.prompt }}
          </p>
        </section>

        <section class="status-action-panel">
          <div class="status-focus">
            <span :class="['status-badge hero', taskStatusClass(selectedTask)]">
              <span class="status-marker" />
              {{ taskStatusLabel(selectedTask) }}
            </span>
            <div>
              <strong :class="{ 'health-danger': taskHealthDanger(selectedTask) }">{{ taskHealthLabel(selectedTask) }}</strong>
              <p>{{ runtimeStatusNote(selectedTask) }}</p>
            </div>
          </div>

          <div class="overview-actions">
            <button
              class="secondary-btn"
              type="button"
              title="Run now"
              :disabled="actionId === selectedTask.id || selectedTask.inFlight"
              @click="runNow(selectedTask.id)"
            >
              <Play :size="15" />
              <span>Run Now</span>
            </button>
            <button
              class="secondary-btn"
              type="button"
              :title="selectedTask.enabled ? 'Disable' : 'Enable'"
              :disabled="actionId === selectedTask.id"
              @click="setEnabled(selectedTask.id, !selectedTask.enabled)"
            >
              <Power :size="15" />
              <span>{{ selectedTask.enabled ? 'Disable' : 'Enable' }}</span>
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
        </section>

        <section class="runtime-section">
          <div class="section-block-heading">
            <span>Runtime</span>
            <strong>{{ formatSchedule(selectedTask.schedule) }}</strong>
          </div>

          <dl class="runtime-grid">
            <div>
              <dt>Next Run</dt>
              <dd :title="formatMaybeDate(selectedTask.nextRunAt)">
                {{ formatShortDate(selectedTask.nextRunAt) }}
              </dd>
            </div>
            <div>
              <dt>Last Run</dt>
              <dd :title="formatMaybeDate(selectedTask.lastRunAt)">
                {{ formatShortDate(selectedTask.lastRunAt) }}
              </dd>
            </div>
            <div>
              <dt>Runs</dt>
              <dd>{{ taskRunCountLabel(selectedTask) }}</dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd>{{ taskOwnerLabel(selectedTask) }}</dd>
            </div>
          </dl>
        </section>

        <section class="history-section">
          <button
            class="history-toggle"
            type="button"
            @click="toggleHistory"
          >
            <span>
              <strong>Run history</strong>
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

        <section
          v-if="selectedMemoryDreamingTask"
          class="managed-section"
        >
          <div class="managed-head">
            <div>
              <h4>Configuration</h4>
            </div>
            <button
              class="text-btn"
              type="button"
              @click="resetDreamingForm"
            >
              Reset
            </button>
          </div>

          <div class="config-stack">
            <section class="config-group">
              <div class="config-section-head">
                <h5>Basic</h5>
              </div>

              <div class="config-body">
                <div class="config-rows">
                  <label class="config-row">
                    <span>Cron</span>
                    <input
                      v-model="dreamingForm.frequency"
                      class="field"
                      type="text"
                      aria-label="Dreaming cron"
                      placeholder="0 3 * * *"
                    >
                  </label>

                  <label class="config-row">
                    <span>Timezone</span>
                    <input
                      v-model="dreamingForm.timezone"
                      class="field"
                      type="text"
                      aria-label="Dreaming timezone"
                      placeholder="System"
                    >
                  </label>

                  <label class="config-row">
                    <span>Model</span>
                    <input
                      v-model="dreamingForm.model"
                      class="field"
                      type="text"
                      aria-label="Dreaming model"
                      placeholder="Default"
                    >
                  </label>
                </div>
              </div>
            </section>

            <section class="config-group">
              <div class="config-section-head">
                <h5>Sources</h5>
              </div>

              <div class="config-body">
                <div class="source-list">
                  <label
                    v-for="source in dreamSourceOptions"
                    :key="source.value"
                    class="source-check"
                  >
                    <input
                      type="checkbox"
                      :checked="dreamingForm.sources.includes(source.value)"
                      @change="toggleDreamingSourceFromEvent(source.value, $event)"
                    >
                    <span>{{ source.label }}</span>
                  </label>
                </div>
              </div>
            </section>

            <section class="config-group">
              <div class="config-section-head">
                <h5>Limits</h5>
              </div>

              <div class="config-body">
                <div class="config-grid">
                  <label class="config-field">
                    <span>Lookback days</span>
                    <input
                      v-model.number="dreamingForm.lookbackDays"
                      class="field"
                      type="number"
                      min="1"
                      step="1"
                      aria-label="Dreaming lookback days"
                    >
                  </label>

                  <label class="config-field">
                    <span>Source files</span>
                    <input
                      v-model.number="dreamingForm.maxSourceFiles"
                      class="field"
                      type="number"
                      min="1"
                      step="1"
                      aria-label="Dreaming source files"
                    >
                  </label>

                  <label class="config-field">
                    <span>Sessions</span>
                    <input
                      v-model.number="dreamingForm.maxSessions"
                      class="field"
                      type="number"
                      min="1"
                      step="1"
                      aria-label="Dreaming sessions"
                    >
                  </label>

                  <label class="config-field">
                    <span>Messages/session</span>
                    <input
                      v-model.number="dreamingForm.maxMessagesPerSession"
                      class="field"
                      type="number"
                      min="1"
                      step="1"
                      aria-label="Dreaming messages per session"
                    >
                  </label>

                  <label class="config-field">
                    <span>Input chars</span>
                    <input
                      v-model.number="dreamingForm.maxInputChars"
                      class="field"
                      type="number"
                      min="1000"
                      step="1000"
                      aria-label="Dreaming input chars"
                    >
                  </label>

                  <label class="config-field">
                    <span>Timeout ms</span>
                    <input
                      v-model.number="dreamingForm.timeoutMs"
                      class="field"
                      type="number"
                      min="1000"
                      step="1000"
                      aria-label="Dreaming timeout"
                    >
                  </label>
                </div>
              </div>
            </section>

            <section class="config-group">
              <div class="config-section-head">
                <h5>Scoring</h5>
              </div>

              <div class="config-body">
                <div class="config-grid">
                  <label class="config-field">
                    <span>Max promotions</span>
                    <input
                      v-model.number="dreamingForm.maxPromotions"
                      class="field"
                      type="number"
                      min="0"
                      step="1"
                      aria-label="Dreaming max promotions"
                    >
                  </label>

                  <label class="config-field">
                    <span>Min score</span>
                    <input
                      v-model.number="dreamingForm.minScore"
                      class="field"
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      aria-label="Dreaming minimum score"
                    >
                  </label>

                  <label class="config-field">
                    <span>Min recalls</span>
                    <input
                      v-model.number="dreamingForm.minRecallCount"
                      class="field"
                      type="number"
                      min="0"
                      step="1"
                      aria-label="Dreaming minimum recalls"
                    >
                  </label>

                  <label class="config-field">
                    <span>Unique sources</span>
                    <input
                      v-model.number="dreamingForm.minUniqueSources"
                      class="field"
                      type="number"
                      min="0"
                      step="1"
                      aria-label="Dreaming unique sources"
                    >
                  </label>
                </div>
              </div>
            </section>
          </div>

          <div class="config-savebar">
            <span>{{ dreamingFormDirty ? 'Unsaved changes' : 'Memory Dreaming settings' }}</span>
            <button
              class="primary-btn"
              type="button"
              :disabled="saving || !dreamingFormDirty"
              @click="saveManagedDreamingTask"
            >
              <Save :size="15" />
              <span>{{ saving ? 'Saving...' : 'Save Changes' }}</span>
            </button>
          </div>
        </section>
      </section>
    </div>

    <div
      v-if="editing"
      class="task-editor-backdrop"
      @click.self="cancelEdit"
    >
      <section
        ref="editorDialogRef"
        class="task-editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scheduler-task-editor-title"
        tabindex="-1"
        @keydown.esc.stop.prevent="cancelEdit"
      >
        <header class="task-editor-header">
          <div>
            <span class="overview-kicker">{{ editingId ? 'Task editor' : 'New scheduled task' }}</span>
            <h3 id="scheduler-task-editor-title">
              {{ editingId ? 'Edit task' : 'Create task' }}
            </h3>
            <p>{{ editingId ? 'Update the task details without leaving the task view.' : 'Create a scheduled task without interrupting task browsing.' }}</p>
          </div>
          <button
            class="icon-btn"
            type="button"
            title="Close"
            :disabled="saving"
            @click="cancelEdit"
          >
            <X :size="16" />
          </button>
        </header>

        <div class="task-editor-body">
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

          <label>
            <span>Agent</span>
            <select
              v-model="form.agentId"
              class="field"
              aria-label="Task agent"
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
              aria-label="Task prompt"
              placeholder="Check the morning AI news and summarize the top 5 items with links."
            />
          </label>

          <div class="schedule-grid">
            <label>
              <span>Schedule</span>
              <select
                v-model="form.scheduleMode"
                class="field"
                aria-label="Task schedule"
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
                aria-label="Task time"
              >
            </label>

            <label v-if="form.scheduleMode === 'weekly'">
              <span>Day</span>
              <select
                v-model="form.dayOfWeek"
                class="field"
                aria-label="Task day"
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
                aria-label="Task interval minutes"
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
              class="field"
              type="text"
              aria-label="Task working directory"
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
        </div>

        <footer class="task-editor-footer">
          <button
            class="secondary-btn"
            type="button"
            :disabled="saving"
            @click="cancelEdit"
          >
            Cancel
          </button>
          <button
            class="primary-btn"
            type="button"
            :disabled="saving"
            @click="saveTask"
          >
            <Save :size="15" />
            <span>{{ saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Task' }}</span>
          </button>
        </footer>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useAgentsStore } from '@/stores/agents'
import { useSettingsStore } from '@/stores/settings'
import type {
  SchedulerRunDetailDTO,
  SchedulerSchedule,
  SchedulerTaskSnapshotDTO,
} from '@/types'
import {
  DEFAULT_SOUL_MEMORY_DREAMING_SETTINGS,
  normalizeSoulMemorySettings,
} from '@shared/defaults/settings'
import type { SoulMemoryDreamingSettings } from '@shared/ipc/settings'
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
  X,
} from 'lucide-vue-next'

const agentsStore = useAgentsStore()
const settingsStore = useSettingsStore()

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
const editorDialogRef = ref<HTMLElement | null>(null)

const defaultTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''

type DreamingSource = NonNullable<SoulMemoryDreamingSettings['sources']>[number]

const dreamSourceOptions: Array<{ value: DreamingSource; label: string }> = [
  { value: 'daily', label: 'Daily notes' },
  { value: 'sessions', label: 'Sessions' },
  { value: 'short-term', label: 'Short-term notes' },
  { value: 'recall', label: 'Recall index' },
]

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

const dreamingForm = ref<Required<SoulMemoryDreamingSettings>>({
  enabled: false,
  frequency: '0 3 * * *',
  timezone: '',
  model: '',
  sources: ['daily', 'sessions', 'short-term'],
  lookbackDays: 30,
  maxSourceFiles: 12,
  maxSessions: 12,
  maxMessagesPerSession: 24,
  maxInputChars: 48000,
  maxPromotions: 10,
  minScore: 0.78,
  minRecallCount: 1,
  minUniqueSources: 1,
  timeoutMs: 60000,
})

const selectedTask = computed(() =>
  tasks.value.find(task => task.id === selectedTaskId.value) || null
)

const selectedMemoryDreamingTask = computed(() =>
  isMemoryDreamingTask(selectedTask.value) ? selectedTask.value : null
)

const dreamingFormDirty = computed(() => {
  const stored = readDreamingSettings()
  const current = dreamingForm.value
  return (
    current.frequency !== stored.frequency ||
    current.timezone !== stored.timezone ||
    current.model !== stored.model ||
    current.lookbackDays !== stored.lookbackDays ||
    current.maxSourceFiles !== stored.maxSourceFiles ||
    current.maxSessions !== stored.maxSessions ||
    current.maxMessagesPerSession !== stored.maxMessagesPerSession ||
    current.maxInputChars !== stored.maxInputChars ||
    current.maxPromotions !== stored.maxPromotions ||
    current.minScore !== stored.minScore ||
    current.minRecallCount !== stored.minRecallCount ||
    current.minUniqueSources !== stored.minUniqueSources ||
    current.timeoutMs !== stored.timeoutMs ||
    JSON.stringify([...current.sources].sort()) !== JSON.stringify([...stored.sources].sort())
  )
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

function isMemoryDreamingTask(task?: SchedulerTaskSnapshotDTO | null): boolean {
  return task?.pluginId === 'soul-memory' && task.tags?.includes('dreaming') === true
}

function resetDreamingForm(): void {
  dreamingForm.value = readDreamingSettings()
}

function readDreamingSettings(): Required<SoulMemoryDreamingSettings> {
  const dreaming = normalizeSoulMemorySettings(settingsStore.settings.general.soulMemory).dreaming
  return {
    ...DEFAULT_SOUL_MEMORY_DREAMING_SETTINGS,
    ...dreaming,
    sources: [...(dreaming.sources ?? DEFAULT_SOUL_MEMORY_DREAMING_SETTINGS.sources)],
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

async function saveMemoryDreamingSettings(
  patch: Partial<Required<SoulMemoryDreamingSettings>>,
): Promise<void> {
  const currentMemory = normalizeSoulMemorySettings(settingsStore.settings.general.soulMemory)
  const currentDreaming = readDreamingSettings()
  const nextMemory = normalizeSoulMemorySettings({
    ...currentMemory,
    dreaming: {
      ...currentDreaming,
      ...patch,
      sources: patch.sources ? [...patch.sources] : [...currentDreaming.sources],
    },
  })
  await settingsStore.saveSettings({
    ...settingsStore.settings,
    general: {
      ...settingsStore.settings.general,
      soulMemory: nextMemory,
    },
  })
}

async function saveManagedDreamingTask(): Promise<void> {
  const task = selectedMemoryDreamingTask.value
  if (!task) return
  saving.value = true
  error.value = ''
  try {
    await saveMemoryDreamingSettings({
      ...dreamingForm.value,
      sources: [...dreamingForm.value.sources],
    })
    const response = await window.electronAPI.setSchedulerTaskEnabled({
      id: task.id,
      enabled: dreamingForm.value.enabled,
    })
    if (!response.success) throw new Error(response.error || 'Failed to update Memory Dreaming task')
    await loadAll(task.id)
    resetDreamingForm()
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
    const task = tasks.value.find(item => item.id === taskId)
    if (isMemoryDreamingTask(task)) {
      await saveMemoryDreamingSettings({ enabled })
      resetDreamingForm()
    }
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

function toggleDreamingSource(source: DreamingSource, checked: boolean): void {
  const next = new Set(dreamingForm.value.sources)
  if (checked) {
    next.add(source)
  } else {
    next.delete(source)
  }
  dreamingForm.value.sources = Array.from(next)
}

function toggleDreamingSourceFromEvent(source: DreamingSource, event: Event): void {
  toggleDreamingSource(source, (event.target as HTMLInputElement | null)?.checked === true)
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
  if (task.failureCount > task.successCount) return `${task.failureCount}/${total} failed`
  return `${task.successCount}/${total} ok`
}

function taskHealthDanger(task: SchedulerTaskSnapshotDTO): boolean {
  const total = task.successCount + task.failureCount
  return total > 0 && task.failureCount > task.successCount
}

function taskRunCountLabel(task: SchedulerTaskSnapshotDTO): string {
  const total = task.successCount + task.failureCount
  if (!total) return 'No runs yet'
  if (!task.failureCount) return `${total} total`
  return `${total} total · ${task.failureCount} failed`
}

function taskStatusLabel(task: SchedulerTaskSnapshotDTO): string {
  if (task.inFlight) return 'Running'
  if (!task.enabled) return 'Disabled'
  if (task.lastErrorAt === task.lastRunAt || task.recentRuns?.[0]?.ok === false) return 'Failed'
  if (task.successCount + task.failureCount > 0) return 'Healthy'
  return 'Scheduled'
}

function taskStatusClass(task: SchedulerTaskSnapshotDTO): string {
  if (task.inFlight) return 'running'
  if (!task.enabled) return 'disabled'
  if (task.lastErrorAt === task.lastRunAt || task.recentRuns?.[0]?.ok === false) return 'failed'
  if (task.successCount + task.failureCount > 0) return 'healthy'
  return 'scheduled'
}

function taskOwnerLabel(task: SchedulerTaskSnapshotDTO): string {
  if (task.kind === 'plugin') return task.pluginId || 'Plugin'
  const agent = agentsStore.agents.find(item => item.id === task.agentId)
  return agent?.name || task.agentId || 'Agent'
}

function runtimeStatusNote(task: SchedulerTaskSnapshotDTO): string {
  if (task.inFlight) return 'The task is running now.'
  if (!task.enabled) return 'Automatic runs are paused.'
  if (task.lastErrorAt === task.lastRunAt || task.recentRuns?.[0]?.ok === false) {
    return 'Last run failed. Check history before changing settings.'
  }
  if (task.successCount + task.failureCount > 0) return 'Recent recorded runs are healthy.'
  return 'Waiting for the first scheduled run.'
}

watch(
  () => selectedMemoryDreamingTask.value?.id,
  () => {
    if (selectedMemoryDreamingTask.value) {
      resetDreamingForm()
    }
  },
)

watch(editing, async (isEditing) => {
  if (!isEditing) return
  await nextTick()
  const firstField = editorDialogRef.value?.querySelector<HTMLElement>('input, textarea, select, button')
  firstField?.focus()
})

onMounted(async () => {
  await Promise.all([
    agentsStore.loadAgents().catch(() => undefined),
    settingsStore.loadSettings().catch(() => undefined),
  ])
  resetForm()
  resetDreamingForm()
  await loadAll()
})
</script>

<style scoped>
.tasks-panel {
  height: 100%;
  width: 100%;
  min-width: 0;
  max-width: min(1040px, 100%);
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 18px;
  margin: 0 auto;
  padding: 18px 20px 24px;
  overflow-x: hidden;
  overflow-y: auto;
  color: var(--ui-text-primary-fg, var(--text));
}

.tasks-panel,
.tasks-panel * {
  box-sizing: border-box;
}

.tasks-header,
.header-actions,
.section-title,
.task-title {
  display: flex;
  align-items: center;
}

.tasks-header {
  justify-content: space-between;
  gap: 12px;
  padding: 0 0 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-divider-border, var(--border)) 72%, transparent);
}

.header-copy {
  min-width: 0;
}

.header-actions {
  flex-shrink: 0;
  gap: 8px;
}

.tasks-header h2,
.overview-main h3 {
  margin: 0;
  line-height: 1.18;
  overflow-wrap: anywhere;
}

.tasks-header h2 {
  font-size: 20px;
  font-weight: 700;
}

.overview-main h3 {
  font-size: 22px;
  font-weight: 750;
}

.tasks-header p,
.task-meta,
.task-preview,
.run-row small,
.trace-row small,
label span {
  margin: 0;
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-size: 12px;
}

.tasks-header p {
  margin-top: 3px;
}

.icon-btn,
.primary-btn,
.secondary-btn,
.text-btn {
  color: var(--ui-text-primary-fg, var(--text));
  cursor: pointer;
}

.icon-btn {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    opacity 0.15s ease;
}

.icon-btn:hover:not(:disabled),
.secondary-btn:hover:not(:disabled) {
  background: var(--ui-state-hover-bg, var(--hover));
}

.primary-btn:hover:not(:disabled) {
  background: var(--ui-action-primary-hover-bg, var(--ui-action-primary-bg, var(--accent)));
  box-shadow: var(--ui-action-primary-hover-shadow, var(--ui-action-primary-shadow, none));
}

.icon-btn:disabled,
.primary-btn:disabled,
.secondary-btn:disabled,
.text-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.icon-btn.danger {
  color: var(--ui-status-danger-fg, var(--color-danger));
}

.primary-btn,
.secondary-btn {
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

.primary-btn {
  border: 1px solid var(--ui-action-primary-border, var(--ui-border-selected-border, var(--border)));
  background: var(--ui-action-primary-bg, var(--accent));
  color: var(--ui-action-primary-fg, var(--ui-text-inverse-fg, var(--text)));
  box-shadow: var(--ui-action-primary-shadow, none);
}

.secondary-btn {
  border: 0;
  background: var(--ui-action-secondary-bg, var(--ui-surface-elevated-bg, var(--bg-elevated)));
  color: var(--ui-action-secondary-fg, var(--ui-text-primary-fg, var(--text)));
}

.primary-btn.compact {
  padding: 0 10px;
}

.text-btn {
  border: 0;
  background: transparent;
  color: var(--ui-accent-primary-fg, var(--accent));
  padding: 4px 2px;
  font-size: 12px;
}

.tasks-layout {
  min-height: 0;
  min-width: 0;
  display: grid;
  gap: 18px;
}

@media (min-width: 900px) {
  .tasks-layout {
    grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
    align-items: start;
  }

  .task-list {
    position: sticky;
    top: 0;
  }
}

.task-list,
.task-detail {
  min-width: 0;
  max-width: 100%;
}

.task-list {
  display: grid;
  gap: 2px;
  padding-bottom: 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-divider-border, var(--border)) 64%, transparent);
}

.task-list-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 8px 6px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-size: 11px;
  font-weight: 700;
}

.task-row {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: start;
  gap: 9px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
  padding: 9px 8px;
  text-align: left;
  cursor: pointer;
  box-shadow: inset 0 0 0 0 transparent;
  transition:
    background 0.15s ease,
    box-shadow 0.15s ease;
}

.task-row:hover {
  background: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 5%, transparent);
}

.task-row.active {
  background: var(--ui-state-active-bg, var(--active));
  box-shadow: inset 3px 0 0 var(--ui-accent-primary-fg, var(--accent));
}

.task-icon {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-text-muted-fg, var(--text-muted));
  background: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 5%, transparent);
}

.task-row.active .task-icon {
  color: var(--ui-text-primary-fg, var(--text));
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 13%, transparent);
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
  color: var(--ui-text-muted-fg, var(--text-muted));
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
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted)) 58%, transparent);
  transform: translateY(-50%);
}

.status-badge {
  --task-status-color: var(--ui-text-muted-fg, var(--text-muted));
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--task-status-color);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
}

.status-badge.hero {
  min-height: 28px;
  border-radius: var(--radius-full, 9999px);
  background: color-mix(in srgb, var(--task-status-color) 12%, transparent);
  padding: 0 10px;
  font-size: 13px;
}

.status-marker {
  width: 7px;
  height: 7px;
  border-radius: var(--radius-full, 9999px);
  background: var(--task-status-color);
}

.status-badge.hero .status-marker {
  width: 9px;
  height: 9px;
}

.status-badge.healthy {
  --task-status-color: var(--ui-status-success-fg, var(--color-success));
}

.status-badge.failed {
  --task-status-color: var(--ui-status-danger-fg, var(--color-danger));
}

.status-badge.running {
  --task-status-color: var(--ui-status-warning-fg, var(--color-warning));
}

.status-badge.scheduled {
  --task-status-color: var(--ui-status-info-fg, var(--color-info));
}

.status-badge.disabled {
  --task-status-color: var(--ui-text-muted-fg, var(--text-muted));
}

.task-detail,
.managed-section {
  display: grid;
  align-content: start;
}

.managed-section {
  gap: 22px;
  margin-top: 8px;
  border-top: 1px solid color-mix(in srgb, var(--ui-border-divider-border, var(--border)) 76%, transparent);
  padding: 28px 0 0;
}

.task-detail {
  gap: 24px;
  padding: 2px 0 0;
}

.task-overview {
  display: grid;
  gap: 12px;
  padding: 6px 2px 0;
}

.overview-main {
  min-width: 0;
  display: grid;
  gap: 7px;
}

.overview-kicker {
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-size: 11px;
  font-weight: 750;
  line-height: 1.2;
  text-transform: uppercase;
}

.overview-main p {
  margin: 0;
  max-width: 760px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.status-action-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-divider-border, var(--border)) 58%, transparent);
  padding: 0 2px 18px;
}

.status-focus {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
}

.status-focus > div {
  min-width: 0;
}

.status-focus strong {
  display: block;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 15px;
  line-height: 1.25;
}

.status-focus strong.health-danger {
  color: var(--ui-status-danger-fg, var(--color-danger));
}

.status-focus p {
  margin: 3px 0 0;
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.overview-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.runtime-section {
  display: grid;
  gap: 12px;
  border-top: 1px solid color-mix(in srgb, var(--ui-border-divider-border, var(--border)) 50%, transparent);
  padding: 18px 2px 0;
}

.section-block-heading {
  min-width: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
}

.section-block-heading span {
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0;
  line-height: 1.2;
  text-transform: uppercase;
}

.section-block-heading strong {
  min-width: 0;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 13px;
  line-height: 1.3;
  overflow-wrap: anywhere;
  text-align: right;
}

.runtime-grid {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.runtime-grid div {
  min-width: 0;
  display: grid;
  gap: 5px;
  padding: 2px 0;
}

.runtime-grid dt {
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-size: 12px;
}

.runtime-grid dd {
  margin: 0;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 14px;
  font-weight: 650;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.overview-prompt {
  margin: 0;
  max-width: 760px;
  padding: 0 2px;
  color: var(--ui-text-muted-fg, var(--text-muted));
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
  border: 1px solid transparent;
  border-radius: 7px;
  background: var(--ui-surface-input-bg, var(--ui-surface-app-bg, var(--bg)));
  color: var(--ui-text-primary-fg, var(--text));
  padding: 8px 9px;
  font-size: 13px;
}

.field:focus {
  outline: none;
  border-color: var(--ui-border-focus-border, var(--ui-border-selected-border, var(--border)));
  background: var(--ui-surface-input-focus-bg, var(--ui-surface-input-bg, var(--bg)));
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

.task-editor-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  justify-content: flex-end;
  background: color-mix(in srgb, var(--ui-surface-app-bg, var(--bg)) 72%, transparent);
  backdrop-filter: blur(12px);
}

.task-editor-dialog {
  width: min(560px, 100vw);
  min-width: 0;
  height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  border-left: 1px solid var(--ui-border-default-border, var(--border));
  background: var(--ui-surface-panel-bg, var(--bg-panel, var(--bg)));
  box-shadow: var(--ui-shadow-lg, -18px 0 56px color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 18%, transparent));
  color: var(--ui-text-primary-fg, var(--text));
}

.task-editor-dialog:focus {
  outline: none;
}

.task-editor-header,
.task-editor-footer {
  display: flex;
  align-items: center;
  gap: 12px;
}

.task-editor-header {
  justify-content: space-between;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-divider-border, var(--border)) 64%, transparent);
  padding: 18px 18px 16px;
}

.task-editor-header > div {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.task-editor-header h3,
.task-editor-header p {
  margin: 0;
}

.task-editor-header h3 {
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 18px;
  font-weight: 750;
  line-height: 1.25;
}

.task-editor-header p {
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-size: 12px;
  line-height: 1.4;
}

.task-editor-body {
  min-width: 0;
  min-height: 0;
  display: grid;
  align-content: start;
  gap: 14px;
  padding: 18px;
  overflow: auto;
}

.task-editor-footer {
  justify-content: flex-end;
  border-top: 1px solid color-mix(in srgb, var(--ui-border-divider-border, var(--border)) 64%, transparent);
  background: color-mix(in srgb, var(--ui-surface-panel-bg, var(--bg-panel, var(--bg))) 94%, transparent);
  padding: 14px 18px 18px;
}

.managed-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
}

.managed-head h4,
.managed-head p {
  margin: 0;
}

.managed-head h4 {
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 15px;
  font-weight: 720;
  line-height: 1.3;
}

.managed-head p {
  margin-top: 3px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-size: 12px;
}

.config-stack,
.config-group {
  display: grid;
}

.config-stack {
  gap: 28px;
}

.config-group {
  gap: 12px;
}

.config-section-head {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 0 12px;
}

.config-section-head::after {
  content: '';
  height: 1px;
  background: color-mix(in srgb, var(--ui-border-divider-border, var(--border)) 58%, transparent);
}

.config-section-head h5 {
  margin: 0;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 13px;
  font-weight: 700;
  line-height: 1.25;
}

.config-body {
  display: grid;
  gap: 10px;
  padding: 0;
}

.config-rows {
  display: grid;
  gap: 9px;
  max-width: 580px;
}

.config-row,
.config-field {
  align-items: center;
  gap: 12px;
}

.config-row {
  grid-template-columns: minmax(120px, 0.42fr) minmax(0, 1fr);
}

.config-row > .field {
  max-width: 360px;
}

.config-switch {
  min-height: 32px;
}

.config-switch input {
  justify-self: start;
}

.config-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(190px, 1fr));
  gap: 10px 18px;
  max-width: 760px;
}

.config-field {
  grid-template-columns: minmax(0, 1fr) minmax(86px, 128px);
}

.config-row > span,
.config-field > span {
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-size: 12px;
}

.source-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(180px, 1fr));
  gap: 8px 18px;
  max-width: 560px;
}

.source-check {
  min-height: 28px;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 12px;
}

.config-savebar {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid color-mix(in srgb, var(--ui-border-divider-border, var(--border)) 58%, transparent);
  background: color-mix(in srgb, var(--ui-surface-panel-bg, var(--bg-panel, var(--bg))) 94%, transparent);
  padding: 10px 0 0;
}

.config-savebar > span {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

input[type="checkbox"] {
  appearance: none;
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border: 1.5px solid var(--ui-border-default-border, var(--border));
  border-radius: 4px;
  background: var(--ui-surface-input-bg, var(--ui-surface-app-bg, var(--bg)));
  cursor: pointer;
  position: relative;
  flex-shrink: 0;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

input[type="checkbox"]:checked {
  background: var(--ui-action-primary-bg, var(--accent));
  border-color: var(--ui-action-primary-bg, var(--accent));
}

input[type="checkbox"]:checked::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 1px;
  width: 5px;
  height: 9px;
  border: solid var(--ui-action-primary-fg, var(--ui-text-inverse-fg, #fff));
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

input[type="checkbox"]:focus-visible {
  outline: 2px solid var(--ui-border-focus-border, var(--ui-border-selected-border, var(--accent)));
  outline-offset: 1px;
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
  border-top: 1px solid color-mix(in srgb, var(--ui-border-divider-border, var(--border)) 50%, transparent);
  padding: 18px 2px 0;
}

.history-toggle {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
  padding: 8px 6px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}

.history-toggle:hover {
  background: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 5%, transparent);
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
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-toggle > span:last-child {
  color: var(--ui-accent-primary-fg, var(--accent));
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
  color: var(--ui-text-primary-fg, var(--text));
  padding: 8px 6px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}

.run-row:hover {
  background: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 5%, transparent);
}

.run-row.active {
  background: var(--ui-state-active-bg, var(--active));
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
  background: var(--ui-text-muted-fg, var(--text-muted));
  margin-top: 5px;
  order: 1;
}

.status-dot.succeeded {
  background: var(--ui-status-success-fg, var(--color-success));
}

.status-dot.failed,
.status-dot.blocked {
  background: var(--ui-status-danger-fg, var(--color-danger));
}

.status-dot.running {
  background: var(--ui-status-warning-fg, var(--color-warning));
}

.run-detail {
  border-top: 1px solid var(--ui-border-default-border, var(--border));
  padding-top: 10px;
}

.trace-row {
  min-width: 0;
  max-width: 100%;
  display: grid;
  gap: 4px;
  border-left: 2px solid color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted)) 22%, transparent);
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
  padding: 3px 0 3px 10px;
}

.result-preview,
.notice {
  border: 0;
  border-radius: 7px;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
  padding: 9px;
  margin: 0;
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.notice.error {
  background: var(--ui-status-danger-bg, var(--ui-surface-elevated-bg, var(--bg-elevated)));
  color: var(--ui-status-danger-fg, var(--color-danger));
}

.trace-row code {
  min-width: 0;
  max-height: 96px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-size: 11px;
  line-height: 1.45;
}

.empty-state {
  min-height: 180px;
  display: grid;
  place-items: center;
  gap: 10px;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.spinning {
  animation: spin 0.8s linear infinite;
}

@media (max-width: 760px) {
  .tasks-panel {
    padding: 16px 14px 22px;
  }

  .task-overview {
    grid-template-columns: minmax(0, 1fr);
  }

  .status-action-panel {
    grid-template-columns: minmax(0, 1fr);
  }

  .overview-actions {
    justify-content: flex-start;
  }

  .runtime-grid,
  .config-grid,
  .source-list {
    grid-template-columns: minmax(0, 1fr);
  }

  .section-block-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 5px;
  }

  .section-block-heading strong {
    text-align: left;
  }

  .config-row,
  .config-field {
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
  }

  .config-row > .field,
  .config-field > .field {
    max-width: none;
  }
}

@media (max-width: 520px) {
  .tasks-header {
    align-items: flex-start;
  }

  .header-actions,
  .overview-actions {
    gap: 6px;
  }

  .task-row {
    grid-template-columns: 28px minmax(0, 1fr);
  }

  .task-row > .status-badge {
    grid-column: 2;
  }

  .secondary-btn span,
  .primary-btn.compact span {
    display: none;
  }

  .status-focus {
    grid-template-columns: minmax(0, 1fr);
  }

  .config-savebar {
    align-items: stretch;
    flex-direction: column;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
