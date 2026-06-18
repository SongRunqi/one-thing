export type AgentRole = 'system' | 'user' | 'assistant' | 'tool'

export interface AgentToolCall {
  id: string
  name: string
  arguments: string
}

export interface AgentMessage {
  role: AgentRole
  content: string | null
  reasoningContent?: string
  toolCalls?: AgentToolCall[]
  toolCallId?: string
}

export interface AgentToolResult {
  content: string
  error?: string
  data?: unknown
}

export interface AgentToolExecutionContext {
  sessionId: string
  messageId: string
  toolCallId: string
  workingDirectory?: string
  abortSignal?: AbortSignal
}

export interface AgentTool {
  name: string
  description?: string
  parameters: Record<string, unknown>
  execute(args: Record<string, unknown>, ctx: AgentToolExecutionContext): Promise<AgentToolResult>
}

export type AgentToolChoice =
  | 'auto'
  | 'none'
  | {
      type: 'function'
      function: { name: string }
    }

export interface AgentUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export type AgentFinishReason =
  | 'stop'
  | 'length'
  | 'tool_calls'
  | 'content_filter'
  | 'error'
  | 'max_turns'
  | 'unknown'

export interface AgentTurn {
  message: AgentMessage
  finishReason: AgentFinishReason
  usage?: AgentUsage
}

export type AgentStreamEvent =
  | { type: 'turn-start'; turn: number }
  | { type: 'reasoning-delta'; turn: number; delta: string }
  | { type: 'text-delta'; turn: number; delta: string }
  | { type: 'tool-call-start'; turn: number; toolCallId: string; toolName: string }
  | { type: 'tool-call-delta'; turn: number; toolCallId: string; toolName: string; argumentsDelta: string }
  | { type: 'tool-call-done'; turn: number; toolCall: AgentToolCall }
  | { type: 'tool-result'; turn: number; toolCall: AgentToolCall; result: AgentToolResult }
  | { type: 'turn-end'; turn: number; finishReason: AgentFinishReason; usage?: AgentUsage }

export interface AgentTurnRequest {
  model: string
  messages: AgentMessage[]
  tools?: AgentTool[]
  toolChoice?: AgentToolChoice
  temperature?: number
  maxTokens?: number
  thinking?: 'enabled' | 'disabled'
  reasoningEffort?: 'high' | 'max'
  abortSignal?: AbortSignal
  onEvent?: (event: AgentStreamEvent) => void
  turn: number
}

export interface AgentProvider {
  id: string
  runTurn(request: AgentTurnRequest): Promise<AgentTurn>
}

export interface AgentLoopOptions {
  provider: AgentProvider
  model: string
  messages: AgentMessage[]
  tools?: AgentTool[]
  selectedToolNames?: string[]
  toolChoice?: AgentToolChoice
  maxTurns?: number
  temperature?: number
  maxTokens?: number
  thinking?: 'enabled' | 'disabled'
  reasoningEffort?: 'high' | 'max'
  sessionId: string
  messageId: string
  workingDirectory?: string
  abortSignal?: AbortSignal
  onEvent?: (event: AgentStreamEvent) => void
}

export interface AgentLoopToolResult {
  toolCall: AgentToolCall
  result: AgentToolResult
}

export interface AgentLoopResult {
  messages: AgentMessage[]
  text: string
  reasoning: string
  finishReason: AgentFinishReason
  turns: number
  toolResults: AgentLoopToolResult[]
  usage?: AgentUsage
}
