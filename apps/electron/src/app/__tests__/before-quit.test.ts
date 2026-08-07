import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  on: vi.fn(),
}))

vi.mock('electron', () => ({
  app: {
    on: mocks.on,
  },
}))

describe('electron before-quit cleanup', () => {
  function createOptions(calls: string[] = []) {
    const fn = (name: string) => vi.fn(() => {
      calls.push(name)
    })
    const asyncFn = (name: string) => vi.fn(async () => {
      calls.push(name)
    })

    return {
      calls,
      options: {
        markVoiceQuitRequested: fn('markVoiceQuitRequested'),
        shutdownVoiceService: asyncFn('shutdownVoiceService'),
        shutdownMusicService: asyncFn('shutdownMusicService'),
        unregisterGlobalWindowShortcuts: fn('unregisterGlobalWindowShortcuts'),
        shutdownGateway: asyncFn('shutdownGateway'),
        shutdownMCP: asyncFn('shutdownMCP'),
        shutdownACP: asyncFn('shutdownACP'),
        killTrackedDetachedChildren: fn('killTrackedDetachedChildren'),
        killAllTerminals: fn('killAllTerminals'),
        killAllBrowserTabs: fn('killAllBrowserTabs'),
        shutdownPlugins: fn('shutdownPlugins'),
        shutdownStreamEngine: asyncFn('shutdownStreamEngine'),
        shutdownPermission: fn('shutdownPermission'),
        shutdownSessionLayer: fn('shutdownSessionLayer'),
        shutdownEventSystem: fn('shutdownEventSystem'),
        flushAllPendingSaves: asyncFn('flushAllPendingSaves'),
        shutdownAppLogging: asyncFn('shutdownAppLogging'),
        releaseDesktopStoreLock: asyncFn('releaseDesktopStoreLock'),
      },
    }
  }

  it('registers before-quit on the injected app and runs cleanup in order', async () => {
    const { registerElectronBeforeQuitCleanup } = await import('../before-quit.js')
    const app = { on: vi.fn() }
    const { calls, options } = createOptions()

    registerElectronBeforeQuitCleanup({ ...options, app })
    await app.on.mock.calls[0][1]()

    expect(app.on).toHaveBeenCalledWith('before-quit', expect.any(Function))
    expect(calls).toEqual([
      'shutdownPlugins',
      'markVoiceQuitRequested',
      'shutdownVoiceService',
      'shutdownMusicService',
      'unregisterGlobalWindowShortcuts',
      'shutdownGateway',
      'shutdownMCP',
      'shutdownACP',
      'killTrackedDetachedChildren',
      'killAllTerminals',
      'killAllBrowserTabs',
      'shutdownStreamEngine',
      'shutdownPermission',
      'shutdownSessionLayer',
      'shutdownEventSystem',
      'flushAllPendingSaves',
      'shutdownAppLogging',
      'releaseDesktopStoreLock',
    ])
  })

  it('logs flush failures and still shuts down logging and releases the lock', async () => {
    const { runElectronBeforeQuitCleanup } = await import('../before-quit.js')
    const logger = { error: vi.fn() }
    const { calls, options } = createOptions()
    const flushError = new Error('flush failed')
    options.flushAllPendingSaves.mockImplementationOnce(async () => {
      calls.push('flushAllPendingSaves')
      throw flushError
    })

    await runElectronBeforeQuitCleanup(options, logger)

    expect(logger.error).toHaveBeenCalledWith('[Shutdown] flushAllPendingSaves error:', flushError)
    expect(calls.slice(-3)).toEqual([
      'flushAllPendingSaves',
      'shutdownAppLogging',
      'releaseDesktopStoreLock',
    ])
  })

  it('uses Electron app by default', async () => {
    const { registerElectronBeforeQuitCleanup } = await import('../before-quit.js')
    const { options } = createOptions()

    registerElectronBeforeQuitCleanup(options)

    expect(mocks.on).toHaveBeenCalledWith('before-quit', expect.any(Function))
  })

  it('tears the plugin system down inside the synchronous prefix — before any await', async () => {
    /*
     * **这条是真机走查抓到的那个缺陷的回归防线。**
     *
     * `before-quit` 的监听器不被 Electron await,所以这张表只有第一个 await
     * 之前的同步段是有保证的。实测:一次 Cmd+Q 里链条断在 `shutdownMCP` 里,
     * `[EventSystem] Shut down` 与 store lock 释放都没跑到 —— 而插件拆除当时
     * 排在第 11 位,插件在 onDispose 里写的数据全丢。
     *
     * 判据不是"顺序在前",而是"**不 await 也已经跑过**":只要有人把它挪到
     * 任何一个 await 后面,这条立刻红。
     */
    const { runElectronBeforeQuitCleanup } = await import('../before-quit.js')
    const { calls, options } = createOptions()
    // 第一个异步步骤永不 resolve —— 模拟进程在那里被杀掉。
    options.shutdownVoiceService = vi.fn(() => new Promise<void>(() => {})) as never

    // **刻意不 await**:同步段应当已经跑完了。
    void runElectronBeforeQuitCleanup(options as never)

    expect(calls, 'plugin teardown must complete before the first await').toContain('shutdownPlugins')
    // 而后面的东西确实还没跑 —— 证明我们真的卡在第一个 await 上。
    expect(calls).not.toContain('shutdownEventSystem')
    expect(calls).not.toContain('releaseDesktopStoreLock')
  })

  it('tears the plugin system down before the event bus closes', async () => {
    /*
     * 桌面宿主是**唯一真的跑插件的宿主**,它的退出路径就是这张表 ——
     * `backend.shutdown()` 里那句 `getPluginManager()?.shutdown()` 只有
     * apps/server 走得到,而 server 从不 bootstrap 插件。这条用例钉住两件事:
     * 插件项真的在表里跑到,且排在总线关闭之前(插件 dispose 还要发 cleared)。
     */
    const { runElectronBeforeQuitCleanup } = await import('../before-quit.js')
    const { calls, options } = createOptions()

    await runElectronBeforeQuitCleanup(options as never)

    expect(calls).toContain('shutdownPlugins')
    expect(calls.indexOf('shutdownPlugins')).toBeLessThan(calls.indexOf('shutdownEventSystem'))
    expect(calls.indexOf('shutdownPlugins')).toBeLessThan(calls.indexOf('shutdownSessionLayer'))
  })
})
