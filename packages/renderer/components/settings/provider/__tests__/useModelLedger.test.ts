import { describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '@/types'
import { useModelLedger, STYLE_PRESET_TEMPERATURES } from '../useModelLedger'

const stores = vi.hoisted(() => ({
  cachedModels: {} as Record<string, any[]>,
  addCustomModelToCache: vi.fn(),
  preloadModels: vi.fn(async () => {}),
}))

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({
    getCachedModels: (providerId: string) => stores.cachedModels[providerId] ?? [],
    getModelDisplayName: (modelId: string) => modelId,
    preloadModels: stores.preloadModels,
    addCustomModelToCache: stores.addCustomModelToCache,
    isCustomProvider: () => false,
  }),
}))

function model(id: string, maxCompletion = 16384) {
  return {
    id,
    name: id,
    context_length: 128000,
    architecture: {
      modality: 'text',
      input_modalities: ['text'],
      output_modalities: ['text'],
      tokenizer: 'unknown',
    },
    pricing: { prompt: '0', completion: '0', request: '0', image: '0' },
    top_provider: { context_length: 128000, max_completion_tokens: maxCompletion, is_moderated: false },
    supported_parameters: ['temperature', 'tools'],
  }
}

function createSettings(): AppSettings {
  return {
    ai: {
      provider: 'openai',
      temperature: 0.7,
      providers: {
        openai: {
          enabled: true,
          apiKey: 'sk-openai',
          baseUrl: '',
          selectedModels: ['gpt-4o', 'o4-mini'],
          model: 'gpt-4o',
          temperatureByModel: { 'o4-mini': 0.4 },
          maxOutputByModel: { 'o4-mini': 2048 },
        },
        deepseek: {
          enabled: true,
          apiKey: 'sk-deepseek',
          baseUrl: '',
          selectedModels: ['deepseek-chat'],
          model: 'deepseek-chat',
        },
        anthropic: {
          enabled: false,
          apiKey: '',
          baseUrl: '',
          selectedModels: ['claude-sonnet'],
          model: 'claude-sonnet',
        },
      },
      customProviders: [],
    },
  } as any
}

const providers = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'deepseek', name: 'DeepSeek' },
  { id: 'anthropic', name: 'Anthropic' },
] as any[]

function createLedger(settings = createSettings()) {
  const updates: AppSettings[] = []
  const ledger = useModelLedger(
    { settings, providers },
    (_event, value) => updates.push(value),
  )
  return { ledger, updates }
}

describe('useModelLedger', () => {
  it('aggregates rows across enabled providers only', () => {
    stores.cachedModels = { openai: [model('gpt-4o'), model('o4-mini')], deepseek: [] }
    const { ledger } = createLedger()

    expect(ledger.rows.value.map((row) => row.key)).toEqual([
      'openai::gpt-4o',
      'openai::o4-mini',
      'deepseek::deepseek-chat',
    ])
    // deepseek-chat is not in its catalog → treated as hand-added.
    expect(ledger.rows.value[2].isCustom).toBe(true)
    // Only the default provider's active model gets the star.
    expect(ledger.rows.value.filter((row) => row.isDefault).map((row) => row.key)).toEqual([
      'openai::gpt-4o',
    ])
  })

  it('setDefault writes provider and model in one update', () => {
    stores.cachedModels = { openai: [model('gpt-4o'), model('o4-mini')], deepseek: [] }
    const { ledger, updates } = createLedger()

    ledger.setDefault(ledger.rows.value[2])

    expect(updates).toHaveLength(1)
    expect(updates[0].ai.provider).toBe('deepseek')
    expect(updates[0].ai.providers.deepseek.model).toBe('deepseek-chat')
  })

  it('maps style presets onto temperatureByModel and clears on default', () => {
    stores.cachedModels = { openai: [model('gpt-4o'), model('o4-mini')], deepseek: [] }
    const { ledger, updates } = createLedger()
    const gpt4o = ledger.rows.value[0]
    const o4mini = ledger.rows.value[1]

    expect(ledger.styleState(gpt4o)).toBe('default')
    expect(ledger.effectiveTemperature(gpt4o)).toBe(0.7)
    expect(ledger.styleState(o4mini)).toBe('custom')
    expect(ledger.effectiveTemperature(o4mini)).toBe(0.4)

    ledger.setStylePreset(gpt4o, 'precise')
    expect(updates[0].ai.providers.openai.temperatureByModel!['gpt-4o']).toBe(
      STYLE_PRESET_TEMPERATURES.precise,
    )

    ledger.setStylePreset(o4mini, null)
    expect(updates[1].ai.providers.openai.temperatureByModel).toBeUndefined()
  })

  it('maps output presets onto maxOutputByModel with standard = no override', () => {
    stores.cachedModels = { openai: [model('gpt-4o'), model('o4-mini')], deepseek: [] }
    const { ledger, updates } = createLedger()
    const gpt4o = ledger.rows.value[0]
    const o4mini = ledger.rows.value[1]

    expect(ledger.outputState(gpt4o)).toBe('standard')
    expect(ledger.effectiveMaxOutput(gpt4o)).toBe(8192)
    expect(ledger.outputState(o4mini)).toBe('custom')

    ledger.setOutputPreset(gpt4o, 'max')
    expect(updates[0].ai.providers.openai.maxOutputByModel!['gpt-4o']).toBe(16384)

    ledger.setOutputPreset(o4mini, 'standard')
    expect(updates[1].ai.providers.openai.maxOutputByModel).toBeUndefined()
  })

  it('refuses to remove a provider’s last model, removes otherwise and refalls the active model', () => {
    stores.cachedModels = { openai: [model('gpt-4o'), model('o4-mini')], deepseek: [] }
    const { ledger, updates } = createLedger()

    expect(ledger.removeModel(ledger.rows.value[2])).toEqual({ ok: false, reason: 'last' })
    expect(updates).toHaveLength(0)

    expect(ledger.removeModel(ledger.rows.value[0]).ok).toBe(true)
    expect(updates[0].ai.providers.openai.selectedModels).toEqual(['o4-mini'])
    expect(updates[0].ai.providers.openai.model).toBe('o4-mini')
  })

  it('renames a hand-added model, migrating per-model override maps', () => {
    stores.cachedModels = { openai: [model('gpt-4o')], deepseek: [] }
    const settings = createSettings()
    const { ledger, updates } = createLedger(settings)
    const o4mini = ledger.rows.value[1]
    expect(o4mini.isCustom).toBe(true)

    expect(ledger.renameModel(o4mini, 'gpt-4o')).toEqual({ ok: false, reason: 'duplicate' })

    const result = ledger.renameModel(o4mini, 'o4-mini-2026')
    expect(result.ok).toBe(true)
    const next = updates[0].ai.providers.openai
    expect(next.selectedModels).toEqual(['gpt-4o', 'o4-mini-2026'])
    expect(next.temperatureByModel).toEqual({ 'o4-mini-2026': 0.4 })
    expect(next.maxOutputByModel).toEqual({ 'o4-mini-2026': 2048 })
    expect(stores.addCustomModelToCache).toHaveBeenCalledWith(
      'openai',
      expect.objectContaining({ id: 'o4-mini-2026' }),
    )
  })
})
