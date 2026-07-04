<template>
  <div class="tasks-panel">
    <header class="tasks-header">
      <div class="header-copy">
        <h2>Tasks</h2>
      </div>
      <div class="header-actions">
        <Button
          unstyled
          class="icon-btn"
          native-type="button"
          title="Refresh"
          :disabled="loading"
          @click="() => loadAll()"
        >
          <RefreshCw
            :size="16"
            :class="{ spinning: loading }"
          />
        </Button>
        <Button
          unstyled
          class="primary-btn compact"
          native-type="button"
          @click="startCreate"
        >
          <Plus :size="15" />
          <span>New Task</span>
        </Button>
      </div>
    </header>

    <div
      v-if="error"
      class="notice error"
    >
      {{ error }}
    </div>

    <div
      class="tasks-layout"
      :class="{ 'detail-active': taskDetailActive }"
    >
      <section class="task-list">
        <div class="task-list-title">
          <span>All Tasks</span>
        </div>
        <div
          v-for="task in tasks"
          :key="task.id"
          class="task-row"
          :class="{ active: selectedTaskId === task.id }"
          role="button"
          tabindex="0"
          @click="selectTask(task.id)"
          @keydown.enter.prevent="selectTask(task.id)"
          @keydown.space.prevent="selectTask(task.id)"
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
            <span class="task-title-line">
              <strong>{{ task.name || task.id }}</strong>
              <span :class="['status-badge', taskStatusClass(task)]">
                <span class="status-marker" />
                {{ taskStatusLabel(task) }}
              </span>
            </span>
            <span class="task-meta">{{ formatSchedule(task.schedule) }}</span>
            <span class="task-preview">{{ task.promptPreview || task.pluginId || task.id }}</span>
            <span class="task-foot">
              <span>{{ formatTaskLastRun(task) }}</span>
              <span>{{ taskOwnerLabel(task) }}</span>
            </span>
          </span>
          <span
            class="task-row-control"
            @click.stop
            @keydown.stop
          >
            <AppSwitch
              :model-value="task.enabled"
              size="small"
              :loading="actionId === task.id"
              :disabled="actionId === task.id || task.inFlight"
              :aria-label="`${task.name || task.id} ${task.enabled ? 'enabled' : 'disabled'}`"
              @change="value => toggleTaskEnabled(task, value)"
            />
          </span>
        </div>
        <div
          v-if="loading && tasks.length === 0"
          class="empty-state"
        >
          <CalendarClock :size="42" />
          <span>Loading scheduled tasks...</span>
        </div>
        <div
          v-else-if="!loading && tasks.length === 0"
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
        <div class="detail-header-nav">
          <Button
            unstyled
            class="back-btn icon-btn"
            native-type="button"
            title="Back to list"
            @click="taskDetailActive = false"
          >
            <ArrowLeft :size="16" />
          </Button>
          <span class="detail-nav-title">Task Details</span>
        </div>

        <section class="task-detail-head">
          <div class="task-overview">
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
          </div>

          <div class="overview-actions">
            <Button
              unstyled
              class="secondary-btn"
              native-type="button"
              title="Run now"
              :disabled="actionId === selectedTask.id || selectedTask.inFlight"
              @click="runNow(selectedTask.id)"
            >
              <Play :size="15" />
              <span>Run Now</span>
            </Button>
            <Button
              v-if="!selectedTask.readonly"
              unstyled
              class="icon-btn"
              native-type="button"
              title="Edit"
              @click="startEdit(selectedTask)"
            >
              <Pencil :size="15" />
            </Button>
            <Button
              v-if="!selectedTask.readonly"
              unstyled
              class="icon-btn danger"
              native-type="button"
              title="Delete"
              @click="deleteTask(selectedTask.id)"
            >
              <Trash2 :size="15" />
            </Button>
          </div>
        </section>

        <section class="detail-summary-strip">
          <div>
            <span>Status</span>
            <strong :class="['summary-status', taskStatusClass(selectedTask)]">
              <span class="status-marker" />
              {{ taskStatusLabel(selectedTask) }}
            </strong>
          </div>
          <div>
            <span>Next Run</span>
            <strong :title="formatMaybeDate(selectedTask.nextRunAt)">
              {{ formatShortDate(selectedTask.nextRunAt) }}
            </strong>
          </div>
          <div>
            <span>Runs</span>
            <strong>{{ taskRunCountLabel(selectedTask) }}</strong>
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
          <Button
            unstyled
            class="history-toggle"
            native-type="button"
            @click="toggleHistory"
          >
            <span>
              <strong>Run history</strong>
            </span>
            <span>{{ historyOpen ? 'Hide' : 'Show' }}</span>
          </Button>

          <div
            v-if="historyOpen"
            class="history-drawer"
          >
            <div class="section-title">
              <strong>Recent runs</strong>
              <Button
                unstyled
                class="text-btn"
                native-type="button"
                :disabled="runsLoading"
                @click="loadRuns(selectedTask.id)"
              >
                Refresh
              </Button>
            </div>

            <div class="runs-list">
              <div
                v-if="runsLoading"
                class="notice"
              >
                Loading run history...
              </div>
              <div
                v-else-if="runs.length === 0"
                class="notice"
              >
                No run history yet.
              </div>
              <div
                v-else
                class="runs-timeline"
              >
                <div
                  v-for="(run, idx) in runs"
                  :key="run.runId || `${run.taskId}-${run.startedAt}`"
                  class="timeline-run-item"
                  :class="{ active: selectedRun?.runId === run.runId }"
                >
                  <div class="timeline-trail">
                    <span
                      class="timeline-node-dot"
                      :class="run.status"
                    />
                    <div
                      v-if="idx < runs.length - 1"
                      class="timeline-node-line"
                    />
                  </div>
                  <Button
                    unstyled
                    class="timeline-run-card run-row"
                    native-type="button"
                    @click="selectedRun = selectedRun?.runId === run.runId ? null : run"
                  >
                    <div class="run-card-header">
                      <span
                        class="run-status-pill"
                        :class="run.status"
                      >{{ run.status }}</span>
                      <span class="run-card-duration">{{ formatDuration(run.durationMs) }}</span>
                    </div>
                    <div class="run-card-meta">
                      <span :title="formatMaybeDate(run.startedAt)">{{ formatShortDate(run.startedAt) }}</span>
                    </div>
                  </Button>
                </div>
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
            <Button
              v-if="selectedRun.sessionId"
              unstyled
              class="text-btn"
              native-type="button"
              @click="openRunSession(selectedRun.sessionId)"
            >
              Open session
            </Button>
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
            <Button
              unstyled
              class="text-btn"
              native-type="button"
              @click="resetDreamingForm"
            >
              Reset
            </Button>
          </div>

          <!-- Tabbed Configuration Header -->
          <div class="config-tabs segmented">
            <Button
              unstyled
              :class="{ active: configTab === 'trigger' }"
              native-type="button"
              @click="configTab = 'trigger'"
            >
              Trigger & Model
            </Button>
            <Button
              unstyled
              :class="{ active: configTab === 'limits' }"
              native-type="button"
              @click="configTab = 'limits'"
            >
              Constraints
            </Button>
            <Button
              unstyled
              :class="{ active: configTab === 'scoring' }"
              native-type="button"
              @click="configTab = 'scoring'"
            >
              Relevance
            </Button>
          </div>

          <div class="config-stack">
            <!-- TRIGGER & MODEL CONFIGURATION -->
            <section
              v-show="configTab === 'trigger'"
              class="config-group"
            >
              <div class="config-section-head">
                <h5>Basic</h5>
              </div>

              <div class="config-body">
                <div class="config-rows">
                  <label class="config-row">
                    <span class="setting-label-with-tooltip">
                      <span>Cron</span>
                      <span
                        class="tooltip-wrapper"
                        title="Cron expression detailing the dreaming run schedule."
                      >
                        <Info
                          :size="13"
                          class="info-tooltip-icon"
                        />
                      </span>
                    </span>
                    <input
                      v-model="dreamingForm.frequency"
                      class="field"
                      type="text"
                      aria-label="Dreaming cron"
                      placeholder="0 3 * * *"
                    >
                  </label>

                  <label class="config-row">
                    <span class="setting-label-with-tooltip">
                      <span>Timezone</span>
                      <span
                        class="tooltip-wrapper"
                        title="Target timezone for evaluating the cron expression."
                      >
                        <Info
                          :size="13"
                          class="info-tooltip-icon"
                        />
                      </span>
                    </span>
                    <input
                      v-model="dreamingForm.timezone"
                      class="field"
                      type="text"
                      aria-label="Dreaming timezone"
                      placeholder="System"
                    >
                  </label>
                </div>
              </div>
            </section>

            <!-- LIMITS CONFIGURATION -->
            <section
              v-show="configTab === 'limits'"
              class="config-group"
            >
              <div class="config-section-head">
                <h5>Limits</h5>
              </div>

              <div class="config-body">
                <div class="config-grid">
                  <label class="config-field">
                    <span class="setting-label-with-tooltip">
                      <span>Lookback days</span>
                      <span
                        class="tooltip-wrapper"
                        title="How many days of history to scan when dreaming."
                      >
                        <Info
                          :size="13"
                          class="info-tooltip-icon"
                        />
                      </span>
                    </span>
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
                    <span class="setting-label-with-tooltip">
                      <span>Source files</span>
                      <span
                        class="tooltip-wrapper"
                        title="Maximum number of note files to process in a single dreaming cycle."
                      >
                        <Info
                          :size="13"
                          class="info-tooltip-icon"
                        />
                      </span>
                    </span>
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
                    <span class="setting-label-with-tooltip">
                      <span>Input chars</span>
                      <span
                        class="tooltip-wrapper"
                        title="Maximum characters to process in prompt context inputs."
                      >
                        <Info
                          :size="13"
                          class="info-tooltip-icon"
                        />
                      </span>
                    </span>
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
                    <span class="setting-label-with-tooltip">
                      <span>Timeout ms</span>
                      <span
                        class="tooltip-wrapper"
                        title="Execution timeout duration in milliseconds."
                      >
                        <Info
                          :size="13"
                          class="info-tooltip-icon"
                        />
                      </span>
                    </span>
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

            <!-- SCORING CONFIGURATION -->
            <section
              v-show="configTab === 'scoring'"
              class="config-group"
            >
              <div class="config-section-head">
                <h5>Scoring</h5>
              </div>

              <div class="config-body">
                <div class="config-grid">
                  <label class="config-field">
                    <span class="setting-label-with-tooltip">
                      <span>Max promotions</span>
                      <span
                        class="tooltip-wrapper"
                        title="Limit on promoted durable profile facts per run."
                      >
                        <Info
                          :size="13"
                          class="info-tooltip-icon"
                        />
                      </span>
                    </span>
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
                    <span class="setting-label-with-tooltip">
                      <span>Min score</span>
                      <span
                        class="tooltip-wrapper"
                        title="Minimum confidence score required to qualify durable facts."
                      >
                        <Info
                          :size="13"
                          class="info-tooltip-icon"
                        />
                      </span>
                    </span>
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
                </div>
              </div>
            </section>
          </div>

          <div class="config-savebar">
            <span>{{ dreamingFormDirty ? 'Unsaved changes' : 'Memory Dreaming settings' }}</span>
            <Button
              unstyled
              class="primary-btn"
              native-type="button"
              :disabled="saving || !dreamingFormDirty"
              @click="saveManagedDreamingTask"
            >
              <Save :size="15" />
              <span>{{ saving ? 'Saving...' : 'Save Changes' }}</span>
            </Button>
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
          <Button
            unstyled
            class="icon-btn"
            native-type="button"
            title="Close"
            :disabled="saving"
            @click="cancelEdit"
          >
            <X :size="16" />
          </Button>
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
          <Button
            unstyled
            class="secondary-btn"
            native-type="button"
            :disabled="saving"
            @click="cancelEdit"
          >
            Cancel
          </Button>
          <Button
            unstyled
            class="primary-btn"
            native-type="button"
            :disabled="saving"
            @click="saveTask"
          >
            <Save :size="15" />
            <span>{{ saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Task' }}</span>
          </Button>
        </footer>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import AppSwitch from '@/components/common/Switch.vue'
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
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  X,
  ArrowLeft,
  Info,
} from 'lucide-vue-next'
import { platformApi } from '@/platform'

const agentsStore = useAgentsStore()
const settingsStore = useSettingsStore()
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
const initialized = ref(false)

const defaultTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''

const taskDetailActive = ref(false)
const configTab = ref<'trigger' | 'limits' | 'scoring'>('trigger')

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
  sources: ['daily'],
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
    current.lookbackDays !== stored.lookbackDays ||
    current.maxSourceFiles !== stored.maxSourceFiles ||
    current.maxInputChars !== stored.maxInputChars ||
    current.maxPromotions !== stored.maxPromotions ||
    current.minScore !== stored.minScore ||
    current.timeoutMs !== stored.timeoutMs
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
    sources: ['daily'],
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
      sources: ['daily'],
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
      sources: ['daily'],
    })
    const response = await getSchedulerApi().setSchedulerTaskEnabled({
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
    const task = tasks.value.find(item => item.id === taskId)
    if (isMemoryDreamingTask(task)) {
      await saveMemoryDreamingSettings({ enabled })
      resetDreamingForm()
    }
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
  if (!confirm('Delete this scheduled task? Existing run history will stay on disk.')) return
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
  const agent = agentsStore.agents.find(item => item.id === task.agentId)
  return agent?.name || task.agentId || 'Agent'
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
  gap: 16px;
  margin: 0;
  padding: 16px 16px 20px;
  overflow-x: hidden;
  overflow-y: auto;
  background: var(--ui-surface-chat-bg, var(--ui-surface-app-bg, var(--bg)));
  color: var(--ui-text-primary-fg, var(--text));
  scrollbar-width: thin;
}

.tasks-panel,
.tasks-panel * {
  box-sizing: border-box;
}

/* Custom Scrollbars */
.tasks-panel::-webkit-scrollbar,
.task-list::-webkit-scrollbar,
.task-detail::-webkit-scrollbar,
.task-editor-body::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.tasks-panel::-webkit-scrollbar-track,
.task-list::-webkit-scrollbar-track,
.task-detail::-webkit-scrollbar-track,
.task-editor-body::-webkit-scrollbar-track {
  background: transparent;
}

.tasks-panel::-webkit-scrollbar-thumb,
.task-list::-webkit-scrollbar-thumb,
.task-detail::-webkit-scrollbar-thumb,
.task-editor-body::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted)) 18%, transparent);
  border-radius: 3px;
}

.tasks-panel::-webkit-scrollbar-thumb:hover,
.task-list::-webkit-scrollbar-thumb:hover,
.task-detail::-webkit-scrollbar-thumb:hover,
.task-editor-body::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted)) 32%, transparent);
}

.tasks-header,
.header-actions,
.section-title {
  display: flex;
  align-items: center;
}

.tasks-header {
  justify-content: space-between;
  gap: 12px;
  padding: 0 0 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 7%, transparent);
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
  outline: none;
}

.icon-btn {
  width: 32px;
  height: 32px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.icon-btn:hover:not(:disabled) {
  background: var(--ui-state-hover-bg, var(--hover));
  border-color: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 10%, transparent);
  transform: translateY(-1px);
}

.icon-btn:active:not(:disabled) {
  transform: translateY(0);
}

.icon-btn:disabled,
.primary-btn:disabled,
.secondary-btn:disabled,
.text-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
  transform: none !important;
  box-shadow: none !important;
}

.icon-btn.danger {
  color: var(--ui-status-danger-fg, var(--color-danger));
}
.icon-btn.danger:hover:not(:disabled) {
  background: var(--ui-status-danger-bg, transparent);
  border-color: var(--ui-status-danger-border, var(--color-danger));
}

.primary-btn,
.secondary-btn {
  min-height: 32px;
  border-radius: 7px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 650;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.primary-btn {
  border: 1px solid var(--ui-action-primary-border, var(--ui-border-selected-border, var(--border)));
  background: var(--ui-action-primary-bg, var(--accent));
  color: var(--ui-action-primary-fg, var(--ui-text-inverse-fg, var(--text)));
  box-shadow: var(--ui-action-primary-shadow, 0 1px 2px rgba(0, 0, 0, 0.05));
}

.primary-btn:hover:not(:disabled) {
  background: var(--ui-action-primary-hover-bg, var(--ui-action-primary-bg, var(--accent)));
  border-color: var(--ui-action-primary-hover-border, var(--ui-action-primary-border, var(--border)));
  transform: translateY(-1px);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--ui-action-primary-bg, var(--accent)) 25%, transparent), 0 1px 2px rgba(0, 0, 0, 0.05);
}

.primary-btn:active:not(:disabled) {
  transform: translateY(0);
}

.secondary-btn {
  border: 1px solid color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 10%, transparent);
  background: var(--ui-action-secondary-bg, var(--ui-surface-elevated-bg, var(--bg-elevated)));
  color: var(--ui-action-secondary-fg, var(--ui-text-primary-fg, var(--text)));
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.secondary-btn:hover:not(:disabled) {
  background: var(--ui-state-hover-bg, var(--hover));
  border-color: var(--ui-border-default-border, var(--border));
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
}

.secondary-btn:active:not(:disabled) {
  transform: translateY(0);
}

.primary-btn.compact {
  padding: 0 10px;
}

.text-btn {
  border: 0;
  background: transparent;
  color: var(--ui-accent-primary-fg, var(--accent));
  padding: 4px 6px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 4px;
  transition: all 0.2s ease;
}
.text-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 8%, transparent);
}

.tasks-panel .detail-header-nav {
  display: none; /* Hidden on split views */
}

.detail-header-nav {
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 7%, transparent);
  padding: 10px 14px;
  flex-shrink: 0;
  background: var(--ui-surface-panel-bg);
}

.detail-nav-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--ui-text-primary-fg);
}

/* Configuration Tabs */
.config-tabs.segmented {
  display: flex;
  background: var(--ui-state-hover-bg);
  border: 1px solid color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 10%, transparent);
  padding: 3px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.config-tabs.segmented button {
  flex: 1;
  min-height: 28px;
  border: none;
  background: transparent;
  color: var(--ui-text-muted-fg);
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.2s ease;
}

.config-tabs.segmented button.active {
  background: var(--ui-surface-panel-bg);
  color: var(--ui-accent-primary-fg);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.config-tabs.segmented button:hover:not(.active) {
  color: var(--ui-text-primary-fg);
  background: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 4%, transparent);
}

/* Tooltip and Setting Label spacing */
.setting-label-with-tooltip {
  display: flex;
  align-items: center;
  gap: 4px;
}

.info-tooltip-icon {
  opacity: 0.45;
  color: var(--ui-text-muted-fg);
  cursor: help;
  transition: all 0.2s ease;
}

.info-tooltip-icon:hover {
  opacity: 1;
  color: var(--ui-accent-primary-fg);
}

.tasks-layout {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(220px, 0.36fr) minmax(0, 1fr);
  align-items: stretch;
  gap: clamp(16px, 2.4vw, 28px);
  position: relative;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: var(--ui-surface-chat-bg, var(--ui-surface-app-bg, var(--bg)));
}

.task-list {
  min-width: 0;
  height: 100%;
  overflow-y: auto;
  padding: 14px 0 16px clamp(10px, 2cqw, 16px);
  border-right: 0;
  background: transparent;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.task-list-title {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 0 8px 8px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.task-detail {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 10px clamp(12px, 3cqw, 24px) 24px 0;
  background: var(--ui-surface-chat-bg, var(--ui-surface-app-bg, var(--bg)));
}

.task-row {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 34px;
  align-items: start;
  gap: 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
  padding: 9px 10px;
  text-align: left;
  cursor: pointer;
  outline: none;
  transition: background 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

.task-row:hover,
.task-row:focus-visible {
  background: var(--ui-state-hover-bg, var(--hover));
  border-color: transparent;
}

.task-row.active {
  background: var(--ui-state-selected-bg, var(--bg-selected, var(--ui-state-hover-bg, var(--hover))));
  border-color: transparent;
  box-shadow: inset 2px 0 0 var(--ui-state-selected-border, var(--ui-accent-primary-fg, var(--accent)));
}

.task-row.active:hover,
.task-row.active:focus-visible {
  background: var(--ui-state-selected-hover-bg, var(--ui-state-active-bg, var(--active, var(--ui-state-hover-bg, var(--hover)))));
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
  transition: all 0.2s ease;
}

.task-row.active .task-icon {
  color: var(--ui-state-selected-border, var(--ui-accent-primary-fg, var(--accent)));
  background: color-mix(in srgb, var(--ui-state-selected-border, var(--ui-accent-primary-fg, var(--accent))) 10%, transparent);
}

.task-row-main {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.task-title-line {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-title-line strong {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.task-row-control {
  display: flex;
  justify-content: flex-end;
  padding-top: 1px;
}

.task-row-control :deep(.app-switch) {
  flex-shrink: 0;
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
  white-space: nowrap;
}

.status-marker {
  width: 7px;
  height: 7px;
  border-radius: var(--radius-full, 9999px);
  background: var(--task-status-color);
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

.summary-status.healthy {
  --task-status-color: var(--ui-status-success-fg, var(--color-success));
}

.summary-status.failed {
  --task-status-color: var(--ui-status-danger-fg, var(--color-danger));
}

.summary-status.running {
  --task-status-color: var(--ui-status-warning-fg, var(--color-warning));
}

.summary-status.scheduled {
  --task-status-color: var(--ui-status-info-fg, var(--color-info));
}

.summary-status.disabled {
  --task-status-color: var(--ui-text-muted-fg, var(--text-muted));
}

.managed-section {
  display: grid;
  align-content: start;
  gap: 16px;
  margin-top: 0;
  border: 0;
  border-top: 1px solid color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 7%, transparent);
  border-radius: 0;
  padding: 20px 0 0;
  background: transparent;
}

.task-detail {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 10px clamp(12px, 3cqw, 24px) 24px 0;
}

.task-detail-head {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 6px 0 0;
}

.task-overview {
  flex: 1 1 auto;
  min-width: 0;
  display: grid;
  gap: 12px;
  padding: 0;
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

.overview-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  max-width: 360px;
}

.detail-summary-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 110px), 1fr));
  gap: 12px;
  border-top: 1px solid color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 7%, transparent);
  border-bottom: 0;
  padding: 22px 0 8px;
}

.detail-summary-strip > div {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.detail-summary-strip span {
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
  text-transform: uppercase;
}

.detail-summary-strip strong {
  min-width: 0;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 14px;
  font-weight: 700;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-status {
  --task-status-color: var(--ui-text-muted-fg, var(--text-muted));
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--task-status-color) !important;
}

.runtime-section {
  display: grid;
  gap: 12px;
  background: transparent;
  border: 0;
  border-top: 1px solid color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 7%, transparent);
  border-radius: 0;
  padding: 24px 0 0;
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
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 120px), 1fr));
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

.task-editor-body label > span,
.config-row .setting-label-with-tooltip,
.config-field .setting-label-with-tooltip {
  font-weight: 600;
  color: var(--ui-text-secondary-fg, var(--text-secondary));
}

.field {
  min-width: 0;
  width: 100%;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: var(--ui-surface-input-bg, var(--bg-input, var(--bg)));
  color: var(--ui-text-primary-fg, var(--text));
  padding: 8px 12px;
  font-size: 13px;
  box-shadow: inset 0 1px 2.5px rgba(0, 0, 0, 0.04);
  transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.field:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--ui-border-default-border, var(--border)) 70%, var(--ui-accent-primary-fg, var(--accent)));
}

.field:focus {
  outline: none;
  border-color: var(--ui-accent-primary-fg, var(--accent)) !important;
  background: var(--ui-surface-panel-bg, var(--bg-panel, var(--bg)));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 12%, transparent), inset 0 1px 2px rgba(0, 0, 0, 0.02) !important;
}

select.field {
  appearance: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>");
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 14px;
  padding-right: 32px;
  cursor: pointer;
}

[data-theme='light'] select.field {
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555555' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>");
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
  overflow-y: auto;
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
  margin-bottom: 14px;
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
  gap: 20px;
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
  cursor: pointer;
}

.config-savebar {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 0;
  background: transparent;
  padding: 12px 0 0;
  z-index: 10;
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
  background: transparent;
  border: 0;
  border-top: 1px solid color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 7%, transparent);
  border-radius: 0;
  padding: 20px 0 0;
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
  background: var(--ui-state-selected-bg, var(--ui-state-active-bg, var(--active)));
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

/* Run History Timeline Styles */
.runs-timeline {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 4px;
  max-height: 320px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.runs-timeline::-webkit-scrollbar {
  width: 6px;
}

.runs-timeline::-webkit-scrollbar-track {
  background: transparent;
}

.runs-timeline::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted)) 18%, transparent);
  border-radius: 3px;
}

.runs-timeline::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted)) 32%, transparent);
}

.timeline-run-item {
  display: flex;
  gap: 12px;
  position: relative;
}

.timeline-trail {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 14px;
  flex-shrink: 0;
}

.timeline-node-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ui-text-muted-fg);
  margin-top: 14px;
  z-index: 2;
  transition: all 0.2s ease;
}

.timeline-node-dot.succeeded {
  background: var(--ui-status-success-fg, #10b981);
  box-shadow: 0 0 6px var(--ui-status-success-bg, transparent);
}

.timeline-node-dot.failed,
.timeline-node-dot.blocked {
  background: var(--ui-status-danger-fg, #ef4444);
  box-shadow: 0 0 6px var(--ui-status-danger-bg, transparent);
}

.timeline-node-dot.running {
  background: var(--ui-status-warning-fg, #f59e0b);
  box-shadow: 0 0 6px var(--ui-status-warning-bg, transparent);
  animation: pulse-glow 1s infinite alternate;
}

.timeline-node-line {
  width: 2px;
  flex: 1;
  background: color-mix(in srgb, var(--ui-border-default-border) 40%, transparent);
  margin-top: 4px;
  margin-bottom: -14px;
  z-index: 1;
}

.timeline-run-card {
  flex: 1;
  border: 1px solid color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 10%, transparent);
  border-radius: 8px;
  background: var(--ui-surface-panel-bg);
  padding: 10px 12px;
  cursor: pointer;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  margin-bottom: 6px;
}

.timeline-run-card:hover {
  background: var(--ui-state-hover-bg);
  border-color: var(--ui-border-default-border);
  transform: translateY(-1px);
}

.timeline-run-card:active {
  transform: translateY(0);
}

.timeline-run-item.active .timeline-run-card {
  border-color: var(--ui-state-selected-border, var(--ui-accent-primary-fg));
  background: var(--ui-state-selected-bg, var(--ui-state-active-bg));
}

.run-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.run-status-pill {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 6px;
  border-radius: 4px;
}

.run-status-pill.succeeded {
  background: var(--ui-status-success-bg, transparent);
  color: var(--ui-status-success-fg, #10b981);
}

.run-status-pill.failed,
.run-status-pill.blocked {
  background: var(--ui-status-danger-bg, transparent);
  color: var(--ui-status-danger-fg, #ef4444);
}

.run-status-pill.running {
  background: var(--ui-status-warning-bg, transparent);
  color: var(--ui-status-warning-fg, #f59e0b);
}

.run-card-duration {
  font-size: 11px;
  color: var(--ui-text-muted-fg);
}

.run-card-meta {
  font-size: 11px;
  color: var(--ui-text-secondary-fg);
}

@keyframes pulse-glow {
  from { opacity: 0.5; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1.1); }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Side mode keeps the same split layout; tiny containers fall back below. */
.mode-side .tasks-layout,
.media-panel-content.mode-side .tasks-layout {
  display: grid;
  grid-template-columns: minmax(220px, 0.36fr) minmax(0, 1fr);
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.mode-side .task-list,
.media-panel-content.mode-side .task-list {
  min-width: 0;
  height: 100%;
  position: static;
  transform: none;
  transition: none;
  border-right: none;
}

.mode-side .task-detail,
.media-panel-content.mode-side .task-detail {
  min-width: 0;
  height: 100%;
  position: static;
  transform: none;
  transition: none;
  background: var(--ui-surface-chat-bg, var(--ui-surface-app-bg, var(--bg)));
}

/* Slide stacked transitions */
.mode-side .detail-active .task-list,
.media-panel-content.mode-side .detail-active .task-list {
  transform: none;
}

.mode-side .detail-active .task-detail,
.media-panel-content.mode-side .detail-active .task-detail {
  transform: none;
}

.mode-side .tasks-panel .detail-header-nav,
.media-panel-content.mode-side .tasks-panel .detail-header-nav {
  display: none;
}

@container (max-width: 520px) {
  .tasks-layout {
    display: block;
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .task-list {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    transform: translateX(0);
    transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 1;
    border-right: none;
  }

  .task-detail {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    transform: translateX(100%);
    transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 2;
    padding: 10px clamp(14px, 4cqw, 20px) 24px;
    background: var(--ui-surface-chat-bg, var(--ui-surface-app-bg, var(--bg)));
  }

  .detail-active .task-list {
    transform: translateX(-20%);
  }

  .detail-active .task-detail {
    transform: translateX(0);
  }

  .task-detail-head {
    display: grid;
    gap: 12px;
    padding-top: 4px;
  }

  .overview-actions {
    align-items: center;
    justify-content: flex-start;
    max-width: none;
  }

  .overview-main h3 {
    overflow-wrap: break-word;
    word-break: normal;
  }

  .detail-header-nav {
    display: flex !important;
    border-bottom-color: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 7%, transparent);
    background: transparent;
    padding: 6px 0 12px;
  }
}


</style>
