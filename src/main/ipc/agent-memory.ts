import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type { AgentMemoryCategory } from '../../shared/ipc.js'
import { getStorage } from '../storage/index.js'
import { classifyError } from '../../shared/errors.js'

export function registerAgentMemoryHandlers() {
  // Get agent relationship
  ipcMain.handle(
    IPC_CHANNELS.AGENT_MEMORY_GET_RELATIONSHIP,
    async (_event, { agentId }) => {
      try {
        const storage = getStorage()
        const relationship = await storage.agentMemory.getRelationship(agentId)
        return { success: true, relationship }
      } catch (error: any) {
        const appError = classifyError(error)
        console.error(`[AgentMemory][${appError.category}] Error getting agent relationship:`, error)
        return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable }
      }
    }
  )

  // Add a memory
  ipcMain.handle(
    IPC_CHANNELS.AGENT_MEMORY_ADD_MEMORY,
    async (_event, { agentId, content, category, emotionalWeight = 50 }) => {
      try {
        const storage = getStorage()
        const now = Date.now()
        const memory = await storage.agentMemory.addMemory(agentId, {
          content,
          category: category as AgentMemoryCategory,
          strength: 100,
          emotionalWeight,
          createdAt: now,
          lastRecalledAt: now,
          recallCount: 0,
          linkedMemories: [],
          vividness: 'vivid',
        })
        return { success: true, memory }
      } catch (error: any) {
        const appError = classifyError(error)
        console.error(`[AgentMemory][${appError.category}] Error adding agent memory:`, error)
        return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable }
      }
    }
  )

  // Delete a memory
  ipcMain.handle(
    IPC_CHANNELS.AGENT_MEMORY_DELETE,
    async (_event, { memoryId }) => {
      try {
        const storage = getStorage()
        const success = await storage.agentMemory.deleteMemory(memoryId)
        return { success }
      } catch (error: any) {
        const appError = classifyError(error)
        console.error(`[AgentMemory][${appError.category}] Error deleting agent memory:`, error)
        return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable }
      }
    }
  )

  // Recall a memory (strengthen it)
  ipcMain.handle(
    IPC_CHANNELS.AGENT_MEMORY_RECALL,
    async (_event, { agentId, memoryId }) => {
      try {
        const storage = getStorage()
        const memory = await storage.agentMemory.recallMemory(agentId, memoryId)
        if (!memory) {
          return { success: false, error: 'Memory not found' }
        }
        return { success: true, memory }
      } catch (error: any) {
        const appError = classifyError(error)
        console.error(`[AgentMemory][${appError.category}] Error recalling memory:`, error)
        return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable }
      }
    }
  )

  // Get active memories
  ipcMain.handle(
    IPC_CHANNELS.AGENT_MEMORY_GET_ACTIVE,
    async (_event, { agentId, limit = 10 }) => {
      try {
        const storage = getStorage()
        const memories = await storage.agentMemory.getActiveMemories(agentId, limit)
        return { success: true, memories }
      } catch (error: any) {
        const appError = classifyError(error)
        console.error(`[AgentMemory][${appError.category}] Error getting active memories:`, error)
        return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable }
      }
    }
  )

  // Update relationship
  ipcMain.handle(
    IPC_CHANNELS.AGENT_MEMORY_UPDATE_RELATIONSHIP,
    async (_event, { agentId, updates }) => {
      try {
        const storage = getStorage()
        const relationship = await storage.agentMemory.updateRelationship(agentId, updates)
        return { success: true, relationship }
      } catch (error: any) {
        const appError = classifyError(error)
        console.error(`[AgentMemory][${appError.category}] Error updating relationship:`, error)
        return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable }
      }
    }
  )

  // Record interaction
  ipcMain.handle(
    IPC_CHANNELS.AGENT_MEMORY_RECORD_INTERACTION,
    async (_event, { agentId }) => {
      try {
        const storage = getStorage()
        const relationship = await storage.agentMemory.recordInteraction(agentId)
        return { success: true, relationship }
      } catch (error: any) {
        const appError = classifyError(error)
        console.error(`[AgentMemory][${appError.category}] Error recording interaction:`, error)
        return { success: false, error: appError.message, errorDetails: appError.technicalDetail, errorCategory: appError.category, retryable: appError.retryable }
      }
    }
  )
}
