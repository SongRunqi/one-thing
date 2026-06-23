import type { OAuthToken } from '../../../shared/ipc.js'
import type { ProviderAuthContext } from '../../auth/types.js'
import { createRequiredAppFetch } from '../../providers/bound-fetch.js'
import {
  CODEX_BASE_URL,
  createCodexFetch,
  createCodexModel,
} from '../../providers/builtin/codex.js'
import { agentContentToText, collectAgentTurnFromStream } from '../stream.js'
import type {
  AgentContentPart,
  AgentFinishReason,
  AgentMessage,
  AgentMessageContent,
  AgentModelCapabilities,
  AgentProvider,
  AgentProviderData,
  AgentTool,
  AgentTurn,
  AgentTurnRequest,
  AgentTurnStreamEvent,
  AgentUsage,
} from '../types.js'

type FetchFn = typeof globalThis.fetch

export interface CodexAgentProviderOptions {
  apiKey?: string
  baseUrl?: string
  oauthToken?: OAuthToken
  authContext?: ProviderAuthContext
  fetchImpl?: FetchFn
}

interface CodexPromptMessage {
  role: 'user' | 'assistant' | 'tool'
  content: unknown
  providerOptions?: Record<string, unknown>
}

interface CodexPromptPayload {
  prompt: CodexPromptMessage[]
  instructions?: string
}

const CODEX_AGENT_CAPABILITIES: AgentModelCapabilities = {
  capabilities: [
    'text-input',
    'vision-input',
    'file-input',
    'text-output',
    'image-output',
    'streaming',
    'tool-calls',
    'reasoning',
  ],
  inputModalities: ['text', 'image', 'file'],
  outputModalities: ['text', 'image'],
  supportsTools: true,
  supportsReasoning: true,
  supportsStreaming: true,
}

function resolveCodexToken(options: CodexAgentProviderOptions): OAuthToken | undefined {
  if (options.authContext?.kind === 'oauth') return options.authContext.token
  if (options.oauthToken) return options.oauthToken
  if (options.apiKey) {
    return {
      accessToken: options.apiKey,
      expiresAt: Date.now() + 60 * 60 * 1000,
      tokenType: 'Bearer',
    }
  }
  return undefined
}

function textFromContent(content: AgentMessageContent): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((part): part is Extract<AgentContentPart, { type: 'text' }> => part.type === 'text')
    .map(part => part.text)
    .filter(Boolean)
    .join('\n')
}

function toCodexContent(content: AgentMessageContent, role: 'user' | 'assistant'): unknown {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .map(part => {
      switch (part.type) {
        case 'text':
          return { type: 'text', text: part.text }
        case 'image':
          return role === 'user'
            ? { type: 'image', image: part.image, mediaType: part.mediaType }
            : undefined
        case 'file':
          return role === 'user'
            ? { type: 'file', data: part.data, mediaType: part.mediaType, filename: part.filename }
            : undefined
        default:
          return undefined
      }
    })
    .filter(Boolean)
}

function parseToolArguments(args: string): unknown {
  const trimmed = args.trim()
  if (!trimmed) return {}
  try {
    return JSON.parse(trimmed)
  } catch {
    return args
  }
}

function stringifyCodexToolInput(input: unknown): string {
  if (typeof input === 'string') return input
  try {
    return JSON.stringify(input ?? {})
  } catch {
    return '{}'
  }
}

function codexEncryptedReasoning(message: AgentMessage): string[] {
  return (message.providerData ?? [])
    .filter((data): data is Extract<AgentProviderData, { provider: 'codex'; type: 'encrypted-reasoning' }> =>
      data.provider === 'codex' &&
      data.type === 'encrypted-reasoning' &&
      typeof data.encryptedContent === 'string' &&
      data.encryptedContent.length > 0,
    )
    .map(data => data.encryptedContent)
}

function toCodexAssistantMessage(message: AgentMessage): CodexPromptMessage {
  const content = toCodexContent(message.content, 'assistant')
  const contentParts = Array.isArray(content) ? [...content] : []
  for (const toolCall of message.toolCalls ?? []) {
    contentParts.push({
      type: 'tool-call',
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      input: parseToolArguments(toolCall.arguments),
    })
  }

  const encryptedReasoning = codexEncryptedReasoning(message)
  return {
    role: 'assistant',
    content: contentParts.length > 0 ? contentParts : content,
    ...(encryptedReasoning.length > 0
      ? {
          providerOptions: {
            codex: { encryptedReasoning },
          },
        }
      : {}),
  }
}

function toCodexToolMessage(
  message: AgentMessage,
  toolNamesByCallId: Map<string, string>,
): CodexPromptMessage | undefined {
  const toolCallId = message.toolCallId
  if (!toolCallId) return undefined

  return {
    role: 'tool',
    content: [{
      type: 'tool-result',
      toolCallId,
      toolName: toolNamesByCallId.get(toolCallId) ?? '',
      output: agentContentToText(message.content),
    }],
  }
}

function buildCodexPrompt(messages: AgentMessage[]): CodexPromptPayload {
  const instructions: string[] = []
  const prompt: CodexPromptMessage[] = []
  const toolNamesByCallId = new Map<string, string>()

  for (const message of messages) {
    if (message.role === 'system') {
      const text = textFromContent(message.content).trim()
      if (text) instructions.push(text)
      continue
    }

    if (message.role === 'user') {
      prompt.push({
        role: 'user',
        content: toCodexContent(message.content, 'user'),
      })
      continue
    }

    if (message.role === 'assistant') {
      for (const toolCall of message.toolCalls ?? []) {
        toolNamesByCallId.set(toolCall.id, toolCall.name)
      }
      prompt.push(toCodexAssistantMessage(message))
      continue
    }

    const toolMessage = toCodexToolMessage(message, toolNamesByCallId)
    if (toolMessage) prompt.push(toolMessage)
  }

  return {
    prompt,
    instructions: instructions.filter(Boolean).join('\n\n') || undefined,
  }
}

function toCodexTools(tools: AgentTool[] | undefined): Array<Record<string, unknown>> {
  return (tools ?? []).map(tool => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    inputSchema: tool.parameters,
  }))
}

function buildProviderOptions(request: AgentTurnRequest, instructions: string | undefined): Record<string, unknown> {
  const codex: Record<string, unknown> = {}
  if (instructions) codex.instructions = instructions
  if (request.thinking === 'disabled') codex.thinking = 'disabled'
  if (request.reasoningEffort) codex.reasoningEffort = request.reasoningEffort
  if (request.requestedOutputModalities?.includes('image')) {
    codex.nativeTools = ['image_generation']
  }
  return { codex }
}

function mapCodexFinishReason(reason: unknown): AgentFinishReason {
  switch (reason) {
    case 'stop':
    case 'length':
    case 'error':
      return reason
    case 'tool-calls':
      return 'tool_calls'
    case 'content-filter':
      return 'content_filter'
    default:
      return 'unknown'
  }
}

function mapCodexUsage(usage: any): AgentUsage | undefined {
  if (!usage || typeof usage !== 'object') return undefined
  const inputTokens = typeof usage.inputTokens === 'number' ? usage.inputTokens : undefined
  const outputTokens = typeof usage.outputTokens === 'number' ? usage.outputTokens : undefined
  const totalTokens = typeof usage.totalTokens === 'number'
    ? usage.totalTokens
    : inputTokens !== undefined || outputTokens !== undefined
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : undefined
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) return undefined
  return {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    totalTokens: totalTokens ?? 0,
  }
}

function isCodexProviderData(value: unknown): value is AgentProviderData {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  if (data.provider !== 'codex' || typeof data.type !== 'string') return false

  if (data.type === 'encrypted-reasoning') {
    return typeof data.encryptedContent === 'string' && data.encryptedContent.length > 0
  }
  if (data.type === 'image-generation-start') {
    return typeof data.callId === 'string' && data.callId.length > 0
  }
  if (data.type === 'image-generation-result') {
    return (
      typeof data.callId === 'string' &&
      data.callId.length > 0 &&
      typeof data.status === 'string' &&
      typeof data.result === 'string'
    )
  }
  return false
}

function mapCodexToolCall(part: any) {
  return {
    id: String(part.toolCallId ?? part.id ?? ''),
    name: String(part.toolName ?? part.name ?? ''),
    arguments: stringifyCodexToolInput(part.input ?? part.arguments),
  }
}

export function createCodexAgentProvider(options: CodexAgentProviderOptions): AgentProvider {
  const token = resolveCodexToken(options)
  if (!token?.accessToken) {
    throw new Error('Not logged in to Codex. Please login first.')
  }
  const codexToken = token

  const baseUrl = (options.baseUrl || CODEX_BASE_URL).replace(/\/$/, '')
  const fetchImpl = createCodexFetch(options.fetchImpl ?? createRequiredAppFetch())

  async function* streamTurn(request: AgentTurnRequest): AsyncGenerator<AgentTurnStreamEvent, void, unknown> {
    const { prompt, instructions } = buildCodexPrompt(request.messages)
    const model = createCodexModel(request.model, codexToken, baseUrl, fetchImpl)
    const result = await model.doStream({
      prompt,
      tools: toCodexTools(request.tools),
      providerOptions: buildProviderOptions(request, instructions),
      abortSignal: request.abortSignal,
      maxOutputTokens: request.maxTokens,
      temperature: request.temperature,
    } as any)
    const reader = result.stream.getReader()
    const toolNamesById = new Map<string, string>()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        switch (value.type) {
          case 'reasoning-delta':
            yield { type: 'reasoning-delta', turn: request.turn, delta: String(value.delta ?? '') }
            break
          case 'text-delta':
            yield { type: 'text-delta', turn: request.turn, delta: String(value.delta ?? '') }
            break
          case 'tool-input-start': {
            const toolCallId = String(value.id ?? '')
            const toolName = String(value.toolName ?? '')
            if (toolCallId) toolNamesById.set(toolCallId, toolName)
            yield {
              type: 'tool-call-start',
              turn: request.turn,
              toolCallId,
              toolName,
            }
            break
          }
          case 'tool-input-delta': {
            const toolCallId = String(value.id ?? '')
            yield {
              type: 'tool-call-delta',
              turn: request.turn,
              toolCallId,
              toolName: toolNamesById.get(toolCallId) ?? '',
              argumentsDelta: String(value.delta ?? ''),
            }
            break
          }
          case 'tool-call':
            yield {
              type: 'tool-call-done',
              turn: request.turn,
              toolCall: mapCodexToolCall(value),
            }
            break
          case 'raw':
            if (isCodexProviderData(value.rawValue)) {
              yield {
                type: 'provider-data',
                turn: request.turn,
                providerData: value.rawValue,
              }
            }
            break
          case 'finish':
            yield {
              type: 'finish',
              turn: request.turn,
              finishReason: mapCodexFinishReason(value.finishReason),
              usage: mapCodexUsage(value.usage),
            }
            break
          default:
            break
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  return {
    id: 'codex',
    capabilities: CODEX_AGENT_CAPABILITIES,
    getModelCapabilities: () => CODEX_AGENT_CAPABILITIES,
    streamTurn,
    async runTurn(request: AgentTurnRequest): Promise<AgentTurn> {
      return collectAgentTurnFromStream(streamTurn(request), request.onEvent)
    },
  }
}
