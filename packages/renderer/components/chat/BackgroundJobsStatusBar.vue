<template>
  <Transition name="s-chip">
    <!-- data-ambient-anchor:氛围层地标(L0)。chip 在场即可落雪,离场即缺席
         —— 惰性 attribute,零逻辑。 -->
    <StatusChip
      v-if="runningJobs.length > 0"
      class="background-jobs-chip"
      data-ambient-anchor="status.chip"
      label="后台任务"
      :flyout-width="280"
      aria-live="polite"
    >
      <span
        class="chip-glyph"
        aria-hidden="true"
      >⚙</span>
      <span class="chip-num">{{ runningJobs.length }}</span>
      <span>{{ runningJobs.length === 1 ? 'job' : 'jobs' }}</span>

      <!-- 展开态就是原来的整行内容:逐 job + 端口 + 停止 + 刷新,
           一个交互都没降级(composer-bands §3.2)。 -->
      <template #flyout>
        <div class="background-jobs-bar">
          <div class="jobs-summary">
            <span class="status-dot" />
            <span class="summary-text">
              {{ runningJobs.length }} background {{ runningJobs.length === 1 ? 'service' : 'services' }} running
            </span>
            <Button
              unstyled
              class="refresh-btn"
              native-type="button"
              :disabled="loading"
              @click.stop="loadJobs"
            >
              Refresh
            </Button>
          </div>

          <div class="jobs-list">
            <div
              v-for="job in runningJobs"
              :key="job.id"
              class="job-chip"
            >
              <span class="job-command">{{ compactCommand(job.command) }}</span>
              <span
                v-if="job.ports?.length"
                class="job-ports"
              >
                :{{ job.ports.join(', :') }}
              </span>
              <Button
                unstyled
                class="job-stop"
                native-type="button"
                @click.stop="stopJob(job.id)"
              >
                Stop
              </Button>
            </div>
          </div>
        </div>
      </template>
    </StatusChip>
  </Transition>
</template>

<script setup lang="ts">
/**
 * 后台任务 —— S 状态带成员(docs/design/composer-bands-2026-08.md §3.2)。
 *
 * E 期只换形态:收起态是 `⚙ N jobs` 的 chip,展开态是原来的整行内容整体
 * 搬进浮层。`v-if running > 0` 的显隐语义与轮询逐字不变。
 */
import Button from '@/components/common/Button.vue'
import StatusChip from '@/components/common/StatusChip.vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { platformApi } from '@/platform'

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

async function loadJobs() {
  loading.value = true
  try {
    const result = await platformApi.listBackgroundJobs()
    jobs.value = (result.jobs ?? []) as BackgroundJobView[]
  } finally {
    loading.value = false
  }
}

async function stopJob(jobId: string) {
  await platformApi.stopBackgroundJob(jobId)
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
/* 收起态的字形:壳只管外形,语义符号归成员自己。 */
.chip-glyph {
  font-size: 11px;
  line-height: 1;
  opacity: 0.9;
}

.status-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--ui-status-success-fg);
}

.background-jobs-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--ui-text-primary-fg);
  font-size: 12px;
}

.jobs-summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  font-weight: 600;
}

.summary-text {
  flex: 1;
  min-width: 0;
}

.jobs-list {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  min-width: 0;
}

.job-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid color-mix(in srgb, var(--ui-border-default-border) 70%, transparent);
  border-radius: var(--radius-xs);
  background: var(--ui-surface-app-bg);
}

.job-command {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono, monospace);
}

.job-ports {
  color: var(--ui-accent-primary-fg);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.job-stop,
.refresh-btn {
  flex-shrink: 0;
  border: 1px solid color-mix(in srgb, var(--ui-border-default-border) 70%, transparent);
  border-radius: var(--radius-xs);
  padding: 2px 8px;
  background: transparent;
  color: var(--ui-text-muted-fg);
  cursor: pointer;
  font-size: 11px;
  transition:
    color var(--duration-fast) var(--ease-default),
    border-color var(--duration-fast) var(--ease-default);
}

.job-stop:hover {
  color: var(--ui-status-danger-fg);
  border-color: var(--ui-status-danger-fg);
}

.refresh-btn:hover:not(:disabled) {
  color: var(--ui-text-primary-fg);
  border-color: var(--ui-border-strong-border);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
