<template>
  <div class="goal-set-row">
    <div
      class="goal-set"
      :data-status="liveGoal?.status"
      :data-retrying="isRetrying || undefined"
    >
      <span class="frame-label">GOAL<span
        v-if="statusLabel"
        class="st"
      >· {{ statusLabel }}</span></span>
      <!-- v-text keeps template whitespace out of the pre-wrap content. -->
      <div
        class="objective"
        :class="{ done: liveGoal?.status === 'complete' }"
        v-text="message.content"
      />
      <div
        v-if="liveGoal"
        class="meta"
      >
        <span>CAP {{ capLabel }}</span>
        <span>RUN {{ liveGoal.continuationCount }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMessage } from '@/types'
import { useSessionsStore } from '@/stores/sessions'

const props = defineProps<{
  message: ChatMessage
}>()

const sessionsStore = useSessionsStore()

// Link by objective text: the /goal command persists this message with the
// exact (trimmed, main-side-validated) objective, so a match means this is
// the session's live goal. After the goal is cleared or replaced the frame
// keeps rendering, just without live status — an archived declaration.
const liveGoal = computed(() => {
  const goal = sessionsStore.sessionGoals.get(props.message.sessionId || '')
  return goal && goal.objective === props.message.content ? goal : null
})

const isRetrying = computed(
  () => liveGoal.value?.status === 'active' && (liveGoal.value.errorRetryCount ?? 0) > 0,
)

const statusLabel = computed(() => {
  const goal = liveGoal.value
  if (!goal) return ''
  if (isRetrying.value) return 'RETRYING'
  return goal.status.replace('_', ' ').toUpperCase()
})

const capLabel = computed(() => {
  const budget = liveGoal.value?.tokenBudget
  if (!budget) return '∞'
  return budget >= 1000 ? `${Math.round(budget / 1000)}K` : `${budget}`
})

// The outcome — the model's reason and the numstat ledger — is NOT rendered
// here: this message is where the goal was declared, and a delivery summary
// hanging off the opening statement reads as a claim made before the work.
// GoalSummaryCard carries it, anchored after the reply that ended the run.
</script>

<style scoped>
.goal-set-row {
  display: flex;
  justify-content: flex-end;
  margin: 10px 0 4px;
}

/* Same blueprint frame family as the composer and the goal status bar:
   zero fill, one hairline, a punched legend carrying the status ink. */
.goal-set {
  --goal-ink: var(--ui-status-success-fg, var(--success-color, #16a34a));

  position: relative;
  max-width: 85%;
  min-width: 46%;
  border: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 52%, transparent);
  border-radius: var(--radius-xs, 4px);
  padding: 10px 12px 8px;
}

.goal-set[data-status='paused'],
.goal-set[data-status='budget_limited'],
.goal-set[data-retrying] {
  --goal-ink: var(--ui-status-warning-fg, var(--warning-color, #d97706));
}

.goal-set[data-status='blocked'] {
  --goal-ink: var(--ui-status-danger-fg, var(--danger-color, #b3403a));
}

.goal-set[data-status='complete'] {
  --goal-ink: var(--ui-text-muted-fg, var(--muted));
}

.frame-label {
  position: absolute;
  top: -7px;
  left: 12px;
  z-index: 1;
  padding: 0 6px;
  background: var(--ui-surface-chat-bg, var(--bg-chat, var(--bg)));
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  user-select: none;
}

.frame-label .st {
  margin-left: 0.75em;
  color: var(--goal-ink);
}

.objective {
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--ui-text-primary-fg, var(--text-primary));
  white-space: pre-wrap;
  word-break: break-word;
}

.objective.done {
  text-decoration: line-through;
  text-decoration-color: var(--ui-text-muted-fg, var(--muted));
  color: var(--ui-text-muted-fg, var(--muted));
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
  color: var(--ui-text-muted-fg, var(--muted));
}
</style>
