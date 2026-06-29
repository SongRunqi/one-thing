import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

import { registerElectronPromptsIpcHandlers } from '../prompts.js'

describe('electron prompts IPC host', () => {
  it('registers prompt handlers against the provided IPC host', async () => {
    const handle = vi.fn()
    const listPrompts = vi.fn().mockResolvedValue({ success: true, prompts: [] })
    const getPrompt = vi.fn().mockResolvedValue({ success: true, prompt: { id: 'prompt-1' } })
    const createPrompt = vi.fn().mockResolvedValue({ success: true, prompt: { id: 'prompt-2' } })
    const updatePrompt = vi.fn().mockResolvedValue({ success: true, prompt: { id: 'prompt-1', title: 'New' } })
    const deletePrompt = vi.fn().mockResolvedValue({ success: true })

    registerElectronPromptsIpcHandlers({
      channels: {
        list: 'prompts:list',
        get: 'prompts:get',
        create: 'prompts:create',
        update: 'prompts:update',
        delete: 'prompts:delete',
      },
      listPrompts,
      getPrompt,
      createPrompt,
      updatePrompt,
      deletePrompt,
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(5)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'prompts:list',
      'prompts:get',
      'prompts:create',
      'prompts:update',
      'prompts:delete',
    ])

    const getRequest = { id: 'prompt-1' }
    const createRequest = { title: 'Tone', body: 'Be direct' }
    const updateRequest = { id: 'prompt-1', title: 'New' }
    const deleteRequest = { id: 'prompt-1' }

    await expect(handle.mock.calls[0][1]({})).resolves.toEqual({ success: true, prompts: [] })
    await expect(handle.mock.calls[1][1]({}, getRequest)).resolves.toEqual({ success: true, prompt: { id: 'prompt-1' } })
    await expect(handle.mock.calls[2][1]({}, createRequest)).resolves.toEqual({ success: true, prompt: { id: 'prompt-2' } })
    await expect(handle.mock.calls[3][1]({}, updateRequest)).resolves.toEqual({
      success: true,
      prompt: { id: 'prompt-1', title: 'New' },
    })
    await expect(handle.mock.calls[4][1]({}, deleteRequest)).resolves.toEqual({ success: true })

    expect(listPrompts).toHaveBeenCalledWith()
    expect(getPrompt).toHaveBeenCalledWith(getRequest)
    expect(createPrompt).toHaveBeenCalledWith(createRequest)
    expect(updatePrompt).toHaveBeenCalledWith(updateRequest)
    expect(deletePrompt).toHaveBeenCalledWith(deleteRequest)
  })
})
