/**
 * Stream Chunk Types
 *
 * High-frequency, low-latency chunks that flow through StreamChannel.
 * These are the hot-path data: text and reasoning deltas that arrive
 * many times per second during streaming.
 *
 * Separated from session events because they need different delivery
 * semantics: StreamChannel provides fan-out, while EventBus provides
 * ordered, replayable delivery.
 */

import type { StreamChunkBase } from './types.js'

export interface TextDeltaChunk extends StreamChunkBase {
  type: 'text-delta'
  text: string
  turnIndex?: number
  voiceSpeakText?: string
}

export type ReasoningPlacement = 'top' | 'inline'

export interface ReasoningDeltaChunk extends StreamChunkBase {
  type: 'reasoning-delta'
  reasoning: string
  turnIndex?: number
  placement?: ReasoningPlacement
}

export interface ToolInputDeltaChunk extends StreamChunkBase {
  type: 'tool-input-delta'
  toolCallId: string
  argsTextDelta: string
}

export type StreamChunk =
  | TextDeltaChunk
  | ReasoningDeltaChunk
  | ToolInputDeltaChunk
