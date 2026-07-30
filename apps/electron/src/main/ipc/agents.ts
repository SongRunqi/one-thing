import { v4 as uuidv4 } from 'uuid'
import {
  registerElectronAgentsIpcHandlers,
  type ElectronAgentCreateRequest,
  type ElectronAgentDeleteRequest,
  type ElectronAgentRestoreRequest,
  type ElectronAgentUpdateRequest,
} from '@onething/electron-host/ipc/agents'
import {
  createOnethingAgentFromRequestForIpc,
  deleteOnethingAgentFromRequestForIpc,
  listOnethingAgentsForIpc,
  restoreOnethingAgentFromRequestForIpc,
  updateOnethingAgentFromRequestForIpc,
} from '@onething/runtime/agents'
import { IPC_CHANNELS } from '@shared/ipc.js'
import {
  DEFAULT_AGENT_ID,
  createAgent,
  deleteAgent,
  listAgents,
  restoreAgent,
  retireAgent,
  updateAgent,
} from '@onething/app/agents/index.js'
import { getSessionsList } from '@onething/app/stores/index.js'

export function registerAgentHandlers(): void {
  registerElectronAgentsIpcHandlers({
    channels: {
      list: IPC_CHANNELS.AGENTS_LIST,
      create: IPC_CHANNELS.AGENTS_CREATE,
      update: IPC_CHANNELS.AGENTS_UPDATE,
      delete: IPC_CHANNELS.AGENTS_DELETE,
      restore: IPC_CHANNELS.AGENTS_RESTORE,
    },
    listAgents: () => {
      return listOnethingAgentsForIpc({ listAgents, logger: console })
    },
    createAgent: (request: ElectronAgentCreateRequest = {}) => {
      return createOnethingAgentFromRequestForIpc({
        name: request.name ?? '',
        systemPrompt: request.systemPrompt ?? '',
        tools: request.tools,
        title: request.title,
        avatar: request.avatar,
        avatarImage: request.avatarImage,
        color: request.color,
        description: request.description,
        model: request.model,
        toolGrants: request.toolGrants,
        permissionMode: request.permissionMode,
        maxTurns: request.maxTurns,
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
        tools: request.tools,
        title: request.title,
        avatar: request.avatar,
        avatarImage: request.avatarImage,
        color: request.color,
        description: request.description,
        model: request.model,
        toolGrants: request.toolGrants,
        permissionMode: request.permissionMode,
        maxTurns: request.maxTurns,
        updateAgent,
        logger: console,
      })
    },
    /**
     * 「删除」的两条路(域模型 §3.2):被引用过 → 退休(墓碑);从未被引用过 →
     * 真硬删。引用检查吃的是 meta-only 的会话快索引(`getSessionsList`),不是
     * 会带出全部转录的 `getSessions`。
     */
    deleteAgent: (request: ElectronAgentDeleteRequest = {}) => {
      return deleteOnethingAgentFromRequestForIpc({
        agentId: request.agentId,
        defaultAgentId: DEFAULT_AGENT_ID,
        listSessions: getSessionsList,
        retireAgent,
        deleteAgent,
        logger: console,
      })
    },
    restoreAgent: (request: ElectronAgentRestoreRequest = {}) => {
      return restoreOnethingAgentFromRequestForIpc({
        agentId: request.agentId,
        restoreAgent,
        logger: console,
      })
    },
  })
}
