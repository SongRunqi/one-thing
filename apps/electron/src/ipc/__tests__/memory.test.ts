import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

import { registerElectronMemoryIpcHandlers } from '../memory.js'

describe('electron memory IPC host', () => {
  it('registers memory handlers from definitions against the provided IPC host', async () => {
    const handle = vi.fn()
    const overview = vi.fn().mockResolvedValue({ success: true, overview: {} })
    const search = vi.fn().mockResolvedValue({ success: true, hits: [] })

    registerElectronMemoryIpcHandlers({
      handlers: [
        { channel: 'memory:overview', handle: overview },
        { channel: 'memory:search', handle: search },
      ],
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(2)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'memory:overview',
      'memory:search',
    ])

    const request = { agentId: 'default', query: 'hello' }
    await expect(handle.mock.calls[0][1]({}, request)).resolves.toEqual({ success: true, overview: {} })
    await expect(handle.mock.calls[1][1]({}, request)).resolves.toEqual({ success: true, hits: [] })
    expect(overview).toHaveBeenCalledWith(request)
    expect(search).toHaveBeenCalledWith(request)
  })
})
