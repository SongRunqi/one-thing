import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  CoreSession,
  CoreSessionDetails,
  CoreSessionMessageWithModelInfo,
  CoreSessionMessageWithUsage,
  CoreSessionMeta,
  StoredChatMessage,
  UserMessageMarker,
} from '@onething/core/session'
import { createOnethingSessionRepository } from '../session-repository.js'

interface TestMessage
  extends StoredChatMessage,
    CoreSessionMessageWithUsage,
    CoreSessionMessageWithModelInfo {
  content: string
}

interface TestSession extends CoreSession<TestMessage> {
  id: string
  parentSessionId?: string
  workingDirectory?: string
  workingDirectoryRoots?: string[]
}

interface TestMeta extends CoreSessionMeta {
  parentSessionId?: string
}

const tempDirs: string[] = []

function createTempSessionsDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onething-runtime-sessions-'))
  const sessionsDir = path.join(dir, 'sessions')
  fs.mkdirSync(sessionsDir, { recursive: true })
  tempDirs.push(dir)
  return sessionsDir
}

function readJsonFile<TValue>(filePath: string, fallback: TValue): TValue {
  if (!fs.existsSync(filePath)) return fallback
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as TValue
}

function writeJsonFile(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

async function writeJsonFileAsync(filePath: string, data: unknown): Promise<void> {
  writeJsonFile(filePath, data)
}

describe('onething session repository', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('owns session index, cache, JSON persistence, paging, and deletion behind host adapters', async () => {
    const sessionsDir = createTempSessionsDir()
    let currentSessionId = ''
    const logger = { info: vi.fn(), error: vi.fn() }
    const repository = createOnethingSessionRepository<
      TestSession,
      TestMessage,
      TestMeta,
      CoreSessionDetails,
      UserMessageMarker
    >({
      defaultAgentId: 'default-agent',
      getSessionsDir: () => sessionsDir,
      getSessionPath: sessionId => path.join(sessionsDir, `${sessionId}.json`),
      readJsonFile,
      writeJsonFile,
      writeJsonFileAsync,
      deleteJsonFile: filePath => fs.rmSync(filePath, { force: true }),
      getCurrentSessionId: () => currentSessionId,
      setCurrentSessionId: sessionId => {
        currentSessionId = sessionId
      },
      getDefaultWorkingDirectory: () => '~/workspace',
      expandPath: value => value.replace(/^~/, '/Users/test'),
      logger,
    })

    const session = repository.createSession('s1', 'First')
    expect(session.id).toBe('s1')
    expect(session.workingDirectory).toBe('/Users/test/workspace')
    expect(currentSessionId).toBe('s1')
    expect(repository.getSessionsList()).toMatchObject([{ id: 's1', name: 'First', agentId: 'default-agent' }])

    session.messages.push({
      id: 'm1',
      role: 'user',
      content: 'hello runtime',
      timestamp: 100,
    })
    repository.saveSessionToFile('s1', session)
    await repository.flushSessionSave('s1')

    expect(repository.getSessionRaw('s1')?.messages).toHaveLength(1)
    expect(repository.getSessionDetails('s1')).toMatchObject({
      id: 's1',
      name: 'First',
      messageCount: 1,
      agentId: 'default-agent',
    })
    expect(repository.getSessionMessagesPage({ sessionId: 's1', anchor: 'tail', limit: 10 }))
      .toMatchObject({ success: true, messages: [{ id: 'm1', content: 'hello runtime' }] })
    expect(repository.getSessionUserMessageMarkers('s1')).toEqual([
      { id: 'm1', seq: 1, timestamp: 100, preview: 'hello runtime' },
    ])

    expect(repository.deleteSession('s1')).toEqual({ deletedIds: ['s1'] })
    expect(repository.getSessionsList()).toEqual([])
    expect(repository.getSessionRaw('s1')).toBeUndefined()
  })

  it('owns session metadata and side-effect mutations behind repository adapters', () => {
    const sessionsDir = createTempSessionsDir()
    let currentSessionId = ''
    const syncSessionMetadata = vi.fn()
    const syncSessionUsage = vi.fn()
    const syncSessionVariables = vi.fn()
    const repository = createOnethingSessionRepository<
      TestSession,
      TestMessage,
      TestMeta,
      CoreSessionDetails,
      UserMessageMarker
    >({
      defaultAgentId: 'default-agent',
      getSessionsDir: () => sessionsDir,
      getSessionPath: sessionId => path.join(sessionsDir, `${sessionId}.json`),
      readJsonFile,
      writeJsonFile,
      writeJsonFileAsync,
      deleteJsonFile: filePath => fs.rmSync(filePath, { force: true }),
      getCurrentSessionId: () => currentSessionId,
      setCurrentSessionId: sessionId => {
        currentSessionId = sessionId
      },
      expandPath: value => value.replace(/^~/, '/Users/test'),
      sqlite: {
        isSessionReady: () => true,
        scheduleMigration: vi.fn(),
        syncSessionMetadata,
        syncSessionUsage,
        syncSessionVariables,
      },
    })

    repository.createSession('s1', 'First')

    expect(repository.renameSession('s1', 'Renamed')).toBe(true)
    expect(repository.updateSessionPin('s1', true)).toBe(true)
    expect(repository.updateSessionArchived('s1', true, 123)).toBe(true)
    expect(repository.updateSessionPermissionMode('s1', 'ask')).toBe(true)
    expect(repository.updateSessionWorkingDirectory('s1', '~/project')).toBe(true)
    expect(repository.updateSessionWorkingDirectoryRoots('s1', ['~/project', '/tmp'])).toBe(true)
    expect(repository.inheritSessionWorkingDirectory('s1', '~/inherited')).toBe(true)
    expect(repository.updateSessionVariables('s1', [
      { name: 'ticket', value: '42' },
    ])).toBe(true)
    expect(repository.updateSessionTokenUsage('s1', {
      inputTokens: 10,
      outputTokens: 4,
      totalTokens: 14,
    }, {
      inputTokens: 7,
    })).toBe(true)
    expect(repository.updateSessionContextSize('s1', 5)).toBe(true)
    expect(repository.updateSessionPromptContext('s1', { selected: 'prompt-1' })).toBe(true)
    expect(repository.updateSessionSummary('s1', 'Earlier context', 'm1')).toBe(true)
    expect(repository.updateSessionModel('s1', 'deepseek', 'deepseek-chat')).toBe(true)
    expect(repository.updateSessionAgent('s1', 'agent-custom')).toBe(true)

    const session = repository.getSession('s1')
    expect(session).toMatchObject({
      name: 'Renamed',
      isPinned: true,
      isArchived: true,
      archivedAt: 123,
      permissionMode: 'ask',
      workingDirectory: '/Users/test/inherited',
      workingDirectoryRoots: ['/tmp'],
      variables: [{ name: 'ticket', value: '42', updatedAt: expect.any(Number) }],
      totalInputTokens: 10,
      totalOutputTokens: 4,
      totalTokens: 14,
      lastInputTokens: 5,
      contextSize: 5,
      promptContext: { selected: 'prompt-1' },
      summary: 'Earlier context',
      summaryUpToMessageId: 'm1',
      lastProvider: 'deepseek',
      lastModel: 'deepseek-chat',
      agentId: 'agent-custom',
    })
    expect(repository.getSessionsList()[0]).toMatchObject({
      id: 's1',
      name: 'Renamed',
      isPinned: true,
      isArchived: true,
      archivedAt: 123,
      permissionMode: 'ask',
      lastProvider: 'deepseek',
      lastModel: 'deepseek-chat',
      agentId: 'agent-custom',
    })
    expect(syncSessionMetadata).toHaveBeenCalled()
    expect(syncSessionUsage).toHaveBeenCalled()
    expect(syncSessionVariables).toHaveBeenCalled()
    expect(repository.renameSession('missing', 'Nope')).toBe(false)
  })
})
