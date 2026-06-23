/**
 * Codex Provider Definition
 *
 * Uses ChatGPT subscription OAuth credentials against the Codex backend.
 */

import type {
  CodexProviderUsage,
  CodexUsageCredits,
  CodexUsageLimit,
  CodexUsageWindow,
  OAuthToken,
  OpenRouterModel,
} from '../../../shared/ipc.js'
import type { ProviderCallOptions, ProviderCallPreparationContext, ProviderDefinition } from '../types.js'
import { createBoundFetch, createRequiredAppFetch } from '../bound-fetch.js'
import { dumpProviderRequest } from '../request-dump.js'

export const CODEX_PROVIDER_ID = 'codex'
export const CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex'
export const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'
export const CODEX_DEFAULT_MODEL = 'gpt-5.3-codex'
export const CODEX_CLIENT_VERSION = process.env.npm_package_version || '1.1.0'
export const CODEX_FALLBACK_INSTRUCTIONS = 'You are Codex, a helpful AI coding assistant.'

const CODEX_REASONING_INCLUDE = 'reasoning.encrypted_content'
const CODEX_REASONING_EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh'] as const
const CODEX_FALLBACK_REASONING_EFFORTS: CodexReasoningEffort[] = ['minimal', 'low', 'medium', 'high', 'xhigh']
const CODEX_NATIVE_IMAGE_GENERATION_TOOL = 'image_generation'
const CODEX_RESPONSES_ALLOWED_KEYS = new Set([
  'model',
  'instructions',
  'input',
  'tools',
  'tool_choice',
  'parallel_tool_calls',
  'reasoning',
  'store',
  'stream',
  'include',
  'service_tier',
  'prompt_cache_key',
  'text',
  'client_metadata',
])

type FetchFn = typeof globalThis.fetch

type CodexFinishReason = 'stop' | 'length' | 'tool-calls' | 'content-filter' | 'error' | 'other' | 'unknown'

interface CodexUsage {
  inputTokens: number | undefined
  outputTokens: number | undefined
  totalTokens: number | undefined
  reasoningTokens?: number | undefined
  cachedInputTokens?: number | undefined
}

interface CodexFunctionToolDefinition {
  type: 'function'
  name: string
  description?: string
  inputSchema?: unknown
}

interface CodexCallOptions {
  prompt: any[]
  tools?: Array<CodexFunctionToolDefinition | { type: string; [key: string]: unknown }>
  providerOptions?: Record<string, any>
  headers?: Record<string, string | undefined>
  abortSignal?: AbortSignal
  maxOutputTokens?: number
  temperature?: number
  [key: string]: any
}

interface CodexCallWarning {
  type: 'unsupported-setting'
  setting: keyof CodexCallOptions
  details?: string
}

type CodexStreamPart = { type: string; [key: string]: any }
type CodexGeneratedContent = { type: string; [key: string]: any }
type CodexReasoningEffort = typeof CODEX_REASONING_EFFORTS[number]
type CodexNativeToolName = typeof CODEX_NATIVE_IMAGE_GENERATION_TOOL

interface CodexLanguageModel {
  specificationVersion: 'v2'
  provider: string
  modelId: string
  supportedUrls: Record<string, RegExp[]>
  doStream(options: CodexCallOptions): Promise<{
    stream: ReadableStream<CodexStreamPart>
    request?: { body?: unknown }
    response?: { headers?: Record<string, string> }
  }>
  doGenerate(options: CodexCallOptions): Promise<{
    content: CodexGeneratedContent[]
    finishReason: CodexFinishReason
    usage: CodexUsage
    warnings: CodexCallWarning[]
    request?: { body?: unknown }
    response?: { headers?: Record<string, string>; modelId?: string; timestamp?: Date }
  }>
}

interface CodexContentItem {
  type: 'input_text' | 'input_image' | 'output_text'
  text?: string
  image_url?: string
  detail?: 'auto' | 'low' | 'high'
}

interface CodexMessageItem {
  type: 'message'
  role: 'developer' | 'user' | 'assistant'
  content: CodexContentItem[]
}

interface CodexFunctionCallItem {
  type: 'function_call'
  name: string
  arguments: string
  call_id: string
}

interface CodexFunctionCallOutputItem {
  type: 'function_call_output'
  call_id: string
  output: string
}

interface CodexReasoningInputItem {
  type: 'reasoning'
  summary: unknown[]
  encrypted_content: string
}

type CodexInputItem = CodexMessageItem | CodexFunctionCallItem | CodexFunctionCallOutputItem | CodexReasoningInputItem

interface CodexFunctionTool {
  type: 'function'
  name: string
  description?: string
  strict?: boolean
  parameters?: Record<string, unknown>
}

interface CodexImageGenerationTool {
  type: 'image_generation'
  output_format: 'png'
}

type CodexTool = CodexFunctionTool | CodexImageGenerationTool

interface CodexReasoningOptions {
  effort?: CodexReasoningEffort
  summary?: 'auto' | 'concise' | 'detailed'
}

interface CodexRequest {
  model: string
  instructions: string
  input: CodexInputItem[]
  tools: CodexTool[]
  tool_choice: 'auto'
  parallel_tool_calls: boolean
  reasoning?: CodexReasoningOptions
  store: false
  stream: true
  include: string[]
  service_tier?: string
  prompt_cache_key?: string
  text?: Record<string, unknown>
  client_metadata?: Record<string, unknown>
}

interface CodexSseEvent {
  type?: string
  delta?: string
  item_id?: string
  call_id?: string
  output_index?: number
  item?: any
  response?: {
    id?: string
    model?: string
    usage?: {
      input_tokens?: number
      output_tokens?: number
      total_tokens?: number
      output_tokens_details?: { reasoning_tokens?: number }
      input_tokens_details?: { cached_tokens?: number }
    }
    error?: { message?: string; code?: string; type?: string }
    incomplete_details?: { reason?: string }
  }
  error?: { message?: string; code?: string; type?: string }
}

interface BuiltCodexRequest {
  body: CodexRequest
  warnings: CodexCallWarning[]
}

function getCodexToken(config: { apiKey?: string; oauthToken?: OAuthToken; authContext?: any }): OAuthToken | null {
  if (config.authContext?.kind === 'oauth') return config.authContext.token
  if (config.oauthToken) return config.oauthToken
  if (config.apiKey) {
    return {
      accessToken: config.apiKey,
      expiresAt: Date.now() + 60 * 60 * 1000,
      tokenType: 'Bearer',
    }
  }
  return null
}

export function buildCodexHeaders(token: OAuthToken): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token.accessToken}`,
    originator: 'codex_cli_rs',
    version: CODEX_CLIENT_VERSION,
    'User-Agent': `codex_cli_rs/${CODEX_CLIENT_VERSION}`,
  }

  if (token.accountId) {
    headers['ChatGPT-Account-ID'] = token.accountId
  }
  if (token.isFedrampAccount) {
    headers['X-OpenAI-Fedramp'] = 'true'
  }

  return headers
}

function contentToInstructionText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part: any) => {
        if (typeof part === 'string') return part
        if (part?.type === 'text' && typeof part.text === 'string') return part.text
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return content == null ? '' : String(content)
}

function isInstructionRole(role: unknown): boolean {
  return role === 'system' || role === 'developer'
}

function isCodexReasoningModel(modelId: string): boolean {
  const lower = modelId.toLowerCase()
  if (lower.includes('gpt-5.2-chat') || lower.includes('gpt-5.2-instant')) return false
  return lower.startsWith('gpt-5') ||
    lower.includes('codex') ||
    /\bo[13](?:-|$)/.test(lower) ||
    lower.includes('reasoning')
}

export function normalizeCodexReasoningEffort(effort: unknown): CodexReasoningEffort {
  if (effort === 'max') return 'high'
  return CODEX_REASONING_EFFORTS.includes(effort as CodexReasoningEffort)
    ? effort as CodexReasoningEffort
    : 'medium'
}

function normalizeCodexReasoningSummary(summary: unknown): CodexReasoningOptions['summary'] {
  return summary === 'concise' || summary === 'detailed' || summary === 'auto'
    ? summary
    : 'auto'
}

function readCodexThinkingFlag(providerOptions: Record<string, any>): boolean {
  const value = providerOptions.thinking
  if (value === false || value === 'disabled' || value === 'off') return false
  return true
}

function normalizeCodexNativeToolName(value: unknown): CodexNativeToolName | undefined {
  if (typeof value !== 'string') return undefined
  return value.trim() === CODEX_NATIVE_IMAGE_GENERATION_TOOL
    ? CODEX_NATIVE_IMAGE_GENERATION_TOOL
    : undefined
}

function normalizeCodexNativeTools(raw: unknown): CodexNativeToolName[] {
  const values = Array.isArray(raw) ? raw : raw ? [raw] : []
  const tools = new Set<CodexNativeToolName>()

  for (const value of values) {
    const normalized = normalizeCodexNativeToolName(
      typeof value === 'string'
        ? value
        : (value as any)?.id ?? (value as any)?.name ?? (value as any)?.type ?? (value as any)?.value,
    )
    if (normalized) tools.add(normalized)
  }

  return Array.from(tools)
}

function addUnique(list: string[], value: string): string[] {
  return list.includes(value) ? list : [...list, value]
}

function mapFinishReason(reason: string | null | undefined): CodexFinishReason {
  switch (reason) {
    case 'stop':
    case 'completed':
      return 'stop'
    case 'max_output_tokens':
    case 'length':
      return 'length'
    case 'tool_calls':
    case 'function_call':
      return 'tool-calls'
    case 'content_filter':
      return 'content-filter'
    case 'failed':
    case 'error':
      return 'error'
    default:
      return reason ? 'other' : 'unknown'
  }
}

function stringifyToolResult(output: unknown): string {
  if (output == null) return ''
  if (typeof output === 'string') return output
  if (typeof output === 'object' && output !== null && 'value' in (output as any)) {
    const value = (output as any).value
    return typeof value === 'string' ? value : JSON.stringify(value)
  }
  return JSON.stringify(output)
}

function dataContentToUrl(data: unknown, mediaType?: string): string | null {
  if (typeof data === 'string') {
    if (data.startsWith('data:') || data.startsWith('http://') || data.startsWith('https://')) {
      return data
    }
    if (mediaType) {
      return `data:${mediaType};base64,${data}`
    }
    return data
  }
  if (data instanceof URL) return data.toString()
  if (data instanceof Uint8Array && mediaType) {
    return `data:${mediaType};base64,${Buffer.from(data).toString('base64')}`
  }
  return null
}

function contentPartsToCodexContent(
  content: unknown,
  role: 'developer' | 'user' | 'assistant',
): CodexContentItem[] {
  if (typeof content === 'string') {
    return content ? [{ type: role === 'assistant' ? 'output_text' : 'input_text', text: content }] : []
  }

  if (!Array.isArray(content)) return []

  const items: CodexContentItem[] = []
  for (const part of content as any[]) {
    if (part?.type === 'text' && typeof part.text === 'string' && part.text.length > 0) {
      items.push({
        type: role === 'assistant' ? 'output_text' : 'input_text',
        text: part.text,
      })
      continue
    }

    if ((part?.type === 'file' || part?.type === 'image') && role !== 'assistant') {
      const imageUrl = dataContentToUrl(part.data ?? part.image, part.mediaType)
      if (imageUrl && (part.mediaType?.startsWith('image/') || imageUrl.startsWith('data:image/') || imageUrl.startsWith('http'))) {
        items.push({ type: 'input_image', image_url: imageUrl, detail: 'auto' })
      }
    }
  }

  return items
}

function toolInputToString(input: unknown): string {
  if (typeof input === 'string') return input
  return JSON.stringify(input ?? {})
}

function getCodexEncryptedReasoning(msg: any): string[] {
  const raw = msg?.providerOptions?.codex?.encryptedReasoning
  const values = Array.isArray(raw) ? raw : raw ? [raw] : []
  return values.filter((value): value is string => typeof value === 'string' && value.length > 0)
}

export function convertPromptToCodexInput(prompt: any[]): CodexInputItem[] {
  const input: CodexInputItem[] = []

  for (const msg of prompt) {
    if (msg.role === 'system' || msg.role === 'developer') {
      const content = contentPartsToCodexContent(msg.content, 'developer')
      if (content.length > 0) {
        input.push({ type: 'message', role: 'developer', content })
      }
      continue
    }

    if (msg.role === 'user') {
      const content = contentPartsToCodexContent(msg.content, 'user')
      if (content.length > 0) {
        input.push({ type: 'message', role: 'user', content })
      }
      continue
    }

    if (msg.role === 'assistant') {
      for (const encryptedContent of getCodexEncryptedReasoning(msg)) {
        input.push({
          type: 'reasoning',
          summary: [],
          encrypted_content: encryptedContent,
        })
      }

      const textContent = contentPartsToCodexContent(msg.content, 'assistant')
      if (textContent.length > 0) {
        input.push({ type: 'message', role: 'assistant', content: textContent })
      }

      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part?.type === 'tool-call') {
            input.push({
              type: 'function_call',
              name: part.toolName,
              arguments: toolInputToString(part.input),
              call_id: part.toolCallId,
            })
          } else if (part?.type === 'tool-result') {
            input.push({
              type: 'function_call_output',
              call_id: part.toolCallId,
              output: stringifyToolResult(part.output),
            })
          }
        }
      }
      continue
    }

    if (msg.role === 'tool' && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part?.type === 'tool-result') {
          input.push({
            type: 'function_call_output',
            call_id: part.toolCallId,
            output: stringifyToolResult(part.output),
          })
        }
      }
    }
  }

  return input
}

function buildCodexTools(
  tools: CodexCallOptions['tools'] | undefined,
  nativeTools: CodexNativeToolName[] = [],
): CodexTool[] {
  const codexTools: CodexTool[] = []
  const seenFunctionNames = new Set<string>()

  for (const tool of tools ?? []) {
    if (tool.type !== 'function') continue
    const functionTool = tool as CodexFunctionToolDefinition
    if (!functionTool.name || seenFunctionNames.has(functionTool.name)) continue
    seenFunctionNames.add(functionTool.name)
    codexTools.push({
      type: 'function',
      name: functionTool.name,
      description: functionTool.description,
      strict: false,
      parameters: (functionTool.inputSchema ?? {}) as Record<string, unknown>,
    })
  }

  if (
    nativeTools.includes(CODEX_NATIVE_IMAGE_GENERATION_TOOL) &&
    !codexTools.some((tool) => tool.type === 'image_generation')
  ) {
    codexTools.push({
      type: 'image_generation',
      output_format: 'png',
    })
  }

  return codexTools
}

function pickProviderOptions(options: CodexCallOptions): Record<string, any> {
  const providerOptions = options.providerOptions as Record<string, any> | undefined
  return {
    ...(providerOptions?.openai ?? {}),
    ...(providerOptions?.codex ?? {}),
  }
}

function buildCodexReasoning(modelId: string, providerOptions: Record<string, any>): CodexReasoningOptions | undefined {
  if (!readCodexThinkingFlag(providerOptions)) {
    return undefined
  }

  if (!isCodexReasoningModel(modelId) && !providerOptions.reasoningEffort && !providerOptions.reasoningSummary) {
    return undefined
  }

  return {
    effort: normalizeCodexReasoningEffort(providerOptions.reasoningEffort),
    summary: normalizeCodexReasoningSummary(providerOptions.reasoningSummary),
  }
}

export function buildCodexRequest(
  modelId: string,
  options: CodexCallOptions,
): BuiltCodexRequest {
  const providerOptions = pickProviderOptions(options)
  const instructions = contentToInstructionText(providerOptions.instructions).trim() ||
    CODEX_FALLBACK_INSTRUCTIONS
  const tools = buildCodexTools(options.tools, normalizeCodexNativeTools(providerOptions.nativeTools))
  const include = Array.isArray(providerOptions.include) ? [...providerOptions.include] : []
  const reasoning = buildCodexReasoning(modelId, providerOptions)

  const body = normalizeCodexResponsesBody({
    model: modelId,
    instructions,
    input: convertPromptToCodexInput(options.prompt as any[]),
    tools,
    tool_choice: 'auto',
    parallel_tool_calls: false,
    reasoning,
    store: false,
    stream: true,
    include: reasoning ? addUnique(include, CODEX_REASONING_INCLUDE) : include,
    service_tier: providerOptions.serviceTier,
    prompt_cache_key: providerOptions.promptCacheKey,
    text: providerOptions.text,
    client_metadata: providerOptions.clientMetadata,
  }) as CodexRequest

  const warnings: BuiltCodexRequest['warnings'] = []
  if (options.maxOutputTokens !== undefined) {
    warnings.push({
      type: 'unsupported-setting',
      setting: 'maxOutputTokens',
      details: 'Codex ChatGPT backend rejects max_output_tokens; omit it to match Codex CLI.',
    })
  }
  if (options.temperature !== undefined) {
    warnings.push({
      type: 'unsupported-setting',
      setting: 'temperature',
      details: 'Codex ChatGPT backend does not use temperature in the Codex CLI contract.',
    })
  }

  return { body, warnings }
}

function getFetchUrl(input: any): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input?.url || String(input)
}

function parseJsonBody(body: unknown): any | null {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body)
    } catch {
      return null
    }
  }
  if (body instanceof Uint8Array) {
    try {
      return JSON.parse(new TextDecoder().decode(body))
    } catch {
      return null
    }
  }
  return null
}

function getCodexErrorPayload(body: string): { message?: string; param?: string } {
  try {
    const parsed = JSON.parse(body)
    return {
      message: parsed?.detail || parsed?.error?.message || parsed?.message,
      param: parsed?.error?.param || parsed?.param,
    }
  } catch {
    return { message: body }
  }
}

function removeDottedParam(body: Record<string, any>, param: string): boolean {
  const [topLevel] = param.split('.')
  if (!topLevel || !(topLevel in body)) return false
  delete body[topLevel]
  return true
}

export function repairCodexRejectedBody(
  body: Record<string, any>,
  responseBody: string,
): Record<string, any> | null {
  const { message, param } = getCodexErrorPayload(responseBody)
  if (!message && !param) return null

  const repaired = { ...body }
  let changed = false

  if (param?.startsWith('tool_choice')) {
    repaired.tool_choice = 'auto'
    changed = true
  }

  const unsupportedParam = message?.match(/Unsupported parameter:\s*['"]?([A-Za-z0-9_.$-]+)['"]?/i)?.[1]
  if (unsupportedParam) {
    changed = removeDottedParam(repaired, unsupportedParam) || changed
  }

  return changed ? normalizeCodexResponsesBody(repaired) : null
}

export function isCodexResponsesUrl(input: string): boolean {
  try {
    const url = new URL(input)
    return url.hostname === 'chatgpt.com' && url.pathname.endsWith('/backend-api/codex/responses')
  } catch {
    return input.includes('/backend-api/codex/responses')
  }
}

export function normalizeCodexResponsesBody(body: unknown): Record<string, any> {
  const raw: Record<string, any> =
    body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, any>
      : {}
  const normalized: Record<string, any> = {}

  for (const [key, value] of Object.entries(raw)) {
    if (value !== undefined && CODEX_RESPONSES_ALLOWED_KEYS.has(key)) {
      normalized[key] = value
    }
  }

  normalized.store = false

  if (typeof normalized.instructions !== 'string' || normalized.instructions.trim().length === 0) {
    normalized.instructions = CODEX_FALLBACK_INSTRUCTIONS
  }

  if (typeof normalized.parallel_tool_calls !== 'boolean') {
    normalized.parallel_tool_calls = false
  }

  if (normalized.tools == null) {
    normalized.tools = []
  }

  normalized.tool_choice = 'auto'

  const include = Array.isArray(normalized.include) ? [...normalized.include] : []
  if (normalized.reasoning && typeof normalized.reasoning === 'object') {
    normalized.reasoning = {
      ...(normalized.reasoning as Record<string, unknown>),
      effort: normalizeCodexReasoningEffort((normalized.reasoning as Record<string, unknown>).effort),
      summary: normalizeCodexReasoningSummary((normalized.reasoning as Record<string, unknown>).summary),
    }
    normalized.include = addUnique(include, CODEX_REASONING_INCLUDE)
  } else {
    delete normalized.reasoning
    normalized.include = include.filter((value) => value !== CODEX_REASONING_INCLUDE)
  }

  if (normalized.include == null) {
    normalized.include = include
  }

  return normalized
}

export function prepareCodexCallOptions(
  options: ProviderCallOptions,
  _context: ProviderCallPreparationContext,
): ProviderCallOptions {
  const systemMessages: string[] = []

  if (Array.isArray(options.messages)) {
    const nonSystemMessages: any[] = []

    for (const message of options.messages) {
      if (isInstructionRole(message?.role)) {
        const text = contentToInstructionText(message.content).trim()
        if (text) systemMessages.push(text)
      } else {
        nonSystemMessages.push(message)
      }
    }

    options.messages = nonSystemMessages
  }

  const existingProviderOptions = options.providerOptions ?? {}
  const existingOpenAIOptions = existingProviderOptions.openai ?? {}
  const existingCodexOptions = existingProviderOptions.codex ?? {}
  const existingInstructions = contentToInstructionText(
    existingCodexOptions.instructions ?? existingOpenAIOptions.instructions,
  ).trim()
  const instructions = [...systemMessages, existingInstructions].filter(Boolean).join('\n\n') ||
    CODEX_FALLBACK_INSTRUCTIONS

  options.providerOptions = {
    ...existingProviderOptions,
    codex: {
      ...existingCodexOptions,
      instructions,
    },
  }

  if (options.tools && Object.keys(options.tools).length > 0) {
    options.toolChoice = { type: 'auto' }
  } else {
    delete options.toolChoice
  }

  delete options.maxOutputTokens

  return options
}

export function createCodexFetch(baseFetch: typeof globalThis.fetch = createBoundFetch()): typeof globalThis.fetch {
  return (async (input: any, init?: any) => {
    if (!isCodexResponsesUrl(getFetchUrl(input))) {
      return baseFetch(input, init)
    }

    const parsedBody = parseJsonBody(init?.body)
    if (!parsedBody) {
      return baseFetch(input, init)
    }

    const normalizedBody = normalizeCodexResponsesBody(parsedBody)
    const normalizedInit = {
      ...(init ?? {}),
      body: JSON.stringify(normalizedBody),
    }
    const response = await baseFetch(input, normalizedInit)
    if (response.ok) return response

    const responseBody = await response.clone().text().catch(() => '')
    const repairedBody = repairCodexRejectedBody(normalizedBody, responseBody)
    if (!repairedBody) return response

    console.warn('[Codex] Retrying request after backend rejected a request parameter:', {
      status: response.status,
      detail: summarizeCodexErrorBody(responseBody),
    })

    return baseFetch(input, {
      ...(init ?? {}),
      body: JSON.stringify(repairedBody),
    })
  }) as typeof globalThis.fetch
}

export function buildCodexModelsUrl(): string {
  const url = new URL(`${CODEX_BASE_URL}/models`)
  url.searchParams.set('client_version', CODEX_CLIENT_VERSION)
  return url.toString()
}

function normalizeCodexSupportedReasoningLevels(raw: any): Array<{ effort: CodexReasoningEffort; description?: string }> {
  const levels =
    raw?.supported_reasoning_efforts ??
    raw?.supportedReasoningEfforts ??
    raw?.supported_reasoning_levels ??
    raw?.supportedReasoningLevels
  const values = Array.isArray(levels) && levels.length > 0
    ? levels
    : CODEX_FALLBACK_REASONING_EFFORTS.map((effort) => ({ effort }))

  const seen = new Set<CodexReasoningEffort>()
  const normalized: Array<{ effort: CodexReasoningEffort; description?: string }> = []

  for (const level of values) {
    const effort = normalizeCodexReasoningEffort(
      typeof level === 'string'
        ? level
        : level?.effort ?? level?.reasoningEffort ?? level?.reasoning_effort ?? level?.name ?? level?.value,
    )
    if (seen.has(effort)) continue
    seen.add(effort)
    normalized.push({
      effort,
      description: typeof level?.description === 'string' ? level.description : undefined,
    })
  }

  return normalized
}

function titleCaseServiceTier(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ') || id
}

function normalizeCodexServiceTiers(raw: any): Array<{ id: string; name: string; description?: string }> {
  const serviceTiers = raw?.service_tiers ?? raw?.serviceTiers
  const speedTiers = raw?.additional_speed_tiers ?? raw?.additionalSpeedTiers
  const values = Array.isArray(serviceTiers) && serviceTiers.length > 0
    ? serviceTiers
    : Array.isArray(speedTiers)
      ? speedTiers
      : []

  const seen = new Set<string>()
  const normalized: Array<{ id: string; name: string; description?: string }> = []

  for (const tier of values) {
    const id = typeof tier === 'string' ? tier : tier?.id ?? tier?.value ?? tier?.name
    if (typeof id !== 'string') continue
    const trimmedId = id.trim()
    if (!trimmedId || seen.has(trimmedId)) continue
    seen.add(trimmedId)
    const name = typeof tier?.name === 'string' && tier.name.trim()
      ? tier.name.trim()
      : titleCaseServiceTier(trimmedId)
    const description = typeof tier?.description === 'string' && tier.description.trim()
      ? tier.description.trim()
      : undefined
    normalized.push({ id: trimmedId, name, description })
  }

  return normalized
}

function normalizeStringArray(raw: unknown): string[] {
  const values = Array.isArray(raw) ? raw : raw ? [raw] : []
  return values
    .map((value) => {
      if (typeof value === 'string') return value.trim()
      const candidate = (value as any)?.id ?? (value as any)?.name ?? (value as any)?.type ?? (value as any)?.value
      return typeof candidate === 'string' ? candidate.trim() : ''
    })
    .filter(Boolean)
}

function getCodexRawInputModalities(raw: any): string[] {
  const value = raw?.input_modalities ?? raw?.inputModalities ?? raw?.modalities?.input
  return (Array.isArray(value) ? value : ['text', 'image'])
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean)
}

function normalizeCodexModelNativeTools(raw: any): CodexNativeToolName[] {
  const explicitTools = normalizeStringArray(
    raw?.experimental_supported_tools ??
      raw?.experimentalSupportedTools ??
      raw?.supported_tools ??
      raw?.supportedTools ??
      raw?.native_tools ??
      raw?.nativeTools,
  )
  const tools = new Set<CodexNativeToolName>()

  for (const value of explicitTools) {
    const normalized = normalizeCodexNativeToolName(value)
    if (normalized) tools.add(normalized)
  }

  const capability =
    raw?.capabilities?.image_generation ??
    raw?.capabilities?.imageGeneration ??
    raw?.image_generation ??
    raw?.imageGeneration
  if (capability === true) {
    tools.add(CODEX_NATIVE_IMAGE_GENERATION_TOOL)
  }

  if (explicitTools.length === 0 && capability !== false && getCodexRawInputModalities(raw).includes('image')) {
    tools.add(CODEX_NATIVE_IMAGE_GENERATION_TOOL)
  }

  return Array.from(tools)
}

function getCodexModelProviderMetadata(raw: any): Record<string, unknown> {
  const supportedReasoningEfforts = normalizeCodexSupportedReasoningLevels(raw)
  const defaultReasoningEffort = normalizeCodexReasoningEffort(
    raw?.default_reasoning_effort ??
      raw?.defaultReasoningEffort ??
      raw?.default_reasoning_level ??
      raw?.defaultReasoningLevel,
  )
  const supportsReasoningSummaries =
    raw?.supports_reasoning_summaries ?? raw?.supportsReasoningSummaries
  const serviceTiers = normalizeCodexServiceTiers(raw)
  const nativeTools = normalizeCodexModelNativeTools(raw)

  return {
    codex: {
      defaultReasoningEffort,
      supportedReasoningEfforts,
      supportsReasoningSummaries: supportsReasoningSummaries !== false,
      serviceTiers,
      nativeTools,
    },
  }
}

function formatCodexFallbackName(modelId: string): string {
  if (modelId === CODEX_DEFAULT_MODEL) return 'GPT-5.3 Codex'
  return modelId
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.toLowerCase() === 'gpt'
      ? 'GPT'
      : part.toLowerCase() === 'codex'
        ? 'Codex'
        : part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function getCodexFallbackModel(modelId: string = CODEX_DEFAULT_MODEL): OpenRouterModel {
  return {
    id: modelId,
    name: formatCodexFallbackName(modelId),
    description: 'Codex model available with ChatGPT subscription auth',
    context_length: 192000,
    architecture: {
      modality: 'multimodal',
      input_modalities: ['text', 'image'],
      output_modalities: ['text'],
      tokenizer: 'unknown',
    },
    pricing: { prompt: '0', completion: '0', request: '0', image: '0' },
    top_provider: { context_length: 192000, max_completion_tokens: 65536, is_moderated: false },
    supported_parameters: ['tools', 'reasoning'],
    providerMetadata: getCodexModelProviderMetadata({
      default_reasoning_level: 'medium',
      supported_reasoning_levels: CODEX_FALLBACK_REASONING_EFFORTS.map((effort) => ({ effort })),
      supports_reasoning_summaries: true,
    }),
  }
}

export function getCodexFallbackModels(modelIds: string[] = [CODEX_DEFAULT_MODEL]): OpenRouterModel[] {
  const ids = Array.from(new Set([...(modelIds.length > 0 ? modelIds : [CODEX_DEFAULT_MODEL])]))
  return ids.map((id) => getCodexFallbackModel(id))
}

function coerceCodexModelArray(data: any): any[] {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.data)) return data.data
  if (Array.isArray(data?.models)) return data.models
  if (data?.models && typeof data.models === 'object') return Object.values(data.models)
  return []
}

export function codexModelInfoToOpenRouterModel(raw: any): OpenRouterModel | null {
  const id = raw?.id || raw?.slug || raw?.model || raw?.name
  if (!id || typeof id !== 'string') return null
  const contextLength =
    raw.context_length ||
    raw.contextWindow ||
    raw.context_window ||
    raw.max_context_window ||
    raw.maxContextWindow ||
    raw.limit?.context ||
    192000
  const maxOutput =
    raw.max_output_tokens ||
    raw.maxOutputTokens ||
    raw.limit?.output ||
    65536
  const inputModalities = getCodexRawInputModalities(raw)
  const outputModalities = raw.output_modalities || raw.outputModalities || raw.modalities?.output || ['text']
  const supportedParameters = new Set<string>(raw.supported_parameters || raw.supportedParameters || [])
  const providerMetadata = getCodexModelProviderMetadata(raw)
  const codexMetadata = providerMetadata.codex as Record<string, unknown>
  supportedParameters.add('tools')
  if (
    raw.reasoning !== false &&
    ((codexMetadata.supportsReasoningSummaries !== false) ||
      ((codexMetadata.supportedReasoningEfforts as unknown[])?.length ?? 0) > 0 ||
      raw.default_reasoning_level ||
      raw.defaultReasoningLevel)
  ) {
    supportedParameters.add('reasoning')
  }
  if (raw.temperature !== false) supportedParameters.add('temperature')
  if (raw.support_verbosity) supportedParameters.add('verbosity')

  return {
    id,
    name: raw.display_name || raw.displayName || raw.name || id,
    description: raw.description || 'Codex model',
    context_length: contextLength,
    architecture: {
      modality: inputModalities.includes('image') ? 'multimodal' : 'text',
      input_modalities: inputModalities,
      output_modalities: outputModalities,
      tokenizer: raw.tokenizer || 'unknown',
    },
    pricing: { prompt: '0', completion: '0', request: '0', image: '0' },
    top_provider: {
      context_length: contextLength,
      max_completion_tokens: maxOutput,
      is_moderated: false,
    },
    supported_parameters: Array.from(supportedParameters),
    last_updated: raw.last_updated || raw.lastUpdated || raw.release_date,
    providerMetadata,
  }
}

export async function fetchCodexModels(token: OAuthToken): Promise<OpenRouterModel[]> {
  const response = await createRequiredAppFetch()(buildCodexModelsUrl(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      ...buildCodexHeaders(token),
    },
    signal: AbortSignal.timeout(8000),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    const detail = summarizeCodexErrorBody(body)
    throw new Error(`Codex models request failed: ${response.status}${detail ? `: ${detail}` : ''}`)
  }

  const data = await response.json()
  const rawModels = coerceCodexModelArray(data)
  const models = rawModels
    .map(codexModelInfoToOpenRouterModel)
    .filter((model: OpenRouterModel | null): model is OpenRouterModel => !!model)

  return models.length > 0 ? models : getCodexFallbackModels()
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeCodexUsageWindow(raw: any): CodexUsageWindow | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const usedPercent = asNumber(raw.used_percent ?? raw.usedPercent)
  if (usedPercent === undefined) return undefined
  const window: CodexUsageWindow = { usedPercent }
  const windowSeconds = asNumber(raw.limit_window_seconds ?? raw.limitWindowSeconds ?? raw.window_seconds ?? raw.windowSeconds)
  const resetAfterSeconds = asNumber(raw.reset_after_seconds ?? raw.resetAfterSeconds)
  const resetAt = asNumber(raw.reset_at ?? raw.resetAt)
  if (windowSeconds !== undefined) window.windowSeconds = windowSeconds
  if (resetAfterSeconds !== undefined) window.resetAfterSeconds = resetAfterSeconds
  if (resetAt !== undefined) window.resetAt = resetAt
  return window
}

function normalizeCodexUsageCredits(raw: any): CodexUsageCredits | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const hasCredits = raw.has_credits ?? raw.hasCredits
  const unlimited = raw.unlimited
  const balance = asString(raw.balance)
  if (hasCredits === undefined && unlimited === undefined && !balance) return undefined
  return {
    hasCredits: Boolean(hasCredits),
    unlimited: Boolean(unlimited),
    ...(balance ? { balance } : {}),
  }
}

function normalizeCodexRateLimitReachedType(raw: any): string | undefined {
  if (typeof raw === 'string') return asString(raw)
  return asString(raw?.type ?? raw?.kind)
}

function normalizeCodexUsageLimit(
  id: string,
  name: string | undefined,
  rawRateLimit: any,
  rateLimitReachedType?: string,
): CodexUsageLimit {
  const primary = normalizeCodexUsageWindow(rawRateLimit?.primary_window ?? rawRateLimit?.primaryWindow)
  const secondary = normalizeCodexUsageWindow(rawRateLimit?.secondary_window ?? rawRateLimit?.secondaryWindow)
  return {
    id,
    ...(name ? { name } : {}),
    ...(primary ? { primary } : {}),
    ...(secondary ? { secondary } : {}),
    ...(rateLimitReachedType ? { rateLimitReachedType } : {}),
  }
}

export function normalizeCodexUsagePayload(payload: any): CodexProviderUsage {
  const planType = asString(payload?.plan_type ?? payload?.planType)
  const credits = normalizeCodexUsageCredits(payload?.credits)
  const rateLimitReachedType = normalizeCodexRateLimitReachedType(
    payload?.rate_limit_reached_type ?? payload?.rateLimitReachedType,
  )

  const limits: CodexUsageLimit[] = [
    normalizeCodexUsageLimit('codex', undefined, payload?.rate_limit ?? payload?.rateLimit, rateLimitReachedType),
  ]

  const additional = payload?.additional_rate_limits ?? payload?.additionalRateLimits
  if (Array.isArray(additional)) {
    for (const detail of additional) {
      const id = asString(detail?.metered_feature ?? detail?.meteredFeature ?? detail?.id)
      if (!id) continue
      limits.push(normalizeCodexUsageLimit(
        id,
        asString(detail?.limit_name ?? detail?.limitName ?? detail?.name),
        detail?.rate_limit ?? detail?.rateLimit,
        normalizeCodexRateLimitReachedType(detail?.rate_limit_reached_type ?? detail?.rateLimitReachedType),
      ))
    }
  }

  return {
    ...(planType ? { planType } : {}),
    ...(credits ? { credits } : {}),
    limits,
  }
}

export async function fetchCodexUsage(
  token: OAuthToken,
  fetchImpl: FetchFn = createRequiredAppFetch(),
): Promise<CodexProviderUsage> {
  const response = await fetchImpl(CODEX_USAGE_URL, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      ...buildCodexHeaders(token),
    },
    signal: AbortSignal.timeout(8000),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    const detail = summarizeCodexErrorBody(body)
    throw new Error(`Codex usage request failed: ${response.status}${detail ? `: ${detail}` : ''}`)
  }

  return normalizeCodexUsagePayload(await response.json())
}

function summarizeCodexErrorBody(body: string): string {
  if (!body) return ''
  try {
    const parsed = JSON.parse(body)
    const message = parsed?.detail || parsed?.error?.message || parsed?.message || parsed?.error
    if (typeof message === 'string') return message.slice(0, 300)
  } catch {
    // Fall back to a compact text preview below.
  }
  const compact = body.replace(/\s+/g, ' ').trim()
  const title = compact.match(/<title>(.*?)<\/title>/i)?.[1]?.trim()
  const paragraph = compact.match(/<p>(?:<b>\d+\.<\/b>\s*)?(.*?)(?:<p>|$)/i)?.[1]
    ?.replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (title || paragraph) {
    return [title, paragraph].filter(Boolean).join(': ').slice(0, 300)
  }
  return compact.slice(0, 300)
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {}
  headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (lower === 'set-cookie' || lower === 'cookie' || lower === 'authorization') return
    record[key] = value
  })
  return record
}

function createCodexApiError(status: number, responseBody: string, headers: Headers): Error {
  const detail = summarizeCodexErrorBody(responseBody)
  const requestId = headers.get('x-oai-request-id')
  const message = `Codex request failed (${status})${detail ? `: ${detail}` : ''}${requestId ? ` [request-id: ${requestId}]` : ''}`
  const error = new Error(message)
  ;(error as any).statusCode = status
  ;(error as any).responseBody = responseBody
  ;(error as any).responseHeaders = headersToRecord(headers)
  ;(error as any).isRetryable = status >= 500 || status === 429
  return error
}

function usageFromResponse(response: CodexSseEvent['response']): CodexUsage {
  const usage = response?.usage
  return {
    inputTokens: usage?.input_tokens,
    outputTokens: usage?.output_tokens,
    totalTokens: usage?.total_tokens,
    reasoningTokens: usage?.output_tokens_details?.reasoning_tokens,
    cachedInputTokens: usage?.input_tokens_details?.cached_tokens,
  }
}

function hasMeaningfulUsage(usage: CodexUsage): boolean {
  return usage.inputTokens !== undefined ||
    usage.outputTokens !== undefined ||
    usage.totalTokens !== undefined ||
    usage.reasoningTokens !== undefined ||
    usage.cachedInputTokens !== undefined
}

function extractOutputText(item: any): string {
  if (!item || !Array.isArray(item.content)) return ''
  return item.content
    .map((content: any) => {
      if (typeof content?.text === 'string') return content.text
      if (typeof content?.content === 'string') return content.content
      return ''
    })
    .filter(Boolean)
    .join('')
}

function collectReasoningSummaryText(value: unknown): string[] {
  if (typeof value === 'string') return value ? [value] : []
  if (!value || typeof value !== 'object') return []

  if (Array.isArray(value)) {
    return value.flatMap(collectReasoningSummaryText)
  }

  const record = value as Record<string, unknown>
  const fragments: string[] = []
  for (const key of ['text', 'summary_text', 'summaryText', 'value']) {
    const text = record[key]
    if (typeof text === 'string' && text.length > 0) {
      fragments.push(text)
    }
  }
  for (const key of ['summary', 'parts', 'items']) {
    fragments.push(...collectReasoningSummaryText(record[key]))
  }
  return fragments
}

function extractReasoningSummaryText(item: any): string {
  if (!item || typeof item !== 'object') return ''
  return collectReasoningSummaryText([
    item.summary,
    item.text,
    item.summary_text,
    item.summaryText,
    item.reasoning_summary,
    item.reasoningSummary,
  ]).join('')
}

function isCodexImageGenerationItem(item: any): boolean {
  return item?.type === CODEX_NATIVE_IMAGE_GENERATION_TOOL ||
    item?.type === 'image_generation_call'
}

function isCodexFunctionCallItem(item: any): boolean {
  return item?.type === 'function_call' || item?.type === 'custom_tool_call'
}

function getCodexImageGenerationCallId(item: any, event?: CodexSseEvent): string | undefined {
  const eventAny = event as any
  const callId = item?.id ?? item?.call_id ?? item?.callId ?? eventAny?.item_id ?? eventAny?.itemId
  return typeof callId === 'string' && callId.length > 0 ? callId : undefined
}

function getReasoningItemId(item: any, event: CodexSseEvent, fallback: string): string {
  const eventAny = event as any
  const id = item?.id ?? item?.item_id ?? eventAny.item_id ?? eventAny.itemId
  return typeof id === 'string' && id.length > 0 ? id : fallback
}

function decodeSseEventData(
  eventName: string | null,
  dataLines: string[],
): CodexSseEvent | null {
  const data = dataLines.join('\n').trim()
  if (!data || data === '[DONE]') return null
  try {
    const parsed = JSON.parse(data)
    if (eventName && !parsed.type) parsed.type = eventName
    return parsed
  } catch (error) {
    console.warn('[Codex] Failed to parse stream event:', error)
    return null
  }
}

async function* parseCodexSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<CodexSseEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let eventName: string | null = null
  let dataLines: string[] = []

  const flush = function* (): Generator<CodexSseEvent> {
    const event = decodeSseEventData(eventName, dataLines)
    eventName = null
    dataLines = []
    if (event) yield event
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line === '') {
          yield* flush()
          continue
        }
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim()
          continue
        }
        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart())
        }
      }
    }

    if (buffer.trim()) {
      if (buffer.startsWith('data:')) dataLines.push(buffer.slice(5).trimStart())
      else dataLines.push(buffer.trim())
    }
    yield* flush()
  } finally {
    reader.releaseLock()
  }
}

function createStreamFromGenerator<T>(generator: AsyncGenerator<T>): ReadableStream<T> {
  return new ReadableStream<T>({
    async pull(controller) {
      try {
        const { done, value } = await generator.next()
        if (done) controller.close()
        else controller.enqueue(value)
      } catch (error) {
        controller.error(error)
      }
    },
    async cancel() {
      await generator.return?.(undefined)
    },
  })
}

export function createCodexModel(
  modelId: string,
  token: OAuthToken,
  baseUrl: string,
  fetchImpl: FetchFn,
): CodexLanguageModel {
  return {
    specificationVersion: 'v2',
    provider: CODEX_PROVIDER_ID,
    modelId,
    supportedUrls: {
      'image/*': [/^https?:\/\//, /^data:image\//],
    },

    async doStream(options: CodexCallOptions) {
      const { body, warnings } = buildCodexRequest(modelId, options)
      await dumpProviderRequest({
        providerId: CODEX_PROVIDER_ID,
        model: modelId,
        mode: 'codex-http',
        metadata: {
          url: `${baseUrl}/responses`,
          method: 'POST',
          warningCount: warnings.length,
        },
        requestBody: body,
      })
      const response = await fetchImpl(`${baseUrl}/responses`, {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
          ...buildCodexHeaders(token),
          ...(options.headers ?? {}),
        },
        body: JSON.stringify(body),
        signal: options.abortSignal,
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw createCodexApiError(response.status, text, response.headers)
      }
      if (!response.body) {
        throw new Error('Codex request failed: response body is empty')
      }

      async function* processStream(): AsyncGenerator<CodexStreamPart> {
        yield { type: 'stream-start', warnings }

        let usage: CodexUsage = {
          inputTokens: undefined,
          outputTokens: undefined,
          totalTokens: undefined,
        }
        let finishReason: CodexFinishReason = 'unknown'
        let textStarted = false
        let reasoningStarted = false
        let emittedTextFromDelta = false
        let responseId: string | undefined
        let responseModelId: string | undefined
        let toolCallsEmitted = false
        let activeReasoningItemId: string | undefined
        const reasoningSummaryByItem = new Map<string, string>()
        const textId = 'text-0'
        const reasoningId = 'reasoning-0'

        const closeReasoning = function* (): Generator<CodexStreamPart> {
          if (reasoningStarted) {
            yield { type: 'reasoning-end', id: reasoningId }
            reasoningStarted = false
          }
        }

        const closeText = function* (): Generator<CodexStreamPart> {
          if (textStarted) {
            yield { type: 'text-end', id: textId }
            textStarted = false
          }
        }

        const emitText = function* (delta: string): Generator<CodexStreamPart> {
          if (!delta) return
          yield* closeReasoning()
          if (!textStarted) {
            textStarted = true
            yield { type: 'text-start', id: textId }
          }
          emittedTextFromDelta = true
          yield { type: 'text-delta', id: textId, delta }
        }

        const emitReasoning = function* (delta: string, itemId: string = reasoningId): Generator<CodexStreamPart> {
          if (!delta) return
          if (textStarted) {
            yield { type: 'text-end', id: textId }
            textStarted = false
          }
          if (!reasoningStarted) {
            reasoningStarted = true
            yield { type: 'reasoning-start', id: reasoningId }
          }
          reasoningSummaryByItem.set(itemId, `${reasoningSummaryByItem.get(itemId) ?? ''}${delta}`)
          yield { type: 'reasoning-delta', id: reasoningId, delta }
        }

        interface ActiveFunctionCallInput {
          itemId: string
          callId: string
          toolName: string
          streamedArgs: string
          started: boolean
        }

        const toolInputByItemId = new Map<string, ActiveFunctionCallInput>()
        const toolInputByCallId = new Map<string, ActiveFunctionCallInput>()
        const pendingToolInputDeltas = new Map<string, string>()

        const getFunctionCallItemId = (item: any, event?: CodexSseEvent, fallback?: string): string | undefined => {
          const eventAny = event as any
          const id = item?.id ?? item?.item_id ?? item?.itemId ?? eventAny?.item_id ?? eventAny?.itemId ?? fallback
          return typeof id === 'string' && id.length > 0 ? id : undefined
        }

        const getFunctionCallCallId = (item: any, event?: CodexSseEvent): string | undefined => {
          const eventAny = event as any
          const callId = item?.call_id ?? item?.callId ?? eventAny?.call_id ?? eventAny?.callId ?? item?.id
          return typeof callId === 'string' && callId.length > 0 ? callId : undefined
        }

        const getFunctionCallToolName = (item: any): string | undefined => {
          const name = item?.name ?? item?.tool_name ?? item?.toolName
          return typeof name === 'string' && name.length > 0 ? name : undefined
        }

        const getFunctionCallArgs = (item: any): string => {
          if (typeof item?.arguments === 'string') return item.arguments
          if (typeof item?.input === 'string') return item.input
          const value = item?.arguments ?? item?.input ?? {}
          return JSON.stringify(value)
        }

        const registerFunctionCallInput = (item: any, event?: CodexSseEvent): ActiveFunctionCallInput | undefined => {
          const callId = getFunctionCallCallId(item, event)
          const toolName = getFunctionCallToolName(item)
          if (!callId || !toolName) return
          const itemId = getFunctionCallItemId(item, event, callId) ?? callId
          const existing = toolInputByItemId.get(itemId) ?? toolInputByCallId.get(callId)
          if (existing) {
            existing.callId = callId
            existing.toolName = toolName
            toolInputByItemId.set(itemId, existing)
            toolInputByCallId.set(callId, existing)
            return existing
          }
          const state: ActiveFunctionCallInput = {
            itemId,
            callId,
            toolName,
            streamedArgs: '',
            started: false,
          }
          toolInputByItemId.set(itemId, state)
          toolInputByCallId.set(callId, state)
          return state
        }

        const startFunctionCallInput = function* (state: ActiveFunctionCallInput): Generator<CodexStreamPart> {
          if (state.started) return
          toolCallsEmitted = true
          yield* closeReasoning()
          yield* closeText()
          yield { type: 'tool-input-start', id: state.callId, toolName: state.toolName }
          state.started = true
        }

        const flushPendingFunctionCallDeltas = function* (state: ActiveFunctionCallInput): Generator<CodexStreamPart> {
          const keys = Array.from(new Set([state.itemId, state.callId]))
          for (const key of keys) {
            const delta = pendingToolInputDeltas.get(key)
            if (!delta) continue
            pendingToolInputDeltas.delete(key)
            yield* startFunctionCallInput(state)
            state.streamedArgs += delta
            yield { type: 'tool-input-delta', id: state.callId, delta }
          }
        }

        const registerAndStartFunctionCallInput = function* (item: any, event?: CodexSseEvent): Generator<CodexStreamPart> {
          const state = registerFunctionCallInput(item, event)
          if (!state) return
          yield* startFunctionCallInput(state)
          yield* flushPendingFunctionCallDeltas(state)
        }

        const emitFunctionCallInputDelta = function* (event: CodexSseEvent): Generator<CodexStreamPart> {
          const eventAny = event as any
          const delta = event.delta ?? eventAny.input ?? eventAny.arguments_delta ?? eventAny.argumentsDelta ?? ''
          if (!delta) return
          const itemId = typeof event.item_id === 'string' ? event.item_id : typeof eventAny.itemId === 'string' ? eventAny.itemId : undefined
          const callId = typeof event.call_id === 'string' ? event.call_id : typeof eventAny.callId === 'string' ? eventAny.callId : undefined
          const state = (itemId ? toolInputByItemId.get(itemId) : undefined) ?? (callId ? toolInputByCallId.get(callId) : undefined)
          if (!state) {
            const key = itemId ?? callId
            if (key) pendingToolInputDeltas.set(key, `${pendingToolInputDeltas.get(key) ?? ''}${delta}`)
            return
          }
          yield* startFunctionCallInput(state)
          state.streamedArgs += delta
          yield { type: 'tool-input-delta', id: state.callId, delta }
        }

        const emitFunctionCall = function* (item: any, event?: CodexSseEvent): Generator<CodexStreamPart> {
          const callId = getFunctionCallCallId(item, event)
          const toolName = getFunctionCallToolName(item)
          if (!callId || !toolName) return
          const state = registerFunctionCallInput(item, event)
          const args = getFunctionCallArgs(item)

          if (state) {
            yield* startFunctionCallInput(state)
            yield* flushPendingFunctionCallDeltas(state)
            if (args && !state.streamedArgs) {
              state.streamedArgs = args
              yield { type: 'tool-input-delta', id: callId, delta: args }
            } else if (args && args.startsWith(state.streamedArgs) && args.length > state.streamedArgs.length) {
              const suffix = args.slice(state.streamedArgs.length)
              state.streamedArgs = args
              yield { type: 'tool-input-delta', id: callId, delta: suffix }
            }
            yield { type: 'tool-input-end', id: callId }
            toolInputByItemId.delete(state.itemId)
            toolInputByCallId.delete(state.callId)
          } else {
            toolCallsEmitted = true
            yield* closeReasoning()
            yield* closeText()
            yield { type: 'tool-input-start', id: callId, toolName }
            if (args) {
              yield { type: 'tool-input-delta', id: callId, delta: args }
            }
            yield { type: 'tool-input-end', id: callId }
          }

          yield {
            type: 'tool-call',
            toolCallId: callId,
            toolName,
            input: args,
          }
        }

        const emitImageGenerationStart = function* (item: any, event?: CodexSseEvent): Generator<CodexStreamPart> {
          const callId = getCodexImageGenerationCallId(item, event)
          if (!callId) return
          yield* closeReasoning()
          yield* closeText()
          yield {
            type: 'raw',
            rawValue: {
              provider: CODEX_PROVIDER_ID,
              type: 'image-generation-start',
              callId,
              status: typeof item?.status === 'string' ? item.status : undefined,
            },
          }
        }

        const emitImageGenerationResult = function* (item: any, event?: CodexSseEvent): Generator<CodexStreamPart> {
          const callId = getCodexImageGenerationCallId(item, event)
          const result = typeof item?.result === 'string' ? item.result : ''
          if (!callId || !result) return
          yield* closeReasoning()
          yield* closeText()
          yield {
            type: 'raw',
            rawValue: {
              provider: CODEX_PROVIDER_ID,
              type: 'image-generation-result',
              callId,
              status: typeof item?.status === 'string' ? item.status : 'completed',
              revisedPrompt: typeof item?.revised_prompt === 'string'
                ? item.revised_prompt
                : typeof item?.revisedPrompt === 'string'
                  ? item.revisedPrompt
                  : undefined,
              result,
            },
          }
        }

        for await (const event of parseCodexSseStream(response.body!)) {
          if (event.error) {
            throw new Error(`Codex stream error: ${event.error.message ?? 'unknown error'}`)
          }

          switch (event.type) {
            case 'response.created':
            case 'response.in_progress':
            case 'response.content_part.added':
            case 'response.output_text.done':
            case 'response.reasoning_text.done':
              break

            case 'response.output_item.added': {
              if (event.item?.type === 'reasoning') {
                activeReasoningItemId = getReasoningItemId(event.item, event, reasoningId)
                const summary = extractReasoningSummaryText(event.item)
                if (summary && !reasoningSummaryByItem.get(activeReasoningItemId)?.trim()) {
                  yield* emitReasoning(summary, activeReasoningItemId)
                }
              } else if (isCodexFunctionCallItem(event.item)) {
                yield* registerAndStartFunctionCallInput(event.item, event)
              } else if (isCodexImageGenerationItem(event.item)) {
                yield* emitImageGenerationStart(event.item, event)
              }
              break
            }

            case 'response.output_text.delta':
              yield* emitText(event.delta ?? '')
              break

            case 'response.reasoning_summary_text.delta': {
              const itemId = getReasoningItemId(undefined, event, activeReasoningItemId ?? reasoningId)
              const eventAny = event as any
              yield* emitReasoning(event.delta ?? eventAny.text ?? '', itemId)
              break
            }

            case 'response.reasoning_summary_part.added': {
              const itemId = getReasoningItemId(undefined, event, activeReasoningItemId ?? reasoningId)
              if (reasoningSummaryByItem.get(itemId)?.trim()) {
                yield* emitReasoning('\n\n', itemId)
              }
              break
            }

            case 'response.reasoning_summary_text.done': {
              const eventAny = event as any
              const itemId = getReasoningItemId(undefined, event, activeReasoningItemId ?? reasoningId)
              const summary = collectReasoningSummaryText([
                eventAny.text,
                eventAny.summary,
                eventAny.summary_text,
                eventAny.summaryText,
              ]).join('')
              if (summary && !reasoningSummaryByItem.get(itemId)?.trim()) {
                yield* emitReasoning(summary, itemId)
              }
              break
            }

            case 'response.reasoning_text.delta':
              break

            case 'response.function_call_arguments.delta':
            case 'response.custom_tool_call_input.delta':
              yield* emitFunctionCallInputDelta(event)
              break

            case 'response.output_item.done': {
              const item = event.item
              if (isCodexFunctionCallItem(item)) {
                yield* emitFunctionCall(item, event)
                finishReason = 'tool-calls'
              } else if (isCodexImageGenerationItem(item)) {
                yield* emitImageGenerationResult(item, event)
              } else if (item?.type === 'reasoning') {
                const itemId = getReasoningItemId(item, event, activeReasoningItemId ?? reasoningId)
                const summary = extractReasoningSummaryText(item)
                if (summary && !reasoningSummaryByItem.get(itemId)?.trim()) {
                  yield* emitReasoning(summary, itemId)
                }
                if (typeof item.encrypted_content === 'string' && item.encrypted_content.length > 0) {
                  yield {
                    type: 'raw',
                    rawValue: {
                      provider: CODEX_PROVIDER_ID,
                      type: 'encrypted-reasoning',
                      encryptedContent: item.encrypted_content,
                    },
                  }
                }
                if (activeReasoningItemId === itemId) {
                  activeReasoningItemId = undefined
                }
              } else if (item?.type === 'message' && !emittedTextFromDelta) {
                yield* emitText(extractOutputText(item))
              }
              break
            }

            case 'response.completed': {
              responseId = event.response?.id ?? responseId
              responseModelId = event.response?.model ?? responseModelId
              const nextUsage = usageFromResponse(event.response)
              if (hasMeaningfulUsage(nextUsage)) usage = nextUsage
              if (finishReason !== 'tool-calls') finishReason = 'stop'
              break
            }

            case 'response.incomplete':
              responseId = event.response?.id ?? responseId
              responseModelId = event.response?.model ?? responseModelId
              finishReason = mapFinishReason(event.response?.incomplete_details?.reason)
              break

            case 'response.failed': {
              const message = event.response?.error?.message || 'Codex stream failed'
              throw new Error(`Codex stream error: ${message}`)
            }

            default:
              if (event.response?.usage) {
                const nextUsage = usageFromResponse(event.response)
                if (hasMeaningfulUsage(nextUsage)) usage = nextUsage
              }
              break
          }
        }

        yield* closeReasoning()
        yield* closeText()
        if (responseId || responseModelId) {
          yield {
            type: 'response-metadata',
            id: responseId,
            modelId: responseModelId ?? modelId,
            timestamp: new Date(),
          }
        }
        yield {
          type: 'finish',
          finishReason: toolCallsEmitted ? 'tool-calls' : finishReason,
          usage,
        }
      }

      return {
        stream: createStreamFromGenerator(processStream()),
        request: { body: JSON.stringify(body) },
        response: { headers: headersToRecord(response.headers) },
      }
    },

    async doGenerate(options: CodexCallOptions) {
      const streamResult = await this.doStream(options)
      const reader = streamResult.stream.getReader()
      const content: CodexGeneratedContent[] = []
      const textById = new Map<string, string>()
      const reasoningById = new Map<string, string>()
      let finishReason: CodexFinishReason = 'unknown'
      let usage: CodexUsage = {
        inputTokens: undefined,
        outputTokens: undefined,
        totalTokens: undefined,
      }

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          if (value.type === 'text-delta') {
            textById.set(value.id, `${textById.get(value.id) ?? ''}${value.delta}`)
          } else if (value.type === 'reasoning-delta') {
            reasoningById.set(value.id, `${reasoningById.get(value.id) ?? ''}${value.delta}`)
          } else if (value.type === 'tool-call') {
            content.push(value)
          } else if (value.type === 'finish') {
            finishReason = value.finishReason
            usage = value.usage
          }
        }
      } finally {
        reader.releaseLock()
      }

      for (const text of textById.values()) {
        if (text) content.unshift({ type: 'text', text })
      }
      for (const reasoning of reasoningById.values()) {
        if (reasoning) content.unshift({ type: 'reasoning', text: reasoning })
      }

      return {
        content,
        finishReason,
        usage,
        warnings: [],
        request: streamResult.request,
        response: {
          headers: streamResult.response?.headers,
          modelId,
          timestamp: new Date(),
        },
      }
    },
  }
}

const codexProvider: ProviderDefinition = {
  id: CODEX_PROVIDER_ID,

  info: {
    id: CODEX_PROVIDER_ID,
    name: 'Codex',
    description: 'Use Codex with your ChatGPT subscription via OAuth',
    defaultBaseUrl: CODEX_BASE_URL,
    defaultModel: CODEX_DEFAULT_MODEL,
    icon: 'codex',
    supportsCustomBaseUrl: false,
    requiresApiKey: false,
    requiresOAuth: true,
    oauthFlow: 'authorization-code',
  },

  create: ({ baseUrl, apiKey, oauthToken, authContext }) => {
    const token = getCodexToken({ apiKey, oauthToken, authContext })
    if (!token?.accessToken) {
      throw new Error('Not logged in to Codex. Please login first.')
    }
    const finalBaseUrl = (baseUrl || CODEX_BASE_URL).replace(/\/$/, '')
    const fetchImpl = createCodexFetch(createBoundFetch())

    return {
      createModel: (modelId: string) =>
        createCodexModel(modelId, token, finalBaseUrl, fetchImpl) as any,
    }
  },

  prepareCallOptions: prepareCodexCallOptions,
}

export default codexProvider
