import { ACPManager } from '../../acp/index.js'
import type {
  AgentFinishReason,
  AgentProvider,
  AgentTurnRequest,
  AgentTurnStreamEvent,
} from '../types.js'
import { agentContentToText, collectAgentTurnFromStream } from '../stream.js'

export interface ACPAgentProviderOptions {
  workingDirectory?: string
  localSessionId?: string
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

export function createACPAgentProvider(options: ACPAgentProviderOptions = {}): AgentProvider {
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

    async *streamTurn(request: AgentTurnRequest): AsyncGenerator<AgentTurnStreamEvent, void, unknown> {
      const prompt = latestUserPrompt(request)
      if (!prompt) throw new Error('ACP prompt is empty')

      for await (const event of ACPManager.streamPrompt(request.model, {
        localSessionId: options.localSessionId ?? `acp-${request.model}`,
        prompt,
        cwd: options.workingDirectory ?? process.cwd(),
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

        const update = event.notification.update as any
        switch (update.sessionUpdate) {
          case 'agent_message_chunk':
            if (update.content?.type === 'text' && update.content.text) {
              yield { type: 'text-delta', turn: request.turn, delta: update.content.text }
            }
            break
          case 'agent_thought_chunk':
            if (update.content?.type === 'text' && update.content.text) {
              yield { type: 'reasoning-delta', turn: request.turn, delta: update.content.text }
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
