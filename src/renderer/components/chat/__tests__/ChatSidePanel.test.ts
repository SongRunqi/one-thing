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

const segmentsMock = vi.fn(async (_sessionId: string) => ({
  success: true,
  segments: [] as unknown[],
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

vi.mock('@/platform', () => ({
  platformApi: {
    getSessionSegments: (sessionId: string) => segmentsMock(sessionId),
  },
}))

vi.mock('../VariablesPanel.vue', () => ({
  default: {
    name: 'VariablesPanel',
    template: '<div class="mock-variables-panel" />',
  },
}))

async function settle() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

function focusedSections(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('.chat-side-esec.focus').map(section =>
    section.find('.chat-side-esum-title').text(),
  )
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

  it('renders five elastic sections with outline focused by default', async () => {
    const wrapper = mount(ChatSidePanel, {
      props: {
        sessionId: 'session-1',
        workingDirectory: '/repo',
      },
    })

    await settle()

    // Contents (session TOC) + Outline + System prompt + Todo + Variables.
    expect(wrapper.findAll('.chat-side-esec')).toHaveLength(5)
    expect(focusedSections(wrapper)).toEqual(['Outline'])
    // 子面板常驻挂载,未聚焦时也在(压成 0 高)
    expect(wrapper.find('.mock-system-prompt-panel').exists()).toBe(true)
    expect(wrapper.find('.mock-todo-progress-panel').exists()).toBe(true)
    expect(wrapper.find('.mock-variables-panel').exists()).toBe(true)
  })

  it('moves focus on summary click and persists it', async () => {
    const wrapper = mount(ChatSidePanel, {
      props: {
        sessionId: 'session-1',
        workingDirectory: '/repo',
      },
    })

    await settle()

    const todoSummary = wrapper.findAll('.chat-side-esum-main')
      .find(button => button.text().includes('Todo'))
    expect(todoSummary).toBeDefined()
    await todoSummary!.trigger('click')
    await settle()

    expect(focusedSections(wrapper)).toEqual(['Todo'])
    expect(localStorage.setItem).toHaveBeenCalledWith('chatSideFocusedSection', 'todo')
  })

  it('restores the persisted focused section', async () => {
    localStorage.setItem('chatSideFocusedSection', 'system')

    const wrapper = mount(ChatSidePanel, {
      props: {
        sessionId: 'session-1',
        workingDirectory: '/repo',
      },
    })

    await settle()

    expect(focusedSections(wrapper)).toEqual(['System prompt'])
  })

  it('drops the todo section when todo is disabled', async () => {
    settingsStore.settings.general.todoPlan.enabled = false
    localStorage.setItem('chatSideFocusedSection', 'todo')

    const wrapper = mount(ChatSidePanel, {
      props: {
        sessionId: 'session-1',
        workingDirectory: '/repo',
      },
    })

    await settle()

    expect(wrapper.findAll('.chat-side-esec')).toHaveLength(4)
    expect(focusedSections(wrapper)).toEqual(['Outline'])
  })

  it('does not mount session-backed prompt or todo panels for a new chat draft', async () => {
    localStorage.setItem('chatSideFocusedSection', 'system')

    const wrapper = mount(ChatSidePanel, {
      props: {
        sessionId: 'draft:one',
        workingDirectory: '/repo',
      },
    })

    await settle()

    expect(wrapper.find('.mock-system-prompt-panel').exists()).toBe(false)
    expect(wrapper.find('.mock-todo-progress-panel').exists()).toBe(false)
    expect(wrapper.find('.mock-variables-panel').exists()).toBe(false)
    expect(wrapper.findAll('.chat-side-esec')).toHaveLength(2)
    expect(wrapper.find('.chat-side-draft-state').text()).toBe('System prompt will appear after the chat starts.')
    expect(wrapper.find('[title="Refresh system prompt"]').attributes('disabled')).toBeDefined()
  })

  it('shows the todo live summary from panel progress events', async () => {
    const wrapper = mount(ChatSidePanel, {
      props: {
        sessionId: 'session-1',
        workingDirectory: '/repo',
      },
    })

    await settle()

    const todoPanel = wrapper.findComponent({ name: 'TodoProgressPanel' })
    todoPanel.vm.$emit('progressChange', { done: 4, total: 7, currentText: 'Fix crash recovery' })
    await settle()

    const todoSummary = wrapper.find('.chat-side-todo-section .chat-side-esum-live')
    expect(todoSummary.text()).toBe('4/7 · Fix crash recovery')
  })

  it('shows the variables live summary from panel summary events', async () => {
    const wrapper = mount(ChatSidePanel, {
      props: {
        sessionId: 'session-1',
        workingDirectory: '/repo',
      },
    })

    await settle()

    const variablesPanel = wrapper.findComponent({ name: 'VariablesPanel' })
    variablesPanel.vm.$emit('summaryChange', '5 · workdir')
    await settle()

    const variablesSummary = wrapper.find('.chat-side-variables-section .chat-side-esum-live')
    expect(variablesSummary.text()).toBe('5 · workdir')
  })

  it('falls back to outline when variables focus is stored but session is a draft', async () => {
    localStorage.setItem('chatSideFocusedSection', 'variables')

    const wrapper = mount(ChatSidePanel, {
      props: {
        sessionId: 'draft:one',
        workingDirectory: '/repo',
      },
    })

    await settle()

    expect(focusedSections(wrapper)).toEqual(['Outline'])
  })

  it('updates the outline live summary from window events for the same session', async () => {
    const wrapper = mount(ChatSidePanel, {
      props: {
        sessionId: 'session-1',
        workingDirectory: '/repo',
      },
    })

    await settle()

    window.dispatchEvent(new CustomEvent('assistant-outline:current-changed', {
      detail: { sessionId: 'other-session', label: 'Ignored heading', count: 3 },
    }))
    // Scoped to the outline section: Contents sits above it, so a bare
    // `.chat-side-esum-live` would read the wrong section's summary.
    const outlineLive = () =>
      wrapper.find('.chat-side-outline-section .chat-side-esum-live').text()

    await settle()
    expect(outlineLive()).toBe('')

    window.dispatchEvent(new CustomEvent('assistant-outline:current-changed', {
      detail: { sessionId: 'session-1', label: 'Current heading', count: 3 },
    }))
    await settle()
    expect(outlineLive()).toBe('Current heading')
  })

  describe('contents section', () => {
    const segment = {
      id: 's1',
      origin: 'inferred',
      kind: 'task',
      title: 'Fix the parser',
      detail: 'off-by-one in the lexer',
      files: [{ path: 'src/parser.ts', added: 2, removed: 1 }],
      startMessageId: 'm7',
      startedAt: 0,
      turnCount: 2,
      revision: 1,
    }

    it('loads segments when the contents section takes focus', async () => {
      localStorage.setItem('chatSideFocusedSection', 'toc')
      segmentsMock.mockResolvedValue({ success: true, segments: [segment] })

      const wrapper = mount(ChatSidePanel, {
        props: { sessionId: 'session-1', workingDirectory: '/repo' },
      })
      await settle()

      expect(segmentsMock).toHaveBeenCalledWith('session-1')
      expect(wrapper.text()).toContain('Fix the parser')
    })

    it('asks to jump to where the segment started', async () => {
      localStorage.setItem('chatSideFocusedSection', 'toc')
      segmentsMock.mockResolvedValue({ success: true, segments: [segment] })

      const wrapper = mount(ChatSidePanel, {
        props: { sessionId: 'session-1', workingDirectory: '/repo' },
      })
      await settle()

      await wrapper.find('.chat-side-toc-section .segment-row').trigger('click')

      expect(wrapper.emitted('jumpToMessage')?.[0]).toEqual(['session-1', 'm7'])
    })

    it('says nothing is recorded rather than showing a blank body', async () => {
      localStorage.setItem('chatSideFocusedSection', 'toc')
      segmentsMock.mockResolvedValue({ success: true, segments: [] })

      const wrapper = mount(ChatSidePanel, {
        props: { sessionId: 'session-1', workingDirectory: '/repo' },
      })
      await settle()

      expect(wrapper.text()).toContain('Nothing recorded yet')
    })

    it('survives the read failing', async () => {
      localStorage.setItem('chatSideFocusedSection', 'toc')
      segmentsMock.mockRejectedValueOnce(new Error('nope'))

      const wrapper = mount(ChatSidePanel, {
        props: { sessionId: 'session-1', workingDirectory: '/repo' },
      })
      await settle()

      expect(wrapper.text()).toContain('Nothing recorded yet')
    })
  })
})
