import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

import { registerElectronSkillsIpcHandlers } from '../skills.js'

describe('electron skills IPC host', () => {
  it('registers skills handlers against the provided IPC host', async () => {
    const handle = vi.fn()
    const getAll = vi.fn().mockResolvedValue({ success: true, skills: [] })
    const refresh = vi.fn().mockResolvedValue({ success: true, skills: [] })
    const readFile = vi.fn().mockResolvedValue({ success: true, content: 'body' })
    const openDirectory = vi.fn().mockResolvedValue({ success: true })
    const create = vi.fn().mockResolvedValue({ success: true, skill: {} })
    const deleteSkill = vi.fn().mockResolvedValue({ success: true })
    const toggleEnabled = vi.fn().mockResolvedValue({ success: true })

    registerElectronSkillsIpcHandlers({
      channels: {
        getAll: 'skills:get-all',
        refresh: 'skills:refresh',
        readFile: 'skills:read-file',
        openDirectory: 'skills:open-directory',
        create: 'skills:create',
        delete: 'skills:delete',
        toggleEnabled: 'skills:toggle-enabled',
      },
      getAll,
      refresh,
      readFile,
      openDirectory,
      create,
      delete: deleteSkill,
      toggleEnabled,
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(7)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'skills:get-all',
      'skills:refresh',
      'skills:read-file',
      'skills:open-directory',
      'skills:create',
      'skills:delete',
      'skills:toggle-enabled',
    ])

    const getAllRequest = { workingDirectory: '/repo' }
    const readRequest = { skillId: 's1', fileName: 'SKILL.md' }
    const openRequest = { skillId: 's1' }
    const createRequest = { name: 'new', description: 'desc', instructions: 'do it' }
    const deleteRequest = { skillId: 's1' }
    const toggleRequest = { skillId: 's1', enabled: true }

    await expect(handle.mock.calls[0][1]({}, getAllRequest)).resolves.toEqual({ success: true, skills: [] })
    await expect(handle.mock.calls[1][1]({})).resolves.toEqual({ success: true, skills: [] })
    await expect(handle.mock.calls[2][1]({}, readRequest)).resolves.toEqual({ success: true, content: 'body' })
    await expect(handle.mock.calls[3][1]({}, openRequest)).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[4][1]({}, createRequest)).resolves.toEqual({ success: true, skill: {} })
    await expect(handle.mock.calls[5][1]({}, deleteRequest)).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[6][1]({}, toggleRequest)).resolves.toEqual({ success: true })

    expect(getAll).toHaveBeenCalledWith(getAllRequest)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(readFile).toHaveBeenCalledWith(readRequest)
    expect(openDirectory).toHaveBeenCalledWith(openRequest)
    expect(create).toHaveBeenCalledWith(createRequest)
    expect(deleteSkill).toHaveBeenCalledWith(deleteRequest)
    expect(toggleEnabled).toHaveBeenCalledWith(toggleRequest)
  })
})
