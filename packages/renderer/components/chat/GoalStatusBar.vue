<template>
  <Transition name="s-chip">
    <StatusChip
      v-if="goal && goal.status !== 'complete' && goal.status !== 'abandoned'"
      class="goal-chip"
      :data-status="goal.status"
      :data-retrying="isRetrying || undefined"
      label="当前目标"
      :flyout-width="300"
      aria-live="polite"
    >
      <span class="status-mark" />
      <span class="goal-chip-objective">{{ goal.objective }}</span>
      <span class="chip-num">· {{ chipStatus }}</span>

      <!-- 展开态:整行内容(含 objective / budget 就地编辑)整体进浮层,
           一个交互都不降级(composer-bands §3.2)。 -->
      <template #flyout>
        <div
          class="goal-bar"
          :data-status="goal.status"
          :data-retrying="isRetrying || undefined"
        >
          <div class="goal-head">
            <span class="goal-frame-label">GOAL</span>
            <span class="goal-frame-status">{{ frameStatus }}</span>
          </div>

          <div class="goal-summary">
            <span class="status-mark" />
            <template v-if="editingObjective">
              <input
                ref="objectiveInputRef"
                v-model="objectiveDraft"
                class="goal-edit goal-objective-input"
                :data-invalid="editError ? true : undefined"
                aria-label="edit goal objective"
                @keydown.enter="onObjectiveEnter"
                @keydown.esc.prevent="cancelEdit"
                @blur="commitObjective"
              >
              <!-- 托管式浮层:输入框本身是 `flex: 1`,套 tooltip-wrapper 会把它挤成
                   内容宽,所以只借 Tooltip 托浮层,触发元素还是输入框自己。 -->
              <Tooltip
                :trigger-el="objectiveInputRef"
                :text="editError || 'Enter to save · Esc to cancel'"
              />
            </template>
            <span
              v-else
              class="goal-objective"
              role="button"
              tabindex="0"
              @click="startObjectiveEdit"
              @keydown.enter.prevent="startObjectiveEdit"
            >{{ goal.objective }}</span>
          </div>

          <div class="goal-metrics">
            <Tooltip :text="usageTitle">
              <span class="goal-usage">
                {{ statusText }}
              </span>
            </Tooltip>

            <Tooltip
              v-if="editingBudget"
              :text="editError || 'Tokens · empty = unlimited · Enter to save'"
            >
              <input
                ref="budgetInputRef"
                v-model="budgetDraft"
                class="goal-edit goal-budget-input"
                inputmode="numeric"
                placeholder="∞"
                :data-invalid="editError ? true : undefined"
                aria-label="edit goal token budget"
                @keydown.enter="onBudgetEnter"
                @keydown.esc.prevent="cancelEdit"
                @blur="commitBudget"
              >
            </Tooltip>
            <Tooltip
              v-else
              text="Token budget — click to edit (empty = unlimited)"
            >
              <Button
                unstyled
                class="goal-btn budget"
                native-type="button"
                @click.stop="startBudgetEdit"
              >
                CAP {{ budgetLabel }}
              </Button>
            </Tooltip>

            <div class="goal-actions">
              <Tooltip
                v-if="goal.status === 'active'"
                text="Pause automatic continuation"
              >
                <Button
                  unstyled
                  class="goal-btn"
                  native-type="button"
                  @click.stop="setStatus('paused')"
                >
                  Pause
                </Button>
              </Tooltip>
              <Tooltip
                v-else
                text="Resume the goal (resets the continuation allowance)"
              >
                <Button
                  unstyled
                  class="goal-btn"
                  native-type="button"
                  @click.stop="setStatus('active')"
                >
                  Resume
                </Button>
              </Tooltip>
              <Button
                unstyled
                class="goal-btn clear"
                native-type="button"
                @click.stop="clear"
              >
                Clear
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
 * 目标 —— S 状态带成员(docs/design/composer-bands-2026-08.md §3.2)。
 *
 * E 期只换形态:收起态是 `◎ <目标名> · <进度>` 的 chip,展开态是原来的整行
 * (含 objective / budget 就地编辑)整体进浮层。显隐条件与提交逻辑逐字不变。
 */
import Button from '@/components/common/Button.vue'
import StatusChip from '@/components/common/StatusChip.vue'
import Tooltip from '@/components/common/Tooltip.vue'
import { computed, nextTick, ref, watch } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { platformApi } from '@/platform'
import type { SessionGoal } from '@/types'

const props = defineProps<{
  sessionId: string
}>()

const sessionsStore = useSessionsStore()

const goal = computed(() => sessionsStore.sessionGoals.get(props.sessionId) ?? null)

// ── Inline editing state (objective / token budget) ─────────
// Declared before the immediate watch below, which calls cancelEdit() during
// setup — `let` bindings after the watch would still be in the TDZ there.

const editingObjective = ref(false)
const editingBudget = ref(false)
const objectiveDraft = ref('')
const budgetDraft = ref('')
const editError = ref('')
const objectiveInputRef = ref<HTMLInputElement | null>(null)
const budgetInputRef = ref<HTMLInputElement | null>(null)
// Enter commits and then blur fires on the same input; cancelling via Esc
// also blurs. Both would double-run the async commit without these guards.
let commitInFlight = false
let cancelling = false

const budgetLabel = computed(() => {
  const budget = goal.value?.tokenBudget
  if (!budget) return '∞'
  return budget >= 1000 ? `${Math.round(budget / 1000)}K` : `${budget}`
})

function startObjectiveEdit() {
  if (!goal.value) return
  objectiveDraft.value = goal.value.objective
  editError.value = ''
  editingObjective.value = true
  void nextTick(() => {
    objectiveInputRef.value?.focus()
    objectiveInputRef.value?.select()
  })
}

function startBudgetEdit() {
  if (!goal.value) return
  budgetDraft.value = goal.value.tokenBudget ? String(goal.value.tokenBudget) : ''
  editError.value = ''
  editingBudget.value = true
  void nextTick(() => {
    budgetInputRef.value?.focus()
    budgetInputRef.value?.select()
  })
}

// Enter while an IME composition is open confirms the candidate text, not the
// edit — commit only on a real Enter (keyCode 229 covers engines that fire the
// key event before isComposing is set).
function onObjectiveEnter(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  void commitObjective()
}

function onBudgetEnter(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  void commitBudget()
}

function cancelEdit() {
  cancelling = true
  editingObjective.value = false
  editingBudget.value = false
  editError.value = ''
  queueMicrotask(() => {
    cancelling = false
  })
}

watch(
  () => props.sessionId,
  (sessionId) => {
    // A pending inline edit belongs to the previous session's goal.
    cancelEdit()
    if (sessionId && !sessionsStore.sessionGoals.has(sessionId)) {
      void sessionsStore.fetchGoal(sessionId)
    }
  },
  { immediate: true },
)

const isRetrying = computed(
  () => goal.value?.status === 'active' && (goal.value.errorRetryCount ?? 0) > 0,
)

const frameStatus = computed(() => {
  const value = goal.value
  if (!value) return ''
  if (isRetrying.value) return 'RETRYING'
  return value.status.replace('_', ' ').toUpperCase()
})

const statusText = computed(() => {
  const value = goal.value
  if (!value) return ''
  const used = value.tokensUsed >= 1000
    ? `${Math.round(value.tokensUsed / 1000)}k`
    : `${value.tokensUsed}`
  const label = value.status === 'active'
    ? isRetrying.value
      ? `retry ${value.errorRetryCount}`
      : `run ${value.continuationCount}`
    : value.status.replace('_', ' ')
  return `${label} · ${used} tok`
})

/**
 * 收起态只留一格进度:接力轮次(或重试次数),状态非 active 时是状态词本身。
 * 用量 / 预算这类要读数字的信息留在浮层 —— chip 是一眼扫过的东西。
 */
const chipStatus = computed(() => {
  const value = goal.value
  if (!value) return ''
  if (isRetrying.value) return `retry ${value.errorRetryCount}`
  if (value.status === 'active') return `run ${value.continuationCount}`
  return value.status.replace('_', ' ')
})

const usageTitle = computed(() => {
  const value = goal.value
  if (!value) return ''
  return [
    `status: ${value.status}${value.statusReason ? ` (${value.statusReason})` : ''}`,
    `tokens used: ${value.tokensUsed}`,
    `budget: ${value.tokenBudget ?? 'unlimited'}`,
    `auto continuations: ${value.continuationCount}`,
  ].join('\n')
})

async function setStatus(status: 'active' | 'paused') {
  await platformApi.goalSet({ sessionId: props.sessionId, action: 'update', status })
}

async function clear() {
  await platformApi.goalSet({ sessionId: props.sessionId, action: 'clear' })
}

async function applyGoalUpdate(
  patch: { objective?: string; tokenBudget?: number | null },
): Promise<boolean> {
  const result = await platformApi.goalSet({
    sessionId: props.sessionId,
    action: 'update',
    ...patch,
  })
  if (!result.success) {
    editError.value = result.error || 'Failed to update goal'
    return false
  }
  // The goal-updated event will arrive too, but apply directly so the bar
  // reflects the edit without waiting for the IPC round trip.
  if (result.goal !== undefined) {
    sessionsStore.updateSessionGoal(props.sessionId, result.goal as SessionGoal | null)
  }
  return true
}

async function commitObjective() {
  if (cancelling || commitInFlight || !editingObjective.value) return
  const value = objectiveDraft.value.trim()
  if (!value || value === goal.value?.objective) {
    editingObjective.value = false
    editError.value = ''
    return
  }
  commitInFlight = true
  try {
    if (await applyGoalUpdate({ objective: value })) {
      editingObjective.value = false
    } else {
      objectiveInputRef.value?.focus()
    }
  } finally {
    commitInFlight = false
  }
}

async function commitBudget() {
  if (cancelling || commitInFlight || !editingBudget.value) return
  const raw = budgetDraft.value.trim().toLowerCase()
  let tokenBudget: number | null
  if (raw === '' || raw === 'off' || raw === '∞') {
    tokenBudget = null
  } else if (/^\d+$/.test(raw) && Number.parseInt(raw, 10) > 0) {
    tokenBudget = Number.parseInt(raw, 10)
  } else {
    editError.value = 'Positive integer, or empty for unlimited'
    budgetInputRef.value?.focus()
    return
  }
  if (tokenBudget === (goal.value?.tokenBudget ?? null)) {
    editingBudget.value = false
    editError.value = ''
    return
  }
  commitInFlight = true
  try {
    if (await applyGoalUpdate({ tokenBudget })) {
      editingBudget.value = false
    } else {
      budgetInputRef.value?.focus()
    }
  } finally {
    commitInFlight = false
  }
}
</script>

<style scoped>
/* 收起态:壳给外形,这里只给状态墨色与省略。 */
.goal-chip {
  --goal-ink: var(--ui-status-success-fg);
}

.goal-chip[data-status='paused'],
.goal-chip[data-status='budget_limited'],
.goal-chip[data-retrying] {
  --goal-ink: var(--ui-status-warning-fg);
}

.goal-chip[data-status='blocked'] {
  --goal-ink: var(--ui-status-danger-fg);
}

.goal-chip-objective {
  min-width: 0;
  max-width: 18ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.goal-bar {
  /* Blueprint frame, matching the composer: zero fill, hairline rules. Status
     colors travel on one ink variable instead of per-element overrides. */
  --goal-ink: var(--ui-status-success-fg);

  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--ui-text-primary-fg);
  font-size: 12px;
}

.goal-bar[data-status='paused'],
.goal-bar[data-status='budget_limited'],
.goal-bar[data-retrying] {
  --goal-ink: var(--ui-status-warning-fg);
}

.goal-bar[data-status='blocked'] {
  --goal-ink: var(--ui-status-danger-fg);
}

.goal-head {
  display: flex;
  align-items: baseline;
  gap: 0.75em;
}

.goal-frame-label {
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
  user-select: none;
}

.goal-frame-status {
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--goal-ink);
  user-select: none;
}

.goal-metrics {
  display: flex;
  align-items: center;
  gap: 10px;
}

.goal-summary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

/* Drafting tick, not a traffic light: a small square in the status ink. */
.status-mark {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  background: var(--goal-ink);
}

.goal-objective {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-secondary-fg);
  cursor: text;
}

.goal-objective:hover {
  text-decoration: underline dashed;
  text-underline-offset: 3px;
  text-decoration-color: var(--ui-border-strong-border);
}

/* Inline editors: bare fields on an ink baseline, matching the frame. */
.goal-edit {
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-strong-border) 70%, transparent);
  padding: 0 0 1px;
  background: transparent;
  color: var(--ui-text-primary-fg);
  outline: none;
}

input.goal-edit:focus {
  border-bottom-color: var(--ui-accent-primary-fg);
}

.goal-edit[data-invalid] {
  border-bottom-color: var(--ui-status-danger-fg, var(--danger-color));
}

.goal-objective-input {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-family: inherit;
}

.goal-budget-input {
  flex-shrink: 0;
  width: 8ch;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  letter-spacing: 0.5px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.goal-usage {
  flex-shrink: 0;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  letter-spacing: 0.5px;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-muted-fg);
}

.goal-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  margin-left: auto;
}

/* Ink-line buttons: bare text, an underline on hover, no fills. */
.goal-btn {
  border: 0;
  padding: 2px 0;
  background: transparent;
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--ui-text-muted-fg);
  cursor: pointer;
}

.goal-btn:hover {
  color: var(--ui-text-primary-fg);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.goal-btn.clear:hover {
  color: var(--ui-status-danger-fg, var(--danger-color));
}
</style>
