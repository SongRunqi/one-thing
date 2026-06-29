type MaybePromise<T> = T | Promise<T>

export interface UpdateOnethingSessionModelOptions {
  sessionId: string
  provider: string
  model: string
  updateSessionModel(sessionId: string, provider: string, model: string): MaybePromise<boolean>
}

export interface UpdateOnethingSessionAgentOptions {
  sessionId: string
  agentId?: string | null
  defaultAgentId: string
  agentExists(agentId: string): boolean
  updateSessionAgent(sessionId: string, agentId: string): MaybePromise<boolean>
}

export interface UpdateOnethingSessionPermissionModeOptions<TPermissionMode extends string = string> {
  sessionId: string
  permissionMode: TPermissionMode
  allowedPermissionModes: readonly TPermissionMode[]
  updateSessionPermissionMode(sessionId: string, permissionMode: TPermissionMode): MaybePromise<boolean>
}

export interface UpdateOnethingSessionResult {
  success: boolean
  error?: string
}

export async function updateOnethingSessionModel(
  options: UpdateOnethingSessionModelOptions,
): Promise<UpdateOnethingSessionResult> {
  const success = await options.updateSessionModel(options.sessionId, options.provider, options.model)
  return success ? { success: true } : { success: false, error: 'Session not found' }
}

export async function updateOnethingSessionAgent(
  options: UpdateOnethingSessionAgentOptions,
): Promise<UpdateOnethingSessionResult> {
  const nextAgentId = options.agentId || options.defaultAgentId
  if (!options.agentExists(nextAgentId)) {
    return { success: false, error: 'Agent not found' }
  }

  const success = await options.updateSessionAgent(options.sessionId, nextAgentId)
  return success ? { success: true } : { success: false, error: 'Session not found' }
}

export async function updateOnethingSessionPermissionMode<TPermissionMode extends string>(
  options: UpdateOnethingSessionPermissionModeOptions<TPermissionMode>,
): Promise<UpdateOnethingSessionResult> {
  if (!options.allowedPermissionModes.includes(options.permissionMode)) {
    return { success: false, error: 'Invalid permission mode' }
  }

  const success = await options.updateSessionPermissionMode(options.sessionId, options.permissionMode)
  return success ? { success: true } : { success: false, error: 'Session not found' }
}
