/**
 * Helpers that enforce the invariant `step.toolCall === message.toolCalls[i]`
 * for steps whose `toolCallId` matches an entry in `message.toolCalls`.
 *
 * Backend emits Step events with an embedded shallow-clone of the tool call
 * (see main/engine/stream/stream-processor.ts), and persists both arrays
 * independently. The renderer relinks them on receipt and on session
 * reload so that any single mutation propagates to both consumers
 * (StepsPanel via `step.toolCall`, MessageBubble via `contentParts`
 * tool-call entries) without manual mirror writes.
 */

import type { ChatMessage, ToolCall } from '@/types'

/**
 * Copy own enumerable keys from `src` whose values are not `undefined`
 * onto `target`. Mutates target in place; returns target.
 *
 * `null`, empty string, `0`, `false` are explicit values and pass through.
 * Only `undefined` is treated as "absent". Nested objects are not
 * deep-merged — replaced by reference (matches existing chunk semantics).
 */
export function mergeToolCall(target: ToolCall, src: Partial<ToolCall>): ToolCall {
  for (const key of Object.keys(src) as Array<keyof ToolCall>) {
    const v = src[key]
    if (v !== undefined) {
      // Each ToolCall key is well-typed via the lookup above; the cast lets
      // us write through the union without enumerating every field.
      ;(target as unknown as Record<string, unknown>)[key as string] = v
    }
  }
  return target
}

/**
 * Upsert a tool call into `message.toolCalls` by id WITHOUT replacing the
 * array slot. If the id is already present, fields are merged in place
 * (preserving the shared reference held by any matching `step.toolCall`).
 * Returns the canonical reference now living in `message.toolCalls`.
 */
export function upsertMessageToolCall(message: ChatMessage, incoming: ToolCall): ToolCall {
  if (!message.toolCalls) message.toolCalls = []
  const idx = message.toolCalls.findIndex(tc => tc.id === incoming.id)
  if (idx >= 0) {
    return mergeToolCall(message.toolCalls[idx], incoming)
  }
  message.toolCalls.push(incoming)
  return incoming
}

/**
 * For each step with a `toolCallId`, ensure `step.toolCall` is the same
 * object reference as the matching entry in `message.toolCalls`.
 *
 * - If a matching message-side entry exists: merge the step's embedded
 *   toolCall fields into it (defined-keys-only) and re-point the step.
 * - If no matching entry exists: promote the step's embedded toolCall to
 *   the canonical entry by pushing it into `message.toolCalls`.
 *
 * Idempotent — calling repeatedly leaves references and fields unchanged.
 */
export function linkStepsToToolCalls(message: ChatMessage): void {
  if (!message.steps) return
  for (const step of message.steps) {
    if (!step.toolCallId) continue

    if (!message.toolCalls) message.toolCalls = []
    const existing = message.toolCalls.find(tc => tc.id === step.toolCallId)

    if (existing) {
      if (step.toolCall && step.toolCall !== existing) {
        const existingStreamingArgs = existing.streamingArgs
        mergeToolCall(existing, step.toolCall)
        if (
          typeof existingStreamingArgs === 'string' &&
          existingStreamingArgs.length > (existing.streamingArgs?.length ?? 0)
        ) {
          existing.streamingArgs = existingStreamingArgs
        }
      }
      step.toolCall = existing
    } else if (step.toolCall) {
      // No canonical entry yet — promote the step's embedded toolCall.
      message.toolCalls.push(step.toolCall)
    }
  }
}
