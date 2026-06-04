<template>
  <div
    v-if="runningJobs.length > 0"
    class="background-jobs-bar"
    aria-live="polite"
  >
    <div class="jobs-summary">
      <span class="status-dot" />
      <span class="summary-text">
        {{ runningJobs.length }} background {{ runningJobs.length === 1 ? 'service' : 'services' }} running
      </span>
    </div>

    <div class="jobs-list">
      <div
        v-for="job in runningJobs"
        :key="job.id"
        class="job-chip"
        :title="jobTitle(job)"
      >
        <span class="job-command">{{ compactCommand(job.command) }}</span>
        <span
          v-if="job.ports?.length"
          class="job-ports"
        >
          :{{ job.ports.join(', :') }}
        </span>
        <button
          class="job-stop"
          type="button"
          title="Stop background service"
          @click.stop="stopJob(job.id)"
        >
          Stop
        </button>
      </div>
    </div>

    <button
      class="refresh-btn"
      type="button"
      title="Refresh background services"
      :disabled="loading"
      @click.stop="loadJobs"
    >
      Refresh
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

interface BackgroundJobView {
  id: string
  command: string
  cwd: string
  status: 'running' | 'exited' | 'killed' | 'unknown'
  childPids: number[]
  ports?: number[]
  logPath?: string
}

const jobs = ref<BackgroundJobView[]>([])
const loading = ref(false)
let refreshTimer: ReturnType<typeof setInterval> | undefined

const runningJobs = computed(() => jobs.value.filter(job => job.status === 'running'))

function compactCommand(command: string): string {
  const normalized = command.replace(/\s+/g, ' ').trim()
  return normalized.length > 36 ? `${normalized.slice(0, 33)}…` : normalized
}

function jobTitle(job: BackgroundJobView): string {
  const parts = [
    job.command,
    `cwd: ${job.cwd}`,
    job.ports?.length ? `ports: ${job.ports.join(', ')}` : '',
    job.childPids?.length ? `pids: ${job.childPids.join(', ')}` : '',
    job.logPath ? `log: ${job.logPath}` : '',
  ].filter(Boolean)
  return parts.join('\n')
}

async function loadJobs() {
  loading.value = true
  try {
    const result = await window.electronAPI.listBackgroundJobs()
    jobs.value = (result.jobs ?? []) as BackgroundJobView[]
  } finally {
    loading.value = false
  }
}

async function stopJob(jobId: string) {
  await window.electronAPI.stopBackgroundJob(jobId)
  await loadJobs()
}

onMounted(() => {
  void loadJobs()
  refreshTimer = setInterval(() => void loadJobs(), 5000)
})

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<style scoped>
.background-jobs-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  margin-bottom: 8px;
  border: 1px solid var(--ui-border-default-border, var(--border-color));
  border-radius: 12px;
  background: color-mix(in srgb, var(--ui-surface-panel-bg, var(--bg-secondary)) 86%, var(--ui-accent-primary-fg, var(--accent-color, var(--accent))) 14%);
  color: var(--ui-text-primary-fg, var(--text-primary));
  font-size: 12px;
}

.jobs-summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  font-weight: 600;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--ui-status-success-fg, var(--success-color, #16a34a));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-status-success-fg, var(--success-color, #16a34a)) 18%, transparent);
}

.jobs-list {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
  overflow: hidden;
}

.job-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 280px;
  padding: 4px 6px;
  border: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border-color)) 70%, transparent);
  border-radius: 999px;
  background: var(--ui-surface-app-bg, var(--bg-primary));
}

.job-command {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
}

.job-ports {
  color: var(--ui-accent-primary-fg, var(--accent-color, var(--accent)));
  font-weight: 600;
}

.job-stop,
.refresh-btn {
  border: 0;
  border-radius: 999px;
  padding: 3px 7px;
  background: var(--ui-surface-elevated-bg, var(--bg-tertiary, var(--bg-secondary)));
  color: var(--ui-text-secondary-fg, var(--text-secondary));
  cursor: pointer;
  font-size: 11px;
}

.job-stop {
  color: var(--ui-status-danger-fg, var(--danger-color, #dc2626));
}

.job-stop:hover,
.refresh-btn:hover:not(:disabled) {
  background: var(--ui-state-hover-bg, var(--hover-bg, rgba(0, 0, 0, 0.08)));
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
