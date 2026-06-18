// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { computed, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AIProviderTab from '../AIProviderTab.vue'

const mocks = vi.hoisted(() => ({
  providerSettings: null as any,
  providerUsage: null as any,
}))

vi.mock('../useProviderSettings', () => ({
  useProviderSettings: () => mocks.providerSettings,
}))

vi.mock('../useProviderUsage', () => ({
  useProviderUsage: () => mocks.providerUsage,
}))

function createSettings() {
  return {
    ai: {
      provider: 'openai',
      temperature: 0.7,
      providers: {
        openai: {
          enabled: true,
          apiKey: 'sk-openai',
          baseUrl: '',
          selectedModels: ['openai/gpt-4o'],
          model: 'openai/gpt-4o',
        },
        anthropic: {
          enabled: false,
          apiKey: '',
          baseUrl: '',
          selectedModels: ['anthropic/claude-3-5-sonnet'],
          model: 'anthropic/claude-3-5-sonnet',
        },
      },
      customProviders: [],
    },
  } as any
}

const providers = [
  { id: 'openai', name: 'OpenAI', defaultBaseUrl: 'https://api.openai.com/v1' },
  { id: 'anthropic', name: 'Anthropic', defaultBaseUrl: 'https://api.anthropic.com/v1' },
] as any[]

function rowByName(wrapper: ReturnType<typeof mount>, name: string) {
  const row = wrapper.findAll('.provider-row').find((item) => item.text().includes(name))
  if (!row) throw new Error(`Missing provider row: ${name}`)
  return row
}

function mountProviderTab(settings = createSettings()) {
  return mount(AIProviderTab, {
    props: {
      settings,
      providers,
    },
    global: {
      stubs: {
        GlobalDefaultSelector: { template: '<div class="global-default-stub" />' },
        ProviderIcon: { template: '<span class="provider-icon-stub" />' },
        AuthCard: { template: '<div class="auth-card-stub" />' },
        ProviderUsageCard: { template: '<div class="usage-card-stub" />' },
        ProviderModels: { template: '<div class="provider-models-stub" />' },
        InputNumber: { template: '<div class="input-number-stub" />' },
      },
    },
  })
}

describe('AIProviderTab provider rows', () => {
  beforeEach(() => {
    const viewingProvider = ref('openai')
    const providerNames: Record<string, string> = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
    }

    mocks.providerSettings = {
      viewingProvider,
      enabledProviders: computed(() => providers),
      defaultProviderModel: ref('openai/gpt-4o'),
      defaultProviderSelectedModels: ref(['openai/gpt-4o']),
      getModelName: (modelId: string) => modelId,
      setDefaultProvider: vi.fn(),
      setDefaultModel: vi.fn(),
      isUserCustomProvider: vi.fn(() => false),
      isProviderEnabled: vi.fn((providerId: string) => providerId === 'openai'),
      getProviderEnvStatus: vi.fn(() => undefined),
      providerUsesEnvApiKey: vi.fn(() => false),
      switchViewingProvider: vi.fn(async (providerId: string) => {
        viewingProvider.value = providerId
      }),
      initialize: vi.fn(),
      cleanup: vi.fn(),
      currentProviderName: computed(() => providerNames[viewingProvider.value] ?? viewingProvider.value),
      isOAuthProvider: ref(false),
      oauthStatus: ref({ isLoggedIn: false }),
      isOAuthLoading: ref(false),
      deviceFlowInfo: ref(null),
      codeEntryInfo: ref(null),
      manualCode: ref(''),
      isSubmittingCode: ref(false),
      codeEntryError: ref(''),
      startOAuthLogin: vi.fn(),
      logoutOAuth: vi.fn(),
      submitManualCode: vi.fn(),
      toggleProviderEnabled: vi.fn(),
      getDefaultBaseUrl: vi.fn(() => 'https://api.example.com/v1'),
      updateProviderApiKey: vi.fn(),
      updateProviderBaseUrl: vi.fn(),
      availableModels: ref([]),
      filteredModels: ref([]),
      currentProviderUsesEnvApiKey: ref(false),
      currentProviderEnvVarName: ref('OPENAI_API_KEY'),
      currentSelectedModels: computed(() => ['openai/gpt-4o']),
      modelSearchQuery: ref(''),
      newModelInput: ref(''),
      isLoadingModels: ref(false),
      modelError: ref(''),
      currentProviderMaxOutputs: ref({}),
      currentProviderModelCapabilities: ref({}),
      renameModel: vi.fn(() => ({ ok: true })),
      activeModelId: computed(() => viewingProvider.value === 'openai' ? 'openai/gpt-4o' : 'anthropic/claude-3-5-sonnet'),
      isModelSelected: vi.fn(() => true),
      hasVision: vi.fn(() => false),
      hasImageGeneration: vi.fn(() => false),
      hasTools: vi.fn(() => false),
      hasReasoning: vi.fn(() => false),
      formatContextLength: vi.fn((value: number) => String(value)),
      fetchModels: vi.fn(),
      toggleModelSelection: vi.fn(),
      addCustomModel: vi.fn(),
      updateModelMaxOutput: vi.fn(),
      updateModelCapability: vi.fn(),
      resetModelCapabilities: vi.fn(),
      setActiveModel: vi.fn(),
      activeModelSupportsTemperature: ref(true),
      currentTemperature: ref(0.7),
      hasProviderTemperatureOverride: ref(false),
      resetProviderTemperature: vi.fn(),
      updateProviderTemperature: vi.fn(),
      activeModelMaxOutput: ref(8192),
      activeModelMaxLimit: ref(16384),
      hasActiveModelMaxOverride: ref(false),
      activeModelMaxOutputStep: ref(128),
      updateActiveModelMaxOutput: vi.fn(),
      resetActiveModelMaxOutput: vi.fn(),
    }

    mocks.providerUsage = {
      shouldShow: ref(false),
      response: ref(null),
      isLoading: ref(false),
      error: ref(''),
      refresh: vi.fn(),
    }
  })

  it('collapses the expanded provider when the same row is clicked', async () => {
    const wrapper = mountProviderTab()

    expect(rowByName(wrapper, 'OpenAI').attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('.provider-inline-detail').exists()).toBe(true)

    await rowByName(wrapper, 'OpenAI').trigger('click')
    await nextTick()

    expect(rowByName(wrapper, 'OpenAI').attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.provider-inline-detail').exists()).toBe(false)
    expect(mocks.providerSettings.switchViewingProvider).not.toHaveBeenCalled()
  })

  it('expands another provider without changing row labels or status casing', async () => {
    const wrapper = mountProviderTab()

    const anthropicBefore = rowByName(wrapper, 'Anthropic')
    expect(anthropicBefore.text()).toContain('Configure')
    expect(anthropicBefore.text()).toContain('off')
    expect(anthropicBefore.text()).not.toContain('OFF')

    await anthropicBefore.trigger('click')
    await nextTick()

    const anthropicAfter = rowByName(wrapper, 'Anthropic')
    expect(mocks.providerSettings.switchViewingProvider).toHaveBeenCalledWith('anthropic')
    expect(anthropicAfter.attributes('aria-expanded')).toBe('true')
    expect(anthropicAfter.text()).toContain('Configure')
    expect(anthropicAfter.text()).toContain('off')
    expect(anthropicAfter.text()).not.toContain('OFF')
    expect(wrapper.find('.provider-inline-detail').exists()).toBe(true)
  })
})
