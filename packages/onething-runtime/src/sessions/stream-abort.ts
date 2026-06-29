type MaybePromise<T> = T | Promise<T>

export interface OnethingAbortToolCallLike {
  status?: string
  requiresConfirmation?: boolean
  canRespond?: boolean
}

export interface OnethingAbortStepLike<TToolCall extends OnethingAbortToolCallLike = OnethingAbortToolCallLike> {
  id: string
  status?: string
  toolCall?: TToolCall
}

export interface OnethingAbortMessageLike<TStep extends OnethingAbortStepLike = OnethingAbortStepLike> {
  id: string
  isStreaming?: boolean
  steps?: TStep[]
}

export interface OnethingAbortSessionLike<TMessage extends OnethingAbortMessageLike = OnethingAbortMessageLike> {
  messages: TMessage[]
}

export type OnethingAbortCleanupEvent<TStep extends OnethingAbortStepLike = OnethingAbortStepLike> =
  | {
      type: 'step:updated'
      stepId: string
      updates: Partial<TStep>
    }
  | {
      type: 'message:updated'
      messageId: string
      updates: { isStreaming: false }
    }
  | {
      type: 'stream:complete'
      data: { aborted: true }
    }

export interface CancelOnethingStreamingStepsForAbortOptions<
  TToolCall extends OnethingAbortToolCallLike = OnethingAbortToolCallLike,
  TStep extends OnethingAbortStepLike<TToolCall> = OnethingAbortStepLike<TToolCall>,
  TMessage extends OnethingAbortMessageLike<TStep> = OnethingAbortMessageLike<TStep>,
  TSession extends OnethingAbortSessionLike<TMessage> = OnethingAbortSessionLike<TMessage>,
> {
  sessionId: string
  getSession(sessionId: string): TSession | null | undefined
  updateMessageStep(
    sessionId: string,
    messageId: string,
    stepId: string,
    updates: Partial<TStep>
  ): MaybePromise<unknown>
  updateMessageStreaming(
    sessionId: string,
    messageId: string,
    streaming: boolean
  ): MaybePromise<unknown>
  flushSessionSave(sessionId: string): MaybePromise<unknown>
  emitEvent(sessionId: string, event: OnethingAbortCleanupEvent<TStep>): MaybePromise<unknown>
}

export interface CancelOnethingStreamingStepsForAbortResult {
  completed: boolean
  cancelledSteps: number
  messageId?: string
}

export interface AbortOnethingStreamsForIpcLogger {
  log?: (...args: unknown[]) => void
  error?: (...args: unknown[]) => void
}

export interface AbortOnethingStreamsForIpcOptions<
  TToolCall extends OnethingAbortToolCallLike = OnethingAbortToolCallLike,
  TStep extends OnethingAbortStepLike<TToolCall> = OnethingAbortStepLike<TToolCall>,
  TMessage extends OnethingAbortMessageLike<TStep> = OnethingAbortMessageLike<TStep>,
  TSession extends OnethingAbortSessionLike<TMessage> = OnethingAbortSessionLike<TMessage>,
> extends Omit<CancelOnethingStreamingStepsForAbortOptions<TToolCall, TStep, TMessage, TSession>, 'sessionId'> {
  sessionId?: string
  getLegacyActiveSessionIds(): Iterable<string>
  abortLegacyStream(sessionId: string): boolean
  abortEngineStream(sessionId: string): boolean
  abortAllEngineStreams(): boolean
  clearPermission(sessionId: string): void
  logger?: AbortOnethingStreamsForIpcLogger
}

export interface AbortOnethingStreamsForIpcResult {
  success: boolean
}

export interface ListOnethingActiveStreamsForIpcOptions {
  getLegacyActiveSessionIds(): Iterable<string>
  getEngineActiveSessionIds(): Iterable<string>
}

export interface ListOnethingActiveStreamsForIpcResult {
  success: true
  sessionIds: string[]
}

export async function cancelOnethingStreamingStepsForAbort<
  TToolCall extends OnethingAbortToolCallLike,
  TStep extends OnethingAbortStepLike<TToolCall>,
  TMessage extends OnethingAbortMessageLike<TStep>,
  TSession extends OnethingAbortSessionLike<TMessage>,
>(
  options: CancelOnethingStreamingStepsForAbortOptions<TToolCall, TStep, TMessage, TSession>,
): Promise<CancelOnethingStreamingStepsForAbortResult> {
  const session = options.getSession(options.sessionId)
  if (!session) return { completed: false, cancelledSteps: 0 }

  const streamingMessage = session.messages.find(message => message.isStreaming)
  if (!streamingMessage?.steps) return { completed: false, cancelledSteps: 0 }

  let cancelledSteps = 0
  for (const step of streamingMessage.steps) {
    if (step.status !== 'awaiting-confirmation' && step.status !== 'running') continue

    const toolCall = step.toolCall
      ? {
          ...step.toolCall,
          status: 'cancelled',
          requiresConfirmation: false,
          canRespond: false,
        } as TToolCall
      : undefined
    const updates = {
      status: 'cancelled',
      toolCall,
    } as Partial<TStep>

    await options.updateMessageStep(options.sessionId, streamingMessage.id, step.id, updates)
    await options.emitEvent(options.sessionId, {
      type: 'step:updated',
      stepId: step.id,
      updates,
    })
    cancelledSteps += 1
  }

  await options.updateMessageStreaming(options.sessionId, streamingMessage.id, false)
  await options.flushSessionSave(options.sessionId)
  await options.emitEvent(options.sessionId, {
    type: 'message:updated',
    messageId: streamingMessage.id,
    updates: { isStreaming: false },
  })
  await options.emitEvent(options.sessionId, {
    type: 'stream:complete',
    data: { aborted: true },
  })

  return {
    completed: true,
    cancelledSteps,
    messageId: streamingMessage.id,
  }
}

export async function abortOnethingStreamsForIpc<
  TToolCall extends OnethingAbortToolCallLike,
  TStep extends OnethingAbortStepLike<TToolCall>,
  TMessage extends OnethingAbortMessageLike<TStep>,
  TSession extends OnethingAbortSessionLike<TMessage>,
>(
  options: AbortOnethingStreamsForIpcOptions<TToolCall, TStep, TMessage, TSession>,
): Promise<AbortOnethingStreamsForIpcResult> {
  const sessionId = options.sessionId

  if (sessionId) {
    let aborted = false
    if (options.abortLegacyStream(sessionId)) {
      options.logger?.log?.(`[Backend] Aborting stream for session (legacy): ${sessionId}`)
      aborted = true
    }
    if (options.abortEngineStream(sessionId)) {
      options.logger?.log?.(`[Backend] Aborting stream for session (engine): ${sessionId}`)
      aborted = true
    }

    options.clearPermission(sessionId)
    await cancelOnethingStreamingStepsForAbort({
      sessionId,
      getSession: options.getSession,
      updateMessageStep: options.updateMessageStep,
      updateMessageStreaming: options.updateMessageStreaming,
      flushSessionSave: options.flushSessionSave,
      emitEvent: options.emitEvent,
    })

    return { success: aborted }
  }

  let aborted = false
  const legacySessionIds = Array.from(options.getLegacyActiveSessionIds())
  if (legacySessionIds.length > 0) {
    options.logger?.log?.(`[Backend] Aborting all active streams (${legacySessionIds.length})`)
    for (const legacySessionId of legacySessionIds) {
      options.abortLegacyStream(legacySessionId)
      options.clearPermission(legacySessionId)
    }
    aborted = true
  }

  if (options.abortAllEngineStreams()) {
    aborted = true
  }

  return { success: aborted }
}

export function listOnethingActiveStreamsForIpc(
  options: ListOnethingActiveStreamsForIpcOptions,
): ListOnethingActiveStreamsForIpcResult {
  const legacySessionIds = Array.from(options.getLegacyActiveSessionIds())
  let engineSessionIds: string[] = []

  try {
    engineSessionIds = Array.from(options.getEngineActiveSessionIds())
  } catch {
    // StreamEngine may not be initialized in legacy/bootstrap contexts.
  }

  return {
    success: true,
    sessionIds: Array.from(new Set([...legacySessionIds, ...engineSessionIds])),
  }
}
