export interface PluginCommandInfo {
  id: string
  name: string
  description: string
  usage: string
}

export interface GetPluginCommandsResponse {
  success: boolean
  commands?: PluginCommandInfo[]
  error?: string
}

export interface ExecutePluginCommandRequest {
  commandName: string
  args?: string
  sessionId: string
}

export interface ExecutePluginCommandResponse {
  success: boolean
  message?: string
  error?: string
}
