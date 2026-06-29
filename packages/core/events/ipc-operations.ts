import type { EventBase } from './types.js'

type MaybePromise<T> = T | Promise<T>

export interface CoreSessionCommandEmitterLike<
  TCommand extends EventBase = EventBase,
  TResult = unknown,
> {
  emit(sessionId: string, command: TCommand): MaybePromise<TResult>
}

export interface CoreSessionEventEmitterLike<
  TEvent extends EventBase = EventBase,
  TResult = unknown,
> {
  emit(sessionId: string, event: TEvent): MaybePromise<TResult>
}

export interface EmitCoreSessionCommandForIpcOptions<
  TCommand extends EventBase = EventBase,
  TResult = unknown,
> {
  sessionId: string
  command: TCommand
  eventBus: CoreSessionCommandEmitterLike<TCommand, TResult>
  logger?: {
    error?: (...args: unknown[]) => void
  }
}

export type CoreSessionCommandIpcResult<TResult = unknown> =
  | { success: true; result: TResult }
  | { success: false; error: string }

export interface EmitCoreSessionEventSafelyOptions<
  TEvent extends EventBase = EventBase,
  TResult = unknown,
> {
  sessionId: string
  event: TEvent
  eventBus: CoreSessionEventEmitterLike<TEvent, TResult>
  logger?: {
    error?: (...args: unknown[]) => void
  }
  errorLabel?: string
}

export async function emitCoreSessionCommandForIpc<
  TCommand extends EventBase,
  TResult,
>(
  options: EmitCoreSessionCommandForIpcOptions<TCommand, TResult>,
): Promise<CoreSessionCommandIpcResult<TResult>> {
  try {
    const result = await options.eventBus.emit(options.sessionId, options.command)
    return { success: true, result }
  } catch (error) {
    options.logger?.error?.('[CoreEvents] session command emit failed:', error)
    return {
      success: false,
      error: error instanceof Error && error.message
        ? error.message
        : 'Failed to handle command',
    }
  }
}

export async function emitCoreSessionEventSafely<
  TEvent extends EventBase,
  TResult,
>(
  options: EmitCoreSessionEventSafelyOptions<TEvent, TResult>,
): Promise<TResult | undefined> {
  try {
    return await options.eventBus.emit(options.sessionId, options.event)
  } catch (error) {
    options.logger?.error?.(options.errorLabel ?? '[CoreEvents] session event emit failed:', error)
    return undefined
  }
}
