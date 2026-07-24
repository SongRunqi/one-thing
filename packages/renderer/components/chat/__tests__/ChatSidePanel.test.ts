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

const chatStore = vi.hoisted(() => ({
  sessionUserMarkers: new Map<string, unknown[]>(),
  loadUserMessageMarkers: vi.fn(async (_sessionId: string) => []),
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

vi.mock('@/stores/chat', () => ({
  useChatStore: () => chatStore,
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
    chatStore.sessionUserMarkers = new Map()
    chatStore.loadUserMessageMarkers.mockClear()
    segmentsMock.mockClear()
    segmentsMock.mockResolvedValue({ success: true, segments: [] })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders four elastic sections with contents focused by default', async () => {
    const wrapper = mount(ChatSidePanel, {
      props: {
        sessionId: 'session-1',
        workingDirectory: '/repo',
      },
    })

    await settle()

    // Contents (topics + message outline) + System prompt + Todo + Variables.
    expect(wrapper.findAll('.chat-side-esec')).toHaveLength(4)
    expect(focusedSections(wrapper)).toEqual(['Contents'])
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

    expect(wrapper.findAll('.chat-side-esec')).toHaveLength(3)
    expect(focusedSections(wrapper)).toEqual(['Contents'])
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

  it('falls back to contents when variables focus is stored but session is a draft', async () => {
    localStorage.setItem('chatSideFocusedSection', 'variables')

    const wrapper = mount(ChatSidePanel, {
      props: {
        sessionId: 'draft:one',
        workingDirectory: '/repo',
      },
    })

    await settle()

    expect(focusedSections(wrapper)).toEqual(['Contents'])
  })

  it('shows the heading summary from window events only in message mode', async () => {
    localStorage.setItem('chatSideOutlineMode', 'message')

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

    const marker = { id: 'u1', seq: 1, timestamp: 5, preview: 'please fix the parser' }

    it('loads segments and user markers on mount (contents is the default focus)', async () => {
      segmentsMock.mockResolvedValue({ success: true, segments: [segment] })

      const wrapper = mount(ChatSidePanel, {
        props: { sessionId: 'session-1', workingDirectory: '/repo' },
      })
      await settle()

      expect(segmentsMock).toHaveBeenCalledWith('session-1')
      expect(chatStore.loadUserMessageMarkers).toHaveBeenCalledWith('session-1')
      expect(wrapper.text()).toContain('Fix the parser')
    })

    it('opens the newest topic and jumps via its user messages', async () => {
      segmentsMock.mockResolvedValue({ success: true, segments: [segment] })
      chatStore.sessionUserMarkers = new Map([['session-1', [marker]]])

      const wrapper = mount(ChatSidePanel, {
        props: { sessionId: 'session-1', workingDirectory: '/repo' },
      })
      await settle()

      // The last (here: only) topic is expanded by default, showing the user
      // messages that drove it.
      const messageRow = wrapper.find('.topic-message-row')
      expect(messageRow.text()).toContain('please fix the parser')

      await messageRow.trigger('click')
      expect(wrapper.emitted('jumpToMessage')?.[0]).toEqual(['session-1', 'u1'])
    })

    it('falls back to a flat user-message list when no segments exist yet', async () => {
      segmentsMock.mockResolvedValue({ success: true, segments: [] })
      chatStore.sessionUserMarkers = new Map([['session-1', [marker]]])

      const wrapper = mount(ChatSidePanel, {
        props: { sessionId: 'session-1', workingDirectory: '/repo' },
      })
      await settle()

      const row = wrapper.find('.chat-side-usermsg-row')
      expect(row.text()).toContain('please fix the parser')

      await row.trigger('click')
      expect(wrapper.emitted('jumpToMessage')?.[0]).toEqual(['session-1', 'u1'])
    })

    it('switches to the message outline and persists the mode', async () => {
      const wrapper = mount(ChatSidePanel, {
        props: { sessionId: 'session-1', workingDirectory: '/repo' },
      })
      await settle()

      const messageOption = wrapper.findAll('.chat-side-mode-option')
        .find(button => button.text() === 'Message')
      expect(messageOption).toBeDefined()
      await messageOption!.trigger('click')
      await settle()

      expect(localStorage.setItem).toHaveBeenCalledWith('chatSideOutlineMode', 'message')
      expect(wrapper.find('.chat-side-outline-host').isVisible()).toBe(true)
      expect(wrapper.find('.chat-side-topics').exists()).toBe(false)
    })

    it('says nothing is recorded rather than showing a blank body', async () => {
      segmentsMock.mockResolvedValue({ success: true, segments: [] })

      const wrapper = mount(ChatSidePanel, {
        props: { sessionId: 'session-1', workingDirectory: '/repo' },
      })
      await settle()

      expect(wrapper.text()).toContain('Nothing recorded yet')
    })

    it('survives the read failing', async () => {
      segmentsMock.mockRejectedValueOnce(new Error('nope'))

      const wrapper = mount(ChatSidePanel, {
        props: { sessionId: 'session-1', workingDirectory: '/repo' },
      })
      await settle()

      expect(wrapper.text()).toContain('Nothing recorded yet')
    })
  })
})
