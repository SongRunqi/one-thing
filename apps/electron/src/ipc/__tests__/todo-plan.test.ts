import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

import { registerElectronTodoPlanIpcHandlers } from '../todo-plan.js'

describe('electron todo-plan IPC host', () => {
  it('registers todo-plan handlers against the provided IPC host', async () => {
    const handle = vi.fn()
    const get = vi.fn().mockResolvedValue({ success: true, snapshot: {} })
    const create = vi.fn().mockResolvedValue({ success: true, document: { id: 'new' } })
    const update = vi.fn().mockResolvedValue({ success: true, document: { id: 'updated' } })
    const rename = vi.fn().mockResolvedValue({ success: true, document: { id: 'renamed' } })
    const deleteNote = vi.fn().mockResolvedValue({ success: true })
    const revealDirectory = vi.fn().mockResolvedValue({ success: true })
    const openWindow = vi.fn().mockResolvedValue({ success: true })
    const hideWindow = vi.fn().mockResolvedValue({ success: true })
    const toggleWindow = vi.fn().mockResolvedValue({ success: true })
    const setWindowPinned = vi.fn().mockResolvedValue({ success: true, pinned: true })

    registerElectronTodoPlanIpcHandlers({
      channels: {
        get: 'todo-plan:get',
        create: 'todo-plan:create',
        update: 'todo-plan:update',
        rename: 'todo-plan:rename',
        delete: 'todo-plan:delete',
        revealDirectory: 'todo-plan:reveal-directory',
        openWindow: 'todo-plan:open-window',
        hideWindow: 'todo-plan:hide-window',
        toggleWindow: 'todo-plan:toggle-window',
        setWindowPinned: 'todo-plan:set-window-pinned',
      },
      get,
      create,
      update,
      rename,
      delete: deleteNote,
      revealDirectory,
      openWindow,
      hideWindow,
      toggleWindow,
      setWindowPinned,
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(10)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'todo-plan:get',
      'todo-plan:create',
      'todo-plan:update',
      'todo-plan:rename',
      'todo-plan:delete',
      'todo-plan:reveal-directory',
      'todo-plan:open-window',
      'todo-plan:hide-window',
      'todo-plan:toggle-window',
      'todo-plan:set-window-pinned',
    ])

    const getRequest = { workingDirectory: '/repo' }
    const createRequest = { title: 'Today' }
    const updateRequest = { scope: 'user-note', id: 'today', content: '- [ ] Ship' }
    const renameRequest = { id: 'today', title: 'Later' }
    const deleteRequest = { id: 'today' }
    const windowRequest = { activation: 'preserve-current-app' }
    const pinnedRequest = { pinned: true }

    await expect(handle.mock.calls[0][1]({}, getRequest)).resolves.toEqual({ success: true, snapshot: {} })
    await expect(handle.mock.calls[1][1]({}, createRequest)).resolves.toEqual({
      success: true,
      document: { id: 'new' },
    })
    await expect(handle.mock.calls[2][1]({}, updateRequest)).resolves.toEqual({
      success: true,
      document: { id: 'updated' },
    })
    await expect(handle.mock.calls[3][1]({}, renameRequest)).resolves.toEqual({
      success: true,
      document: { id: 'renamed' },
    })
    await expect(handle.mock.calls[4][1]({}, deleteRequest)).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[5][1]({})).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[6][1]({}, windowRequest)).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[7][1]({}, windowRequest)).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[8][1]({}, windowRequest)).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[9][1]({}, pinnedRequest)).resolves.toEqual({ success: true, pinned: true })

    expect(get).toHaveBeenCalledWith(getRequest)
    expect(create).toHaveBeenCalledWith(createRequest)
    expect(update).toHaveBeenCalledWith(updateRequest)
    expect(rename).toHaveBeenCalledWith(renameRequest)
    expect(deleteNote).toHaveBeenCalledWith(deleteRequest)
    expect(revealDirectory).toHaveBeenCalledWith()
    expect(openWindow).toHaveBeenCalledWith(windowRequest)
    expect(hideWindow).toHaveBeenCalledWith(windowRequest)
    expect(toggleWindow).toHaveBeenCalledWith(windowRequest)
    expect(setWindowPinned).toHaveBeenCalledWith(pinnedRequest)
  })
})
