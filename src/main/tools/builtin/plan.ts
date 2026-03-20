/**
 * Built-in Tool: Plan
 *
 * Creates and manages a structured task list (plan) for complex tasks.
 * The AI uses this tool to:
 * 1. Create a plan for multi-step tasks
 * 2. Track progress by updating item status
 * 3. Mark items as completed when done
 */

import { z } from 'zod'
import { nanoid } from 'nanoid'
import { BrowserWindow } from 'electron'
import { Tool } from '../core/tool.js'
import { updateSessionPlan, getSession } from '../../stores/sessions.js'
import { IPC_CHANNELS } from '../../../shared/ipc/channels.js'
import type { PlanItem, SessionPlan } from '../../../shared/ipc/plan.js'

/**
 * Plan Tool Metadata
 */
export interface PlanMetadata {
  itemCount: number
  completed: number
  inProgress: number
  pending: number
  [key: string]: unknown
}

/**
 * Plan Item Input Schema (from AI)
 */
const PlanItemInput = z.object({
  content: z
    .string()
    .min(1)
    .describe('Task description in imperative form (e.g., "Add authentication", "Fix bug")'),
  status: z
    .enum(['pending', 'in_progress', 'completed'])
    .describe('Task status: pending, in_progress (only one at a time), or completed'),
  activeForm: z
    .string()
    .min(1)
    .describe('Task description in present continuous form (e.g., "Adding authentication", "Fixing bug")'),
})

/**
 * Plan Tool Parameters Schema
 */
const PlanParameters = z.object({
  todos: z
    .array(PlanItemInput)
    .min(1)
    .describe('The complete task list. Each update should include ALL tasks (existing + new).'),
})

/**
 * Plan Tool Definition
 */
export const PlanTool = Tool.define<typeof PlanParameters, PlanMetadata>('plan', {
  name: 'Plan',
  description: `Create and manage a structured task list for the current session.

Use this tool for complex tasks that require multiple steps:
- Tasks with 3+ steps
- User provides multiple requirements
- Need to track progress systematically

Rules:
- Only ONE task can be 'in_progress' at a time
- Only mark a task as 'completed' when it is FULLY done
- Each update should include the COMPLETE list (modified + unchanged items)
- Provide both 'content' (imperative) and 'activeForm' (present continuous)

Example:
{
  "todos": [
    { "content": "Add user model", "status": "completed", "activeForm": "Adding user model" },
    { "content": "Create auth middleware", "status": "in_progress", "activeForm": "Creating auth middleware" },
    { "content": "Implement login endpoint", "status": "pending", "activeForm": "Implementing login endpoint" }
  ]
}`,
  category: 'builtin',
  enabled: true,
  autoExecute: true, // Plan updates are safe, no user confirmation needed

  parameters: PlanParameters,

  async execute(args, ctx) {
    console.log('[PlanTool] execute called with:', JSON.stringify(args, null, 2))
    const { todos } = args
    const sessionId = ctx.sessionId

    if (!sessionId) {
      throw new Error('Session ID is required to update plan')
    }

    // Get existing plan to preserve item IDs where possible
    const session = getSession(sessionId)
    const existingPlan = session?.plan
    const existingItemsById = new Map<string, PlanItem>()
    const existingItemsByContent = new Map<string, PlanItem>()

    if (existingPlan?.items) {
      for (const item of existingPlan.items) {
        existingItemsById.set(item.id, item)
        existingItemsByContent.set(item.content, item)
      }
    }

    // Convert input to PlanItem[], preserving IDs for existing items
    const now = Date.now()
    const items: PlanItem[] = todos.map((todo) => {
      // Try to find existing item by content to preserve its ID
      const existing = existingItemsByContent.get(todo.content)

      return {
        id: existing?.id || nanoid(),
        content: todo.content,
        activeForm: todo.activeForm,
        status: todo.status,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      }
    })

    // Validate: only one in_progress
    const inProgressCount = items.filter(i => i.status === 'in_progress').length
    if (inProgressCount > 1) {
      throw new Error(`Only one task can be 'in_progress' at a time. Found ${inProgressCount} tasks with 'in_progress' status.`)
    }

    // Create the plan
    const plan: SessionPlan = {
      items,
      createdAt: existingPlan?.createdAt || now,
      updatedAt: now,
    }

    // Save to session
    updateSessionPlan(sessionId, plan)

    // Notify renderer
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      win.webContents.send(IPC_CHANNELS.PLAN_UPDATED, { sessionId, plan })
    }

    // Calculate statistics
    const completed = items.filter(i => i.status === 'completed').length
    const inProgress = items.filter(i => i.status === 'in_progress').length
    const pending = items.filter(i => i.status === 'pending').length

    // Build output summary
    const lines: string[] = ['Plan updated:']
    for (const item of items) {
      const icon = item.status === 'completed' ? '✓'
        : item.status === 'in_progress' ? '▶'
        : '○'
      const text = item.status === 'in_progress' ? item.activeForm : item.content
      lines.push(`${icon} ${text}`)
    }
    lines.push('')
    lines.push(`Progress: ${completed}/${items.length} completed`)

    const metadata: PlanMetadata = {
      itemCount: items.length,
      completed,
      inProgress,
      pending,
    }

    return {
      title: `Plan: ${completed}/${items.length} completed`,
      output: lines.join('\n'),
      metadata,
    }
  },

  formatValidationError(error) {
    const issues = error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
    return `Invalid plan parameters:\n${issues.join('\n')}`
  },
})
