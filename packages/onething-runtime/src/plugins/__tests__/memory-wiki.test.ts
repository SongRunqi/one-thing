/**
 * 批 D —— 内置 memory 插件 v1(直写形态)。
 *
 * 验收面按"这个形态唯一会死的几种方式"排:
 *  - 写不进去而无人知道(未配置根偷偷写别处 / 追加吞行 / 错误被吞成成功);
 *  - 索引说谎(摘要没跟上、重写把别的主题弄丢);
 *  - 注入把热路径拖垮(每轮读盘、体积无顶);
 *  - 矛盾被抹掉(replaces 没留痕);
 *  - 播种覆盖用户手改的 SCHEMA。
 *
 * 存储层用的是**真的** `createCorePluginFiles`(批 A 的内核实现)——
 * 路径判据、O_APPEND、原子写、外根三道门都是生产那一份,不是替身。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCorePluginFiles, type CorePluginFiles } from '@onething/core/plugins'
import {
  ONETHING_MEMORY_INDEX_CACHE_TTL_MS,
  ONETHING_MEMORY_INDEX_FILE,
  ONETHING_MEMORY_INDEX_INJECTION_MAX_BYTES,
  ONETHING_MEMORY_INDEX_SUMMARY_ITEMS,
  ONETHING_MEMORY_MANIFEST,
  ONETHING_MEMORY_MAX_CONTENT_CHARS,
  ONETHING_MEMORY_QUERY_LOG_FILE,
  ONETHING_MEMORY_SCHEMA_FILE,
  buildOnethingMemoryIndexFragment,
  clampOnethingMemoryUtf8,
  condenseOnethingMemoryIndexItem,
  describeOnethingMemoryTopicProblem,
  formatOnethingMemoryDate,
  formatOnethingMemoryNoteLine,
  normalizeOnethingMemoryTopic,
  parseOnethingMemoryIndex,
  registerOnethingMemoryPlugin,
  renderOnethingMemoryIndex,
  selectOnethingMemoryTopics,
  tokenizeOnethingMemoryQuery,
  upsertOnethingMemoryIndexEntry,
  type OnethingMemoryPluginApi,
  type OnethingMemoryPromptContextFragment,
  type OnethingMemoryToolRegistration,
} from '../memory-wiki.js'

/* ── 夹具 ─────────────────────────────────────────────────────────────────── */

const tempRoots: string[] = []

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempRoots.push(dir)
  return dir
}

interface Harness {
  api: OnethingMemoryPluginApi
  files: CorePluginFiles
  homeRoot: string
  externalRoot: string | undefined
  setExternalRoot(next: string | undefined): void
  tools: Map<string, OnethingMemoryToolRegistration>
  provider(): OnethingMemoryPromptContextFragment | null
  fireSettingsChange(): void
  dispose(): void
  readCount(): number
  resetReadCount(): void
  now: { value: Date }
}

function createHarness(options: { external?: string | undefined } = {}): Harness {
  const homeRoot = makeTempDir('memory-home-')
  let externalRoot = options.external
  let reads = 0

  const real = createCorePluginFiles({
    pluginId: 'memory-wiki',
    homeRoot,
    externalRootDeclared: true,
    resolveExternalRoot: () => externalRoot,
  })
  // 读盘计数器 —— "注入不放大盘读"这条验收需要能数。
  const files: CorePluginFiles = {
    ...real,
    readText(relPath, opts) {
      reads += 1
      return real.readText(relPath, opts)
    },
  }

  const tools = new Map<string, OnethingMemoryToolRegistration>()
  let promptProvider: ((ctx: { sessionId?: string; agentId?: string }) => OnethingMemoryPromptContextFragment | null) | undefined
  let settingsCallback: (() => void) | undefined
  const disposers: Array<() => void> = []
  const now = { value: new Date('2026-08-12T09:00:00') }

  const api: OnethingMemoryPluginApi = {
    id: 'memory-wiki',
    registerTool(tool) { tools.set(tool.name, tool) },
    registerPromptContextProvider(_id, provider) { promptProvider = provider },
    storage: { files },
    settings: {
      onChange(callback) {
        settingsCallback = () => callback({})
        return () => { settingsCallback = undefined }
      },
    },
    onDispose(callback) { disposers.push(callback) },
  }

  registerOnethingMemoryPlugin(api, { now: () => now.value, logger: { warn: () => {} } })

  return {
    api,
    files,
    homeRoot,
    get externalRoot() { return externalRoot },
    setExternalRoot(next) { externalRoot = next },
    tools,
    provider: () => promptProvider?.({ sessionId: 's1' }) ?? null,
    fireSettingsChange: () => settingsCallback?.(),
    dispose: () => { for (const fn of disposers.splice(0)) fn() },
    readCount: () => reads,
    resetReadCount: () => { reads = 0 },
    now,
  }
}

async function write(
  harness: Harness,
  args: { topic: string; content: string; replaces?: string },
  ctx: { agentId?: string } = {},
) {
  const tool = harness.tools.get('memory_write')!
  return tool.execute(args, { sessionId: 's1', messageId: 'm1', toolCallId: 't1', ...ctx })
}

async function query(harness: Harness, q: string) {
  const tool = harness.tools.get('memory_query')!
  return tool.execute({ query: q }, { sessionId: 's1', messageId: 'm1', toolCallId: 't1' })
}

function readExternal(root: string, rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf-8')
}

afterEach(() => {
  for (const dir of tempRoots.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

/* ── manifest ─────────────────────────────────────────────────────────────── */

describe('memory manifest —— 声明面即能力面', () => {
  it('id 是两个词 —— 单词 "memory" 当命名空间 token 会让子串守卫永久假红', () => {
    expect(ONETHING_MEMORY_MANIFEST.name).toBe('memory-wiki')
  })

  it('只要外根一条权限:不读历史、不投递、不调模型', () => {
    expect(ONETHING_MEMORY_MANIFEST.contributes.permissions).toEqual(['storage:external-root'])
  })

  it('目录字段是 directory-pick 且不预填(目录是用户的)', () => {
    const field = ONETHING_MEMORY_MANIFEST.contributes.settings.schema.properties.wikiRoot
    expect(field.format).toBe('directory-pick')
    expect((field as { default?: unknown }).default).toBeUndefined()
  })
})

/* ── 纯函数 ───────────────────────────────────────────────────────────────── */

describe('topic 判据', () => {
  it('归一化:去 .md、去首尾斜杠、并掉重复斜杠', () => {
    expect(normalizeOnethingMemoryTopic('/projects/onething.md')).toBe('projects/onething')
    expect(normalizeOnethingMemoryTopic('people//张三/')).toBe('people/张三')
    expect(normalizeOnethingMemoryTopic('  preferences  ')).toBe('preferences')
    expect(normalizeOnethingMemoryTopic(42)).toBe('')
  })

  it('合法主题放行(含中文与分层)', () => {
    expect(describeOnethingMemoryTopicProblem('projects/onething')).toBeNull()
    expect(describeOnethingMemoryTopicProblem('people/张三')).toBeNull()
  })

  it('穿越、绝对路径、空、超长、索引分隔符一律拒', () => {
    expect(describeOnethingMemoryTopicProblem('')).toMatch(/不能为空/)
    expect(describeOnethingMemoryTopicProblem('../etc/passwd')).not.toBeNull()
    expect(describeOnethingMemoryTopicProblem('a'.repeat(200))).toMatch(/太长/)
    expect(describeOnethingMemoryTopicProblem('projects — 别的')).toMatch(/索引行/)
    // 逐段判据(Windows 保留名 / ADS)也在这条路上。
    expect(describeOnethingMemoryTopicProblem('notes/CON')).not.toBeNull()
    expect(describeOnethingMemoryTopicProblem('notes/a:b')).not.toBeNull()
  })
})

describe('便签成行', () => {
  it('普通形态:一条事实 + 日期', () => {
    expect(formatOnethingMemoryNoteLine({ content: '喜欢深色主题', date: '2026-08-12' }))
      .toBe('- 喜欢深色主题(2026-08-12)')
  })

  it('留痕形态:新事实在前,旧事实与更正日期在书名号里', () => {
    expect(formatOnethingMemoryNoteLine({
      content: '现在用 bun',
      replaces: '用 npm',
      date: '2026-08-12',
    })).toBe('- 现在用 bun〈此前:用 npm,2026-08-12〉')
  })

  it('有 agent 才带来源尾巴', () => {
    expect(formatOnethingMemoryNoteLine({ content: 'x', date: '2026-08-12', agentId: 'coder' }))
      .toBe('- x(2026-08-12) (agent:coder)')
    expect(formatOnethingMemoryNoteLine({ content: 'x', date: '2026-08-12' })).not.toMatch(/agent:/)
  })

  it('正文里的换行折成空格 —— 一条便签必须是一行', () => {
    const line = formatOnethingMemoryNoteLine({ content: 'a\nb\n\nc', date: '2026-08-12' })
    expect(line).toBe('- a b c(2026-08-12)')
    expect(line.includes('\n')).toBe(false)
  })

  it('日期是本地时区的 YYYY-MM-DD', () => {
    expect(formatOnethingMemoryDate(new Date(2026, 7, 2, 23, 30))).toBe('2026-08-02')
  })
})

describe('索引:解析 / 合并 / 重写', () => {
  it('往返:解析后重写形状稳定', () => {
    const raw = renderOnethingMemoryIndex({
      entries: [{ topic: 'a/b', items: ['一', '二'] }, { topic: 'c', items: [] }],
    })
    expect(parseOnethingMemoryIndex(raw).entries).toEqual([
      { topic: 'a/b', items: ['一', '二'] },
      { topic: 'c', items: [] },
    ])
  })

  it('摘要只留最后 N 条(不回头读主题正文就能推出下一版)', () => {
    let index = parseOnethingMemoryIndex('')
    for (const item of ['1', '2', '3', '4', '5']) {
      index = upsertOnethingMemoryIndexEntry(index, 'topic', item)
    }
    expect(index.entries).toHaveLength(1)
    expect(index.entries[0].items).toEqual(['3', '4', '5'])
    expect(index.entries[0].items).toHaveLength(ONETHING_MEMORY_INDEX_SUMMARY_ITEMS)
  })

  it('新主题追加在后面,老主题原地更新,别的主题一条不丢', () => {
    let index = upsertOnethingMemoryIndexEntry({ entries: [] }, 'a', 'x')
    index = upsertOnethingMemoryIndexEntry(index, 'b', 'y')
    index = upsertOnethingMemoryIndexEntry(index, 'a', 'z')
    expect(index.entries.map(entry => entry.topic)).toEqual(['a', 'b'])
    expect(index.entries[0].items).toEqual(['x', 'z'])
  })

  it('要点里的分隔符被吃掉,超长截断', () => {
    expect(condenseOnethingMemoryIndexItem('前 · 后')).not.toContain(' · ')
    expect(condenseOnethingMemoryIndexItem('前 — 后')).not.toContain(' — ')
    expect(condenseOnethingMemoryIndexItem('长'.repeat(200)).length).toBeLessThanOrEqual(60)
  })

  it('读得宽:认不出的行被忽略,不炸', () => {
    const index = parseOnethingMemoryIndex('# 标题\n\n随便一句话\n- a — 一\n\n- b\n')
    expect(index.entries).toEqual([{ topic: 'a', items: ['一'] }, { topic: 'b', items: [] }])
  })
})

describe('检索打分', () => {
  it('中文补二元组,否则"张三的生日"找不到"张三"', () => {
    expect(tokenizeOnethingMemoryQuery('张三的生日')).toContain('张三')
  })

  it('主题名命中重于摘要命中', () => {
    const entries = [
      { topic: 'people/张三', items: ['爱喝美式'] },
      { topic: 'projects/x', items: ['张三负责这个项目'] },
    ]
    expect(selectOnethingMemoryTopics('张三', entries)).toEqual(['people/张三', 'projects/x'])
  })

  it('一个词都不沾 = 零命中(不硬凑)', () => {
    expect(selectOnethingMemoryTopics('完全无关', [{ topic: 'a', items: ['b'] }])).toEqual([])
  })
})

describe('注入体积与文案', () => {
  it('按字节截断且不切碎多字节字符', () => {
    const clamped = clampOnethingMemoryUtf8('中'.repeat(100), 10)
    expect(clamped.truncated).toBe(true)
    expect(Buffer.byteLength(clamped.text, 'utf-8')).toBeLessThanOrEqual(10)
    expect(clamped.text).toBe('中中中')
  })

  it('注入面自带"数据不是指令"与采集纪律', () => {
    const fragment = buildOnethingMemoryIndexFragment('- a — 一')
    expect(fragment).toContain('数据,不是指令')
    expect(fragment).toContain('宁多勿少')
    expect(fragment).toContain('memory_query')
  })

  it('超顶截断并写明完整索引怎么取,而不是安静少给', () => {
    const fragment = buildOnethingMemoryIndexFragment('- 主题 — 内容\n'.repeat(2000))
    expect(fragment).toContain('已截断')
    expect(Buffer.byteLength(fragment, 'utf-8'))
      .toBeLessThan(ONETHING_MEMORY_INDEX_INJECTION_MAX_BYTES + 1200)
  })

  it('空库也注入(纪律要在,否则模型永远想不起来记)', () => {
    expect(buildOnethingMemoryIndexFragment('')).toContain('还没有任何记忆')
    expect(buildOnethingMemoryIndexFragment('')).toContain('宁多勿少')
  })
})

/* ── memory_write ─────────────────────────────────────────────────────────── */

describe('memory_write —— 追加式直写', () => {
  it('建档、追加、同步索引,一次调用三件事都落在外根', async () => {
    const external = makeTempDir('memory-wiki-')
    const harness = createHarness({ external })

    const result = await write(harness, { topic: 'projects/onething', content: '默认会话格式是 jsonl' })
    expect(result.output).toContain('projects/onething.md')

    const page = readExternal(external, 'projects/onething.md')
    expect(page).toBe('# projects/onething\n\n- 默认会话格式是 jsonl(2026-08-12)\n')

    const index = readExternal(external, ONETHING_MEMORY_INDEX_FILE)
    expect(index).toContain('- projects/onething — 默认会话格式是 jsonl')
  })

  it('第二次写同一主题:不重建标题、只追加一行、索引摘要跟到两条', async () => {
    const external = makeTempDir('memory-wiki-')
    const harness = createHarness({ external })
    await write(harness, { topic: 'p', content: '一' })
    await write(harness, { topic: 'p', content: '二' })

    const page = readExternal(external, 'p.md')
    expect(page.split('\n').filter(line => line.startsWith('# '))).toHaveLength(1)
    expect(page.split('\n').filter(line => line.startsWith('- '))).toHaveLength(2)
    expect(readExternal(external, ONETHING_MEMORY_INDEX_FILE)).toContain('- p — 一 · 二')
  })

  it('并发追加不吞行(O_APPEND 的命根)', async () => {
    const external = makeTempDir('memory-wiki-')
    const harness = createHarness({ external })
    await write(harness, { topic: 'p', content: 'seed' })

    await Promise.all(
      Array.from({ length: 20 }, (_, i) => write(harness, { topic: 'p', content: `并发${i}` })),
    )
    const lines = readExternal(external, 'p.md').split('\n').filter(line => line.startsWith('- '))
    expect(lines).toHaveLength(21)
    expect(new Set(lines).size).toBe(21)
  })

  it('replaces 留痕:旧行原地不动,新行带〈此前:…〉', async () => {
    const external = makeTempDir('memory-wiki-')
    const harness = createHarness({ external })
    await write(harness, { topic: 'p', content: '用 npm' })
    await write(harness, { topic: 'p', content: '改用 bun', replaces: '用 npm' })

    const page = readExternal(external, 'p.md')
    expect(page).toContain('- 用 npm(2026-08-12)')
    expect(page).toContain('- 改用 bun〈此前:用 npm,2026-08-12〉')
  })

  it('agentId 透传进便签来源', async () => {
    const external = makeTempDir('memory-wiki-')
    const harness = createHarness({ external })
    await write(harness, { topic: 'p', content: 'x' }, { agentId: 'researcher' })
    expect(readExternal(external, 'p.md')).toContain('(agent:researcher)')
  })

  it('未配置记忆目录:结构化拒绝,而且一个字节都不写进家目录兜底', async () => {
    const harness = createHarness({ external: undefined })
    const result = await write(harness, { topic: 'p', content: 'x' })

    expect(result.output).toContain('记忆目录还没配置')
    expect(result.output).toContain('设置')
    // 兜底写家目录 = 将来搬家时记忆散在两处。这里必须干净。
    expect(harness.files.list()).toEqual([])
  })

  it('非法 topic / 空 content / 超长 content 一律结构化拒绝(不抛)', async () => {
    const external = makeTempDir('memory-wiki-')
    const harness = createHarness({ external })

    expect((await write(harness, { topic: '../escape', content: 'x' })).output).toContain('topic 不合法')
    expect((await write(harness, { topic: 'p', content: '   ' })).output).toContain('content 不能为空')
    expect((await write(harness, { topic: 'p', content: 'x'.repeat(ONETHING_MEMORY_MAX_CONTENT_CHARS + 1) })).output)
      .toContain('content 太长')
    // 一条都没落地。
    expect(fs.existsSync(path.join(external, 'p.md'))).toBe(false)
  })
})

/* ── memory_query ─────────────────────────────────────────────────────────── */

describe('memory_query —— 纯文本检索 + 命中流水', () => {
  it('命中主题返回正文,并记一行流水到插件家目录(不污染 wiki)', async () => {
    const external = makeTempDir('memory-wiki-')
    const harness = createHarness({ external })
    await write(harness, { topic: 'people/张三', content: '喝美式,不加糖' })
    await write(harness, { topic: 'projects/x', content: '下周上线' })

    const result = await query(harness, '张三')
    expect(result.output).toContain('people/张三')
    expect(result.output).toContain('喝美式')
    expect(result.output).not.toContain('下周上线')

    const log = harness.files.readText(ONETHING_MEMORY_QUERY_LOG_FILE)!
    const record = JSON.parse(log.trim().split('\n').at(-1)!)
    expect(record).toMatchObject({ query: '张三', hits: ['people/张三'], date: '2026-08-12' })
    // 流水不进用户的 wiki。
    expect(fs.existsSync(path.join(external, ONETHING_MEMORY_QUERY_LOG_FILE))).toBe(false)
  })

  it('未命中:回索引让模型自己挑,流水记 hits: []', async () => {
    const external = makeTempDir('memory-wiki-')
    const harness = createHarness({ external })
    await write(harness, { topic: 'p', content: '一' })

    const result = await query(harness, '完全不相干的东西')
    expect(result.output).toContain('没有主题命中')
    expect(result.output).toContain('- p —')

    const record = JSON.parse(harness.files.readText(ONETHING_MEMORY_QUERY_LOG_FILE)!.trim().split('\n').at(-1)!)
    expect(record.hits).toEqual([])
  })

  it('空库据实相告', async () => {
    const external = makeTempDir('memory-wiki-')
    const harness = createHarness({ external })
    expect((await query(harness, '任何')).output).toContain('还是空的')
  })

  it('未配置根同样是结构化拒绝', async () => {
    const harness = createHarness({ external: undefined })
    expect((await query(harness, 'x')).output).toContain('记忆目录还没配置')
  })
})

/* ── 注入缓存 ─────────────────────────────────────────────────────────────── */

describe('索引注入 —— 只读内存缓存', () => {
  it('注入的是索引,角色 developer', async () => {
    const external = makeTempDir('memory-wiki-')
    const harness = createHarness({ external })
    await write(harness, { topic: 'p', content: '一条事实' })

    const fragment = harness.provider()!
    expect(fragment.role).toBe('developer')
    expect(fragment.source).toBe('memory-index')
    expect(fragment.content).toContain('- p — 一条事实')
  })

  it('热路径不放大盘读:连叫 5 次只读一次盘', async () => {
    const external = makeTempDir('memory-wiki-')
    const harness = createHarness({ external })
    await write(harness, { topic: 'p', content: '一' })

    harness.resetReadCount()
    for (let i = 0; i < 5; i += 1) harness.provider()
    expect(harness.readCount()).toBe(1)
  })

  it('写后失效:下一次注入看得见新主题', async () => {
    const external = makeTempDir('memory-wiki-')
    const harness = createHarness({ external })
    await write(harness, { topic: 'a', content: '一' })
    expect(harness.provider()!.content).not.toContain('- b —')

    await write(harness, { topic: 'b', content: '二' })
    expect(harness.provider()!.content).toContain('- b —')
  })

  it('TTL 到点后重读一次 —— SCHEMA 承诺的"手改随时欢迎"要兑现', async () => {
    const external = makeTempDir('memory-wiki-')
    const harness = createHarness({ external })
    await write(harness, { topic: 'a', content: '一' })
    harness.provider()

    // 用户在别的编辑器里手改了索引。
    fs.writeFileSync(path.join(external, ONETHING_MEMORY_INDEX_FILE), '# 记忆索引\n\n- 手改的 — 内容\n')
    harness.resetReadCount()
    expect(harness.provider()!.content).not.toContain('手改的')
    expect(harness.readCount()).toBe(0)

    harness.now.value = new Date(harness.now.value.getTime() + ONETHING_MEMORY_INDEX_CACHE_TTL_MS + 1)
    expect(harness.provider()!.content).toContain('手改的')
    expect(harness.readCount()).toBe(1)
  })

  it('2KB 硬顶:索引再大,注入也不超顶', async () => {
    const external = makeTempDir('memory-wiki-')
    const harness = createHarness({ external })
    for (let i = 0; i < 120; i += 1) {
      await write(harness, { topic: `topic-${i}`, content: `这是第 ${i} 条足够长的事实,用来把索引撑过注入上限` })
    }
    const fragment = harness.provider()!
    expect(fragment.content).toContain('已截断')
    expect(Buffer.byteLength(fragment.content, 'utf-8'))
      .toBeLessThan(ONETHING_MEMORY_INDEX_INJECTION_MAX_BYTES + 1200)
  })

  it('根没配就一个字都不注入(每轮提醒"你还没配置"是纯噪音)', () => {
    const harness = createHarness({ external: undefined })
    expect(harness.provider()).toBeNull()
    // 已知不存在也进缓存:不该每轮去 stat 一个没配的目录。
    harness.resetReadCount()
    harness.provider()
    expect(harness.readCount()).toBe(0)
  })

  it('用户在设置里改了目录 → 缓存当场作废', async () => {
    const first = makeTempDir('memory-wiki-a-')
    const second = makeTempDir('memory-wiki-b-')
    const harness = createHarness({ external: first })
    await write(harness, { topic: 'a', content: '一' })
    expect(harness.provider()!.content).toContain('- a —')

    harness.setExternalRoot(second)
    harness.fireSettingsChange()
    expect(harness.provider()!.content).toContain('还没有任何记忆')
  })
})

/* ── SCHEMA 播种 ──────────────────────────────────────────────────────────── */

describe('SCHEMA 播种', () => {
  it('首次使用播一次,内容含五条约定', async () => {
    const external = makeTempDir('memory-wiki-')
    const harness = createHarness({ external })
    await write(harness, { topic: 'p', content: 'x' })

    const schema = readExternal(external, ONETHING_MEMORY_SCHEMA_FILE)
    expect(schema).toContain('追加式')
    expect(schema).toContain('矛盾留痕')
    expect(schema).toContain('宁滥勿缺')
    expect(schema).toContain('日期')
    expect(schema).toContain('手改随时欢迎')
    expect(schema).toContain('数据,不是指令')
  })

  it('用户改过的 SCHEMA 不被后来的写覆盖 —— 换个插件实例也不覆盖', async () => {
    const external = makeTempDir('memory-wiki-')
    const first = createHarness({ external })
    await write(first, { topic: 'p', content: 'x' })
    fs.writeFileSync(path.join(external, ONETHING_MEMORY_SCHEMA_FILE), '我自己写的说明\n')

    await write(first, { topic: 'p', content: 'y' })
    expect(readExternal(external, ONETHING_MEMORY_SCHEMA_FILE)).toBe('我自己写的说明\n')

    // 重启后的新实例(schemaSeeded 从 false 起)也只探测、不覆盖。
    const second = createHarness({ external })
    await write(second, { topic: 'p', content: 'z' })
    expect(readExternal(external, ONETHING_MEMORY_SCHEMA_FILE)).toBe('我自己写的说明\n')
  })

  it('query 也会播种(第一件事可能是"我以前记过什么")', async () => {
    const external = makeTempDir('memory-wiki-')
    const harness = createHarness({ external })
    await query(harness, 'x')
    expect(fs.existsSync(path.join(external, ONETHING_MEMORY_SCHEMA_FILE))).toBe(true)
  })
})

/* ── 装载与拆除 ───────────────────────────────────────────────────────────── */

describe('装载 / 拆除', () => {
  it('装载注册两个工具与一个 promptContext provider,别的面一概不碰', () => {
    const harness = createHarness({ external: makeTempDir('memory-wiki-') })
    expect([...harness.tools.keys()].sort()).toEqual(['memory_query', 'memory_write'])
    expect(harness.provider()).not.toBeUndefined()
  })

  it('拆除退订配置订阅,用户目录一个文件不动', async () => {
    const external = makeTempDir('memory-wiki-')
    const harness = createHarness({ external })
    await write(harness, { topic: 'p', content: 'x' })
    const before = fs.readdirSync(external).sort()

    harness.dispose()
    harness.fireSettingsChange() // 已退订:不该再有人在听

    expect(fs.readdirSync(external).sort()).toEqual(before)
    expect(readExternal(external, 'p.md')).toContain('- x(2026-08-12)')
  })
})
