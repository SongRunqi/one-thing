/**
 * Memory Feedback System
 *
 * Handles user feedback on memory retrieval usefulness.
 * Adjusts importance scores based on positive/negative feedback.
 */

import { getTextMemoryStorage } from './text-memory-storage.js'
import type { MemoryFileMetadata } from './text-memory-storage.js'

export type FeedbackType = 'positive' | 'negative'

/**
 * Record user feedback for a memory file
 *
 * Positive feedback: increments feedbackPositive, increases importance (max 5)
 * Negative feedback: increments feedbackNegative, decreases importance (min 1)
 */
export async function recordMemoryFeedback(
  relativePath: string,
  feedbackType: FeedbackType
): Promise<void> {
  const storage = getTextMemoryStorage()
  const parsed = await storage.readMemoryFile(relativePath, false)

  if (!parsed) {
    throw new Error(`Memory file not found: ${relativePath}`)
  }

  const now = new Date().toISOString()
  const updates: Partial<MemoryFileMetadata> = {
    lastFeedbackAt: now
  }

  if (feedbackType === 'positive') {
    // Increment positive feedback count
    updates.feedbackPositive = (parsed.metadata.feedbackPositive || 0) + 1

    // Increase importance (capped at 5)
    const currentImportance = parsed.metadata.importance || 3
    if (currentImportance < 5) {
      updates.importance = Math.min(5, currentImportance + 1)
    }
  } else {
    // Increment negative feedback count
    updates.feedbackNegative = (parsed.metadata.feedbackNegative || 0) + 1

    // Decrease importance (floored at 1)
    const currentImportance = parsed.metadata.importance || 3
    if (currentImportance > 1) {
      updates.importance = Math.max(1, currentImportance - 1)
    }
  }

  await storage.updateFileMetadata(relativePath, updates)
  console.log(`[MemoryFeedback] Recorded ${feedbackType} feedback for ${relativePath}`)
}

/**
 * Get feedback statistics for a memory file
 */
export async function getMemoryFeedbackStats(
  relativePath: string
): Promise<{
  positive: number
  negative: number
  ratio: number  // positive / (positive + negative), 0-1 range
} | null> {
  const storage = getTextMemoryStorage()
  const parsed = await storage.readMemoryFile(relativePath, false)

  if (!parsed) {
    return null
  }

  const positive = parsed.metadata.feedbackPositive || 0
  const negative = parsed.metadata.feedbackNegative || 0
  const total = positive + negative

  return {
    positive,
    negative,
    ratio: total > 0 ? positive / total : 0
  }
}
