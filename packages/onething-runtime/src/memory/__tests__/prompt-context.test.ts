import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addHermesMemoryEntry } from '../hermes-file-memory.js'
import { buildSoulMemoryPromptContext } from '../prompt-context.js'
import type { MemoryWorkspace, ResolvedSoulMemorySettings } from '../types.js'
import { dateStringDaysAgo } from '../workspace.js'

const tempDirs: string[] = []

function makeSettings(overrides: Partial<ResolvedSoulMemorySettings> = {}): ResolvedSoulMemorySettings {
  return {
    enabled: true,
    directoryMode: 'custom',
    customDirectory: '',
    bootstrapMaxChars: 2000,
    activeMemory: {
      enabled: true,
      queryMode: 'recent',
      promptStyle: 'balanced',
      timeoutMs: 1000,
      cacheTtlMs: 1000,
      maxSummaryChars: 1000,
      recentUserTurns: 3,
      recentAssistantTurns: 3,
      recentUserChars: 1000,
      recentAssistantChars: 1000,
      circuitBreakerMaxTimeouts: 3,
      circuitBreakerCooldownMs: 1000,
    },
    search: {
      enabled: true,
      chunkTokens: 500,
      chunkOverlap: 80,
      maxResults: 5,
      mmrEnabled: false,
      temporalDecayHalfLifeDays: 30,
    },
    embeddings: {
      enabled: false,
      providerId: 'auto',
      customProviderId: '',
      apiKey: '',
      model: '',
      baseUrl: '',
      dimensions: 0,
    },
    memoryFlush: {
      enabled: false,
      maxInputChars: 4000,
    },
    capture: {
      enabled: false,
      mode: 'off',
      maxInputChars: 4000,
      timeoutMs: 1000,
    },
    review: {
      enabled: false,
      interval: 10,
      maxInputChars: 4000,
      timeoutMs: 1000,
      maxCandidates: 10,
      minConfidence: 0.7,
    },
    canonicalMemory: {
      enabled: false,
      store: 'sqlite',
      highConfidenceThreshold: 0.85,
      semanticDedupeThreshold: 0.9,
    },
    dreaming: {
      enabled: false,
      frequency: '0 3 * * *',
      timezone: 'UTC',
      model: '',
      sources: ['daily'],
      lookbackDays: 7,
      maxSourceFiles: 10,
      maxSessions: 0,
      maxMessagesPerSession: 0,
      maxInputChars: 4000,
      maxPromotions: 5,
      minScore: 0.8,
      minRecallCount: 1,
      minUniqueSources: 1,
      timeoutMs: 1000,
    },
    dailyContext: {
      enabled: true,
      mode: 'always',
      daysBack: 0,
      maxChars: 1000,
    },
    read: {
      defaultLines: 80,
      maxLines: 400,
    },
    logging: {
      enabled: false,
      retentionDays: 7,
      level: 'info',
      maxPreviewChars: 200,
      includeHttpErrorBody: false,
    },
    ...overrides,
  }
}

function makeWorkspace(settings = makeSettings()): MemoryWorkspace {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-memory-prompt-context-'))
  tempDirs.push(root)
  const memoryDir = path.join(root, 'memory')
  fs.mkdirSync(memoryDir, { recursive: true })

  return {
    settings,
    agentId: 'default',
    root,
    memoryDir,
    soulPath: path.join(root, 'SOUL.md'),
    userPath: path.join(root, 'USER.md'),
    memoryPath: path.join(root, 'MEMORY.md'),
    dreamsPath: path.join(root, 'DREAMS.md'),
    todayPath: path.join(memoryDir, `${dateStringDaysAgo(0)}.md`),
    dbPath: path.join(root, 'memory.sqlite'),
  }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('runtime soul-memory prompt context', () => {
  it('assembles SOUL, Hermes, daily context, and active recall fragments', async () => {
    const workspace = makeWorkspace()
    fs.writeFileSync(workspace.soulPath, '# SOUL.md\n\n用户喜欢直接看实现结论。\n')
    fs.writeFileSync(workspace.todayPath, '- 今天推进了 gateway 接入 onething runtime。\n')
    await addHermesMemoryEntry({
      workspace,
      target: 'user',
      content: '用户喜欢具体实现细节。',
    })
    await addHermesMemoryEntry({
      workspace,
      target: 'memory',
      content: 'Gateway conversation uses the onething runtime.',
    })

    const fragments = await buildSoulMemoryPromptContext({
      workspace,
      sessionId: 'session-1',
      userTurnCount: 3,
      activeMemory: () => 'Active recall: gateway should not own an AgentEngine.',
    })

    const sources = fragments.map(fragment => fragment.source)
    const content = fragments.map(fragment => fragment.content).join('\n')

    expect(sources).toContain('memory/soul-memory-rules')
    expect(sources).toContain('plugins/soul-memory/SOUL.md')
    expect(sources).toContain('plugins/soul-memory/hermes-file-memory')
    expect(sources).toContain('plugins/soul-memory/recent-daily-memory')
    expect(sources).toContain('plugins/soul-memory/active-memory')
    expect(content).toContain('# Soul Memory Rules')
    expect(content).toContain('用户喜欢直接看实现结论')
    expect(content).toContain('用户喜欢具体实现细节')
    expect(content).toContain('Gateway conversation uses the onething runtime')
    expect(content).toContain('今天推进了 gateway 接入 onething runtime')
    expect(content).toContain('<active_memory_plugin>')
  })

  it('does not resolve prompt fragments when soul-memory is disabled', async () => {
    const activeMemory = vi.fn(() => 'should not be called')
    const workspace = makeWorkspace(makeSettings({ enabled: false }))

    await expect(buildSoulMemoryPromptContext({
      workspace,
      sessionId: 'session-1',
      activeMemory,
    })).resolves.toEqual([])
    expect(activeMemory).not.toHaveBeenCalled()
  })
})
