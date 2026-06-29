import { describe, expect, it } from 'vitest'
import {
  applySqliteSchemaMigrationsWithAdapters,
  applySqliteFullSessionWritePlanWithAdapters,
  boolInt,
  clampMessagePageLimit,
  CoreSqliteSessionMigrationTracker,
  deleteSqliteSessionsWithAdapters,
  deleteSqliteMessageAndAfterWithAdapters,
  deleteSqliteMessageWithRenumberAdapters,
  encodeMessagePageCursor,
  importSqliteSessionIndexWithAdapters,
  jsonOrNull,
  planSqliteMessagesPageQuery,
  preserveSqliteSessionAgentId,
  resolveSqliteMessagesPageWithAdapters,
  rowToMessage,
  rowToSessionDetails,
  runSqliteSessionMigrationWithAdapters,
  SQLITE_INSERT_MESSAGE_SQL,
  SQLITE_MARK_SESSION_READY_COALESCE_SQL,
  SQLITE_UPSERT_SESSION_METADATA_SQL,
  SQLITE_UPSERT_SESSION_USAGE_SQL,
  sqliteFullSessionWritePlan,
  sqliteDeleteMessageRenumberPlan,
  sqliteDeleteMessagesAfterSeqParams,
  sqliteDeleteMessagesFromSeqParams,
  sqliteMessageParams,
  sqliteSessionMetadataInputFromSession,
  sqliteSessionMetadataParams,
  sqliteSessionInsertParams,
  sqliteSessionReadyParams,
  sqliteSessionUsageParams,
  sqliteSessionVariableParams,
  sqliteSequencedMessages,
  sqliteMessagesPageFromRows,
  sqliteMessagesPageExecutableQuery,
  syncSqliteMessageWithReadyAdapters,
  syncSqliteSessionVariablesWithAdapters,
  upsertSqliteMessageAndTruncateWithAdapters,
} from '@onething/core/session/storage'

describe('core sqlite session mappers', () => {
  it('maps chat messages to SQLite statement parameters in core', () => {
    expect(sqliteMessageParams('s1', {
      id: 'm1',
      role: 'assistant',
      timestamp: 10,
      isStreaming: true,
      isThinking: false,
      reasoning: 'thinking',
      model: 'deepseek-chat',
      contentParts: [{ type: 'text', content: 'hello' }],
      toolCalls: [{ id: 'call-1', toolName: 'read' }],
      steps: [{ id: 'step-1', status: 'completed' }],
      attachments: [{ id: 'file-1' }],
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    }, 7)).toEqual({
      id: 'm1',
      sessionId: 's1',
      seq: 7,
      role: 'assistant',
      content: '',
      timestamp: 10,
      reasoning: 'thinking',
      isStreaming: 1,
      isThinking: 0,
      errorDetails: null,
      model: 'deepseek-chat',
      thinkingTime: null,
      thinkingStartTime: null,
      skillUsed: null,
      contentPartsJson: '[{"type":"text","content":"hello"}]',
      toolCallsJson: '[{"id":"call-1","toolName":"read"}]',
      stepsJson: '[{"id":"step-1","status":"completed"}]',
      attachmentsJson: '[{"id":"file-1"}]',
      usageJson: '{"inputTokens":1,"outputTokens":2,"totalTokens":3}',
    })
  })

  it('maps session metadata to SQLite statement parameters in core', () => {
    expect(sqliteSessionMetadataParams({
      id: 's1',
      name: 'Session',
      createdAt: 1,
      updatedAt: 2,
      isPinned: true,
      isArchived: false,
    }, {
      defaultAgentId: 'default-agent',
      legacyJsonPath: '/sessions/s1.json',
    })).toMatchObject({
      id: 's1',
      agentId: 'default-agent',
      isPinned: 1,
      isArchived: 0,
      workingDirectoryRootsJson: null,
      workingDirectoryRootsProvided: 0,
      promptContextJson: null,
      promptContextProvided: 0,
      migrationState: null,
      legacyJsonPath: '/sessions/s1.json',
    })

    expect(sqliteSessionMetadataParams({
      id: 's2',
      name: 'Details',
      createdAt: 3,
      updatedAt: 4,
      agentId: 'agent-2',
      workingDirectory: '/repo',
      workingDirectoryRoots: ['/repo-extra'],
      summary: 'summary',
      summaryUpToMessageId: 'm9',
      summaryCreatedAt: 100,
      promptContext: { refs: ['p1'] },
    }, {
      defaultAgentId: 'default-agent',
      migrationState: 'ready',
    })).toMatchObject({
      id: 's2',
      agentId: 'agent-2',
      workingDirectory: '/repo',
      workingDirectoryRootsJson: '["/repo-extra"]',
      workingDirectoryRootsProvided: 1,
      summary: 'summary',
      summaryUpToMessageId: 'm9',
      summaryCreatedAt: 100,
      promptContextJson: '{"refs":["p1"]}',
      promptContextProvided: 1,
      migrationState: 'ready',
      legacyJsonPath: null,
    })
  })

  it('extracts SQLite session metadata input from a full session in core', () => {
    expect(sqliteSessionMetadataInputFromSession({
      id: 's1',
      name: 'Session',
      createdAt: 1,
      updatedAt: 2,
      parentSessionId: 'parent',
      lastModel: 'deepseek-chat',
      isPinned: true,
    })).toEqual({
      id: 's1',
      name: 'Session',
      createdAt: 1,
      updatedAt: 2,
      parentSessionId: 'parent',
      branchFromMessageId: undefined,
      agentId: undefined,
      lastModel: 'deepseek-chat',
      lastProvider: undefined,
      isPinned: true,
      isArchived: undefined,
      archivedAt: undefined,
      workingDirectory: undefined,
      workingDirectoryRoots: [],
      summary: undefined,
      summaryUpToMessageId: undefined,
      summaryCreatedAt: undefined,
      promptContext: null,
    })
  })

  it('maps full session insert and ready-state parameters in core', () => {
    expect(sqliteSessionInsertParams({
      id: 's1',
      name: 'Session',
      createdAt: 1,
      updatedAt: 2,
      parentSessionId: 'parent',
      branchFromMessageId: 'branch-message',
      lastModel: 'deepseek-chat',
      isPinned: true,
      workingDirectory: '/repo',
      summary: 'summary',
      promptContext: { source: 'test' },
    }, {
      defaultAgentId: 'default-agent',
      legacyJsonPath: '/sessions/s1.json',
    })).toEqual([
      's1',
      'Session',
      1,
      2,
      'parent',
      'branch-message',
      'default-agent',
      'deepseek-chat',
      null,
      1,
      0,
      null,
      '/repo',
      '[]',
      'summary',
      null,
      null,
      '{"source":"test"}',
      '/sessions/s1.json',
    ])

    expect(sqliteSessionReadyParams('s1', 123)).toEqual([123, 's1'])
  })

  it('exposes SQLite write SQL templates from core', () => {
    expect(SQLITE_UPSERT_SESSION_METADATA_SQL).toContain('ON CONFLICT(id) DO UPDATE SET')
    expect(SQLITE_INSERT_MESSAGE_SQL).toContain('INSERT INTO messages')
    expect(SQLITE_UPSERT_SESSION_USAGE_SQL).toContain('ON CONFLICT(session_id) DO UPDATE SET')
    expect(SQLITE_MARK_SESSION_READY_COALESCE_SQL).toContain('COALESCE(migrated_from_json_at, ?)')
  })

  it('applies SQLite schema migrations through core adapters', () => {
    const applied = new Set([1])
    const calls: string[] = []

    const result = applySqliteSchemaMigrationsWithAdapters({
      migrations: [
        { version: 1, statements: ['already applied'] },
        { version: 2, statements: ['ALTER TABLE sessions ADD COLUMN prompt_context_json TEXT'] },
        { version: 3, statements: ['ALTER TABLE sessions ADD COLUMN agent_id TEXT'] },
      ],
      now: () => 12345,
      hasMigration: version => applied.has(version),
      applyMigration: (migration, appliedAt) => {
        calls.push(`migration:${migration.version}:${appliedAt}:${migration.statements.join('|')}`)
        applied.add(migration.version)
      },
    })

    expect(result).toEqual({
      appliedVersions: [2, 3],
      skippedVersions: [1],
    })
    expect(calls).toEqual([
      'migration:2:12345:ALTER TABLE sessions ADD COLUMN prompt_context_json TEXT',
      'migration:3:12345:ALTER TABLE sessions ADD COLUMN agent_id TEXT',
    ])
  })

  it('plans full SQLite session writes in core', () => {
    const plan = sqliteFullSessionWritePlan({
      id: 's1',
      name: 'Session',
      createdAt: 1,
      updatedAt: 2,
      totalInputTokens: 10,
      totalOutputTokens: 5,
      totalTokens: 15,
      lastInputTokens: 9,
      contextSize: 9,
      variables: [
        { name: 'topic', value: 'core', updatedAt: 100 },
      ],
      messages: [
        { id: 'm1', role: 'user', content: 'hello', timestamp: 10 },
        { id: 'm2', role: 'assistant', content: 'hi', timestamp: 20 },
      ],
    }, {
      defaultAgentId: 'default-agent',
      legacyJsonPath: '/sessions/s1.json',
      migratedFromJsonAt: 123,
    })

    expect(plan.sessionInsertParams[0]).toBe('s1')
    expect(plan.sessionInsertParams[6]).toBe('default-agent')
    expect(plan.sessionInsertParams[plan.sessionInsertParams.length - 1]).toBe('/sessions/s1.json')
    expect(plan.usageParams).toEqual(['s1', 10, 5, 15, 9, 9])
    expect(plan.variableParams).toEqual([
      ['s1', 'topic', 'core', null, 100],
    ])
    expect(plan.sequencedMessages.map(item => [item.message.id, item.seq])).toEqual([
      ['m1', 1],
      ['m2', 2],
    ])
    expect(plan.readyParams).toEqual([123, 's1'])
  })

  it('applies full SQLite session write plans through core adapters in order', () => {
    const calls: string[] = []
    const plan = sqliteFullSessionWritePlan({
      id: 's1',
      name: 'Session',
      createdAt: 1,
      updatedAt: 2,
      variables: [{ name: 'topic', value: 'core' }],
      messages: [
        { id: 'm1', role: 'user', content: 'hello', timestamp: 10 },
        { id: 'm2', role: 'assistant', content: 'hi', timestamp: 20 },
      ],
    }, {
      defaultAgentId: 'default-agent',
      migratedFromJsonAt: 123,
    })

    applySqliteFullSessionWritePlanWithAdapters('s1', plan, {
      insertSession: params => calls.push(`insert-session:${params[0]}`),
      clearUsage: sessionId => calls.push(`clear-usage:${sessionId}`),
      clearVariables: sessionId => calls.push(`clear-variables:${sessionId}`),
      clearMessages: sessionId => calls.push(`clear-messages:${sessionId}`),
      insertUsage: params => calls.push(`insert-usage:${params[0]}`),
      insertOrReplaceVariable: params => calls.push(`insert-variable:${params[1]}`),
      insertMessage: (message, seq) => calls.push(`insert-message:${message.id}:${seq}`),
      markReady: params => calls.push(`mark-ready:${params[1]}:${params[0]}`),
    })

    expect(calls).toEqual([
      'insert-session:s1',
      'clear-usage:s1',
      'clear-variables:s1',
      'clear-messages:s1',
      'insert-usage:s1',
      'insert-variable:topic',
      'insert-message:m1:1',
      'insert-message:m2:2',
      'mark-ready:s1:123',
    ])
  })

  it('preserves existing SQLite agent id during JSON migration in core', () => {
    const session = {
      id: 's1',
      name: 'Session',
    }

    expect(preserveSqliteSessionAgentId(session, 'agent-existing')).toEqual({
      id: 's1',
      name: 'Session',
      agentId: 'agent-existing',
    })
    expect(preserveSqliteSessionAgentId({
      ...session,
      agentId: 'agent-current',
    }, 'agent-existing')).toEqual({
      id: 's1',
      name: 'Session',
      agentId: 'agent-current',
    })
    expect(preserveSqliteSessionAgentId(session, null)).toBe(session)
  })

  it('tracks SQLite session migration in-flight state in core', () => {
    const tracker = new CoreSqliteSessionMigrationTracker()

    expect(tracker.begin('s1', 'ready')).toEqual({
      status: 'already-ready',
      shouldRun: false,
    })
    expect(tracker.begin('s1', 'pending')).toEqual({
      status: 'started',
      shouldRun: true,
    })
    expect(tracker.has('s1')).toBe(true)
    expect(tracker.begin('s1', 'pending')).toEqual({
      status: 'in-flight',
      shouldRun: false,
    })
    expect(tracker.planSchedule('s1', 'pending')).toEqual({
      status: 'in-flight',
      shouldSchedule: false,
    })

    tracker.finish('s1')
    expect(tracker.has('s1')).toBe(false)
    expect(tracker.planSchedule('s1', 'migrating')).toEqual({
      status: 'database-migrating',
      shouldSchedule: false,
    })
    expect(tracker.planSchedule('s1', 'failed')).toEqual({
      status: 'schedule',
      shouldSchedule: true,
    })

    tracker.begin('s2', undefined)
    tracker.reset()
    expect(tracker.has('s2')).toBe(false)
  })

  it('runs SQLite session migration through core adapters', () => {
    const tracker = new CoreSqliteSessionMigrationTracker()
    const calls: string[] = []
    const sessions = new Map([
      ['s1', { id: 's1' }],
    ])

    expect(runSqliteSessionMigrationWithAdapters({
      sessionId: 'ready-session',
      tracker,
      getMigrationState: () => 'ready',
      loadSession: () => {
        throw new Error('unreachable')
      },
      migrateSession: () => {
        throw new Error('unreachable')
      },
    })).toEqual({ status: 'already-ready', migrated: true })

    expect(runSqliteSessionMigrationWithAdapters({
      sessionId: 's1',
      tracker,
      getMigrationState: () => 'pending',
      loadSession: id => sessions.get(id),
      migrateSession: session => calls.push(`migrate:${session.id}`),
    })).toEqual({ status: 'migrated', migrated: true })
    expect(calls).toEqual(['migrate:s1'])
    expect(tracker.has('s1')).toBe(false)

    tracker.begin('busy', 'pending')
    expect(runSqliteSessionMigrationWithAdapters({
      sessionId: 'busy',
      tracker,
      getMigrationState: () => 'pending',
      loadSession: () => {
        throw new Error('unreachable')
      },
      migrateSession: () => {
        throw new Error('unreachable')
      },
    })).toEqual({ status: 'in-flight', migrated: false })
    tracker.finish('busy')

    expect(runSqliteSessionMigrationWithAdapters({
      sessionId: 'missing',
      tracker,
      getMigrationState: () => 'pending',
      loadSession: () => undefined,
      migrateSession: () => {
        throw new Error('unreachable')
      },
    })).toEqual({ status: 'missing-session', migrated: false })
    expect(tracker.has('missing')).toBe(false)

    const errors: unknown[][] = []
    const failed = runSqliteSessionMigrationWithAdapters({
      sessionId: 's1',
      tracker,
      getMigrationState: () => 'pending',
      loadSession: id => sessions.get(id),
      migrateSession: () => {
        throw new Error('write failed')
      },
      markMigrationFailed: id => calls.push(`failed:${id}`),
      logger: { error: (...args) => errors.push(args) },
    })
    expect(failed.status).toBe('failed')
    expect(failed.migrated).toBe(false)
    expect(calls).toContain('failed:s1')
    expect(errors[0]?.[0]).toBe('[SQLite Sessions] Migration failed:')
    expect(tracker.has('s1')).toBe(false)
  })

  it('maps session usage and variables to SQLite statement parameters in core', () => {
    expect(sqliteSessionUsageParams({
      id: 's1',
      totalInputTokens: 10,
      totalTokens: 12,
    })).toEqual(['s1', 10, 0, 12, 0, 0])

    expect(sqliteSessionUsageParams({
      id: 's2',
      totalInputTokens: 1,
      totalOutputTokens: 2,
      totalTokens: 3,
      lastInputTokens: 4,
      contextSize: 5,
    })).toEqual(['s2', 1, 2, 3, 4, 5])

    expect(sqliteSessionVariableParams('s1', {
      name: 'topic',
      value: 'core',
    })).toEqual(['s1', 'topic', 'core', null, null])

    expect(sqliteSessionVariableParams('s1', {
      name: 'mode',
      value: 'headless',
      description: 'Current work',
      updatedAt: 100,
    })).toEqual(['s1', 'mode', 'headless', 'Current work', 100])
  })

  it('syncs SQLite session variables through core adapters', () => {
    const calls: string[] = []

    const inserted = syncSqliteSessionVariablesWithAdapters({
      sessionId: 's1',
      variables: [
        { name: 'topic', value: 'core' },
        { name: 'mode', value: 'headless', updatedAt: 100 },
      ],
      clearVariables: sessionId => calls.push(`clear:${sessionId}`),
      insertVariable: params => calls.push(`insert:${params[1]}:${params[2]}:${params[4] ?? 'none'}`),
    })

    expect(inserted).toBe(2)
    expect(calls).toEqual([
      'clear:s1',
      'insert:topic:core:none',
      'insert:mode:headless:100',
    ])
  })

  it('syncs SQLite messages only when the session is ready', () => {
    const calls: string[] = []
    const message = { id: 'm1', role: 'assistant' }

    expect(syncSqliteMessageWithReadyAdapters({
      sessionId: 's1',
      message,
      seq: 1,
      isReady: () => false,
      upsertMessage: () => {
        throw new Error('unreachable')
      },
    })).toBe('skipped-not-ready')

    expect(syncSqliteMessageWithReadyAdapters({
      sessionId: 's1',
      message,
      seq: 2,
      isReady: () => true,
      upsertMessage: (sessionId, targetMessage, seq) => calls.push(`upsert:${sessionId}:${targetMessage.id}:${seq}`),
    })).toBe('synced')
    expect(calls).toEqual(['upsert:s1:m1:2'])
  })

  it('deletes SQLite sessions through core adapters', () => {
    const calls: string[] = []

    expect(deleteSqliteSessionsWithAdapters({
      sessionIds: ['s1', 's2'],
      deleteSession: id => calls.push(`delete:${id}`),
    })).toBe(2)
    expect(calls).toEqual(['delete:s1', 'delete:s2'])
  })

  it('imports SQLite session index metadata through core adapters', () => {
    const calls: string[] = []

    expect(importSqliteSessionIndexWithAdapters({
      index: [
        { id: 's1', name: 'One' },
        { id: 's2', name: 'Two' },
      ],
      upsertSessionMetadata: meta => calls.push(`upsert:${meta.id}:${meta.name}`),
    })).toBe(2)
    expect(calls).toEqual(['upsert:s1:One', 'upsert:s2:Two'])
  })

  it('deletes SQLite messages with renumbering through core adapters', () => {
    const calls: string[] = []

    expect(deleteSqliteMessageWithRenumberAdapters({
      sessionId: 's1',
      messageId: 'm2',
      isReady: () => false,
      getMessageSeq: () => {
        throw new Error('unreachable')
      },
      deleteMessage: () => {
        throw new Error('unreachable')
      },
      moveLaterMessagesToNegative: () => {
        throw new Error('unreachable')
      },
      restoreLaterMessages: () => {
        throw new Error('unreachable')
      },
    })).toBe('skipped-not-ready')

    expect(deleteSqliteMessageWithRenumberAdapters({
      sessionId: 's1',
      messageId: 'missing',
      isReady: () => true,
      getMessageSeq: () => undefined,
      deleteMessage: () => {
        throw new Error('unreachable')
      },
      moveLaterMessagesToNegative: () => {
        throw new Error('unreachable')
      },
      restoreLaterMessages: () => {
        throw new Error('unreachable')
      },
    })).toBe('missing-message')

    expect(deleteSqliteMessageWithRenumberAdapters({
      sessionId: 's1',
      messageId: 'm2',
      isReady: () => true,
      getMessageSeq: () => 2,
      deleteMessage: params => calls.push(`delete:${params.join(':')}`),
      moveLaterMessagesToNegative: params => calls.push(`negative:${params.join(':')}`),
      restoreLaterMessages: params => calls.push(`restore:${params.join(':')}`),
    })).toBe('applied')
    expect(calls).toEqual([
      'delete:s1:m2',
      'negative:s1:2',
      'restore:s1',
    ])
  })

  it('truncates SQLite messages through core adapters', () => {
    const calls: string[] = []

    expect(deleteSqliteMessageAndAfterWithAdapters({
      sessionId: 's1',
      messageId: 'm3',
      isReady: () => true,
      getMessageSeq: () => 3,
      deleteMessagesFromSeq: params => calls.push(`truncate:${params.join(':')}`),
    })).toBe('applied')
    expect(calls).toEqual(['truncate:s1:3'])

    expect(deleteSqliteMessageAndAfterWithAdapters({
      sessionId: 's1',
      messageId: 'missing',
      isReady: () => true,
      getMessageSeq: () => undefined,
      deleteMessagesFromSeq: () => {
        throw new Error('unreachable')
      },
    })).toBe('missing-message')
  })

  it('upserts and truncates SQLite messages through core adapters', () => {
    const calls: string[] = []
    const message = { id: 'm2', role: 'user' }

    expect(upsertSqliteMessageAndTruncateWithAdapters({
      sessionId: 's1',
      message,
      seq: 2,
      isReady: () => true,
      upsertMessage: (sessionId, targetMessage, seq) => calls.push(`upsert:${sessionId}:${targetMessage.id}:${seq}`),
      deleteMessagesAfterSeq: params => calls.push(`delete-after:${params.join(':')}`),
    })).toBe('applied')
    expect(calls).toEqual([
      'upsert:s1:m2:2',
      'delete-after:s1:2',
    ])
  })

  it('assigns stable 1-based SQLite message sequence numbers in core', () => {
    const messages = [
      { id: 'm1', role: 'user' },
      { id: 'm2', role: 'assistant' },
    ]

    expect(sqliteSequencedMessages(messages)).toEqual([
      { message: messages[0], seq: 1 },
      { message: messages[1], seq: 2 },
    ])
  })

  it('plans SQLite delete and truncate parameters in core', () => {
    expect(sqliteDeleteMessageRenumberPlan('s1', 'm1', 4)).toEqual({
      deleteMessageParams: ['s1', 'm1'],
      moveLaterMessagesToNegativeParams: ['s1', 4],
      restoreLaterMessagesParams: ['s1'],
    })

    expect(sqliteDeleteMessagesFromSeqParams('s1', 4)).toEqual(['s1', 4])
    expect(sqliteDeleteMessagesAfterSeqParams('s1', 4)).toEqual(['s1', 4])
  })

  it('plans SQLite message page queries in core', () => {
    expect(planSqliteMessagesPageQuery({
      sessionId: 's1',
      cursor: encodeMessagePageCursor({ sessionId: 's1', seq: 3, includeAnchor: true }),
      direction: 'newer',
    }, 10)).toEqual({
      kind: 'cursor',
      direction: 'newer',
      comparison: 'gte',
      params: ['s1', 3, 16],
    })

    expect(planSqliteMessagesPageQuery({
      sessionId: 's1',
      cursor: encodeMessagePageCursor({ sessionId: 's1', seq: 3, includeAnchor: false }),
      limit: 2,
    }, 10)).toEqual({
      kind: 'cursor',
      direction: 'older',
      comparison: 'lt',
      params: ['s1', 3, 2],
    })

    expect(planSqliteMessagesPageQuery({
      sessionId: 's1',
      cursor: encodeMessagePageCursor({ sessionId: 'other', seq: 3, includeAnchor: false }),
    }, 10)).toEqual({
      kind: 'error',
      response: { success: false, error: 'Invalid message page cursor' },
    })

    expect(planSqliteMessagesPageQuery({
      sessionId: 's1',
      anchor: { seq: 5, before: 2, after: 1 },
    }, 10)).toEqual({
      kind: 'anchor-window',
      params: ['s1', 3, 6],
    })

    expect(planSqliteMessagesPageQuery({
      sessionId: 's1',
      anchor: { messageId: 'm5' },
    }, 10)).toEqual({
      kind: 'resolve-anchor',
      params: ['s1', 'm5'],
    })

    expect(planSqliteMessagesPageQuery({
      sessionId: 's1',
      anchor: { messageId: 'm5' },
    }, 10, 5)).toEqual({
      kind: 'anchor-window',
      params: ['s1', 1, 10],
    })

    expect(planSqliteMessagesPageQuery({
      sessionId: 's1',
      anchor: { messageId: 'missing' },
    }, 10, null)).toEqual({
      kind: 'error',
      response: { success: false, error: 'Anchor message not found' },
    })

    expect(planSqliteMessagesPageQuery({
      sessionId: 's1',
      anchor: 'tail',
      limit: 4,
    }, 10)).toEqual({
      kind: 'tail',
      params: ['s1', 4],
    })

    expect(planSqliteMessagesPageQuery({ sessionId: 's1' }, 0)).toMatchObject({
      kind: 'empty',
      response: {
        success: true,
        messages: [],
        totalCount: 0,
      },
    })
  })

  it('builds executable SQLite message page queries in core', () => {
    expect(sqliteMessagesPageExecutableQuery({
      kind: 'resolve-anchor',
      params: ['s1', 'm5'],
    })).toEqual({
      kind: 'resolve-anchor',
      sql: 'SELECT seq FROM messages WHERE session_id = ? AND id = ?',
      params: ['s1', 'm5'],
    })

    const newer = sqliteMessagesPageExecutableQuery({
      kind: 'cursor',
      direction: 'newer',
      comparison: 'gt',
      params: ['s1', 3, 10],
    })
    expect(newer).toMatchObject({
      kind: 'rows',
      params: ['s1', 3, 10],
    })
    expect(newer.kind === 'rows' ? newer.sql : '').toContain('seq > ?')
    expect(newer.kind === 'rows' ? newer.sql : '').toContain('ORDER BY seq ASC')

    const older = sqliteMessagesPageExecutableQuery({
      kind: 'cursor',
      direction: 'older',
      comparison: 'lte',
      params: ['s1', 8, 10],
    })
    expect(older.kind === 'rows' ? older.sql : '').toContain('seq <= ?')
    expect(older.kind === 'rows' ? older.sql : '').toContain('ORDER BY seq DESC')

    const window = sqliteMessagesPageExecutableQuery({
      kind: 'anchor-window',
      params: ['s1', 2, 6],
    })
    expect(window.kind === 'rows' ? window.sql : '').toContain('seq BETWEEN ? AND ?')

    const tail = sqliteMessagesPageExecutableQuery({
      kind: 'tail',
      params: ['s1', 16],
    })
    expect(tail.kind === 'rows' ? tail.sql : '').toContain('ORDER BY seq DESC')

    expect(sqliteMessagesPageExecutableQuery({
      kind: 'error',
      response: { success: false, error: 'Invalid message page cursor' },
    })).toEqual({
      kind: 'response',
      response: { success: false, error: 'Invalid message page cursor' },
    })
  })

  it('executes SQLite message page planning through core adapters', () => {
    const rows = [
      {
        id: 'm1',
        session_id: 's1',
        seq: 1,
        role: 'user',
        content: 'hello',
        timestamp: 10,
        reasoning: null,
        is_streaming: 0,
        is_thinking: 0,
        error_details: null,
        model: null,
        thinking_time: null,
        thinking_start_time: null,
        skill_used: null,
        content_parts_json: null,
        tool_calls_json: null,
        steps_json: null,
        attachments_json: null,
        usage_json: null,
      },
      {
        id: 'm2',
        session_id: 's1',
        seq: 2,
        role: 'assistant',
        content: 'hi',
        timestamp: 20,
        reasoning: null,
        is_streaming: 0,
        is_thinking: 0,
        error_details: null,
        model: null,
        thinking_time: null,
        thinking_start_time: null,
        skill_used: null,
        content_parts_json: null,
        tool_calls_json: null,
        steps_json: null,
        attachments_json: null,
        usage_json: null,
      },
    ]

    const page = resolveSqliteMessagesPageWithAdapters({
      sessionId: 's1',
      anchor: { messageId: 'm2', before: 1, after: 0 },
    }, 2, {
      resolveAnchorSeq(query) {
        expect(query.sql).toContain('SELECT seq FROM messages')
        expect(query.params).toEqual(['s1', 'm2'])
        return 2
      },
      selectRows(query) {
        expect(query.sql).toContain('seq BETWEEN ? AND ?')
        expect(query.params).toEqual(['s1', 1, 2])
        return rows
      },
    })

    expect(page.success).toBe(true)
    expect(page.messages?.map(message => message.id)).toEqual(['m1', 'm2'])
    expect(page.totalCount).toBe(2)
  })

  it('maps SQLite message rows to stored chat messages and page cursors', () => {
    const row = {
      id: 'm1',
      session_id: 's1',
      seq: 2,
      role: 'user',
      content: 'hello',
      timestamp: 10,
      reasoning: null,
      is_streaming: 0,
      is_thinking: 1,
      error_details: null,
      model: null,
      thinking_time: null,
      thinking_start_time: null,
      skill_used: null,
      content_parts_json: '[{"type":"text","content":"hello"}]',
      tool_calls_json: null,
      steps_json: null,
      attachments_json: null,
      usage_json: '{"inputTokens":1,"outputTokens":2,"totalTokens":3}',
    }

    expect(rowToMessage(row)).toMatchObject({
      id: 'm1',
      seq: 2,
      sessionId: 's1',
      role: 'user',
      content: 'hello',
      isStreaming: false,
      isThinking: true,
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    })

    const page = sqliteMessagesPageFromRows('s1', [row], 3)
    expect(page).toMatchObject({
      success: true,
      hasMoreBefore: true,
      hasMoreAfter: true,
      totalCount: 3,
    })
    expect(page.nextCursor).toBeTruthy()
    expect(page.backwardsCursor).toBeTruthy()
  })

  it('maps session rows and storage primitive helpers', () => {
    expect(boolInt(true)).toBe(1)
    expect(boolInt(false)).toBe(0)
    expect(jsonOrNull({ a: 1 })).toBe('{"a":1}')
    expect(jsonOrNull(undefined)).toBeNull()
    expect(clampMessagePageLimit(undefined)).toBe(16)
    expect(clampMessagePageLimit(999)).toBe(300)

    expect(rowToSessionDetails({
      id: 's1',
      name: 'Session',
      created_at: 1,
      updated_at: 2,
      agent_id: null,
      parent_session_id: null,
      branch_from_message_id: null,
      last_model: null,
      last_provider: null,
      is_pinned: 1,
      is_archived: 0,
      archived_at: null,
      working_directory: '/tmp/project',
      working_directory_roots_json: '["/tmp/project2"]',
      summary: null,
      summary_up_to_message_id: null,
      summary_created_at: null,
      prompt_context_json: '{"baseline":"ok"}',
      total_input_tokens: 10,
      total_output_tokens: null,
      total_tokens: 12,
      last_input_tokens: null,
      context_size: 99,
    }, {
      defaultAgentId: 'default',
      messageCount: 4,
    })).toMatchObject({
      id: 's1',
      agentId: 'default',
      isPinned: true,
      isArchived: false,
      workingDirectoryRoots: ['/tmp/project2'],
      promptContext: { baseline: 'ok' },
      totalInputTokens: 10,
      totalTokens: 12,
      contextSize: 99,
      messageCount: 4,
    })
  })
})
