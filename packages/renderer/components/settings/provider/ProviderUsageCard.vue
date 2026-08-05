<template>
  <div class="usage-card">
    <div class="usage-header">
      <div>
        <div class="usage-title-row">
          <span class="usage-title">Usage</span>
          <span class="usage-state">Official</span>
        </div>
        <div class="usage-subtitle">
          Codex account limits and credits
        </div>
      </div>
      <Button
        unstyled
        class="usage-button"
        native-type="button"
        :disabled="isLoading"
        @click="$emit('refresh')"
      >
        <RefreshCw
          :class="{ spinning: isLoading }"
          :size="13"
        />
        <span>{{ isLoading ? 'Refreshing...' : 'Refresh' }}</span>
      </Button>
    </div>

    <div
      v-if="isLoading && !usage"
      class="usage-panel"
    >
      Loading usage...
    </div>

    <ErrorNote
      v-else-if="error"
      :message="error"
    />

    <template v-else-if="usage">
      <div class="usage-metrics">
        <div class="usage-metric">
          <span>Plan</span>
          <strong>{{ planLabel }}</strong>
        </div>
        <div class="usage-metric">
          <span>Credits</span>
          <strong>{{ creditsLabel }}</strong>
        </div>
      </div>

      <div
        v-if="mainLimit?.primary || mainLimit?.secondary"
        class="limit-list"
      >
        <div
          v-if="mainLimit?.primary"
          class="limit-row"
        >
          <div class="limit-copy">
            <span>{{ windowLabel('Primary', mainLimit.primary) }}</span>
            <small>{{ resetLabel(mainLimit.primary) }}</small>
          </div>
          <div class="limit-meter">
            <div class="meter-track">
              <span :style="{ width: meterWidth(mainLimit.primary.usedPercent) }" />
            </div>
            <strong>{{ percentLabel(mainLimit.primary.usedPercent) }}</strong>
          </div>
        </div>

        <div
          v-if="mainLimit?.secondary"
          class="limit-row"
        >
          <div class="limit-copy">
            <span>{{ windowLabel('Secondary', mainLimit.secondary) }}</span>
            <small>{{ resetLabel(mainLimit.secondary) }}</small>
          </div>
          <div class="limit-meter">
            <div class="meter-track">
              <span :style="{ width: meterWidth(mainLimit.secondary.usedPercent) }" />
            </div>
            <strong>{{ percentLabel(mainLimit.secondary.usedPercent) }}</strong>
          </div>
        </div>
      </div>

      <div
        v-else
        class="usage-panel"
      >
        No rate limit windows returned.
      </div>

      <details
        v-if="additionalLimits.length > 0"
        class="additional-limits"
      >
        <summary>Additional limits ({{ additionalLimits.length }})</summary>
        <div class="additional-list">
          <div
            v-for="limit in additionalLimits"
            :key="limit.id"
            class="additional-row"
          >
            <span>{{ limit.name || limit.id }}</span>
            <small>{{ compactLimitLabel(limit) }}</small>
          </div>
        </div>
      </details>
    </template>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import ErrorNote from '@/components/common/ErrorNote.vue'
import { computed } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import type { CodexProviderUsage, CodexUsageLimit, CodexUsageWindow, ProviderUsageResponse } from '@/types'

const props = defineProps<{
  response: ProviderUsageResponse | null
  isLoading: boolean
  error: string
}>()

defineEmits<{
  (e: 'refresh'): void
}>()

const usage = computed<CodexProviderUsage | undefined>(() => props.response?.usage)
const mainLimit = computed(() => {
  return usage.value?.limits.find(limit => limit.id === 'codex') ?? usage.value?.limits[0]
})
const additionalLimits = computed(() => {
  const mainId = mainLimit.value?.id
  return usage.value?.limits.filter(limit => limit.id !== mainId) ?? []
})
const planLabel = computed(() => titleCase(usage.value?.planType || props.response?.account?.planType || 'Unknown'))
const creditsLabel = computed(() => {
  const credits = usage.value?.credits
  if (!credits) return 'Unavailable'
  if (credits.unlimited) return 'Unlimited'
  if (credits.balance) return credits.balance
  return credits.hasCredits ? 'Available' : 'No credits'
})

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ') || 'Unknown'
}

function percentLabel(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`
}

function meterWidth(value: number): string {
  return `${Math.max(0, Math.min(100, value))}%`
}

function windowLabel(prefix: string, window: CodexUsageWindow): string {
  const duration = formatDuration(window.windowSeconds)
  return duration ? `${prefix} (${duration})` : `${prefix} window`
}

function resetLabel(window: CodexUsageWindow): string {
  if (window.resetAt) {
    const date = new Date(window.resetAt * 1000)
    return `Resets ${date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })}`
  }
  const relative = formatDuration(window.resetAfterSeconds)
  return relative ? `Resets in ${relative}` : 'Reset time unavailable'
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return ''
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h`
  const days = Math.round(hours / 24)
  return `${days}d`
}

function compactLimitLabel(limit: CodexUsageLimit): string {
  const parts: string[] = []
  if (limit.primary) parts.push(`Primary ${percentLabel(limit.primary.usedPercent)}`)
  if (limit.secondary) parts.push(`Secondary ${percentLabel(limit.secondary.usedPercent)}`)
  if (limit.rateLimitReachedType) parts.push(titleCase(limit.rateLimitReachedType))
  return parts.join(' · ') || 'No window data'
}
</script>

<style scoped>
/* Usage ledger: no card chrome — hairlines carry the structure. */
.usage-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 0 0;
  border-top: 1px solid var(--settings-rule-soft, var(--ui-border-subtle-border));
  background: transparent;
  min-width: 0;
}

.usage-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.usage-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.usage-title {
  color: var(--settings-ink, var(--ui-text-primary-fg));
  font-size: 14px;
  font-weight: 620;
}

/* Outlined ring badge — no fill. */
.usage-state {
  padding: 1px 7px 2px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border));
  border-radius: 999px;
  background: transparent;
  color: var(--settings-ink-3, var(--ui-text-secondary-fg));
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
}

.usage-subtitle {
  margin-top: 3px;
  color: var(--settings-ink-3, var(--ui-text-secondary-fg));
  font-size: 12px;
}

/* Text action: mono small, hover pulls an accent underline. */
.usage-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 4px 0;
  border: none;
  background: transparent;
  color: var(--settings-ink-3, var(--ui-text-muted-fg));
  cursor: pointer;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  transition: color var(--duration-fast) var(--ease-default);
}

.usage-button:hover:not(:disabled) {
  color: var(--settings-ink, var(--ui-text-primary-fg));
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--settings-accent, var(--ui-accent-primary-fg));
}

.usage-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.spinning {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.usage-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

/* Rows separated by hairlines instead of boxed tiles. */
.usage-metric,
.usage-panel,
.limit-row,
.additional-limits {
  border: 0;
  border-bottom: 1px solid var(--settings-rule-soft, var(--ui-border-subtle-border));
  background: transparent;
}

.usage-metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 8px 0;
}

.usage-metric span,
.limit-copy small,
.additional-row small,
.usage-panel {
  color: var(--settings-ink-3, var(--ui-text-secondary-fg));
  font-size: 12px;
}

.usage-metric strong,
.limit-meter strong {
  overflow: hidden;
  color: var(--settings-ink, var(--ui-text-primary-fg));
  font-size: 13px;
  font-weight: 620;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.limit-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.limit-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.42fr);
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}

.limit-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.limit-copy span {
  color: var(--settings-ink, var(--ui-text-primary-fg));
  font-size: 13px;
  font-weight: 560;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.limit-meter {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(40px, auto);
  align-items: center;
  gap: 8px;
}

.limit-meter strong {
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

/* Meter as a drawn line: 1px hairline track, solid accent stroke for the used span. */
.meter-track {
  position: relative;
  height: 9px;
  min-width: 0;
  border-radius: 0;
  background: transparent;
}

.meter-track::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 0;
  border-top: 1px solid var(--settings-rule-soft, var(--ui-border-subtle-border));
}

.meter-track span {
  position: absolute;
  left: 0;
  top: calc(50% - 1px);
  height: 2px;
  border-radius: 0;
  background: var(--settings-accent, var(--ui-accent-primary-fg));
}

.usage-panel {
  padding: 8px 0;
}

.additional-limits {
  padding: 8px 0;
}

.additional-limits summary {
  color: var(--settings-ink, var(--ui-text-primary-fg));
  cursor: pointer;
  font-size: 13px;
  font-weight: 560;
}

.additional-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 10px;
}

.additional-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.additional-row span {
  overflow: hidden;
  color: var(--settings-ink, var(--ui-text-primary-fg));
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .usage-metrics,
  .limit-row {
    grid-template-columns: 1fr;
  }
}
</style>
