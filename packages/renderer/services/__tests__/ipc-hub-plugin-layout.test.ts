// @vitest-environment happy-dom
/**
 * 布局动词在 renderer 侧的落地(I 期)。
 *
 * 三条命题:
 *  1. **零新通道** —— 走的是既有的 `plugin:notification` 轨(kind: 'layout'),
 *     不是新开的一条 IPC 家族;
 *  2. **机械信号不弹 toast** —— 判据是"有没有 kind",于是新增的这个 kind
 *     天然静默,toast 那一侧一行代码都不用改;
 *  3. **不顺手重拉插件清单** —— 布局与清单无关,借车不等于跟着卸货。
 *
 * 真正执行布局的是 App.vue(它才够得着侧栏/右栏);ipc-hub 只负责把动词
 * 变成一条 window 事件 —— 与 practice / todo-plan 同款解耦线路。
 */
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

const toastState = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }))
vi.mock('@/composables/useToast', () => ({
  toast: {
    info: (...args: unknown[]) => toastState.info(...args),
    error: (...args: unknown[]) => toastState.error(...args),
    success: vi.fn(),
    warning: vi.fn(),
  },
}))

describe('IPC hub → plugin layout verbs', () => {
  let notify: ((payload: Record<string, unknown>) => void) | undefined
  let getPlugins: Mock<() => Promise<{ success: boolean; plugins: Array<Record<string, unknown>> }>>

  beforeEach(() => {
    vi.resetModules()
    setActivePinia(createPinia())
    toastState.info.mockReset()
    toastState.error.mockReset()
    notify = undefined
    getPlugins = vi.fn(async () => ({ success: true, plugins: [] }))

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        onSessionEvent: vi.fn(() => vi.fn()),
        onSessionStream: vi.fn(() => vi.fn()),
        onPluginNotification: vi.fn((handler: (payload: Record<string, unknown>) => void) => {
          notify = handler
          return vi.fn()
        }),
        getPlugins: () => getPlugins(),
      },
    })
  })

  async function boot() {
    const { initializeIPCHub } = await import('../ipc-hub')
    initializeIPCHub()
    await vi.waitFor(() => expect(notify).toBeTypeOf('function'))
    getPlugins.mockClear()
  }

  it('把 kind:layout 的通知变成一条 onething:plugin-layout 事件', async () => {
    await boot()
    const seen: Array<Record<string, unknown>> = []
    window.addEventListener('onething:plugin-layout', event => {
      seen.push((event as CustomEvent).detail)
    })

    notify!({
      pluginId: 'plan-status',
      message: 'plugin-layout:open-workbench:logs',
      level: 'info',
      kind: 'layout',
      layout: { verb: 'open-workbench', panelId: 'logs' },
    })

    expect(seen).toEqual([{ verb: 'open-workbench', panelId: 'logs', pluginId: 'plan-status' }])
    // 机械信号:不弹 toast(判据是有没有 kind,不是白名单)。
    expect(toastState.info).not.toHaveBeenCalled()
    expect(toastState.error).not.toHaveBeenCalled()
    // 布局与插件清单无关,不该顺手重拉一次。
    expect(getPlugins).not.toHaveBeenCalled()
  })

  it('toggle-sidebar 不带 panelId 也过线', async () => {
    await boot()
    const seen: Array<Record<string, unknown>> = []
    window.addEventListener('onething:plugin-layout', event => {
      seen.push((event as CustomEvent).detail)
    })

    notify!({
      pluginId: 'plan-status',
      message: 'plugin-layout:toggle-sidebar',
      level: 'info',
      kind: 'layout',
      layout: { verb: 'toggle-sidebar' },
    })

    expect(seen).toEqual([{ verb: 'toggle-sidebar', pluginId: 'plan-status' }])
  })

  it('缺 verb 的坏消息不派事件(也不炸)', async () => {
    await boot()
    const seen: unknown[] = []
    window.addEventListener('onething:plugin-layout', event => seen.push(event))

    notify!({ pluginId: 'x', message: 'plugin-layout:', level: 'info', kind: 'layout' })

    expect(seen).toEqual([])
  })
})
