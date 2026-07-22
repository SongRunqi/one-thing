import type { EventBase, StreamChunkBase } from '../events/index.js'
import type { JsonObject } from '../json.js'
import type { CoreIPCEmitter, CoreReasoningPlacement } from './ipc-emitter.js'
import type { CoreToolArgsFinalizedBy } from './stream-processor.js'

export type CoreEventOnlyStreamChunk =
  | {
      type: 'text-delta'
      text: string
      turnIndex?: number
      voiceSpeakText?: string
    }
  | {
      type: 'reasoning-delta'
      reasoning: string
      turnIndex?: number
      placement?: CoreReasoningPlacement
    }
  | {
      type: 'tool-input-delta'
      toolCallId: string
      argsTextDelta: string
    }

export type CoreEventOnlySessionEvent<
  TStep = unknown,
  TToolCall = unknown,
  TToolPartialResult = unknown,
  TToolResult = unknown,
  TContentPart = unknown,
  TStreamCompleteData = unknown,
  TStreamErrorData = unknown,
> =
  | { type: 'tool:call'; toolCall: TToolCall }
  | { type: 'tool:result'; toolCall: TToolCall }
  | { type: 'tool:input-start'; toolCallId: string; toolName: string; toolCall: TToolCall }
  | { type: 'tool:input-end'; toolCallId: string; stepId?: string; toolCall: TToolCall; receivedAt: number; finalizedBy: CoreToolArgsFinalizedBy }
  | { type: 'tool:execution-start'; toolCallId: string; stepId: string; toolName: string; args: JsonObject; startTime?: number }
  | { type: 'tool:execution-update'; toolCallId: string; stepId: string; partialResult: TToolPartialResult }
  | { type: 'tool:execution-end'; toolCallId: string; stepId: string; result?: TToolResult; isError?: boolean; error?: string; durationMs?: number }
  | { type: 'content:part'; part: TContentPart }
  | { type: 'content:continuation'; turnIndex?: number }
  | { type: 'step:added'; step: TStep }
  | { type: 'step:updated'; stepId: string; updates: Partial<TStep> }
  | { type: 'stream:complete'; data: TStreamCompleteData }
  | { type: 'stream:error'; data: TStreamErrorData }
  | { type: 'stream:aborted'; reason?: string }
  | { type: 'context:size-updated'; contextSize: number }
  | { type: 'skill:activated'; skillName: string }

export interface CoreEventOnlyEventBusLike<TEvent extends EventBase = EventBase> {
  emit(sessionId: string, event: TEvent): Promise<unknown>
}

export interface CoreEventOnlyStreamChannelLike<TChunk extends StreamChunkBase = StreamChunkBase> {
  push(sessionId: string, chunk: TChunk): void
}

export interface CoreEventOnlyStoreHooks<TStep = unknown> {
  addMessageStep?(sessionId: string, assistantMessageId: string, step: TStep): void
  updateMessageStep?(sessionId: string, assistantMessageId: string, stepId: string, updates: Partial<TStep>): void
  updateSessionContextSize?(sessionId: string, contextSize: number): void
  updateMessageSkill?(sessionId: string, assistantMessageId: string, skillName: string): void
}

export interface CoreEventOnlyLogger {
  log(message?: unknown, ...optionalParams: unknown[]): void
  error(message?: unknown, ...optionalParams: unknown[]): void
}

export interface CreateCoreEventOnlyEmitterOptions<
  TStep = unknown,
  TToolCall = unknown,
  TToolPartialResult = unknown,
  TToolResult = unknown,
  TContentPart = unknown,
  TStreamCompleteData = unknown,
  TStreamErrorData = unknown,
> {
  sessionId: string
  assistantMessageId: string
  getEventBus?: () => CoreEventOnlyEventBusLike<
    CoreEventOnlySessionEvent<
      TStep,
      TToolCall,
      TToolPartialResult,
      TToolResult,
      TContentPart,
      TStreamCompleteData,
      TStreamErrorData
    >
  > | null | undefined
  getStreamChannel?: () => CoreEventOnlyStreamChannelLike<CoreEventOnlyStreamChunk> | null | undefined
  store?: CoreEventOnlyStoreHooks<TStep>
  debugStream?: boolean | (() => boolean)
  logger?: CoreEventOnlyLogger
  now?: () => number
  nowIso?: () => string
}

const debugLastPushAt = new Map<string, number>()

function debugEnabled(value: boolean | (() => boolean) | undefined): boolean {
  return typeof value === 'function' ? value() : Boolean(value)
}

function previewText(value: string, maxLength = 240): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function debugGapMs(key: string, now: number): number | undefined {
  const previous = debugLastPushAt.get(key)
  debugLastPushAt.set(key, now)
  return previous === undefined ? undefined : now - previous
}

export function createCoreEventOnlyEmitter<
  TStep = unknown,
  TToolCall = unknown,
  TToolPartialResult = unknown,
  TToolResult = unknown,
  TContentPart = unknown,
  TStreamCompleteData = unknown,
  TStreamErrorData = unknown,
>(
  options: CreateCoreEventOnlyEmitterOptions<
    TStep,
    TToolCall,
    TToolPartialResult,
    TToolResult,
    TContentPart,
    TStreamCompleteData,
    TStreamErrorData
  >
): CoreIPCEmitter<
  TStep,
  TToolCall,
  TToolPartialResult,
  TToolResult,
  TContentPart,
  TStreamCompleteData,
  TStreamErrorData
> {
  const {
    sessionId,
    assistantMessageId,
    getEventBus,
    getStreamChannel,
    store,
    logger = console,
    now = Date.now,
    nowIso = () => new Date().toISOString(),
  } = options

  type EventBusAdapter = CoreEventOnlyEventBusLike<
    CoreEventOnlySessionEvent<
      TStep,
      TToolCall,
      TToolPartialResult,
      TToolResult,
      TContentPart,
      TStreamCompleteData,
      TStreamErrorData
    >
  >
  type StreamChannelAdapter = CoreEventOnlyStreamChannelLike<CoreEventOnlyStreamChunk>

  let eventBus: EventBusAdapter | null = null
  let streamChannel: StreamChannelAdapter | null = null

  function bus(): EventBusAdapter | null {
    if (!eventBus && getEventBus) {
      try {
        eventBus = getEventBus() ?? null
      } catch {
        eventBus = null
      }
    }
    return eventBus
  }

  function stream(): StreamChannelAdapter | null {
    if (!streamChannel && getStreamChannel) {
      try {
        streamChannel = getStreamChannel() ?? null
      } catch {
        streamChannel = null
      }
    }
    return streamChannel
  }

  function emitSafe(event: CoreEventOnlySessionEvent<
    TStep,
    TToolCall,
    TToolPartialResult,
    TToolResult,
    TContentPart,
    TStreamCompleteData,
    TStreamErrorData
  >): void {
    const eventBus = bus()
    if (!eventBus) return

    eventBus.emit(sessionId, event).catch(err => {
      logger.error('[EventOnlyEmitter] EventBus emit error:', err)
    })
  }

  function pushSafe(chunk: CoreEventOnlyStreamChunk, debug?: () => void): void {
    const streamChannel = stream()
    if (!streamChannel) return

    try {
      debug?.()
      streamChannel.push(sessionId, chunk)
    } catch (err) {
      logger.error('[EventOnlyEmitter] StreamChannel error:', err)
    }
  }

  return {
    sendTextChunk(text, turnIndex, voiceSpeakText) {
      pushSafe({
        type: 'text-delta',
        text,
        ...(turnIndex !== undefined ? { turnIndex } : {}),
        ...(voiceSpeakText !== undefined ? { voiceSpeakText } : {}),
      }, () => {
        if (!debugEnabled(options.debugStream)) return
        const key = `${sessionId}:${assistantMessageId}:text`
        logger.log('[EventOnlyEmitter] push text-delta', {
          time: nowIso(),
          gapMs: debugGapMs(key, now()),
          sessionId,
          assistantMessageId,
          chars: text.length,
          text: previewText(text),
          turnIndex,
        })
      })
    },

    sendReasoningChunk(reasoning, turnIndex, placement) {
      pushSafe({
        type: 'reasoning-delta',
        reasoning,
        ...(turnIndex !== undefined ? { turnIndex } : {}),
        ...(placement ? { placement } : {}),
      }, () => {
        if (!debugEnabled(options.debugStream)) return
        const key = `${sessionId}:${assistantMessageId}:reasoning`
        logger.log('[EventOnlyEmitter] push reasoning-delta', {
          time: nowIso(),
          gapMs: debugGapMs(key, now()),
          sessionId,
          assistantMessageId,
          chars: reasoning.length,
          text: previewText(reasoning),
          turnIndex,
          placement,
        })
      })
    },

    sendToolInputDelta(toolCallId, argsTextDelta) {
      pushSafe({ type: 'tool-input-delta', toolCallId, argsTextDelta })
    },

    sendToolCall(toolCall) {
      emitSafe({ type: 'tool:call', toolCall })
    },

    sendToolResult(toolCall) {
      emitSafe({ type: 'tool:result', toolCall })
    },

    sendToolInputStart(toolCallId, toolName, toolCall) {
      emitSafe({ type: 'tool:input-start', toolCallId, toolName, toolCall })
    },

    sendToolInputEnd(toolCallId, stepId, toolCall, receivedAt, finalizedBy) {
      emitSafe({ type: 'tool:input-end', toolCallId, stepId, toolCall, receivedAt, finalizedBy })
    },

    sendToolExecutionStart(toolCallId, stepId, toolName, args, startTime) {
      emitSafe({ type: 'tool:execution-start', toolCallId, stepId, toolName, args, startTime })
    },

    sendToolExecutionUpdate(toolCallId, stepId, partialResult) {
      emitSafe({ type: 'tool:execution-update', toolCallId, stepId, partialResult })
    },

    sendToolExecutionEnd(toolCallId, stepId, result, isError, error, durationMs) {
      emitSafe({ type: 'tool:execution-end', toolCallId, stepId, result, isError, error, durationMs })
    },

    sendContentPart(part) {
      emitSafe({ type: 'content:part', part })
    },

    sendContinuation(turnIndex?) {
      emitSafe({ type: 'content:continuation', turnIndex })
    },

    sendStepAdded(step) {
      store?.addMessageStep?.(sessionId, assistantMessageId, step)
      emitSafe({ type: 'step:added', step })
    },

    sendStepUpdated(stepId, updates) {
      store?.updateMessageStep?.(sessionId, assistantMessageId, stepId, updates)
      emitSafe({ type: 'step:updated', stepId, updates })
    },

    sendStreamComplete(data) {
      emitSafe({ type: 'stream:complete', data })
    },

    sendStreamError(data) {
      emitSafe({ type: 'stream:error', data })
    },

    sendStreamAborted(reason) {
      emitSafe({ type: 'stream:aborted', reason })
    },

    sendContextSizeUpdate(contextSize) {
      store?.updateSessionContextSize?.(sessionId, contextSize)
      emitSafe({ type: 'context:size-updated', contextSize })
    },

    sendSkillActivated(skillName) {
      store?.updateMessageSkill?.(sessionId, assistantMessageId, skillName)
      emitSafe({ type: 'skill:activated', skillName })
    },
  }
}
