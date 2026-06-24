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

export interface GeminiAgentProviderOptions {
  apiKey?: string
  baseUrl?: string
  fetchImpl?: FetchFn
}

type GeminiPart =
  | { text: string; thought?: boolean }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { mimeType?: string; fileUri: string } }
  | { functionCall: { name: string; args?: AgentJsonObject } }
  | { functionResponse: { name: string; response: AgentJsonObject } }

interface GeminiContent {
  role: 'user' | 'model' | 'function'
  parts: GeminiPart[]
}

interface GeminiTool {
  functionDeclarations: Array<{
    name: string
    description?: string
    parameters?: AgentJsonObject
  }>
}

interface GeminiToolConfig {
  functionCallingConfig: {
    mode: 'AUTO' | 'ANY'
    allowedFunctionNames?: string[]
  }
}

interface GeminiRequestBody {
  systemInstruction?: { parts: Array<{ text: string }> }
  contents: GeminiContent[]
  generationConfig: {
    maxOutputTokens?: number
    temperature?: number
  }
  tools?: GeminiTool[]
  toolConfig?: GeminiToolConfig
}

interface GeminiStreamChunk {
  candidates?: Array<{
    content?: {
      role?: string
      parts?: Array<{
        text?: string
        thought?: boolean
        functionCall?: {
          name?: string
          args?: AgentJsonObject
        }
      }>
    }
    finishReason?: string
  }>
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
  error?: {
    message?: string
    status?: string
    code?: number
  }
}

interface ToolCallAccumulator {
  id: string
  name: string
  arguments: string
  started: boolean
  done: boolean
}

const GEMINI_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'

const GEMINI_CAPABILITIES: AgentModelCapabilities = {
  capabilities: [
    'text-input',
    'vision-input',
    'file-input',
    'audio-input',
    'video-input',
    'text-output',
    'streaming',
    'tool-calls',
    'reasoning',
  ],
  inputModalities: ['text', 'image', 'file', 'audio', 'video'],
  outputModalities: ['text'],
  supportsTools: true,
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
  const match = /^data:([^;,]+);base64,(.*)$/i.exec(value)
  if (!match) return undefined
  return { mediaType: match[1], data: match[2] }
}

function dataPart(data: string, mediaType?: string): GeminiPart {
  if (data.startsWith('http://') || data.startsWith('https://')) {
    return { fileData: { mimeType: mediaType, fileUri: data } }
  }
  const parsed = parseDataUrl(data)
  return {
    inlineData: {
      mimeType: parsed?.mediaType ?? mediaType ?? 'application/octet-stream',
      data: parsed?.data ?? data,
    },
  }
}

function userPartsFromContent(content: AgentMessageContent): GeminiPart[] {
  if (typeof content === 'string') return content ? [{ text: content }] : []
  if (!Array.isArray(content)) return []

  const parts: GeminiPart[] = []
  for (const part of content) {
    if (part.type === 'text') {
      if (part.text) parts.push({ text: part.text })
      continue
    }

    if (part.type === 'image') {
      parts.push(dataPart(part.image, part.mediaType ?? 'image/png'))
      continue
    }

    if (part.type === 'file') {
      parts.push(dataPart(part.data, part.mediaType))
      continue
    }

    if (part.type === 'audio') {
      parts.push(dataPart(part.audio, part.mediaType ?? 'audio/mpeg'))
      continue
    }

    if (part.type === 'video') {
      parts.push(dataPart(part.video, part.mediaType ?? 'video/mp4'))
    }
  }

  return parts
}

function parseToolArguments(args: string): AgentJsonObject {
  const trimmed = args.trim()
  if (!trimmed) return {}
  try {
    const parsed = JSON.parse(trimmed) as AgentJsonValue
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : { value: parsed }
  } catch {
    return { value: trimmed }
  }
}

function toolResultResponse(content: AgentMessageContent): AgentJsonObject {
  const text = agentToolMessageContentToText(content)
  return text ? { result: text } : {}
}

function buildGeminiContents(messages: AgentMessage[]): {
  systemInstruction?: { parts: Array<{ text: string }> }
  contents: GeminiContent[]
} {
  const systemParts: Array<{ text: string }> = []
  const contents: GeminiContent[] = []
  const toolNamesByCallId = new Map<string, string>()

  for (const message of messages) {
    if (message.role === 'system') {
      const text = textFromContent(message.content).trim()
      if (text) systemParts.push({ text })
      continue
    }

    if (message.role === 'assistant') {
      const parts: GeminiPart[] = []
      const text = textFromContent(message.content)
      if (text) parts.push({ text })
      for (const toolCall of message.toolCalls ?? []) {
        toolNamesByCallId.set(toolCall.id, toolCall.name)
        parts.push({
          functionCall: {
            name: toolCall.name,
            args: parseToolArguments(toolCall.arguments),
          },
        })
      }
      if (parts.length > 0) contents.push({ role: 'model', parts })
      continue
    }

    if (message.role === 'tool') {
      const name = toolNamesByCallId.get(message.toolCallId ?? '') ?? message.toolCallId ?? 'tool'
      contents.push({
        role: 'function',
        parts: [{
          functionResponse: {
            name,
            response: toolResultResponse(message.content),
          },
        }],
      })
      continue
    }

    const parts = userPartsFromContent(message.content)
    if (parts.length > 0) contents.push({ role: 'user', parts })
  }

  return {
    ...(systemParts.length ? { systemInstruction: { parts: systemParts } } : {}),
    contents,
  }
}

function toGeminiTools(tools: AgentTool[] | undefined): GeminiTool[] | undefined {
  if (!tools?.length) return undefined
  return [{
    functionDeclarations: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    })),
  }]
}

function toGeminiToolConfig(choice: AgentToolChoice | undefined): GeminiToolConfig | undefined {
  if (!choice || choice === 'auto') {
    return { functionCallingConfig: { mode: 'AUTO' } }
  }
  if (choice === 'none') return undefined
  return {
    functionCallingConfig: {
      mode: 'ANY',
      allowedFunctionNames: [choice.function.name],
    },
  }
}

function mapFinishReason(reason: string | undefined): AgentFinishReason {
  switch (reason) {
    case 'STOP':
      return 'stop'
    case 'MAX_TOKENS':
      return 'length'
    case 'SAFETY':
    case 'RECITATION':
    case 'BLOCKLIST':
    case 'PROHIBITED_CONTENT':
    case 'SPII':
      return 'content_filter'
    case 'MALFORMED_FUNCTION_CALL':
      return 'error'
    default:
      return reason ? 'unknown' : 'unknown'
  }
}

function usageFromChunk(chunk: GeminiStreamChunk): AgentUsage | undefined {
  if (!chunk.usageMetadata) return undefined
  const inputTokens = chunk.usageMetadata.promptTokenCount ?? 0
  const outputTokens = chunk.usageMetadata.candidatesTokenCount ?? 0
  const totalTokens = chunk.usageMetadata.totalTokenCount ?? inputTokens + outputTokens
  return { inputTokens, outputTokens, totalTokens }
}

function stableToolCallId(turn: number, index: number, name: string): string {
  return `gemini-${turn}-${index}-${name || 'tool'}`
}

function stringifyArgs(args: AgentJsonObject | undefined): string {
  try {
    return JSON.stringify(args ?? {})
  } catch {
    return '{}'
  }
}

function toolCallDoneEvent(
  turn: number,
  entry: ToolCallAccumulator,
): Extract<AgentTurnStreamEvent, { type: 'tool-call-done' }> {
  return {
    type: 'tool-call-done',
    turn,
    toolCall: {
      id: entry.id,
      name: entry.name,
      arguments: entry.arguments,
    },
  }
}

async function* streamGeminiResponse(
  response: Response,
  turn: number,
): AsyncGenerator<AgentTurnStreamEvent, void, void> {
  const toolCalls = new Map<number, ToolCallAccumulator>()
  let usage: AgentUsage | undefined
  let finishReason: AgentFinishReason = 'unknown'
  let toolIndex = 0

  for await (const chunk of readJsonSseData<GeminiStreamChunk>(response, {
    sourceName: 'Gemini agent loop',
    invalidMessage: 'invalid stream chunk',
  })) {
    if (chunk.error) {
      throw new Error(`Gemini agent loop API error: ${chunk.error.message ?? chunk.error.status ?? 'unknown error'}`)
    }

    usage = usageFromChunk(chunk) ?? usage
    const candidate = chunk.candidates?.[0]
    if (candidate?.finishReason) finishReason = mapFinishReason(candidate.finishReason)

    for (const part of candidate?.content?.parts ?? []) {
      if (part.text) {
        if (part.thought) {
          yield { type: 'reasoning-delta', turn, delta: part.text }
        } else {
          yield { type: 'text-delta', turn, delta: part.text }
        }
      }

      if (part.functionCall?.name) {
        const index = toolIndex++
        const args = stringifyArgs(part.functionCall.args)
        const entry: ToolCallAccumulator = {
          id: stableToolCallId(turn, index, part.functionCall.name),
          name: part.functionCall.name,
          arguments: args,
          started: true,
          done: true,
        }
        toolCalls.set(index, entry)
        yield {
          type: 'tool-call-start',
          turn,
          toolCallId: entry.id,
          toolName: entry.name,
        }
        if (args) {
          yield {
            type: 'tool-call-delta',
            turn,
            toolCallId: entry.id,
            toolName: entry.name,
            argumentsDelta: args,
          }
        }
        yield toolCallDoneEvent(turn, entry)
      }
    }
  }

  const hasToolCalls = [...toolCalls.values()].some(entry => entry.done)
  yield {
    type: 'finish',
    turn,
    finishReason: hasToolCalls ? 'tool_calls' : finishReason,
    usage,
  }
}

export function createGeminiAgentProvider(options: GeminiAgentProviderOptions): AgentProvider {
  const baseUrl = (options.baseUrl || GEMINI_DEFAULT_BASE_URL).replace(/\/$/, '')
  const fetchImpl = options.fetchImpl ?? createRequiredAppFetch()

  async function* streamTurn(request: AgentTurnRequest): AsyncGenerator<AgentTurnStreamEvent, void, void> {
    const { systemInstruction, contents } = buildGeminiContents(request.messages)
    const tools = request.toolChoice === 'none' ? undefined : toGeminiTools(request.tools)
    const body: GeminiRequestBody = {
      ...(systemInstruction ? { systemInstruction } : {}),
      contents,
      generationConfig: {
        ...(request.maxTokens !== undefined ? { maxOutputTokens: request.maxTokens } : {}),
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      },
    }

    if (tools?.length) {
      body.tools = tools
      body.toolConfig = toGeminiToolConfig(request.toolChoice)
    }

    const url = new URL(`${baseUrl}/models/${encodeURIComponent(request.model)}:streamGenerateContent`)
    url.searchParams.set('alt', 'sse')
    if (options.apiKey) url.searchParams.set('key', options.apiKey)

    const response = await fetchImpl(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.apiKey ? { 'x-goog-api-key': options.apiKey } : {}),
      },
      body: JSON.stringify(body),
      signal: request.abortSignal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Gemini agent loop API error: ${response.status} ${text}`)
    }

    yield* streamGeminiResponse(response, request.turn)
  }

  return {
    id: 'gemini',
    capabilities: GEMINI_CAPABILITIES,
    getModelCapabilities: () => GEMINI_CAPABILITIES,
    streamTurn,
    async runTurn(request: AgentTurnRequest): Promise<AgentTurn> {
      return collectAgentTurnFromStream(streamTurn(request), request.onEvent)
    },
  }
}
