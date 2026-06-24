import { describe, expect, it } from 'vitest'
import type { JsonObject } from '../../json.js'
import type { AppSettings } from '../../ipc/settings.js'
import { createDefaultSettings, mergeWithDefaults } from '../settings.js'

type ProviderConfigWithLocalAddress = {
  localAddress?: string
}

function mergeSettings(settings: JsonObject): AppSettings {
  return mergeWithDefaults(settings as Partial<AppSettings>)
}

describe('compact settings defaults', () => {
  it('enables compacting by default', () => {
    const settings = createDefaultSettings()

    expect(settings.chat?.contextCompactEnabled).toBe(true)
    expect(settings.chat?.contextCompactThreshold).toBe(85)
    expect(settings.chat?.contextCompactKeepRecentTurns).toBe(6)
    expect(settings.chat?.agentLoopStream).toBe(true)
  })

  it('clamps compact numeric settings when merging', () => {
    const settings = mergeSettings({
      chat: {
        contextCompactThreshold: 120,
        contextCompactKeepRecentTurns: 0,
      },
    })

    expect(settings.chat?.contextCompactThreshold).toBe(100)
    expect(settings.chat?.contextCompactKeepRecentTurns).toBe(1)
  })

  it('normalizes legacy agent loop stream opt-out when merging', () => {
    const settings = mergeSettings({
      chat: {
        agentLoopStream: false,
      },
    })

    expect(settings.chat?.agentLoopStream).toBe(true)
  })
})

describe('typography density defaults', () => {
  it('uses compact interface typography by default while preserving comfortable chat density', () => {
    const settings = createDefaultSettings()

    expect(settings.general.typographyDensity).toBe('compact')
    expect(settings.general.messageListDensity).toBe('comfortable')
  })

  it('backfills typography density for older settings files', () => {
    const settings = mergeSettings({
      general: {},
    })

    expect(settings.general.typographyDensity).toBe('compact')
  })

  it('preserves explicit comfortable typography density', () => {
    const settings = mergeSettings({
      general: {
        typographyDensity: 'comfortable',
      },
    })

    expect(settings.general.typographyDensity).toBe('comfortable')
  })

  it('normalizes invalid typography density values', () => {
    const settings = mergeSettings({
      general: {
        typographyDensity: 'roomy',
      },
    })

    expect(settings.general.typographyDensity).toBe('compact')
  })
})

describe('tool call model settings defaults', () => {
  it('uses chat defaults until a provider/model is selected', () => {
    const settings = createDefaultSettings()

    expect(settings.tools.toolCallModel).toEqual({
      providerId: '',
      model: '',
      thinking: false,
      thinkingEffort: 'medium',
    })
  })

  it('backfills tool call model settings for older settings files', () => {
    const settings = mergeSettings({
      tools: {
        enableToolCalls: true,
        tools: {},
      },
    })

    expect(settings.tools.toolCallModel).toEqual({
      providerId: '',
      model: '',
      thinking: false,
      thinkingEffort: 'medium',
    })
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
    const settings = mergeSettings({
      general: {
        editor: {
          tabSize: 99,
          lineWrapping: false,
          softWrapColumn: 999,
          composerMaxHeight: 10,
          markdownNoteAttachmentDirectory: 'attachments',
          markdownProjectAttachmentDirectory: 'assets',
        },
      },
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
    expect(settings.general.soulMemory?.capture).toEqual({
      enabled: true,
      mode: 'auto',
      maxInputChars: 6000,
      timeoutMs: 12000,
    })
    expect(settings.general.soulMemory?.review?.enabled).toBe(true)
    expect(settings.general.soulMemory?.review?.interval).toBe(10)
    expect(settings.general.soulMemory?.dreaming?.enabled).toBe(false)
    expect(settings.general.soulMemory?.dreaming?.frequency).toBe('0 3 * * *')
    expect(settings.general.soulMemory?.dreaming?.sources).toEqual(['daily'])
    expect(settings.general.soulMemory?.dreaming?.lookbackDays).toBe(30)
    expect(settings.general.soulMemory?.dreaming?.maxPromotions).toBe(10)
    expect(settings.general.soulMemory?.dreaming?.timeoutMs).toBe(60000)
    expect(settings.general.soulMemory?.dailyContext?.mode).toBe('session-start')
    expect(settings.general.soulMemory?.dailyContext?.daysBack).toBe(1)
    expect(settings.general.soulMemory?.read?.defaultLines).toBe(200)
  })

  it('merges and clamps soul-memory settings for older settings files', () => {
    const settings = mergeSettings({
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
          capture: {
            mode: 'ask',
            targetPolicy: 'hybrid',
            policy: 'aggressive',
            maxInputChars: 1,
            timeoutMs: 999999,
            maxCandidates: 999,
            longTermMinConfidence: 2,
            dailyMinConfidence: -1,
          },
          review: {
            interval: 999,
            maxInputChars: 1,
            timeoutMs: 1,
            maxCandidates: 999,
            minConfidence: 2,
          },
          dreaming: {
            frequency: '*/15 * * * *',
            model: 'legacy-dream-provider/legacy-dream-model',
            sources: ['sessions', 'short-term', 'recall'],
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
      },
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
    expect(settings.general.soulMemory?.capture).toEqual({
      enabled: true,
      mode: 'explicit-only',
      maxInputChars: 1000,
      timeoutMs: 60000,
    })
    expect(settings.general.soulMemory?.capture).not.toHaveProperty('targetPolicy')
    expect(settings.general.soulMemory?.capture).not.toHaveProperty('policy')
    expect(settings.general.soulMemory?.capture).not.toHaveProperty('maxCandidates')
    expect(settings.general.soulMemory?.capture).not.toHaveProperty('longTermMinConfidence')
    expect(settings.general.soulMemory?.capture).not.toHaveProperty('dailyMinConfidence')
    expect(settings.general.soulMemory?.review?.interval).toBe(200)
    expect(settings.general.soulMemory?.review?.maxInputChars).toBe(4000)
    expect(settings.general.soulMemory?.review?.timeoutMs).toBe(1000)
    expect(settings.general.soulMemory?.review?.maxCandidates).toBe(20)
    expect(settings.general.soulMemory?.review?.minConfidence).toBe(1)
    expect(settings.general.soulMemory?.dreaming?.frequency).toBe('*/15 * * * *')
    expect(settings.general.soulMemory?.dreaming?.model).toBe('')
    expect(settings.general.soulMemory?.dreaming?.sources).toEqual(['daily'])
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
    const settings = mergeSettings({
      general: {
        shortcuts: {
          sendMessage: { key: 'Enter' },
          newChat: { key: 'n', metaKey: true },
          closeChat: { key: 'w', metaKey: true },
          toggleSidebar: { key: 'b', metaKey: true },
          focusInput: { key: '/' },
        },
      },
    })

    expect(settings.general.shortcuts?.searchEverywhere).toEqual({ key: 'k', metaKey: true })
    expect(settings.general.shortcuts?.toggleTodoPlanWindow).toEqual({ key: 't', metaKey: true, shiftKey: true })
  })

  it('preserves double shift shortcut sequences', () => {
    const settings = mergeSettings({
      general: {
        shortcuts: {
          searchEverywhere: { key: 'Shift', sequence: 'double-shift' },
        },
      },
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
    const settings = mergeSettings({
      general: {
        todoPlan: {
          enabled: true,
        },
      },
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
    expect(settings.network?.networkInterface).toEqual({
      enabled: false,
      address: '',
      id: '',
      name: '',
    })
  })

  it('merges proxy settings for older settings files', () => {
    const settings = mergeWithDefaults({})

    expect(settings.network?.proxy.enabled).toBe(false)
    expect(settings.network?.networkInterface.enabled).toBe(false)
  })

  it('preserves selected network interface settings when merging', () => {
    const settings = mergeSettings({
      network: {
        networkInterface: {
          enabled: true,
          id: 'en0:IPv4:192.168.1.23',
          name: 'en0',
          address: '192.168.1.23',
          family: 'IPv4',
        },
        proxy: {
          enabled: false,
          url: '',
        },
      },
    })

    expect(settings.network?.networkInterface).toMatchObject({
      enabled: true,
      id: 'en0:IPv4:192.168.1.23',
      name: 'en0',
      address: '192.168.1.23',
      family: 'IPv4',
    })
  })
})

describe('legacy network interface settings', () => {
  it('strips provider localAddress values when merging settings', () => {
    const settings = mergeSettings({
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
      },
    })

    expect((settings.ai.providers.openai as ProviderConfigWithLocalAddress).localAddress).toBeUndefined()
    expect((settings.ai.customProviders?.[0] as ProviderConfigWithLocalAddress | undefined)?.localAddress).toBeUndefined()
  })
})
