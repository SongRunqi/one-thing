import type {
  AgentReasoningEffort,
  AgentToolCall,
  AgentToolResult,
  AgentTurnStreamEvent,
  AgentUsage,
} from '@onething/core/agent-loop'
import { createTwoFilesPatch } from 'diff'
import { findAgentExecutorDescriptor } from '../agents/executor/capabilities.js'
import { onethingClaudeModelFamily } from '../providers/model-capability.js'
import { countLineChanges } from '../tools/file-snapshot.js'
import { trimDiff, truncateDiffForDisplay } from '../tools/replacers.js'
import {
  isHostMcpToolName,
  stripHostMcpToolPrefix,
  type HostMcpSurfaceResolver,
} from './host-mcp/index.js'
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
  /**
   * 进程内 MCP 服务器(E3 宿主工具面)。键是服务器名,值是
   * `{ type: 'sdk', name, instance }`(SDK 的 `McpSdkServerConfigWithInstance`)。
   * 结构保持宽松,SDK 因此仍是这个模块的软依赖。
   */
  mcpServers?: Record<string, unknown>
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
  /**
   * 宿主工具面(E3,§2)。装配层实现它 —— 它认识 store、工具注册表、v3 回合登记簿,
   * 而这个模块一个都不该认识。
   *
   * **不装 = 不注入**,与 E3 之前逐字同形:外部 agent 只有 SDK 自带的工具,发言
   * 靠收养兜底。装上之后协作工具经进程内 MCP 进去,发言权回到房间。
   */
  hostToolSurface?: HostMcpSurfaceResolver
}

/**
 * 这个执行器接不接宿主工具 —— **从 E0 的能力表读**,不在这里硬编码。
 *
 * 判据写死成 `providerId === 'claude-code-agent'` 的话,能力表就成了一份没人读的
 * 文档:把 `hostTools` 翻成 false 不会改变任何行为,而那正是「声明与真实能力分家」
 * 的开始(原则 5)。表里那一行现在有了读者,翻它就真的会停掉注入。
 */
function executorAcceptsHostTools(): boolean {
  return findAgentExecutorDescriptor(CLAUDE_CODE_AGENT_CONNECTOR_ID)
    ?.capabilities.hostTools === true
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
 * 事件流出口的**名字归一化**(E3)。
 *
 * SDK 侧宿主工具叫 `mcp__onething__send_message`(MCP 全名的规矩),而它就是本地
 * 回合里那个 `send_message` —— 前缀说的是「这次它是怎么进到 SDK 里的」,不是
 * 「它是什么」。归一化放在这里(翻译器出口)之后,下游一个都不必改:
 *
 *  - 打字灯的 `isCollabSendCall` 认得出它,外部 agent 说话时群里的「正在输入」
 *    终于会亮 —— 此前 W19 那盏灯对外部 agent 是恒灭的;
 *  - 步骤渲染、调度日志、退役名表看到的都是与本地回合逐字相同的名字。
 *
 * `canUseTool` 那一侧**刻意不归一化**:那是 SDK 的审批口,两类工具的分界线就画在
 * 那个前缀上(见下面的 `canUseTool`)。同一个字符串在两个面上承担两件事,所以只
 * 在事件面上抹掉。
 */
function normalizeToolName(name: string | undefined): string {
  return name ? stripHostMcpToolPrefix(name) : 'tool'
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
      const name = normalizeToolName(event.content_block.name)
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
      const name = normalizeToolName(block.name)
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

      /**
       * 宿主工具面的注入(E3 §2)。
       *
       * 两道门缺一不可:能力表说这个执行器接得住(`hostTools`),装配层装上了
       * 解析器。任何一道不过就退回 E3 之前的形状 —— 只有 SDK 自带工具。
       *
       * 解析失败**不炸回合**:注入不上的代价是这一轮没有发言权(收养兜底还在),
       * 抛出去的代价是这一轮什么都没有。
       */
      let hostTools: Awaited<ReturnType<HostMcpSurfaceResolver>> | undefined
      if (options.hostToolSurface && executorAcceptsHostTools()) {
        try {
          hostTools = await options.hostToolSurface({
            localSessionId: request.localSessionId,
            ...(request.messageId ? { messageId: request.messageId } : {}),
            cwd: request.cwd,
          })
        } catch (error) {
          options.logger?.warn?.(
            `[ClaudeCodeConnector] host tool surface failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          )
        }
      }

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
          ...(hostTools ? { mcpServers: hostTools.mcpServers } : {}),
          ...claudeCodeThinkingOptions(request),
          abortController,
          /**
           * **两类工具在这里分家**(§2)。
           *
           * 判据是 MCP 全名的前缀 `mcp__onething__`:
           *
           *  - **宿主工具**(带前缀):跑在我们自己的执行器里,而那条路上已经有
           *    完整的一套 —— 场子门、`permissionGuard`、`enforcePermissionPolicy`、
           *    v3 持牌校验。再过一遍 `canUseTool` 就是同一个动作被审两次:用户
           *    要点两下,而第二下问的是一件他刚刚已经答过的事。所以直接放行,
           *    真正的门在下游。
           *  - **SDK 自带工具**(不带前缀):Read/Write/Bash 跑在 CLI 进程里,
           *    我们对它们只剩这一座桥,照旧走宿主的审批。
           */
          canUseTool: async (toolName, input, { signal }) => {
            if (isHostMcpToolName(toolName)) {
              return { behavior: 'allow', updatedInput: input }
            }
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
              `[ClaudeCodeConnector] init session=${message.session_id} model=${init.model}`
                + ` apiKeySource=${init.apiKeySource} cwd=${init.cwd}`
                // 这一轮到底给了它哪几个宿主工具。注入静静地失败是最坏的结局
                // (发言权没了却看不出来),所以每一轮都把答案写进日志。
                + ` hostTools=[${hostTools?.toolNames.join(', ') ?? ''}]`,
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
        // 语境解绑。漏解的条目会让下一轮之后的迟到调用打在一份过期语境上,而那
        // 是最难查的一类串房 —— 所以它在 `finally` 里,与 abort 清理并列。
        hostTools?.release?.()
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
