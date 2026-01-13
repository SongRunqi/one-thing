/**
 * IPC Type Definitions for Memory Feedback System
 */

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
