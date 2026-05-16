// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ThinkToggle from '../ThinkToggle.vue'

const mocks = vi.hoisted(() => ({
  settingsStore: null as any,
  sessionsStore: null as any,
}))

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => mocks.settingsStore,
}))

vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => mocks.sessionsStore,
}))

vi.mock('../../common/Tooltip.vue', () => ({
  default: {
    name: 'Tooltip',
    props: ['text'],
    template: '<span><slot /></span>',
  },
}))

function createSettings(provider: 'codex' | 'deepseek' = 'codex', serviceTierByModel?: Record<string, string>) {
  const model = provider === 'codex' ? 'gpt-5.5' : 'deepseek-v4'
  return {
    ai: {
      provider,
      providers: {
        [provider]: {
          apiKey: '',
          model,
          selectedModels: [model],
          serviceTierByModel,
        },
      },
    },
  } as any
}

function createCodexModel() {
  return {
    id: 'gpt-5.5',
    name: 'GPT-5.5',
    providerMetadata: {
      codex: {
        defaultReasoningEffort: 'medium',
        supportedReasoningEfforts: [
          { effort: 'minimal' },
          { effort: 'low' },
          { effort: 'medium' },
          { effort: 'high' },
          { effort: 'xhigh' },
        ],
        serviceTiers: [
          { id: 'fast', name: 'Fast', description: 'Priority processing.' },
          { id: 'flex', name: 'Flex', description: 'Flexible processing.' },
        ],
      },
    },
  } as any
}

function setup(provider: 'codex' | 'deepseek' = 'codex', serviceTierByModel?: Record<string, string>) {
  const settings = createSettings(provider, serviceTierByModel)
  const model = provider === 'codex' ? 'gpt-5.5' : 'deepseek-v4'
  mocks.settingsStore = reactive({
    settings,
    getCachedModels: vi.fn((providerId: string) => providerId === 'codex' ? [createCodexModel()] : []),
    saveSettings: vi.fn(async (newSettings: any) => {
      mocks.settingsStore.settings = newSettings
    }),
    updateModel: vi.fn(),
  })
  mocks.sessionsStore = reactive({
    currentSessionId: 'session-1',
    sessions: [{
      id: 'session-1',
      lastProvider: provider,
      lastModel: model,
    }],
  })
}

async function openPanel(wrapper: ReturnType<typeof mount>) {
  await wrapper.find('.think-select').trigger('click')
  await nextTick()
}

function panelText(): string {
  return document.body.textContent ?? ''
}

async function clickPanelOption(label: string) {
  const options = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.think-option'))
  const option = options.find((item) => item.textContent?.trim() === label)
  expect(option).toBeTruthy()
  option?.click()
  await nextTick()
}

describe('ThinkToggle', () => {
  beforeEach(() => {
    setup()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('renders Codex as one compact dropdown with thinking and speed groups', async () => {
    const wrapper = mount(ThinkToggle, {
      attachTo: document.body,
      props: { sessionId: 'session-1' },
    })

    expect(wrapper.findAll('.think-select')).toHaveLength(1)
    expect(wrapper.find('.think-value').text()).toBe('Medium')

    await openPanel(wrapper)

    expect(panelText()).toContain('Thinking')
    expect(panelText()).toContain('Speed')
    expect(panelText()).toContain('Off')
    expect(panelText()).toContain('X High')
    expect(panelText()).toContain('Auto')
    expect(panelText()).toContain('Fast')
    expect(panelText()).toContain('Flex')
  })

  it('shows an explicit Codex speed only after selecting it', async () => {
    const wrapper = mount(ThinkToggle, {
      attachTo: document.body,
      props: { sessionId: 'session-1' },
    })

    await openPanel(wrapper)
    await clickPanelOption('Fast')

    expect(wrapper.find('.think-value').text()).toBe('Medium · Fast')
    expect(mocks.settingsStore.settings.ai.providers.codex.serviceTierByModel['gpt-5.5']).toBe('fast')

    await openPanel(wrapper)
    await clickPanelOption('Auto')

    expect(wrapper.find('.think-value').text()).toBe('Medium')
    expect(mocks.settingsStore.settings.ai.providers.codex.serviceTierByModel['gpt-5.5']).toBeUndefined()
  })

  it('keeps DeepSeek on the same dropdown without Codex speed controls', async () => {
    setup('deepseek')
    const wrapper = mount(ThinkToggle, {
      attachTo: document.body,
      props: { sessionId: 'session-1' },
    })

    expect(wrapper.find('.think-value').text()).toBe('High')

    await openPanel(wrapper)

    expect(panelText()).toContain('Thinking')
    expect(panelText()).not.toContain('Speed')
    expect(panelText()).toContain('Max')
  })
})
