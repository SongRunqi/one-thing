import type { JsonObject } from './json.js'
import type {
  StreamChunkBase,
  StreamChunkHandler,
  Unsubscribe,
} from './events/types.js'

export interface CoreTextStreamChunk extends StreamChunkBase {
  type: 'text-delta'
  text: string
  turnIndex?: number
  voiceSpeakText?: string
}

export interface CoreStreamChannelLike<TChunk extends StreamChunkBase = StreamChunkBase> {
  subscribe(sessionId: string, handler: StreamChunkHandler<TChunk>): Unsubscribe
}

export interface CoreSendMessageOptions {
  sessionId: string
  content: string
  channel?: string
  source?: string
  attachments?: JsonObject[]
}

export interface CoreConversationSendMessageCommand {
  type: 'command:send-message'
  channel?: string
  content: string
  source?: string
  attachments?: JsonObject[]
}

export interface CoreSessionRuntime {
  ensureSession(sessionId: string): void
  destroySession(sessionId: string): void
}

export interface CoreConversationRuntime<TChunk extends StreamChunkBase = StreamChunkBase>
  extends CoreSessionRuntime {
  readonly streamChannel: CoreStreamChannelLike<TChunk>
  sendMessage(options: CoreSendMessageOptions): Promise<void>
}

export interface CoreConversationEngineLike<TSender = unknown> {
  handleSendMessage(
    sessionId: string,
    command: CoreConversationSendMessageCommand,
    sender: TSender,
  ): Promise<void>
}

export interface CoreConversationRuntimeFactoryOptions<
  TChunk extends StreamChunkBase = StreamChunkBase,
  TSender = unknown,
> {
  engine: CoreConversationEngineLike<TSender>
  streamChannel: CoreStreamChannelLike<TChunk>
  sender?: TSender
  sessionRuntime?: CoreSessionRuntime
}

export function isCoreTextStreamChunk(chunk: unknown): chunk is CoreTextStreamChunk {
  if (!chunk || typeof chunk !== 'object') return false
  const candidate = chunk as Partial<CoreTextStreamChunk>
  return candidate.type === 'text-delta' && typeof candidate.text === 'string'
}

export function isCoreConversationRuntime(value: unknown): value is CoreConversationRuntime {
  if (!value || typeof value !== 'object') return false
  const runtime = value as Partial<CoreConversationRuntime>
  const streamChannel = runtime.streamChannel as Partial<CoreStreamChannelLike> | undefined
  return typeof runtime.ensureSession === 'function'
    && typeof runtime.destroySession === 'function'
    && typeof runtime.sendMessage === 'function'
    && streamChannel !== undefined
    && typeof streamChannel.subscribe === 'function'
}
