/**
 * MCP IPC Handlers
 *
 * Handles IPC communication for MCP operations
 */

import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import {
  IPC_CHANNELS,
  type MCPServerConfig,
  type MCPGetServersResponse,
  type MCPAddServerRequest,
  type MCPAddServerResponse,
  type MCPUpdateServerRequest,
  type MCPUpdateServerResponse,
  type MCPRemoveServerRequest,
  type MCPRemoveServerResponse,
  type MCPConnectServerRequest,
  type MCPConnectServerResponse,
  type MCPDisconnectServerRequest,
  type MCPDisconnectServerResponse,
  type MCPRefreshServerRequest,
  type MCPRefreshServerResponse,
  type MCPGetToolsResponse,
  type MCPCallToolRequest,
  type MCPCallToolResponse,
  type MCPGetResourcesResponse,
  type MCPReadResourceRequest,
  type MCPReadResourceResponse,
  type MCPGetPromptsResponse,
  type MCPGetPromptRequest,
  type MCPGetPromptResponse,
  type MCPReadConfigFileRequest,
  type MCPReadConfigFileResponse,
} from '../../shared/ipc.js'
import * as fs from 'fs'
import { classifyError } from '../../shared/errors.js'
import { MCPManager, registerMCPTools } from '../mcp/index.js'
import { getSettings, saveSettings } from '../stores/settings.js'

/**
 * Get MCP settings from app settings
 */
function getMCPSettings() {
  const settings = getSettings()
  return settings.mcp || { enabled: true, servers: [] }
}

/**
 * Save MCP settings to app settings
 */
async function saveMCPSettings(mcpSettings: { enabled: boolean; servers: MCPServerConfig[] }) {
  const settings = getSettings()
  settings.mcp = mcpSettings
  await saveSettings(settings)
}

/**
 * Handle get servers
 */
async function handleGetServers(): Promise<MCPGetServersResponse> {
  try {
    const servers = MCPManager.getServerStates()
    return {
      success: true,
      servers,
    }
  } catch (error: any) {
    const appError = classifyError(error)
    console.error(`[MCP][${appError.category}] Failed to get servers:`, error)
    return {
      success: false,
      error: appError.message,
    }
  }
}

/**
 * Handle add server
 */
async function handleAddServer(request: MCPAddServerRequest): Promise<MCPAddServerResponse> {
  try {
    const { config } = request

    // Ensure ID is set
    if (!config.id) {
      config.id = uuidv4()
    }

    // Get current settings and add server
    const mcpSettings = getMCPSettings()
    mcpSettings.servers.push(config)
    await saveMCPSettings(mcpSettings)

    // Connect if enabled
    if (config.enabled) {
      await MCPManager.connectServer(config)
      // Re-register MCP tools
      await registerMCPTools()
    }

    const serverState = MCPManager.getServerState(config.id)

    // Create a clean copy for IPC serialization
    const cleanState = serverState ? JSON.parse(JSON.stringify(serverState)) : {
      config,
      status: 'disconnected',
      tools: [],
      resources: [],
      prompts: [],
    }

    return {
      success: true,
      server: cleanState,
    }
  } catch (error: any) {
    const appError = classifyError(error)
    console.error(`[MCP][${appError.category}] Failed to add server:`, error)
    return {
      success: false,
      error: appError.message,
    }
  }
}

/**
 * Handle update server
 */
async function handleUpdateServer(request: MCPUpdateServerRequest): Promise<MCPUpdateServerResponse> {
  try {
    const { config } = request

    // Update settings
    const mcpSettings = getMCPSettings()
    const index = mcpSettings.servers.findIndex(s => s.id === config.id)

    if (index === -1) {
      return {
        success: false,
        error: 'Server not found',
      }
    }

    mcpSettings.servers[index] = config
    await saveMCPSettings(mcpSettings)

    // Update manager
    await MCPManager.updateSettings(mcpSettings)

    // Re-register MCP tools
    await registerMCPTools()

    const serverState = MCPManager.getServerState(config.id)

    return {
      success: true,
      server: serverState,
    }
  } catch (error: any) {
    const appError = classifyError(error)
    console.error(`[MCP][${appError.category}] Failed to update server:`, error)
    return {
      success: false,
      error: appError.message,
    }
  }
}

/**
 * Handle remove server
 */
async function handleRemoveServer(request: MCPRemoveServerRequest): Promise<MCPRemoveServerResponse> {
  try {
    const { serverId } = request

    // Remove server (disconnect and remove from clients list)
    await MCPManager.removeServer(serverId)

    // Update settings
    const mcpSettings = getMCPSettings()
    mcpSettings.servers = mcpSettings.servers.filter(s => s.id !== serverId)
    await saveMCPSettings(mcpSettings)

    // Re-register MCP tools
    await registerMCPTools()

    return { success: true }
  } catch (error: any) {
    const appError = classifyError(error)
    console.error(`[MCP][${appError.category}] Failed to remove server:`, error)
    return {
      success: false,
      error: appError.message,
    }
  }
}

/**
 * Handle connect server
 */
async function handleConnectServer(request: MCPConnectServerRequest): Promise<MCPConnectServerResponse> {
  try {
    const { serverId } = request

    const mcpSettings = getMCPSettings()
    const config = mcpSettings.servers.find(s => s.id === serverId)

    if (!config) {
      return {
        success: false,
        error: 'Server not found',
      }
    }

    await MCPManager.connectServer(config)

    // Re-register MCP tools
    await registerMCPTools()

    const serverState = MCPManager.getServerState(serverId)

    return {
      success: true,
      server: serverState,
    }
  } catch (error: any) {
    const appError = classifyError(error)
    console.error(`[MCP][${appError.category}] Failed to connect server:`, error)
    return {
      success: false,
      error: appError.message,
    }
  }
}

/**
 * Handle disconnect server
 */
async function handleDisconnectServer(request: MCPDisconnectServerRequest): Promise<MCPDisconnectServerResponse> {
  try {
    const { serverId } = request

    await MCPManager.disconnectServer(serverId)

    // Re-register MCP tools
    await registerMCPTools()

    return { success: true }
  } catch (error: any) {
    const appError = classifyError(error)
    console.error(`[MCP][${appError.category}] Failed to disconnect server:`, error)
    return {
      success: false,
      error: appError.message,
    }
  }
}

/**
 * Handle refresh server
 */
async function handleRefreshServer(request: MCPRefreshServerRequest): Promise<MCPRefreshServerResponse> {
  try {
    const { serverId } = request

    await MCPManager.refreshServer(serverId)

    // Re-register MCP tools
    await registerMCPTools()

    const serverState = MCPManager.getServerState(serverId)

    return {
      success: true,
      server: serverState,
    }
  } catch (error: any) {
    const appError = classifyError(error)
    console.error(`[MCP][${appError.category}] Failed to refresh server:`, error)
    return {
      success: false,
      error: appError.message,
    }
  }
}

/**
 * Handle get tools
 */
async function handleGetTools(): Promise<MCPGetToolsResponse> {
  try {
    const tools = MCPManager.getAllTools()
    return {
      success: true,
      tools,
    }
  } catch (error: any) {
    const appError = classifyError(error)
    console.error(`[MCP][${appError.category}] Failed to get tools:`, error)
    return {
      success: false,
      error: appError.message,
    }
  }
}

/**
 * Handle call tool
 */
async function handleCallTool(request: MCPCallToolRequest): Promise<MCPCallToolResponse> {
  try {
    const { serverId, toolName, arguments: args } = request

    const result = await MCPManager.callTool(serverId, toolName, args)

    return {
      success: result.success,
      content: result.content,
      error: result.error,
      isError: result.isError,
    }
  } catch (error: any) {
    const appError = classifyError(error)
    console.error(`[MCP][${appError.category}] Failed to call tool:`, error)
    return {
      success: false,
      error: appError.message,
    }
  }
}

/**
 * Handle get resources
 */
async function handleGetResources(): Promise<MCPGetResourcesResponse> {
  try {
    const resources = MCPManager.getAllResources()
    return {
      success: true,
      resources,
    }
  } catch (error: any) {
    const appError = classifyError(error)
    console.error(`[MCP][${appError.category}] Failed to get resources:`, error)
    return {
      success: false,
      error: appError.message,
    }
  }
}

/**
 * Handle read resource
 */
async function handleReadResource(request: MCPReadResourceRequest): Promise<MCPReadResourceResponse> {
  try {
    const { serverId, uri } = request

    const result = await MCPManager.readResource(serverId, uri)

    return {
      success: result.success,
      content: result.content,
      error: result.error,
    }
  } catch (error: any) {
    const appError = classifyError(error)
    console.error(`[MCP][${appError.category}] Failed to read resource:`, error)
    return {
      success: false,
      error: appError.message,
    }
  }
}

/**
 * Handle get prompts
 */
async function handleGetPrompts(): Promise<MCPGetPromptsResponse> {
  try {
    const prompts = MCPManager.getAllPrompts()
    return {
      success: true,
      prompts,
    }
  } catch (error: any) {
    const appError = classifyError(error)
    console.error(`[MCP][${appError.category}] Failed to get prompts:`, error)
    return {
      success: false,
      error: appError.message,
    }
  }
}

/**
 * Handle get prompt
 */
async function handleGetPrompt(request: MCPGetPromptRequest): Promise<MCPGetPromptResponse> {
  try {
    const { serverId, name, arguments: args } = request

    const result = await MCPManager.getPrompt(serverId, name, args)

    return {
      success: result.success,
      messages: result.messages,
      error: result.error,
    }
  } catch (error: any) {
    const appError = classifyError(error)
    console.error(`[MCP][${appError.category}] Failed to get prompt:`, error)
    return {
      success: false,
      error: appError.message,
    }
  }
}

/**
 * Handle read config file (for importing MCP configurations)
 */
async function handleReadConfigFile(request: MCPReadConfigFileRequest): Promise<MCPReadConfigFileResponse> {
  try {
    const { filePath } = request

    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        error: 'File not found',
      }
    }

    const content = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(content)

    return {
      success: true,
      content: parsed,
    }
  } catch (error: any) {
    const appError = classifyError(error)
    console.error(`[MCP][${appError.category}] Failed to read config file:`, error)
    return {
      success: false,
      error: appError.message,
    }
  }
}

/**
 * Register all MCP IPC handlers
 */
export function registerMCPHandlers(): void {
  console.log('[MCP IPC] Registering handlers...')

  ipcMain.handle(IPC_CHANNELS.MCP_GET_SERVERS, handleGetServers)
  ipcMain.handle(IPC_CHANNELS.MCP_ADD_SERVER, (_event, request: MCPAddServerRequest) => handleAddServer(request))
  ipcMain.handle(IPC_CHANNELS.MCP_UPDATE_SERVER, (_event, request: MCPUpdateServerRequest) => handleUpdateServer(request))
  ipcMain.handle(IPC_CHANNELS.MCP_REMOVE_SERVER, (_event, request: MCPRemoveServerRequest) => handleRemoveServer(request))
  ipcMain.handle(IPC_CHANNELS.MCP_CONNECT_SERVER, (_event, request: MCPConnectServerRequest) => handleConnectServer(request))
  ipcMain.handle(IPC_CHANNELS.MCP_DISCONNECT_SERVER, (_event, request: MCPDisconnectServerRequest) => handleDisconnectServer(request))
  ipcMain.handle(IPC_CHANNELS.MCP_REFRESH_SERVER, (_event, request: MCPRefreshServerRequest) => handleRefreshServer(request))
  ipcMain.handle(IPC_CHANNELS.MCP_GET_TOOLS, handleGetTools)
  ipcMain.handle(IPC_CHANNELS.MCP_CALL_TOOL, (_event, request: MCPCallToolRequest) => handleCallTool(request))
  ipcMain.handle(IPC_CHANNELS.MCP_GET_RESOURCES, handleGetResources)
  ipcMain.handle(IPC_CHANNELS.MCP_READ_RESOURCE, (_event, request: MCPReadResourceRequest) => handleReadResource(request))
  ipcMain.handle(IPC_CHANNELS.MCP_GET_PROMPTS, handleGetPrompts)
  ipcMain.handle(IPC_CHANNELS.MCP_GET_PROMPT, (_event, request: MCPGetPromptRequest) => handleGetPrompt(request))
  ipcMain.handle(IPC_CHANNELS.MCP_READ_CONFIG_FILE, (_event, request: MCPReadConfigFileRequest) => handleReadConfigFile(request))

  console.log('[MCP IPC] Handlers registered')
}

/**
 * Initialize MCP system
 */
export async function initializeMCP(): Promise<void> {
  console.log('[MCP] Initializing...')

  const mcpSettings = getMCPSettings()

  await MCPManager.initialize(mcpSettings)

  // Register MCP tools with the tool registry
  await registerMCPTools()

  console.log('[MCP] Initialization complete')
}

/**
 * Shutdown MCP system
 */
export async function shutdownMCP(): Promise<void> {
  console.log('[MCP] Shutting down...')
  await MCPManager.shutdown()
  console.log('[MCP] Shutdown complete')
}
