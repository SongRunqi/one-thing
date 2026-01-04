/**
 * Plan Module
 * Type definitions for the planning workflow feature
 *
 * The planning workflow allows AI to:
 * 1. Decide based on task complexity whether to create a plan
 * 2. Create a structured task list (plan)
 * 3. Execute tasks step by step, updating status
 */

/**
 * Status of a plan item
 * - pending: Not yet started
 * - in_progress: Currently being worked on (only one at a time)
 * - completed: Task finished successfully
 */
export type PlanItemStatus = 'pending' | 'in_progress' | 'completed'

/**
 * A single item in the plan
 */
export interface PlanItem {
  /** Unique identifier */
  id: string
  /** Task description in imperative form (e.g., "Add authentication") */
  content: string
  /** Task description in present continuous form (e.g., "Adding authentication") */
  activeForm: string
  /** Current status */
  status: PlanItemStatus
  /** When this item was created */
  createdAt: number
  /** When this item was last updated */
  updatedAt: number
}

/**
 * A plan attached to a session
 */
export interface SessionPlan {
  /** List of plan items */
  items: PlanItem[]
  /** When the plan was created */
  createdAt: number
  /** When the plan was last updated */
  updatedAt: number
}

/**
 * IPC types for plan operations
 */
export interface UpdatePlanRequest {
  sessionId: string
  plan: SessionPlan
}

export interface UpdatePlanResponse {
  success: boolean
  plan?: SessionPlan
  error?: string
}

export interface GetPlanRequest {
  sessionId: string
}

export interface GetPlanResponse {
  success: boolean
  plan?: SessionPlan
  error?: string
}
