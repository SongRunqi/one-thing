import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

import { registerElectronProjectDirsIpcHandlers } from '../project-dirs-controller.js'

describe('electron project-dirs IPC host', () => {
  it('registers project directory handlers against the provided IPC host', async () => {
    const handle = vi.fn()
    const logger = { log: vi.fn() }
    const listProjectDirs = vi.fn().mockResolvedValue({ success: true, entries: [] })
    const getProjectDir = vi.fn().mockResolvedValue({ success: true, project: null })
    const addProjectDir = vi.fn().mockResolvedValue({ success: true, project: { path: '/repo' } })
    const updateProjectDir = vi.fn().mockResolvedValue({ success: true, project: { path: '/repo' } })
    const removeProjectDir = vi.fn().mockResolvedValue({ success: true })

    registerElectronProjectDirsIpcHandlers({
      channels: {
        list: 'project-dirs:list',
        get: 'project-dirs:get',
        add: 'project-dirs:add',
        update: 'project-dirs:update',
        remove: 'project-dirs:remove',
      },
      listProjectDirs,
      getProjectDir,
      addProjectDir,
      updateProjectDir,
      removeProjectDir,
      ipcMain: { handle },
      logger,
    })

    expect(handle).toHaveBeenCalledTimes(5)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'project-dirs:list',
      'project-dirs:get',
      'project-dirs:add',
      'project-dirs:update',
      'project-dirs:remove',
    ])

    const getRequest = { path: '/repo' }
    const addRequest = { path: '/repo', description: 'main repo' }
    const updateRequest = { path: '/repo', description: 'updated repo' }
    const removeRequest = { path: '/repo' }

    await expect(handle.mock.calls[0][1]({})).resolves.toEqual({ success: true, entries: [] })
    await expect(handle.mock.calls[1][1]({}, getRequest)).resolves.toEqual({ success: true, project: null })
    await expect(handle.mock.calls[2][1]({}, addRequest)).resolves.toEqual({ success: true, project: { path: '/repo' } })
    await expect(handle.mock.calls[3][1]({}, updateRequest)).resolves.toEqual({ success: true, project: { path: '/repo' } })
    await expect(handle.mock.calls[4][1]({}, removeRequest)).resolves.toEqual({ success: true })

    expect(listProjectDirs).toHaveBeenCalledWith()
    expect(getProjectDir).toHaveBeenCalledWith(getRequest)
    expect(addProjectDir).toHaveBeenCalledWith(addRequest)
    expect(updateProjectDir).toHaveBeenCalledWith(updateRequest)
    expect(removeProjectDir).toHaveBeenCalledWith(removeRequest)
    expect(logger.log).toHaveBeenCalledWith('[project-dirs] IPC handlers registered (list/get/add/update/remove)')
  })
})
