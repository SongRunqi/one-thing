/**
 * Goal subsystem IPC types.
 *
 * SessionGoal is a structural mirror of
 * `packages/onething-runtime/src/goals/types.ts` (same pattern as
 * ContextVariable, which is duplicated in chat.ts). The runtime package owns
 * the canonical definition and all state transitions; these types only cross
 * the IPC boundary.
 *
 * Three RPCs:
 *   - GOAL_GET   : pull the current goal for a session
 *   - GOAL_SET   : create / update (pause, resume, edit, budget) / clear
 *   - GOAL_DIFFS : the goal's file changes with full patches, for review
 *
 * Live updates flow through the `session:goal-updated` event on
 * SESSION_EVENT, so renderer code only needs GET for the initial fetch.
 */

export type SessionGoalStatus =
  | 'active'
  | 'paused'
  | 'blocked'
  | 'budget_limited'
  | 'complete'

export interface SessionGoal {
  id: string
  objective: string
  status: SessionGoalStatus
  tokenBudget?: number
  tokensUsed: number
  timeUsedSeconds: number
  continuationCount: number
  /** Consecutive failed runs being retried; cleared on success or resume. */
  errorRetryCount?: number
  budgetLimitReported?: boolean
  statusReason?: string
  /** Net file changes filled in at completion (numstat table). */
  fileChanges?: Array<{ path: string; added: number; removed: number }>
  createdAt: number
  updatedAt: number
}

export interface GoalGetRequest {
  sessionId: string
}

export interface GoalGetResponse {
  success: boolean
  goal?: SessionGoal | null
  error?: string
}

export type GoalSetAction = 'create' | 'update' | 'clear'

export interface GoalSetRequest {
  sessionId: string
  action: GoalSetAction
  /** create: required. update: replaces the objective when present. */
  objective?: string
  /** update only — pause/resume. Other statuses belong to the model/system. */
  status?: 'active' | 'paused'
  /** null clears the per-goal budget back to the global default cap. */
  tokenBudget?: number | null
}

export interface GoalSetResponse {
  success: boolean
  goal?: SessionGoal | null
  error?: string
}

/**
 * One file's net change over the goal, with the patch to review it. Same file
 * set as `SessionGoal.fileChanges` — that is the numstat projection of this.
 */
export interface GoalFileDiff {
  /** Workspace-relative when it sits under the session's working directory. */
  path: string
  absolutePath: string
  added: number
  removed: number
  created: boolean
  deleted: boolean
  /** Unified patch of the goal's net effect on the file. */
  diff: string
  /** Full sides, omitted for large files — the patch still renders. */
  beforeContent?: string
  afterContent?: string
}

export interface GoalDiffsRequest {
  sessionId: string
}

export interface GoalDiffsResponse {
  success: boolean
  /** The reviewed goal's objective/status, for the workbench header. */
  goal?: SessionGoal | null
  diffs?: GoalFileDiff[]
  error?: string
}
