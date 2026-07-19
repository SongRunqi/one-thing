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

  it('registers directory-management and agent-assignment handlers when provided', async () => {
    const handle = vi.fn()
    const listDirectories = vi.fn().mockResolvedValue({ success: true, directories: [] })
    const addDirectory = vi.fn().mockResolvedValue({ success: true, directory: {} })
    const updateDirectory = vi.fn().mockResolvedValue({ success: true, directory: {} })
    const removeDirectory = vi.fn().mockResolvedValue({ success: true })
    const setAgent = vi.fn().mockResolvedValue({ success: true })

    registerElectronSkillsIpcHandlers({
      channels: {
        getAll: 'skills:get-all',
        refresh: 'skills:refresh',
        readFile: 'skills:read-file',
        openDirectory: 'skills:open-directory',
        create: 'skills:create',
        delete: 'skills:delete',
        toggleEnabled: 'skills:toggle-enabled',
        listDirectories: 'skills:list-directories',
        addDirectory: 'skills:add-directory',
        updateDirectory: 'skills:update-directory',
        removeDirectory: 'skills:remove-directory',
        setAgent: 'skills:set-agent',
      },
      getAll: vi.fn(),
      refresh: vi.fn(),
      readFile: vi.fn(),
      openDirectory: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      toggleEnabled: vi.fn(),
      listDirectories,
      addDirectory,
      updateDirectory,
      removeDirectory,
      setAgent,
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(12)
    const channels = handle.mock.calls.map(call => call[0])
    expect(channels).toContain('skills:list-directories')
    expect(channels).toContain('skills:add-directory')
    expect(channels).toContain('skills:update-directory')
    expect(channels).toContain('skills:remove-directory')
    expect(channels).toContain('skills:set-agent')

    const handlerFor = (channel: string) =>
      handle.mock.calls.find(call => call[0] === channel)![1]

    const addRequest = { path: '/team/skills', agentId: 'writer' }
    const updateRequest = { id: 'dir-1', enabled: false }
    const removeRequest = { id: 'dir-1' }
    const setAgentRequest = { skillId: 'user:demo', agentId: 'writer' }

    await expect(handlerFor('skills:list-directories')({})).resolves.toEqual({ success: true, directories: [] })
    await expect(handlerFor('skills:add-directory')({}, addRequest)).resolves.toEqual({ success: true, directory: {} })
    await expect(handlerFor('skills:update-directory')({}, updateRequest)).resolves.toEqual({ success: true, directory: {} })
    await expect(handlerFor('skills:remove-directory')({}, removeRequest)).resolves.toEqual({ success: true })
    await expect(handlerFor('skills:set-agent')({}, setAgentRequest)).resolves.toEqual({ success: true })

    expect(addDirectory).toHaveBeenCalledWith(addRequest)
    expect(updateDirectory).toHaveBeenCalledWith(updateRequest)
    expect(removeDirectory).toHaveBeenCalledWith(removeRequest)
    expect(setAgent).toHaveBeenCalledWith(setAgentRequest)
  })
})
