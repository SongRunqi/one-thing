// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProviderModels from '../ProviderModels.vue'

const fetchedModels = [
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    description: 'Fast multimodal model',
    context_length: 128000,
    architecture: {
      input_modalities: ['text', 'image'],
      output_modalities: ['text'],
    },
    supported_parameters: ['tools', 'reasoning'],
    top_provider: {
      max_completion_tokens: 16384,
    },
  },
  {
    id: 'anthropic/claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    context_length: 200000,
    architecture: {
      input_modalities: ['text'],
      output_modalities: ['text'],
    },
    supported_parameters: ['tools'],
    top_provider: {
      max_completion_tokens: 8192,
    },
  },
] as any[]

function mountProviderModels(overrides: Record<string, unknown> = {}) {
  return mount(ProviderModels, {
    props: {
      models: fetchedModels,
      filteredModels: fetchedModels,
      selectedCount: 1,
      selectedModelsList: ['openai/gpt-4o'],
      searchQuery: 'gpt',
      newModelInput: 'custom/model',
      isLoading: false,
      error: '',
      maxOutputs: {},
      modelCapabilities: {},
      renameModel: vi.fn(() => ({ ok: true })),
      activeModelId: 'openai/gpt-4o',
      isModelSelected: (modelId: string) => modelId === 'openai/gpt-4o',
      hasVision: (model: any) => model.architecture?.input_modalities?.includes('image') ?? false,
      hasImageGeneration: () => false,
      hasTools: (model: any) => model.supported_parameters?.includes('tools') ?? false,
      hasReasoning: (model: any) => model.supported_parameters?.includes('reasoning') ?? false,
      formatContextLength: (value: number) => value >= 1000 ? `${Math.round(value / 1000)}K` : String(value || ''),
      ...overrides,
    },
    global: {
      stubs: {
        Tooltip: { template: '<span class="tooltip-stub"><slot /></span>' },
        NumberStepper: {
          props: ['modelValue'],
          template: '<input class="number-stepper-stub" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))">',
        },
      },
    },
  })
}

describe('ProviderModels', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 0
    })
  })

  it('renders a toolbar with neutral search and add-model controls above the model table', async () => {
    const wrapper = mountProviderModels()

    expect(wrapper.find('.model-toolbar').exists()).toBe(true)
    expect(wrapper.find('.model-search-field .search-input').exists()).toBe(true)
    expect(wrapper.find('.add-model-row .add-model-input').exists()).toBe(true)
    expect(wrapper.find('.model-table-head').text()).toContain('Capabilities')
    expect(wrapper.find('.model-table-head').text()).toContain('Output')

    await wrapper.find('.search-input').setValue('sonnet')
    await wrapper.find('.search-clear').trigger('click')
    await wrapper.find('.add-model-btn').trigger('click')

    expect(wrapper.emitted('update:searchQuery')?.at(0)).toEqual(['sonnet'])
    expect(wrapper.emitted('update:searchQuery')?.at(-1)).toEqual([''])
    expect(wrapper.emitted('add-custom')).toHaveLength(1)
  })

  it('separates active-row configuration from selection checkbox toggles', async () => {
    const wrapper = mountProviderModels()
    const firstRow = wrapper.find('.model-list .model-row')

    expect(firstRow.classes()).toContain('selected')
    expect(firstRow.classes()).toContain('is-active')
    expect(firstRow.find('.model-primary').text()).toBe('GPT-4o')
    expect(firstRow.find('.model-secondary').text()).toBe('openai/gpt-4o')
    expect(firstRow.find('.model-active-pill').text()).toBe('Active')

    await firstRow.trigger('click')
    await firstRow.find('.model-check').trigger('click')

    expect(wrapper.emitted('select-active')).toEqual([['openai/gpt-4o']])
    expect(wrapper.emitted('toggle')).toEqual([['openai/gpt-4o']])
  })

  it('keeps selected custom models visible before fetched models are loaded', () => {
    const wrapper = mountProviderModels({
      models: [],
      filteredModels: [],
      selectedModelsList: ['custom/local-model'],
      selectedCount: 1,
      searchQuery: '',
      activeModelId: 'custom/local-model',
      isModelSelected: () => true,
    })

    expect(wrapper.find('.model-search-field').exists()).toBe(false)
    expect(wrapper.find('.model-list-static .model-row.selected').text()).toContain('custom/local-model')
    expect(wrapper.find('.model-list-static .model-active-pill').text()).toBe('Active')
    expect(wrapper.find('.add-model-row').exists()).toBe(true)
  })
})
