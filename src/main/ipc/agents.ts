import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import { DEFAULT_AGENT_ID, createAgent, deleteAgent, listAgents, updateAgent } from '../agents/index.js'
import { getSessionsList } from '../stores/index.js'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function registerAgentHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.AGENTS_LIST, async () => {
    try {
      return { success: true, agents: listAgents() }
    } catch (error) {
      console.error('[AgentsIPC] list error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.AGENTS_CREATE, async (_event, request) => {
    try {
      const agent = createAgent({
        id: `agent-${uuidv4()}`,
        name: request?.name ?? '',
        systemPrompt: request?.systemPrompt ?? '',
      })
      return { success: true, agent }
    } catch (error) {
      console.error('[AgentsIPC] create error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.AGENTS_UPDATE, async (_event, request) => {
    try {
      const agent = updateAgent({
        agentId: request?.agentId,
        name: request?.name,
        systemPrompt: request?.systemPrompt,
      })
      return { success: true, agent }
    } catch (error) {
      console.error('[AgentsIPC] update error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.AGENTS_DELETE, async (_event, request) => {
    try {
      const agentId = request?.agentId
      if (!agentId) throw new Error('Agent id is required')
      if (agentId === DEFAULT_AGENT_ID) throw new Error('Default Agent cannot be deleted')

      const referenced = getSessionsList().some(session => (session.agentId || DEFAULT_AGENT_ID) === agentId)
      if (referenced) {
        throw new Error('Agent is used by one or more sessions')
      }

      deleteAgent(agentId)
      return { success: true }
    } catch (error) {
      console.error('[AgentsIPC] delete error:', error)
      return { success: false, error: errorMessage(error) }
    }
  })
}
