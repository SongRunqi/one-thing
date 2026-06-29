import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

import { registerElectronFilesIpcHandlers } from '../files.js'

describe('electron files IPC host', () => {
  it('registers files handlers against the provided IPC host', async () => {
    const handle = vi.fn()
    const handlers = {
      listFiles: vi.fn().mockResolvedValue({ success: true, files: [] }),
      rollback: vi.fn().mockResolvedValue({ success: true }),
      listDirs: vi.fn().mockResolvedValue({ success: true, directories: [] }),
      readContent: vi.fn().mockResolvedValue({ success: true, content: 'body' }),
      saveContent: vi.fn().mockResolvedValue({ success: true }),
      listDirectory: vi.fn().mockResolvedValue({ success: true, entries: [] }),
      stat: vi.fn().mockResolvedValue({ success: true, stat: {} }),
      create: vi.fn().mockResolvedValue({ success: true }),
      createDirectory: vi.fn().mockResolvedValue({ success: true }),
      rename: vi.fn().mockResolvedValue({ success: true }),
      delete: vi.fn().mockResolvedValue({ success: true }),
      reveal: vi.fn().mockResolvedValue({ success: true }),
      watchStart: vi.fn().mockResolvedValue({ success: true }),
      watchStop: vi.fn().mockResolvedValue({ success: true }),
    }

    registerElectronFilesIpcHandlers({
      channels: {
        listFiles: 'files:list',
        rollback: 'files:rollback',
        listDirs: 'dirs:list',
        readContent: 'file:read-content',
        saveContent: 'file:save-content',
        listDirectory: 'file:list-directory',
        stat: 'file:stat',
        create: 'file:create',
        createDirectory: 'file:create-directory',
        rename: 'file:rename',
        delete: 'file:delete',
        reveal: 'file:reveal',
        watchStart: 'file:watch-start',
        watchStop: 'file:watch-stop',
      },
      ...handlers,
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(14)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'files:list',
      'files:rollback',
      'dirs:list',
      'file:read-content',
      'file:save-content',
      'file:list-directory',
      'file:stat',
      'file:create',
      'file:create-directory',
      'file:rename',
      'file:delete',
      'file:reveal',
      'file:watch-start',
      'file:watch-stop',
    ])

    const request = { path: '/repo/file.txt' }
    await expect(handle.mock.calls[0][1]({}, request)).resolves.toEqual({ success: true, files: [] })
    await expect(handle.mock.calls[3][1]({}, request)).resolves.toEqual({ success: true, content: 'body' })
    await expect(handle.mock.calls[13][1]({}, request)).resolves.toEqual({ success: true })

    expect(handlers.listFiles).toHaveBeenCalledWith(request)
    expect(handlers.readContent).toHaveBeenCalledWith(request)
    expect(handlers.watchStop).toHaveBeenCalledWith(request)
  })
})
