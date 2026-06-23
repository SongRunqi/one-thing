export type {
  ACPAgentConfig,
  ACPAgentState,
  ACPConnectionStatus,
  ACPPermissionMode,
  ACPSettings,
} from '../../shared/ipc.js'

export interface ACPPromptStreamOptions {
  localSessionId: string
  prompt: string
  cwd: string
  abortSignal?: AbortSignal
}

export type ACPPromptStreamEvent =
  | { type: 'update'; notification: import('@agentclientprotocol/sdk').SessionNotification }
  | { type: 'warning'; message: string }
  | {
      type: 'finish'
      stopReason: import('@agentclientprotocol/sdk').StopReason
      usage?: {
        inputTokens: number
        outputTokens: number
        totalTokens: number
      }
    }

