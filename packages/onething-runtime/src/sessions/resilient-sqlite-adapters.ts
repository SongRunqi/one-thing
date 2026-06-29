import type {
  GetSessionMessagesPageRequest,
  GetSessionMessagesPageResponse,
  UserMessageMarker,
} from '@onething/core/session'
import type {
  OnethingSessionRepositoryLogger,
  OnethingSessionRepositorySqliteAdapters,
} from './session-repository.js'

export interface OnethingSessionSqliteSideEffectAdapters<
  TSession,
  TMessage,
  TMeta,
  TDetails,
  TMarker,
> extends OnethingSessionRepositorySqliteAdapters<TSession, TMeta, TDetails, TMarker> {
  syncMessage?(sessionId: string, message: TMessage, seq: number): void
  deleteMessage?(sessionId: string, messageId: string): void
  deleteMessageAndAfter?(sessionId: string, messageId: string): void
  upsertMessageAndTruncate?(sessionId: string, message: TMessage, seq: number): void
}

type OnethingSessionSqliteOperation =
  | keyof OnethingSessionRepositorySqliteAdapters<unknown, unknown, unknown, UserMessageMarker>
  | 'syncMessage'
  | 'deleteMessage'
  | 'deleteMessageAndAfter'
  | 'upsertMessageAndTruncate'

export interface OnethingResilientSessionSqliteAdapters<
  TSession,
  TMessage,
  TMeta,
  TDetails,
  TMarker,
> extends OnethingSessionSqliteSideEffectAdapters<TSession, TMessage, TMeta, TDetails, TMarker> {
  isDisabled(): boolean
  resetDisabled(): void
}

export interface OnethingResilientSessionSqliteOptions<
  TSession,
  TMessage,
  TMeta,
  TDetails,
  TMarker,
> {
  adapters: OnethingSessionSqliteSideEffectAdapters<TSession, TMessage, TMeta, TDetails, TMarker>
  isEnabled?: () => boolean
  operationLabels?: Partial<Record<OnethingSessionSqliteOperation, string>>
  onDisable?: (operation: string, error: unknown) => void
  logger?: OnethingSessionRepositoryLogger
}

const DEFAULT_OPERATION_LABELS: Record<OnethingSessionSqliteOperation, string> = {
  importSessionIndex: 'index import',
  getSessionDetails: 'details load',
  getMessagesPage: 'message page load',
  getUserMessageMarkers: 'user marker load',
  isSessionReady: 'readiness check',
  scheduleMigration: 'migration schedule',
  syncFullSession: 'full session sync',
  syncSession: 'session sync',
  syncSessionMetadata: 'metadata sync',
  syncSessionUsage: 'usage sync',
  syncSessionVariables: 'variables sync',
  deleteSessions: 'session delete',
  syncMessage: 'message sync',
  deleteMessage: 'message delete',
  deleteMessageAndAfter: 'message truncate',
  upsertMessageAndTruncate: 'message upsert truncate',
}

export function createOnethingResilientSessionSqliteAdapters<
  TSession,
  TMessage,
  TMeta,
  TDetails,
  TMarker,
>(
  options: OnethingResilientSessionSqliteOptions<TSession, TMessage, TMeta, TDetails, TMarker>,
): OnethingResilientSessionSqliteAdapters<TSession, TMessage, TMeta, TDetails, TMarker> {
  let disabledAfterError = false

  function isEnabled(): boolean {
    return !disabledAfterError && (options.isEnabled?.() ?? true)
  }

  function operationLabel(operation: OnethingSessionSqliteOperation): string {
    return options.operationLabels?.[operation] ?? DEFAULT_OPERATION_LABELS[operation]
  }

  function disable(operation: OnethingSessionSqliteOperation, error: unknown): void {
    disabledAfterError = true
    const label = operationLabel(operation)
    if (options.onDisable) {
      options.onDisable(label, error)
    } else {
      options.logger?.warn?.(`[Sessions] SQLite unavailable during ${label}; falling back to JSON sessions:`, error)
    }
  }

  function run<TResult>(
    operation: OnethingSessionSqliteOperation,
    fallback: TResult,
    action: () => TResult,
  ): TResult {
    if (!isEnabled()) return fallback
    try {
      return action()
    } catch (error) {
      disable(operation, error)
      return fallback
    }
  }

  return {
    isDisabled: () => disabledAfterError,
    resetDisabled: () => {
      disabledAfterError = false
    },
    importSessionIndex(index: TMeta[]): void {
      run('importSessionIndex', undefined, () => options.adapters.importSessionIndex?.(index))
    },
    getSessionDetails(sessionId: string): TDetails | undefined {
      return run('getSessionDetails', undefined, () => options.adapters.getSessionDetails?.(sessionId))
    },
    getMessagesPage(request: GetSessionMessagesPageRequest): GetSessionMessagesPageResponse | undefined {
      return run('getMessagesPage', undefined, () => options.adapters.getMessagesPage?.(request))
    },
    getUserMessageMarkers(sessionId: string): TMarker[] | undefined {
      return run('getUserMessageMarkers', undefined, () => options.adapters.getUserMessageMarkers?.(sessionId))
    },
    isSessionReady(sessionId: string): boolean {
      return run('isSessionReady', false, () => options.adapters.isSessionReady?.(sessionId) ?? false)
    },
    scheduleMigration(sessionId: string): void {
      run('scheduleMigration', undefined, () => options.adapters.scheduleMigration?.(sessionId))
    },
    syncFullSession(session: TSession): void {
      run('syncFullSession', undefined, () => options.adapters.syncFullSession?.(session))
    },
    syncSession(session: TSession): void {
      run('syncSession', undefined, () => options.adapters.syncSession?.(session))
    },
    syncSessionMetadata(session: TSession): void {
      run('syncSessionMetadata', undefined, () => options.adapters.syncSessionMetadata?.(session))
    },
    syncSessionUsage(session: TSession): void {
      run('syncSessionUsage', undefined, () => options.adapters.syncSessionUsage?.(session))
    },
    syncSessionVariables(session: TSession): void {
      run('syncSessionVariables', undefined, () => options.adapters.syncSessionVariables?.(session))
    },
    deleteSessions(sessionIds: string[]): void {
      run('deleteSessions', undefined, () => options.adapters.deleteSessions?.(sessionIds))
    },
    syncMessage(sessionId: string, message: TMessage, seq: number): void {
      run('syncMessage', undefined, () => options.adapters.syncMessage?.(sessionId, message, seq))
    },
    deleteMessage(sessionId: string, messageId: string): void {
      run('deleteMessage', undefined, () => options.adapters.deleteMessage?.(sessionId, messageId))
    },
    deleteMessageAndAfter(sessionId: string, messageId: string): void {
      run('deleteMessageAndAfter', undefined, () => options.adapters.deleteMessageAndAfter?.(sessionId, messageId))
    },
    upsertMessageAndTruncate(sessionId: string, message: TMessage, seq: number): void {
      run('upsertMessageAndTruncate', undefined, () => options.adapters.upsertMessageAndTruncate?.(sessionId, message, seq))
    },
  }
}
