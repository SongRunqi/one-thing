import { agentContentToText, collectAgentTurnFromStream } from '@onething/core/agent-loop'
import type {
  AgentFinishReason,
  AgentProvider,
  AgentToolCall,
  AgentToolResult,
  AgentToolResultContentPart,
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

/**
 * Structural subset of ACP `ToolCallContent`: either an embedded content
 * block (`type: 'content'`) or a diff (`type: 'diff'`). Terminal refs are
 * ignored.
 */
export interface CoreACPToolCallContentPart {
  type: string
  content?: CoreACPContentPart | null
  text?: string
  path?: string | null
  oldText?: string | null
  newText?: string | null
}

/**
 * Structural subset of the ACP `tool_call` / `tool_call_update` session
 * update payloads (@agentclientprotocol/sdk ToolCall / ToolCallUpdate).
 */
export interface CoreACPSessionUpdate {
  sessionUpdate: string
  /**
   * Message/thought chunks carry a single content block; tool_call and
   * tool_call_update carry an array of ToolCallContent — same wire field.
   */
  content?: CoreACPContentPart | CoreACPToolCallContentPart[] | null
  toolCallId?: string
  title?: string | null
  kind?: string | null
  status?: string | null
  rawInput?: unknown
  rawOutput?: unknown
}

export type CoreACPPromptStreamEvent =
  | { type: 'warning'; message: string }
  | { type: 'finish'; stopReason: string; usage?: { inputTokens: number; outputTokens: number; totalTokens: number } }
  | {
      type: 'update'
      notification: {
        update: CoreACPSessionUpdate
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

function textFromACPContent(
  content: CoreACPContentPart | CoreACPToolCallContentPart[] | null | undefined,
): string | undefined {
  if (!content || Array.isArray(content)) return undefined
  return content.type === 'text' ? content.text : undefined
}

function safeStringify(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function acpToolContentToParts(
  content: CoreACPToolCallContentPart[] | null | undefined,
): AgentToolResultContentPart[] {
  const parts: AgentToolResultContentPart[] = []
  for (const item of content ?? []) {
    if (item.type === 'content') {
      const text = item.content?.type === 'text' ? item.content.text : item.text
      if (text) parts.push({ type: 'text', text })
      continue
    }
    if (item.type === 'diff') {
      const path = item.path ?? ''
      parts.push({ type: 'text', text: `[diff] ${path}`.trim(), path: item.path ?? undefined })
    }
  }
  return parts
}

interface ACPToolCallState {
  toolCall: AgentToolCall
  settled: boolean
  resultParts: AgentToolResultContentPart[]
}

/** Per-stream tracker mapping ACP tool_call notifications onto structured
 * externally-executed agent tool events. */
function createACPToolCallTracker(turn: number) {
  const states = new Map<string, ACPToolCallState>()

  const start = (update: CoreACPSessionUpdate): AgentTurnStreamEvent[] => {
    const id = update.toolCallId
    if (!id) return []
    const existing = states.get(id)
    if (existing) return progress(update)
    const toolCall: AgentToolCall = {
      id,
      name: update.kind || 'tool',
      arguments: safeStringify(update.rawInput ?? {}) || '{}',
      externallyExecuted: true,
    }
    const state: ACPToolCallState = { toolCall, settled: false, resultParts: [] }
    states.set(id, state)
    const events: AgentTurnStreamEvent[] = [
      { type: 'tool-call-start', turn, toolCallId: id, toolName: toolCall.name },
      { type: 'tool-call-done', turn, toolCall },
    ]
    if (update.title) {
      events.push({ type: 'tool-metadata', turn, toolCall, update: { title: update.title } })
    }
    events.push(...progressEvents(state, update))
    return events
  }

  const progress = (update: CoreACPSessionUpdate): AgentTurnStreamEvent[] => {
    const id = update.toolCallId
    if (!id) return []
    const state = states.get(id)
    // Defensive: some agents emit tool_call_update before tool_call.
    if (!state) return start({ ...update, sessionUpdate: 'tool_call' })
    if (state.settled) return []
    const events: AgentTurnStreamEvent[] = []
    if (update.title) {
      events.push({
        type: 'tool-metadata',
        turn,
        toolCall: state.toolCall,
        update: { title: update.title },
      })
    }
    events.push(...progressEvents(state, update))
    return events
  }

  const progressEvents = (
    state: ACPToolCallState,
    update: CoreACPSessionUpdate,
  ): AgentTurnStreamEvent[] => {
    const events: AgentTurnStreamEvent[] = []
    const parts = acpToolContentToParts(Array.isArray(update.content) ? update.content : undefined)
    if (parts.length > 0) {
      state.resultParts.push(...parts)
      events.push({
        type: 'tool-partial-result',
        turn,
        toolCall: state.toolCall,
        update: { content: parts },
      })
    }
    if (update.status === 'completed' || update.status === 'failed') {
      events.push(settleEvent(state, {
        failed: update.status === 'failed',
        rawOutput: update.rawOutput,
      }))
    }
    return events
  }

  const settleEvent = (
    state: ACPToolCallState,
    outcome: { failed?: boolean; aborted?: boolean; rawOutput?: unknown },
  ): AgentTurnStreamEvent => {
    state.settled = true
    const content = safeStringify(outcome.rawOutput)
      || state.resultParts.map(part => part.text ?? '').filter(Boolean).join('\n')
    const result: AgentToolResult = {
      content,
      ...(outcome.failed ? { error: content || 'Tool call failed' } : {}),
      ...(outcome.aborted ? { aborted: true, error: content || 'Tool call cancelled' } : {}),
    }
    return { type: 'tool-result', turn, toolCall: state.toolCall, result }
  }

  /** The stream is ending; every unsettled call must still reach a terminal
   * state so downstream step state machines never hang on "running". */
  const settleRemaining = (options: { aborted: boolean }): AgentTurnStreamEvent[] => {
    const events: AgentTurnStreamEvent[] = []
    for (const state of states.values()) {
      if (state.settled) continue
      events.push(settleEvent(state, { aborted: options.aborted }))
    }
    return events
  }

  return { start, progress, settleRemaining }
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

      const tracker = createACPToolCallTracker(request.turn)

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
          yield* tracker.settleRemaining({ aborted: event.stopReason === 'cancelled' })
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
            yield* tracker.start(update)
            break
          case 'tool_call_update':
            yield* tracker.progress(update)
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
