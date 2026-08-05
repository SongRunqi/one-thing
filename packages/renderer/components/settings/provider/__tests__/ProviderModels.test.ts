// @vitest-environment happy-dom
/**
 * The model list stopped being a table. What these cover is the set of claims
 * the rewrite makes — each one maps to a way the old table failed in practice:
 *
 *  - identity never scrolls out of view (there is no horizontal axis at all)
 *  - "active" is its own state, not a badge wedged into the capability cell
 *  - a hand-added model surfaces at the top, not at the bottom of 337 rows
 *  - configuration lives on a second-level page, not an inline expansion and
 *    not a popover that runs off the bottom of the window
 */
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProviderModels from '../ProviderModels.vue'

const fetchedModels = [
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    description: 'Fast multimodal model',
    context_length: 128000,
    architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
    supported_parameters: ['tools', 'reasoning'],
    top_provider: { max_completion_tokens: 16384 },
  },
  {
    id: 'anthropic/claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    context_length: 200000,
    architecture: { input_modalities: ['text'], output_modalities: ['text'] },
    supported_parameters: ['tools'],
    top_provider: { max_completion_tokens: 8192 },
  },
] as any[]

function mountProviderModels(overrides: Record<string, unknown> = {}) {
  return mount(ProviderModels, {
    props: {
      models: fetchedModels,
      filteredModels: fetchedModels,
      selectedCount: 1,
      selectedModelsList: ['openai/gpt-4o'],
      searchQuery: '',
      newModelInput: 'custom/model',
      isLoading: false,
      error: '',
      maxOutputs: {},
      contextLengths: {},
      modelCapabilities: {},
      renameModel: vi.fn(() => ({ ok: true })),
      activeModelId: 'openai/gpt-4o',
      isModelSelected: (modelId: string) => modelId === 'openai/gpt-4o',
      hasVision: (model: any) => model.architecture?.input_modalities?.includes('image') ?? false,
      hasImageGeneration: () => false,
      hasTools: (model: any) => model.supported_parameters?.includes('tools') ?? false,
      hasReasoning: (model: any) => model.supported_parameters?.includes('reasoning') ?? false,
      formatContextLength: (value: number) =>
        value >= 1000 ? `${Math.round(value / 1000)}K` : String(value || ''),
      ...overrides,
    },
    global: {
      stubs: {
        // The config modal is `Dialog`, which Teleports to <body>; stubbing the
        // Teleport keeps it inside the wrapper's tree so `wrapper.find` sees it.
        teleport: true,
        Tooltip: { template: '<span class="tooltip-stub"><slot /></span>' },
        InputNumber: {
          props: ['modelValue'],
          template:
            '<input class="input-number-stub" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))">',
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

  it('renders search and add-model controls above the list', async () => {
    // Seeded with a query so the clear affordance is present to click.
    const wrapper = mountProviderModels({ searchQuery: 'gpt' })

    expect(wrapper.find('.model-toolbar').exists()).toBe(true)
    expect(wrapper.find('.model-search-field').exists()).toBe(true)
    expect(wrapper.find('.add-model-row .add-model-input').exists()).toBe(true)

    await wrapper.find('.model-search-field input').setValue('sonnet')
    await wrapper.find('.search-clear').trigger('click')
    await wrapper.find('.add-model-btn').trigger('click')

    expect(wrapper.emitted('update:searchQuery')?.at(0)).toEqual(['sonnet'])
    expect(wrapper.emitted('update:searchQuery')?.at(-1)).toEqual([''])
    expect(wrapper.emitted('add-custom')).toHaveLength(1)
  })

  it('shows the model name and id on every row, with no horizontal scroller to lose them to', () => {
    const wrapper = mountProviderModels()
    const firstRow = wrapper.find('.model-row')

    expect(firstRow.find('.model-name').text()).toBe('GPT-4o')
    expect(firstRow.find('.model-id').text()).toBe('openai/gpt-4o')
    // The old table put every column behind one shared x-scroller; the list has none.
    expect(wrapper.find('.virtual-table-header').exists()).toBe(false)
  })

  it('keeps "active" out of the capability glyphs', () => {
    const wrapper = mountProviderModels()
    const firstRow = wrapper.find('.model-row')

    expect(firstRow.find('.model-active-pill').exists()).toBe(true)
    // Regression: the pill used to be rendered inside the capabilities cell.
    expect(firstRow.find('.model-caps .model-active-pill').exists()).toBe(false)
    expect(firstRow.find('.model-trailing .model-active-pill').exists()).toBe(true)
  })

  it('separates select / set-active / configure into three distinct actions', async () => {
    const wrapper = mountProviderModels()
    const rows = wrapper.findAll('.model-row')
    const inactive = rows[1]

    await inactive.find('.model-check').trigger('click')
    expect(wrapper.emitted('toggle')).toEqual([['anthropic/claude-3-5-sonnet']])

    await inactive.find('.model-set-active').trigger('click')
    expect(wrapper.emitted('select-active')).toEqual([['anthropic/claude-3-5-sonnet']])

    // Clicking the row opens configuration — it no longer doubles as "set active".
    await inactive.trigger('click')
    expect(wrapper.find('.model-config-dialog').exists()).toBe(true)
    expect(wrapper.emitted('select-active')).toHaveLength(1)
  })

  it('floats hand-added models to the top instead of burying them', () => {
    const wrapper = mountProviderModels({
      selectedModelsList: ['openai/gpt-4o', 'custom/local-model'],
      isModelSelected: (id: string) => id === 'openai/gpt-4o' || id === 'custom/local-model',
    })

    const ids = wrapper.findAll('.model-row .model-id').map(node => node.text())
    expect(ids[0]).toBe('custom/local-model')
    expect(wrapper.findAll('.model-row')[0].find('.model-tag').text()).toBe('自定义')
  })

  it('keeps hand-added models visible before any catalog is fetched', () => {
    const wrapper = mountProviderModels({
      models: [],
      filteredModels: [],
      selectedModelsList: ['custom/local-model'],
      activeModelId: 'custom/local-model',
      isModelSelected: () => true,
    })

    expect(wrapper.find('.model-row .model-id').text()).toBe('custom/local-model')
    // The toolbar stays up so you can still add another one.
    expect(wrapper.find('.add-model-row').exists()).toBe(true)
  })

  it('configures context and output in a modal that keeps the list behind it', async () => {
    const wrapper = mountProviderModels()
    await wrapper.findAll('.model-row')[0].trigger('click')

    const dialog = wrapper.find('.model-config-dialog')
    expect(dialog.exists()).toBe(true)
    // Overlaid, not replaced: the list you came from stays put, so there is
    // never a moment of "where am I now".
    expect(wrapper.find('.model-list').exists()).toBe(true)
    expect(wrapper.find('.app-dialog-overlay').exists()).toBe(true)
    expect(dialog.find('.config-title').text()).toBe('GPT-4o')

    const [contextInput, outputInput] = dialog.findAll('.input-number-stub')
    await contextInput.setValue('1000000')
    expect(wrapper.emitted('update-context-length')).toEqual([['openai/gpt-4o', 1000000]])

    await outputInput.setValue('8192')
    expect(wrapper.emitted('update-max-output')).toEqual([['openai/gpt-4o', 8192]])

    await dialog.find('.app-dialog-text-btn.is-primary').trigger('click')
    expect(wrapper.find('.model-config-dialog').exists()).toBe(false)
  })

  it('closes the modal on backdrop click and on Escape', async () => {
    const wrapper = mountProviderModels()

    await wrapper.findAll('.model-row')[0].trigger('click')
    await wrapper.find('.app-dialog-overlay').trigger('click')
    expect(wrapper.find('.model-config-dialog').exists()).toBe(false)

    await wrapper.findAll('.model-row')[0].trigger('click')
    expect(wrapper.find('.model-config-dialog').exists()).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.model-config-dialog').exists()).toBe(false)
  })

  it('caps a max-output override at the model limit and clears it at zero', async () => {
    const wrapper = mountProviderModels()
    await wrapper.findAll('.model-row')[0].trigger('click')
    const outputInput = wrapper.findAll('.input-number-stub')[1]

    await outputInput.setValue('999999')
    expect(wrapper.emitted('update-max-output')?.at(-1)).toEqual(['openai/gpt-4o', 16384])

    await outputInput.setValue('0')
    expect(wrapper.emitted('update-max-output')?.at(-1)).toEqual(['openai/gpt-4o', null])
  })
})
