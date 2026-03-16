/**
 * IPC Emitter Types
 *
 * Defines the IPCEmitter interface and associated data types used by
 * EventOnlyEmitter (and previously by createIPCEmitter which has been removed).
 *
 * The actual implementation is in src/main/events/event-only-emitter.ts.
 */

import type { Step, ToolCall, ContentPart } from '../../../shared/ipc.js'

/**
 * Data for stream completion event
 */
export interface StreamCompleteData {
  sessionName?: string
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number; durationMs?: number }
  lastTurnUsage?: { inputTokens: number; outputTokens: number }
  aborted?: boolean
  error?: string
}

/**
 * Data for stream error event
 */
export interface StreamErrorData {
  error: string
  errorDetails?: string
  preserved?: boolean
}

/**
 * IPC Event Emitter Interface
 * Provides a unified API for sending all IPC events related to streaming.
 *
 * Implementations:
 * - EventOnlyEmitter (Phase 2+): emits to EventBus/StreamChannel, IPCBridge translates to IPC
 */
export interface IPCEmitter {
  // ========== Stream Chunk Events ==========

  /** Send a text chunk to the frontend */
  sendTextChunk(text: string): void

  /** Send a reasoning chunk to the frontend */
  sendReasoningChunk(reasoning: string): void

  /** Send a content part (text or data-steps) */
  sendContentPart(part: ContentPart): void

  /** Send a continuation indicator for multi-turn loops */
  sendContinuation(): void

  /** Send tool call status update */
  sendToolCall(toolCall: ToolCall): void

  /** Send tool result */
  sendToolResult(toolCall: ToolCall): void

  /** Send tool input start (streaming args) */
  sendToolInputStart(toolCallId: string, toolName: string, toolCall: ToolCall): void

  /** Send tool input delta (streaming args increment) */
  sendToolInputDelta(toolCallId: string, argsTextDelta: string): void

  // ========== Context Events ==========

  /** Send context size update */
  sendContextSizeUpdate(contextSize: number): void

  /** Send context compact started event */
  sendCompactStarted(): void

  /** Send context compact completed event */
  sendCompactCompleted(data: { success: boolean; error?: string; summary?: string }): void

  // ========== Step Events ==========

  /** Send step added event (also adds to store) */
  sendStepAdded(step: Step): void

  /** Send step updated event (also updates store) */
  sendStepUpdated(stepId: string, updates: Partial<Step>): void

  // ========== Session Events ==========

  /** Send stream complete event */
  sendStreamComplete(data: StreamCompleteData): void

  /** Send stream error event */
  sendStreamError(data: StreamErrorData): void

  // ========== Skill Events ==========

  /** Send skill activated event */
  sendSkillActivated(skillName: string): void
}
