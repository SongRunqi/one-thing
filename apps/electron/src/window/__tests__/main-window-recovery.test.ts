import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('electron main window recovery', () => {
  function createWindow(overrides: Record<string, unknown> = {}) {
    const handlers = new Map<string, (...args: any[]) => unknown>()
    const webContents = {
      getURL: vi.fn(() => 'app://main'),
      reloadIgnoringCache: vi.fn(),
      invalidate: vi.fn(),
      isDestroyed: vi.fn(() => false),
      isCrashed: vi.fn(() => false),
      isLoading: vi.fn(() => false),
      executeJavaScript: vi.fn(async () => 'ready'),
      on: vi.fn((event: string, handler: (...args: any[]) => unknown) => {
        handlers.set(event, handler)
      }),
      emit: (event: string, ...args: any[]) => handlers.get(event)?.({}, ...args),
    }
    return {
      isDestroyed: vi.fn(() => false),
      isVisible: vi.fn(() => true),
      webContents,
      ...overrides,
    } as any
  }

  function createOptions(mainWindow = createWindow()) {
    return {
      mainWindow,
      loadMainWindowContent: vi.fn(),
      logger: {
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      },
      now: vi.fn(() => 10_000),
      reloadDebounceMs: 5000,
    }
  }

  beforeEach(async () => {
    const { resetElectronMainWindowRecoveryState } = await import('../main-window-recovery.js')
    resetElectronMainWindowRecoveryState()
  })

  it('reloads the renderer on main-frame load failure', async () => {
    const { attachElectronMainWindowRecovery } = await import('../main-window-recovery.js')
    const options = createOptions()

    attachElectronMainWindowRecovery(options)
    options.mainWindow.webContents.emit('did-fail-load', 500, 'boom', 'app://main', true)

    expect(options.logger.error).toHaveBeenCalledWith('[Window] Main window failed to load:', {
      errorCode: 500,
      errorDescription: 'boom',
      validatedURL: 'app://main',
    })
    expect(options.mainWindow.webContents.reloadIgnoringCache).toHaveBeenCalledTimes(1)
  })

  it('ignores aborted and subframe load failures', async () => {
    const { attachElectronMainWindowRecovery } = await import('../main-window-recovery.js')
    const options = createOptions()

    attachElectronMainWindowRecovery(options)
    options.mainWindow.webContents.emit('did-fail-load', -3, 'aborted', 'app://main', true)
    options.mainWindow.webContents.emit('did-fail-load', 500, 'subframe', 'app://frame', false)

    expect(options.mainWindow.webContents.reloadIgnoringCache).not.toHaveBeenCalled()
  })

  it('does not reload on clean renderer exits', async () => {
    const { attachElectronMainWindowRecovery } = await import('../main-window-recovery.js')
    const options = createOptions()

    attachElectronMainWindowRecovery(options)
    options.mainWindow.webContents.emit('render-process-gone', { reason: 'clean-exit' })

    expect(options.mainWindow.webContents.reloadIgnoringCache).not.toHaveBeenCalled()
  })

  it('loads content directly when there is no current URL', async () => {
    const { reloadElectronMainWindowRenderer } = await import('../main-window-recovery.js')
    const mainWindow = createWindow()
    mainWindow.webContents.getURL.mockReturnValue('')
    const options = createOptions(mainWindow)

    expect(reloadElectronMainWindowRenderer(options, 'manual')).toBe(true)

    expect(options.loadMainWindowContent).toHaveBeenCalledWith(mainWindow, 'manual')
    expect(mainWindow.webContents.reloadIgnoringCache).not.toHaveBeenCalled()
  })

  it('recovers an unhealthy visible renderer after system resume', async () => {
    const { recoverElectronMainWindowAfterSystemResume } = await import('../main-window-recovery.js')
    const mainWindow = createWindow()
    mainWindow.webContents.executeJavaScript.mockResolvedValue('blank')
    const options = {
      ...createOptions(mainWindow),
      sleep: vi.fn(async () => undefined),
      healthCheckDelayMs: 1,
    }

    await recoverElectronMainWindowAfterSystemResume({ ...options, source: 'unlock-screen' })

    expect(mainWindow.webContents.invalidate).toHaveBeenCalledTimes(1)
    expect(options.sleep).toHaveBeenCalledWith(1)
    expect(options.logger.warn).toHaveBeenCalledWith('[Window] Main window renderer unhealthy after unlock-screen:', 'blank')
    expect(mainWindow.webContents.reloadIgnoringCache).toHaveBeenCalledTimes(1)
  })

  it('only repaints hidden windows after system resume', async () => {
    const { recoverElectronMainWindowAfterSystemResume } = await import('../main-window-recovery.js')
    const mainWindow = createWindow()
    mainWindow.isVisible.mockReturnValue(false)
    const options = {
      ...createOptions(mainWindow),
      sleep: vi.fn(async () => undefined),
    }

    await recoverElectronMainWindowAfterSystemResume(options)

    expect(mainWindow.webContents.invalidate).toHaveBeenCalledTimes(1)
    expect(options.sleep).not.toHaveBeenCalled()
    expect(mainWindow.webContents.executeJavaScript).not.toHaveBeenCalled()
  })
})
