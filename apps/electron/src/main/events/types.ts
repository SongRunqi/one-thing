import type {
  GlobalEvent,
  GlobalEventEnvelope,
  SessionEvent,
  SessionEventEnvelope,
  StreamChunk,
} from '@shared/events/index.js'
import type {
  EmitResult as CoreEmitResult,
  GlobalObserveHandler as CoreGlobalObserveHandler,
  InterceptHandler as CoreInterceptHandler,
  InterceptResult,
  ObserveHandler as CoreObserveHandler,
  StreamChunkHandler as CoreStreamChunkHandler,
  TypedObserveHandler as CoreTypedObserveHandler,
  Unsubscribe,
} from '@onething/core/events'

export type { Unsubscribe, InterceptResult }

export type ObserveHandler = CoreObserveHandler<SessionEvent>
export type TypedObserveHandler<T extends SessionEvent['type']> = CoreTypedObserveHandler<SessionEvent, T>
export type GlobalObserveHandler = CoreGlobalObserveHandler<GlobalEvent>
export type StreamChunkHandler = CoreStreamChunkHandler<StreamChunk>
export type InterceptHandler = CoreInterceptHandler<SessionEvent>
export type EmitResult = CoreEmitResult<SessionEvent>
export type {
  GlobalEventEnvelope,
  SessionEventEnvelope,
  SessionEvent,
  StreamChunk,
}
