import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

import { registerElectronOAuthIpcHandlers } from '../oauth.js'

describe('electron OAuth IPC host', () => {
  it('registers OAuth handlers against the provided IPC host', async () => {
    const handle = vi.fn()
    const start = vi.fn().mockResolvedValue({ success: true, flowId: 'flow-1' })
    const callback = vi.fn().mockResolvedValue({ success: true })
    const devicePoll = vi.fn().mockResolvedValue({ success: true, completed: false })
    const refresh = vi.fn().mockResolvedValue({ success: true })
    const status = vi.fn().mockResolvedValue({ success: true, providerId: 'codex', isLoggedIn: true })
    const logout = vi.fn().mockResolvedValue({ success: true })

    registerElectronOAuthIpcHandlers({
      channels: {
        start: 'oauth:start',
        callback: 'oauth:callback',
        devicePoll: 'oauth:device-poll',
        refresh: 'oauth:refresh',
        status: 'oauth:status',
        logout: 'oauth:logout',
      },
      start,
      callback,
      devicePoll,
      refresh,
      status,
      logout,
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(6)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'oauth:start',
      'oauth:callback',
      'oauth:device-poll',
      'oauth:refresh',
      'oauth:status',
      'oauth:logout',
    ])

    const providerRequest = { providerId: 'codex' }
    const callbackRequest = { providerId: 'codex', code: 'code', state: 'state' }
    const devicePollRequest = { providerId: 'codex', flowId: 'flow-1', deviceCode: 'device-code' }

    await expect(handle.mock.calls[0][1]({}, providerRequest)).resolves.toEqual({
      success: true,
      flowId: 'flow-1',
    })
    await expect(handle.mock.calls[1][1]({}, callbackRequest)).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[2][1]({}, devicePollRequest)).resolves.toEqual({
      success: true,
      completed: false,
    })
    await expect(handle.mock.calls[3][1]({}, providerRequest)).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[4][1]({}, providerRequest)).resolves.toEqual({
      success: true,
      providerId: 'codex',
      isLoggedIn: true,
    })
    await expect(handle.mock.calls[5][1]({}, providerRequest)).resolves.toEqual({ success: true })

    expect(start).toHaveBeenCalledWith(providerRequest)
    expect(callback).toHaveBeenCalledWith(callbackRequest)
    expect(devicePoll).toHaveBeenCalledWith(devicePollRequest)
    expect(refresh).toHaveBeenCalledWith(providerRequest)
    expect(status).toHaveBeenCalledWith(providerRequest)
    expect(logout).toHaveBeenCalledWith(providerRequest)
  })
})
