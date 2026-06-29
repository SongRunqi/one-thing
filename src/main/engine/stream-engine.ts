import type { PermissionMode } from '../../shared/ipc.js'
import {
  type CoreStreamEngineRuntime,
} from '@onething/core/engine'
import {
  OnethingStreamEngine,
  type BindableOnethingStreamSender,
  type OnethingStreamSender,
  type OnethingStreamSenderPayload,
} from '@onething/runtime/stream-engine'
import type { EventBus } from '../events/event-bus.js'
import {
  createMainStreamEngineRuntime,
  type MainStreamEngineRuntime,
} from './stream-engine-runtime.js'

export type StreamSenderPayload = OnethingStreamSenderPayload
export type StreamSender = OnethingStreamSender
export type BindableStreamSender = BindableOnethingStreamSender

export class StreamEngine extends OnethingStreamEngine<EventBus, StreamSender> {
  constructor(private readonly mainRuntime: MainStreamEngineRuntime = createMainStreamEngineRuntime()) {
    super(mainRuntime as unknown as CoreStreamEngineRuntime)
  }

  getPermissionMode(sessionId: string): PermissionMode {
    return super.getPermissionMode(sessionId) as PermissionMode
  }

  bind(sender: BindableStreamSender): void {
    super.bind(sender)
  }

  protected override onShutdown(): void {
    super.onShutdown()
    console.log('[StreamEngine] Shut down')
  }
}
