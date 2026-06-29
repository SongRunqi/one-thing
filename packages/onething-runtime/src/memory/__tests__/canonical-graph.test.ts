import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appendMemoryNote,
} from '../append.js'
import {
  applyDailyNoteCaptureActions,
  buildMemoryCaptureInput,
  runMemoryCapture,
} from '../capture-actions.js'
import {
  canonicalDisplayText,
  deleteCanonicalMemory,
  getCanonicalMemoryAudit,
  getCanonicalMemoryByIdOrKey,
  listCanonicalMemories,
  searchCanonicalMemory,
  upsertCanonicalMemory,
} from '../canonical.js'
import {
  closeMemoryDatabase,
  getDb,
  getFtsTokenizer,
} from '../database.js'
import {
  buildRecentDailyContextFragment,
} from '../daily-context.js'
import {
  deleteMemoryIndexPaths,
  indexMemoryFile,
  listMemoryIndexFiles,
  readMemoryIndexCounts,
} from '../indexer.js'
import {
  searchMarkdownMemoryChunks,
} from '../search.js'
import {
  listManagedMemoryFiles,
  readManagedMemoryFile,
  saveManagedMemoryFile,
} from '../managed-files.js'
import {
  deleteGraphObservation,
  ensureUserSelfEntity,
  getGraphAudit,
  getGraphOverview,
  ignoreGraphDuplicate,
  listGraphObservations,
  listGraphRelations,
  mergeGraphDuplicate,
  searchGraphMemory,
  upsertGraphEntity,
  upsertGraphObservation,
  upsertGraphRelation,
} from '../graph.js'
import type {
  MemoryWorkspace,
  ResolvedSoulMemorySettings,
} from '../types.js'

const tempDirs: string[] = []

function dateStringDaysAgo(daysAgo: number): string {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function makeWorkspace(): MemoryWorkspace {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-memory-db-'))
  tempDirs.push(root)
  const settings = {
    enabled: true,
    bootstrapMaxChars: 4000,
    search: {
      enabled: true,
      chunkTokens: 100,
      chunkOverlap: 20,
      maxResults: 5,
      temporalDecayHalfLifeDays: 30,
    },
    embeddings: {
      enabled: false,
    },
    canonicalMemory: {
      enabled: true,
      store: 'sqlite',
      highConfidenceThreshold: 0.6,
      semanticDedupeThreshold: 0.92,
    },
    read: {
      defaultLines: 20,
      maxLines: 200,
    },
    dailyContext: {
      enabled: true,
      mode: 'always',
      daysBack: 0,
      maxChars: 500,
    },
  } as ResolvedSoulMemorySettings

  return {
    settings,
    agentId: 'test-agent',
    root,
    memoryDir: path.join(root, 'memory'),
    soulPath: path.join(root, 'SOUL.md'),
    userPath: path.join(root, 'USER.md'),
    memoryPath: path.join(root, 'MEMORY.md'),
    dreamsPath: path.join(root, 'DREAMS.md'),
    todayPath: path.join(root, 'memory/2026-06-27.md'),
    dbPath: path.join(root, 'memory.sqlite'),
  }
}

afterEach(() => {
  closeMemoryDatabase()
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('runtime memory canonical and graph database operations', () => {
  it('initializes SQLite schema and persists canonical memories', async () => {
    const workspace = makeWorkspace()

    getDb(workspace)
    expect(getFtsTokenizer()).not.toBe('unknown')

    const result = await upsertCanonicalMemory(workspace, {
      memoryKey: 'user.preference.answer_style',
      kind: 'preference',
      value: 'The user prefers concise Chinese implementation updates.',
      confidence: 0.9,
      source: 'test',
      evidence: 'unit test',
    })

    expect(result.action).toBe('create')
    expect(canonicalDisplayText(result.memory)).toContain('concise Chinese')
    expect(listCanonicalMemories({ workspace })).toHaveLength(1)
    expect(getCanonicalMemoryByIdOrKey(workspace, 'user.preference.answer_style')?.id).toBe(result.memory.id)
    expect(await searchCanonicalMemory({
      workspace,
      query: 'concise Chinese',
      limit: 5,
    })).toHaveLength(1)

    deleteCanonicalMemory(workspace, result.memory.id)
    expect(listCanonicalMemories({ workspace })).toHaveLength(0)
    expect(getCanonicalMemoryAudit(workspace, result.memory.id).some(event => event.action === 'delete')).toBe(true)
  })

  it('persists graph entities, observations, relations, and overview counts', async () => {
    const workspace = makeWorkspace()
    const user = ensureUserSelfEntity(workspace)
    const project = upsertGraphEntity(workspace, {
      entityType: 'project',
      name: 'Headless Core',
      confidence: 0.9,
      source: 'test',
    }).entity

    const observation = await upsertGraphObservation(workspace, {
      entityId: user.id,
      kind: 'preference',
      slot: 'architecture',
      value: 'Use onething-runtime as the reusable business runtime.',
      confidence: 0.9,
      source: 'test',
    })
    const relation = await upsertGraphRelation(workspace, {
      fromEntityId: user.id,
      relationType: 'works_on',
      toEntityId: project.id,
      confidence: 0.9,
      source: 'test',
    })

    expect(observation.action).toBe('create')
    expect(relation.action).toBe('create')
    expect(listGraphObservations({ workspace, entityId: user.id })).toHaveLength(1)
    expect(listGraphRelations({ workspace, entityId: user.id })).toHaveLength(1)
    expect(await searchGraphMemory({
      workspace,
      query: 'reusable business runtime',
      limit: 5,
    })).toHaveLength(1)
    expect(getGraphOverview(workspace)).toMatchObject({
      entities: 2,
      observations: 1,
      relations: 1,
    })
  })

  it('searches indexed Markdown chunks inside the runtime', async () => {
    const workspace = makeWorkspace()
    const database = getDb(workspace)
    fs.writeFileSync(
      workspace.memoryPath,
      '# MEMORY\n\nHeadless gateway calls the reusable onething runtime.\n',
    )

    const indexed = await indexMemoryFile({
      workspace,
      database,
      file: {
        absolutePath: workspace.memoryPath,
        relativePath: 'MEMORY.md',
        kind: 'memory',
      },
    })

    const hits = await searchMarkdownMemoryChunks({
      workspace,
      query: 'reusable onething runtime',
      limit: 5,
    })

    expect(indexed).toMatchObject({ indexed: true, chunkCount: 1, embeddedChunks: 0 })
    expect(readMemoryIndexCounts(database)).toEqual({ indexedFiles: 1, indexedChunks: 1 })
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({
      kind: 'memory',
      path: 'MEMORY.md',
    })

    deleteMemoryIndexPaths(database, ['MEMORY.md'])
    expect(readMemoryIndexCounts(database)).toEqual({ indexedFiles: 0, indexedChunks: 0 })
  })

  it('discovers root and daily Markdown index files inside the runtime', async () => {
    const workspace = makeWorkspace()
    fs.mkdirSync(path.join(workspace.memoryDir, 'nested'), { recursive: true })
    fs.mkdirSync(path.join(workspace.memoryDir, '.dreams'), { recursive: true })
    fs.writeFileSync(workspace.memoryPath, '# MEMORY\n')
    fs.writeFileSync(path.join(workspace.memoryDir, '2026-06-27.md'), '# Daily\n')
    fs.writeFileSync(path.join(workspace.memoryDir, 'nested', 'note.md'), '# Nested\n')
    fs.writeFileSync(path.join(workspace.memoryDir, '.dreams', 'ignored.md'), '# Ignored\n')
    fs.writeFileSync(path.join(workspace.memoryDir, 'ignored.txt'), 'ignored')

    const files = await listMemoryIndexFiles(workspace)

    expect(files.map(file => file.relativePath).sort()).toEqual([
      'MEMORY.md',
      'memory/2026-06-27.md',
      'memory/nested/note.md',
    ].sort())
    expect(files.find(file => file.relativePath === 'memory/2026-06-27.md')).toMatchObject({
      kind: 'daily',
      date: '2026-06-27',
    })
  })

  it('lists, reads, and saves managed memory files inside the runtime', async () => {
    const workspace = makeWorkspace()
    fs.writeFileSync(workspace.soulPath, '# SOUL\n\nRuntime personality.\n')
    fs.writeFileSync(workspace.memoryPath, '# MEMORY\n\nRuntime facts.\n')
    fs.writeFileSync(workspace.dreamsPath, '# DREAMS\n')
    fs.mkdirSync(workspace.memoryDir, { recursive: true })
    fs.writeFileSync(path.join(workspace.memoryDir, '2026-06-27.md'), '# Daily\n\nGateway note.\n')
    const writes: string[] = []

    const files = await listManagedMemoryFiles(workspace)
    const excerpt = await readManagedMemoryFile({
      workspace,
      path: 'MEMORY.md',
      lines: 2,
    })
    const saved = await saveManagedMemoryFile({
      workspace,
      path: 'memory/new-note.md',
      content: '# New\n\nSaved from runtime.',
      onIndexableWrite: target => {
        writes.push(target.relativePath)
      },
    })

    expect(files.map(file => file.relativePath)).toContain('SOUL.md')
    expect(files.map(file => file.relativePath)).toContain('memory/2026-06-27.md')
    expect(excerpt).toMatchObject({
      relativePath: 'MEMORY.md',
      startLine: 1,
      endLine: 2,
    })
    expect(excerpt.text).toContain('# MEMORY')
    expect(saved).toMatchObject({
      relativePath: 'memory/new-note.md',
      kind: 'daily',
    })
    expect(fs.readFileSync(path.join(workspace.root, 'memory/new-note.md'), 'utf-8')).toBe('# New\n\nSaved from runtime.\n')
    expect(writes).toEqual(['memory/new-note.md'])
  })

  it('builds recent daily context inside the runtime', async () => {
    const workspace = makeWorkspace()
    const today = dateStringDaysAgo(0)
    fs.mkdirSync(workspace.memoryDir, { recursive: true })
    fs.writeFileSync(path.join(workspace.memoryDir, `${today}.md`), `# ${today}\n\nGateway runtime context.\n`)

    const fragment = await buildRecentDailyContextFragment({
      workspace,
      sessionId: undefined,
      userTurnCount: undefined,
    })
    expect(fragment).toContain(`## memory/${today}.md`)
    expect(fragment).toContain('Gateway runtime context.')

    workspace.settings.dailyContext.mode = 'session-start'
    const skipped = await buildRecentDailyContextFragment({
      workspace,
      sessionId: 'session-a',
      userTurnCount: 2,
    })
    expect(skipped).toBeNull()
  })

  it('appends daily memory notes inside the runtime', async () => {
    const workspace = makeWorkspace()
    const writes: string[] = []
    const diagnostics: Array<{ operation: string; stage: string; status: string }> = []

    const target = await appendMemoryNote({
      workspace,
      content: 'Runtime append note.',
      heading: 'Append Heading',
      logDiagnostic: event => {
        diagnostics.push({
          operation: event.operation,
          stage: event.stage,
          status: event.status,
        })
      },
      onIndexableWrite: written => {
        writes.push(written.relativePath)
      },
    })

    const content = fs.readFileSync(workspace.todayPath, 'utf-8')
    expect(target).toEqual({
      absolutePath: workspace.todayPath,
      relativePath: 'memory/2026-06-27.md',
    })
    expect(content).toContain('# 2026-06-27')
    expect(content).toContain('## Append Heading')
    expect(content).toContain('Runtime append note.')
    expect(writes).toEqual(['memory/2026-06-27.md'])
    expect(diagnostics).toContainEqual({
      operation: 'append-note',
      stage: 'write',
      status: 'ok',
    })

    await expect(appendMemoryNote({
      workspace,
      target: 'memory',
      content: 'Legacy memory writes are blocked.',
    })).rejects.toThrow(/legacy compatibility/)
  })

  it('applies daily capture actions inside the runtime', async () => {
    const workspace = makeWorkspace()
    fs.mkdirSync(workspace.memoryDir, { recursive: true })
    fs.writeFileSync(workspace.memoryPath, '# MEMORY\n')
    fs.writeFileSync(workspace.todayPath, [
      '# 2026-06-27',
      '',
      '## 09:00:00',
      '',
      '- 用户问了 capture 设置。',
      '- sdk怎么添加已经安装的java jdk？',
      '',
    ].join('\n'))
    const writes: string[] = []
    const diagnostics: Array<{ operation: string; stage: string; status: string }> = []

    const result = await applyDailyNoteCaptureActions({
      workspace,
      candidates: [
        {
          action: 'replace',
          confidence: 0.9,
          oldText: '- 用户问了 capture 设置。',
          newText: '用户今天确认 capture 应支持 add/replace/remove 三种 daily-note 动作。',
        },
        {
          action: 'remove',
          confidence: 0.9,
          text: '- sdk怎么添加已经安装的java jdk？',
        },
        {
          action: 'add',
          confidence: 0.9,
          content: '用户今天在 start-electron 实现 capture JSON action mutation。',
        },
      ],
      heading: '10:30:00',
      logDiagnostic: event => {
        diagnostics.push({
          operation: event.operation,
          stage: event.stage,
          status: event.status,
        })
      },
      onIndexableWrite: written => {
        writes.push(written.relativePath)
      },
    })

    expect(result).toMatchObject({
      absolutePath: workspace.todayPath,
      relativePath: 'memory/2026-06-27.md',
      applied: 3,
      added: 1,
      replaced: 1,
      removed: 1,
      skipped: 0,
    })
    const daily = fs.readFileSync(workspace.todayPath, 'utf-8')
    expect(daily).toContain('- 用户今天确认 capture 应支持 add/replace/remove 三种 daily-note 动作。')
    expect(daily).toContain('- 用户今天在 start-electron 实现 capture JSON action mutation。')
    expect(daily).not.toContain('sdk怎么添加已经安装的java jdk？')
    expect(writes).toEqual(['memory/2026-06-27.md', 'memory/2026-06-27.md'])
    expect(diagnostics).toContainEqual({
      operation: 'append-note',
      stage: 'write',
      status: 'ok',
    })
    expect(diagnostics).toContainEqual({
      operation: 'daily-note-actions',
      stage: 'write',
      status: 'ok',
    })
  })

  it('builds memory capture input inside the runtime', async () => {
    const workspace = makeWorkspace()
    fs.mkdirSync(workspace.memoryDir, { recursive: true })
    fs.writeFileSync(workspace.todayPath, '# 2026-06-27\n\n- 用户今天排查 gateway 登录问题。\n')

    const input = await buildMemoryCaptureInput({
      workspace,
      maxChars: 1200,
      context: {
        messages: [
          { role: 'user', content: '扫码后报错了' },
          { role: 'assistant', content: '我会对比官方文档和实现。' },
        ],
        lastUserMessage: '扫码后报错了',
        lastAssistantMessage: '我会对比官方文档和实现。',
      },
    })

    expect(input).toContain('Current daily note (memory/2026-06-27.md):')
    expect(input).toContain('用户今天排查 gateway 登录问题。')
    expect(input).toContain('Latest user message:')
    expect(input).toContain('扫码后报错了')
    expect(input).toContain('Latest assistant response:')
    expect(input).toContain('我会对比官方文档和实现。')
  })

  it('runs memory capture orchestration inside the runtime', async () => {
    const workspace = makeWorkspace()
    workspace.settings.capture = {
      enabled: true,
      mode: 'auto',
      maxInputChars: 1200,
      timeoutMs: 1000,
    }
    fs.mkdirSync(workspace.memoryDir, { recursive: true })
    fs.writeFileSync(workspace.memoryPath, '# MEMORY\n')
    fs.writeFileSync(workspace.todayPath, '# 2026-06-27\n')
    const writes: string[] = []
    const diagnostics: Array<{ operation: string; stage: string; status: string }> = []
    const statusMutations: unknown[] = []

    const result = await runMemoryCapture<{ id: string }>({
      workspace,
      sessionId: 'session-a',
      assistantMessageId: 'assistant-a',
      context: {
        messages: [
          { role: 'user', content: '记录一下，我今天在 gateway 里接入微信。' },
          { role: 'assistant', content: '我已经把微信入口接到了 runtime。' },
        ],
        lastUserMessage: '记录一下，我今天在 gateway 里接入微信。',
        lastAssistantMessage: '我已经把微信入口接到了 runtime。',
      },
      resolveProvider: () => ({
        provider: { id: 'mock-provider' },
        providerId: 'mock',
        model: 'mock-capture',
        source: 'test',
      }),
      generateCapture: () => JSON.stringify({
        action: 'capture',
        confidence: 0.9,
        memories: [
          {
            action: 'add',
            confidence: 0.9,
            content: '用户今天在 gateway 里接入微信。',
          },
        ],
      }),
      applyStatusMutation: plan => {
        statusMutations.push(plan)
      },
      logDiagnostic: event => {
        diagnostics.push({
          operation: event.operation,
          stage: event.stage,
          status: event.status,
        })
      },
      onIndexableWrite: target => {
        writes.push(target.relativePath)
      },
      now: () => 1_772_000_000_000,
    })

    expect(result).toMatchObject({
      status: 'saved',
      applied: 1,
      added: 1,
      replaced: 0,
      removed: 0,
      relativePath: 'memory/2026-06-27.md',
    })
    expect(fs.readFileSync(workspace.todayPath, 'utf-8')).toContain('- 用户今天在 gateway 里接入微信。')
    expect(writes).toEqual(['memory/2026-06-27.md'])
    expect(statusMutations.length).toBeGreaterThan(0)
    expect(diagnostics).toContainEqual({
      operation: 'model-classify',
      stage: 'request',
      status: 'started',
    })
    expect(diagnostics).toContainEqual({
      operation: 'after-assistant-response',
      stage: 'finish',
      status: 'ok',
    })
  })

  it('applies graph delete and duplicate decision plans inside the runtime', async () => {
    const workspace = makeWorkspace()
    const user = ensureUserSelfEntity(workspace)
    const project = upsertGraphEntity(workspace, {
      entityType: 'project',
      name: 'Headless Runtime',
      confidence: 0.9,
      source: 'test',
    }).entity
    const target = await upsertGraphObservation(workspace, {
      entityId: user.id,
      kind: 'preference',
      slot: 'runtime',
      value: 'Use onething-runtime for reusable memory operations.',
      confidence: 0.9,
      source: 'test',
    })
    const duplicate = await upsertGraphObservation(workspace, {
      entityId: user.id,
      kind: 'preference',
      slot: 'runtime-detail',
      value: 'Reusable memory operations should live in onething-runtime.',
      confidence: 0.9,
      source: 'test',
    })

    const database = getDb(workspace)
    database.prepare(`
      INSERT INTO memory_possible_duplicates (id, kind, source_id, target_id, score, reason, status, created_at, updated_at)
      VALUES ('dup-observation', 'observation', ?, ?, 0.99, 'test duplicate', 'pending', 1, 1)
    `).run(duplicate.observation.id, target.observation.id)
    mergeGraphDuplicate(workspace, 'dup-observation')

    expect(listGraphObservations({ workspace, entityId: user.id })).toHaveLength(1)
    expect(getGraphAudit(workspace, target.observation.id).some(event => event.action === 'merge')).toBe(true)

    const relation = await upsertGraphRelation(workspace, {
      fromEntityId: user.id,
      relationType: 'works_on',
      toEntityId: project.id,
      confidence: 0.9,
      source: 'test',
    })
    const duplicateRelation = await upsertGraphRelation(workspace, {
      fromEntityId: user.id,
      relationType: 'contributes_to',
      toEntityId: project.id,
      confidence: 0.9,
      source: 'test',
    })
    database.prepare(`
      INSERT INTO memory_possible_duplicates (id, kind, source_id, target_id, score, reason, status, created_at, updated_at)
      VALUES ('dup-relation', 'relation', ?, ?, 0.98, 'ignored duplicate', 'pending', 1, 1)
    `).run(duplicateRelation.relation.id, relation.relation.id)
    ignoreGraphDuplicate(workspace, 'dup-relation')
    expect(database.prepare('SELECT status FROM memory_possible_duplicates WHERE id = ?').get('dup-relation')).toEqual({ status: 'ignored' })

    deleteGraphObservation(workspace, target.observation.id)
    expect(listGraphObservations({ workspace, entityId: user.id })).toHaveLength(0)
    expect(getGraphAudit(workspace, target.observation.id).some(event => event.action === 'delete')).toBe(true)
  })
})
