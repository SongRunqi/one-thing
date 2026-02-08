/**
 * CustomAgent IPC Handlers
 *
 * Handles IPC communication for CustomAgent operations:
 * - Get all available agents
 * - Refresh agents (reload from filesystem)
 * - CRUD operations for programmatic configuration
 * - Open agents directory
 */

import { ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc/channels.js'
import type {
  GetCustomAgentsRequest,
  GetCustomAgentsResponse,
  RefreshCustomAgentsRequest,
  RefreshCustomAgentsResponse,
  CreateCustomAgentRequest,
  CreateCustomAgentResponse,
  UpdateCustomAgentRequest,
  UpdateCustomAgentResponse,
  DeleteCustomAgentRequest,
  DeleteCustomAgentResponse,
  CustomAgent,
  PinCustomAgentRequest,
  PinCustomAgentResponse,
  UnpinCustomAgentRequest,
  UnpinCustomAgentResponse,
} from '../../shared/ipc/custom-agents.js'
import { pinAgent, unpinAgent, getPinnedAgentIds } from '../stores/app-state.js'
import {
  loadCustomAgents,
  refreshCustomAgents,
  ensureAgentsDirectories,
  getUserAgentsPath,
  getAvailableBuiltinToolsInfo,
  deleteFileBasedAgent,
  type PermissionDecision,
} from '../services/custom-agent/index.js'
import { respondToPermissionRequest } from '../tools/builtin/custom-agent.js'
import { classifyError } from '../../shared/errors.js'
import {
  getAllCustomAgents,
  getCustomAgent,
  createCustomAgent,
  updateCustomAgent,
  deleteCustomAgent,
  getUserCustomAgentsDir,
} from '../stores/custom-agents.js'

/**
 * Merge file-based and store-based agents
 * Store-based agents take priority over file-based
 */
function mergeAgents(fileAgents: CustomAgent[], storeAgents: CustomAgent[]): CustomAgent[] {
  const agentMap = new Map<string, CustomAgent>()

  // Add file-based agents first
  for (const agent of fileAgents) {
    agentMap.set(agent.name.toLowerCase(), agent)
  }

  // Store-based agents override file-based
  for (const agent of storeAgents) {
    agentMap.set(agent.name.toLowerCase(), agent)
  }

  return Array.from(agentMap.values())
}

/**
 * Initialize CustomAgent system
 */
export async function initializeCustomAgents(): Promise<void> {
  // Ensure directories exist
  ensureAgentsDirectories()

  // Load initial agents from both sources
  const fileAgents = loadCustomAgents()
  const storeAgents = getAllCustomAgents()
  const agents = mergeAgents(fileAgents, storeAgents)
  console.log(`[CustomAgent] Initialized with ${agents.length} agents:`, agents.map(a => a.name))
}

/**
 * Get all available CustomAgents for a session (merges file and store sources)
 */
export function getCustomAgentsForSession(workingDirectory?: string) {
  const fileAgents = loadCustomAgents(workingDirectory)
  const storeAgents = getAllCustomAgents(workingDirectory)
  return mergeAgents(fileAgents, storeAgents)
}

/**
 * Register all CustomAgent IPC handlers
 */
export function registerCustomAgentHandlers(): void {
  // Get all CustomAgents (merges file and store sources)
  ipcMain.handle(
    IPC_CHANNELS.CUSTOM_AGENT_GET_ALL,
    async (_, request: GetCustomAgentsRequest): Promise<GetCustomAgentsResponse> => {
      try {
        const fileAgents = loadCustomAgents(request.workingDirectory)
        const storeAgents = getAllCustomAgents(request.workingDirectory)
        const agents = mergeAgents(fileAgents, storeAgents)
        const pinnedAgentIds = getPinnedAgentIds()
        return {
          success: true,
          agents,
          pinnedAgentIds,
        }
      } catch (error: any) {
        const appError = classifyError(error)
        console.error(`[CustomAgent][${appError.category}] Error getting agents:`, error)
        return {
          success: false,
          error: appError.message,
        }
      }
    }
  )

  // Refresh CustomAgents
  ipcMain.handle(
    IPC_CHANNELS.CUSTOM_AGENT_REFRESH,
    async (_, request: RefreshCustomAgentsRequest): Promise<RefreshCustomAgentsResponse> => {
      try {
        const fileAgents = refreshCustomAgents(request.workingDirectory)
        const storeAgents = getAllCustomAgents(request.workingDirectory)
        const agents = mergeAgents(fileAgents, storeAgents)
        return {
          success: true,
          agents,
        }
      } catch (error: any) {
        const appError = classifyError(error)
        console.error(`[CustomAgent][${appError.category}] Error refreshing agents:`, error)
        return {
          success: false,
          error: appError.message,
        }
      }
    }
  )

  // Get single CustomAgent
  ipcMain.handle(
    IPC_CHANNELS.CUSTOM_AGENT_GET,
    async (_, request: { agentId: string; workingDirectory?: string }): Promise<{ success: boolean; agent?: CustomAgent; error?: string }> => {
      try {
        const agent = getCustomAgent(request.agentId, request.workingDirectory)
        if (!agent) {
          return {
            success: false,
            error: 'Agent not found',
          }
        }
        return {
          success: true,
          agent,
        }
      } catch (error: any) {
        const appError = classifyError(error)
        console.error(`[CustomAgent][${appError.category}] Error getting agent:`, error)
        return {
          success: false,
          error: appError.message,
        }
      }
    }
  )

  // Create CustomAgent
  ipcMain.handle(
    IPC_CHANNELS.CUSTOM_AGENT_CREATE,
    async (_, request: CreateCustomAgentRequest): Promise<CreateCustomAgentResponse> => {
      try {
        const agent = createCustomAgent(request.config, {
          source: request.source,
          workingDirectory: request.workingDirectory,
        })
        console.log(`[CustomAgent] Created agent: ${agent.name}`)
        return {
          success: true,
          agent,
        }
      } catch (error: any) {
        const appError = classifyError(error)
        console.error(`[CustomAgent][${appError.category}] Error creating agent:`, error)
        return {
          success: false,
          error: appError.message,
        }
      }
    }
  )

  // Update CustomAgent
  ipcMain.handle(
    IPC_CHANNELS.CUSTOM_AGENT_UPDATE,
    async (_, request: UpdateCustomAgentRequest): Promise<UpdateCustomAgentResponse> => {
      try {
        const agent = updateCustomAgent(request.agentId, request.updates, request.workingDirectory)
        if (!agent) {
          return {
            success: false,
            error: 'Agent not found',
          }
        }
        console.log(`[CustomAgent] Updated agent: ${agent.name}`)
        return {
          success: true,
          agent,
        }
      } catch (error: any) {
        const appError = classifyError(error)
        console.error(`[CustomAgent][${appError.category}] Error updating agent:`, error)
        return {
          success: false,
          error: appError.message,
        }
      }
    }
  )

  // Delete CustomAgent
  ipcMain.handle(
    IPC_CHANNELS.CUSTOM_AGENT_DELETE,
    async (_, request: DeleteCustomAgentRequest): Promise<DeleteCustomAgentResponse> => {
      try {
        // Try to delete from store first (store-based agents have ID format: custom-agent-xxx)
        let deleted = deleteCustomAgent(request.agentId, request.workingDirectory)

        // If not found in store, try to delete file-based agent (ID format: source:name)
        if (!deleted && request.agentId.includes(':')) {
          deleted = deleteFileBasedAgent(request.agentId, request.workingDirectory)
        }

        if (!deleted) {
          return {
            success: false,
            error: 'Agent not found or could not be deleted',
          }
        }
        console.log(`[CustomAgent] Deleted agent: ${request.agentId}`)
        return {
          success: true,
        }
      } catch (error: any) {
        const appError = classifyError(error)
        console.error(`[CustomAgent][${appError.category}] Error deleting agent:`, error)
        return {
          success: false,
          error: appError.message,
        }
      }
    }
  )

  // Open agents directory (opens store-based directory)
  ipcMain.handle(
    IPC_CHANNELS.CUSTOM_AGENT_OPEN_DIRECTORY,
    async (): Promise<{ success: boolean; error?: string }> => {
      try {
        const agentsDir = getUserCustomAgentsDir()
        await shell.openPath(agentsDir)
        return { success: true }
      } catch (error: any) {
        const appError = classifyError(error)
        console.error(`[CustomAgent][${appError.category}] Error opening directory:`, error)
        return {
          success: false,
          error: appError.message,
        }
      }
    }
  )

  // Get available built-in tools for CustomAgent configuration
  ipcMain.handle(
    IPC_CHANNELS.CUSTOM_AGENT_GET_AVAILABLE_BUILTIN_TOOLS,
    async (): Promise<Array<{ id: string; name: string; description: string }>> => {
      try {
        return await getAvailableBuiltinToolsInfo()
      } catch (error: any) {
        console.error('[CustomAgent] Error getting available builtin tools:', error)
        return []
      }
    }
  )

  // Handle permission response from frontend
  ipcMain.handle(
    IPC_CHANNELS.CUSTOM_AGENT_PERMISSION_RESPOND,
    async (_, request: { requestId: string; decision: PermissionDecision }): Promise<{ success: boolean }> => {
      try {
        const success = respondToPermissionRequest(request.requestId, request.decision)
        if (!success) {
          console.warn(`[CustomAgent] Permission request not found: ${request.requestId}`)
        }
        return { success }
      } catch (error: any) {
        console.error('[CustomAgent] Error responding to permission:', error)
        return { success: false }
      }
    }
  )

  // Pin CustomAgent to sidebar
  ipcMain.handle(
    IPC_CHANNELS.CUSTOM_AGENT_PIN,
    async (_, request: PinCustomAgentRequest): Promise<PinCustomAgentResponse> => {
      try {
        const pinnedAgentIds = pinAgent(request.agentId)
        console.log(`[CustomAgent] Pinned agent: ${request.agentId}`)
        return {
          success: true,
          pinnedAgentIds,
        }
      } catch (error: any) {
        const appError = classifyError(error)
        console.error(`[CustomAgent][${appError.category}] Error pinning agent:`, error)
        return {
          success: false,
          error: appError.message,
        }
      }
    }
  )

  // Unpin CustomAgent from sidebar
  ipcMain.handle(
    IPC_CHANNELS.CUSTOM_AGENT_UNPIN,
    async (_, request: UnpinCustomAgentRequest): Promise<UnpinCustomAgentResponse> => {
      try {
        const pinnedAgentIds = unpinAgent(request.agentId)
        console.log(`[CustomAgent] Unpinned agent: ${request.agentId}`)
        return {
          success: true,
          pinnedAgentIds,
        }
      } catch (error: any) {
        const appError = classifyError(error)
        console.error(`[CustomAgent][${appError.category}] Error unpinning agent:`, error)
        return {
          success: false,
          error: appError.message,
        }
      }
    }
  )

  console.log('[CustomAgent] IPC handlers registered')
}
