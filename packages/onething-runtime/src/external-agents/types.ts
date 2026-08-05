import type { AgentReasoningEffort, AgentTurnStreamEvent } from '@onething/core/agent-loop'
import type { InteractionAnswer, InteractionQuestion } from '@onething/core/interaction'

/**
 * External agent connectors: the transport layer that speaks one concrete
 * agent protocol (ACP, Claude Agent SDK, Codex app-server, pi RPC) and
 * normalizes it into the engine's AgentTurnStreamEvent vocabulary. See
 * docs/design/external-agents-integration.md §3.
 */

export type ExternalAgentPermissionBridgeKind = 'callback' | 'rpc' | 'stdio-dialog' | 'none'

export interface ExternalAgentCapabilities {
  streamingText: boolean
  thinking: boolean
  toolSteps: boolean
  permissionBridge: ExternalAgentPermissionBridgeKind
  resume: boolean
  fork: boolean
  steer: boolean
  imagesIn: boolean
  mcpInjection: 'in-process' | 'config' | 'none'
  /**
   * Whether one connector process serves many onething sessions
   * ('multiplexed': Codex app-server, ACP) or each active session needs its
   * own process ('per-process': Claude SDK query, pi RPC).
   */
  concurrentSessions: 'multiplexed' | 'per-process'
}

/**
 * Persisted link between an onething session and the agent's own session.
 * Written into the session meta at turn start so a crash never orphans the
 * external session; the local transcript is a rendering snapshot, the
 * external session is the source of truth for the agent's context.
 */
export interface ExternalAgentSessionLink {
  localSessionId: string
  connectorId: string
  externalSessionId: string
  cwd: string
  createdAt: number
  lastUsedAt: number
}

export interface ExternalAgentTurnRequest {
  localSessionId: string
  /** Assistant message the turn streams into; threads into permission asks. */
  messageId?: string
  prompt: string
  /**
   * 这一轮的 system prompt(E4/G9)。**persona 走这里进去** —— 在此之前整份
   * system prompt 在 `provider.ts` 被丢掉,群里的 Iris 于是不是 Iris,只是一台
   * 拿着最后一条 user 文本的 Claude Code。
   *
   * 谁认得它由 connector 决定:E0 能力表里 `persona: 'system'` 的执行器把它接到
   * 协议的 system 位(claude-code → SDK `systemPrompt`);`persona: 'prepend'`
   * 的只能拼在用户消息前面(ACP 没有 system 位)。
   */
  systemPrompt?: string
  cwd: string
  /** Connector-specific model/agent selector (ACP agent id, claude model, …). */
  model?: string
  thinking?: 'enabled' | 'disabled'
  reasoningEffort?: AgentReasoningEffort
  turn: number
  abortSignal?: AbortSignal
  /** Resume this previously persisted external session instead of starting fresh. */
  resume?: ExternalAgentSessionLink
}

export type ExternalAgentEvent =
  | AgentTurnStreamEvent
  | { type: 'session-established'; link: ExternalAgentSessionLink }
  | {
      type: 'agent-status'
      status: 'starting' | 'ready' | 'busy' | 'crashed'
      detail?: string
    }

/** Connector-agnostic permission ask, bridged by the host to the permission policy gate. */
export interface ExternalAgentPermissionAsk {
  connectorId: string
  localSessionId: string
  messageId?: string
  cwd?: string
  toolName: string
  input: unknown
  /**
   * 协议侧的工具调用 id(SDK 的 `toolUseID`,`sdk.d.ts:241-245`)。
   *
   * **卡片靠它归位**:core 只在 `callId` 存在时才发 `permission:queued`
   * (`core/permission/index.ts:393-400`),renderer 匹配不到 toolCall 就把事件
   * 永久缓存、一个字都不画(`stores/chat.ts:996-1006`)。E4 之前这里是
   * `undefined`,于是审批卡从未上屏 —— F3 那 2 分 11 秒的直接成因。
   *
   * 它同时是 120s 无人值守自动拒绝桥的定位键(`permission-policy.ts:78-81` 按
   * callId + messageId 找 pending),所以丢了它连兜底都找不到东西可结算。
   */
  toolCallId?: string
}

/**
 * 审批结果。**deny 必带 message** —— 它原样进 SDK 的工具结果给模型看,所以
 * 「为什么不行」必须是一句人话(超时理由、策略拒绝理由),不能是一个 false。
 */
export type ExternalAgentPermissionDecision =
  | { behavior: 'allow' }
  | { behavior: 'deny'; message: string }

/** Must never throw; a rejection is treated as a deny with the error text. */
export type ExternalAgentPermissionHandler = (
  ask: ExternalAgentPermissionAsk,
) => Promise<ExternalAgentPermissionDecision>

/**
 * 连接器无关的**提问**(E4/G6+G7)。与审批并列的一等概念,不是它的一个 case ——
 * 理由见 `packages/core/interaction/types.ts` 开头那段。
 *
 * 两条入口都汇到这里:SDK 的 `AskUserQuestion` 工具(经 `canUseTool`)与
 * `onUserDialog` 控制请求。装配层拿到它去起 `Interaction.ask`,并在没有人类在场
 * 的场合(pair 房)当场 `declined` —— 原则 3。
 */
export interface ExternalAgentInteractionAsk {
  connectorId: string
  localSessionId: string
  messageId?: string
  /** 发起提问的工具调用(`AskUserQuestion` 的 toolUseID);卡片按它归位。 */
  toolCallId?: string
  questions: InteractionQuestion[]
}

/**
 * 提问处理器。**永不 throw、永不挂起** —— 四种 outcome 都是正常返回值
 * (`Interaction.ask` 的契约),调用方必须逐种翻译成模型看得懂的工具结果。
 */
export type ExternalAgentInteractionHandler = (
  ask: ExternalAgentInteractionAsk,
) => Promise<InteractionAnswer>

export interface ExternalAgentConnector {
  readonly id: string
  readonly capabilities: ExternalAgentCapabilities
  streamTurn(request: ExternalAgentTurnRequest): AsyncIterable<ExternalAgentEvent>
  interrupt(localSessionId: string): Promise<void>
  /** Mid-run user input; only when capabilities.steer is true. */
  steer?(localSessionId: string, text: string): Promise<void>
  dispose(): Promise<void>
}

/**
 * MCP caller attribution: when onething injects its MCP server into an
 * external agent, the injected config carries a per-(connector, session)
 * token so incoming MCP calls can be attributed for permission-card
 * bylines and run_agent loop detection. Contract fixed here at P0; the
 * MCP server lands in P4.
 */
export interface ExternalAgentMcpAttribution {
  token: string
  connectorId: string
  localSessionId: string
  /** run_agent call-chain depth at issuance; used to enforce the depth cap. */
  chainDepth: number
}
