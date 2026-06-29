import {
  DEFAULT_ONETHING_AGENT_ID,
  type CreateOnethingAgentInput,
  type OnethingAgentDefinition,
  type UpdateOnethingAgentInput,
} from './store.js'

type MaybePromise<T> = T | Promise<T>

export interface OnethingAgentsIpcLogger {
  error?: (...args: unknown[]) => void
}

export type OnethingAgentIpcResult<TPayload extends object = {}> =
  | ({ success: true } & TPayload)
  | { success: false; error: string }

export interface OnethingAgentSessionLike {
  agentId?: string | null
}

export interface ListOnethingAgentsOptions<TAgent extends OnethingAgentDefinition = OnethingAgentDefinition> {
  listAgents(): MaybePromise<TAgent[]>
}

export interface ListOnethingAgentsResult<TAgent extends OnethingAgentDefinition = OnethingAgentDefinition> {
  success: true
  agents: TAgent[]
}

export async function listOnethingAgents<TAgent extends OnethingAgentDefinition>(
  options: ListOnethingAgentsOptions<TAgent>,
): Promise<ListOnethingAgentsResult<TAgent>> {
  return {
    success: true,
    agents: await options.listAgents(),
  }
}

export async function listOnethingAgentsForIpc<TAgent extends OnethingAgentDefinition>(
  options: ListOnethingAgentsOptions<TAgent> & {
    logger?: OnethingAgentsIpcLogger
  },
): Promise<OnethingAgentIpcResult<{ agents: TAgent[] }>> {
  try {
    return await listOnethingAgents(options)
  } catch (error) {
    return agentIpcError(options.logger, 'list agents', error)
  }
}

export interface CreateOnethingAgentFromRequestOptions<
  TAgent extends OnethingAgentDefinition = OnethingAgentDefinition,
> {
  name?: string
  systemPrompt?: string
  createId(): string
  createAgent(input: CreateOnethingAgentInput): MaybePromise<TAgent>
}

export interface CreateOnethingAgentFromRequestResult<
  TAgent extends OnethingAgentDefinition = OnethingAgentDefinition,
> {
  success: true
  agent: TAgent
}

export async function createOnethingAgentFromRequest<TAgent extends OnethingAgentDefinition>(
  options: CreateOnethingAgentFromRequestOptions<TAgent>,
): Promise<CreateOnethingAgentFromRequestResult<TAgent>> {
  return {
    success: true,
    agent: await options.createAgent({
      id: `agent-${options.createId()}`,
      name: options.name ?? '',
      systemPrompt: options.systemPrompt ?? '',
    }),
  }
}

export async function createOnethingAgentFromRequestForIpc<TAgent extends OnethingAgentDefinition>(
  options: CreateOnethingAgentFromRequestOptions<TAgent> & {
    logger?: OnethingAgentsIpcLogger
  },
): Promise<OnethingAgentIpcResult<{ agent: TAgent }>> {
  try {
    return await createOnethingAgentFromRequest(options)
  } catch (error) {
    return agentIpcError(options.logger, 'create agent', error)
  }
}

export interface UpdateOnethingAgentFromRequestOptions<
  TAgent extends OnethingAgentDefinition = OnethingAgentDefinition,
> extends UpdateOnethingAgentInput {
  updateAgent(input: UpdateOnethingAgentInput): MaybePromise<TAgent>
}

export interface UpdateOnethingAgentFromRequestResult<
  TAgent extends OnethingAgentDefinition = OnethingAgentDefinition,
> {
  success: true
  agent: TAgent
}

export async function updateOnethingAgentFromRequest<TAgent extends OnethingAgentDefinition>(
  options: UpdateOnethingAgentFromRequestOptions<TAgent>,
): Promise<UpdateOnethingAgentFromRequestResult<TAgent>> {
  return {
    success: true,
    agent: await options.updateAgent({
      agentId: options.agentId,
      name: options.name,
      systemPrompt: options.systemPrompt,
    }),
  }
}

export async function updateOnethingAgentFromRequestForIpc<TAgent extends OnethingAgentDefinition>(
  options: UpdateOnethingAgentFromRequestOptions<TAgent> & {
    logger?: OnethingAgentsIpcLogger
  },
): Promise<OnethingAgentIpcResult<{ agent: TAgent }>> {
  try {
    return await updateOnethingAgentFromRequest(options)
  } catch (error) {
    return agentIpcError(options.logger, 'update agent', error)
  }
}

export interface DeleteOnethingAgentFromRequestOptions<TSession extends OnethingAgentSessionLike = OnethingAgentSessionLike> {
  agentId?: string | null
  defaultAgentId?: string
  sessions: TSession[]
  deleteAgent(agentId: string): MaybePromise<void>
}

export interface DeleteOnethingAgentFromRequestResult {
  success: true
}

export async function deleteOnethingAgentFromRequest<TSession extends OnethingAgentSessionLike>(
  options: DeleteOnethingAgentFromRequestOptions<TSession>,
): Promise<DeleteOnethingAgentFromRequestResult> {
  const defaultAgentId = options.defaultAgentId ?? DEFAULT_ONETHING_AGENT_ID
  const agentId = options.agentId
  if (!agentId) throw new Error('Agent id is required')
  if (agentId === defaultAgentId) throw new Error('Default Agent cannot be deleted')

  const referenced = options.sessions.some(session => (session.agentId || defaultAgentId) === agentId)
  if (referenced) {
    throw new Error('Agent is used by one or more sessions')
  }

  await options.deleteAgent(agentId)
  return { success: true }
}

export async function deleteOnethingAgentFromRequestForIpc<TSession extends OnethingAgentSessionLike>(
  options: {
    agentId?: string | null
    defaultAgentId?: string
    listSessions(): MaybePromise<TSession[]>
    deleteAgent(agentId: string): MaybePromise<void>
    logger?: OnethingAgentsIpcLogger
  },
): Promise<OnethingAgentIpcResult> {
  try {
    return await deleteOnethingAgentFromRequest({
      agentId: options.agentId,
      defaultAgentId: options.defaultAgentId,
      sessions: await options.listSessions(),
      deleteAgent: options.deleteAgent,
    })
  } catch (error) {
    return agentIpcError(options.logger, 'delete agent', error)
  }
}

function agentIpcError(
  logger: OnethingAgentsIpcLogger | undefined,
  label: string,
  error: unknown,
): { success: false; error: string } {
  logger?.error?.(`[AgentsIPC] Failed to ${label}:`, error)
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
  }
}
