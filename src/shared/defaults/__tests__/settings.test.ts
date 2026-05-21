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
      softWrapColumn: 88,
      syntaxHighlighting: true,
      completionEnabled: true,
      composerMaxHeight: 200,
      markdownNoteAttachmentDirectory: '',
      markdownProjectAttachmentDirectory: '',
    })
  })

  it('merges and clamps editor settings', () => {
    const settings = mergeWithDefaults({
      general: {
        editor: {
          tabSize: 99,
          lineWrapping: false,
          softWrapColumn: 999,
          composerMaxHeight: 10,
          markdownNoteAttachmentDirectory: 'attachments',
          markdownProjectAttachmentDirectory: 'assets',
        },
      } as any,
    })

    expect(settings.general.editor?.tabSize).toBe(8)
    expect(settings.general.editor?.lineWrapping).toBe(false)
    expect(settings.general.editor?.softWrapColumn).toBe(200)
    expect(settings.general.editor?.syntaxHighlighting).toBe(true)
    expect(settings.general.editor?.composerMaxHeight).toBe(80)
    expect(settings.general.editor?.markdownNoteAttachmentDirectory).toBe('attachments')
    expect(settings.general.editor?.markdownProjectAttachmentDirectory).toBe('assets')
  })
})

describe('soul memory settings defaults', () => {
  it('enables soul-memory with ai_note_dir defaults', () => {
    const settings = createDefaultSettings()

    expect(settings.general.soulMemory?.enabled).toBe(true)
    expect(settings.general.soulMemory?.directoryMode).toBe('ai-note-dir')
    expect(settings.general.soulMemory?.bootstrapMaxChars).toBe(12000)
    expect(settings.general.soulMemory?.activeMemory?.enabled).toBe(true)
    expect(settings.general.soulMemory?.activeMemory?.queryMode).toBe('recent')
    expect(settings.general.soulMemory?.activeMemory?.promptStyle).toBe('balanced')
    expect(settings.general.soulMemory?.activeMemory?.timeoutMs).toBe(15000)
    expect(settings.general.soulMemory?.activeMemory?.recentUserChars).toBe(220)
    expect(settings.general.soulMemory?.activeMemory?.recentAssistantChars).toBe(180)
    expect(settings.general.soulMemory?.search?.chunkTokens).toBe(400)
    expect(settings.general.soulMemory?.search?.chunkOverlap).toBe(80)
    expect(settings.general.soulMemory?.embeddings?.providerId).toBe('auto')
    expect(settings.general.soulMemory?.embeddings?.apiKey).toBe('')
    expect(settings.general.soulMemory?.memoryFlush?.enabled).toBe(true)
    expect(settings.general.soulMemory?.dreaming?.enabled).toBe(false)
    expect(settings.general.soulMemory?.dreaming?.frequency).toBe('0 3 * * *')
    expect(settings.general.soulMemory?.dreaming?.lookbackDays).toBe(30)
    expect(settings.general.soulMemory?.dreaming?.maxPromotions).toBe(10)
    expect(settings.general.soulMemory?.dreaming?.timeoutMs).toBe(60000)
    expect(settings.general.soulMemory?.dailyContext?.mode).toBe('session-start')
    expect(settings.general.soulMemory?.dailyContext?.daysBack).toBe(1)
    expect(settings.general.soulMemory?.read?.defaultLines).toBe(200)
  })

  it('merges and clamps soul-memory settings for older settings files', () => {
    const settings = mergeWithDefaults({
      general: {
        soulMemory: {
          bootstrapMaxChars: 999999,
          activeMemory: {
            timeoutMs: 1,
            cacheTtlMs: 999999,
            queryMode: 'full',
          },
          search: {
            chunkTokens: 120,
            chunkOverlap: 500,
            maxResults: 999,
          },
          memoryFlush: {
            maxInputChars: 1,
          },
          dreaming: {
            frequency: '*/15 * * * *',
            lookbackDays: 999,
            maxSourceFiles: 0,
            maxInputChars: 1,
            maxPromotions: 999,
            timeoutMs: 1,
          },
          dailyContext: {
            daysBack: 999,
            maxChars: 1,
            mode: 'always',
          },
          read: {
            defaultLines: 9999,
            maxLines: 60,
          },
        },
      } as any,
    })

    expect(settings.general.soulMemory?.bootstrapMaxChars).toBe(50000)
    expect(settings.general.soulMemory?.activeMemory?.timeoutMs).toBe(1000)
    expect(settings.general.soulMemory?.activeMemory?.cacheTtlMs).toBe(120000)
    expect(settings.general.soulMemory?.activeMemory?.queryMode).toBe('full')
    expect(settings.general.soulMemory?.activeMemory?.promptStyle).toBe('contextual')
    expect(settings.general.soulMemory?.search?.chunkTokens).toBe(120)
    expect(settings.general.soulMemory?.search?.chunkOverlap).toBe(119)
    expect(settings.general.soulMemory?.search?.maxResults).toBe(20)
    expect(settings.general.soulMemory?.memoryFlush?.maxInputChars).toBe(2000)
    expect(settings.general.soulMemory?.dreaming?.frequency).toBe('*/15 * * * *')
    expect(settings.general.soulMemory?.dreaming?.lookbackDays).toBe(365)
    expect(settings.general.soulMemory?.dreaming?.maxSourceFiles).toBe(1)
    expect(settings.general.soulMemory?.dreaming?.maxInputChars).toBe(2000)
    expect(settings.general.soulMemory?.dreaming?.maxPromotions).toBe(100)
    expect(settings.general.soulMemory?.dreaming?.timeoutMs).toBe(5000)
    expect(settings.general.soulMemory?.dailyContext?.daysBack).toBe(14)
    expect(settings.general.soulMemory?.dailyContext?.maxChars).toBe(1000)
    expect(settings.general.soulMemory?.dailyContext?.mode).toBe('always')
    expect(settings.general.soulMemory?.read?.maxLines).toBe(60)
    expect(settings.general.soulMemory?.read?.defaultLines).toBe(60)
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

describe('todo plan settings defaults', () => {
  it('uses active todo autonomy by default', () => {
    const settings = createDefaultSettings()

    expect(settings.general.todoPlan?.enabled).toBe(true)
    expect(settings.general.todoPlan?.autonomy).toBe('active')
  })

  it('merges active todo autonomy for older settings files', () => {
    const settings = mergeWithDefaults({
      general: {
        todoPlan: {
          enabled: true,
        },
      } as any,
    })

    expect(settings.general.todoPlan?.autonomy).toBe('active')
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
