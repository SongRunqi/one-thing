import { describe, expect, it } from 'vitest'
import {
  applyInheritedSessionWorkingDirectory,
  applySessionDeleteMessageWithAdapters,
  applySessionAgent,
  applySessionArchiveState,
  applySessionAppendMessageWithAdapters,
  applySessionContextSize,
  applySessionInsertMessageAfterWithAdapters,
  applySessionIndexMetaMutationWithAdapters,
  applySessionModel,
  applySessionMessageAppendToMeta,
  applySessionMessageMutationWithAdapters,
  applySessionMessageStepsUsageByTurnWithAdapters,
  applySessionMetadataMutationWithAdapters,
  applySessionName,
  applySessionPermissionMode,
  applySessionPin,
  applySessionPromptContext,
  applySessionSideEffectMutationWithAdapters,
  applySessionSummary,
  applySessionTokenUsage,
  applySessionTruncateMessagesWithAdapters,
  applySessionUpdatedAtToMeta,
  applySessionUpdateMessageAndTruncateWithAdapters,
  applySessionVariables,
  applySessionWorkingDirectory,
  applySessionWorkingDirectoryRoots,
  applyDefaultAgentIdToSessionMetas,
  addOrUpdateSessionMessageStep,
  appendSessionMessage,
  appendSessionMessageContentPart,
  collectSessionCascadeDeleteIds,
  createBranchSessionWithAdapters,
  CORE_DEFAULT_AGENT_ID,
  createCoreBranchSessionRecord,
  createCoreSessionRecord,
  createSessionWithAdapters,
  deleteSessionWithAdapters,
  deleteSessionMessage,
  extractSessionMeta,
  findSessionMeta,
  findSessionMessage,
  getSessionTokenUsageSnapshot,
  hasSessionUsageDetails,
  insertSessionMessageAfter,
  loadSessionWithAdapters,
  mergeSessionDetails,
  normalizeSessionVariables,
  normalizeWorkingDirectoryRoots,
  patchSessionMessage,
  planSessionCascadeDelete,
  prependSessionMeta,
  resolveSessionDetailsSnapshot,
  sanitizeSessionsOnStartupWithAdapters,
  subtractSessionMessageUsage,
  sumSessionMessageUsage,
  syncSessionSideEffectWithReadyAdapters,
  truncateSessionMessagesFrom,
  updateSessionMessageAndTruncateAfter,
  updateSessionIndexMeta,
  updateSessionMessageStep,
  updateSessionMessageStepsUsageByTurn,
} from '@onething/core/session'

describe('core session store helpers', () => {
  it('owns the default agent id used by session storage', () => {
    expect(CORE_DEFAULT_AGENT_ID).toBe('default')
  })

  it('normalizes working directory roots with host path expansion and active-root filtering', () => {
    expect(normalizeWorkingDirectoryRoots(
      [' ~/project ', '~/project', '/workspace', '', 42, '/active'],
      {
        active: '/active',
        expandPath: value => value.replace(/^~/, '/home/me'),
      },
    )).toEqual(['/home/me/project', '/workspace'])
  })

  it('mutates session metadata and matching index metadata without storage access', () => {
    const index: Array<{
      id: string
      name: string
      createdAt: number
      updatedAt: number
      agentId?: string
      lastProvider?: string
      lastModel?: string
      permissionMode?: string
      isPinned?: boolean
      isArchived?: boolean
      archivedAt?: number
    }> = [
      {
        id: 's1',
        name: 'Old',
        createdAt: 1,
        updatedAt: 2,
        isArchived: true,
        archivedAt: 50,
      },
    ]
    const meta = findSessionMeta(index, 's1')
    expect(meta).toBeDefined()
    expect(findSessionMeta(index, 'missing')).toBeUndefined()

    const inserted = { id: 's0', name: 'Inserted', createdAt: 0, updatedAt: 0 }
    expect(prependSessionMeta(index, inserted)).toBe(index)
    expect(index[0]).toBe(inserted)
    expect(updateSessionIndexMeta(index, 's0', session => {
      session.name = 'Updated inserted'
    })).toBe(inserted)
    expect(inserted.name).toBe('Updated inserted')
    expect(updateSessionIndexMeta(index, 'missing', session => {
      session.name = 'unreachable'
    })).toBeUndefined()

    applySessionUpdatedAtToMeta(inserted, { updatedAt: 125 })
    expect(inserted.updatedAt).toBe(125)

    const session: {
      id: string
      name: string
      createdAt: number
      updatedAt: number
      messages: unknown[]
      agentId?: string
      lastProvider?: string
      lastModel?: string
      permissionMode?: string
      isPinned?: boolean
      isArchived?: boolean
      archivedAt?: number
      summary?: string
      summaryUpToMessageId?: string
      summaryCreatedAt?: number
    } = {
      id: 's1',
      name: 'Old',
      createdAt: 1,
      updatedAt: 2,
      messages: [],
      isArchived: true,
      archivedAt: 50,
      permissionMode: 'default',
    }

    applySessionName(session, 'New')
    applySessionName(meta!, 'New')
    applySessionPin(session, true)
    applySessionPin(meta!, true)
    applySessionArchiveState(session, false)
    applySessionArchiveState(meta!, false)
    applySessionPermissionMode(session, 'ask')
    applySessionPermissionMode(meta!, 'ask')
    applySessionSummary(session, 'compact summary', 'm3', 300)
    applySessionModel(session, 'deepseek', 'deepseek-chat')
    applySessionModel(meta!, 'deepseek', 'deepseek-chat')
    applySessionMessageAppendToMeta(meta!, { updatedAt: 350 }, {
      role: 'assistant',
      provider: 'anthropic',
      model: 'claude-sonnet',
    })
    applySessionMessageAppendToMeta(meta!, { updatedAt: 375 }, {
      role: 'user',
    })
    applySessionAgent(session, '', 'default-agent')
    applySessionAgent(meta!, '', 'default-agent')

    expect(session).toMatchObject({
      name: 'New',
      isPinned: true,
      isArchived: false,
      permissionMode: 'ask',
      summary: 'compact summary',
      summaryUpToMessageId: 'm3',
      summaryCreatedAt: 300,
      updatedAt: 300,
      lastProvider: 'deepseek',
      lastModel: 'deepseek-chat',
      agentId: 'default-agent',
    })
    expect(session.archivedAt).toBeUndefined()
    expect(meta).toMatchObject({
      name: 'New',
      isPinned: true,
      isArchived: false,
      permissionMode: 'ask',
      updatedAt: 375,
      lastProvider: 'anthropic',
      lastModel: 'claude-sonnet',
      agentId: 'default-agent',
    })
    expect(meta?.archivedAt).toBeUndefined()

    expect(applyDefaultAgentIdToSessionMetas([
      { id: 's1', name: 'A', createdAt: 1, updatedAt: 1 },
      { id: 's2', name: 'B', createdAt: 2, updatedAt: 2, agentId: 'agent-b' },
    ], 'default-agent').map(session => session.agentId)).toEqual(['default-agent', 'agent-b'])
  })

  it('mutates session index metadata through core host adapters', () => {
    const index = [
      { id: 's1', name: 'Old', createdAt: 1, updatedAt: 1 },
      { id: 's2', name: 'Other', createdAt: 2, updatedAt: 2 },
    ]
    const calls: string[] = []

    const meta = applySessionIndexMetaMutationWithAdapters({
      sessionId: 's1',
      loadIndex: () => index,
      saveIndex: next => calls.push(`save:${next.map(item => item.name).join(',')}`),
      mutateMeta: target => {
        target.name = 'New'
        target.updatedAt = 10
      },
    })

    expect(meta).toEqual({ id: 's1', name: 'New', createdAt: 1, updatedAt: 10 })
    expect(calls).toEqual(['save:New,Other'])

    expect(applySessionIndexMetaMutationWithAdapters({
      sessionId: 'missing',
      loadIndex: () => index,
      saveIndex: () => {
        throw new Error('unreachable')
      },
      mutateMeta: target => {
        target.name = 'unreachable'
      },
    })).toBeUndefined()
  })

  it('runs session metadata mutations through core host adapters', () => {
    const session = {
      id: 's1',
      name: 'Old',
      createdAt: 1,
      updatedAt: 2,
      messages: [],
      isPinned: false,
    }
    const index = [{
      id: 's1',
      name: 'Old',
      createdAt: 1,
      updatedAt: 2,
      isPinned: false,
    }]
    const calls: string[] = []

    const result = applySessionMetadataMutationWithAdapters<typeof session, typeof index[number]>({
      sessionId: 's1',
      getSession: id => id === 's1' ? session : undefined,
      mutateSession: target => {
        applySessionName(target, 'New')
        applySessionPin(target, true)
      },
      saveSession: (id, target) => {
        calls.push(`save:${id}:${target.name}`)
      },
      syncSessionMetadata: target => {
        calls.push(`sync:${target.id}`)
      },
      updateIndexMeta: (id, mutate) => {
        const meta = updateSessionIndexMeta(index, id, mutate)
        calls.push(`index:${meta?.name}`)
      },
      mutateMeta: meta => {
        applySessionName(meta, 'New')
        applySessionPin(meta, true)
      },
    })

    expect(result).toMatchObject({ applied: true, session })
    expect(session).toMatchObject({ name: 'New', isPinned: true })
    expect(index[0]).toMatchObject({ name: 'New', isPinned: true })
    expect(calls).toEqual(['save:s1:New', 'sync:s1', 'index:New'])

    expect(applySessionMetadataMutationWithAdapters<typeof session, typeof index[number]>({
      sessionId: 'missing',
      getSession: () => undefined,
      mutateSession: () => {
        throw new Error('unreachable')
      },
      saveSession: () => {
        throw new Error('unreachable')
      },
    })).toEqual({ applied: false })
  })

  it('runs generic session side-effect mutations through core host adapters', () => {
    const session = {
      id: 's1',
      totalTokens: 0,
    }
    const calls: string[] = []

    const result = applySessionSideEffectMutationWithAdapters<typeof session>({
      sessionId: 's1',
      getSession: id => id === 's1' ? session : undefined,
      mutateSession: target => {
        target.totalTokens = 42
        calls.push('mutate')
      },
      saveSession: (id, target) => {
        calls.push(`save:${id}:${target.totalTokens}`)
      },
      syncSession: target => {
        calls.push(`sync:${target.id}:${target.totalTokens}`)
      },
    })

    expect(result).toMatchObject({ applied: true, session })
    expect(calls).toEqual(['mutate', 'save:s1:42', 'sync:s1:42'])

    expect(applySessionSideEffectMutationWithAdapters<typeof session>({
      sessionId: 'missing',
      getSession: () => undefined,
      mutateSession: () => {
        throw new Error('unreachable')
      },
      saveSession: () => {
        throw new Error('unreachable')
      },
    })).toEqual({ applied: false })
  })

  it('syncs session side effects through ready/schedule adapters', () => {
    const session = { id: 's1' }
    const calls: string[] = []

    expect(syncSessionSideEffectWithReadyAdapters({
      sessionId: 's1',
      session,
      isReady: () => true,
      scheduleMigration: id => calls.push(`schedule:${id}`),
      syncReady: target => calls.push(`sync:${target.id}`),
    })).toBe('synced')
    expect(calls).toEqual(['sync:s1'])

    calls.length = 0
    expect(syncSessionSideEffectWithReadyAdapters({
      sessionId: 's1',
      session,
      isReady: () => false,
      scheduleMigration: id => calls.push(`schedule:${id}`),
      syncReady: target => calls.push(`sync:${target.id}`),
    })).toBe('scheduled')
    expect(calls).toEqual(['schedule:s1'])

    const errors: unknown[][] = []
    expect(syncSessionSideEffectWithReadyAdapters({
      sessionId: 's1',
      session,
      isReady: () => {
        throw new Error('db failed')
      },
      scheduleMigration: id => calls.push(`schedule:${id}`),
      syncReady: target => calls.push(`sync:${target.id}`),
      logger: { error: (...args) => errors.push(args) },
      errorMessage: 'custom sync error',
    })).toBe('error')
    expect(errors[0]?.[0]).toBe('custom sync error')
  })

  it('sanitizes startup sessions through core host adapters', () => {
    type StartupSession = {
      id: string
      messages: Array<{
        id: string
        role: string
        isStreaming?: boolean
        steps?: Array<{ title: string; status: string; error?: string }>
        toolCalls?: Array<{ status: string }>
      }>
    }
    const sessions = new Map<string, StartupSession>([
      ['s1', {
        id: 's1',
        messages: [
          {
            id: 'm1',
            role: 'assistant',
            isStreaming: true,
            steps: [{ title: 'Running: bash', status: 'running' }],
            toolCalls: [{ status: 'executing' }],
          },
        ],
      }],
      ['s2', {
        id: 's2',
        messages: [{ id: 'm2', role: 'user' }],
      }],
    ])
    const calls: string[] = []

    const result = sanitizeSessionsOnStartupWithAdapters({
      loadIndex: () => [
        { id: 's1' },
        { id: 's2' },
        { id: 'missing' },
      ],
      loadSession: id => sessions.get(id),
      saveSession: (id, session) => calls.push(`save:${id}:${session.messages[0].isStreaming}`),
      syncSession: session => calls.push(`sync:${session.id}`),
    })

    expect(result).toEqual({ scanned: 3, sanitized: 1, missing: 1 })
    expect(sessions.get('s1')?.messages[0]).toMatchObject({
      isStreaming: false,
      steps: [{ status: 'failed', error: 'Interrupted: app was closed' }],
      toolCalls: [{ status: 'cancelled' }],
    })
    expect(calls).toEqual(['save:s1:false', 'sync:s1'])
  })

  it('loads sessions through cache, path normalization, sanitize, and host adapters', () => {
    const session = {
      id: 's1',
      workingDirectory: '~/project',
      workingDirectoryRoots: ['~/project', '~/other', '~/other'],
      messages: [{ id: 'm1', role: 'assistant', isStreaming: true }],
    }
    const cache = new Map<string, typeof session>()
    const calls: string[] = []

    const loaded = loadSessionWithAdapters({
      sessionId: 's1',
      cache: {
        get: id => cache.get(id),
        set: (id, target) => {
          cache.set(id, target)
          calls.push(`cache:${id}`)
        },
      },
      loadSession: id => id === 's1' ? session : undefined,
      saveSession: (id, target) => calls.push(`save:${id}:${target.messages[0].isStreaming}`),
      syncSession: target => calls.push(`sync:${target.id}`),
      expandPath: value => value.replace(/^~/, '/home/me'),
    })

    expect(loaded).toMatchObject({ status: 'loaded', session, sanitized: true })
    expect(session).toMatchObject({
      workingDirectory: '/home/me/project',
      workingDirectoryRoots: ['/home/me/other'],
      messages: [{ isStreaming: false }],
    })
    expect(calls).toEqual(['save:s1:false', 'sync:s1', 'cache:s1'])

    const cached = loadSessionWithAdapters({
      sessionId: 's1',
      cache: {
        get: id => cache.get(id),
        set: () => {
          throw new Error('unreachable')
        },
      },
      loadSession: () => {
        throw new Error('unreachable')
      },
    })
    expect(cached).toMatchObject({ status: 'cache-hit', session, sanitized: false })

    expect(loadSessionWithAdapters({
      sessionId: 'missing',
      loadSession: () => undefined,
    })).toEqual({ status: 'missing', sanitized: false })
  })

  it('runs session message mutations through core host adapters', () => {
    const session = {
      id: 's1',
      messages: [
        {
          id: 'm1',
          content: 'old',
          contentParts: [] as Array<{ type: string; content: string }>,
        },
      ],
    }
    const calls: string[] = []

    const result = applySessionMessageMutationWithAdapters({
      sessionId: 's1',
      messageId: 'm1',
      getSession: id => id === 's1' ? session : undefined,
      mutateMessage: (target, messageId) => {
        const message = patchSessionMessage(target, messageId, { content: 'new' })
        if (message) appendSessionMessageContentPart(target, messageId, { type: 'text', content: 'part' })
        return message
      },
      saveSession: (sessionId, target) => {
        calls.push(`save:${sessionId}:${target.messages[0].content}`)
      },
      syncMessage: (_target, message) => {
        calls.push(`sync:${message.id}:${message.contentParts?.length}`)
      },
    })

    expect(result).toMatchObject({
      applied: true,
      message: {
        id: 'm1',
        content: 'new',
        contentParts: [{ type: 'text', content: 'part' }],
      },
    })
    expect(calls).toEqual(['save:s1:new', 'sync:m1:1'])

    expect(applySessionMessageMutationWithAdapters({
      sessionId: 's1',
      messageId: 'missing',
      getSession: () => session,
      mutateMessage: (target, messageId) => patchSessionMessage(target, messageId, { content: 'unreachable' }),
      saveSession: () => {
        throw new Error('unreachable')
      },
    })).toEqual({ applied: false })
  })

  it('appends messages through core host adapters and updates index metadata', () => {
    const session = {
      id: 's1',
      updatedAt: 1,
      messages: [] as Array<{ id: string; role: string; provider?: string; model?: string }>,
      lastProvider: undefined as string | undefined,
      lastModel: undefined as string | undefined,
    }
    const index = [{
      id: 's1',
      name: 'Session',
      createdAt: 1,
      updatedAt: 1,
      lastProvider: undefined as string | undefined,
      lastModel: undefined as string | undefined,
    }]
    const calls: string[] = []

    const result = applySessionAppendMessageWithAdapters<typeof session, typeof session.messages[number], typeof index[number]>({
      sessionId: 's1',
      message: { id: 'm1', role: 'assistant', provider: 'deepseek', model: 'deepseek-chat' },
      now: 500,
      getSession: id => id === session.id ? session : undefined,
      saveSession: (id, target) => calls.push(`save:${id}:${target.messages.length}`),
      syncMessage: (_target, message) => calls.push(`sync:${message.id}`),
      updateIndexMeta: (id, mutate) => {
        const meta = updateSessionIndexMeta(index, id, mutate)
        calls.push(`index:${meta?.updatedAt}:${meta?.lastProvider}:${meta?.lastModel}`)
      },
    })

    expect(result).toMatchObject({ applied: true, message: { id: 'm1' } })
    expect(session).toMatchObject({
      updatedAt: 500,
      lastProvider: 'deepseek',
      lastModel: 'deepseek-chat',
      messages: [{ id: 'm1' }],
    })
    expect(index[0]).toMatchObject({
      updatedAt: 500,
      lastProvider: 'deepseek',
      lastModel: 'deepseek-chat',
    })
    expect(calls).toEqual([
      'save:s1:1',
      'sync:m1',
      'index:500:deepseek:deepseek-chat',
    ])
  })

  it('inserts messages through core host adapters', () => {
    const session = {
      id: 's1',
      updatedAt: 1,
      messages: [
        { id: 'm1', role: 'user' },
        { id: 'm3', role: 'assistant' },
      ],
    }
    const calls: string[] = []

    const result = applySessionInsertMessageAfterWithAdapters<typeof session, typeof session.messages[number]>({
      sessionId: 's1',
      afterMessageId: 'm1',
      message: { id: 'm2', role: 'assistant' },
      now: 600,
      getSession: id => id === session.id ? session : undefined,
      saveSession: (id, target) => calls.push(`save:${id}:${target.messages.map(message => message.id).join(',')}`),
      syncSession: target => calls.push(`sync:${target.id}:${target.updatedAt}`),
    })

    expect(result).toMatchObject({ applied: true, message: { id: 'm2' } })
    expect(session.messages.map(message => message.id)).toEqual(['m1', 'm2', 'm3'])
    expect(session.updatedAt).toBe(600)
    expect(calls).toEqual(['save:s1:m1,m2,m3', 'sync:s1:600'])

    expect(applySessionInsertMessageAfterWithAdapters<typeof session, typeof session.messages[number]>({
      sessionId: 'missing',
      afterMessageId: 'm1',
      message: { id: 'never', role: 'user' },
      getSession: () => undefined,
      saveSession: () => {
        throw new Error('unreachable')
      },
    })).toEqual({ applied: false })
  })

  it('updates step usage by turn through core host adapters only when needed', () => {
    const session: {
      id: string
      messages: Array<{
        id: string
        steps: Array<{
          id: string
          turnIndex: number
          usage?: { inputTokens: number; outputTokens: number; totalTokens: number }
        }>
      }>
    } = {
      id: 's1',
      messages: [{
        id: 'm1',
        steps: [
          { id: 'step-1', turnIndex: 1 },
          { id: 'step-2', turnIndex: 2 },
        ],
      }],
    }
    const calls: string[] = []

    expect(applySessionMessageStepsUsageByTurnWithAdapters({
      sessionId: 's1',
      messageId: 'm1',
      turnIndex: 1,
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
      getSession: id => id === 's1' ? session : undefined,
      saveSession: (sessionId, target) => {
        calls.push(`save:${sessionId}:${target.messages[0].steps?.[0].usage?.totalTokens}`)
      },
      syncMessage: (_target, message) => {
        calls.push(`sync:${message.id}`)
      },
    })).toEqual(['step-1'])
    expect(calls).toEqual(['save:s1:5', 'sync:m1'])

    calls.length = 0
    expect(applySessionMessageStepsUsageByTurnWithAdapters({
      sessionId: 's1',
      messageId: 'm1',
      turnIndex: 99,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      getSession: () => session,
      saveSession: () => {
        throw new Error('unreachable')
      },
    })).toEqual([])
    expect(calls).toEqual([])
  })

  it('applies working directory, variables, and prompt context mutations in core', () => {
    const expandPath = (value: string) => value.replace(/^~/, '/home/me')
    const session: {
      workingDirectory?: string
      workingDirectoryRoots?: string[]
      variables?: Array<{
        name: string
        value: string
        values?: string[]
        description?: string
        updatedAt?: number
      }>
      promptContext?: { references: string[] } | null
    } = {
      workingDirectoryRoots: ['~/project', '/other', '/other'],
    }

    applySessionWorkingDirectory(session, '~/project', { expandPath })
    expect(session.workingDirectory).toBe('/home/me/project')
    expect(session.workingDirectoryRoots).toEqual(['/other'])

    applySessionWorkingDirectoryRoots(session, ['~/project', '/next', '/next'], { expandPath })
    expect(session.workingDirectoryRoots).toEqual(['/next'])

    applySessionWorkingDirectory(session, null, { expandPath })
    expect(session.workingDirectory).toBeUndefined()
    expect(session.workingDirectoryRoots).toEqual(['/next'])

    applyInheritedSessionWorkingDirectory(session, '~/workspace', { expandPath })
    expect(session.workingDirectory).toBe('/home/me/workspace')

    expect(normalizeSessionVariables([
      { name: 'topic', value: 'core' },
      { name: 'kept', value: 'yes', values: ['a'], description: 'desc', updatedAt: 10 },
    ], 200)).toEqual([
      {
        name: 'topic',
        value: 'core',
        values: undefined,
        type: undefined,
        scope: undefined,
        state: undefined,
        description: undefined,
        updatedAt: 200,
      },
      {
        name: 'kept',
        value: 'yes',
        values: ['a'],
        type: undefined,
        scope: undefined,
        state: undefined,
        description: 'desc',
        updatedAt: 10,
      },
    ])

    // type/scope/state 必须原样存活:归一化丢掉 state 的话,本该一直在模型眼前
    // 的状态重载后就凭空消失了,而且悄无声息
    // (agent-self-state-variables.md §R)。
    expect(normalizeSessionVariables([
      {
        name: 'live_status',
        value: 'running',
        type: 'string',
        scope: 'session',
        state: true,
      },
      { name: 'archive', value: '[]', type: 'list', state: false },
    ], 300)).toEqual([
      {
        name: 'live_status',
        value: 'running',
        values: undefined,
        type: 'string',
        scope: 'session',
        state: true,
        description: undefined,
        updatedAt: 300,
      },
      {
        name: 'archive',
        value: '[]',
        values: undefined,
        type: 'list',
        scope: undefined,
        state: false,
        description: undefined,
        updatedAt: 300,
      },
    ])

    applySessionVariables(session, [{ name: 'mode', value: 'headless' }], 250)
    expect(session.variables).toEqual([
      {
        name: 'mode',
        value: 'headless',
        values: undefined,
        type: undefined,
        scope: undefined,
        state: undefined,
        description: undefined,
        updatedAt: 250,
      },
    ])

    applySessionPromptContext(session, { references: ['p1'] })
    expect(session.promptContext).toEqual({ references: ['p1'] })
    applySessionPromptContext(session, null)
    expect(session.promptContext).toBeNull()
  })

  it('merges session details while preserving non-zero detail counts and default usage values', () => {
    expect(mergeSessionDetails(
      {
        id: 's1',
        name: 'Meta',
        createdAt: 1,
        updatedAt: 2,
        agentId: 'agent-meta',
        messageCount: 3,
      },
      {
        id: 's1',
        name: 'Details',
        createdAt: 1,
        updatedAt: 4,
        messageCount: 0,
      },
      { defaultAgentId: 'default-agent' },
    )).toMatchObject({
      id: 's1',
      name: 'Details',
      agentId: 'agent-meta',
      messageCount: 3,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      lastInputTokens: 0,
      contextSize: 0,
    })
  })

  it('detects whether persisted details include token or context usage fields', () => {
    expect(hasSessionUsageDetails({
      id: 's1',
      name: 'Empty',
      createdAt: 1,
      updatedAt: 2,
    })).toBe(false)

    expect(hasSessionUsageDetails({
      id: 's1',
      name: 'With usage',
      createdAt: 1,
      updatedAt: 2,
      totalTokens: 0,
    })).toBe(true)
  })

  it('resolves session details snapshots lazily from sqlite, json, or meta sources', () => {
    let loadCount = 0
    const meta = {
      id: 's1',
      name: 'Meta',
      createdAt: 1,
      updatedAt: 2,
      agentId: 'agent-meta',
      messageCount: 5,
    }

    expect(resolveSessionDetailsSnapshot({
      meta,
      sqliteDetails: {
        id: 's1',
        name: 'SQLite',
        createdAt: 1,
        updatedAt: 10,
        totalTokens: 99,
      },
      getSession: () => {
        loadCount += 1
        return undefined
      },
      defaultAgentId: 'default-agent',
    })).toMatchObject({
      id: 's1',
      name: 'SQLite',
      agentId: 'agent-meta',
      messageCount: 5,
      totalTokens: 99,
    })
    expect(loadCount).toBe(0)

    expect(resolveSessionDetailsSnapshot({
      meta,
      sqliteDetails: {
        id: 's1',
        name: 'SQLite index only',
        createdAt: 1,
        updatedAt: 11,
      },
      getSession: () => {
        loadCount += 1
        return {
          id: 's1',
          name: 'JSON',
          createdAt: 1,
          updatedAt: 12,
          totalInputTokens: 7,
          totalOutputTokens: 3,
          totalTokens: 10,
          messages: [
            { id: 'm1', role: 'user' },
            { id: 'm2', role: 'assistant' },
          ],
        }
      },
      defaultAgentId: 'default-agent',
    })).toMatchObject({
      id: 's1',
      name: 'JSON',
      messageCount: 2,
      totalTokens: 10,
    })
    expect(loadCount).toBe(1)

    expect(resolveSessionDetailsSnapshot({
      meta: {
        id: 's2',
        name: 'Meta only',
        createdAt: 1,
        updatedAt: 2,
      },
      defaultAgentId: 'default-agent',
    })).toMatchObject({
      id: 's2',
      agentId: 'default-agent',
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      lastInputTokens: 0,
      contextSize: 0,
    })
  })

  it('applies and snapshots session token usage without storage access', () => {
    const session = {
      totalInputTokens: 10,
      totalOutputTokens: 5,
      totalTokens: 15,
      lastInputTokens: 10,
      contextSize: 10,
    }

    expect(applySessionTokenUsage(session, {
      inputTokens: 20,
      outputTokens: 7,
      totalTokens: 27,
    }, {
      inputTokens: 18,
      outputTokens: 6,
    })).toBe(session)

    expect(session).toEqual({
      totalInputTokens: 30,
      totalOutputTokens: 12,
      totalTokens: 42,
      lastInputTokens: 18,
      contextSize: 18,
    })

    applySessionTokenUsage(session, {
      inputTokens: 1000,
      outputTokens: 1,
      totalTokens: 1001,
    })

    expect(session).toEqual({
      totalInputTokens: 1030,
      totalOutputTokens: 13,
      totalTokens: 1043,
      lastInputTokens: 18,
      contextSize: 18,
    })

    applySessionContextSize(session, -50)
    expect(getSessionTokenUsageSnapshot(session)).toEqual({
      totalInputTokens: 1030,
      totalOutputTokens: 13,
      totalTokens: 1043,
      lastInputTokens: 0,
      contextSize: 0,
    })
  })

  it('appends and inserts session messages without storage access', () => {
    const session = {
      updatedAt: 1,
      messages: [
        { id: 'm0', role: 'user', content: 'start' },
      ],
      lastProvider: undefined as string | undefined,
      lastModel: undefined as string | undefined,
    }

    expect(appendSessionMessage(session, {
      id: 'm1',
      role: 'assistant',
      content: 'answer',
      provider: 'deepseek',
      model: 'deepseek-chat',
    }, 100)).toEqual({
      id: 'm1',
      role: 'assistant',
      content: 'answer',
      provider: 'deepseek',
      model: 'deepseek-chat',
    })
    expect(session.messages.map(message => message.id)).toEqual(['m0', 'm1'])
    expect(session).toMatchObject({
      updatedAt: 100,
      lastProvider: 'deepseek',
      lastModel: 'deepseek-chat',
    })

    insertSessionMessageAfter(session, 'm0', {
      id: 'm2',
      role: 'user',
      content: 'inserted',
    }, 200)
    expect(session.messages.map(message => message.id)).toEqual(['m0', 'm2', 'm1'])
    expect(session.updatedAt).toBe(200)

    insertSessionMessageAfter(session, 'missing', {
      id: 'm3',
      role: 'user',
      content: 'fallback append',
    }, 300)
    expect(session.messages.map(message => message.id)).toEqual(['m0', 'm2', 'm1', 'm3'])
    expect(session.updatedAt).toBe(300)
  })

  it('deletes, truncates, and edits session messages without storage access', () => {
    const session = {
      id: 's1',
      updatedAt: 1,
      totalInputTokens: 12,
      totalOutputTokens: 5,
      totalTokens: 17,
      lastInputTokens: 100,
      contextSize: 100,
      summary: 'summary',
      summaryUpToMessageId: 'm2',
      summaryCreatedAt: 50,
      messages: [
        { id: 'm1', role: 'user', content: 'one', timestamp: 10, usage: { inputTokens: 3, outputTokens: 0, totalTokens: 3 } },
        { id: 'm2', role: 'assistant', content: 'two', timestamp: 20, usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 } },
        { id: 'm3', role: 'user', content: 'three', timestamp: 30, usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 } },
      ],
    }

    expect(deleteSessionMessage(session, 'missing', 100)).toBeUndefined()
    expect(deleteSessionMessage(session, 'm1', 100)).toMatchObject({
      index: 0,
      deletedMessage: { id: 'm1' },
    })
    expect(session.messages.map(message => message.id)).toEqual(['m2', 'm3'])
    expect(session.updatedAt).toBe(100)
    expect(session.totalTokens).toBe(17)

    const truncated = truncateSessionMessagesFrom(session, 'm3', 200)
    expect(truncated).toMatchObject({
      index: 1,
      deletedMessages: [{ id: 'm3' }],
      subtractedUsage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
    })
    expect(session.messages.map(message => message.id)).toEqual(['m2'])
    expect(session).toMatchObject({
      totalInputTokens: 7,
      totalOutputTokens: 2,
      totalTokens: 9,
      lastInputTokens: 0,
      contextSize: 0,
      updatedAt: 200,
    })

    const edited = updateSessionMessageAndTruncateAfter(session, 'm2', 'updated', {
      hasContentParts: true,
      contentParts: [{ type: 'text', content: 'updated' }],
    }, 300)
    expect(edited).toMatchObject({
      index: 0,
      updatedMessage: {
        id: 'm2',
        content: 'updated',
        timestamp: 300,
        contentParts: [{ type: 'text', content: 'updated' }],
      },
      deletedMessages: [],
      subtractedUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    })
    expect(session.updatedAt).toBe(300)

    expect(updateSessionMessageAndTruncateAfter(session, 'm2', 'plain', {
      hasContentParts: true,
      contentParts: [],
    }, 400)?.updatedMessage.contentParts).toBeUndefined()
  })

  it('applies message delete through host storage adapters', () => {
    type TestMessage = { id: string; role: string; provider?: string; model?: string }
    type TestSession = { id: string; updatedAt: number; messages: TestMessage[] }

    const session: TestSession = {
      id: 's1',
      updatedAt: 1,
      messages: [
        { id: 'm1', role: 'user' },
        { id: 'm2', role: 'assistant', provider: 'deepseek', model: 'deepseek-chat' },
      ],
    }
    const calls: string[] = []

    const result = applySessionDeleteMessageWithAdapters<TestSession, TestMessage>({
      sessionId: 's1',
      messageId: 'm1',
      now: 123,
      getSession: id => id === session.id ? session : undefined,
      saveSession: (id, savedSession) => calls.push(`save:${id}:${savedSession.updatedAt}`),
      sqlite: {
        isReady: id => {
          calls.push(`ready:${id}`)
          return true
        },
        scheduleMigration: id => calls.push(`schedule:${id}`),
        syncMetadata: savedSession => calls.push(`metadata:${savedSession.id}:${savedSession.updatedAt}`),
        deleteMessage: (id, messageId) => calls.push(`delete:${id}:${messageId}`),
      },
    })

    expect(result).toMatchObject({ index: 0, deletedMessage: { id: 'm1' } })
    expect(session.messages.map(message => message.id)).toEqual(['m2'])
    expect(calls).toEqual([
      'save:s1:123',
      'ready:s1',
      'delete:s1:m1',
      'metadata:s1:123',
    ])
  })

  it('applies truncate and update+truncate through host storage adapters', () => {
    type TestMessage = {
      id: string
      role: string
      content?: unknown
      contentParts?: unknown[]
      timestamp: number
      provider?: string
      model?: string
      usage?: { inputTokens: number; outputTokens: number; totalTokens: number }
    }
    type TestSession = {
      id: string
      updatedAt: number
      messages: TestMessage[]
      totalInputTokens?: number
      totalOutputTokens?: number
      totalTokens?: number
      lastInputTokens?: number
      contextSize?: number
    }

    const session: TestSession = {
      id: 's1',
      updatedAt: 1,
      totalInputTokens: 12,
      totalOutputTokens: 4,
      totalTokens: 16,
      lastInputTokens: 8,
      contextSize: 8,
      messages: [
        { id: 'm1', role: 'user', content: 'one', timestamp: 10, usage: { inputTokens: 2, outputTokens: 0, totalTokens: 2 } },
        { id: 'm2', role: 'assistant', content: 'two', timestamp: 20, usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 } },
        { id: 'm3', role: 'user', content: 'three', timestamp: 30, usage: { inputTokens: 6, outputTokens: 2, totalTokens: 8 } },
      ],
    }
    const calls: string[] = []
    const meta = { updatedAt: 0 }

    const truncateResult = applySessionTruncateMessagesWithAdapters<TestSession, TestMessage>({
      sessionId: 's1',
      messageId: 'm3',
      now: 200,
      getSession: id => id === session.id ? session : undefined,
      saveSession: (id, savedSession) => calls.push(`save:${id}:${savedSession.updatedAt}`),
      sqlite: {
        isReady: () => true,
        scheduleMigration: id => calls.push(`schedule:${id}`),
        syncMetadata: savedSession => calls.push(`metadata:${savedSession.updatedAt}`),
        syncUsage: savedSession => calls.push(`usage:${savedSession.totalTokens}`),
        deleteMessageAndAfter: (id, messageId) => calls.push(`deleteAfter:${id}:${messageId}`),
      },
      updateIndexMeta: (_id, mutate) => mutate(meta),
    })

    expect(truncateResult).toMatchObject({
      index: 2,
      deletedMessages: [{ id: 'm3' }],
      subtractedUsage: { inputTokens: 6, outputTokens: 2, totalTokens: 8 },
    })
    expect(session.messages.map(message => message.id)).toEqual(['m1', 'm2'])
    expect(meta.updatedAt).toBe(200)
    expect(calls).toEqual([
      'save:s1:200',
      'deleteAfter:s1:m3',
      'metadata:200',
      'usage:8',
    ])

    calls.length = 0
    const updateResult = applySessionUpdateMessageAndTruncateWithAdapters<TestSession, TestMessage>({
      sessionId: 's1',
      messageId: 'm1',
      newContent: 'edited',
      options: { hasContentParts: true, contentParts: [{ type: 'text', content: 'edited' }] },
      now: 300,
      getSession: id => id === session.id ? session : undefined,
      saveSession: (id, savedSession) => calls.push(`save:${id}:${savedSession.updatedAt}`),
      sqlite: {
        isReady: () => true,
        scheduleMigration: id => calls.push(`schedule:${id}`),
        syncMetadata: savedSession => calls.push(`metadata:${savedSession.updatedAt}`),
        syncUsage: savedSession => calls.push(`usage:${savedSession.totalTokens}`),
        upsertMessageAndTruncate: (id, message, nextSequence) => calls.push(`upsert:${id}:${message.id}:${nextSequence}`),
      },
      updateIndexMeta: (_id, mutate) => mutate(meta),
    })

    expect(updateResult).toMatchObject({
      index: 0,
      updatedMessage: { id: 'm1', content: 'edited', timestamp: 300 },
      deletedMessages: [{ id: 'm2' }],
      subtractedUsage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
    })
    expect(session.messages).toHaveLength(1)
    expect(session.messages[0]?.contentParts).toEqual([{ type: 'text', content: 'edited' }])
    expect(meta.updatedAt).toBe(300)
    expect(calls).toEqual([
      'save:s1:300',
      'upsert:s1:m1:1',
      'metadata:300',
      'usage:2',
    ])
  })

  it('patches and appends message content parts without storage access', () => {
    const session = {
      messages: [
        { id: 'm1', role: 'assistant', content: 'old' },
        { id: 'm2', role: 'user', content: 'hello', contentParts: [{ type: 'text', content: 'hello' }] },
      ],
    }

    expect(findSessionMessage(session, 'm1')).toBe(session.messages[0])
    expect(patchSessionMessage(session, 'm1', {
      content: 'new',
      isStreaming: false,
    })).toBe(session.messages[0])
    expect(session.messages[0]).toMatchObject({
      content: 'new',
      isStreaming: false,
    })

    expect(appendSessionMessageContentPart(session, 'm1', {
      type: 'reasoning',
      content: 'because',
    })).toBe(session.messages[0])
    expect(session.messages[0].contentParts).toEqual([
      { type: 'reasoning', content: 'because' },
    ])

    expect(appendSessionMessageContentPart(session, 'm2', {
      type: 'text',
      content: '!',
    })?.contentParts).toEqual([
      { type: 'text', content: 'hello' },
      { type: 'text', content: '!' },
    ])
    expect(patchSessionMessage(session, 'missing', { content: 'nope' })).toBeUndefined()
  })

  it('mutates top-level message steps without storage access', () => {
    const message: {
      id: string
      role: string
      steps: Array<{
        id: string
        title: string
        toolCallId?: string
        status: string
        turnIndex: number
        usage?: { inputTokens: number; outputTokens: number; totalTokens: number }
      }>
    } = {
      id: 'm1',
      role: 'assistant',
      steps: [
        { id: 's1', title: 'Old', toolCallId: 'call-1', status: 'running', turnIndex: 1 },
      ],
    }
    type TestStep = (typeof message.steps)[number]

    expect(addOrUpdateSessionMessageStep(message, {
      id: 's2',
      title: 'Replacement',
      toolCallId: 'call-1',
      status: 'completed',
      turnIndex: 1,
    } as TestStep)).toEqual({
      id: 's2',
      title: 'Replacement',
      toolCallId: 'call-1',
      status: 'completed',
      turnIndex: 1,
    })
    expect(message.steps).toHaveLength(1)

    addOrUpdateSessionMessageStep(message, {
      id: 's3',
      title: 'Second',
      status: 'running',
      turnIndex: 2,
    } as TestStep)
    expect(message.steps).toHaveLength(2)

    expect(updateSessionMessageStep(message, 's3', {
      status: 'completed',
      usage: { inputTokens: 3, outputTokens: 1, totalTokens: 4 },
    })).toMatchObject({
      id: 's3',
      status: 'completed',
    })

    expect(updateSessionMessageStepsUsageByTurn(message, 1, {
      inputTokens: 10,
      outputTokens: 2,
      totalTokens: 12,
    })).toEqual(['s2'])
    expect(message.steps[0].usage).toEqual({
      inputTokens: 10,
      outputTokens: 2,
      totalTokens: 12,
    })
    expect(updateSessionMessageStep(message, 'missing', { status: 'failed' })).toBeUndefined()
  })

  it('creates session and branch session records without storage access', () => {
    expect(createCoreSessionRecord({
      sessionId: 's1',
      name: 'New',
      defaultAgentId: 'agent-default',
      workingDirectory: '/workspace',
      now: 100,
    })).toEqual({
      id: 's1',
      name: 'New',
      messages: [],
      createdAt: 100,
      updatedAt: 100,
      agentId: 'agent-default',
      workingDirectory: '/workspace',
    })

    const inherited = [
      {
        id: 'm1',
        role: 'assistant',
        usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 },
      },
      {
        id: 'm2',
        role: 'user',
      },
      {
        id: 'm3',
        role: 'assistant',
        usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
      },
    ]
    expect(sumSessionMessageUsage(inherited)).toEqual({
      inputTokens: 14,
      outputTokens: 5,
      totalTokens: 19,
    })

    const usageSession = {
      totalInputTokens: 12,
      totalOutputTokens: 4,
      totalTokens: 16,
    }
    expect(subtractSessionMessageUsage(usageSession, inherited)).toEqual({
      inputTokens: 14,
      outputTokens: 5,
      totalTokens: 19,
    })
    expect(usageSession).toEqual({
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
    })

    expect(createCoreBranchSessionRecord({
      sessionId: 'branch',
      name: 'Branch',
      parentSessionId: 'parent',
      parentSession: { id: 'parent', agentId: 'agent-parent' },
      branchFromMessageId: 'm2',
      inheritedMessages: inherited,
      defaultAgentId: 'agent-default',
      workingDirectory: '/workspace',
      workingDirectoryRoots: ['/other'],
      now: 200,
    })).toMatchObject({
      id: 'branch',
      name: 'Branch',
      parentSessionId: 'parent',
      branchFromMessageId: 'm2',
      agentId: 'agent-parent',
      workingDirectory: '/workspace',
      workingDirectoryRoots: ['/other'],
      totalInputTokens: 14,
      totalOutputTokens: 5,
      totalTokens: 19,
      createdAt: 200,
      updatedAt: 200,
    })
  })

  it('creates sessions through core persistence adapters', () => {
    type TestMessage = {
      id: string
      role: string
      usage?: { inputTokens: number; outputTokens: number; totalTokens: number }
    }
    type TestSession = ReturnType<typeof createCoreSessionRecord<TestMessage>>
    type TestMeta = {
      id: string
      name: string
      createdAt: number
      updatedAt: number
      agentId?: string
      parentSessionId?: string
      branchFromMessageId?: string
    }

    const index: TestMeta[] = []
    const calls: string[] = []
    const session = createSessionWithAdapters<TestSession, TestMessage, TestMeta>({
      sessionId: 's1',
      name: 'New',
      defaultAgentId: 'agent-default',
      workingDirectory: '/workspace',
      now: 100,
      saveSession: (id, saved) => calls.push(`save:${id}:${saved.name}`),
      syncSession: saved => calls.push(`sync:${saved.id}`),
      syncFullSession: saved => calls.push(`syncFull:${saved.id}`),
      loadIndex: () => index,
      saveIndex: savedIndex => calls.push(`index:${savedIndex[0]?.id}`),
      setCurrentSessionId: id => calls.push(`current:${id}`),
    })

    expect(session).toMatchObject({
      id: 's1',
      name: 'New',
      workingDirectory: '/workspace',
      agentId: 'agent-default',
      createdAt: 100,
      updatedAt: 100,
    })
    expect(index).toEqual([{
      id: 's1',
      name: 'New',
      createdAt: 100,
      updatedAt: 100,
      agentId: 'agent-default',
    }])
    expect(calls).toEqual([
      'save:s1:New',
      'sync:s1',
      'syncFull:s1',
      'index:s1',
      'current:s1',
    ])

    const branchIndex: TestMeta[] = []
    const branch = createBranchSessionWithAdapters<TestSession, TestMessage, TestMeta>({
      sessionId: 'branch',
      name: 'Branch',
      parentSessionId: 's1',
      parentSession: { id: 's1', agentId: 'agent-parent' },
      branchFromMessageId: 'm1',
      inheritedMessages: [
        { id: 'm1', role: 'user', usage: { inputTokens: 2, outputTokens: 0, totalTokens: 2 } },
      ],
      defaultAgentId: 'agent-default',
      workingDirectory: '/workspace',
      now: 200,
      saveSession: () => undefined,
      loadIndex: () => branchIndex,
      saveIndex: () => undefined,
    })

    expect(branch).toMatchObject({
      id: 'branch',
      parentSessionId: 's1',
      branchFromMessageId: 'm1',
      agentId: 'agent-parent',
      totalInputTokens: 2,
      totalTokens: 2,
    })
    expect(branchIndex[0]).toMatchObject({
      id: 'branch',
      parentSessionId: 's1',
      branchFromMessageId: 'm1',
      agentId: 'agent-parent',
    })
  })

  it('plans cascade session deletes and next current session in core', () => {
    const index = [
      { id: 'root', name: 'Root', createdAt: 1, updatedAt: 1 },
      { id: 'child-a', name: 'A', createdAt: 2, updatedAt: 2, parentSessionId: 'root' },
      { id: 'grandchild', name: 'G', createdAt: 3, updatedAt: 3, parentSessionId: 'child-a' },
      { id: 'child-b', name: 'B', createdAt: 4, updatedAt: 4, parentSessionId: 'root' },
      { id: 'other', name: 'Other', createdAt: 5, updatedAt: 5 },
    ]

    expect(collectSessionCascadeDeleteIds(index, 'root')).toEqual([
      'root',
      'child-a',
      'grandchild',
      'child-b',
    ])

    expect(planSessionCascadeDelete(index, {
      sessionId: 'child-a',
      currentSessionId: 'grandchild',
      parentSessionId: 'root',
    })).toEqual({
      deletedIds: ['child-a', 'grandchild'],
      nextCurrentSessionId: 'root',
    })

    expect(planSessionCascadeDelete(index, {
      sessionId: 'root',
      currentSessionId: 'child-b',
    })).toEqual({
      deletedIds: ['root', 'child-a', 'grandchild', 'child-b'],
      nextCurrentSessionId: 'other',
    })

    expect(planSessionCascadeDelete(index, {
      sessionId: 'child-a',
      currentSessionId: 'other',
      parentSessionId: 'root',
    })).toEqual({
      deletedIds: ['child-a', 'grandchild'],
    })
  })

  it('deletes cascade sessions through core host adapters', () => {
    const sessions = new Map([
      ['root', { id: 'root' }],
      ['child-a', { id: 'child-a', parentSessionId: 'root' }],
      ['grandchild', { id: 'grandchild', parentSessionId: 'child-a' }],
      ['orphan', { id: 'orphan' }],
    ])
    const index = [
      { id: 'root', name: 'Root', createdAt: 1, updatedAt: 1 },
      { id: 'child-a', name: 'A', createdAt: 2, updatedAt: 2, parentSessionId: 'root' },
      { id: 'grandchild', name: 'G', createdAt: 3, updatedAt: 3, parentSessionId: 'child-a' },
      { id: 'orphan', name: 'O', createdAt: 4, updatedAt: 4 },
    ]
    const calls: string[] = []
    let savedIndex = index
    let current = 'grandchild'

    const result = deleteSessionWithAdapters({
      sessionId: 'child-a',
      getSession: id => sessions.get(id),
      getCurrentSessionId: () => current,
      loadIndex: () => index,
      saveIndex: next => {
        savedIndex = next
        calls.push(`index:${next.map(item => item.id).join(',')}`)
      },
      cancelPendingSave: id => calls.push(`cancel:${id}`),
      deleteSessionFile: id => calls.push(`file:${id}`),
      deleteSessionCache: id => calls.push(`cache:${id}`),
      deleteSessionsFromSqlite: ids => calls.push(`sqlite:${ids.join(',')}`),
      setCurrentSessionId: id => {
        current = id
        calls.push(`current:${id}`)
      },
    })

    expect(result).toEqual({
      deletedIds: ['child-a', 'grandchild'],
      parentSessionId: 'root',
    })
    expect(savedIndex.map(item => item.id)).toEqual(['root', 'orphan'])
    expect(current).toBe('root')
    expect(calls).toEqual([
      'cancel:child-a',
      'file:child-a',
      'cache:child-a',
      'cancel:grandchild',
      'file:grandchild',
      'cache:grandchild',
      'sqlite:child-a,grandchild',
      'index:root,orphan',
      'current:root',
    ])
  })

  it('extracts index metadata and delegates message preview formatting to the host', () => {
    const meta = extractSessionMeta(
      {
        id: 's1',
        name: 'Session',
        createdAt: 1,
        updatedAt: 2,
        messages: [
          { role: 'assistant', content: 'not previewed' },
          { role: 'user', content: 'hello' },
        ],
      },
      {
        defaultAgentId: 'default-agent',
        displayContentForMessage: message => `preview:${String(message.content)}`,
      },
    )

    expect(meta).toMatchObject({
      id: 's1',
      name: 'Session',
      agentId: 'default-agent',
      messageCount: 2,
      previewText: 'preview:hello',
    })
  })
})
