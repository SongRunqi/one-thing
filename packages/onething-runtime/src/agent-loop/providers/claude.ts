import { collectAgentTurnFromStream } from '@onething/core/agent-loop'
import { agentToolMessageContentToText } from '@onething/core/agent-loop'
import { undeliverableAttachmentText } from '@onething/core/agent-loop'
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
} from '@onething/core/agent-loop'

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
  /**
   * Set explicit prompt-cache breakpoints (cache_control: ephemeral) on the
   * system prompt and the conversation tail. Opt-in: enabled for the official
   * Anthropic endpoints; left off for third-party anthropic-compatible
   * endpoints that may reject the field.
   */
  promptCaching?: boolean
}

type ClaudeCacheControl = { type: 'ephemeral' }

type ClaudeTextBlock = { type: 'text'; text: string; cache_control?: ClaudeCacheControl }

type ClaudeImageBlock = {
  type: 'image'
  source:
    | { type: 'base64'; media_type: string; data: string }
    | { type: 'url'; url: string }
  cache_control?: ClaudeCacheControl
}

type ClaudeToolUseBlock = {
  type: 'tool_use'
  id: string
  name: string
  input: AgentJsonValue
  cache_control?: ClaudeCacheControl
}

type ClaudeDocumentBlock = {
  type: 'document'
  source: { type: 'base64'; media_type: string; data: string }
  cache_control?: ClaudeCacheControl
}

type ClaudeToolResultContentBlock = ClaudeTextBlock | ClaudeImageBlock

type ClaudeToolResultBlock = {
  type: 'tool_result'
  tool_use_id: string
  content: string | ClaudeToolResultContentBlock[]
  is_error?: boolean
  cache_control?: ClaudeCacheControl
}

type ClaudeContentBlock =
  | ClaudeTextBlock
  | ClaudeImageBlock
  | ClaudeDocumentBlock
  | ClaudeToolUseBlock
  | ClaudeToolResultBlock

type ClaudeMessage =
  | { role: 'user'; content: string | ClaudeContentBlock[] }
  | { role: 'assistant'; content: string | ClaudeContentBlock[] }

interface ClaudeTool {
  name: string
  description?: string
  input_schema: AgentJsonObject
  cache_control?: ClaudeCacheControl
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
    if (part.type === 'file') {
      if (part.mediaType.startsWith('image/')) {
        blocks.push(imageSourceFromData(part.data, part.mediaType))
        continue
      }
      const pdf = documentSourceFromData(part.data, part.mediaType)
      if (pdf) {
        blocks.push(pdf)
        continue
      }
      // Text files are inlined as text parts upstream; whatever binary is
      // left has no Claude-native form — say so instead of dropping it.
      blocks.push({ type: 'text', text: undeliverableAttachmentText(part) })
    }
  }
  return blocks.length > 0 ? blocks : ''
}

function documentSourceFromData(data: string, mediaType: string): ClaudeDocumentBlock | undefined {
  const parsed = parseDataUrl(data)
  const resolvedMediaType = (parsed?.mediaType ?? mediaType).split(';')[0]?.trim().toLowerCase()
  if (resolvedMediaType !== 'application/pdf') return undefined
  return {
    type: 'document',
    source: {
      type: 'base64',
      media_type: 'application/pdf',
      data: parsed?.data ?? data,
    },
  }
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

/**
 * Explicit prompt-cache breakpoints (Anthropic caches nothing without them):
 * 1. end of system — caches the tools + system prefix, invalidated only when
 *    the system prompt itself changes;
 * 2. end of the conversation — the next turn extends the history, so its
 *    prefix matches this position and reuses the cached conversation.
 * Anthropic matches against the ~20 most recent breakpoint positions, so the
 * sliding tail breakpoint keeps hitting across consecutive turns.
 */
function applyPromptCacheBreakpoints(body: {
  system?: string | ClaudeTextBlock[]
  tools?: ClaudeTool[]
  messages: ClaudeMessage[]
}): void {
  if (body.system) {
    const blocks: ClaudeTextBlock[] = typeof body.system === 'string'
      ? [{ type: 'text', text: body.system }]
      : [...body.system]
    if (blocks.length > 0) {
      blocks[blocks.length - 1] = {
        ...blocks[blocks.length - 1],
        cache_control: { type: 'ephemeral' },
      }
      body.system = blocks
    }
  } else if (body.tools?.length) {
    body.tools[body.tools.length - 1] = {
      ...body.tools[body.tools.length - 1],
      cache_control: { type: 'ephemeral' },
    }
  }

  for (let i = body.messages.length - 1; i >= 0; i--) {
    const message = body.messages[i]
    const blocks: ClaudeContentBlock[] = typeof message.content === 'string'
      ? (message.content ? [{ type: 'text', text: message.content }] : [])
      : [...message.content]
    if (blocks.length === 0) continue
    blocks[blocks.length - 1] = {
      ...blocks[blocks.length - 1],
      cache_control: { type: 'ephemeral' },
    }
    body.messages[i] = { ...message, content: blocks }
    return
  }
}

export function createClaudeAgentProvider(options: ClaudeAgentProviderOptions): AgentProvider {
  const baseUrl = (options.baseUrl || CLAUDE_DEFAULT_BASE_URL).replace(/\/$/, '')
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
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
    if (options.promptCaching) applyPromptCacheBreakpoints(body)

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
