import {
  applyDefaultAgentIdToSessionMetas,
  applyInheritedSessionWorkingDirectory,
  applySessionAgent,
  applySessionArchiveState,
  applySessionContextSize,
  applySessionIndexMetaMutationWithAdapters,
  applySessionMetadataMutationWithAdapters,
  applySessionModel,
  applySessionName,
  applySessionPermissionMode,
  applySessionPin,
  applySessionPromptContext,
  applySessionSideEffectMutationWithAdapters,
  applySessionSummary,
  applySessionTokenUsage,
  applySessionUpdatedAtToMeta,
  applySessionVariables,
  applySessionWorkingDirectory,
  applySessionWorkingDirectoryRoots,
  createBranchSessionWithAdapters,
  createSessionWithAdapters,
  deleteSessionWithAdapters,
  loadSessionWithAdapters,
  normalizeWorkingDirectoryRoots,
  resolveSessionDetailsSnapshot,
  resolveSessionMessagesPage,
  resolveSessionUserMessageMarkers,
  sanitizeSessionsOnStartupWithAdapters,
  syncSessionSideEffectWithReadyAdapters,
  type CoreSession,
  type CoreSessionDetails,
  type CoreSessionLastTurnUsage,
  type CoreSessionMessageWithModelInfo,
  type CoreSessionMessageWithUsage,
  type CoreSessionMeta,
  type CoreSessionTokenUsage,
  type CoreTimelineSession,
  type CoreContextVariableInput,
  type GetSessionMessagesPageRequest,
  type GetSessionMessagesPageResponse,
  type NormalizeWorkingDirectoryRootsOptions,
  type StoredChatMessage,
  type UserMessageMarker,
} from '@onething/core/session'
import { getMessagesPageFromJsonFilePath } from '@onething/core/session'
import { AsyncSaveQueue, LRUCache } from '@onething/core/storage'

export interface OnethingSessionRepositoryLogger {
  log?(...args: unknown[]): void
  info?(...args: unknown[]): void
  warn?(...args: unknown[]): void
  error?(...args: unknown[]): void
}

export interface OnethingSessionRepositorySqliteAdapters<
  TSession,
  TMeta,
  TDetails,
  TMarker,
> {
  importSessionIndex?(index: TMeta[]): void
  getSessionDetails?(sessionId: string): TDetails | undefined
  getMessagesPage?(request: GetSessionMessagesPageRequest): GetSessionMessagesPageResponse | undefined
  getUserMessageMarkers?(sessionId: string): TMarker[] | undefined
  isSessionReady?(sessionId: string): boolean
  scheduleMigration?(sessionId: string): void
  syncFullSession?(session: TSession): void
  syncSession?(session: TSession): void
  syncSessionMetadata?(session: TSession): void
  syncSessionUsage?(session: TSession): void
  syncSessionVariables?(session: TSession): void
  deleteSessions?(sessionIds: string[]): void
}

export interface OnethingSessionRepositoryOptions<
  TSession extends CoreSession<TMessage> & {
    id: string
    parentSessionId?: string
    workingDirectory?: string
    workingDirectoryRoots?: string[]
  },
  TMessage extends StoredChatMessage & CoreSessionMessageWithUsage & CoreSessionMessageWithModelInfo,
  TMeta extends CoreSessionMeta & { parentSessionId?: string },
  TDetails extends CoreSessionDetails,
  TMarker extends UserMessageMarker,
> {
  cacheSize?: number
  saveThrottleMs?: number
  defaultAgentId: string
  getSessionsDir(): string
  getSessionPath(sessionId: string): string
  readJsonFile<TValue>(filePath: string, fallback: TValue): TValue
  writeJsonFile(filePath: string, data: unknown): void
  writeJsonFileAsync(filePath: string, data: unknown): Promise<void>
  deleteJsonFile(filePath: string): void
  getCurrentSessionId(): string | undefined
  setCurrentSessionId(sessionId: string): void
  getDefaultWorkingDirectory?(): string | undefined
  expandPath?(path: string): string
  cancelPendingSideEffects?(sessionId: string): void
  sqlite?: OnethingSessionRepositorySqliteAdapters<TSession, TMeta, TDetails, TMarker>
  logger?: OnethingSessionRepositoryLogger
}

export interface OnethingSessionCacheStats {
  size: number
  maxSize: number
  cachedSessionIds: string[]
}

export interface OnethingDeleteSessionResult {
  deletedIds: string[]
  parentSessionId?: string
}

export class OnethingSessionRepository<
  TSession extends CoreSession<TMessage> & {
    id: string
    parentSessionId?: string
    workingDirectory?: string
    workingDirectoryRoots?: string[]
  },
  TMessage extends StoredChatMessage & CoreSessionMessageWithUsage & CoreSessionMessageWithModelInfo,
  TMeta extends CoreSessionMeta & { parentSessionId?: string },
  TDetails extends CoreSessionDetails,
  TMarker extends UserMessageMarker = UserMessageMarker,
> {
  private readonly sessionCache: LRUCache<string, TSession>
  private readonly sessionSaveQueue: AsyncSaveQueue<TSession>

  constructor(private readonly options: OnethingSessionRepositoryOptions<TSession, TMessage, TMeta, TDetails, TMarker>) {
    this.sessionCache = new LRUCache<string, TSession>(options.cacheSize ?? 10)
    this.sessionSaveQueue = new AsyncSaveQueue<TSession>({
      throttleMs: options.saveThrottleMs ?? 300,
      getLatest: sessionId => this.sessionCache.get(sessionId),
      write: (sessionId, session) => this.options.writeJsonFileAsync(this.options.getSessionPath(sessionId), session),
      onError: (sessionId, error) => this.options.logger?.error?.(`[Sessions] async save failed for ${sessionId}:`, error),
    })
  }

  async flushSessionSave(sessionId: string): Promise<void> {
    await this.sessionSaveQueue.flush(sessionId)
  }

  async flushAllPendingSaves(): Promise<void> {
    await this.sessionSaveQueue.flushAll()
  }

  cancelPendingSave(sessionId: string): void {
    this.sessionSaveQueue.cancel(sessionId)
    this.options.cancelPendingSideEffects?.(sessionId)
  }

  saveSessionToFile(sessionId: string, session: TSession): void {
    this.sessionCache.set(sessionId, session)
    this.sessionSaveQueue.schedule(sessionId)
  }

  invalidateSessionCache(sessionId: string): void {
    this.sessionCache.delete(sessionId)
  }

  clearAllSessionCache(): void {
    this.sessionCache.clear()
  }

  getCachedSession(sessionId: string): TSession | undefined {
    return this.sessionCache.get(sessionId)
  }

  deleteCachedSession(sessionId: string): void {
    this.sessionCache.delete(sessionId)
  }

  getSessionCacheStats(): OnethingSessionCacheStats {
    const stats = this.sessionCache.getStats()
    return {
      size: stats.size,
      maxSize: stats.maxSize,
      cachedSessionIds: stats.keys,
    }
  }

  sanitizeAllSessionsOnStartup(): void {
    sanitizeSessionsOnStartupWithAdapters<TSession, TMeta>({
      loadIndex: () => this.loadSessionsIndex(),
      loadSession: sessionId => this.options.readJsonFile<TSession | null>(this.options.getSessionPath(sessionId), null) ?? undefined,
      saveSession: (sessionId, session) => this.options.writeJsonFile(this.options.getSessionPath(sessionId), session),
      syncSession: session => this.syncSessionToSqliteIfReady(session),
    })
  }

  loadSessionsIndex(): TMeta[] {
    return this.options.readJsonFile<TMeta[]>(this.getSessionsIndexPath(), [])
  }

  saveSessionsIndex(index: TMeta[]): void {
    this.options.writeJsonFile(this.getSessionsIndexPath(), index)
  }

  updateSessionsIndexMeta(sessionId: string, update: (meta: TMeta) => void): boolean {
    return Boolean(applySessionIndexMetaMutationWithAdapters<TMeta>({
      sessionId,
      loadIndex: () => this.loadSessionsIndex(),
      saveIndex: index => this.saveSessionsIndex(index),
      mutateMeta: update,
    }))
  }

  renameSession(sessionId: string, newName: string): boolean {
    return this.applyMetadataMutation(sessionId, {
      mutateSession: session => applySessionName(session, newName),
      mutateMeta: meta => applySessionName(meta, newName),
    })
  }

  updateSessionPin(sessionId: string, isPinned: boolean): boolean {
    return this.applyMetadataMutation(sessionId, {
      mutateSession: session => applySessionPin(session, isPinned),
      mutateMeta: meta => applySessionPin(meta, isPinned),
    })
  }

  updateSessionArchived(sessionId: string, isArchived: boolean, archivedAt?: number | null): boolean {
    return this.applyMetadataMutation(sessionId, {
      mutateSession: session => applySessionArchiveState(session, isArchived, archivedAt),
      mutateMeta: meta => applySessionArchiveState(meta, isArchived, archivedAt),
    })
  }

  updateSessionPermissionMode(sessionId: string, permissionMode: string | undefined): boolean {
    return this.applyMetadataMutation(sessionId, {
      mutateSession: session => applySessionPermissionMode(
        session as TSession & { permissionMode?: string },
        permissionMode,
      ),
      mutateMeta: meta => applySessionPermissionMode(meta, permissionMode),
    })
  }

  updateSessionWorkingDirectory(sessionId: string, workingDirectory: string | null): boolean {
    return this.applyMetadataMutation(sessionId, {
      mutateSession: session => applySessionWorkingDirectory(session, workingDirectory, this.pathOptions()),
    })
  }

  updateSessionWorkingDirectoryRoots(sessionId: string, roots: string[]): boolean {
    return this.applyMetadataMutation(sessionId, {
      mutateSession: session => applySessionWorkingDirectoryRoots(session, roots, this.pathOptions()),
    })
  }

  inheritSessionWorkingDirectory(sessionId: string, workingDirectory: string): boolean {
    return this.applyMetadataMutation(sessionId, {
      mutateSession: session => applyInheritedSessionWorkingDirectory(session, workingDirectory, this.pathOptions()),
    })
  }

  updateSessionVariables<TVariable extends CoreContextVariableInput>(sessionId: string, variables: TVariable[]): boolean {
    return this.applySideEffectMutation(sessionId, {
      mutateSession: session => applySessionVariables(
        session as TSession & { variables?: CoreContextVariableInput[] },
        variables,
      ),
      syncSession: session => this.syncSessionVariablesToSqliteIfReady(session),
    })
  }

  updateSessionTokenUsage(
    sessionId: string,
    usage: CoreSessionTokenUsage,
    lastTurnUsage?: CoreSessionLastTurnUsage,
  ): boolean {
    return this.applySideEffectMutation(sessionId, {
      mutateSession: session => applySessionTokenUsage(session, usage, lastTurnUsage),
      syncSession: session => this.syncSessionUsageToSqliteIfReady(session, '[Sessions] Failed to sync usage to SQLite:'),
    })
  }

  updateSessionContextSize(sessionId: string, contextSize: number): boolean {
    return this.applySideEffectMutation(sessionId, {
      mutateSession: session => applySessionContextSize(session, contextSize),
      syncSession: session => this.syncSessionUsageToSqliteIfReady(session, '[Sessions] Failed to sync context size to SQLite:'),
    })
  }

  updateSessionPromptContext<TPromptContext>(sessionId: string, promptContext: TPromptContext | null): boolean {
    return this.applyMetadataMutation(sessionId, {
      mutateSession: session => applySessionPromptContext(session, promptContext),
    })
  }

  updateSessionSummary(sessionId: string, summary: string, summaryUpToMessageId: string): boolean {
    return this.applyMetadataMutation(sessionId, {
      mutateSession: session => applySessionSummary(session, summary, summaryUpToMessageId),
      mutateMeta: (meta, session) => applySessionUpdatedAtToMeta(meta, session),
    })
  }

  updateSessionModel(sessionId: string, provider: string, model: string): boolean {
    return this.applyMetadataMutation(sessionId, {
      mutateSession: session => applySessionModel(session, provider, model),
      mutateMeta: meta => applySessionModel(meta, provider, model),
    })
  }

  updateSessionAgent(sessionId: string, agentId: string): boolean {
    return this.applyMetadataMutation(sessionId, {
      mutateSession: session => applySessionAgent(session, agentId, this.options.defaultAgentId),
      mutateMeta: meta => applySessionAgent(meta, agentId, this.options.defaultAgentId),
    })
  }

  getSessions(): TSession[] {
    const sessions: TSession[] = []
    for (const meta of this.loadSessionsIndex()) {
      const session = this.getSession(meta.id)
      if (session) sessions.push(session)
    }
    return sessions
  }

  getSessionsList(): TMeta[] {
    return applyDefaultAgentIdToSessionMetas(this.loadSessionsIndex(), this.options.defaultAgentId) as TMeta[]
  }

  initializeSessionRepositoryIndex(): void {
    this.options.sqlite?.importSessionIndex?.(this.loadSessionsIndex())
  }

  getSessionDetails(sessionId: string): TDetails | undefined {
    const meta = this.loadSessionsIndex().find(session => session.id === sessionId)
    const sqliteDetails = this.getSqliteSessionDetailsSafe(sessionId)
    return resolveSessionDetailsSnapshot({
      meta,
      sqliteDetails,
      getSession: () => this.getSession(sessionId),
      defaultAgentId: this.options.defaultAgentId,
    }) as TDetails | undefined
  }

  getSessionMessages(sessionId: string): TMessage[] | undefined {
    return this.getSession(sessionId)?.messages
  }

  getSessionMessagesPage(request: GetSessionMessagesPageRequest): GetSessionMessagesPageResponse {
    const start = performance.now()
    const result = resolveSessionMessagesPage({
      request,
      getSqlitePage: () => this.options.sqlite?.getMessagesPage?.(request),
      getJsonByteScanPage: () => getMessagesPageFromJsonFilePath(
        request,
        this.options.getSessionPath(request.sessionId),
      ) ?? undefined,
      getSessionMessages: () => this.getSession(request.sessionId)?.messages,
    })

    if (result.shouldScheduleMigration) {
      this.options.sqlite?.scheduleMigration?.(request.sessionId)
    }

    this.options.logger?.info?.('[Perf][SessionPage][runtime]', {
      sessionId: request.sessionId,
      source: result.source,
      totalMs: Math.round(performance.now() - start),
      messages: result.response.messages?.length ?? 0,
      success: result.response.success,
    })

    return result.response
  }

  getSessionUserMessageMarkers(sessionId: string): TMarker[] | undefined {
    const result = resolveSessionUserMessageMarkers({
      getSqliteMarkers: () => this.options.sqlite?.getUserMessageMarkers?.(sessionId),
      getSessionMessages: () => this.getSession(sessionId)?.messages,
    })
    if (result.shouldScheduleMigration) {
      this.options.sqlite?.scheduleMigration?.(sessionId)
    }
    return result.markers as TMarker[] | undefined
  }

  getSessionRaw(sessionId: string): TSession | undefined {
    return this.options.readJsonFile<TSession | null>(this.options.getSessionPath(sessionId), null) ?? undefined
  }

  getSession(sessionId: string): TSession | undefined {
    return loadSessionWithAdapters<TSession>({
      sessionId,
      cache: this.sessionCache,
      loadSession: id => this.options.readJsonFile<TSession | null>(this.options.getSessionPath(id), null) ?? undefined,
      saveSession: (id, session) => this.saveSessionToFile(id, session),
      syncSession: session => this.syncSessionToSqliteIfReady(session),
      expandPath: this.options.expandPath,
    }).session
  }

  createSession(sessionId: string, name: string): TSession {
    const workingDirectory = this.resolveDefaultWorkingDirectory()

    return createSessionWithAdapters<TSession, TMessage, TMeta>({
      sessionId,
      name,
      defaultAgentId: this.options.defaultAgentId,
      workingDirectory,
      saveSession: (id, session) => this.saveSessionToFile(id, session),
      syncSession: session => this.syncSessionToSqliteIfReady(session),
      syncFullSession: session => this.options.sqlite?.syncFullSession?.(session),
      loadIndex: () => this.loadSessionsIndex(),
      saveIndex: index => this.saveSessionsIndex(index),
      setCurrentSessionId: sessionId => this.options.setCurrentSessionId(sessionId),
    })
  }

  createBranchSession(
    sessionId: string,
    name: string,
    parentSessionId: string,
    branchFromMessageId: string,
    inheritedMessages: TMessage[],
  ): TSession {
    const parentSession = this.getSession(parentSessionId)
    const workingDirectory = parentSession?.workingDirectory ?? this.resolveDefaultWorkingDirectory()

    return createBranchSessionWithAdapters<TSession, TMessage, TMeta>({
      sessionId,
      name,
      parentSessionId,
      parentSession,
      branchFromMessageId,
      inheritedMessages,
      defaultAgentId: this.options.defaultAgentId,
      workingDirectory,
      workingDirectoryRoots: normalizeWorkingDirectoryRoots(parentSession?.workingDirectoryRoots, {
        active: workingDirectory,
        expandPath: this.options.expandPath,
      }),
      saveSession: (id, session) => this.saveSessionToFile(id, session),
      syncSession: session => this.syncSessionToSqliteIfReady(session),
      syncFullSession: session => this.options.sqlite?.syncFullSession?.(session),
      loadIndex: () => this.loadSessionsIndex(),
      saveIndex: index => this.saveSessionsIndex(index),
      setCurrentSessionId: sessionId => this.options.setCurrentSessionId(sessionId),
    })
  }

  deleteSession(sessionId: string): OnethingDeleteSessionResult {
    return deleteSessionWithAdapters<TSession, TMeta>({
      sessionId,
      getSession: id => this.getSession(id),
      getCurrentSessionId: () => this.options.getCurrentSessionId(),
      loadIndex: () => this.loadSessionsIndex(),
      saveIndex: index => this.saveSessionsIndex(index),
      cancelPendingSave: id => this.cancelPendingSave(id),
      deleteSessionFile: id => this.options.deleteJsonFile(this.options.getSessionPath(id)),
      deleteSessionCache: id => this.deleteCachedSession(id),
      deleteSessionsFromSqlite: ids => this.options.sqlite?.deleteSessions?.(ids),
      setCurrentSessionId: sessionId => this.options.setCurrentSessionId(sessionId),
    })
  }

  syncSessionToSqliteIfReady(session: TSession): void {
    syncSessionSideEffectWithReadyAdapters({
      sessionId: session.id,
      session,
      isReady: sessionId => this.options.sqlite?.isSessionReady?.(sessionId) ?? false,
      scheduleMigration: sessionId => this.options.sqlite?.scheduleMigration?.(sessionId),
      syncReady: target => this.options.sqlite?.syncFullSession?.(target),
      logger: this.options.logger,
      errorMessage: '[Sessions] Failed to sync session to SQLite:',
    })
  }

  private applyMetadataMutation(
    sessionId: string,
    options: {
      mutateSession(session: TSession): void
      mutateMeta?(meta: TMeta, session: TSession): void
    },
  ): boolean {
    return applySessionMetadataMutationWithAdapters<TSession, TMeta>({
      sessionId,
      getSession: id => this.getSession(id),
      mutateSession: options.mutateSession,
      saveSession: (id, session) => this.saveSessionToFile(id, session),
      syncSessionMetadata: session => this.syncSessionMetadataToSqliteIfReady(session),
      updateIndexMeta: options.mutateMeta
        ? (id, mutate) => this.updateSessionsIndexMeta(id, mutate)
        : undefined,
      mutateMeta: options.mutateMeta,
    }).applied
  }

  private applySideEffectMutation(
    sessionId: string,
    options: {
      mutateSession(session: TSession): void
      syncSession(session: TSession): void
    },
  ): boolean {
    return applySessionSideEffectMutationWithAdapters<TSession>({
      sessionId,
      getSession: id => this.getSession(id),
      mutateSession: options.mutateSession,
      saveSession: (id, session) => this.saveSessionToFile(id, session),
      syncSession: options.syncSession,
    }).applied
  }

  private syncSessionMetadataToSqliteIfReady(session: TSession): void {
    this.syncSessionSideEffectToSqliteIfReady(
      session,
      target => {
        const syncMetadata = this.options.sqlite?.syncSessionMetadata
          ?? this.options.sqlite?.syncSession
          ?? this.options.sqlite?.syncFullSession
        syncMetadata?.(target)
      },
      '[Sessions] Failed to sync session metadata to SQLite:',
    )
  }

  private syncSessionUsageToSqliteIfReady(session: TSession, errorMessage: string): void {
    this.syncSessionSideEffectToSqliteIfReady(
      session,
      target => {
        const syncUsage = this.options.sqlite?.syncSessionUsage
          ?? this.options.sqlite?.syncSession
          ?? this.options.sqlite?.syncFullSession
        syncUsage?.(target)
      },
      errorMessage,
    )
  }

  private syncSessionVariablesToSqliteIfReady(session: TSession): void {
    this.syncSessionSideEffectToSqliteIfReady(
      session,
      target => {
        const syncVariables = this.options.sqlite?.syncSessionVariables
          ?? this.options.sqlite?.syncSession
          ?? this.options.sqlite?.syncFullSession
        syncVariables?.(target)
      },
      '[Sessions] Failed to sync variables to SQLite:',
    )
  }

  private syncSessionSideEffectToSqliteIfReady(
    session: TSession,
    syncReady: (session: TSession) => void,
    errorMessage: string,
  ): void {
    syncSessionSideEffectWithReadyAdapters({
      sessionId: session.id,
      session,
      isReady: sessionId => this.options.sqlite?.isSessionReady?.(sessionId) ?? false,
      scheduleMigration: sessionId => this.options.sqlite?.scheduleMigration?.(sessionId),
      syncReady,
      logger: this.options.logger,
      errorMessage,
    })
  }

  private pathOptions(): NormalizeWorkingDirectoryRootsOptions {
    return {
      expandPath: this.options.expandPath,
    }
  }

  private getSessionsIndexPath(): string {
    return `${this.options.getSessionsDir()}/index.json`
  }

  private getSqliteSessionDetailsSafe(sessionId: string): TDetails | undefined {
    try {
      return this.options.sqlite?.getSessionDetails?.(sessionId)
    } catch (error) {
      this.options.logger?.error?.('[Sessions] Failed to load SQLite session details:', error)
      return undefined
    }
  }

  private resolveDefaultWorkingDirectory(): string | undefined {
    const defaultDir = this.options.getDefaultWorkingDirectory?.()
    return defaultDir && this.options.expandPath ? this.options.expandPath(defaultDir) : defaultDir
  }
}

export function createOnethingSessionRepository<
  TSession extends CoreSession<TMessage> & {
    id: string
    parentSessionId?: string
    workingDirectory?: string
    workingDirectoryRoots?: string[]
  },
  TMessage extends StoredChatMessage & CoreSessionMessageWithUsage & CoreSessionMessageWithModelInfo,
  TMeta extends CoreSessionMeta & { parentSessionId?: string },
  TDetails extends CoreSessionDetails,
  TMarker extends UserMessageMarker = UserMessageMarker,
>(
  options: OnethingSessionRepositoryOptions<TSession, TMessage, TMeta, TDetails, TMarker>,
): OnethingSessionRepository<TSession, TMessage, TMeta, TDetails, TMarker> {
  return new OnethingSessionRepository(options)
}
