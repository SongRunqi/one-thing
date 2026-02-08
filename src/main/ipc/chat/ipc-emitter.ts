/**
 * IPC Event Emitter Module
 * Centralizes all IPC event sending logic to reduce code duplication
 * and provide a clean, type-safe interface for stream events
 *
 * Phase 2 (REQ-005): Legacy STREAM_CHUNK events removed.
 * Stream data flows exclusively through UI_MESSAGE_STREAM channel.
 * Stream completion and errors also flow through UI_MESSAGE_STREAM.
 */

import {
  addMessageStep,
  updateMessageStep,
  updateMessageSkill,
} from '../../stores/sessions.js'
import { IPC_CHANNELS } from '../../../shared/ipc.js'
import type { Step } from '../../../shared/ipc.js'
import type { UIMessageStreamData } from '../../../shared/ipc.js'
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
  errorCategory?: string
  retryable?: boolean
  preserved?: boolean
}

/**
 * IPC Event Emitter Interface
 * Provides a unified API for sending all IPC events related to streaming
 */
export interface IPCEmitter {
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

  /** Send stream complete event via UI_MESSAGE_STREAM finish chunk */
  sendStreamComplete(data: StreamCompleteData): void

  /** Send stream error event via UI_MESSAGE_STREAM error chunk */
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
      addMessageStep(sessionId, assistantMessageId, step)
      sender.send(IPC_CHANNELS.STEP_ADDED, {
        sessionId,
        messageId: assistantMessageId,
        step,
      })
    },

    sendStepUpdated(stepId: string, updates: Partial<Step>) {
      updateMessageStep(sessionId, assistantMessageId, stepId, updates)
      sender.send(IPC_CHANNELS.STEP_UPDATED, {
        sessionId,
        messageId: assistantMessageId,
        stepId,
        updates,
      })
    },

    // ========== Session Events (via UI_MESSAGE_STREAM) ==========

    sendStreamComplete(data: StreamCompleteData) {
      const streamData: UIMessageStreamData = {
        sessionId,
        messageId: assistantMessageId,
        chunk: {
          type: 'finish',
          messageId: assistantMessageId,
          finishReason: data.aborted ? 'other' : (data.error ? 'error' : 'stop'),
          usage: data.usage,
          lastTurnUsage: data.lastTurnUsage,
          sessionName: data.sessionName,
          aborted: data.aborted,
        },
      }
      sender.send(IPC_CHANNELS.UI_MESSAGE_STREAM, streamData)
    },

    sendStreamError(data: StreamErrorData) {
      const streamData: UIMessageStreamData = {
        sessionId,
        messageId: assistantMessageId,
        chunk: {
          type: 'error',
          messageId: assistantMessageId,
          error: data.error,
          errorDetails: data.errorDetails,
          errorCategory: data.errorCategory,
          retryable: data.retryable,
        },
      }
      sender.send(IPC_CHANNELS.UI_MESSAGE_STREAM, streamData)
    },

    // ========== Skill Events ==========

    sendSkillActivated(skillName: string) {
      updateMessageSkill(sessionId, assistantMessageId, skillName)
      sender.send(IPC_CHANNELS.SKILL_ACTIVATED, {
        sessionId,
        messageId: assistantMessageId,
        skillName,
      })
    },
  }
}
