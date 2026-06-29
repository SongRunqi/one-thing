import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

import { registerElectronProvidersIpcHandlers } from '../providers.js'

describe('electron providers IPC host', () => {
  it('registers provider handlers against the provided IPC host', async () => {
    const handle = vi.fn()
    const listProviders = vi.fn().mockResolvedValue({ success: true, providers: [] })
    const getUsage = vi.fn().mockResolvedValue({ success: true, providerId: 'codex' })
    const getEnvStatus = vi.fn().mockResolvedValue({ success: true, status: { providerId: 'openai' } })

    registerElectronProvidersIpcHandlers({
      channels: {
        list: 'providers:get-all',
        usage: 'providers:get-usage',
        envStatus: 'providers:get-env-status',
      },
      listProviders,
      getUsage,
      getEnvStatus,
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(3)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'providers:get-all',
      'providers:get-usage',
      'providers:get-env-status',
    ])

    const usageRequest = { providerId: 'codex' }
    const envStatusRequest = { providerId: 'openai' }

    await expect(handle.mock.calls[0][1]({})).resolves.toEqual({ success: true, providers: [] })
    await expect(handle.mock.calls[1][1]({}, usageRequest)).resolves.toEqual({ success: true, providerId: 'codex' })
    await expect(handle.mock.calls[2][1]({}, envStatusRequest)).resolves.toEqual({
      success: true,
      status: { providerId: 'openai' },
    })

    expect(listProviders).toHaveBeenCalledWith()
    expect(getUsage).toHaveBeenCalledWith(usageRequest)
    expect(getEnvStatus).toHaveBeenCalledWith(envStatusRequest)
  })
})
