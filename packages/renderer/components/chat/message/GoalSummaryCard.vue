<template>
  <div
    class="goal-summary"
    :data-status="goal.status"
  >
    <span class="frame-label">GOAL<span class="st">· {{ statusLabel }}</span></span>

    <!-- v-text keeps template whitespace out of the pre-wrap content. -->
    <div
      class="objective"
      v-text="goal.objective"
    />

    <div
      v-if="goal.statusReason"
      class="reason"
    >
      <span class="reason-tag">{{ reasonTag }}</span>
      <span
        class="reason-text"
        v-text="goal.statusReason"
      />
    </div>

    <div
      v-if="visibleChanges.length"
      class="changes"
    >
      <div class="changes-head">
        <span class="changes-tag">CHANGES</span>
        <span class="head-right">
          <span class="counts"><span class="plus">+{{ totals.added }}</span> <span class="minus">−{{ totals.removed }}</span></span>
          <Button
            unstyled
            class="review-btn"
            @click="emit('review')"
          >
            <GitCompare
              :size="11"
              :stroke-width="2"
              aria-hidden="true"
            />
            <span>REVIEW</span>
          </Button>
        </span>
      </div>
      <div
        v-for="change in visibleChanges"
        :key="change.path"
        class="change-row"
      >
        <span class="change-path">{{ change.path }}</span>
        <span class="counts"><span class="plus">+{{ change.added }}</span> <span class="minus">−{{ change.removed }}</span></span>
      </div>
      <div
        v-if="hiddenChangeCount > 0"
        class="change-row more"
      >
        … {{ hiddenChangeCount }} more files
      </div>
    </div>

    <div class="meta">
      <span>RUN {{ goal.continuationCount }}</span>
      <span>CAP {{ capLabel }}</span>
      <span v-if="goal.tokensUsed">USED {{ tokensLabel }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { GitCompare } from 'lucide-vue-next'
import Button from '@/components/common/Button.vue'
import type { SessionGoal } from '@/types'

const props = defineProps<{
  goal: SessionGoal
}>()

const emit = defineEmits<{
  review: []
}>()

const statusLabel = computed(() => props.goal.status.replace('_', ' ').toUpperCase())

const reasonTag = computed(() => {
  switch (props.goal.status) {
    case 'complete': return 'DELIVERED'
    case 'abandoned': return 'DROPPED'
    case 'paused': return 'NEEDS'
    case 'blocked': return 'BLOCKED'
    case 'budget_limited': return 'BUDGET'
    default: return 'NOTE'
  }
})

const capLabel = computed(() => {
  const budget = props.goal.tokenBudget
  if (!budget) return '∞'
  return budget >= 1000 ? `${Math.round(budget / 1000)}K` : `${budget}`
})

const tokensLabel = computed(() => {
  const used = props.goal.tokensUsed ?? 0
  return used >= 1000 ? `${Math.round(used / 1000)}K` : `${used}`
})

// Numstat ledger, filled in by main shortly after completion.
const MAX_CHANGE_ROWS = 12
const fileChanges = computed(() => props.goal.fileChanges ?? [])
const visibleChanges = computed(() => fileChanges.value.slice(0, MAX_CHANGE_ROWS))
const hiddenChangeCount = computed(() =>
  Math.max(fileChanges.value.length - MAX_CHANGE_ROWS, 0),
)
const totals = computed(() => fileChanges.value.reduce(
  (sum, change) => ({ added: sum.added + change.added, removed: sum.removed + change.removed }),
  { added: 0, removed: 0 },
))
</script>

<style scoped>
/* Same blueprint frame family as the goal declaration and the status bar:
   zero fill, one hairline, a punched legend carrying the status ink. Unlike
   the declaration this is not a bubble — the outcome belongs to the run, not
   to either speaker, so it spans the reading column. */
.goal-summary {
  --goal-ink: var(--ui-status-success-fg, var(--success-color));

  position: relative;
  margin: 14px 0 10px;
  border: 1px solid color-mix(in srgb, var(--ui-border-strong-border) 52%, transparent);
  border-radius: var(--radius-xs, 4px);
  padding: 11px 12px 9px;
}

.goal-summary[data-status='paused'],
.goal-summary[data-status='budget_limited'] {
  --goal-ink: var(--ui-status-warning-fg, var(--warning-color));
}

.goal-summary[data-status='blocked'] {
  --goal-ink: var(--ui-status-danger-fg, var(--danger-color));
}

/* 主动放弃不是故障:走淡墨,与 blocked 的朱砂告警区分开 */
.goal-summary[data-status='abandoned'] {
  --goal-ink: var(--ui-text-muted-fg);
}

.frame-label {
  position: absolute;
  top: -7px;
  left: 12px;
  z-index: 1;
  padding: 0 6px;
  background: var(--ui-surface-chat-bg);
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
  user-select: none;
}

.frame-label .st {
  margin-left: 0.75em;
  color: var(--goal-ink);
}

/* The objective is a back-reference here, not the headline — the declaration
   message upstream already carries it at full weight. */
.objective {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  line-height: 1.5;
  color: var(--ui-text-muted-fg);
  white-space: pre-wrap;
  word-break: break-word;
}

.reason {
  display: flex;
  gap: 8px;
  align-items: baseline;
  margin-top: 7px;
  padding-top: 6px;
  border-top: 1px dashed var(--ui-border-default-border, var(--border-color));
}

.reason-tag {
  flex-shrink: 0;
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 1.5px;
  color: var(--goal-ink);
}

.reason-text {
  font-size: 13px;
  line-height: 1.55;
  color: var(--ui-text-primary-fg);
  white-space: pre-wrap;
  word-break: break-word;
}

/* Numstat ledger: mono rows, ink counts, hairline top rule. */
.changes {
  margin-top: 7px;
  padding-top: 6px;
  border-top: 1px dashed var(--ui-border-default-border, var(--border-color));
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.changes-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 3px;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 1.5px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
}

.head-right {
  display: flex;
  gap: 10px;
  align-items: center;
}

.review-btn {
  display: flex;
  gap: 3px;
  align-items: center;
  padding: 1px 5px;
  border: 1px solid var(--ui-border-default-border, var(--border-color));
  border-radius: 2px;
  font-family: var(--font-mono, monospace);
  font-size: 8.5px;
  font-weight: 600;
  letter-spacing: 1px;
  color: var(--ui-text-muted-fg);
  transition: color var(--duration-normal) var(--ease-default),
    border-color var(--duration-normal) var(--ease-default);
}

.review-btn:hover {
  border-color: currentcolor;
  color: var(--ui-text-primary-fg);
}

.change-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 1px 0;
  color: var(--ui-text-secondary-fg);
}

.change-row.more {
  color: var(--ui-text-muted-fg);
}

.change-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
  text-align: left;
}

.counts {
  flex-shrink: 0;
}

.counts .plus {
  color: var(--ui-status-success-fg, var(--success-color));
}

.counts .minus {
  color: var(--ui-status-danger-fg, var(--danger-color));
}

.meta {
  display: flex;
  gap: 14px;
  margin-top: 7px;
  padding-top: 6px;
  border-top: 1px dashed var(--ui-border-default-border, var(--border-color));
  font-family: var(--font-mono, monospace);
  font-size: 9.5px;
  letter-spacing: 1px;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-muted-fg);
}
</style>
