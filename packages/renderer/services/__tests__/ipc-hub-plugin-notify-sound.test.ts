// @vitest-environment happy-dom
/**
 * 通知与提示音在 ipc-hub 这一跳是**解耦的两件事**(M1)。
 *
 * 要钉死的核心判据只有一条,但它正是"静音"这个功能的全部意义:
 * **被静音时横幅照常显示,只是不出声。** 主进程把 sound 抹成 'none' 或整个省略,
 * renderer 这边 toast 一行都不受影响。
 *
 * 顺带守住:机械信号(带 kind)既不弹横幅也不出声 —— 那些不给人看,自然也不给人听。
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

const soundState = vi.hoisted(() => ({ play: vi.fn() }))
vi.mock('../plugin-notify-sound', () => ({
  playPluginNotifySound: (sound: unknown) => soundState.play(sound),
  previewPluginNotifySound: vi.fn(),
}))

describe('IPC hub → 插件通知的横幅与提示音', () => {
  let notify: ((payload: Record<string, unknown>) => void) | undefined
  let getPlugins: Mock

  beforeEach(async () => {
    vi.resetModules()
    setActivePinia(createPinia())
    toastState.info.mockReset()
    toastState.error.mockReset()
    soundState.play.mockReset()
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

    const { initializeIPCHub } = await import('../ipc-hub')
    initializeIPCHub()
    await vi.waitFor(() => expect(notify).toBeTypeOf('function'))
  })

  it('带 sound 的通知:横幅 + 一声', () => {
    notify!({ pluginId: 'demo', message: 'ping', level: 'info', sound: 'chime' })
    expect(toastState.info).toHaveBeenCalledWith('ping')
    expect(soundState.play).toHaveBeenCalledWith('chime')
  })

  it('被静音(主进程抹成 none):横幅在,声音没有', () => {
    notify!({ pluginId: 'demo', message: 'ping', level: 'info', sound: 'none' })
    expect(toastState.info).toHaveBeenCalledWith('ping')
    expect(soundState.play).toHaveBeenCalledWith('none')
    // playPluginNotifySound('none') 自身是 no-op —— 这条在 plugin-notify-sound.test.ts。
  })

  it('老通知(没有 sound 字段):横幅照旧,行为与 M1 之前一致', () => {
    notify!({ pluginId: 'demo', message: 'legacy', level: 'warn' })
    expect(toastState.info).toHaveBeenCalledWith('legacy')
    expect(soundState.play).toHaveBeenCalledWith(undefined)
  })

  it('error 级别走 error 横幅,声音仍然独立传递', () => {
    notify!({ pluginId: 'demo', message: 'boom', level: 'error', sound: 'error' })
    expect(toastState.error).toHaveBeenCalledWith('boom')
    expect(toastState.info).not.toHaveBeenCalled()
    expect(soundState.play).toHaveBeenCalledWith('error')
  })

  it('机械信号(带 kind)既不弹横幅也不出声', () => {
    notify!({ pluginId: 'demo', message: 'plugin-catalog-changed:demo', level: 'info', kind: 'catalog-changed' })
    expect(toastState.info).not.toHaveBeenCalled()
    expect(toastState.error).not.toHaveBeenCalled()
    expect(soundState.play).not.toHaveBeenCalled()
  })

  it('空消息什么都不做', () => {
    notify!({ pluginId: 'demo', message: '', level: 'info', sound: 'chime' })
    expect(soundState.play).not.toHaveBeenCalled()
  })
})
