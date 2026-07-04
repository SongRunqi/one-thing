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
})
