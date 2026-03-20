/**
 * IPC Type Definitions for Memory Feedback System
 */

import { defineRouter } from './router.js'

export interface RecordFeedbackRequest {
  filePath: string         // Memory file relative path (e.g., "topics/vue.md")
  feedbackType: 'positive' | 'negative'
}

export interface RecordFeedbackResponse {
  success: boolean
  error?: string
}

export interface GetFeedbackStatsRequest {
  filePath: string         // Memory file relative path
}

export interface GetFeedbackStatsResponse {
  success: boolean
  stats?: {
    positive: number
    negative: number
    ratio: number          // 0-1 range, positive / (positive + negative)
  }
  error?: string
}

// --- Router Definition ---

/** Route types for memory-feedback domain */
export type MemoryFeedbackRoutes = {
  record: {
    input: RecordFeedbackRequest
    output: RecordFeedbackResponse
  }
  getStats: {
    input: GetFeedbackStatsRequest
    output: GetFeedbackStatsResponse
  }
}

/**
 * Memory feedback router - single source of truth for IPC channels & types.
 *
 * Generated channels:
 * - record   → "memory-feedback:record"
 * - getStats → "memory-feedback:get-stats"
 */
export const memoryFeedbackRouter = defineRouter<MemoryFeedbackRoutes>(
  'memory-feedback',
  ['record', 'getStats']
)
