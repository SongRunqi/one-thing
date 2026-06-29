import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

import { registerElectronModelsIpcHandlers } from '../models.js'

describe('electron models IPC host', () => {
  it('registers model handlers against the provided IPC host', async () => {
    const handle = vi.fn()
    const getModelsWithCapabilities = vi.fn().mockResolvedValue({ success: true, models: ['capable'] })
    const getAllModels = vi.fn().mockResolvedValue({ success: true, models: ['all'] })
    const searchModels = vi.fn().mockResolvedValue({ success: true, models: ['search'] })
    const refreshModelRegistry = vi.fn().mockResolvedValue({ success: true })
    const getModelNameAliases = vi.fn().mockResolvedValue({ success: true, aliases: { gpt4: 'gpt-4' } })
    const getModelDisplayName = vi.fn().mockResolvedValue({ success: true, displayName: 'GPT-4' })

    registerElectronModelsIpcHandlers({
      channels: {
        getWithCapabilities: 'models:get-with-capabilities',
        getAll: 'models:get-all',
        search: 'models:search',
        refreshRegistry: 'models:refresh-registry',
        getNameAliases: 'models:get-name-aliases',
        getDisplayName: 'models:get-display-name',
      },
      getModelsWithCapabilities,
      getAllModels,
      searchModels,
      refreshModelRegistry,
      getModelNameAliases,
      getModelDisplayName,
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(6)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'models:get-with-capabilities',
      'models:get-all',
      'models:search',
      'models:refresh-registry',
      'models:get-name-aliases',
      'models:get-display-name',
    ])

    const modelsRequest = { providerId: 'codex', forceRefresh: true }
    const searchRequest = { query: 'gpt', providerId: 'openai' }
    const displayNameRequest = { modelId: 'gpt-4' }

    await expect(handle.mock.calls[0][1]({}, modelsRequest)).resolves.toEqual({
      success: true,
      models: ['capable'],
    })
    await expect(handle.mock.calls[1][1]({})).resolves.toEqual({ success: true, models: ['all'] })
    await expect(handle.mock.calls[2][1]({}, searchRequest)).resolves.toEqual({
      success: true,
      models: ['search'],
    })
    await expect(handle.mock.calls[3][1]({})).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[4][1]({})).resolves.toEqual({
      success: true,
      aliases: { gpt4: 'gpt-4' },
    })
    await expect(handle.mock.calls[5][1]({}, displayNameRequest)).resolves.toEqual({
      success: true,
      displayName: 'GPT-4',
    })

    expect(getModelsWithCapabilities).toHaveBeenCalledWith(modelsRequest)
    expect(getAllModels).toHaveBeenCalledWith()
    expect(searchModels).toHaveBeenCalledWith(searchRequest)
    expect(refreshModelRegistry).toHaveBeenCalledWith()
    expect(getModelNameAliases).toHaveBeenCalledWith()
    expect(getModelDisplayName).toHaveBeenCalledWith(displayNameRequest)
  })
})
