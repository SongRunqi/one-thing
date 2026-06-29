import { agentContentToText, collectAgentTurnFromStream } from '@onething/core/agent-loop'
import type {
  AgentFinishReason,
  AgentProvider,
  AgentTurnRequest,
  AgentTurnStreamEvent,
} from '@onething/core/agent-loop'

export interface CoreACPPromptStreamOptions {
  localSessionId: string
  prompt: string
  cwd: string
  abortSignal?: AbortSignal
}

export interface CoreACPContentPart {
  type: string
  text?: string
}

export type CoreACPPromptStreamEvent =
  | { type: 'warning'; message: string }
  | { type: 'finish'; stopReason: string; usage?: { inputTokens: number; outputTokens: number; totalTokens: number } }
  | {
      type: 'update'
      notification: {
        update: {
          sessionUpdate: string
          content?: CoreACPContentPart | CoreACPContentPart[] | null
        }
      }
    }

export interface CoreACPAgentProviderOptions {
  workingDirectory?: string
  localSessionId?: string
  cwd?: () => string
  streamPrompt: (
    model: string,
    options: CoreACPPromptStreamOptions,
  ) => AsyncIterable<CoreACPPromptStreamEvent>
}

function mapACPFinishReason(stopReason: string): AgentFinishReason {
  if (stopReason === 'end_turn') return 'stop'
  if (stopReason === 'max_tokens') return 'length'
  if (stopReason === 'refusal') return 'content_filter'
  return 'unknown'
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

function textFromACPContent(content: CoreACPContentPart | CoreACPContentPart[] | null | undefined): string | undefined {
  if (!content || Array.isArray(content)) return undefined
  return content.type === 'text' ? content.text : undefined
}

export function createACPAgentProvider(options: CoreACPAgentProviderOptions): AgentProvider {
  return {
    id: 'acp',
    capabilities: {
      capabilities: ['text-input', 'text-output', 'streaming', 'reasoning'],
      inputModalities: ['text'],
      outputModalities: ['text'],
      supportsStreaming: true,
      supportsReasoning: true,
      supportsTools: false,
    },

    async *streamTurn(request: AgentTurnRequest): AsyncGenerator<AgentTurnStreamEvent, void, void> {
      const prompt = latestUserPrompt(request)
      if (!prompt) throw new Error('ACP prompt is empty')

      for await (const event of options.streamPrompt(request.model, {
        localSessionId: options.localSessionId ?? `acp-${request.model}`,
        prompt,
        cwd: options.workingDirectory ?? options.cwd?.() ?? '.',
        abortSignal: request.abortSignal,
      })) {
        if (event.type === 'warning') {
          yield { type: 'reasoning-delta', turn: request.turn, delta: event.message }
          continue
        }

        if (event.type === 'finish') {
          yield {
            type: 'finish',
            turn: request.turn,
            finishReason: mapACPFinishReason(event.stopReason),
            usage: event.usage,
          }
          continue
        }

        const update = event.notification.update
        switch (update.sessionUpdate) {
          case 'agent_message_chunk':
            {
              const text = textFromACPContent(update.content)
              if (text) yield { type: 'text-delta', turn: request.turn, delta: text }
            }
            break
          case 'agent_thought_chunk':
            {
              const text = textFromACPContent(update.content)
              if (text) yield { type: 'reasoning-delta', turn: request.turn, delta: text }
            }
            break
          case 'plan':
            yield { type: 'reasoning-delta', turn: request.turn, delta: 'ACP plan updated.' }
            break
          case 'tool_call':
          case 'tool_call_update':
            yield { type: 'reasoning-delta', turn: request.turn, delta: 'ACP tool activity updated.' }
            break
          default:
            break
        }
      }
    },

    async runTurn(request) {
      if (!this.streamTurn) throw new Error('ACP streamTurn unavailable')
      return collectAgentTurnFromStream(this.streamTurn(request), request.onEvent)
    },
  }
}
