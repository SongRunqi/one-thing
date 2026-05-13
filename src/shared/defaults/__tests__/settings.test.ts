import { describe, expect, it } from 'vitest'
import { createDefaultSettings, mergeWithDefaults } from '../settings.js'

describe('compact settings defaults', () => {
  it('enables compacting by default', () => {
    const settings = createDefaultSettings()

    expect(settings.chat?.contextCompactEnabled).toBe(true)
    expect(settings.chat?.contextCompactThreshold).toBe(85)
    expect(settings.chat?.contextCompactKeepRecentTurns).toBe(6)
  })

  it('clamps compact numeric settings when merging', () => {
    const settings = mergeWithDefaults({
      chat: {
        contextCompactThreshold: 120,
        contextCompactKeepRecentTurns: 0,
      } as any,
    })

    expect(settings.chat?.contextCompactThreshold).toBe(100)
    expect(settings.chat?.contextCompactKeepRecentTurns).toBe(1)
  })
})

describe('editor settings defaults', () => {
  it('provides stable editor defaults', () => {
    const settings = createDefaultSettings()

    expect(settings.general.editor).toEqual({
      tabSize: 2,
      lineWrapping: true,
      syntaxHighlighting: true,
      completionEnabled: true,
      composerMaxHeight: 200,
    })
  })

  it('merges and clamps editor settings', () => {
    const settings = mergeWithDefaults({
      general: {
        editor: {
          tabSize: 99,
          lineWrapping: false,
          composerMaxHeight: 10,
        },
      } as any,
    })

    expect(settings.general.editor?.tabSize).toBe(8)
    expect(settings.general.editor?.lineWrapping).toBe(false)
    expect(settings.general.editor?.syntaxHighlighting).toBe(true)
    expect(settings.general.editor?.composerMaxHeight).toBe(80)
  })
})

describe('shortcut settings defaults', () => {
  it('provides shortcut defaults', () => {
    const settings = createDefaultSettings()

    expect(settings.general.shortcuts?.searchEverywhere).toEqual({ key: 'k', metaKey: true })
    expect(settings.general.shortcuts?.toggleTodoPlanWindow).toEqual({ key: 't', metaKey: true, shiftKey: true })
    expect(settings.general.shortcuts?.toggleTodoPlan).toEqual({ key: 't', metaKey: true, altKey: true })
  })

  it('merges new shortcut defaults for older settings files', () => {
    const settings = mergeWithDefaults({
      general: {
        shortcuts: {
          sendMessage: { key: 'Enter' },
          newChat: { key: 'n', metaKey: true },
          closeChat: { key: 'w', metaKey: true },
          toggleSidebar: { key: 'b', metaKey: true },
          focusInput: { key: '/' },
        },
      } as any,
    })

    expect(settings.general.shortcuts?.searchEverywhere).toEqual({ key: 'k', metaKey: true })
    expect(settings.general.shortcuts?.toggleTodoPlanWindow).toEqual({ key: 't', metaKey: true, shiftKey: true })
  })

  it('preserves double shift shortcut sequences', () => {
    const settings = mergeWithDefaults({
      general: {
        shortcuts: {
          searchEverywhere: { key: 'Shift', sequence: 'double-shift' },
        },
      } as any,
    })

    expect(settings.general.shortcuts?.searchEverywhere).toEqual({ key: 'Shift', sequence: 'double-shift' })
  })
})

describe('network settings defaults', () => {
  it('disables global proxy by default', () => {
    const settings = createDefaultSettings()

    expect(settings.network?.proxy.enabled).toBe(false)
    expect(settings.network?.proxy.url).toBe('')
    expect(settings.network?.proxy.bypassRules).toContain('localhost')
  })

  it('merges proxy settings for older settings files', () => {
    const settings = mergeWithDefaults({})

    expect(settings.network?.proxy.enabled).toBe(false)
  })
})

describe('legacy network interface settings', () => {
  it('strips provider localAddress values when merging settings', () => {
    const settings = mergeWithDefaults({
      ai: {
        providers: {
          openai: {
            apiKey: '',
            model: 'gpt-4o',
            selectedModels: [],
            localAddress: '10.0.0.1',
          },
        },
        customProviders: [{
          id: 'custom-old',
          name: 'Old',
          apiType: 'openai',
          apiKey: '',
          baseUrl: 'https://example.com/v1',
          model: 'model',
          selectedModels: ['model'],
          localAddress: '10.0.0.2',
        }],
      } as any,
    })

    expect((settings.ai.providers.openai as any).localAddress).toBeUndefined()
    expect((settings.ai.customProviders?.[0] as any).localAddress).toBeUndefined()
  })
})
