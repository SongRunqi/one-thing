/**
 * R1 软隔离验收(设计文档 §3.1 / §5 R1)。
 *
 * 三条验收:
 *   1. 一个 entry 永不 resolve 的插件不阻塞其他插件加载;
 *   2. 一个挂起的 promptContextProvider 不阻塞消息发送路径(提示词装配超时后返回);
 *   3. 连续失败的插件被自动禁用,且状态可查。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CORE_PLUGIN_FAILURE_THRESHOLD,
  CorePluginHealthTracker,
  CorePluginLifecycleRegistry,
  CorePluginManager,
  CorePluginTimeoutError,
  isCorePluginTimeoutError,
  runWithPluginTimeout,
  type CorePluginDefinition,
  type CorePluginManagerHost,
  type CorePluginStateLike,
} from '@onething/core/plugins'

interface TestAPI {
  registerCommand(name: string): void
}
type TestEntry = (api: TestAPI) => void | Promise<void>
type TestDefinition = CorePluginDefinition<TestEntry>
interface TestCommand { name: string }
interface TestState extends CorePluginStateLike<TestCommand> { disposed: boolean }

function silentLogger() {
  return { log: () => {}, error: () => {} }
}

function createManagerHost(definitions: TestDefinition[]) {
  const disposed: string[] = []
  const states = new Map<string, TestState>()
  const host: CorePluginManagerHost<TestDefinition, TestEntry, TestAPI, TestState, TestCommand, { ready: true }> = {
    ensurePluginDirs() {},
    scanPlugins: () => definitions,
    loadPluginEntry: async definition => definition.entry ?? null,
    createPluginAPI(pluginId) {
      const state: TestState = { commands: new Map(), disposed: false }
      states.set(pluginId, state)
      return {
        state,
        api: {
          registerCommand(name) {
            state.commands.set(name, { name })
          },
        },
      }
    },
    disposePlugin(state) {
      state.disposed = true
      for (const [id, candidate] of states) {
        if (candidate === state) disposed.push(id)
      }
    },
    setPluginEnabled() {},
  }
  return { host, disposed, states }
}

describe('R1 soft isolation — timeout budget', () => {
  it('rejects with a timeout error instead of hanging forever', async () => {
    await expect(runWithPluginTimeout('never', 20, () => new Promise(() => {})))
      .rejects.toBeInstanceOf(CorePluginTimeoutError)
    expect(isCorePluginTimeoutError(new CorePluginTimeoutError('x', 1))).toBe(true)
  })

  it('passes results through untouched when the call is fast', async () => {
    await expect(runWithPluginTimeout('fast', 1_000, () => 'ok')).resolves.toBe('ok')
  })
})

describe('R1 soft isolation — one bad plugin does not stall the queue', () => {
  it('loads the remaining plugins when an entry never resolves', async () => {
    const definitions: TestDefinition[] = [
      {
        id: 'hanging',
        manifest: { name: 'Hanging', version: '1.0.0' },
        dirPath: '/plugins/hanging',
        entryPath: '/plugins/hanging/plugin-entry.js',
        enabled: true,
        entry: () => new Promise<void>(() => {}),
      },
      {
        id: 'healthy',
        manifest: { name: 'Healthy', version: '1.0.0' },
        dirPath: '/plugins/healthy',
        entryPath: '/plugins/healthy/plugin-entry.js',
        enabled: true,
        entry: api => {
          api.registerCommand('/healthy')
        },
      },
    ]
    const { host, disposed } = createManagerHost(definitions)
    const manager = new CorePluginManager<TestAPI, TestEntry, TestCommand, TestState, TestDefinition, { ready: true }>(
      host,
      silentLogger(),
      { entryTimeoutMs: 30 },
    )

    const started = Date.now()
    await manager.initialize({ ready: true })
    const elapsed = Date.now() - started

    const byId = new Map(manager.getPlugins().map(info => [info.definition.id, info]))
    expect(byId.get('healthy')).toMatchObject({ loaded: true, commands: ['/healthy'] })
    expect(byId.get('hanging')?.loaded).toBe(false)
    expect(byId.get('hanging')?.error).toContain('exceeded 30ms')
    // 并行加载:总耗时是最慢一个的量级,不是所有插件的总和。
    expect(elapsed).toBeLessThan(1_000)
    // 装到一半的插件要被拆干净,不能把半截足迹留在注册表里。
    expect(disposed).toContain('hanging')
    // 展示序仍是扫描序 —— 并行不许打乱它。
    expect(manager.getPlugins().map(info => info.definition.id)).toEqual(['hanging', 'healthy'])
  })

  it('surfaces host-provided runtime health on the plugin info', async () => {
    const definitions: TestDefinition[] = [{
      id: 'demo',
      manifest: { name: 'Demo', version: '1.0.0' },
      dirPath: '/plugins/demo',
      entryPath: '/plugins/demo/plugin-entry.js',
      enabled: true,
      entry: () => {},
    }]
    const { host } = createManagerHost(definitions)
    const manager = new CorePluginManager<TestAPI, TestEntry, TestCommand, TestState, TestDefinition, { ready: true }>(
      { ...host, getPluginHealth: () => ({ status: 'degraded', consecutiveFailures: 2, lastError: 'boom' }) },
      silentLogger(),
    )
    await manager.initialize({ ready: true })

    expect(manager.getPlugins()[0].health).toMatchObject({ status: 'degraded', consecutiveFailures: 2 })
  })
})

// promptContextProvider 的超时验收住在产品层:
// packages/onething-runtime/src/prompts/__tests__/plugin-context-timeout.test.ts

describe('R1 soft isolation — lifecycle hooks are budgeted', () => {
  it('times out a hanging beforeContextCompact hook and keeps going', async () => {
    const failures: string[] = []
    const registry = new CorePluginLifecycleRegistry({
      logger: { error: () => {} },
      timeoutMs: 25,
      onHookFailure: ({ pluginId, scope }) => failures.push(`${scope}:${pluginId}`),
    })
    const ran: string[] = []

    registry.registerBeforeContextCompactHook('hanging-plugin', 'stuck', () => new Promise(() => {}))
    registry.registerBeforeContextCompactHook('good-plugin', 'quick', () => {
      ran.push('good-plugin')
    })

    await registry.runBeforeContextCompactHooks({} as never)

    expect(ran).toEqual(['good-plugin'])
    expect(failures).toEqual(['beforeContextCompact:hanging-plugin'])
  })
})

describe('R1 soft isolation — failure counting circuit breaker', () => {
  it('auto-disables after consecutive failures and exposes the reason', () => {
    const tripped: Array<{ pluginId: string; reason?: string }> = []
    const tracker = new CorePluginHealthTracker({
      onTrip: (pluginId, health) => tripped.push({ pluginId, reason: health.disabledReason }),
    })

    for (let i = 0; i < CORE_PLUGIN_FAILURE_THRESHOLD - 1; i += 1) {
      tracker.recordFailure('flaky', 'promptContext:notes', new Error('boom'))
    }
    expect(tracker.get('flaky')).toMatchObject({ status: 'degraded' })
    expect(tripped).toEqual([])

    tracker.recordFailure('flaky', 'promptContext:notes', new Error('boom'))
    expect(tripped).toHaveLength(1)
    expect(tripped[0].pluginId).toBe('flaky')
    expect(tracker.get('flaky')).toMatchObject({
      status: 'disabled',
      consecutiveFailures: CORE_PLUGIN_FAILURE_THRESHOLD,
      lastError: 'boom',
      lastErrorScope: 'promptContext:notes',
    })
    expect(tracker.get('flaky')?.disabledReason).toContain('consecutive failures')

    // 熔断后再失败不重复触发禁用。
    tracker.recordFailure('flaky', 'promptContext:notes', new Error('boom'))
    expect(tripped).toHaveLength(1)
  })

  it('counts consecutive failures only — one success clears the tally', () => {
    const tracker = new CorePluginHealthTracker({ onTrip: () => {} })
    tracker.recordFailure('flaky', 'event:tool:result', new Error('boom'))
    tracker.recordFailure('flaky', 'event:tool:result', new Error('boom'))
    tracker.recordSuccess('flaky')
    expect(tracker.get('flaky')).toMatchObject({ status: 'healthy', consecutiveFailures: 0 })
  })

  it('clears the breaker state on explicit re-enable', () => {
    const tracker = new CorePluginHealthTracker({ threshold: 1, onTrip: () => {} })
    tracker.recordFailure('flaky', 'entry', new Error('boom'))
    expect(tracker.get('flaky')?.status).toBe('disabled')
    tracker.clear('flaky')
    expect(tracker.get('flaky')).toBeUndefined()
  })
})

describe('R1 soft isolation — app wiring', () => {
  it('auto-disables the plugin through the host port and notifies the user', async () => {
    const health = await import('../health.js')
    health.resetPluginRuntimeHealthForTests()

    const disabled: string[] = []
    const notified: string[] = []
    health.configurePluginHealthHost({
      disablePlugin: pluginId => {
        disabled.push(pluginId)
      },
      notify: (pluginId, message) => {
        notified.push(`${pluginId}:${message}`)
      },
    })

    for (let i = 0; i < CORE_PLUGIN_FAILURE_THRESHOLD; i += 1) {
      health.reportPluginRuntimeFailure('flaky', 'promptContext:notes', new Error('boom'))
    }
    await vi.waitFor(() => expect(disabled).toEqual(['flaky']))

    expect(notified[0]).toContain('disabled automatically')
    expect(health.getPluginRuntimeHealth('flaky')).toMatchObject({ status: 'disabled' })
    expect(health.listPluginRuntimeHealth()).toHaveLength(1)

    health.clearPluginRuntimeHealth('flaky')
    expect(health.getPluginRuntimeHealth('flaky')).toBeUndefined()
    health.configurePluginHealthHost(null)
  })
})
