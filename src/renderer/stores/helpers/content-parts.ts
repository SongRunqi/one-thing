/**
 * Pure helpers for evolving a message's `contentParts` array as stream
 * chunks arrive. Each helper mutates `parts` in place; the caller is
 * responsible for re-assigning `message.contentParts = [...parts]` (or
 * equivalent) to trigger Vue reactivity downstream.
 */

import type { ContentPart, ToolCall } from '@/types'
import { mergeToolCall } from './tool-calls'

/** Transient indicators that should be popped when real content arrives. */
function isTransient(part: ContentPart): boolean {
  return part.type === 'waiting' || part.type === 'loading-memory'
}

/** Pop the trailing transient indicator (waiting / loading-memory) if any. */
export function popTrailingTransient(parts: ContentPart[]): void {
  const last = parts[parts.length - 1]
  if (last && isTransient(last)) {
    parts.pop()
  }
}

/** Append text, merging into the trailing text part if one exists. */
export function appendOrMergeText(parts: ContentPart[], content: string): void {
  popTrailingTransient(parts)
  const last = parts[parts.length - 1]
  if (last && last.type === 'text') {
    last.content += content
  } else {
    parts.push({ type: 'text', content })
  }
}

/**
 * Upsert a tool call into the trailing tool-call part, or start a new one.
 * On id collision, fields are merged in place — preserving the array slot
 * identity that may be shared with `step.toolCall` references.
 */
export function upsertToolCall(parts: ContentPart[], toolCall: ToolCall): void {
  popTrailingTransient(parts)
  const last = parts[parts.length - 1]
  if (last && last.type === 'tool-call') {
    const idx = last.toolCalls.findIndex(tc => tc.id === toolCall.id)
    if (idx >= 0) {
      mergeToolCall(last.toolCalls[idx], toolCall)
    } else {
      last.toolCalls.push(toolCall)
    }
  } else {
    parts.push({ type: 'tool-call', toolCalls: [toolCall] })
  }
}

/**
 * Add a tool call placeholder (for `tool_input_start`). When merging into an
 * existing tool-call part, replaces the part object with a clone so deep
 * reactivity sees the array identity change — this matters for the streaming
 * input flow where multiple tool calls accumulate before any of them complete.
 */
export function appendToolCallPlaceholder(parts: ContentPart[], toolCall: ToolCall): void {
  popTrailingTransient(parts)
  const last = parts[parts.length - 1]
  if (last && last.type === 'tool-call') {
    if (last.toolCalls.some(tc => tc.id === toolCall.id)) return
    parts[parts.length - 1] = {
      ...last,
      toolCalls: [...last.toolCalls, toolCall],
    }
  } else {
    parts.push({ type: 'tool-call', toolCalls: [toolCall] })
  }
}

/**
 * Insert a data-steps placeholder for a given turn if absent.
 * Returns true if a new placeholder was added.
 */
export function pushDataStepsIfMissing(parts: ContentPart[], turnIndex: number): boolean {
  if (parts.some(p => p.type === 'data-steps' && p.turnIndex === turnIndex)) {
    return false
  }
  popTrailingTransient(parts)
  parts.push({ type: 'data-steps', turnIndex })
  return true
}

/** Push a waiting indicator (signals AI continuation after a tool call). */
export function pushWaiting(parts: ContentPart[]): void {
  parts.push({ type: 'waiting' })
}
