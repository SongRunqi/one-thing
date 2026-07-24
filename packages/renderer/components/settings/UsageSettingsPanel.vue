<template>
  <SettingsSection
    title="Token Usage"
    description="Per-turn LLM cost, aggregated across every provider. Subscription-billed providers (Codex, Claude Code, Copilot) show a same-model official-API cost estimate, tagged separately from real API spend."
  >
    <SettingsGroup>
      <div class="calendar-toolbar">
        <div class="month-nav">
          <button
            type="button"
            class="nav-btn"
            aria-label="Previous month"
            @click="stepMonth(-1)"
          >
            ‹
          </button>
          <span class="month-label">{{ monthLabel }}</span>
          <button
            type="button"
            class="nav-btn"
            aria-label="Next month"
            :disabled="isCurrentMonth"
            @click="stepMonth(1)"
          >
            ›
          </button>
        </div>
        <div class="month-totals">
          <span class="total-metric">
            <label>API spend</label>
            <strong>{{ formatUSD(monthTotals.apiCostUSD) }}</strong>
          </span>
          <span class="total-metric">
            <label>Subscription <em class="badge">est.</em></label>
            <strong>{{ formatUSD(monthTotals.subscriptionCostUSD) }}</strong>
          </span>
          <span class="total-metric">
            <label>Tokens</label>
            <strong>{{ formatTokens(monthTotals.tokens) }}</strong>
          </span>
        </div>
      </div>

      <div
        v-if="loading && !summary"
        class="usage-empty"
      >
        Loading usage...
      </div>

      <ErrorNote
        v-else-if="error"
        class="usage-error"
        :message="error"
      />

      <template v-else>
        <div class="weekday-row">
          <span
            v-for="day in weekdayLabels"
            :key="day"
          >{{ day }}</span>
        </div>

        <div class="calendar-grid">
          <template v-for="(cell, index) in calendarCells">
            <span
              v-if="cell === null"
              :key="`pad-${index}`"
              class="day-cell pad"
            />
            <button
              v-else
              :key="cell.key"
              type="button"
              class="day-cell"
              :class="[`l${cell.level}`, { future: cell.future, selected: cell.key === selectedKey }]"
              :disabled="cell.future"
              :title="cell.tooltip"
              @click="selectedKey = cell.key"
            >
              <em>{{ cell.dayOfMonth }}</em>
            </button>
          </template>
        </div>

        <div class="scale-legend">
          <span>less</span>
          <i
            v-for="level in 7"
            :key="level"
            :class="`l${level - 1}`"
          />
          <span>more</span>
        </div>

        <SettingsEmptyState
          v-if="monthTotals.records === 0"
          title="No usage recorded yet"
          description="Usage appears here after your next chat turn."
        />

        <div
          v-else-if="selectedBucket"
          class="day-detail"
        >
          <div class="detail-head">
            <span class="detail-date">
              {{ selectedBucket.bucketKey }}
              <small>{{ selectedBucket.records }} turns · {{ formatTokens(selectedBucket.usage.total) }} tokens</small>
            </span>
            <span class="detail-total">
              {{ formatUSD(selectedBucket.apiCostUSD + selectedBucket.subscriptionCostUSD) }}
              <small>API {{ formatUSD(selectedBucket.apiCostUSD) }} + est. {{ formatUSD(selectedBucket.subscriptionCostUSD) }}</small>
            </span>
          </div>

          <div
            v-if="selectedBucket.records === 0"
            class="usage-empty"
          >
            No usage on this day.
          </div>

          <template v-else>
            <div class="token-split">
              <span class="kv">
                <label>Input / Output</label>
                <b>{{ formatTokens(selectedBucket.usage.input) }} / {{ formatTokens(selectedBucket.usage.output) }}</b>
              </span>
              <span class="kv">
                <label>Cache read / write</label>
                <b>{{ formatTokens(selectedBucket.usage.cacheRead) }} / {{ formatTokens(selectedBucket.usage.cacheWrite) }}</b>
              </span>
              <span class="kv">
                <label>Reasoning</label>
                <b>{{ formatTokens(selectedBucket.usage.reasoning) }}</b>
              </span>
            </div>

            <div class="model-list">
              <div
                v-for="entry in selectedModels"
                :key="entry.key"
                class="model-row"
              >
                <span class="model-name">{{ entry.key }}</span>
                <span class="model-track">
                  <i :style="{ width: modelBarWidth(entry) }" />
                </span>
                <span class="model-amt">
                  {{ formatUSD(entry.apiCostUSD + entry.subscriptionCostUSD) }}<template v-if="entry.subscriptionCostUSD > 0"> est.</template>
                </span>
              </div>
            </div>

            <template v-if="selectedSources.length > 1">
              <div class="breakdown-label">
                By activity
              </div>
              <div class="model-list">
                <div
                  v-for="entry in selectedSources"
                  :key="entry.key"
                  class="model-row"
                >
                  <span class="model-name">{{ sourceLabel(entry.key) }}</span>
                  <span class="model-track">
                    <i :style="{ width: sourceBarWidth(entry) }" />
                  </span>
                  <span class="model-amt">
                    {{ formatUSD(entry.apiCostUSD + entry.subscriptionCostUSD) }}<template v-if="entry.subscriptionCostUSD > 0"> est.</template>
                  </span>
                </div>
              </div>
            </template>
          </template>
        </div>
      </template>
    </SettingsGroup>
  </SettingsSection>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import ErrorNote from '@/components/common/ErrorNote.vue'
import {
  SettingsEmptyState,
  SettingsGroup,
  SettingsSection,
} from './settings-primitives'
import { platformApi } from '@/platform'
import type { GetUsageSummaryResponse, OnethingUsageBucket, OnethingUsageBreakdownEntry } from '@/types'

const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MS_PER_DAY = 86400000
const MAX_BUCKET_COUNT = 400

interface CalendarCell {
  key: string
  dayOfMonth: number
  level: number
  future: boolean
  tooltip: string
}

const today = new Date()
const displayedYear = ref(today.getFullYear())
const displayedMonth = ref(today.getMonth())
const summary = ref<GetUsageSummaryResponse | null>(null)
const loading = ref(false)
const error = ref('')
const selectedKey = ref('')

const monthLabel = computed(
  () => `${displayedYear.value}-${String(displayedMonth.value + 1).padStart(2, '0')}`,
)

const isCurrentMonth = computed(() => {
  const now = new Date()
  return displayedYear.value === now.getFullYear() && displayedMonth.value === now.getMonth()
})

function stepMonth(delta: number): void {
  const next = new Date(displayedYear.value, displayedMonth.value + delta, 1)
  displayedYear.value = next.getFullYear()
  displayedMonth.value = next.getMonth()
}

function dayKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Trailing day-buckets end today, so request enough to reach back to the displayed month's first day. */
function bucketCountForMonth(): number {
  const monthStart = new Date(displayedYear.value, displayedMonth.value, 1)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((todayStart.getTime() - monthStart.getTime()) / MS_PER_DAY) + 1
  return Math.min(MAX_BUCKET_COUNT, Math.max(1, days))
}

async function loadSummary(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    summary.value = await platformApi.getUsageSummary({
      granularity: 'day',
      count: bucketCountForMonth(),
    })
    autoSelectDay()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

const monthPrefix = computed(() => `${monthLabel.value}-`)

const monthBuckets = computed<Map<string, OnethingUsageBucket>>(() => {
  const map = new Map<string, OnethingUsageBucket>()
  if (!summary.value) return map
  for (const bucket of summary.value.buckets) {
    if (bucket.bucketKey.startsWith(monthPrefix.value)) map.set(bucket.bucketKey, bucket)
  }
  return map
})

const monthTotals = computed(() => {
  let apiCostUSD = 0
  let subscriptionCostUSD = 0
  let tokens = 0
  let records = 0
  for (const bucket of monthBuckets.value.values()) {
    apiCostUSD += bucket.apiCostUSD
    subscriptionCostUSD += bucket.subscriptionCostUSD
    tokens += bucket.usage.total
    records += bucket.records
  }
  return { apiCostUSD, subscriptionCostUSD, tokens, records }
})

const maxDayCost = computed(() => {
  let max = 0
  for (const bucket of monthBuckets.value.values()) {
    max = Math.max(max, bucket.apiCostUSD + bucket.subscriptionCostUSD)
  }
  return max
})

function heatLevel(costUSD: number): number {
  if (costUSD <= 0 || maxDayCost.value <= 0) return 0
  const ratio = costUSD / maxDayCost.value
  return Math.min(6, Math.max(1, Math.ceil(ratio * 6)))
}

const calendarCells = computed<(CalendarCell | null)[]>(() => {
  const year = displayedYear.value
  const monthIndex = displayedMonth.value
  const firstWeekday = (new Date(year, monthIndex, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

  const cells: (CalendarCell | null)[] = Array.from({ length: firstWeekday }, () => null)
  for (let day = 1; day <= daysInMonth; day++) {
    const key = dayKey(year, monthIndex, day)
    const future = new Date(year, monthIndex, day).getTime() > todayStart
    const bucket = monthBuckets.value.get(key)
    const cost = bucket ? bucket.apiCostUSD + bucket.subscriptionCostUSD : 0
    cells.push({
      key,
      dayOfMonth: day,
      level: heatLevel(cost),
      future,
      tooltip: future
        ? key
        : `${key} · ${formatUSD(cost)} · ${bucket?.records ?? 0} turns`,
    })
  }
  return cells
})

function autoSelectDay(): void {
  const keys = Array.from(monthBuckets.value.keys()).sort()
  for (let i = keys.length - 1; i >= 0; i--) {
    const bucket = monthBuckets.value.get(keys[i])
    if (bucket && bucket.records > 0) {
      selectedKey.value = keys[i]
      return
    }
  }
  selectedKey.value = keys[keys.length - 1] ?? ''
}

const selectedBucket = computed<OnethingUsageBucket | null>(
  () => monthBuckets.value.get(selectedKey.value) ?? null,
)

function byCostDesc(entries: OnethingUsageBreakdownEntry[]): OnethingUsageBreakdownEntry[] {
  return [...entries].sort(
    (a, b) => (b.apiCostUSD + b.subscriptionCostUSD) - (a.apiCostUSD + a.subscriptionCostUSD),
  )
}

const selectedModels = computed<OnethingUsageBreakdownEntry[]>(() =>
  selectedBucket.value ? byCostDesc(selectedBucket.value.byModel) : [],
)

/**
 * Spend per call category. Chat is the obvious one; the rest are calls the app
 * makes on its own (title naming, memory upkeep, skill review) that are
 * otherwise invisible — this row is the only place they surface.
 */
// bySource arrives across the IPC boundary; tolerate its absence so an older
// main process (or a host that predates the breakdown) degrades to hiding the
// row rather than breaking the whole panel.
const selectedSources = computed<OnethingUsageBreakdownEntry[]>(() =>
  selectedBucket.value ? byCostDesc(selectedBucket.value.bySource ?? []) : [],
)

function barWidth(entry: OnethingUsageBreakdownEntry, scale: OnethingUsageBreakdownEntry[]): string {
  const top = scale[0]
  const max = top ? top.apiCostUSD + top.subscriptionCostUSD : 0
  if (max <= 0) return '0%'
  return `${Math.min(100, ((entry.apiCostUSD + entry.subscriptionCostUSD) / max) * 100)}%`
}

function modelBarWidth(entry: OnethingUsageBreakdownEntry): string {
  return barWidth(entry, selectedModels.value)
}

function sourceBarWidth(entry: OnethingUsageBreakdownEntry): string {
  return barWidth(entry, selectedSources.value)
}

const SOURCE_LABELS: Record<string, string> = {
  chat: 'Chat',
  title: 'Chat naming',
  memory: 'Memory',
  skill: 'Skill review',
  toc: 'Session outline',
  evals: 'Evals',
}

function sourceLabel(key: string): string {
  return SOURCE_LABELS[key] ?? key
}

function formatUSD(value: number | null | undefined): string {
  if (value == null) return '—'
  if (value === 0) return '$0.00'
  return `$${value.toFixed(value < 1 ? 4 : 2)}`
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

watch([displayedYear, displayedMonth], () => {
  void loadSummary()
})

onMounted(() => {
  void loadSummary()
})
</script>

<style scoped>
.calendar-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 6px 0 12px;
  border-bottom: 1px solid var(--settings-rule-soft, var(--ui-border-subtle-border, var(--border-subtle)));
}

.month-nav {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.nav-btn {
  width: 22px;
  height: 22px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  background: transparent;
  color: var(--settings-ink-3, var(--ui-text-secondary-fg, var(--text-secondary)));
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
}

.nav-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.month-label {
  min-width: 62px;
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  font-family: var(--font-mono, monospace);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.month-totals {
  display: flex;
  gap: 18px;
}

.total-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.total-metric label {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--settings-ink-3, var(--ui-text-secondary-fg, var(--text-secondary)));
  font-size: 11px;
}

.total-metric strong {
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  font-family: var(--font-mono, monospace);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  font-weight: 620;
}

.badge {
  padding: 0 4px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  border-radius: 999px;
  font-size: 9px;
  font-style: normal;
  line-height: 1.5;
}

.usage-empty {
  padding: 8px 0;
  font-size: 12px;
  color: var(--settings-ink-3, var(--ui-text-secondary-fg, var(--text-secondary)));
}

.usage-error {
  margin: 8px 0;
}

/* ── heat calendar ── */
.weekday-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  padding: 10px 0 5px;
}

.weekday-row span {
  color: var(--settings-ink-3, var(--ui-text-secondary-fg, var(--text-secondary)));
  font-size: 10px;
  text-align: center;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.day-cell {
  position: relative;
  display: flex;
  align-items: flex-start;
  aspect-ratio: 1.7;
  padding: 2px 4px;
  border: 1px solid transparent;
  background: color-mix(in oklab, var(--settings-ink, var(--ui-text-primary-fg, var(--text))) 4%, transparent);
  cursor: pointer;
  font: inherit;
}

.day-cell.pad {
  visibility: hidden;
}

.day-cell em {
  color: var(--settings-ink-3, var(--ui-text-secondary-fg, var(--text-secondary)));
  font-family: var(--font-mono, monospace);
  font-size: 9.5px;
  font-style: normal;
}

.day-cell.l1 { background: color-mix(in oklab, var(--settings-accent, var(--ui-accent-primary-fg, var(--accent))) 15%, var(--settings-bg, var(--ui-surface-base-bg, var(--bg)))); }
.day-cell.l2 { background: color-mix(in oklab, var(--settings-accent, var(--ui-accent-primary-fg, var(--accent))) 30%, var(--settings-bg, var(--ui-surface-base-bg, var(--bg)))); }
.day-cell.l3 { background: color-mix(in oklab, var(--settings-accent, var(--ui-accent-primary-fg, var(--accent))) 46%, var(--settings-bg, var(--ui-surface-base-bg, var(--bg)))); }
.day-cell.l4 { background: color-mix(in oklab, var(--settings-accent, var(--ui-accent-primary-fg, var(--accent))) 62%, var(--settings-bg, var(--ui-surface-base-bg, var(--bg)))); }
.day-cell.l5 { background: color-mix(in oklab, var(--settings-accent, var(--ui-accent-primary-fg, var(--accent))) 80%, var(--settings-bg, var(--ui-surface-base-bg, var(--bg)))); }
.day-cell.l6 { background: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent))); }

.day-cell.l1 em,
.day-cell.l2 em {
  color: var(--settings-ink-2, var(--ui-text-primary-fg, var(--text)));
}

.day-cell.l3 em,
.day-cell.l4 em,
.day-cell.l5 em,
.day-cell.l6 em {
  color: var(--settings-bg, var(--ui-surface-base-bg, var(--bg)));
}

.day-cell.future {
  background: repeating-linear-gradient(
    -45deg,
    transparent 0 3px,
    var(--settings-rule-soft, var(--ui-border-subtle-border, var(--border-subtle))) 3px 4px
  );
  cursor: default;
}

.day-cell:not(.future):not(.pad):hover {
  border-color: var(--settings-ink-3, var(--ui-text-secondary-fg, var(--text-secondary)));
}

.day-cell.selected {
  border-color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  box-shadow: 0 0 0 1px var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
}

.scale-legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  padding: 7px 0 10px;
  color: var(--settings-ink-3, var(--ui-text-secondary-fg, var(--text-secondary)));
  font-size: 10px;
}

.scale-legend i {
  width: 14px;
  height: 8px;
}

.scale-legend i.l0 { background: color-mix(in oklab, var(--settings-ink, var(--ui-text-primary-fg, var(--text))) 4%, transparent); }
.scale-legend i.l1 { background: color-mix(in oklab, var(--settings-accent, var(--ui-accent-primary-fg, var(--accent))) 15%, var(--settings-bg, var(--ui-surface-base-bg, var(--bg)))); }
.scale-legend i.l2 { background: color-mix(in oklab, var(--settings-accent, var(--ui-accent-primary-fg, var(--accent))) 30%, var(--settings-bg, var(--ui-surface-base-bg, var(--bg)))); }
.scale-legend i.l3 { background: color-mix(in oklab, var(--settings-accent, var(--ui-accent-primary-fg, var(--accent))) 46%, var(--settings-bg, var(--ui-surface-base-bg, var(--bg)))); }
.scale-legend i.l4 { background: color-mix(in oklab, var(--settings-accent, var(--ui-accent-primary-fg, var(--accent))) 62%, var(--settings-bg, var(--ui-surface-base-bg, var(--bg)))); }
.scale-legend i.l5 { background: color-mix(in oklab, var(--settings-accent, var(--ui-accent-primary-fg, var(--accent))) 80%, var(--settings-bg, var(--ui-surface-base-bg, var(--bg)))); }
.scale-legend i.l6 { background: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent))); }

/* ── selected day detail ── */
.day-detail {
  padding-top: 10px;
  border-top: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
}

.detail-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
}

.detail-date {
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  font-family: var(--font-mono, monospace);
  font-size: 12.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.detail-date small,
.detail-total small {
  margin-left: 6px;
  color: var(--settings-ink-3, var(--ui-text-secondary-fg, var(--text-secondary)));
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 400;
}

.detail-total {
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  font-family: var(--font-mono, monospace);
  font-size: 14px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.token-split {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding-bottom: 12px;
}

.token-split .kv {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.token-split label {
  color: var(--settings-ink-3, var(--ui-text-secondary-fg, var(--text-secondary)));
  font-size: 10.5px;
}

.token-split b {
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* 分组小标:与账页画线风一致,mono 大写字距、淡墨 */
.breakdown-label {
  margin-top: 12px;
  margin-bottom: 5px;
  font-family: var(--type-mono-font, monospace);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-muted-fg, var(--muted));
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.model-row {
  display: grid;
  grid-template-columns: minmax(90px, 150px) minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.model-name {
  overflow: hidden;
  color: var(--settings-ink-2, var(--ui-text-primary-fg, var(--text)));
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-track {
  position: relative;
  height: 4px;
  background: color-mix(in oklab, var(--settings-ink, var(--ui-text-primary-fg, var(--text))) 6%, transparent);
}

.model-track i {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
}

.model-amt {
  color: var(--settings-ink-2, var(--ui-text-primary-fg, var(--text)));
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}
</style>
