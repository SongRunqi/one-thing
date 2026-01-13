/**
 * Memory Feedback IPC Handlers
 *
 * Handles IPC communication for memory feedback system.
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc/channels.js'
import { recordMemoryFeedback, getMemoryFeedbackStats } from '../services/memory-text/memory-feedback.js'
import type {
  RecordFeedbackRequest,
  RecordFeedbackResponse,
  GetFeedbackStatsRequest,
  GetFeedbackStatsResponse
} from '../../shared/ipc/memory-feedback.js'

/**
 * Register memory feedback IPC handlers
 */
export function registerMemoryFeedbackHandlers(): void {
  // Record user feedback (👍 or 👎)
  ipcMain.handle(
    IPC_CHANNELS.MEMORY_FEEDBACK_RECORD,
    async (_, req: RecordFeedbackRequest): Promise<RecordFeedbackResponse> => {
      try {
        await recordMemoryFeedback(req.filePath, req.feedbackType)
        return { success: true }
      } catch (error: any) {
        console.error('[IPC] Failed to record memory feedback:', error)
        return { success: false, error: error.message }
      }
    }
  )

  // Get feedback statistics for a memory file
  ipcMain.handle(
    IPC_CHANNELS.MEMORY_FEEDBACK_GET_STATS,
    async (_, req: GetFeedbackStatsRequest): Promise<GetFeedbackStatsResponse> => {
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
    }
  )

  console.log('[IPC] Memory feedback handlers registered')
}
