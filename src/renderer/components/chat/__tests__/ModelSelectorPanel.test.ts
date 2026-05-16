// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ModelSelectorPanel from '../ModelSelectorPanel.vue'
import type { OpenRouterModel } from '@/types'

const mocks = vi.hoisted(() => ({
  fetchModelsForProvider: vi.fn(async () => []),
  getCachedModels: vi.fn(() => [] as OpenRouterModel[]),
  store: {
    settings: {
      ai: {
        providers: {
          codex: { enabled: true, selectedModels: ['gpt-5.5'] },
          deepseek: { enabled: true, selectedModels: ['deepseek-reasoner'] },
        },
      },
    },
    availableProviders: [
      { id: 'codex', name: 'Codex' },
      { id: 'deepseek', name: 'DeepSeek' },
    ],
    isModelsLoading: vi.fn(() => false),
    isCustomProvider: vi.fn(() => false),
    getModelDisplayName: vi.fn((id: string) => id),
    getCachedModels: vi.fn(() => [] as OpenRouterModel[]),
    fetchModelsForProvider: vi.fn(async () => []),
  },
}))

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => mocks.store,
}))

function mountPanel() {
  return mount(ModelSelectorPanel, {
    props: {
      visible: true,
      position: { bottom: '0px', left: '0px' },
      currentProvider: 'codex',
      currentModel: 'gpt-5.5',
    },
    global: {
      stubs: {
        Teleport: true,
        Transition: false,
        ProviderIcon: true,
      },
    },
  })
}

describe('ModelSelectorPanel Codex capabilities', () => {
  beforeEach(() => {
    mocks.store.settings.ai.providers.codex.selectedModels = ['gpt-5.5']
    mocks.store.getCachedModels.mockReturnValue([])
    mocks.store.fetchModelsForProvider.mockClear()
  })

  it('shows Codex fallback capabilities for a selected model before metadata is cached', () => {
    const wrapper = mountPanel()

    expect(wrapper.text()).toContain('gpt-5.5')
    expect(wrapper.text()).toContain('Tools')
    expect(wrapper.text()).toContain('Reasoning')
    expect(wrapper.text()).toContain('Image input')
    expect(wrapper.text()).toContain('Image generation')
  })

  it('shows the Speed badge when Codex metadata exposes service tiers', () => {
    mocks.store.getCachedModels.mockReturnValue([
      {
        id: 'gpt-5.5',
        name: 'GPT-5.5',
        context_length: 0,
        architecture: {
          modality: 'text',
          input_modalities: ['text'],
          output_modalities: ['text'],
          tokenizer: 'unknown',
        },
        pricing: { prompt: '0', completion: '0', request: '0', image: '0' },
        top_provider: { context_length: 0, max_completion_tokens: 0, is_moderated: false },
        supported_parameters: ['tools', 'reasoning'],
        providerMetadata: {
          codex: {
            serviceTiers: [{ id: 'fast', name: 'Fast' }],
            supportedReasoningEfforts: [{ effort: 'medium', name: 'Medium' }],
          },
        },
      },
    ])

    const wrapper = mountPanel()

    expect(wrapper.text()).toContain('Speed')
  })

  it('loads provider metadata when hovering a provider', async () => {
    const wrapper = mountPanel()
    mocks.store.fetchModelsForProvider.mockClear()

    const deepseek = wrapper.findAll('.provider-item').find(item => item.text().includes('DeepSeek'))
    await deepseek?.trigger('mouseenter')

    expect(mocks.store.fetchModelsForProvider).toHaveBeenCalledWith('deepseek')
  })
})
