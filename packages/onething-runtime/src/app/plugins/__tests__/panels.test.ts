/**
 * R5 验收:声明式面板。
 *
 * 两条裁决都在这里被钉住:
 *  1. **静态存在感走 manifest** —— 面板入口只由 `contributes.panels` 决定,
 *     `registerWorkspacePanel` 只绑定行为;id 对不上就当场拒绝。
 *  2. **UI 永不执行插件代码** —— 插件交出的是一棵纯数据描述树,函数成员当场被拒。
 *
 * 渲染与动作都跑在 R2 的统一请求通道上(action = `panel:render:<id>` /
 * `panel:action:<id>`),所以它们免费继承预算、abort 与熔断账 —— 这份验收也就
 * 打在通道上,而不是打在某个具体宿主的接线上。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  CorePluginManager,
  PLUGIN_PANEL_INVOKE_ACTION,
  PLUGIN_PANEL_PROTOCOL_VERSION,
  PLUGIN_PANEL_RENDER_ACTION,
  createCorePluginAPI,
  disposeCorePluginState,
  validatePluginPanelTree,
  type CorePluginDefinition,
  type CorePluginManagerHost,
  type CorePluginPanelContext,
  type CorePluginPanelRegistration,
  type CorePluginRequestHandler,
  type CorePluginStateLike,
  type PluginPanelTree,
} from '@onething/core/plugins'

interface TestAPI {
  registerWorkspacePanel(registration: CorePluginPanelRegistration): void
}
type TestEntry = (api: TestAPI) => void | Promise<void>
type TestDefinition = CorePluginDefinition<TestEntry>
interface TestCommand { name: string }
interface TestState extends CorePluginStateLike<TestCommand> {
  requestHandlers: Map<string, CorePluginRequestHandler>
  disposed?: boolean
}

function silentLogger() {
  return { log: () => {}, error: () => {} }
}

/**
 * 最小宿主 —— 与 app 层同构,但用真的 `createCorePluginAPI` 造 api,
 * 因为 `registerWorkspacePanel` 的清单校验与通道登记恰恰活在那里面。
 */
function createManager(definitions: TestDefinition[]) {
  const errors: string[] = []
  const failures: Array<{ pluginId: string; scope: string }> = []
  const refreshes: Array<{ pluginId: string; panelId: string }> = []

  const host: CorePluginManagerHost<TestDefinition, TestEntry, TestAPI, TestState, TestCommand, { ready: true }> = {
    ensurePluginDirs() {},
    scanPlugins: () => definitions,
    loadPluginEntry: async definition => definition.entry ?? null,
    createPluginAPI(pluginId) {
      // 声明来自 manifest —— 与 app 层 manager 的取法逐字相同。
      const declaredPanelIds = definitions
        .find(item => item.id === pluginId)
        ?.manifest.contributes?.panels?.map(panel => panel.id) ?? []
      const created = (createCorePluginAPI as any)({
        pluginId,
        declaredPanelIds,
        scheduler: { schedule: () => {}, cancel: () => {} } as any,
        store: { get: () => undefined, set: () => {}, delete: () => {}, keys: () => [] } as any,
        host: {
          emitPanelRefresh(id: string, panelId: string) {
            refreshes.push({ pluginId: id, panelId })
          },
        } as any,
        logger: { log: () => {}, error: (message: string) => errors.push(message) },
        onPluginFailure: (input: { pluginId: string; scope: string }) =>
          failures.push({ pluginId: input.pluginId, scope: input.scope }),
      })
      // state 用 core 造的那一份 —— 通道查的就是它,自造一个只会两边对不上。
      return { state: created.state as unknown as TestState, api: created.api as unknown as TestAPI }
    },
    disposePlugin(state) {
      disposeCorePluginState(state as any)
    },
    setPluginEnabled() {},
  }

  const manager = new CorePluginManager<TestAPI, TestEntry, TestCommand, TestState, TestDefinition, { ready: true }>(
    host,
    silentLogger(),
  )
  return { manager, errors, failures, refreshes }
}

function definition(id: string, entry: TestEntry, panels: Array<{ id: string; label: string }>): TestDefinition {
  return {
    id,
    manifest: { name: id, version: '1.0.0', contributes: { panels } },
    dirPath: `/plugins/${id}`,
    entryPath: `/plugins/${id}/plugin-entry.js`,
    enabled: true,
    entry,
  }
}

function simpleTree(text: string): PluginPanelTree {
  return {
    version: PLUGIN_PANEL_PROTOCOL_VERSION,
    body: {
      type: 'stack',
      children: [
        { type: 'markdown', text },
        { type: 'button', label: 'Refresh', actionId: 'refresh' },
      ],
    },
  }
}

describe('R5 declarative panels — manifest declares, code binds', () => {
  it('renders a declared panel through the unified request channel', async () => {
    const { manager } = createManager([
      definition('logs', api => {
        api.registerWorkspacePanel({ id: 'main', render: () => simpleTree('hello from the plugin') })
      }, [{ id: 'main', label: 'Logs' }]),
    ])
    await manager.initialize({ ready: true })

    const result = await manager.handleRequest({
      pluginId: 'logs',
      action: `${PLUGIN_PANEL_RENDER_ACTION}:main`,
    })

    expect(result.success).toBe(true)
    const tree = (result as { result: PluginPanelTree }).result
    expect(tree.body).toMatchObject({ type: 'stack' })
    // 两个 action 都登记在同一条通道上 —— 没有第二套投递机制。
    expect(manager.getRequestActions('logs')).toEqual(['panel:render:main', 'panel:action:main'])
  })

  it('round-trips an action: actionId + payload in, result out', async () => {
    const seen: Array<{ actionId: string; payload?: unknown }> = []
    const { manager } = createManager([
      definition('logs', api => {
        api.registerWorkspacePanel({
          id: 'main',
          render: () => simpleTree('idle'),
          onAction(input) {
            seen.push(input)
            return { refresh: true, notice: `did ${input.actionId}` }
          },
        })
      }, [{ id: 'main', label: 'Logs' }]),
    ])
    await manager.initialize({ ready: true })

    const result = await manager.handleRequest({
      pluginId: 'logs',
      action: `${PLUGIN_PANEL_INVOKE_ACTION}:main`,
      payload: { actionId: 'cleanup', payload: { days: 7 } },
    })

    expect(result).toMatchObject({ success: true, result: { refresh: true, notice: 'did cleanup' } })
    expect(seen).toEqual([{ actionId: 'cleanup', payload: { days: 7 } }])
  })

  it('pushes ctx.refresh() through the existing notification rail, not a new one', async () => {
    const { manager, refreshes } = createManager([
      definition('logs', api => {
        api.registerWorkspacePanel({
          id: 'main',
          render: (ctx: CorePluginPanelContext) => {
            // 插件在渲染之外也能调 —— 这里借渲染时机验证它接到了宿主。
            ctx.refresh()
            return simpleTree('idle')
          },
        })
      }, [{ id: 'main', label: 'Logs' }]),
    ])
    await manager.initialize({ ready: true })

    await manager.handleRequest({ pluginId: 'logs', action: `${PLUGIN_PANEL_RENDER_ACTION}:main` })

    expect(refreshes).toEqual([{ pluginId: 'logs', panelId: 'main' }])
  })

  it('rejects a panel id that no manifest declared — declaration comes first', async () => {
    const { manager, errors, failures } = createManager([
      definition('logs', api => {
        api.registerWorkspacePanel({ id: 'sneaky', render: () => simpleTree('nope') })
      }, [{ id: 'main', label: 'Logs' }]),
    ])
    await manager.initialize({ ready: true })

    expect(manager.getRequestActions('logs')).toEqual([])
    expect(errors.join('\n')).toContain('does not match any panel declared in contributes.panels')
    expect(failures).toEqual([{ pluginId: 'logs', scope: 'registerWorkspacePanel' }])
  })

  it('surfaces a render failure as a failed request instead of taking the shell down', async () => {
    const { manager } = createManager([
      definition('logs', api => {
        api.registerWorkspacePanel({
          id: 'main',
          render: () => { throw new Error('log dir vanished') },
        })
      }, [{ id: 'main', label: 'Logs' }]),
    ])
    await manager.initialize({ ready: true })

    await expect(manager.handleRequest({ pluginId: 'logs', action: `${PLUGIN_PANEL_RENDER_ACTION}:main` }))
      .resolves.toMatchObject({ success: false, error: expect.stringContaining('log dir vanished') })
  })

  it('rejects a tree carrying a function member — closures cannot cross the line', async () => {
    const { manager } = createManager([
      definition('logs', api => {
        api.registerWorkspacePanel({
          id: 'main',
          render: () => ({
            version: PLUGIN_PANEL_PROTOCOL_VERSION,
            // 插件想塞回调:IPC 上它会被静默丢弃,用户点了毫无反应 —— 当场拒掉。
            body: { type: 'button', label: 'Go', actionId: 'go', onClick: () => {} },
          }) as unknown as PluginPanelTree,
        })
      }, [{ id: 'main', label: 'Logs' }]),
    ])
    await manager.initialize({ ready: true })

    await expect(manager.handleRequest({ pluginId: 'logs', action: `${PLUGIN_PANEL_RENDER_ACTION}:main` }))
      .resolves.toMatchObject({ success: false, error: expect.stringContaining('must be pure data') })
  })

  it('validates the tree shape: buttons address actions by id, not by callback', () => {
    expect(validatePluginPanelTree(simpleTree('ok'))).toBeNull()
    expect(validatePluginPanelTree({
      version: PLUGIN_PANEL_PROTOCOL_VERSION,
      body: { type: 'button', label: 'Go' },
    })).toContain('actionId')
    expect(validatePluginPanelTree({
      version: PLUGIN_PANEL_PROTOCOL_VERSION + 1,
      body: { type: 'markdown', text: 'x' },
    })).toContain('newer than this host supports')
  })

  it('a second plugin adds a panel without any host file learning its name', async () => {
    // 宿主侧没有任何"面板名单":加一个面板 = 改插件的 plugin.json + 一行注册。
    const { manager } = createManager([
      definition('logs', api => {
        api.registerWorkspacePanel({ id: 'main', render: () => simpleTree('logs') })
      }, [{ id: 'main', label: 'Logs' }]),
      definition('notes', api => {
        api.registerWorkspacePanel({ id: 'inbox', render: () => simpleTree('notes') })
        api.registerWorkspacePanel({ id: 'archive', render: () => simpleTree('old notes') })
      }, [{ id: 'inbox', label: 'Inbox' }, { id: 'archive', label: 'Archive' }]),
    ])
    await manager.initialize({ ready: true })

    expect(manager.getRequestActions('notes')).toEqual([
      'panel:render:inbox',
      'panel:action:inbox',
      'panel:render:archive',
      'panel:action:archive',
    ])
    await expect(manager.handleRequest({ pluginId: 'notes', action: `${PLUGIN_PANEL_RENDER_ACTION}:archive` }))
      .resolves.toMatchObject({ success: true })
  })

  it('drops panel handlers when the plugin is disposed', async () => {
    const { manager } = createManager([
      definition('logs', api => {
        api.registerWorkspacePanel({ id: 'main', render: () => simpleTree('logs') })
      }, [{ id: 'main', label: 'Logs' }]),
    ])
    await manager.initialize({ ready: true })
    expect(manager.getRequestActions('logs')).toHaveLength(2)

    await manager.disablePlugin('logs')

    await expect(manager.handleRequest({ pluginId: 'logs', action: `${PLUGIN_PANEL_RENDER_ACTION}:main` }))
      .resolves.toMatchObject({ success: false })
  })
})

describe('R5 declarative panels — the log-monitor demo', () => {
  it('declares its panel in the manifest — the entry needs no plugin code', async () => {
    const { ONETHING_LOG_MONITOR_MANIFEST } = await import('@onething/runtime/plugins')
    expect(ONETHING_LOG_MONITOR_MANIFEST.contributes.panels).toEqual([
      { id: 'logs', label: 'Agent logs' },
    ])
  })

  it('builds a real tree and round-trips its actions using only plugin APIs', async () => {
    const { registerOnethingLogMonitorPanel } = await import('@onething/runtime/plugins')

    const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onething-panel-'))
    fs.writeFileSync(path.join(logDir, 'agent-2026-08-07.log'), 'line one\nline two\n')
    fs.writeFileSync(path.join(logDir, 'agent-2026-08-06.log'), 'older\n')
    // 非日志文件不该混进列表。
    fs.writeFileSync(path.join(logDir, 'notes.txt'), 'ignore me')

    const cleanupOldLogs = vi.fn()
    const registered: CorePluginPanelRegistration[] = []

    try {
      registerOnethingLogMonitorPanel(
        { registerWorkspacePanel: (registration: any) => registered.push(registration) } as any,
        {
          logDir,
          readConfig: () => ({ retentionDays: 7, flushIntervalMs: 1000, notifyOnErrors: true }),
          runtime: {
            buffer: { size: 3, clear: () => 3 },
            diskWriter: { cleanupOldLogs },
          } as any,
        },
      )

      expect(registered).toHaveLength(1)
      expect(registered[0].id).toBe('logs')

      const ctx: CorePluginPanelContext = {
        requestId: 'req-1',
        abortSignal: new AbortController().signal,
        refresh: () => {},
      }

      const tree = await registered[0].render(ctx)
      // 示范插件同样要过守卫,不享受特权。
      expect(validatePluginPanelTree(tree)).toBeNull()
      const rendered = JSON.stringify(tree)
      expect(rendered).toContain('agent-2026-08-07.log')
      expect(rendered).toContain('agent-2026-08-06.log')
      expect(rendered).not.toContain('notes.txt')

      // 选中一个文件 → 重渲染时多出尾部预览(状态活在插件里,宿主不知情)。
      await registered[0].onAction?.({ actionId: 'select-file', payload: { name: 'agent-2026-08-07.log' } }, ctx)
      const selected = await registered[0].render(ctx)
      expect(validatePluginPanelTree(selected)).toBeNull()
      expect(JSON.stringify(selected)).toContain('line two')

      const cleaned = await registered[0].onAction?.({ actionId: 'cleanup' }, ctx)
      expect(cleanupOldLogs).toHaveBeenCalledTimes(1)
      expect(cleaned).toMatchObject({ refresh: true })
    } finally {
      fs.rmSync(logDir, { recursive: true, force: true })
    }
  })
})
