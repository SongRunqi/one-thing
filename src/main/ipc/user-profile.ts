import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import { classifyError } from '../../shared/errors.js'
import { getStorage } from '../storage/index.js'

export function registerUserProfileHandlers() {
  // Get user profile
  ipcMain.handle(IPC_CHANNELS.USER_PROFILE_GET, async () => {
    try {
      const storage = getStorage()
      const profile = await storage.userProfile.getProfile()
      return { success: true, profile }
    } catch (error: any) {
      const appError = classifyError(error)
      console.error(`[UserProfile][${appError.category}] Error getting user profile:`, error)
      return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable }
    }
  })

  // Add a fact
  ipcMain.handle(
    IPC_CHANNELS.USER_PROFILE_ADD_FACT,
    async (_event, { content, category, confidence, sourceAgentId }) => {
      try {
        const storage = getStorage()
        const fact = await storage.userProfile.addFact(
          content,
          category,
          confidence,
          sourceAgentId
        )
        return { success: true, fact }
      } catch (error: any) {
        const appError = classifyError(error)
        console.error(`[UserProfile][${appError.category}] Error adding user fact:`, error)
        return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable }
      }
    }
  )

  // Update a fact
  ipcMain.handle(
    IPC_CHANNELS.USER_PROFILE_UPDATE_FACT,
    async (_event, { factId, content, category, confidence }) => {
      try {
        const storage = getStorage()
        const fact = await storage.userProfile.updateFact(factId, {
          content,
          category,
          confidence,
        })
        if (!fact) {
          return { success: false, error: 'Fact not found' }
        }
        return { success: true, fact }
      } catch (error: any) {
        const appError = classifyError(error)
        console.error(`[UserProfile][${appError.category}] Error updating user fact:`, error)
        return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable }
      }
    }
  )

  // Delete a fact
  ipcMain.handle(
    IPC_CHANNELS.USER_PROFILE_DELETE_FACT,
    async (_event, { factId }) => {
      try {
        const storage = getStorage()
        const success = await storage.userProfile.deleteFact(factId)
        if (!success) {
          return { success: false, error: 'Fact not found' }
        }
        return { success: true }
      } catch (error: any) {
        const appError = classifyError(error)
        console.error(`[UserProfile][${appError.category}] Error deleting user fact:`, error)
        return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable }
      }
    }
  )
}
