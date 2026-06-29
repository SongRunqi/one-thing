import type { StreamChunkBase } from '@onething/core/events'
import type {
  CoreConversationRuntime,
  CoreConversationRuntimeFactoryOptions,
} from '@onething/core/gateway-runtime'
export {
  isCoreConversationRuntime as isOnethingConversationRuntime,
  isCoreTextStreamChunk as isOnethingTextStreamChunk,
} from '@onething/core/gateway-runtime'
export type {
  CoreConversationRuntime as OnethingConversationRuntime,
  CoreSendMessageOptions as OnethingSendMessageOptions,
  CoreSessionRuntime as OnethingSessionRuntime,
  CoreStreamChannelLike as OnethingStreamChannelLike,
  CoreTextStreamChunk as OnethingTextStreamChunk,
} from '@onething/core/gateway-runtime'
import {
  NoopOnethingStreamSender,
  type OnethingStreamSender,
} from './stream-engine.js'

export type OnethingConversationRuntimeFromStreamEngineOptions<TChunk extends StreamChunkBase = StreamChunkBase> =
  CoreConversationRuntimeFactoryOptions<TChunk, OnethingStreamSender>

export function createOnethingConversationRuntimeFromStreamEngine<TChunk extends StreamChunkBase = StreamChunkBase>(
  options: OnethingConversationRuntimeFromStreamEngineOptions<TChunk>,
): CoreConversationRuntime<TChunk> {
  const sender = options.sender ?? new NoopOnethingStreamSender()
  const sessionRuntime = options.sessionRuntime ?? {
    ensureSession() {},
    destroySession() {},
  }

  return {
    streamChannel: options.streamChannel,
    ensureSession(sessionId) {
      sessionRuntime.ensureSession(sessionId)
    },
    destroySession(sessionId) {
      sessionRuntime.destroySession(sessionId)
    },
    async sendMessage(message) {
      sessionRuntime.ensureSession(message.sessionId)
      await options.engine.handleSendMessage(
        message.sessionId,
        {
          type: 'command:send-message',
          channel: message.channel,
          content: message.content,
          source: message.source,
          attachments: message.attachments,
        },
        sender,
      )
    },
  }
}
