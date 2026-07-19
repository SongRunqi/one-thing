// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

describe('settings store', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    setActivePinia(createPinia())
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('server unavailable')
    }))
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })
  })

  it('creates a placeholder provider config when updating a model for an unknown provider', async () => {
    const { useSettingsStore } = await import('../settings')
    const settingsStore = useSettingsStore()

    expect(() => {
      settingsStore.updateAIProvider('local')
      settingsStore.updateModel('local-echo', 'local')
    }).not.toThrow()

    expect(settingsStore.settings.ai.providers.local).toEqual(expect.objectContaining({
      apiKey: '',
      baseUrl: '',
      model: 'local-echo',
      selectedModels: [],
    }))
  })

  it('saveAIProviderDefault persists the new global default via saveSettings (not just an in-memory mutation)', async () => {
    const saveSettings = vi.fn((settings: unknown) =>
      Promise.resolve({ success: true, settings }),
    )
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        saveSettings,
        onSystemThemeChanged: vi.fn(() => () => {}),
        getSystemTheme: vi.fn().mockResolvedValue({ success: true, theme: 'light' }),
      },
    })

    const { useSettingsStore } = await import('../settings')
    const settingsStore = useSettingsStore()

    await settingsStore.saveAIProviderDefault('local', 'local-echo')

    expect(saveSettings).toHaveBeenCalledTimes(1)
    const [savedSettings] = saveSettings.mock.calls[0] as [
      { ai: { provider: string; providers: Record<string, { model: string }> } },
    ]
    expect(savedSettings.ai.provider).toBe('local')
    expect(savedSettings.ai.providers.local.model).toBe('local-echo')
    expect(settingsStore.settings.ai.provider).toBe('local')
    expect(settingsStore.settings.ai.providers.local.model).toBe('local-echo')
  })
})
