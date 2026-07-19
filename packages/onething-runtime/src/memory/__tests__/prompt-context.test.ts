import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
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
    capture: {
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
  it('assembles rules, SOUL, and Hermes file-memory fragments', async () => {
    const workspace = makeWorkspace()
    fs.writeFileSync(workspace.soulPath, '# SOUL.md\n\n用户喜欢直接看实现结论。\n')
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
    })

    const sources = fragments.map(fragment => fragment.source)
    const content = fragments.map(fragment => fragment.content).join('\n')

    expect(sources).toContain('memory/soul-memory-rules')
    expect(sources).toContain('plugins/soul-memory/SOUL.md')
    expect(sources).toContain('plugins/soul-memory/hermes-file-memory')
    expect(content).toContain('# Soul Memory Rules')
    expect(content).toContain('用户喜欢直接看实现结论')
    expect(content).toContain('用户喜欢具体实现细节')
    expect(content).toContain('Gateway conversation uses the onething runtime')
  })

  it('does not resolve prompt fragments when soul-memory is disabled', async () => {
    const workspace = makeWorkspace(makeSettings({ enabled: false }))

    await expect(buildSoulMemoryPromptContext({
      workspace,
      sessionId: 'session-1',
    })).resolves.toEqual([])
  })
})
