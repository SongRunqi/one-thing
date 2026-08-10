/**
 * H4 深链协议口 —— **冷启动时序**。
 *
 * 这是整条深链里最容易写错、也最难在真机上复现的一段:app 没在跑时点一条链接,
 * `open-url` 可能在 ready 之前就到,窗口还没建、renderer 还没挂监听。投早了那条
 * 链就掉进虚空,而用户只会说"有时候点了没反应"。
 *
 * 协议注册本身(`setAsDefaultProtocolClient` 真的写进 LaunchServices)只有真机
 * 验得了;这里 mock 掉,验的是**队列的时序**。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { setAsDefaultProtocolClient: vi.fn(() => true), on: vi.fn() },
}))

import {
  DEEPLINK_COLD_START_QUEUE_MAX,
  enqueueDeepLink,
  markElectronDeepLinkReady,
  pendingDeepLinkCount,
  registerElectronDeepLinkProtocol,
  resetElectronDeepLinkProtocolForTests,
} from '../protocol.js'

function fakeApp() {
  const listeners = new Map<string, (event: { preventDefault(): void }, url: string) => void>()
  return {
    setAsDefaultProtocolClient: vi.fn(() => true),
    on: vi.fn((event: string, listener: (e: { preventDefault(): void }, url: string) => void) => {
      listeners.set(event, listener)
    }),
    emitOpenUrl(url: string) {
      const prevented: boolean[] = []
      listeners.get('open-url')?.({ preventDefault: () => prevented.push(true) }, url)
      return prevented.length > 0
    },
  }
}

const silent = { log: vi.fn(), warn: vi.fn() }

describe('H4 deep link protocol — 冷启动时序', () => {
  beforeEach(() => {
    resetElectronDeepLinkProtocolForTests()
    vi.clearAllMocks()
  })

  it('registers the scheme and preventDefaults open-url', () => {
    const app = fakeApp()
    const delivered: string[] = []
    registerElectronDeepLinkProtocol({ deliver: u => delivered.push(u), app, logger: silent })

    expect(app.setAsDefaultProtocolClient).toHaveBeenCalled()
    // macOS 要求拦住,不拦系统会认为没人处理。
    expect(app.emitOpenUrl('onething://ask?text=hi')).toBe(true)
  })

  it('holds URLs that arrive before the renderer can draw a card', () => {
    const app = fakeApp()
    const delivered: string[] = []
    registerElectronDeepLinkProtocol({ deliver: u => delivered.push(u), app, logger: silent })

    app.emitOpenUrl('onething://ask?text=first')
    app.emitOpenUrl('onething://ask?text=second')

    // 还没放行:一条都不投 —— 投了就是掉进虚空。
    expect(delivered).toEqual([])
    expect(pendingDeepLinkCount()).toBe(2)

    markElectronDeepLinkReady()

    // 放行之后按到达顺序补投,一条不丢、不乱序。
    expect(delivered).toEqual(['onething://ask?text=first', 'onething://ask?text=second'])
    expect(pendingDeepLinkCount()).toBe(0)
  })

  it('delivers straight through once the renderer is ready', () => {
    const app = fakeApp()
    const delivered: string[] = []
    registerElectronDeepLinkProtocol({ deliver: u => delivered.push(u), app, logger: silent })
    markElectronDeepLinkReady()

    app.emitOpenUrl('onething://ask?text=live')
    expect(delivered).toEqual(['onething://ask?text=live'])
    expect(pendingDeepLinkCount()).toBe(0)
  })

  it('is idempotent on a second ready — a renderer reload must not break delivery', () => {
    const app = fakeApp()
    const delivered: string[] = []
    registerElectronDeepLinkProtocol({ deliver: u => delivered.push(u), app, logger: silent })
    markElectronDeepLinkReady()
    markElectronDeepLinkReady()

    app.emitOpenUrl('onething://ask?text=after-reload')
    expect(delivered).toEqual(['onething://ask?text=after-reload'])
  })

  it('drops the OLDEST when the cold-start queue overflows', () => {
    const app = fakeApp()
    const delivered: string[] = []
    registerElectronDeepLinkProtocol({ deliver: u => delivered.push(u), app, logger: silent })

    for (let i = 0; i < DEEPLINK_COLD_START_QUEUE_MAX + 3; i += 1) {
      app.emitOpenUrl(`onething://ask?text=${i}`)
    }
    expect(pendingDeepLinkCount()).toBe(DEEPLINK_COLD_START_QUEUE_MAX)

    markElectronDeepLinkReady()
    // 最后点的那条才是用户要的 —— 留下的是队尾。
    expect(delivered.at(-1)).toBe(`onething://ask?text=${DEEPLINK_COLD_START_QUEUE_MAX + 2}`)
    expect(delivered).toHaveLength(DEEPLINK_COLD_START_QUEUE_MAX)
  })

  it('ignores an empty or non-string URL without queueing it', () => {
    const app = fakeApp()
    registerElectronDeepLinkProtocol({ deliver: () => {}, app, logger: silent })
    enqueueDeepLink('')
    enqueueDeepLink(undefined as unknown as string)
    expect(pendingDeepLinkCount()).toBe(0)
  })

  it('survives a failing setAsDefaultProtocolClient — the app still runs', () => {
    const app = fakeApp()
    app.setAsDefaultProtocolClient.mockImplementation(() => {
      throw new Error('LaunchServices said no')
    })
    expect(() =>
      registerElectronDeepLinkProtocol({ deliver: () => {}, app, logger: silent }),
    ).not.toThrow()
    // 监听照样挂上:注册失败不等于放弃这条路。
    expect(app.on).toHaveBeenCalledWith('open-url', expect.any(Function))
  })
})
