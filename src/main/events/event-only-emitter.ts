/**
 * Event-Only Emitter
 *
 * Main-process wrapper around the core event-only emitter. The core factory
 * owns IPCEmitter-to-EventBus/StreamChannel mapping; this file only injects
 * main singletons and store side effects.
 */

import * as store from '../store.js'
import type { SessionEvent, StreamChunk } from '../../shared/events/index.js'
import type { ContentPart, Step, ToolCall, ToolPartialResult, ToolResult } from '../../shared/ipc.js'
import type { StreamContext } from '../engine/stream/stream-processor.js'
import type { IPCEmitter, StreamCompleteData, StreamErrorData } from '../engine/stream/ipc-emitter.js'
import { createCoreEventOnlyEmitter } from '@onething/core/engine'
import { getEventBus, getStreamChannel } from './index.js'

function shouldDebugStream(): boolean {
  return process.env.ONETHING_DEBUG_STREAM === '1' || process.env.ONETHING_DEBUG_CODEX_STREAM === '1'
}

/**
 * Create an event-only emitter that sends to EventBus/StreamChannel.
 * IPCBridge translates these events to renderer IPC.
 */
export function createEventOnlyEmitter(ctx: StreamContext): IPCEmitter {
  const sessionId = ctx.sessionId
  const assistantMessageId = ctx.assistantMessageId

  return createCoreEventOnlyEmitter<
    Step,
    ToolCall,
    ToolPartialResult,
    ToolResult,
    ContentPart,
    StreamCompleteData,
    StreamErrorData
  >({
    sessionId,
    assistantMessageId,
    getEventBus: () => {
      const eventBus = getEventBus()
      return {
        emit: (targetSessionId, event) => eventBus.emit(targetSessionId, event as SessionEvent),
      }
    },
    getStreamChannel: () => {
      const streamChannel = getStreamChannel()
      return {
        push: (targetSessionId, chunk) => streamChannel.push(targetSessionId, chunk as StreamChunk),
      }
    },
    store: {
      addMessageStep: store.addMessageStep,
      updateMessageStep: store.updateMessageStep,
      updateSessionContextSize: (targetSessionId, contextSize) =>
        store.updateSessionContextSize(targetSessionId, contextSize, 'provider-finish'),
      updateMessageSkill: store.updateMessageSkill,
    },
    debugStream: shouldDebugStream,
  })
}
