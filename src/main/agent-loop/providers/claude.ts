import { createRequiredAppFetch } from '../../providers/bound-fetch.js'
import { collectAgentTurnFromStream } from '../stream.js'
import { agentToolMessageContentToText } from '../tool-results.js'
import { readJsonSseData } from './sse.js'
import type {
  AgentContentPart,
  AgentFinishReason,
  AgentJsonObject,
  AgentJsonValue,
  AgentMessage,
  AgentMessageContent,
  AgentModelCapabilities,
  AgentProvider,
  AgentTool,
  AgentToolChoice,
  AgentTurn,
  AgentTurnRequest,
  AgentTurnStreamEvent,
  AgentUsage,
} from '../types.js'

type FetchFn = typeof globalThis.fetch

export interface ClaudeAgentProviderOptions {
  providerId?: string
  apiKey?: string
  baseUrl?: string
  capabilities?: AgentModelCapabilities
  fetchImpl?: FetchFn
  headers?: Record<string, string>
  omitApiKeyHeader?: boolean
  systemHeader?: string
}

type ClaudeTextBlock = { type: 'text'; text: string }

type ClaudeImageBlock = {
  type: 'image'
  source:
    | { type: 'base64'; media_type: string; data: string }
    | { type: 'url'; url: string }
}

type ClaudeToolUseBlock = {
  type: 'tool_use'
  id: string
  name: string
  input: AgentJsonValue
}

type ClaudeToolResultContentBlock = ClaudeTextBlock | ClaudeImageBlock

type ClaudeToolResultBlock = {
  type: 'tool_result'
  tool_use_id: string
  content: string | ClaudeToolResultContentBlock[]
  is_error?: boolean
}

type ClaudeContentBlock =
  | ClaudeTextBlock
  | ClaudeImageBlock
  | ClaudeToolUseBlock
  | ClaudeToolResultBlock

type ClaudeMessage =
  | { role: 'user'; content: string | ClaudeContentBlock[] }
  | { role: 'assistant'; content: string | ClaudeContentBlock[] }

interface ClaudeTool {
  name: string
  description?: string
  input_schema: AgentJsonObject
}

interface ClaudeStreamEvent {
  type?: string
  index?: number
  content_block?: {
    type?: string
    id?: string
    name?: string
    input?: AgentJsonValue
    text?: string
  }
  delta?: {
    type?: string
    text?: string
    thinking?: string
    partial_json?: string
    stop_reason?: string | null
  }
  usage?: {
    input_tokens?: number
    output_tokens?: number
  }
  message?: {
    usage?: {
      input_tokens?: number
      output_tokens?: number
    }
  }
  error?: {
    message?: string
    type?: string
  }
}

interface ToolUseAccumulator {
  id: string
  name: string
  arguments: string
  started: boolean
}

const CLAUDE_DEFAULT_BASE_URL = 'https://api.anthropic.com/v1'
const CLAUDE_VERSION = '2023-06-01'

const CLAUDE_CAPABILITIES: AgentModelCapabilities = {
  capabilities: [
    'text-input',
    'vision-input',
    'file-input',
    'text-output',
    'streaming',
    'tool-calls',
    'structured-tool-results',
    'reasoning',
  ],
  inputModalities: ['text', 'image', 'file'],
  outputModalities: ['text'],
  toolResultModalities: ['text', 'image'],
  supportsTools: true,
  supportsStructuredToolResults: true,
  supportsReasoning: true,
  supportsStreaming: true,
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

function parseDataUrl(value: string): { mediaType: string; data: string } | undefined {
  const match = value.match(/^data:([^;,]+);base64,(.*)$/)
  if (!match) return undefined
  return { mediaType: match[1], data: match[2] }
}

function imageSourceFromData(data: string, mediaType?: string): ClaudeImageBlock {
  if (data.startsWith('http://') || data.startsWith('https://')) {
    return { type: 'image', source: { type: 'url', url: data } }
  }
  const parsed = parseDataUrl(data)
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: parsed?.mediaType ?? mediaType ?? 'image/png',
      data: parsed?.data ?? data,
    },
  }
}

function userContentBlocks(content: AgentMessageContent): string | ClaudeContentBlock[] {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  const blocks: ClaudeContentBlock[] = []
  for (const part of content) {
    if (part.type === 'text') {
      blocks.push({ type: 'text', text: part.text })
      continue
    }
    if (part.type === 'image') {
      blocks.push(imageSourceFromData(part.image, part.mediaType))
      continue
    }
    if (part.type === 'file' && part.mediaType.startsWith('image/')) {
      blocks.push(imageSourceFromData(part.data, part.mediaType))
    }
  }
  return blocks.length > 0 ? blocks : ''
}

function parseToolArguments(args: string): AgentJsonValue {
  const trimmed = args.trim()
  if (!trimmed) return {}
  try {
    return JSON.parse(trimmed) as AgentJsonValue
  } catch {
    return {}
  }
}

function toolResultContentBlocks(content: AgentMessageContent): string | ClaudeToolResultContentBlock[] {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  const blocks: ClaudeToolResultContentBlock[] = []
  let hasRichContent = false

  for (const part of content) {
    if (part.type === 'text') {
      if (part.text) blocks.push({ type: 'text', text: part.text })
      continue
    }

    if (part.type === 'image') {
      blocks.push(imageSourceFromData(part.image, part.mediaType))
      hasRichContent = true
      continue
    }

    if (part.type === 'file' && part.mediaType.startsWith('image/')) {
      blocks.push(imageSourceFromData(part.data, part.mediaType))
      hasRichContent = true
      continue
    }

    const text = agentToolMessageContentToText([part])
    if (text) blocks.push({ type: 'text', text })
  }

  return hasRichContent ? blocks : agentToolMessageContentToText(content)
}

function buildClaudeMessages(messages: AgentMessage[]): { system?: string; messages: ClaudeMessage[] } {
  const system: string[] = []
  const result: ClaudeMessage[] = []

  for (const message of messages) {
    if (message.role === 'system') {
      const text = textFromContent(message.content).trim()
      if (text) system.push(text)
      continue
    }

    if (message.role === 'tool') {
      result.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: message.toolCallId ?? '',
          content: toolResultContentBlocks(message.content),
        }],
      })
      continue
    }

    if (message.role === 'assistant') {
      const blocks: ClaudeContentBlock[] = []
      const text = textFromContent(message.content)
      if (text) blocks.push({ type: 'text', text })
      for (const toolCall of message.toolCalls ?? []) {
        blocks.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.name,
          input: parseToolArguments(toolCall.arguments),
        })
      }
      result.push({
        role: 'assistant',
        content: blocks.length > 0 ? blocks : '',
      })
      continue
    }

    result.push({
      role: 'user',
      content: userContentBlocks(message.content),
    })
  }

  return {
    ...(system.length > 0 ? { system: system.join('\n\n') } : {}),
    messages: result,
  }
}

function toClaudeTools(tools: AgentTool[] | undefined): ClaudeTool[] | undefined {
  if (!tools?.length) return undefined
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }))
}

type ClaudeToolChoice =
  | { type: 'auto' }
  | { type: 'tool'; name: string }

function toClaudeToolChoice(choice: AgentToolChoice | undefined): ClaudeToolChoice | undefined {
  if (!choice || choice === 'auto') return { type: 'auto' }
  if (choice === 'none') return undefined
  return { type: 'tool', name: choice.function.name }
}

function mapClaudeStopReason(reason: string | null | undefined): AgentFinishReason {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'stop'
    case 'max_tokens':
      return 'length'
    case 'tool_use':
      return 'tool_calls'
    default:
      return reason ? 'unknown' : 'unknown'
  }
}

function usageFromAnthropic(inputTokens = 0, outputTokens = 0): AgentUsage {
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  }
}

function systemBody(options: ClaudeAgentProviderOptions, system: string | undefined): string | ClaudeTextBlock[] | undefined {
  if (!options.systemHeader) return system
  if (!system || system === options.systemHeader) return options.systemHeader
  return [
    { type: 'text', text: options.systemHeader },
    { type: 'text', text: system },
  ]
}

function toolCallDoneEvent(
  turn: number,
  entry: ToolUseAccumulator,
): Extract<AgentTurnStreamEvent, { type: 'tool-call-done' }> {
  return {
    type: 'tool-call-done',
    turn,
    toolCall: {
      id: entry.id,
      name: entry.name,
      arguments: entry.arguments || '{}',
    },
  }
}

async function* streamClaudeResponse(
  response: Response,
  turn: number,
): AsyncGenerator<AgentTurnStreamEvent, void, void> {
  const toolUses = new Map<number, ToolUseAccumulator>()
  let inputTokens = 0
  let outputTokens = 0
  let finishReason: AgentFinishReason = 'unknown'

  for await (const event of readJsonSseData<ClaudeStreamEvent>(response, {
    sourceName: 'Claude agent loop',
    invalidMessage: 'invalid stream event',
  })) {
    if (event.type === 'error' || event.error) {
      throw new Error(`Claude agent loop error: ${event.error?.message ?? 'unknown error'}`)
    }

    if (event.message?.usage) {
      inputTokens = event.message.usage.input_tokens ?? inputTokens
      outputTokens = event.message.usage.output_tokens ?? outputTokens
    }
    if (event.usage) {
      inputTokens = event.usage.input_tokens ?? inputTokens
      outputTokens = event.usage.output_tokens ?? outputTokens
    }

    if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
      const index = event.index ?? toolUses.size
      const input = event.content_block.input && typeof event.content_block.input === 'object'
        ? JSON.stringify(event.content_block.input)
        : ''
      const entry: ToolUseAccumulator = {
        id: event.content_block.id ?? `tool-${turn}-${index}`,
        name: event.content_block.name ?? '',
        arguments: input === '{}' ? '' : input,
        started: true,
      }
      toolUses.set(index, entry)
      yield {
        type: 'tool-call-start',
        turn,
        toolCallId: entry.id,
        toolName: entry.name,
      }
      if (entry.arguments) {
        yield {
          type: 'tool-call-delta',
          turn,
          toolCallId: entry.id,
          toolName: entry.name,
          argumentsDelta: entry.arguments,
        }
      }
      continue
    }

    if (event.type === 'content_block_delta') {
      if (event.delta?.type === 'text_delta' && event.delta.text) {
        yield { type: 'text-delta', turn, delta: event.delta.text }
        continue
      }
      if (event.delta?.type === 'thinking_delta' && event.delta.thinking) {
        yield { type: 'reasoning-delta', turn, delta: event.delta.thinking }
        continue
      }
      if (event.delta?.type === 'input_json_delta') {
        const index = event.index ?? 0
        const entry = toolUses.get(index)
        const partial = event.delta.partial_json ?? ''
        if (entry && partial) {
          entry.arguments += partial
          yield {
            type: 'tool-call-delta',
            turn,
            toolCallId: entry.id,
            toolName: entry.name,
            argumentsDelta: partial,
          }
        }
      }
      continue
    }

    if (event.type === 'content_block_stop') {
      const entry = toolUses.get(event.index ?? -1)
      if (entry?.started) {
        yield toolCallDoneEvent(turn, entry)
        toolUses.delete(event.index ?? -1)
      }
      continue
    }

    if (event.type === 'message_delta') {
      finishReason = mapClaudeStopReason(event.delta?.stop_reason)
      if (event.usage) {
        inputTokens = event.usage.input_tokens ?? inputTokens
        outputTokens = event.usage.output_tokens ?? outputTokens
      }
    }
  }

  for (const [, entry] of [...toolUses.entries()].sort(([a], [b]) => a - b)) {
    yield toolCallDoneEvent(turn, entry)
  }

  yield {
    type: 'finish',
    turn,
    finishReason,
    usage: usageFromAnthropic(inputTokens, outputTokens),
  }
}

export function createClaudeAgentProvider(options: ClaudeAgentProviderOptions): AgentProvider {
  const baseUrl = (options.baseUrl || CLAUDE_DEFAULT_BASE_URL).replace(/\/$/, '')
  const fetchImpl = options.fetchImpl ?? createRequiredAppFetch()
  const capabilities = options.capabilities ?? CLAUDE_CAPABILITIES

  interface ClaudeRequestBody {
    model: string
    messages: ClaudeMessage[]
    max_tokens: number
    stream: true
    system?: string | ClaudeTextBlock[]
    tools?: ClaudeTool[]
    tool_choice?: ClaudeToolChoice
    temperature?: number
  }

  async function* streamTurn(request: AgentTurnRequest): AsyncGenerator<AgentTurnStreamEvent, void, void> {
    const converted = buildClaudeMessages(request.messages)
    const tools = request.toolChoice === 'none' ? undefined : toClaudeTools(request.tools)
    const body: ClaudeRequestBody = {
      model: request.model,
      messages: converted.messages,
      max_tokens: request.maxTokens ?? 4096,
      stream: true,
    }

    const system = systemBody(options, converted.system)
    if (system) body.system = system
    if (tools?.length) {
      body.tools = tools
      body.tool_choice = toClaudeToolChoice(request.toolChoice)
    }
    if (request.temperature !== undefined) body.temperature = request.temperature

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(!options.omitApiKeyHeader ? { 'x-api-key': options.apiKey ?? '' } : {}),
      'anthropic-version': CLAUDE_VERSION,
      ...options.headers,
    }

    const response = await fetchImpl(`${baseUrl}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: request.abortSignal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Claude agent loop API error: ${response.status} ${text}`)
    }

    yield* streamClaudeResponse(response, request.turn)
  }

  return {
    id: options.providerId ?? 'claude',
    capabilities,
    getModelCapabilities: () => capabilities,
    streamTurn,
    async runTurn(request: AgentTurnRequest): Promise<AgentTurn> {
      return collectAgentTurnFromStream(streamTurn(request), request.onEvent)
    },
  }
}
