import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDefaultSettings, normalizeSoulMemorySettings } from '../../../../shared/defaults/settings.js'
import { HERMES_MEMORY_DELIMITER } from '../../../memory/hermes-file-memory.js'
import type { MemoryWorkspace, ResolvedSoulMemorySettings } from '../../../memory/types.js'
import { __testing } from '../soul-memory.js'

const tempDirs: string[] = []

function localDateString(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function makeWorkspace(
  soulMemory: Partial<ResolvedSoulMemorySettings> = {},
  root = path.join('/tmp', 'soul-memory-capture-test'),
): MemoryWorkspace {
  return {
    settings: normalizeSoulMemorySettings(soulMemory as any) as ResolvedSoulMemorySettings,
    agentId: 'default',
    root,
    memoryDir: path.join(root, 'memory'),
    soulPath: path.join(root, 'SOUL.md'),
    userPath: path.join(root, 'USER.md'),
    memoryPath: path.join(root, 'MEMORY.md'),
    dreamsPath: path.join(root, 'DREAMS.md'),
    todayPath: path.join(root, 'memory', '2026-06-16.md'),
    dbPath: path.join(root, 'plugin-data', 'soul-memory.sqlite'),
  }
}

afterEach(async () => {
  __testing.closeIndexWatcherForTesting()
  await Promise.all(tempDirs.splice(0).map(dir => fsp.rm(dir, { recursive: true, force: true })))
})

describe('soul memory capture routing', () => {
  it('uses action JSON for capture and markdown bullets for flush extraction', () => {
    expect(__testing.memoryCaptureSystemPrompt).not.toBe(__testing.dailyNoteExtractionSystemPrompt)
    expect(__testing.memoryCaptureSystemPrompt).toContain('Return compact JSON only')
    expect(__testing.memoryCaptureSystemPrompt).toContain('"action":"add|replace|remove"')
    expect(__testing.memoryCaptureSystemPrompt).toContain('oldText must copy the exact existing bullet line')
    expect(__testing.memoryFlushSystemPrompt).toBe(__testing.dailyNoteExtractionSystemPrompt)
    expect(__testing.dailyNoteExtractionSystemPrompt).toContain('what did the user do')
    expect(__testing.dailyNoteExtractionSystemPrompt).toContain('Do not emit any candidate intended for short-term.jsonl')
    expect(__testing.dailyNoteExtractionSystemPrompt).toContain('Return markdown bullets only')
    expect(__testing.dailyNoteExtractionSystemPrompt).toContain('"给我讲讲 Go 的 array" becomes "用户今天学习了 Go array。"')
    expect(__testing.dailyNoteExtractionSystemPrompt).not.toContain('关注数组语法/与 slice 的区别')
    expect(__testing.dailyNoteExtractionSystemPrompt).not.toContain('Return compact JSON')
    expect(__testing.dailyNoteExtractionSystemPrompt).not.toContain('entityType')
    expect(__testing.dailyNoteExtractionSystemPrompt).not.toContain('entityName')
    expect(__testing.dailyNoteExtractionSystemPrompt).not.toContain('relationType')
    expect(__testing.dailyNoteExtractionSystemPrompt).not.toContain('memoryKey')
  })

  it('uses daily notes only for dreaming memory action prompts', () => {
    expect(__testing.memoryDreamingSystemPrompt).toContain('Use only daily notes from memory/YYYY-MM-DD.md')
    expect(__testing.memoryDreamingSystemPrompt).toContain('Never use short-term signal files')
    expect(__testing.memoryDreamingSystemPrompt).toContain('Return compact JSON only')
    expect(__testing.memoryDreamingSystemPrompt).toContain('"action":"add|replace|remove"')
    expect(__testing.memoryDreamingSystemPrompt).toContain('oldText must copy exact existing MEMORY.md text')
    expect(__testing.memoryDreamingSystemPrompt).not.toContain('short-term capture signals')
    expect(__testing.memoryDreamingSystemPrompt).not.toContain('capped recent sessions')
    expect(__testing.memoryDreamingSystemPrompt).not.toContain('<durable_memory>')
    expect(__testing.memoryDreamingSystemPrompt).not.toContain('dream_report')
  })

  it('allows 10-turn review prompts to update SOUL.md and DREAMS.md', () => {
    expect(__testing.memoryReviewSystemPrompt).toContain('every fixed number of user turns')
    expect(__testing.memoryReviewSystemPrompt).toContain('SOUL.md, DREAMS.md, USER.md, and MEMORY.md')
    expect(__testing.memoryReviewSystemPrompt).toContain('"target":"soul|dreams|user|memory"')
    expect(__testing.memoryReviewSystemPrompt).toContain('promoted into SOUL.md')
  })

  it('uses the Tools provider/model for memory background model calls', () => {
    const settings = createDefaultSettings()
    settings.ai.provider = 'chat-provider' as any
    settings.ai.providers['chat-provider'] = {
      apiKey: 'chat-key',
      baseUrl: '',
      model: 'chat-model',
      selectedModels: ['chat-model'],
      enabled: true,
    }
    settings.ai.providers['tool-provider'] = {
      apiKey: 'tool-key',
      baseUrl: '',
      model: 'tool-default',
      selectedModels: ['tool-model'],
      enabled: true,
    }
    settings.tools.toolCallModel = {
      providerId: 'tool-provider',
      model: 'tool-model',
      thinking: false,
      thinkingEffort: 'medium',
    }

    const selection = __testing.resolveMemoryToolProviderSelection(settings)

    expect(selection).toMatchObject({
      providerId: 'tool-provider',
      model: 'tool-model',
      source: 'tool',
    })
    expect(selection.config.model).toBe('tool-model')
  })

  it('falls back to the chat default when Tools provider/model is not configured', () => {
    const settings = createDefaultSettings()
    settings.ai.provider = 'chat-provider' as any
    settings.ai.providers['chat-provider'] = {
      apiKey: 'chat-key',
      baseUrl: '',
      model: 'chat-model',
      selectedModels: ['chat-model'],
      enabled: true,
    }
    settings.tools.toolCallModel = {
      providerId: '',
      model: '',
      thinking: false,
      thinkingEffort: 'medium',
    }

    const selection = __testing.resolveMemoryToolProviderSelection(settings)

    expect(selection).toMatchObject({
      providerId: 'chat-provider',
      model: 'chat-model',
      source: 'default',
    })
  })

  it('treats NONE or JSON as no daily-note bullets', () => {
    expect(__testing.parseDailyNoteBullets('NONE')).toEqual([])
    expect(__testing.parseDailyNoteBullets('{"action":"none","explicit":false,"confidence":0.99,"candidates":[]}')).toEqual([])
  })

  it('rejects raw user request echoes from daily capture', () => {
    expect(__testing.parseDailyNoteBullets('- sdk怎么添加已经安装的java jdk？ idea里面安装的，brew安装的，等等？')).toEqual([])
  })

  it('keeps transformed daily learning notes instead of raw question echoes', () => {
    expect(__testing.parseDailyNoteBullets('- 用户今天学习了 Go array。')).toEqual(['用户今天学习了 Go array。'])
  })

  it('keeps transformed daily bug investigation notes', () => {
    expect(__testing.parseDailyNoteBullets('- 用户今天在 aikefu-bridge 排查 mvn compile 的 cannot find symbol 问题，错误集中在 Lombok getter 和 log 字段。')).toEqual([
      '用户今天在 aikefu-bridge 排查 mvn compile 的 cannot find symbol 问题，错误集中在 Lombok getter 和 log 字段。',
    ])
  })

  it('keeps transformed daily implementation work notes', () => {
    expect(__testing.parseDailyNoteBullets('- 用户今天在 IVA EMEA 0615 文档中实现并同步 FAC DNIS 映射规则：curl/config dnis 取 Type=FAC Outputs。')).toEqual([
      '用户今天在 IVA EMEA 0615 文档中实现并同步 FAC DNIS 映射规则：curl/config dnis 取 Type=FAC Outputs。',
    ])
  })

  it('keeps real user preferences while filtering request echoes', () => {
    expect(__testing.parseDailyNoteBullets('- 用户说：我讨厌模棱两可的说法')).toEqual(['用户说：我讨厌模棱两可的说法'])
  })

  it('deduplicates daily-note bullets from model output', () => {
    expect(__testing.parseDailyNoteBullets([
      '- 用户今天学习了 Go array。',
      '- 用户今天学习了 Go array。',
      '1. 用户今天排查了 Java SDK 配置问题。',
    ].join('\n'))).toEqual([
      '用户今天学习了 Go array。',
      '用户今天排查了 Java SDK 配置问题。',
    ])
  })

  it('parses add, replace, and remove capture actions from compact JSON', () => {
    const parsed = __testing.parseDailyNoteCaptureResult(JSON.stringify({
      action: 'capture',
      confidence: 0.88,
      memories: [
        {
          action: 'add',
          confidence: 0.9,
          content: '用户今天在 start-electron 清理了 capture 的旧配置。',
        },
        {
          action: 'replace',
          oldText: '- 用户问了 capture 设置。',
          newText: '用户今天确认 capture 应支持 add/replace/remove 三种 daily-note 动作。',
        },
        {
          action: 'remove',
          text: '- sdk怎么添加已经安装的java jdk？',
          sensitivity: 'normal',
        },
      ],
    }))

    expect(parsed?.confidence).toBe(0.88)
    expect(parsed?.candidates).toEqual([
      {
        action: 'add',
        confidence: 0.9,
        content: '用户今天在 start-electron 清理了 capture 的旧配置。',
      },
      {
        action: 'replace',
        confidence: 0.88,
        oldText: '- 用户问了 capture 设置。',
        newText: '用户今天确认 capture 应支持 add/replace/remove 三种 daily-note 动作。',
      },
      {
        action: 'remove',
        confidence: 0.88,
        text: '- sdk怎么添加已经安装的java jdk？',
      },
    ])
  })

  it('appends extracted capture content to the daily note without writing short-term signals', async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'soul-memory-daily-test-'))
    tempDirs.push(root)
    const settings = createDefaultSettings()
    settings.general.soulMemory = {
      ...settings.general.soulMemory,
      directoryMode: 'custom',
      customDirectory: root,
    }

    const target = await __testing.appendDailyNoteBullets({
      settings,
      bullets: ['用户今天在 aikefu-bridge 排查 mvn compile 的 cannot find symbol 问题。'],
      heading: '10:30:00',
    })

    expect(target?.relativePath).toMatch(/^memory\/\d{4}-\d{2}-\d{2}\.md$/)
    const daily = await fsp.readFile(target!.absolutePath, 'utf-8')
    expect(daily).toContain('## 10:30:00')
    expect(daily).toContain('- 用户今天在 aikefu-bridge 排查 mvn compile 的 cannot find symbol 问题。')
    await expect(fsp.stat(path.join(root, 'memory', '.dreams', 'short-term.jsonl'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('applies capture add, replace, and remove actions to the daily note', async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'soul-memory-daily-actions-test-'))
    tempDirs.push(root)
    const settings = createDefaultSettings()
    settings.general.soulMemory = {
      ...settings.general.soulMemory,
      directoryMode: 'custom',
      customDirectory: root,
    }
    const today = localDateString()
    const dailyPath = path.join(root, 'memory', `${today}.md`)
    await fsp.mkdir(path.dirname(dailyPath), { recursive: true })
    await fsp.writeFile(dailyPath, [
      `# ${today}`,
      '',
      '## 09:00:00',
      '',
      '- 用户问了 capture 设置。',
      '- sdk怎么添加已经安装的java jdk？',
      '',
    ].join('\n'), 'utf-8')

    const result = await __testing.applyDailyNoteCaptureActions({
      settings,
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
    })

    expect(result).toMatchObject({
      applied: 3,
      added: 1,
      replaced: 1,
      removed: 1,
      skipped: 0,
    })
    const daily = await fsp.readFile(dailyPath, 'utf-8')
    expect(daily).toContain('- 用户今天确认 capture 应支持 add/replace/remove 三种 daily-note 动作。')
    expect(daily).not.toContain('- 用户问了 capture 设置。')
    expect(daily).not.toContain('- sdk怎么添加已经安装的java jdk？')
    expect(daily).toContain('## 10:30:00')
    expect(daily).toContain('- 用户今天在 start-electron 实现 capture JSON action mutation。')
    await expect(fsp.stat(path.join(root, 'memory', '.dreams', 'short-term.jsonl'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('builds review input with SOUL.md and DREAMS.md context', async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'soul-memory-review-input-test-'))
    tempDirs.push(root)
    const workspace = makeWorkspace({}, root)
    await fsp.mkdir(root, { recursive: true })
    await fsp.writeFile(workspace.soulPath, '# SOUL.md\n\nKeep replies warm.\n', 'utf-8')
    await fsp.writeFile(workspace.dreamsPath, '# DREAMS.md\n\nMaybe promote concise examples.\n', 'utf-8')

    const input = await __testing.buildMemoryReviewInput({
      messages: [
        { id: 'u1', role: 'user', content: 'please be warmer', timestamp: 1 },
        { id: 'a1', role: 'assistant', content: 'got it', timestamp: 2 },
      ],
    } as any, workspace, 8000)

    expect(input).toContain('# Existing SOUL.md')
    expect(input).toContain('Keep replies warm.')
    expect(input).toContain('# Existing DREAMS.md')
    expect(input).toContain('Maybe promote concise examples.')
  })

  it('applies review add, replace, and remove actions to SOUL.md and DREAMS.md', async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'soul-memory-review-files-test-'))
    tempDirs.push(root)
    const workspace = makeWorkspace({}, root)
    await fsp.mkdir(root, { recursive: true })
    await fsp.writeFile(workspace.soulPath, [
      '# SOUL.md',
      '',
      'Keep replies formal.',
      'Remove stale voice.',
      '',
    ].join('\n'), 'utf-8')
    await fsp.writeFile(workspace.dreamsPath, [
      '# DREAMS.md',
      '',
      'Maybe be warmer later.',
      'Remove this dream.',
      '',
    ].join('\n'), 'utf-8')

    const results = []
    results.push(await __testing.applyMemoryReviewCandidate(workspace, {
      action: 'replace',
      target: 'soul',
      confidence: 0.9,
      oldText: 'Keep replies formal.',
      newText: 'Keep replies warm and precise.',
    }, 0.7))
    results.push(await __testing.applyMemoryReviewCandidate(workspace, {
      action: 'add',
      target: 'soul',
      confidence: 0.9,
      content: 'Prefer concise examples when they help.',
    }, 0.7))
    results.push(await __testing.applyMemoryReviewCandidate(workspace, {
      action: 'remove',
      target: 'soul',
      confidence: 0.9,
      text: 'Remove stale voice.',
    }, 0.7))
    results.push(await __testing.applyMemoryReviewCandidate(workspace, {
      action: 'replace',
      target: 'dreams',
      confidence: 0.9,
      oldText: 'Maybe be warmer later.',
      newText: 'Warmth preference was promoted into SOUL.md.',
    }, 0.7))
    results.push(await __testing.applyMemoryReviewCandidate(workspace, {
      action: 'add',
      target: 'dreams',
      confidence: 0.9,
      content: 'Watch for repeated requests about concrete examples.',
    }, 0.7))
    results.push(await __testing.applyMemoryReviewCandidate(workspace, {
      action: 'remove',
      target: 'dreams',
      confidence: 0.9,
      text: 'Remove this dream.',
    }, 0.7))

    expect(results.every(result => result.changed)).toBe(true)
    expect(results.map(result => result.relativePath)).toEqual([
      'SOUL.md',
      'SOUL.md',
      'SOUL.md',
      'DREAMS.md',
      'DREAMS.md',
      'DREAMS.md',
    ])
    const soul = await fsp.readFile(workspace.soulPath, 'utf-8')
    expect(soul).toContain('Keep replies warm and precise.')
    expect(soul).toContain('Prefer concise examples when they help.')
    expect(soul).not.toContain('Keep replies formal.')
    expect(soul).not.toContain('Remove stale voice.')

    const dreams = await fsp.readFile(workspace.dreamsPath, 'utf-8')
    expect(dreams).toContain('Warmth preference was promoted into SOUL.md.')
    expect(dreams).toContain('Watch for repeated requests about concrete examples.')
    expect(dreams).not.toContain('Maybe be warmer later.')
    expect(dreams).not.toContain('Remove this dream.')
  })

  it('collects dreaming sources only from daily notes', async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'soul-memory-dreaming-source-test-'))
    tempDirs.push(root)
    const workspace = makeWorkspace({
      dreaming: {
        sources: ['daily'],
        lookbackDays: 365,
        maxSourceFiles: 5,
      },
    } as any, root)
    const today = localDateString()
    await fsp.mkdir(path.join(root, 'memory', '.dreams'), { recursive: true })
    await fsp.writeFile(
      path.join(root, 'memory', `${today}.md`),
      `# ${today}\n\n- 用户明确偏好精确、不要模棱两可的解释。\n`,
      'utf-8',
    )
    await fsp.writeFile(
      path.join(root, 'memory', '.dreams', 'short-term.jsonl'),
      '{"content":"short-term source should not be used"}\n',
      'utf-8',
    )

    const result = await __testing.collectDreamingSources(workspace)

    expect(result.sources).toHaveLength(1)
    expect(result.sources[0]).toMatchObject({
      sourceType: 'daily',
      relativePath: `memory/${today}.md`,
    })
    expect(result.sources[0].content).toContain('用户明确偏好精确')
    expect(result.sources.map(source => source.relativePath)).not.toContain('memory/.dreams/short-term.jsonl')
  })

  it('parses add, replace, and remove dreaming actions from compact JSON', () => {
    const parsed = __testing.parseDreamingOutput(JSON.stringify({
      action: 'dream',
      confidence: 0.9,
      memories: [
        {
          action: 'add',
          confidence: 0.92,
          content: 'Project Alpha uses Bun for scripts.',
        },
        {
          action: 'replace',
          oldText: 'Project Alpha uses npm for scripts.',
          newText: 'Project Alpha uses Bun for scripts.',
        },
        {
          action: 'remove',
          text: 'Temporary troubleshooting note.',
        },
      ],
    }))

    expect(parsed.confidence).toBe(0.9)
    expect(parsed.candidates).toEqual([
      {
        action: 'add',
        confidence: 0.92,
        content: 'Project Alpha uses Bun for scripts.',
      },
      {
        action: 'replace',
        confidence: 0.9,
        oldText: 'Project Alpha uses npm for scripts.',
        newText: 'Project Alpha uses Bun for scripts.',
      },
      {
        action: 'remove',
        confidence: 0.9,
        text: 'Temporary troubleshooting note.',
      },
    ])
  })

  it('applies dreaming add, replace, and remove actions to MEMORY.md without writing DREAMS.md', async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'soul-memory-dreaming-test-'))
    tempDirs.push(root)
    const workspace = makeWorkspace({}, root)
    await fsp.mkdir(root, { recursive: true })
    await fsp.writeFile(workspace.memoryPath, [
      'Existing durable fact.',
      HERMES_MEMORY_DELIMITER.trim(),
      'Project Alpha uses npm for scripts.',
      HERMES_MEMORY_DELIMITER.trim(),
      'Temporary troubleshooting note.',
      HERMES_MEMORY_DELIMITER.trim(),
      '',
    ].join('\n'), 'utf-8')

    const memoryActions = await __testing.applyDreamingMemoryActions(workspace, {
      confidence: 0.9,
      memory: '',
      candidates: [
        {
          action: 'add',
          confidence: 0.95,
          content: 'User prefers precise, non-ambiguous explanations.',
        },
        {
          action: 'add',
          confidence: 0.95,
          content: 'Existing durable fact.',
        },
        {
          action: 'replace',
          confidence: 0.95,
          oldText: 'Project Alpha uses npm for scripts.',
          newText: 'Project Alpha uses Bun for scripts.',
        },
        {
          action: 'remove',
          confidence: 0.95,
          text: 'Temporary troubleshooting note.',
        },
      ],
    }, new Date('2026-06-16T03:00:00Z'))

    expect(memoryActions).toMatchObject({
      applied: 3,
      added: 1,
      replaced: 1,
      removed: 1,
      skipped: 1,
    })
    const memory = await fsp.readFile(workspace.memoryPath, 'utf-8')
    expect(memory).toContain('User prefers precise, non-ambiguous explanations.')
    expect(memory).toContain('Project Alpha uses Bun for scripts.')
    expect(memory).not.toContain('Project Alpha uses npm for scripts.')
    expect(memory).not.toContain('Temporary troubleshooting note.')
    expect(memory).toContain(HERMES_MEMORY_DELIMITER)
    await expect(fsp.stat(workspace.dreamsPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
