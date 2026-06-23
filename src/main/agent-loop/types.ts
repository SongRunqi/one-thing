export type AgentRole = 'system' | 'user' | 'assistant' | 'tool'

export type AgentInputModality = 'text' | 'image' | 'file' | 'audio' | 'video'
export type AgentOutputModality = 'text' | 'image' | 'file' | 'audio' | 'video'

export type AgentCapability =
  | 'text-input'
  | 'text-output'
  | 'streaming'
  | 'tool-calls'
  | 'reasoning'
  | 'vision-input'
  | 'file-input'
  | 'file-output'
  | 'image-output'
  | 'audio-input'
  | 'audio-output'
  | 'video-input'
  | 'video-output'

export interface AgentModelCapabilities {
  capabilities: AgentCapability[]
  inputModalities: AgentInputModality[]
  outputModalities: AgentOutputModality[]
  supportsTools?: boolean
  supportsReasoning?: boolean
  supportsStreaming?: boolean
  maxInputTokens?: number
  maxOutputTokens?: number
}

export interface AgentTextContentPart {
  type: 'text'
  text: string
}

export interface AgentImageContentPart {
  type: 'image'
  image: string
  mediaType?: string
}

export interface AgentFileContentPart {
  type: 'file'
  data: string
  mediaType: string
  filename?: string
}

export interface AgentAudioContentPart {
  type: 'audio'
  audio: string
  mediaType?: string
}

export interface AgentVideoContentPart {
  type: 'video'
  video: string
  mediaType?: string
}

export type AgentContentPart =
  | AgentTextContentPart
  | AgentImageContentPart
  | AgentFileContentPart
  | AgentAudioContentPart
  | AgentVideoContentPart

export type AgentMessageContent = string | AgentContentPart[] | null

export interface AgentToolCall {
  id: string
  name: string
  arguments: string
}

export interface AgentMessage {
  role: AgentRole
  content: AgentMessageContent
  reasoningContent?: string
  providerData?: AgentProviderData[]
  toolCalls?: AgentToolCall[]
  toolCallId?: string
}

export interface AgentToolResult {
  content: string
  error?: string
  data?: unknown
  requiresConfirmation?: boolean
  commandType?: 'read-only' | 'dangerous' | 'forbidden'
  aborted?: boolean
  rejected?: boolean
  rejectionReason?: string
}

export type AgentProviderData =
  | {
      provider: 'codex'
      type: 'encrypted-reasoning'
      encryptedContent: string
    }
  | {
      provider: 'codex'
      type: 'image-generation-start'
      callId: string
      status?: string
    }
  | {
      provider: 'codex'
      type: 'image-generation-result'
      callId: string
      status: string
      revisedPrompt?: string
      result: string
    }

export interface AgentToolMetadataUpdate {
  title?: string
  metadata?: Record<string, unknown>
}

export type AgentToolPartialResultUpdate = unknown

export interface AgentToolExecutionContext {
  sessionId: string
  messageId: string
  toolCallId: string
  workingDirectory?: string
  abortSignal?: AbortSignal
  onMetadata?: (update: AgentToolMetadataUpdate) => void
  onPartialResult?: (update: AgentToolPartialResultUpdate) => void
}

export interface AgentTool {
  name: string
  description?: string
  parameters: Record<string, unknown>
  execute(args: Record<string, unknown>, ctx: AgentToolExecutionContext): Promise<AgentToolResult>
}

export interface AgentToolPolicy {
  enabled?: boolean
  allowedToolNames?: string[]
  blockedToolNames?: string[]
}

export interface AgentSkillContext {
  name: string
  description?: string
  instructions?: string
  source?: string
  location?: string
  disableModelInvocation?: boolean
}

export interface AgentPromptInjectionContext {
  provider: AgentProvider
  model: string
  messages: AgentMessage[]
  tools: AgentTool[]
  skills: AgentSkillContext[]
  workingDirectory?: string
}

export type AgentPromptInjector = (
  context: AgentPromptInjectionContext,
) => AgentMessage[] | Promise<AgentMessage[]>

export interface AgentTurnLifecycleContext {
  provider: AgentProvider
  model: string
  messages: AgentMessage[]
  tools: AgentTool[]
  skills: AgentSkillContext[]
  turn: number
  workingDirectory?: string
}

export type AgentBeforeTurnHook = (
  context: AgentTurnLifecycleContext,
) => AgentMessage[] | void | Promise<AgentMessage[] | void>

export type AgentAfterTurnHook = (
  context: AgentTurnLifecycleContext & { turnResult: AgentTurn },
) => AgentMessage[] | void | Promise<AgentMessage[] | void>

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
  | { type: 'finish'; turn: number; finishReason: AgentFinishReason; usage?: AgentUsage }
  | { type: 'tool-metadata'; turn: number; toolCall: AgentToolCall; update: AgentToolMetadataUpdate }
  | { type: 'tool-partial-result'; turn: number; toolCall: AgentToolCall; update: AgentToolPartialResultUpdate }
  | { type: 'provider-data'; turn: number; providerData: AgentProviderData }
  | { type: 'tool-result'; turn: number; toolCall: AgentToolCall; result: AgentToolResult }
  | { type: 'turn-end'; turn: number; finishReason: AgentFinishReason; usage?: AgentUsage }

export type AgentTurnStreamEvent = Extract<
  AgentStreamEvent,
  | { type: 'reasoning-delta' }
  | { type: 'text-delta' }
  | { type: 'tool-call-start' }
  | { type: 'tool-call-delta' }
  | { type: 'tool-call-done' }
  | { type: 'provider-data' }
  | { type: 'finish' }
>

export interface AgentTurnRequest {
  model: string
  messages: AgentMessage[]
  tools?: AgentTool[]
  toolChoice?: AgentToolChoice
  requestedOutputModalities?: AgentOutputModality[]
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
  capabilities?: AgentModelCapabilities
  getModelCapabilities?: (model: string) => AgentModelCapabilities | Promise<AgentModelCapabilities>
  streamTurn?: (request: AgentTurnRequest) => AsyncIterable<AgentTurnStreamEvent>
  runTurn?: (request: AgentTurnRequest) => Promise<AgentTurn>
}

export interface AgentLoopOptions {
  provider: AgentProvider
  model: string
  messages: AgentMessage[]
  requestedOutputModalities?: AgentOutputModality[]
  tools?: AgentTool[]
  toolPolicy?: AgentToolPolicy
  selectedToolNames?: string[]
  skills?: AgentSkillContext[]
  injectSkillPrompts?: boolean
  promptInjectors?: AgentPromptInjector[]
  beforeTurn?: AgentBeforeTurnHook
  afterTurn?: AgentAfterTurnHook
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
