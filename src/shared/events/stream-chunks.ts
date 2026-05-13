/**
 * Stream Chunk Types
 *
 * High-frequency, low-latency chunks that flow through StreamChannel.
 * These are the "hot path" data — text and reasoning deltas that arrive
 * many times per second during streaming.
 *
 * Separated from SessionEvents because they need different delivery
 * semantics: StreamChannel provides backpressure-aware fan-out,
 * while EventBus provides ordered, replayable delivery.
 */

// ── Text delta ──────────────────────────────────

export interface TextDeltaChunk {
  type: 'text-delta'
  text: string
  turnIndex?: number
}

// ── Reasoning delta ─────────────────────────────

export interface ReasoningDeltaChunk {
  type: 'reasoning-delta'
  reasoning: string
  turnIndex?: number
}

// ── Tool input delta ────────────────────────────

export interface ToolInputDeltaChunk {
  type: 'tool-input-delta'
  toolCallId: string
  argsTextDelta: string
}

// ── Union ───────────────────────────────────────

export type StreamChunk =
  | TextDeltaChunk
  | ReasoningDeltaChunk
  | ToolInputDeltaChunk
