// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChatSidePanel from '../ChatSidePanel.vue'

const settingsStore = vi.hoisted(() => ({
  settings: {
    general: {
      todoPlan: {
        enabled: true,
      },
    },
  },
}))

const sessionsStore = vi.hoisted(() => ({
  isNewChatDraftId: vi.fn((sessionId: string) => sessionId.startsWith('draft:')),
}))

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => settingsStore,
}))

vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => sessionsStore,
}))

vi.mock('../SystemPromptPanel.vue', () => ({
  default: {
    name: 'SystemPromptPanel',
    template: '<div class="mock-system-prompt-panel" />',
    methods: {
      refreshSnapshot: vi.fn(),
    },
  },
}))

vi.mock('../TodoProgressPanel.vue', () => ({
  default: {
    name: 'TodoProgressPanel',
    template: '<div class="mock-todo-progress-panel" />',
  },
}))

async function settle() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

function panelSizes(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('.splitter-panel').map(panel => Number(panel.attributes('data-size')))
}

describe('ChatSidePanel', () => {
  beforeEach(() => {
    const storage: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage[key] = String(value)
      }),
      removeItem: vi.fn((key: string) => {
        delete storage[key]
      }),
    })
    settingsStore.settings.general.todoPlan.enabled = true
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults outline, system prompt, and todo panels to equal adjustable heights', async () => {
    const wrapper = mount(ChatSidePanel, {
      props: {
        sessionId: 'session-1',
        workingDirectory: '/repo',
      },
    })

    await settle()

    expect(wrapper.find('.chat-side-splitter').classes()).toContain('layout-vertical')
    expect(wrapper.findAll('.splitter-panel')).toHaveLength(3)
    expect(wrapper.findAll('.splitter-resizer')).toHaveLength(2)
    expect(wrapper.findAll('.splitter-resizer').every(resizer =>
      resizer.attributes('aria-orientation') === 'horizontal',
    )).toBe(true)

    for (const size of panelSizes(wrapper)) {
      expect(size).toBeCloseTo(100 / 3, 3)
    }
  })

  it('falls back to equal outline and system heights when todo is disabled', async () => {
    settingsStore.settings.general.todoPlan.enabled = false

    const wrapper = mount(ChatSidePanel, {
      props: {
        sessionId: 'session-1',
        workingDirectory: '/repo',
      },
    })

    await settle()

    expect(wrapper.findAll('.splitter-panel')).toHaveLength(2)
    expect(wrapper.findAll('.splitter-resizer')).toHaveLength(1)
    expect(panelSizes(wrapper)).toEqual([50, 50])
  })

  it('does not mount session-backed prompt or todo panels for a new chat draft', async () => {
    const wrapper = mount(ChatSidePanel, {
      props: {
        sessionId: 'draft:one',
        workingDirectory: '/repo',
      },
    })

    await settle()

    expect(wrapper.find('.mock-system-prompt-panel').exists()).toBe(false)
    expect(wrapper.find('.mock-todo-progress-panel').exists()).toBe(false)
    expect(wrapper.find('.chat-side-draft-state').text()).toBe('System prompt will appear after the chat starts.')
    expect(wrapper.findAll('.splitter-panel')).toHaveLength(2)
    expect(panelSizes(wrapper)).toEqual([50, 50])
    expect(wrapper.find('[title="Refresh system prompt"]').attributes('disabled')).toBeDefined()
  })
})
