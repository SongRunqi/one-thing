import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  setProxy: vi.fn(),
}))

vi.mock('electron', () => ({
  session: {
    defaultSession: {
      setProxy: mocks.setProxy,
    },
  },
}))

describe('electron network proxy', () => {
  beforeEach(() => {
    mocks.setProxy.mockReset()
    mocks.setProxy.mockResolvedValue(undefined)
  })

  it('applies direct mode when proxy is disabled', async () => {
    const { applyElectronNetworkProxySettings } = await import('../proxy.js')

    await applyElectronNetworkProxySettings({ enabled: false })

    expect(mocks.setProxy).toHaveBeenCalledWith({ mode: 'direct' })
  })

  it('applies fixed server rules when proxy is enabled', async () => {
    const { applyElectronNetworkProxySettings } = await import('../proxy.js')

    await applyElectronNetworkProxySettings({
      enabled: true,
      proxyRules: 'http://127.0.0.1:7890',
      proxyBypassRules: 'localhost;127.0.0.1',
    })

    expect(mocks.setProxy).toHaveBeenCalledWith({
      mode: 'fixed_servers',
      proxyRules: 'http://127.0.0.1:7890',
      proxyBypassRules: 'localhost;127.0.0.1',
    })
  })

  it('can use an injected Electron session for tests or alternate hosts', async () => {
    const { applyElectronNetworkProxySettings } = await import('../proxy.js')
    const injectedSession = {
      setProxy: vi.fn().mockResolvedValue(undefined),
    }

    await applyElectronNetworkProxySettings(
      { enabled: false },
      { session: injectedSession },
    )

    expect(injectedSession.setProxy).toHaveBeenCalledWith({ mode: 'direct' })
    expect(mocks.setProxy).not.toHaveBeenCalled()
  })
})
