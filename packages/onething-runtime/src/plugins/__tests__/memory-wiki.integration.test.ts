/**
 * 批 D 集成 —— memory 插件跑在**真内核 api** 上。
 *
 * 上一份单测把 `api` 换成了替身(只有 files 是真的);这一份把 `createCorePluginAPI`
 * 整个装上:声明门、拆除闩、熔断分车道、`executeCorePluginTool` 的宿主执行路径
 * 全是生产那一份。它回答的是单测回答不了的三个问题:
 *
 *  1. manifest 里那行 `storage:external-root` **真的**是门(拿掉就写不进去);
 *  2. 走宿主执行路径(而不是直接调 execute)时,便签**真的**出现在临时外根里;
 *  3. 卸载之后晚到的写不会复活目录,而用户的 wiki 一个文件不少。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  PLUGIN_PERMISSION_STORAGE_EXTERNAL_ROOT,
  createCorePluginAPI,
  createCorePluginFiles,
  executeCorePluginTool,
} from '@onething/core/plugins'
import {
  ONETHING_MEMORY_INDEX_FILE,
  ONETHING_MEMORY_MANIFEST,
  ONETHING_MEMORY_SCHEMA_FILE,
  registerOnethingMemoryPlugin,
  type OnethingMemoryPluginApi,
} from '../memory-wiki.js'

const tempRoots: string[] = []

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempRoots.push(dir)
  return dir
}

interface RegisteredTool {
  name: string
  execute(args: unknown, ctx: unknown): Promise<{ title: string; output: string; metadata: object }>
}

function createRealApi(options: { external?: string; declared?: boolean } = {}) {
  const homeRoot = makeTempDir('memory-int-home-')
  const registered = new Map<string, RegisteredTool>()
  const providers = new Map<string, (ctx: unknown) => unknown>()
  let disposed = false

  const files = createCorePluginFiles({
    pluginId: 'memory-wiki',
    homeRoot,
    externalRootDeclared: options.declared ?? true,
    resolveExternalRoot: () => options.external,
    isDisposed: () => disposed,
  })

  const { api } = createCorePluginAPI<
    OnethingMemoryPluginApi,
    RegisteredTool,
    () => void,
    { name: string },
    object,
    (ctx: unknown) => unknown,
    () => void,
    () => void,
    () => [],
    object,
    object
  >({
    pluginId: 'memory-wiki',
    store: {},
    scheduler: {},
    files,
    declaredPermissions: [...ONETHING_MEMORY_MANIFEST.contributes.permissions],
    logger: { log: () => {}, error: () => {} },
    host: {
      registerTool: (_pluginId, _toolId, tool) => { registered.set(tool.name, tool) },
      subscribeEvent: () => () => {},
      steer: () => {},
      followUp: () => {},
      notify: () => {},
      registerPromptContextProvider: (_pluginId, id, provider) => {
        providers.set(id, provider)
        return () => providers.delete(id)
      },
      registerBeforeContextCompactHook: () => () => {},
      registerAfterAssistantResponseHook: () => () => {},
      registerSkillRoot: () => () => {},
    },
  })

  registerOnethingMemoryPlugin(api)

  const run = async (name: string, args: unknown, ctx: Record<string, unknown> = {}) => {
    const tool = registered.get(name)
    if (!tool) throw new Error(`tool "${name}" was never registered`)
    // 宿主执行路径:与 app/plugins/api.ts 里那条同一个函数。
    return executeCorePluginTool(tool as any, args as any, {
      sessionId: 's1',
      messageId: 'm1',
      toolCallId: 'call-1',
      ...ctx,
    } as any)
  }

  return {
    api,
    files,
    homeRoot,
    registered,
    run,
    inject: () => providers.get('memory-index')?.({ sessionId: 's1' }) as
      { role: string; content: string } | null | undefined,
    demolish: () => { disposed = true },
  }
}

afterEach(() => {
  for (const dir of tempRoots.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('memory 插件 —— 真内核集成', () => {
  it('装上真 api 就有两个工具与一个注入面', () => {
    const kernel = createRealApi({ external: makeTempDir('memory-int-wiki-') })
    expect([...kernel.registered.keys()].sort()).toEqual(['memory_query', 'memory_write'])
    expect(kernel.inject()).toMatchObject({ role: 'developer' })
  })

  it('write 走宿主执行路径 → 文件真出现在临时外根;再 query 命中', async () => {
    const external = makeTempDir('memory-int-wiki-')
    const kernel = createRealApi({ external })

    const written = await kernel.run(
      'memory_write',
      { topic: 'people/张三', content: '只喝美式,不加糖' },
      { agentId: 'barista' },
    )
    expect(written.output).toContain('people/张三.md')

    // 磁盘上的事实(不是插件自己的回执)。
    const page = fs.readFileSync(path.join(external, 'people', '张三.md'), 'utf-8')
    expect(page).toContain('- 只喝美式,不加糖(')
    expect(page).toContain('(agent:barista)')
    expect(fs.existsSync(path.join(external, ONETHING_MEMORY_INDEX_FILE))).toBe(true)
    expect(fs.existsSync(path.join(external, ONETHING_MEMORY_SCHEMA_FILE))).toBe(true)

    const found = await kernel.run('memory_query', { query: '张三' })
    expect(found.output).toContain('只喝美式')

    // 索引注入看得见它。
    expect(kernel.inject()!.content).toContain('people/张三')
  })

  it('manifest 少了 storage:external-root 就写不进去 —— 声明门是真的', async () => {
    const external = makeTempDir('memory-int-wiki-')
    const kernel = createRealApi({ external, declared: false })

    const result = await kernel.run('memory_write', { topic: 'p', content: 'x' })
    expect(result.output).toContain('没有取得外部目录权限')
    expect(fs.readdirSync(external)).toEqual([])
    expect(PLUGIN_PERMISSION_STORAGE_EXTERNAL_ROOT).toBe('storage:external-root')
  })

  it('拆除之后晚到的写被丢弃,用户的 wiki 一个文件不少', async () => {
    const external = makeTempDir('memory-int-wiki-')
    const kernel = createRealApi({ external })
    await kernel.run('memory_write', { topic: 'p', content: '记住的' })
    const before = fs.readdirSync(external).sort()
    const pageBefore = fs.readFileSync(path.join(external, 'p.md'), 'utf-8')

    kernel.demolish()
    await kernel.run('memory_write', { topic: '晚到的', content: '不该落地' })

    expect(fs.readdirSync(external).sort()).toEqual(before)
    expect(fs.readFileSync(path.join(external, 'p.md'), 'utf-8')).toBe(pageBefore)
  })
})
