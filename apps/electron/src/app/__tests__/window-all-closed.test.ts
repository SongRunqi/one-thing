import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  on: vi.fn(),
  quit: vi.fn(),
}))

vi.mock('electron', () => ({
  app: {
    on: mocks.on,
    quit: mocks.quit,
  },
}))

describe('electron window-all-closed handler', () => {
  it('quits on non-mac platforms when voice keepalive is disabled', async () => {
    const { registerElectronWindowAllClosedHandler } = await import('../window-all-closed.js')
    const app = { on: vi.fn(), quit: vi.fn() }

    registerElectronWindowAllClosedHandler({
      app,
      platform: 'linux',
      isVoiceKeepAliveEnabled: () => false,
    })
    app.on.mock.calls[0][1]()

    expect(app.on).toHaveBeenCalledWith('window-all-closed', expect.any(Function))
    expect(app.quit).toHaveBeenCalledTimes(1)
  })

  it('keeps the process alive on macOS and while voice keepalive is enabled', async () => {
    const { registerElectronWindowAllClosedHandler } = await import('../window-all-closed.js')
    const darwinApp = { on: vi.fn(), quit: vi.fn() }
    const voiceApp = { on: vi.fn(), quit: vi.fn() }

    registerElectronWindowAllClosedHandler({
      app: darwinApp,
      platform: 'darwin',
      isVoiceKeepAliveEnabled: () => false,
    })
    registerElectronWindowAllClosedHandler({
      app: voiceApp,
      platform: 'linux',
      isVoiceKeepAliveEnabled: () => true,
    })

    darwinApp.on.mock.calls[0][1]()
    voiceApp.on.mock.calls[0][1]()

    expect(darwinApp.quit).not.toHaveBeenCalled()
    expect(voiceApp.quit).not.toHaveBeenCalled()
  })

  it('uses Electron app by default', async () => {
    const { registerElectronWindowAllClosedHandler } = await import('../window-all-closed.js')

    registerElectronWindowAllClosedHandler({
      isVoiceKeepAliveEnabled: () => true,
    })

    expect(mocks.on).toHaveBeenCalledWith('window-all-closed', expect.any(Function))
  })
})
