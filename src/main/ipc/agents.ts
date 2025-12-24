import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import * as agentsStore from '../stores/agents.js'

export function registerAgentHandlers() {
  // Get all agents
  ipcMain.handle(IPC_CHANNELS.AGENT_GET_ALL, async () => {
    const agents = agentsStore.getAgents()
    const pinnedAgentIds = agentsStore.getPinnedAgentIds()
    return { success: true, agents, pinnedAgentIds }
  })

  // Create new agent
  ipcMain.handle(IPC_CHANNELS.AGENT_CREATE, async (_event, { name, avatar, systemPrompt, tagline, personality, primaryColor }) => {
    try {
      const agentId = uuidv4()
      const agent = agentsStore.createAgent(agentId, name, avatar, systemPrompt, { tagline, personality, primaryColor })
      return { success: true, agent }
    } catch (error: any) {
      console.error('Error creating agent:', error)
      return { success: false, error: error.message || 'Failed to create agent' }
    }
  })

  // Update agent
  ipcMain.handle(IPC_CHANNELS.AGENT_UPDATE, async (_event, { id, name, avatar, systemPrompt, tagline, personality, primaryColor }) => {
    try {
      const agent = agentsStore.updateAgent(id, { name, avatar, systemPrompt, tagline, personality, primaryColor })
      if (!agent) {
        return { success: false, error: 'Agent not found' }
      }
      return { success: true, agent }
    } catch (error: any) {
      console.error('Error updating agent:', error)
      return { success: false, error: error.message || 'Failed to update agent' }
    }
  })

  // Delete agent
  ipcMain.handle(IPC_CHANNELS.AGENT_DELETE, async (_event, { agentId }) => {
    try {
      const success = agentsStore.deleteAgent(agentId)
      if (!success) {
        return { success: false, error: 'Agent not found' }
      }
      return { success: true }
    } catch (error: any) {
      console.error('Error deleting agent:', error)
      return { success: false, error: error.message || 'Failed to delete agent' }
    }
  })

  // Upload agent avatar
  ipcMain.handle(IPC_CHANNELS.AGENT_UPLOAD_AVATAR, async (_event, { agentId, imageData, mimeType }) => {
    try {
      const avatarPath = agentsStore.uploadAgentAvatar(agentId, imageData, mimeType)
      if (!avatarPath) {
        return { success: false, error: 'Failed to upload avatar' }
      }
      return { success: true, avatarPath }
    } catch (error: any) {
      console.error('Error uploading avatar:', error)
      return { success: false, error: error.message || 'Failed to upload avatar' }
    }
  })

  // Pin agent
  ipcMain.handle(IPC_CHANNELS.AGENT_PIN, async (_event, { agentId }) => {
    try {
      const pinnedAgentIds = agentsStore.pinAgent(agentId)
      return { success: true, pinnedAgentIds }
    } catch (error: any) {
      console.error('Error pinning agent:', error)
      return { success: false, error: error.message || 'Failed to pin agent' }
    }
  })

  // Unpin agent
  ipcMain.handle(IPC_CHANNELS.AGENT_UNPIN, async (_event, { agentId }) => {
    try {
      const pinnedAgentIds = agentsStore.unpinAgent(agentId)
      return { success: true, pinnedAgentIds }
    } catch (error: any) {
      console.error('Error unpinning agent:', error)
      return { success: false, error: error.message || 'Failed to unpin agent' }
    }
  })
}
