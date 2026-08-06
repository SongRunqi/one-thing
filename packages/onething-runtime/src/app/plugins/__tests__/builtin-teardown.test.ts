/**
 * 拆除测试(CI 化)—— 设计文档 §4.2 宪法第 6 条 / R0 第 5 条。
 *
 * 对每个内置插件:enable → 记录它在各注册表(工具 / 命令 / 提示词 provider /
 * 技能根 / 生命周期钩子 / 事件订阅 / 调度任务)的足迹 → disable → 断言全部
 * 注册表回到基线。
 *
 * 判据是**快照对比**而不是"看起来没报错":soul-memory 的账单正是"卸载后宿主
 * 树里还留着东西",一次性人工验收挡不住回归,所以它必须是常设守卫。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'onething-plugin-teardown-'))
const previousStorePath = process.env.ONETHING_STORE_PATH
process.env.ONETHING_STORE_PATH = storeRoot

type LoadedModules = Awaited<ReturnType<typeof loadModules>>

async function loadModules() {
  const [loader, api, tools, promptContext, skillRoots, lifecycle, scheduler] = await Promise.all([
    import('../loader.js'),
    import('../api.js'),
    import('../../tools/index.js'),
    import('../../engine/prompt/plugin-context.js'),
    import('../../skills/plugin-roots.js'),
    import('../lifecycle.js'),
    import('../../scheduler/index.js'),
  ])
  return { loader, api, tools, promptContext, skillRoots, lifecycle, scheduler }
}

interface RegistrySnapshot {
  toolIds: string[]
  promptContextProviders: number
  skillRoots: number
  lifecycleHooks: { beforeContextCompact: number; afterAssistantResponse: number }
  eventSubscriptions: number
  schedulerTaskIds: string[]
}

/** Counting EventBus stand-in: subscriptions are a registry too, and a leaked
 *  listener is exactly the kind of residue git diff never sees. */
function createCountingEventBus() {
  const handlers = new Map<string, Set<unknown>>()
  return {
    get subscriptionCount(): number {
      let total = 0
      for (const set of handlers.values()) total += set.size
      return total
    },
    onAnySession(eventType: string, handler: unknown): () => void {
      const set = handlers.get(eventType) ?? new Set<unknown>()
      set.add(handler)
      handlers.set(eventType, set)
      return () => {
        set.delete(handler)
      }
    },
    emitGlobal(): void {},
  }
}

function createStreamEngineStub() {
  return {
    steerMessage(): void {},
    followUpMessage(): void {},
  }
}

let modules: LoadedModules
let eventBus: ReturnType<typeof createCountingEventBus>

function snapshot(mods: LoadedModules, bus: ReturnType<typeof createCountingEventBus>): RegistrySnapshot {
  let schedulerTaskIds: string[] = []
  try {
    schedulerTaskIds = mods.scheduler.getScheduler().list().map((task: { id: string }) => task.id).sort()
  } catch {
    schedulerTaskIds = []
  }
  return {
    toolIds: mods.tools.getAllTools().map((tool: { id: string }) => tool.id).sort(),
    promptContextProviders: mods.promptContext.getPromptContextProviderCount(),
    skillRoots: mods.skillRoots.listPluginSkillRoots().length,
    lifecycleHooks: mods.lifecycle.getLifecycleHookCounts(),
    eventSubscriptions: bus.subscriptionCount,
    schedulerTaskIds,
  }
}

beforeAll(async () => {
  modules = await loadModules()
  eventBus = createCountingEventBus()
})

afterAll(async () => {
  if (previousStorePath === undefined) delete process.env.ONETHING_STORE_PATH
  else process.env.ONETHING_STORE_PATH = previousStorePath
  // fs.createWriteStream 的 open 是异步的:dispose 里 end() 之后,句柄可能还没
  // 落地。先让事件循环把它跑完再删目录,否则删的是"正在打开的文件"。
  await new Promise(resolve => setTimeout(resolve, 150))
  fs.rmSync(storeRoot, { recursive: true, force: true })
})

describe('built-in plugin teardown leaves no residue', () => {
  it('enumerates the built-in plugins so a newly added one is covered automatically', () => {
    const builtins = modules.loader.scanPlugins().filter(def => def.source === 'builtin')
    expect(builtins.length).toBeGreaterThan(0)
  })

  it('restores every registry after disable', async () => {
    const builtins = modules.loader.scanPlugins().filter(def => def.source === 'builtin')

    for (const definition of builtins) {
      const before = snapshot(modules, eventBus)

      const { api, state } = modules.api.createPluginAPI(
        definition.id,
        eventBus as never,
        createStreamEngineStub() as never,
      )
      const entry = definition.entry
      expect(entry, `built-in plugin "${definition.id}" must carry a bundled entry`).toBeTypeOf('function')
      await entry!(api)

      const during = snapshot(modules, eventBus)
      const footprint = {
        tools: during.toolIds.filter(id => !before.toolIds.includes(id)),
        commands: [...state.commands.keys()],
        promptContextProviders: during.promptContextProviders - before.promptContextProviders,
        skillRoots: during.skillRoots - before.skillRoots,
        beforeContextCompact: during.lifecycleHooks.beforeContextCompact - before.lifecycleHooks.beforeContextCompact,
        afterAssistantResponse: during.lifecycleHooks.afterAssistantResponse - before.lifecycleHooks.afterAssistantResponse,
        eventSubscriptions: during.eventSubscriptions - before.eventSubscriptions,
        schedulerTasks: during.schedulerTaskIds.filter(id => !before.schedulerTaskIds.includes(id)),
      }
      const totalFootprint = footprint.tools.length
        + footprint.commands.length
        + footprint.promptContextProviders
        + footprint.skillRoots
        + footprint.beforeContextCompact
        + footprint.afterAssistantResponse
        + footprint.eventSubscriptions
        + footprint.schedulerTasks.length
      expect(
        totalFootprint,
        `built-in plugin "${definition.id}" registered nothing — the teardown assertion would be vacuous`,
      ).toBeGreaterThan(0)

      modules.api.disposePlugin(state)

      const after = snapshot(modules, eventBus)
      expect(after, `built-in plugin "${definition.id}" left residue after dispose`).toEqual(before)
      expect(state.commands.size).toBe(0)
    }
  })
})
