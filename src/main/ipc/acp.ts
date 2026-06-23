import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import {
  IPC_CHANNELS,
  type ACPAddAgentRequest,
  type ACPAddAgentResponse,
  type ACPAgentConfig,
  type ACPConnectAgentRequest,
  type ACPConnectAgentResponse,
  type ACPDisconnectAgentRequest,
  type ACPDisconnectAgentResponse,
  type ACPGetAgentsResponse,
  type ACPRefreshAgentRequest,
  type ACPRefreshAgentResponse,
  type ACPRemoveAgentRequest,
  type ACPRemoveAgentResponse,
  type ACPUpdateAgentRequest,
  type ACPUpdateAgentResponse,
  type ACPCancelSessionRequest,
  type ACPCancelSessionResponse,
} from '../../shared/ipc.js'
import { ACPManager } from '../acp/index.js'
import { getSettings, saveSettings } from '../stores/settings.js'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function getACPSettings() {
  return getSettings().acp || { enabled: true, agents: [] }
}

function normalizeConfig(config: ACPAgentConfig): ACPAgentConfig {
  return {
    ...config,
    id: config.id || `acp-${uuidv4()}`,
    name: config.name?.trim() || config.command || 'ACP Agent',
    command: config.command?.trim() || '',
    args: Array.isArray(config.args) ? config.args : [],
    env: config.env && typeof config.env === 'object' ? config.env : undefined,
    enabled: config.enabled !== false,
    permissionMode: config.permissionMode === 'reject' ? 'reject' : 'allow',
  }
}

async function saveACPSettings(acpSettings: ReturnType<typeof getACPSettings>): Promise<void> {
  const settings = getSettings()
  settings.acp = acpSettings
  saveSettings(settings)
  ACPManager.updateSettings(acpSettings)
}

async function handleGetAgents(): Promise<ACPGetAgentsResponse> {
  try {
    ACPManager.updateSettings(getACPSettings())
    return { success: true, agents: ACPManager.getAgentStates() }
  } catch (error) {
    return { success: false, error: errorMessage(error) }
  }
}

async function handleAddAgent(request: ACPAddAgentRequest): Promise<ACPAddAgentResponse> {
  try {
    const config = normalizeConfig(request.config)
    if (!config.command) throw new Error('ACP agent command is required')

    const acpSettings = getACPSettings()
    if (acpSettings.agents.some(agent => agent.id === config.id)) {
      throw new Error(`ACP agent "${config.id}" already exists`)
    }
    acpSettings.agents.push(config)
    await saveACPSettings(acpSettings)
    return { success: true, agent: ACPManager.getAgentState(config.id) }
  } catch (error) {
    return { success: false, error: errorMessage(error) }
  }
}

async function handleUpdateAgent(request: ACPUpdateAgentRequest): Promise<ACPUpdateAgentResponse> {
  try {
    const config = normalizeConfig(request.config)
    if (!config.command) throw new Error('ACP agent command is required')

    const acpSettings = getACPSettings()
    const index = acpSettings.agents.findIndex(agent => agent.id === config.id)
    if (index === -1) throw new Error(`ACP agent "${config.id}" not found`)

    acpSettings.agents[index] = config
    await saveACPSettings(acpSettings)
    return { success: true, agent: ACPManager.getAgentState(config.id) }
  } catch (error) {
    return { success: false, error: errorMessage(error) }
  }
}

async function handleRemoveAgent(request: ACPRemoveAgentRequest): Promise<ACPRemoveAgentResponse> {
  try {
    const acpSettings = getACPSettings()
    acpSettings.agents = acpSettings.agents.filter(agent => agent.id !== request.agentId)
    await ACPManager.disconnectAgent(request.agentId)
    await saveACPSettings(acpSettings)
    return { success: true }
  } catch (error) {
    return { success: false, error: errorMessage(error) }
  }
}

async function handleConnectAgent(request: ACPConnectAgentRequest): Promise<ACPConnectAgentResponse> {
  try {
    ACPManager.updateSettings(getACPSettings())
    const agent = await ACPManager.connectAgent(request.agentId)
    return { success: true, agent }
  } catch (error) {
    return { success: false, error: errorMessage(error) }
  }
}

async function handleDisconnectAgent(request: ACPDisconnectAgentRequest): Promise<ACPDisconnectAgentResponse> {
  try {
    await ACPManager.disconnectAgent(request.agentId)
    return { success: true }
  } catch (error) {
    return { success: false, error: errorMessage(error) }
  }
}

async function handleRefreshAgent(request: ACPRefreshAgentRequest): Promise<ACPRefreshAgentResponse> {
  try {
    ACPManager.updateSettings(getACPSettings())
    const agent = await ACPManager.refreshAgent(request.agentId)
    return { success: true, agent }
  } catch (error) {
    return { success: false, error: errorMessage(error) }
  }
}

async function handleCancelSession(request: ACPCancelSessionRequest): Promise<ACPCancelSessionResponse> {
  try {
    await ACPManager.cancelSession(request.sessionId, request.agentId)
    return { success: true }
  } catch (error) {
    return { success: false, error: errorMessage(error) }
  }
}

export function registerACPHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.ACP_GET_AGENTS, handleGetAgents)
  ipcMain.handle(IPC_CHANNELS.ACP_ADD_AGENT, (_event, request) => handleAddAgent(request))
  ipcMain.handle(IPC_CHANNELS.ACP_UPDATE_AGENT, (_event, request) => handleUpdateAgent(request))
  ipcMain.handle(IPC_CHANNELS.ACP_REMOVE_AGENT, (_event, request) => handleRemoveAgent(request))
  ipcMain.handle(IPC_CHANNELS.ACP_CONNECT_AGENT, (_event, request) => handleConnectAgent(request))
  ipcMain.handle(IPC_CHANNELS.ACP_DISCONNECT_AGENT, (_event, request) => handleDisconnectAgent(request))
  ipcMain.handle(IPC_CHANNELS.ACP_REFRESH_AGENT, (_event, request) => handleRefreshAgent(request))
  ipcMain.handle(IPC_CHANNELS.ACP_CANCEL_SESSION, (_event, request) => handleCancelSession(request))
}

export function initializeACP(): void {
  ACPManager.initialize(getACPSettings())
}

export async function shutdownACP(): Promise<void> {
  await ACPManager.shutdown()
}

