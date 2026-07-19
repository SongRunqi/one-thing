/**
 * Session goals — a persistent objective that keeps the agent working across
 * turns until evidence shows it is complete (or it is blocked / out of budget).
 *
 * Modeled after codex's thread-goal extension, mapped onto onething:
 * - stored on the session object (rides the meta.json persistence path)
 * - rendered each turn through the <context-update> tail channel
 * - continuation rides the follow-up queue after the agent would stop
 *
 * Status ownership mirrors codex: the model may only mark 'complete' or
 * 'blocked' (via the goal tool); 'paused' and budget handling belong to the
 * user and the system. See docs/design/goal-system.md.
 */
export type SessionGoalStatus =
  | 'active'
  | 'paused'
  | 'blocked'
  | 'budget_limited'
  | 'complete'

export interface SessionGoal {
  id: string
  /** User-provided objective. Untrusted data: escape + tag when rendered. */
  objective: string
  status: SessionGoalStatus
  /** Optional per-goal token budget; the global default cap applies when unset. */
  tokenBudget?: number
  tokensUsed: number
  timeUsedSeconds: number
  /** Automatic continuations consumed so far (anti-runaway cap). */
  continuationCount: number
  /**
   * Consecutive failed runs since the last success (transient-error retry
   * streak). Cleared on a clean run end and on user resume.
   */
  errorRetryCount?: number
  /** True once the budget-limited wrap-up notice has been injected. */
  budgetLimitReported?: boolean
  /** Why the goal left 'active' (model-supplied reason, error message, …). */
  statusReason?: string
  /**
   * Net file changes over the goal's lifetime, filled in when the goal
   * completes (from the file-mutation audit trail; bash-side edits are not
   * tracked). Shown as the numstat table under the delivery summary.
   */
  fileChanges?: Array<{ path: string; added: number; removed: number }>
  createdAt: number
  updatedAt: number
}

/**
 * Stall detector, not a lifetime allowance: counts CONSECUTIVE continuations
 * with no intervening work. A continuation that leads to real activity
 * (more than the single stop-round before the next pause) resets the count,
 * so a large goal with many legitimate pauses never parks — only a goal
 * that keeps stopping the moment it is pushed does. Turns inside tool loops
 * are bounded separately by the chat maxTurns setting.
 */
export const DEFAULT_GOAL_CONTINUATION_LIMIT = 10

/**
 * How many consecutive failed runs (network errors, provider errors) are
 * retried with backoff before the goal trips to 'blocked'. Retries do not
 * consume the continuation allowance — they are bounded by this counter,
 * which only resets on a successful run or a user resume.
 */
export const DEFAULT_GOAL_ERROR_RETRY_LIMIT = 3

export interface SessionGoalLimits {
  continuationLimit?: number
  /**
   * Optional global cap applied when a goal has no explicit budget. Unset
   * (the default) means no token cap at all — unattended runs are still
   * bounded by the continuation limit, per-run maxTurns, and the
   * error-retry breaker.
   */
  defaultTokenBudget?: number
  errorRetryLimit?: number
}

/**
 * Statuses the model may set through the goal tool's declaration protocol:
 * complete (reason = delivery summary) and paused (reason = what it needs
 * from the user). 'blocked' is system-only — the error breaker sets it.
 */
export const GOAL_MODEL_SETTABLE_STATUSES = ['complete', 'paused'] as const
export type GoalModelSettableStatus = (typeof GOAL_MODEL_SETTABLE_STATUSES)[number]
