// @vitest-environment happy-dom
/**
 * R5:插件面板入口的清单是怎么装满的。
 *
 * 命题只有两条,但都很容易被写反:
 *  - 入口来自 **manifest 的 contributes.panels**,所以装清单这一步**不执行
 *    一行插件代码** —— 加载失败的插件照样有入口,并且能把失败说出来。
 *  - 停用的插件不贡献入口:用户把它关了,它的界面就该消失。
 */
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

function plugin(overrides: Record<string, unknown> = {}) {
  return {
    id: 'log-monitor',
    name: 'Log monitor',
    enabled: true,
    loaded: true,
    contributes: { panels: [{ id: 'logs', label: 'Agent logs' }] },
    ...overrides,
  }
}

describe('IPC hub → plugin workspace panels', () => {
  let getPlugins: Mock<() => Promise<{ success: boolean; plugins: Array<Record<string, unknown>> }>>

  beforeEach(() => {
    vi.resetModules()
    setActivePinia(createPinia())
    getPlugins = vi.fn(async () => ({ success: true, plugins: [plugin()] }))

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        onSessionEvent: vi.fn(() => vi.fn()),
        onSessionStream: vi.fn(() => vi.fn()),
        onPluginNotification: vi.fn(() => vi.fn()),
        getPlugins: () => getPlugins(),
      },
    })
  })

  it('fills the panel list straight from the manifest projection', async () => {
    const { initializeIPCHub } = await import('../ipc-hub')
    const { usePluginWorkspacePanels } = await import('@/workspace/panel-registry')

    initializeIPCHub()
    await vi.waitFor(() => expect(usePluginWorkspacePanels().value).toHaveLength(1))

    expect(usePluginWorkspacePanels().value[0]).toEqual({
      pluginId: 'log-monitor',
      pluginName: 'Log monitor',
      panelId: 'logs',
      label: 'Agent logs',
      loaded: true,
    })
  })

  it('keeps the entry of an enabled plugin that failed to load', async () => {
    getPlugins = vi.fn(async () => ({ success: true, plugins: [plugin({ loaded: false })] }))
    const { initializeIPCHub } = await import('../ipc-hub')
    const { usePluginWorkspacePanels } = await import('@/workspace/panel-registry')

    initializeIPCHub()
    await vi.waitFor(() => expect(usePluginWorkspacePanels().value).toHaveLength(1))
    expect(usePluginWorkspacePanels().value[0].loaded).toBe(false)
  })

  it('drops the entry once the plugin is disabled', async () => {
    getPlugins = vi.fn(async () => ({ success: true, plugins: [plugin({ enabled: false })] }))
    const { initializeIPCHub } = await import('../ipc-hub')
    const { usePluginWorkspacePanels, setPluginWorkspacePanels } = await import('@/workspace/panel-registry')
    // 上一条用例留下的清单不该影响这一条 —— 注册表是模块级单例。
    setPluginWorkspacePanels([])

    initializeIPCHub()
    await vi.waitFor(() => expect(getPlugins).toHaveBeenCalled())
    expect(usePluginWorkspacePanels().value).toEqual([])
  })

  it('re-pulls the list when the plugin catalog changes', async () => {
    const { initializeIPCHub } = await import('../ipc-hub')

    initializeIPCHub()
    await vi.waitFor(() => expect(getPlugins).toHaveBeenCalled())
    // window 是整个文件共享的,前几条用例挂的监听还在 —— 只断言"又拉了一次",
    // 不断言绝对次数(那会变成在钉测试文件的执行顺序)。
    const before = getPlugins.mock.calls.length

    window.dispatchEvent(new Event('onething:plugins-changed'))
    await vi.waitFor(() => expect(getPlugins.mock.calls.length).toBeGreaterThan(before))
  })
})
