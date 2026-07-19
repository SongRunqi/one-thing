import type { AgentReasoningEffort, AgentTurnStreamEvent } from '@onething/core/agent-loop'

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

/** Connector-agnostic permission ask, bridged by the host to Permission.ask. */
export interface ExternalAgentPermissionAsk {
  connectorId: string
  localSessionId: string
  messageId?: string
  cwd?: string
  toolName: string
  input: unknown
}

/** Resolve true to allow, false to deny. Must never throw; a rejection denies. */
export type ExternalAgentPermissionHandler = (
  ask: ExternalAgentPermissionAsk,
) => Promise<boolean>

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
