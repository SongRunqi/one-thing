import { agentContentToText } from '@onething/core/agent-loop'
import type {
  AgentProvider,
  AgentTurnRequest,
  AgentTurnStreamEvent,
} from '@onething/core/agent-loop'
import type {
  ExternalAgentConnector,
  ExternalAgentSessionLink,
} from './types.js'

export interface CreateExternalAgentProviderOptions {
  providerId: string
  connector: ExternalAgentConnector
  localSessionId?: string
  workingDirectory?: string
  messageId?: string
  /** Previously persisted link for this session, to resume the external session. */
  resolveSessionLink?: (localSessionId: string) => ExternalAgentSessionLink | undefined
  /** Persist the (new or refreshed) link as soon as the turn establishes it. */
  onSessionLink?: (link: ExternalAgentSessionLink) => void
}

function latestUserPrompt(request: AgentTurnRequest): string {
  for (let index = request.messages.length - 1; index >= 0; index--) {
    const message = request.messages[index]
    if (message.role !== 'user') continue
    const text = agentContentToText(message.content).trim()
    if (text) return text
  }
  return ''
}

/**
 * Adapts an ExternalAgentConnector to the engine's AgentProvider seam:
 * connector-level events (session-established, agent-status) are consumed
 * here; everything else is the AgentTurnStreamEvent vocabulary already.
 */
export function createExternalAgentProvider(
  options: CreateExternalAgentProviderOptions,
): AgentProvider {
  return {
    id: options.providerId,
    capabilities: {
      capabilities: ['text-input', 'text-output', 'streaming', 'reasoning'],
      inputModalities: ['text'],
      outputModalities: ['text'],
      supportsStreaming: true,
      supportsReasoning: options.connector.capabilities.thinking,
      /**
       * 仍是 false —— 而 E3 之后这句话的含义变了,值得写清楚。
       *
       * 它答的是「**引擎的工具循环**要不要为这个 provider 装载工具」,答案是不要:
       * 外部 agent 的工具在它自己的循环里执行,引擎再装一份只会把同一批工具发两遍,
       * 然后等一个永远不会回到我们这条循环里的结果。
       *
       * 协作工具**不走这条路**:它们经进程内 MCP 直接注入 SDK(E3,§2
       * `host-mcp/`),由 connector 的 `hostToolSurface` 在每一轮解析、由**我们的**
       * 执行器执行。所以「没有工具面」这个 §0 诊断已经不成立了 —— 工具面回来了,
       * 只是它接在 connector 上,不接在这里。
       *
       * 这一位翻真要等 E2:那时 AgentExecutor 抽象接管「工具装载看 `hostTools`」,
       * 引擎不再从 provider 的这一位推断任何东西。
       */
      supportsTools: false,
    },

    async *streamTurn(request: AgentTurnRequest): AsyncGenerator<AgentTurnStreamEvent, void, void> {
      const prompt = latestUserPrompt(request)
      if (!prompt) throw new Error(`${options.providerId} prompt is empty`)

      const localSessionId = options.localSessionId ?? `${options.providerId}-${request.model}`
      const resume = options.connector.capabilities.resume
        ? options.resolveSessionLink?.(localSessionId)
        : undefined

      for await (const event of options.connector.streamTurn({
        localSessionId,
        messageId: options.messageId,
        prompt,
        // `||`: unbound sessions arrive with an empty-string working dir.
        cwd: options.workingDirectory || process.cwd(),
        // The provider id doubles as the picker's pseudo-model; only a real
        // model override is forwarded to the connector.
        model: request.model === options.providerId ? undefined : request.model,
        thinking: request.thinking,
        reasoningEffort: request.reasoningEffort,
        turn: request.turn,
        abortSignal: request.abortSignal,
        resume,
      })) {
        if (event.type === 'session-established') {
          options.onSessionLink?.(event.link)
          continue
        }
        if (event.type === 'agent-status') continue
        yield event
      }
    },
  }
}
