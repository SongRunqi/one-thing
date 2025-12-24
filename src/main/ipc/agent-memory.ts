import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type { AgentMemoryCategory } from '../../shared/ipc.js'
import { getStorage } from '../storage/index.js'

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
        console.error('Error getting agent relationship:', error)
        return { success: false, error: error.message || 'Failed to get relationship' }
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
        console.error('Error adding agent memory:', error)
        return { success: false, error: error.message || 'Failed to add memory' }
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
        console.error('Error recalling memory:', error)
        return { success: false, error: error.message || 'Failed to recall memory' }
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
        console.error('Error getting active memories:', error)
        return { success: false, error: error.message || 'Failed to get memories' }
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
        console.error('Error updating relationship:', error)
        return { success: false, error: error.message || 'Failed to update relationship' }
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
        console.error('Error recording interaction:', error)
        return { success: false, error: error.message || 'Failed to record interaction' }
      }
    }
  )
}
