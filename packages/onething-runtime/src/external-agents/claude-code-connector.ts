import type {
  AgentReasoningEffort,
  AgentToolCall,
  AgentToolResult,
  AgentTurnStreamEvent,
  AgentUsage,
} from '@onething/core/agent-loop'
import { createTwoFilesPatch } from 'diff'
import { onethingClaudeModelFamily } from '../providers/model-capability.js'
import { countLineChanges } from '../tools/file-snapshot.js'
import { trimDiff, truncateDiffForDisplay } from '../tools/replacers.js'
import type {
  ExternalAgentCapabilities,
  ExternalAgentConnector,
  ExternalAgentEvent,
  ExternalAgentPermissionHandler,
  ExternalAgentSessionLink,
  ExternalAgentTurnRequest,
} from './types.js'

export const CLAUDE_CODE_AGENT_CONNECTOR_ID = 'claude-code-agent'

/**
 * Structural subsets of the Claude Agent SDK message stream
 * (@anthropic-ai/claude-agent-sdk SDKMessage). Kept structural so tests can
 * replay fixtures and the SDK stays a soft dependency of this module.
 */
interface SdkStreamEventDelta {
  type: string
  text?: string
  thinking?: string
  partial_json?: string
}

interface SdkContentBlock {
  type: string
  id?: string
  name?: string
  input?: unknown
  text?: string
  tool_use_id?: string
  content?: unknown
  is_error?: boolean
}

export interface ClaudeCodeSdkMessage {
  type: string
  subtype?: string
  session_id?: string
  parent_tool_use_id?: string | null
  event?: {
    type: string
    index?: number
    content_block?: SdkContentBlock
    delta?: SdkStreamEventDelta
  }
  message?: {
    role?: string
    content?: SdkContentBlock[] | string
  }
  result?: string
  is_error?: boolean
  num_turns?: number
  total_cost_usd?: number
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
}

export interface ClaudeCodeQueryOptions {
  cwd?: string
  model?: string
  resume?: string
  pathToClaudeCodeExecutable?: string
  includePartialMessages?: boolean
  permissionMode?: string
  env?: Record<string, string | undefined>
  thinking?: { type: 'adaptive' } | { type: 'enabled'; budgetTokens: number } | { type: 'disabled' }
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  abortController?: AbortController
  canUseTool?: (
    toolName: string,
    input: Record<string, unknown>,
    options: { signal: AbortSignal },
  ) => Promise<
    | { behavior: 'allow'; updatedInput?: Record<string, unknown> }
    | { behavior: 'deny'; message: string }
  >
}

export type ClaudeCodeQueryFn = (params: {
  prompt: string
  options: ClaudeCodeQueryOptions
}) => AsyncIterable<ClaudeCodeSdkMessage>

export interface ClaudeCodeConnectorOptions {
  /** Absolute path to the locally installed claude executable. */
  executablePath?: string
  permissionHandler?: ExternalAgentPermissionHandler
  /**
   * The SDK's query(); injectable for fixture-replay tests. Default lazily
   * imports @anthropic-ai/claude-agent-sdk.
   */
  queryFn?: ClaudeCodeQueryFn
  now?: () => number
  logger?: Pick<Console, 'log' | 'warn'>
  /**
   * Environment for the spawned CLI, resolved per turn. Hosts use this to
   * inject the app's proxy settings — a GUI-launched app has no shell proxy
   * env, and a direct connection gets region-blocked by the API (403
   * "Request not allowed").
   */
  resolveSpawnEnv?: () => Record<string, string | undefined> | undefined
}

const CLAUDE_CODE_CAPABILITIES: ExternalAgentCapabilities = {
  streamingText: true,
  thinking: true,
  toolSteps: true,
  permissionBridge: 'callback',
  resume: true,
  fork: true,
  steer: false,
  imagesIn: false,
  mcpInjection: 'in-process',
  concurrentSessions: 'per-process',
}

function claudeCodeEffort(
  effort: AgentReasoningEffort,
): NonNullable<ClaudeCodeQueryOptions['effort']> {
  return effort === 'minimal' ? 'low' : effort
}

/**
 * Thinking/effort knobs for the CLI, mirroring the claude API provider's
 * family semantics: effort guides adaptive thinking; an explicit `disabled`
 * is only sent to families that accept it (Fable rejects the param, and an
 * unknown model — CLI default — gets no override at all).
 */
function claudeCodeThinkingOptions(
  request: Pick<ExternalAgentTurnRequest, 'model' | 'thinking' | 'reasoningEffort'>,
): Pick<ClaudeCodeQueryOptions, 'thinking' | 'effort'> {
  if (request.thinking === 'disabled') {
    if (!request.model) return {}
    const family = onethingClaudeModelFamily(request.model)
    if (family.adaptive && !family.alwaysThinking) {
      return { thinking: { type: 'disabled' } }
    }
    return {}
  }
  if (request.thinking === 'enabled' && request.reasoningEffort) {
    return { effort: claudeCodeEffort(request.reasoningEffort) }
  }
  return {}
}

async function defaultQueryFn(params: {
  prompt: string
  options: ClaudeCodeQueryOptions
}): Promise<AsyncIterable<ClaudeCodeSdkMessage>> {
  const sdk = await import('@anthropic-ai/claude-agent-sdk')
  return sdk.query(params as never) as AsyncIterable<ClaudeCodeSdkMessage>
}

function usageFromResult(message: ClaudeCodeSdkMessage): AgentUsage | undefined {
  const usage = message.usage
  if (!usage) return undefined
  const inputTokens = usage.input_tokens ?? 0
  const outputTokens = usage.output_tokens ?? 0
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    ...(usage.cache_read_input_tokens !== undefined
      ? { cacheReadTokens: usage.cache_read_input_tokens }
      : {}),
    ...(usage.cache_creation_input_tokens !== undefined
      ? { cacheWriteTokens: usage.cache_creation_input_tokens }
      : {}),
  }
}

function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map(part => (part && typeof part === 'object' && 'text' in part ? String((part as { text?: unknown }).text ?? '') : ''))
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

/**
 * The CLI's Edit/Write results are plain confirmation text, so the diff the
 * app's file-edit UI expects is synthesized from the tool arguments (the
 * edited hunk, same as Claude Code's own UI) and delivered through the
 * tool-metadata channel the builtin edit tool uses.
 */
function fileChangeMetadata(
  toolName: string,
  argumentsJson: string,
): { path: string; diff: string; additions: number; deletions: number } | null {
  let args: Record<string, unknown>
  try {
    const parsed = JSON.parse(argumentsJson) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    args = parsed as Record<string, unknown>
  } catch {
    return null
  }
  const path = typeof args.file_path === 'string' ? args.file_path : null
  if (!path) return null

  const lower = toolName.toLowerCase()
  let before: string | null = null
  let after: string | null = null
  if (lower === 'edit' && typeof args.old_string === 'string' && typeof args.new_string === 'string') {
    before = args.old_string
    after = args.new_string
  } else if (lower === 'write' && typeof args.content === 'string') {
    before = ''
    after = args.content
  } else if (lower === 'multiedit' && Array.isArray(args.edits)) {
    const olds: string[] = []
    const news: string[] = []
    for (const entry of args.edits) {
      const edit = entry as { old_string?: unknown; new_string?: unknown } | null
      if (!edit || typeof edit.old_string !== 'string' || typeof edit.new_string !== 'string') return null
      olds.push(edit.old_string)
      news.push(edit.new_string)
    }
    if (olds.length === 0) return null
    before = olds.join('\n\n')
    after = news.join('\n\n')
  } else {
    return null
  }

  if (before === after) return null
  const diff = truncateDiffForDisplay(trimDiff(createTwoFilesPatch(path, path, before, after)))
  const { additions, deletions } = countLineChanges(before, after)
  return { path, diff, additions, deletions }
}

/**
 * Per-turn translator: Claude Agent SDK message stream → normalized agent
 * events. Tool calls stream as content blocks (start → input_json_delta →
 * stop) and are marked externallyExecuted; their results arrive as
 * tool_result blocks in user messages. Everything nested under a subagent
 * (parent_tool_use_id set) is skipped — the parent Task tool call already
 * represents it.
 */
class ClaudeCodeTurnTranslator {
  private toolCallsByIndex = new Map<number, { id: string; name: string; args: string }>()
  private toolCallsById = new Map<string, AgentToolCall>()
  private settled = new Set<string>()

  constructor(private turn: number) {}

  translate(message: ClaudeCodeSdkMessage): AgentTurnStreamEvent[] {
    if (message.parent_tool_use_id) return []

    switch (message.type) {
      case 'stream_event':
        return this.translateStreamEvent(message)
      case 'assistant':
        return this.translateAssistant(message)
      case 'user':
        return this.translateUser(message)
      case 'result':
        return this.translateResult(message)
      default:
        return []
    }
  }

  private translateStreamEvent(message: ClaudeCodeSdkMessage): AgentTurnStreamEvent[] {
    const event = message.event
    if (!event) return []

    if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
      const index = event.index ?? 0
      const id = event.content_block.id ?? `tool-${index}`
      const name = event.content_block.name ?? 'tool'
      this.toolCallsByIndex.set(index, { id, name, args: '' })
      return [{ type: 'tool-call-start', turn: this.turn, toolCallId: id, toolName: name }]
    }

    if (event.type === 'content_block_delta' && event.delta) {
      const delta = event.delta
      if (delta.type === 'text_delta' && delta.text) {
        return [{ type: 'text-delta', turn: this.turn, delta: delta.text }]
      }
      if (delta.type === 'thinking_delta' && delta.thinking) {
        return [{ type: 'reasoning-delta', turn: this.turn, delta: delta.thinking }]
      }
      if (delta.type === 'input_json_delta' && delta.partial_json) {
        const pending = this.toolCallsByIndex.get(event.index ?? 0)
        if (!pending) return []
        pending.args += delta.partial_json
        return [{
          type: 'tool-call-delta',
          turn: this.turn,
          toolCallId: pending.id,
          toolName: pending.name,
          argumentsDelta: delta.partial_json,
        }]
      }
      return []
    }

    if (event.type === 'content_block_stop') {
      const pending = this.toolCallsByIndex.get(event.index ?? 0)
      if (!pending || this.toolCallsById.has(pending.id)) return []
      this.toolCallsByIndex.delete(event.index ?? 0)
      return this.completeToolCall(pending.id, pending.name, pending.args || '{}')
    }

    return []
  }

  private translateAssistant(message: ClaudeCodeSdkMessage): AgentTurnStreamEvent[] {
    // Text/thinking already streamed via stream_events; the full assistant
    // message only backfills tool calls the partial stream did not complete.
    const content = message.message?.content
    if (!Array.isArray(content)) return []
    const events: AgentTurnStreamEvent[] = []
    for (const block of content) {
      if (block.type !== 'tool_use' || !block.id) continue
      if (this.toolCallsById.has(block.id)) continue
      const name = block.name ?? 'tool'
      events.push({ type: 'tool-call-start', turn: this.turn, toolCallId: block.id, toolName: name })
      events.push(...this.completeToolCall(block.id, name, JSON.stringify(block.input ?? {})))
    }
    return events
  }

  private translateUser(message: ClaudeCodeSdkMessage): AgentTurnStreamEvent[] {
    const content = message.message?.content
    if (!Array.isArray(content)) return []
    const events: AgentTurnStreamEvent[] = []
    for (const block of content) {
      if (block.type !== 'tool_result' || !block.tool_use_id) continue
      const toolCall = this.toolCallsById.get(block.tool_use_id)
      if (!toolCall || this.settled.has(block.tool_use_id)) continue
      this.settled.add(block.tool_use_id)
      const text = toolResultText(block.content)
      const result: AgentToolResult = {
        content: text,
        ...(block.is_error ? { error: text || 'Tool call failed' } : {}),
      }
      events.push({ type: 'tool-result', turn: this.turn, toolCall, result })
    }
    return events
  }

  private translateResult(message: ClaudeCodeSdkMessage): AgentTurnStreamEvent[] {
    const events: AgentTurnStreamEvent[] = [...this.settleRemaining()]
    if (typeof message.total_cost_usd === 'number') {
      events.push({
        type: 'provider-data',
        turn: this.turn,
        providerData: {
          provider: CLAUDE_CODE_AGENT_CONNECTOR_ID,
          type: 'cost',
          costUSD: message.total_cost_usd,
        },
      })
    }
    events.push({
      type: 'finish',
      turn: this.turn,
      finishReason: message.subtype === 'success' ? 'stop' : 'error',
      usage: usageFromResult(message),
    })
    return events
  }

  private completeToolCall(id: string, name: string, args: string): AgentTurnStreamEvent[] {
    const toolCall: AgentToolCall = {
      id,
      name,
      arguments: args,
      externallyExecuted: true,
    }
    this.toolCallsById.set(id, toolCall)
    const events: AgentTurnStreamEvent[] = [
      { type: 'tool-call-done', turn: this.turn, toolCall },
    ]
    const change = fileChangeMetadata(name, args)
    if (change) {
      events.push({
        type: 'tool-metadata',
        turn: this.turn,
        toolCall,
        update: { metadata: change },
      })
    }
    return events
  }

  /** Stream ended without results for some calls — settle them so steps never hang. */
  settleRemaining(): AgentTurnStreamEvent[] {
    const events: AgentTurnStreamEvent[] = []
    for (const [id, toolCall] of this.toolCallsById) {
      if (this.settled.has(id)) continue
      this.settled.add(id)
      events.push({
        type: 'tool-result',
        turn: this.turn,
        toolCall,
        result: { content: '' },
      })
    }
    return events
  }
}

export function createClaudeCodeConnector(
  options: ClaudeCodeConnectorOptions = {},
): ExternalAgentConnector {
  const abortControllers = new Map<string, AbortController>()
  const now = options.now ?? (() => Date.now())

  return {
    id: CLAUDE_CODE_AGENT_CONNECTOR_ID,
    capabilities: CLAUDE_CODE_CAPABILITIES,

    async *streamTurn(request: ExternalAgentTurnRequest): AsyncIterable<ExternalAgentEvent> {
      const abortController = new AbortController()
      abortControllers.set(request.localSessionId, abortController)
      const forwardAbort = () => abortController.abort()
      request.abortSignal?.addEventListener('abort', forwardAbort, { once: true })
      if (request.abortSignal?.aborted) abortController.abort()

      const translator = new ClaudeCodeTurnTranslator(request.turn)
      let linkEmitted = false

      try {
        const spawnEnv = options.resolveSpawnEnv?.()
        const queryOptions: ClaudeCodeQueryOptions = {
          cwd: request.cwd,
          model: request.model,
          resume: request.resume?.externalSessionId,
          pathToClaudeCodeExecutable: options.executablePath,
          includePartialMessages: true,
          permissionMode: 'default',
          ...(spawnEnv ? { env: spawnEnv } : {}),
          ...claudeCodeThinkingOptions(request),
          abortController,
          canUseTool: async (toolName, input, { signal }) => {
            if (!options.permissionHandler) {
              return { behavior: 'deny', message: 'No permission handler registered in host.' }
            }
            try {
              if (signal.aborted) return { behavior: 'deny', message: 'Aborted.' }
              const allowed = await options.permissionHandler({
                connectorId: CLAUDE_CODE_AGENT_CONNECTOR_ID,
                localSessionId: request.localSessionId,
                messageId: request.messageId,
                cwd: request.cwd,
                toolName,
                input,
              })
              return allowed
                ? { behavior: 'allow', updatedInput: input }
                : { behavior: 'deny', message: 'User denied this tool call.' }
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error)
              return { behavior: 'deny', message: `Permission bridge failed: ${message}` }
            }
          },
        }

        const stream = options.queryFn
          ? options.queryFn({ prompt: request.prompt, options: queryOptions })
          : await defaultQueryFn({ prompt: request.prompt, options: queryOptions })

        for await (const message of stream) {
          if (message.type === 'system' && message.subtype === 'init') {
            const init = message as ClaudeCodeSdkMessage & { apiKeySource?: string; model?: string; cwd?: string }
            options.logger?.log?.(
              `[ClaudeCodeConnector] init session=${message.session_id} model=${init.model} apiKeySource=${init.apiKeySource} cwd=${init.cwd}`,
            )
          }
          if (message.type === 'result' && message.subtype !== 'success') {
            options.logger?.warn?.(
              `[ClaudeCodeConnector] error result: ${JSON.stringify(message).slice(0, 800)}`,
            )
          }
          if (!linkEmitted && message.session_id) {
            linkEmitted = true
            const link: ExternalAgentSessionLink = {
              localSessionId: request.localSessionId,
              connectorId: CLAUDE_CODE_AGENT_CONNECTOR_ID,
              externalSessionId: message.session_id,
              cwd: request.cwd,
              createdAt: request.resume?.createdAt ?? now(),
              lastUsedAt: now(),
            }
            yield { type: 'session-established', link }
          }
          yield* translator.translate(message)
        }
      } finally {
        request.abortSignal?.removeEventListener('abort', forwardAbort)
        abortControllers.delete(request.localSessionId)
      }
    },

    async interrupt(localSessionId: string): Promise<void> {
      abortControllers.get(localSessionId)?.abort()
    },

    async dispose(): Promise<void> {
      for (const controller of abortControllers.values()) controller.abort()
      abortControllers.clear()
    },
  }
}
