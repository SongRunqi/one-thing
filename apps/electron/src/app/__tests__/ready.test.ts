import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  on: vi.fn(),
  getPath: vi.fn((name: string) => `/mock/${name}`),
  quit: vi.fn(),
  showErrorBox: vi.fn(),
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    on: mocks.on,
    getPath: mocks.getPath,
    quit: mocks.quit,
  },
  dialog: {
    showErrorBox: mocks.showErrorBox,
  },
}))

describe('electron ready handler', () => {
  function createApp(overrides: Record<string, unknown> = {}) {
    return {
      isPackaged: false,
      on: vi.fn(),
      getPath: vi.fn((name: string) => `/tmp/${name}`),
      quit: vi.fn(),
      ...overrides,
    } as any
  }

  function createOptions(overrides: Record<string, unknown> = {}) {
    const calls: string[] = []
    const options = {
      configureSandboxHost: vi.fn(() => {
        calls.push('configureSandboxHost')
      }),
      hydratePackagedEnvironment: vi.fn(async () => {
        calls.push('hydratePackagedEnvironment')
      }),
      acquireDesktopStoreLock: vi.fn(async () => {
        calls.push('acquireDesktopStoreLock')
      }),
      formatDesktopStoreLockError: vi.fn(() => 'formatted lock error'),
      onReady: vi.fn(async () => {
        calls.push('onReady')
      }),
      ...overrides,
    } as any
    return { calls, options }
  }

  it('configures store paths from Electron host state', async () => {
    const { configureElectronStorePathHost } = await import('../ready.js')
    const configureStorePathHost = vi.fn()

    configureElectronStorePathHost({
      configureStorePathHost,
      app: { isPackaged: true },
      resourcesPath: '/Applications/onething.app/Contents/Resources',
    })

    expect(configureStorePathHost).toHaveBeenCalledWith({
      isPackaged: true,
      resourcesPath: '/Applications/onething.app/Contents/Resources',
    })
  })

  it('registers ready with Electron app by default', async () => {
    const { registerElectronReadyHandler } = await import('../ready.js')
    const { options } = createOptions()

    registerElectronReadyHandler(options)

    expect(mocks.on).toHaveBeenCalledWith('ready', expect.any(Function))
  })

  it('prepares the host and then runs main initialization', async () => {
    const { runElectronReady } = await import('../ready.js')
    const app = createApp({ isPackaged: true })
    const { calls, options } = createOptions({ app })

    const result = await runElectronReady(options)

    expect(result).toBe(true)
    expect(options.configureSandboxHost).toHaveBeenCalledWith({
      getPath: expect.any(Function),
    })
    expect(options.configureSandboxHost.mock.calls[0][0].getPath('userData')).toBe('/tmp/userData')
    expect(calls).toEqual([
      'configureSandboxHost',
      'hydratePackagedEnvironment',
      'acquireDesktopStoreLock',
      'onReady',
    ])
  })

  it('skips packaged environment hydration in development', async () => {
    const { runElectronReady } = await import('../ready.js')
    const app = createApp({ isPackaged: false })
    const { calls, options } = createOptions({ app })

    await runElectronReady(options)

    expect(calls).toEqual([
      'configureSandboxHost',
      'acquireDesktopStoreLock',
      'onReady',
    ])
  })

  it('shows a lock error, quits, and skips main initialization when lock acquisition fails', async () => {
    const { runElectronReady } = await import('../ready.js')
    const app = createApp()
    const dialog = { showErrorBox: vi.fn() }
    const lockError = new Error('locked')
    const { options } = createOptions({
      app,
      dialog,
      acquireDesktopStoreLock: vi.fn(async () => {
        throw lockError
      }),
    })

    const result = await runElectronReady(options)

    expect(result).toBe(false)
    expect(options.formatDesktopStoreLockError).toHaveBeenCalledWith(lockError)
    expect(dialog.showErrorBox).toHaveBeenCalledWith('Cannot open onething', 'formatted lock error')
    expect(app.quit).toHaveBeenCalledTimes(1)
    expect(options.onReady).not.toHaveBeenCalled()
  })
})
