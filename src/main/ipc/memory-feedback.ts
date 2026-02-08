/**
 * Memory Feedback IPC Handlers
 *
 * Handles IPC communication for memory feedback system.
 * Uses the IPC Router for type-safe handler registration.
 */

import { registerRouter } from './register-router.js'
import { memoryFeedbackRouter } from '../../shared/ipc/memory-feedback.js'
import { recordMemoryFeedback, getMemoryFeedbackStats } from '../services/memory-text/memory-feedback.js'
import { classifyError } from '../../shared/errors.js'

/**
 * Register memory feedback IPC handlers via router
 */
export function registerMemoryFeedbackHandlers(): void {
  registerRouter(memoryFeedbackRouter, {
    record: async (req) => {
      try {
        await recordMemoryFeedback(req.filePath, req.feedbackType)
        return { success: true }
      } catch (error: any) {
        const appError = classifyError(error)
        console.error(`[MemoryFeedback][${appError.category}] Failed to record memory feedback:`, error)
        return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable }
      }
    },

    getStats: async (req) => {
      try {
        const stats = await getMemoryFeedbackStats(req.filePath)
        if (!stats) {
          return { success: false, error: 'Memory file not found' }
        }
        return { success: true, stats }
      } catch (error: any) {
        const appError = classifyError(error)
        console.error(`[MemoryFeedback][${appError.category}] Failed to get memory feedback stats:`, error)
        return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable }
      }
    },
  })
}
