/**
 * Unified rendering status for tool calls.
 *
 * `ToolCall.status` and `Step.status` use different vocabularies for
 * overlapping concepts (`executing` vs `running`, `requiresConfirmation`
 * vs `awaiting-confirmation`, etc.). This module collapses them into a
 * single set of UI states so `StepsPanel` can derive timeline visuals
 * from the same source of truth for both Step-backed and streaming calls.
 */

import type { Step, ToolCall } from '@/types'

export type ToolRenderStatus =
  | 'pending'
  | 'queued'
  | 'streaming-input'
  | 'received'
  | 'awaiting-confirmation'
  | 'executing'
  | 'completed'
  | 'rejected'
  | 'failed'
  | 'cancelled'

/**
 * Pick the unified render status given a tool call and optionally the
 * step that wraps it. Either argument may be missing (e.g. a streaming
 * tool call with no step yet, or a step whose toolCall is unset).
 */
export function getToolRenderStatus(toolCall?: ToolCall, step?: Step): ToolRenderStatus {
  if (step?.rejected || toolCall?.rejected) return 'rejected'
  // awaiting-confirmation is a UI gate that overrides downstream state.
  if (toolCall?.requiresConfirmation || step?.status === 'awaiting-confirmation') {
    return 'awaiting-confirmation'
  }
  if (toolCall?.status === 'input-streaming') return 'streaming-input'
  if (toolCall?.status === 'received') return 'received'
  if (toolCall?.status === 'queued') return 'queued'
  if (step?.status === 'cancelled' || toolCall?.status === 'cancelled') return 'cancelled'
  if (step?.status === 'failed' || toolCall?.status === 'failed') return 'failed'
  if (step?.status === 'completed' || toolCall?.status === 'completed') return 'completed'
  if (step?.status === 'running' || toolCall?.status === 'executing') return 'executing'
  return 'pending'
}
