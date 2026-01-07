/**
 * IPC Event Emitter Module
 * Centralizes all IPC event sending logic to reduce code duplication
 * and provide a clean, type-safe interface for stream events
 */

import * as store from '../../store.js'
import { IPC_CHANNELS } from '../../../shared/ipc.js'
import type { Step, ToolCall, ContentPart } from '../../../shared/ipc.js'
import type { StreamContext } from './stream-processor.js'

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
 * Provides a unified API for sending all IPC events related to streaming
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

/**
 * Create an IPC event emitter bound to a stream context
 *
 * This centralizes all IPC event sending logic, eliminating repetitive
 * ctx.sender.send() calls scattered throughout the codebase.
 *
 * @param ctx The stream context containing session info and sender
 * @returns An IPCEmitter instance bound to the context
 */
export function createIPCEmitter(ctx: StreamContext): IPCEmitter {
  const { sender, sessionId, assistantMessageId } = ctx

  return {
    // ========== Stream Chunk Events ==========

    sendTextChunk(text: string) {
      sender.send(IPC_CHANNELS.STREAM_CHUNK, {
        type: 'text',
        content: text,
        messageId: assistantMessageId,
        sessionId,
      })
    },

    sendReasoningChunk(reasoning: string) {
      sender.send(IPC_CHANNELS.STREAM_CHUNK, {
        type: 'reasoning',
        content: '',
        messageId: assistantMessageId,
        sessionId,
        reasoning,
      })
    },

    sendContentPart(part: ContentPart) {
      sender.send(IPC_CHANNELS.STREAM_CHUNK, {
        type: 'content_part',
        content: '',
        messageId: assistantMessageId,
        sessionId,
        contentPart: part,
      })
    },

    sendContinuation() {
      sender.send(IPC_CHANNELS.STREAM_CHUNK, {
        type: 'continuation',
        content: '',
        messageId: assistantMessageId,
        sessionId,
      })
    },

    sendToolCall(toolCall: ToolCall) {
      sender.send(IPC_CHANNELS.STREAM_CHUNK, {
        type: 'tool_call',
        content: '',
        messageId: assistantMessageId,
        sessionId,
        toolCall,
      })
    },

    sendToolResult(toolCall: ToolCall) {
      sender.send(IPC_CHANNELS.STREAM_CHUNK, {
        type: 'tool_result',
        content: '',
        messageId: assistantMessageId,
        sessionId,
        toolCall,
      })
    },

    sendToolInputStart(toolCallId: string, toolName: string, toolCall: ToolCall) {
      sender.send(IPC_CHANNELS.STREAM_CHUNK, {
        type: 'tool_input_start',
        content: '',
        messageId: assistantMessageId,
        sessionId,
        toolCallId,
        toolName,
        toolCall,
      })
    },

    sendToolInputDelta(toolCallId: string, argsTextDelta: string) {
      sender.send(IPC_CHANNELS.STREAM_CHUNK, {
        type: 'tool_input_delta',
        content: '',
        messageId: assistantMessageId,
        sessionId,
        toolCallId,
        argsTextDelta,
      })
    },

    // ========== Context Events ==========

    sendContextSizeUpdate(contextSize: number) {
      sender.send(IPC_CHANNELS.CONTEXT_SIZE_UPDATED, {
        sessionId,
        contextSize,
      })
    },

    sendCompactStarted() {
      sender.send(IPC_CHANNELS.CONTEXT_COMPACT_STARTED, {
        sessionId,
      })
    },

    sendCompactCompleted(data: { success: boolean; error?: string }) {
      sender.send(IPC_CHANNELS.CONTEXT_COMPACT_COMPLETED, {
        sessionId,
        ...data,
      })
    },

    // ========== Step Events ==========

    sendStepAdded(step: Step) {
      store.addMessageStep(sessionId, assistantMessageId, step)
      sender.send(IPC_CHANNELS.STEP_ADDED, {
        sessionId,
        messageId: assistantMessageId,
        step,
      })
    },

    sendStepUpdated(stepId: string, updates: Partial<Step>) {
      store.updateMessageStep(sessionId, assistantMessageId, stepId, updates)
      sender.send(IPC_CHANNELS.STEP_UPDATED, {
        sessionId,
        messageId: assistantMessageId,
        stepId,
        updates,
      })
    },

    // ========== Session Events ==========

    sendStreamComplete(data: StreamCompleteData) {
      sender.send(IPC_CHANNELS.STREAM_COMPLETE, {
        messageId: assistantMessageId,
        sessionId,
        ...data,
      })
    },

    sendStreamError(data: StreamErrorData) {
      sender.send(IPC_CHANNELS.STREAM_ERROR, {
        messageId: assistantMessageId,
        sessionId,
        ...data,
      })
    },

    // ========== Skill Events ==========

    sendSkillActivated(skillName: string) {
      store.updateMessageSkill(sessionId, assistantMessageId, skillName)
      sender.send(IPC_CHANNELS.SKILL_ACTIVATED, {
        sessionId,
        messageId: assistantMessageId,
        skillName,
      })
    },
  }
}
