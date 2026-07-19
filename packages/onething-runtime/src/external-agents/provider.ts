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
