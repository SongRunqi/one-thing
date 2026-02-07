/**
 * Memory Feedback IPC Handlers
 *
 * Handles IPC communication for memory feedback system.
 * Uses the IPC Router for type-safe handler registration.
 */

import { registerRouter } from './register-router.js'
import { memoryFeedbackRouter } from '../../shared/ipc/memory-feedback.js'
import { recordMemoryFeedback, getMemoryFeedbackStats } from '../services/memory-text/memory-feedback.js'

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
        console.error('[IPC] Failed to record memory feedback:', error)
        return { success: false, error: error.message }
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
        console.error('[IPC] Failed to get memory feedback stats:', error)
        return { success: false, error: error.message }
      }
    },
  })
}
