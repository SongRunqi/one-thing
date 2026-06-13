<template>
  <SettingsSection
    title="Background Bash Jobs"
    description="Long-running services started by background bash commands. Refresh to update process status and ports."
  >
    <SettingsGroup>
      <SettingRow>
        <template #label>
          <span>Running Services</span>
        </template>
        <div class="jobs-actions">
          <Button
            unstyled
            class="btn secondary"
            :disabled="loading"
            @click="loadJobs"
          >
            <RefreshCw
              :class="{ spinning: loading }"
              :size="13"
            />
            <span>{{ loading ? 'Refreshing...' : 'Refresh' }}</span>
          </Button>
        </div>
      </SettingRow>

      <SettingsEmptyState
        v-if="!loading && jobs.length === 0"
        title="No background jobs"
        description="Background bash services will appear here after commands such as `npm run dev &`."
      />

      <div
        v-for="job in jobs"
        :key="job.id"
        class="job-card"
      >
        <div class="job-main">
          <div class="job-title">
            {{ job.command }}
          </div>
          <div class="job-meta">
            <span :class="['status', job.status]">{{ job.status }}</span>
            <span>cwd: {{ job.cwd }}</span>
            <span v-if="job.ports?.length">ports: {{ job.ports.join(', ') }}</span>
            <span v-if="job.childPids?.length">pids: {{ job.childPids.join(', ') }}</span>
          </div>
          <div
            v-if="job.logPath"
            class="job-log"
          >
            log: {{ job.logPath }}
          </div>
        </div>
        <Button
          unstyled
          class="btn danger"
          :disabled="job.status !== 'running'"
          @click="stopJob(job.id)"
        >
          Stop
        </Button>
      </div>
    </SettingsGroup>
  </SettingsSection>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { onMounted, ref } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import {
  SettingRow,
  SettingsEmptyState,
  SettingsGroup,
  SettingsSection,
} from './settings-primitives'

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

async function loadJobs() {
  loading.value = true
  try {
    const result = await window.electronAPI.listBackgroundJobs({ includeInactive: true })
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
})
</script>

<style scoped>
.jobs-actions {
  display: flex;
  justify-content: flex-end;
}

.job-card {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--ui-border-default-border, var(--border-color));
  border-radius: 8px;
  background: var(--ui-surface-panel-bg, var(--bg-secondary));
}

.job-main {
  min-width: 0;
}

.job-title {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--ui-text-primary-fg, var(--text-primary));
  word-break: break-all;
}

.job-meta,
.job-log {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--ui-text-secondary-fg, var(--text-secondary));
}

.status {
  text-transform: capitalize;
  font-weight: 600;
}

.status.running {
  color: var(--ui-status-success-fg, var(--success-color, #16a34a));
}

.status.killed,
.status.exited {
  color: var(--ui-text-secondary-fg, var(--text-secondary));
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid var(--ui-border-default-border, var(--border-color));
  border-radius: 8px;
  padding: 6px 10px;
  background: var(--ui-surface-app-bg, var(--bg-primary));
  color: var(--ui-text-primary-fg, var(--text-primary));
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.danger {
  color: var(--ui-status-danger-fg, var(--danger-color, #dc2626));
}

.spinning {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
