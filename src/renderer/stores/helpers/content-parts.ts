/**
 * Pure helpers for evolving a message's `contentParts` array as stream
 * chunks arrive. Each helper mutates the `parts` array in place; the caller is
 * responsible for re-assigning `message.contentParts = [...parts]` (or
 * equivalent) to trigger Vue reactivity downstream.
 */

import type { ContentPart, ToolCall } from '@/types'
import { mergeToolCall } from './tool-calls'

type TurnTextPart = Extract<ContentPart, { type: 'text' | 'reasoning' }>

/** Transient indicators that should be popped when real content arrives. */
function isTransient(part: ContentPart): boolean {
  return part.type === 'waiting' || part.type === 'loading-memory' || part.type === 'image-loading'
}

/** Pop the trailing transient indicator (waiting / loading-memory) if any. */
export function popTrailingTransient(parts: ContentPart[]): void {
  const last = parts[parts.length - 1]
  if (last && isTransient(last)) {
    parts.pop()
  }
}

/** Remove every transient indicator when a stream ends or is aborted. */
export function removeTransientIndicators(parts: ContentPart[]): boolean {
  const originalLength = parts.length
  for (let i = parts.length - 1; i >= 0; i--) {
    if (isTransient(parts[i])) {
      parts.splice(i, 1)
    }
  }
  return parts.length !== originalLength
}

function isTurnTextPart(part: ContentPart): part is TurnTextPart {
  return part.type === 'text' || part.type === 'reasoning'
}

function sameTurn(a: { turnIndex?: number }, b: { turnIndex?: number }): boolean {
  return a.turnIndex === b.turnIndex
}

function appendOrMergeTurnTextPart(parts: ContentPart[], part: TurnTextPart): void {
  popTrailingTransient(parts)

  const last = parts[parts.length - 1]
  if (last && last.type === part.type && sameTurn(last, part)) {
    parts[parts.length - 1] = {
      ...last,
      content: last.content + part.content,
    }
  } else {
    parts.push(part)
  }
}

/** Append text, merging into the trailing text part if one exists. */
export function appendOrMergeText(parts: ContentPart[], content: string, turnIndex?: number): void {
  appendOrMergeTurnTextPart(parts, {
    type: 'text',
    content,
    ...(turnIndex !== undefined ? { turnIndex } : {}),
  })
}

/** Append reasoning, merging into the trailing reasoning part if one exists. */
export function appendOrMergeReasoning(parts: ContentPart[], content: string, turnIndex?: number): void {
  appendOrMergeTurnTextPart(parts, {
    type: 'reasoning',
    content,
    ...(turnIndex !== undefined ? { turnIndex } : {}),
  })
}

/** Append a finalized reasoning part only if the same block is not already present. */
export function appendReasoningIfMissing(parts: ContentPart[], content: string): boolean {
  if (!content) return false
  if (parts.some(part => part.type === 'reasoning' && part.content === content)) {
    popTrailingTransient(parts)
    return false
  }
  appendOrMergeReasoning(parts, content)
  return true
}

/**
 * Upsert a tool call into an existing tool-call part, or start a new one.
 * On id collision, fields are merged in place — preserving the array slot
 * identity that may be shared with `step.toolCall` references.
 *
 * A later data-steps part may already be trailing when the finalized
 * `tool_call` chunk arrives, so search the full parts list before appending.
 */
export function upsertToolCall(parts: ContentPart[], toolCall: ToolCall): void {
  popTrailingTransient(parts)
  for (const part of parts) {
    if (part.type !== 'tool-call') continue
    const idx = part.toolCalls.findIndex(tc => tc.id === toolCall.id)
    if (idx >= 0) {
      mergeToolCall(part.toolCalls[idx], toolCall)
      return
    }
  }

  const last = parts[parts.length - 1]
  if (last && last.type === 'tool-call') {
    last.toolCalls.push(toolCall)
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
  if (parts.some(part =>
    part.type === 'tool-call' && part.toolCalls.some(tc => tc.id === toolCall.id)
  )) {
    return
  }

  const last = parts[parts.length - 1]
  if (last && last.type === 'tool-call') {
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
export function pushWaiting(parts: ContentPart[], turnIndex?: number): void {
  if (parts.some(part => part.type === 'waiting' && part.turnIndex === turnIndex)) {
    return
  }
  popTrailingTransient(parts)
  parts.push({
    type: 'waiting',
    ...(turnIndex !== undefined ? { turnIndex } : {}),
  })
}

/** Push a memory-loading indicator before the main provider request starts. */
export function pushLoadingMemory(parts: ContentPart[]): void {
  const last = parts[parts.length - 1]
  if (last?.type === 'loading-memory') return
  popTrailingTransient(parts)
  parts.push({ type: 'loading-memory' })
}

/** Push an image-generation skeleton, avoiding duplicate adjacent skeletons. */
export function pushImageLoading(parts: ContentPart[], turnIndex?: number, label?: string): void {
  const last = parts[parts.length - 1]
  if (last?.type === 'image-loading') return
  popTrailingTransient(parts)
  parts.push({
    type: 'image-loading',
    ...(turnIndex !== undefined ? { turnIndex } : {}),
    ...(label ? { label } : {}),
  })
}
