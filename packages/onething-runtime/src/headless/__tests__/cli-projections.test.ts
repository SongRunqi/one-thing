import { describe, expect, it } from 'vitest'
import {
  listOnethingHeadlessProviderModels,
  listOnethingHeadlessProviderSummaries,
  listOnethingHeadlessSessionSummaries,
  listOnethingHeadlessToolSummaries,
  setOnethingHeadlessPermissionMode,
  updateOnethingHeadlessToolSetting,
  upsertOnethingHeadlessProviderConfig,
  useOnethingHeadlessProvider,
} from '../cli-projections.js'

describe('headless CLI projections', () => {
  it('projects session summaries for daemon clients', () => {
    expect(listOnethingHeadlessSessionSummaries([{
      id: 's1',
      name: 'Chat',
      createdAt: 1,
      updatedAt: 2,
      previewText: 'hello',
      messageCount: 3,
      isPinned: true,
      isArchived: false,
      lastProvider: 'openai',
      lastModel: 'gpt',
    }])).toEqual([{
      id: 's1',
      name: 'Chat',
      createdAt: 1,
      updatedAt: 2,
      previewText: 'hello',
      messageCount: 3,
      isPinned: true,
      isArchived: false,
      lastProvider: 'openai',
      lastModel: 'gpt',
    }])
  })

  it('owns provider summaries, selection, upsert, and model ordering', () => {
    const settings = {
      ai: {
        provider: 'openai',
        providers: {
          openai: {
            enabled: true,
            model: 'gpt-4.1',
            selectedModels: ['gpt-4.1-mini'],
            models: {
              'gpt-4.1': {},
              'gpt-5': {},
            },
          },
        },
      },
      tools: { permissionMode: 'normal', tools: {} },
    }

    expect(listOnethingHeadlessProviderSummaries(settings)).toEqual([{
      id: 'openai',
      model: 'gpt-4.1',
      enabled: true,
      selectedModels: ['gpt-4.1-mini'],
      isDefault: true,
    }])

    expect(listOnethingHeadlessProviderModels(settings, 'openai')).toEqual([
      'gpt-4.1-mini',
      'gpt-4.1',
      'gpt-5',
    ])

    expect(useOnethingHeadlessProvider(settings, 'openai', 'gpt-5')).toMatchObject({
      id: 'openai',
      model: 'gpt-5',
      isDefault: true,
    })

    expect(upsertOnethingHeadlessProviderConfig(
      settings,
      'custom',
      { enabled: true, model: 'local' },
      () => ({ model: '', selectedModels: [] }),
    )).toEqual({
      id: 'custom',
      enabled: true,
      model: 'local',
      selectedModels: [],
      isDefault: false,
    })
  })

  it('owns tool summaries, tool setting updates, and permission mode mutation', () => {
    const settings = {
      ai: { providers: {} },
      tools: {
        permissionMode: 'normal',
        tools: {
          bash: { enabled: true, autoExecute: false },
        },
      },
    }

    expect(listOnethingHeadlessToolSummaries([{
      id: 'bash',
      name: 'Bash',
      enabled: true,
      autoExecute: false,
      category: 'builtin',
    }])).toEqual([{
      id: 'bash',
      name: 'Bash',
      enabled: true,
      autoExecute: false,
      category: 'builtin',
    }])

    updateOnethingHeadlessToolSetting(settings, 'bash', { autoExecute: true })
    expect(settings.tools.tools.bash).toEqual({ enabled: true, autoExecute: true })

    expect(setOnethingHeadlessPermissionMode(settings, 'auto').tools.permissionMode).toBe('auto')
  })
})
