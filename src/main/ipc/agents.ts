import { v4 as uuidv4 } from 'uuid'
import {
  registerElectronAgentsIpcHandlers,
  type ElectronAgentCreateRequest,
  type ElectronAgentDeleteRequest,
  type ElectronAgentUpdateRequest,
} from '@onething/electron-host/ipc/agents'
import {
  createOnethingAgentFromRequestForIpc,
  deleteOnethingAgentFromRequestForIpc,
  listOnethingAgentsForIpc,
  updateOnethingAgentFromRequestForIpc,
} from '@onething/runtime/agents'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import { DEFAULT_AGENT_ID, createAgent, deleteAgent, listAgents, updateAgent } from '../agents/index.js'
import { getSessionsList } from '../stores/index.js'

export function registerAgentHandlers(): void {
  registerElectronAgentsIpcHandlers({
    channels: {
      list: IPC_CHANNELS.AGENTS_LIST,
      create: IPC_CHANNELS.AGENTS_CREATE,
      update: IPC_CHANNELS.AGENTS_UPDATE,
      delete: IPC_CHANNELS.AGENTS_DELETE,
    },
    listAgents: () => {
      return listOnethingAgentsForIpc({ listAgents, logger: console })
    },
    createAgent: (request: ElectronAgentCreateRequest = {}) => {
      return createOnethingAgentFromRequestForIpc({
        name: request.name ?? '',
        systemPrompt: request.systemPrompt ?? '',
        createId: uuidv4,
        createAgent,
        logger: console,
      })
    },
    updateAgent: (request: ElectronAgentUpdateRequest = {}) => {
      return updateOnethingAgentFromRequestForIpc({
        agentId: request.agentId ?? '',
        name: request.name,
        systemPrompt: request.systemPrompt,
        updateAgent,
        logger: console,
      })
    },
    deleteAgent: (request: ElectronAgentDeleteRequest = {}) => {
      return deleteOnethingAgentFromRequestForIpc({
        agentId: request.agentId,
        defaultAgentId: DEFAULT_AGENT_ID,
        listSessions: getSessionsList,
        deleteAgent,
        logger: console,
      })
    },
  })
}
