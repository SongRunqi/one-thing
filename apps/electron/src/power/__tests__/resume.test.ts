import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  on: vi.fn(),
}))

vi.mock('electron', () => ({
  powerMonitor: { on: mocks.on },
}))

describe('electron power resume handlers', () => {
  it('registers resume and unlock handlers with the injected power monitor', async () => {
    const { registerElectronPowerResumeHandlers } = await import('../resume.js')
    const monitor = { on: vi.fn() }

    registerElectronPowerResumeHandlers({
      powerMonitor: monitor,
      getMainWindow: vi.fn(),
      recoverMainWindow: vi.fn(),
    })

    expect(monitor.on).toHaveBeenCalledWith('resume', expect.any(Function))
    expect(monitor.on).toHaveBeenCalledWith('unlock-screen', expect.any(Function))
  })

  it('recovers the current main window for each power event', async () => {
    const { registerElectronPowerResumeHandlers } = await import('../resume.js')
    const monitor = { on: vi.fn() }
    const mainWindow = { isDestroyed: () => false } as any
    const recoverMainWindow = vi.fn().mockResolvedValue(undefined)

    registerElectronPowerResumeHandlers({
      powerMonitor: monitor,
      getMainWindow: () => mainWindow,
      recoverMainWindow,
    })

    await monitor.on.mock.calls[0][1]()
    await monitor.on.mock.calls[1][1]()

    expect(recoverMainWindow).toHaveBeenCalledWith(mainWindow, 'resume')
    expect(recoverMainWindow).toHaveBeenCalledWith(mainWindow, 'unlock-screen')
  })

  it('skips missing or destroyed windows and logs recovery failures', async () => {
    const { registerElectronPowerResumeHandlers } = await import('../resume.js')
    const monitor = { on: vi.fn() }
    const logger = { error: vi.fn() }
    const recoverError = new Error('resume failed')
    const recoverMainWindow = vi.fn().mockRejectedValue(recoverError)
    const windows = [
      null,
      { isDestroyed: () => true },
      { isDestroyed: () => false },
    ] as any[]

    registerElectronPowerResumeHandlers({
      powerMonitor: monitor,
      getMainWindow: () => windows.shift() ?? null,
      recoverMainWindow,
      logger,
    })

    monitor.on.mock.calls[0][1]()
    monitor.on.mock.calls[0][1]()
    monitor.on.mock.calls[0][1]()
    await Promise.resolve()

    expect(recoverMainWindow).toHaveBeenCalledTimes(1)
    expect(logger.error).toHaveBeenCalledWith('[Window] Resume recovery failed:', recoverError)
  })

  it('uses Electron powerMonitor by default', async () => {
    const { registerElectronPowerResumeHandlers } = await import('../resume.js')

    registerElectronPowerResumeHandlers({
      getMainWindow: vi.fn(),
      recoverMainWindow: vi.fn(),
    })

    expect(mocks.on).toHaveBeenCalledWith('resume', expect.any(Function))
    expect(mocks.on).toHaveBeenCalledWith('unlock-screen', expect.any(Function))
  })
})
